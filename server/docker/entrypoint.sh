#!/bin/sh
# Container start (Dockerfile): creates the missing tables and columns, then hands over to the web server.
# The migration is additive and idempotent (a deploy never resets data), so it can run on every start.
# The database may still be starting (an accessory on the same host): retry for about a minute, then fail
# the start – kamal-proxy keeps routing to the previous container until the new one is healthy.
set -eu

attempt=0
until php /opt/osct/migrate.php; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
        echo "osct: the database did not become reachable – giving up" >&2
        exit 1
    fi
    echo "osct: waiting for the database ($attempt)…" >&2
    sleep 2
done

# A local check without MariaDB (docs/deploy.md): the SQLite file was created here as root, Apache writes as www-data
if [ -n "${OSCT_DB_SQLITE_PATH:-}" ]; then
    chown www-data:www-data "$OSCT_DB_SQLITE_PATH" "$(dirname "$OSCT_DB_SQLITE_PATH")"
fi

# The content store (docs/server.md "Content store and var"): published content and the Library's uploads wherever the
# directory store is the backend – mounted as a volume by Kamal, so it outlives the container. The API (www-data) must
# be able to create folders in it: a fresh volume or host folder may belong to root, so whatever is not www-data's is
# handed over (only those, not the whole tree on every start). GET /api/content/{env}/… reads it.
store_dir="${OSCT_CONTENT_STORE_DIR:-/var/lib/osct/content-store}"
mkdir -p "$store_dir"
find "$store_dir" ! -user www-data -exec chown www-data:www-data {} +

exec "$@"
