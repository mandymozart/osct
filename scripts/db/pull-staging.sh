#!/usr/bin/env bash
# Copies staging's database into the local MariaDB of docker-compose.yml (docs/server.md "Staging's data").
#
#   scripts/db/pull-staging.sh                 dump staging, load it as the local database `osct`, pseudonymise it,
#                                              migrate it to this checkout's schema, delete the dump
#   scripts/db/pull-staging.sh --keep          the same, but keep the dump in server/db-dumps/ (git-ignored)
#   scripts/db/pull-staging.sh --load FILE     load a kept dump again instead of pulling a new one
#   scripts/db/pull-staging.sh --real          skip the pseudonymisation (real addresses – only to debug a single
#                                              account, and only for as long as that takes)
#
# Staging's credentials come from the environment or from server/.env (never committed):
#   STAGING_DB_HOST, STAGING_DB_PORT (3306), STAGING_DB_NAME, STAGING_DB_USER, STAGING_DB_PASS
#   STAGING_SSH (optional) user@host: run the dump on that host over SSH, for a database that only accepts its
#     own machine; STAGING_DUMP_COMMAND (mysqldump) is the dump program there
#   KEEP_EMAILS (optional): comma-separated addresses that keep their address and password, e.g. your own
# The local side: LOCAL_DB_ROOT_PASS (osct-root, the compose file's), OSCT_DB_PORT (3306).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$root/server/.env"
dump_dir="$root/server/db-dumps"

keep=0 real=0 load=""
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) keep=1 ;;
    --real) real=1 ;;
    --load) load="${2:?--load needs a file}"; keep=1; shift ;;
    -h|--help) awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; exit 0 ;;
    *) echo "unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

# A setting: the environment wins, then server/.env (KEY=value, optional quotes), then the default
setting() {
  local value="${!1:-}"
  if [ -z "$value" ] && [ -f "$env_file" ]; then
    value="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$env_file" | tail -n 1 | cut -d= -f2- || true)"
    value="${value%$'\r'}"; value="${value#\"}"; value="${value%\"}"; value="${value#\'}"; value="${value%\'}"
  fi
  printf '%s' "${value:-${2:-}}"
}

root_pass="$(setting LOCAL_DB_ROOT_PASS osct-root)"
compose() { docker compose --project-directory "$root" -f "$root/docker-compose.yml" "$@"; }
local_sql() { compose exec -T -e MYSQL_PWD="$root_pass" db mariadb -uroot "$@"; }

echo "local MariaDB: starting (docker compose up -d db)"
compose up -d --wait db >/dev/null

mkdir -p "$dump_dir"
if [ -n "$load" ]; then
  dump="$load"
  [ -f "$dump" ] || { echo "no such dump: $dump" >&2; exit 1; }
else
  host="$(setting STAGING_DB_HOST)" port="$(setting STAGING_DB_PORT 3306)" name="$(setting STAGING_DB_NAME)"
  user="$(setting STAGING_DB_USER)" pass="$(setting STAGING_DB_PASS)" ssh_target="$(setting STAGING_SSH)"
  for key in STAGING_DB_HOST STAGING_DB_NAME STAGING_DB_USER STAGING_DB_PASS; do
    [ -n "$(setting $key)" ] || { echo "$key is missing – set it in server/.env or the environment" >&2; exit 1; }
  done
  dump="$dump_dir/staging-$(date -u +%Y%m%d-%H%M%S).sql"
  options=(-h "$host" -P "$port" -u "$user" --single-transaction --quick --no-tablespaces --hex-blob
    --default-character-set=utf8mb4 "$name")
  # The dump holds personal data until it is loaded and pseudonymised: readable by this user only
  umask 077
  if [ -n "$ssh_target" ]; then
    echo "staging: dumping $name on $ssh_target"
    remote="MYSQL_PWD=$(printf '%q' "$pass") $(setting STAGING_DUMP_COMMAND mysqldump)"
    for option in "${options[@]}"; do remote+=" $(printf '%q' "$option")"; done
    ssh "$ssh_target" "$remote" > "$dump"
  else
    echo "staging: dumping $name from $host:$port"
    compose exec -T -e MYSQL_PWD="$pass" db mariadb-dump "${options[@]}" > "$dump"
  fi
  umask 022
  [ -s "$dump" ] || { rm -f "$dump"; echo "the dump is empty" >&2; exit 1; }
fi

echo "local: replacing the database osct with $(basename "$dump")"
local_sql -e "DROP DATABASE IF EXISTS osct; CREATE DATABASE osct CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON osct.* TO 'osct'@'%';"
local_sql osct < "$dump"

if [ "$real" -eq 0 ]; then
  keep_emails="$(setting KEEP_EMAILS | tr -d ' ' | tr '[:upper:]' '[:lower:]')"
  echo "local: pseudonymising the users${keep_emails:+ (kept: $keep_emails)}"
  # Addresses become user-<id>@example.invalid without a password; sessions, sign-in requests and failed sign-ins
  # (token and IP hashes) go. Ids, roles, progress and the editor's rows stay, so the data behaves like staging.
  local_sql osct -e "SET @keep = '${keep_emails//\'/}';
    UPDATE users SET email = CONCAT('user-', id, '@example.invalid'), password_hash = NULL WHERE FIND_IN_SET(email, @keep) = 0;
    DELETE FROM sessions; DELETE FROM login_requests; DELETE FROM password_attempts;"
fi

echo "local: migrating to this checkout's schema"
OSCT_CONFIG_FILE=/nonexistent OSCT_DB_SQLITE_PATH='' OSCT_DB_HOST=127.0.0.1 OSCT_DB_PORT="$(setting OSCT_DB_PORT 3306)" \
  OSCT_DB_NAME=osct OSCT_DB_USER=osct OSCT_DB_PASS=osct php "$root/server/deploy/migrate.php"

if [ "$keep" -eq 0 ]; then
  rm -f "$dump"
  echo "done – the dump is deleted (--keep keeps it)"
else
  echo "done – the dump stays in $dump: it holds staging's personal data, delete it when you no longer need it"
fi
users="$(local_sql osct -N -e 'SELECT COUNT(*) FROM users')"
echo "local database osct: $users users"
