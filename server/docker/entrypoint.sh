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

exec "$@"
