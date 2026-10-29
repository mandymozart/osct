# One image for the whole site: the reader (static files from `npm run build` in client/, including the content
# build of this commit), the editor (editor/, served at /editor) and the user API (server/api, PHP) under /api –
# Apache + PHP on port 80. TLS and the public port belong to kamal-proxy in front of it (config/deploy.yml,
# docs/deploy.md).
#
#   docker build -t osct .                      (--build-arg VITE_DEBUG=true for the debug bar: staging;
#                                                --build-arg VITE_CONTENT_BASE_URL=<CDN> for content from the CDN)
#   docker run --rm -p 8080:80 -e OSCT_DB_SQLITE_PATH=/data/osct.sqlite -e OSCT_SECRET=$(openssl rand -hex 32) osct

# ---- 1. Build the content and the app -------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /src

# Dependencies first (cached while the lock files do not change)
COPY client/package.json client/package-lock.json client/
COPY scripts/package.json scripts/package-lock.json scripts/
COPY editor/package.json editor/package-lock.json editor/
RUN cd client && npm ci --no-audit --no-fund && cd ../scripts && npm ci --no-audit --no-fund \
    && cd ../editor && npm ci --no-audit --no-fund --ignore-scripts

# Everything the build reads: the content, the shared types, the engine, the content build, the reader and the editor
COPY shared shared
COPY engine engine
COPY content content
COPY scripts scripts
COPY client client
COPY editor editor

# Build flags (client/.env lists them): the API lives next to the app, the debug bar only where asked for.
# VITE_CONTENT_BASE_URL (the environment's content CDN, docs/content-cdn.md): with it the app loads its content from
# the CDN at runtime and the build reads no content; without it the content of this commit is built and bundled.
ARG VITE_DEBUG=
ARG VITE_SHOW_LOCKED_ENTRIES=
ARG VITE_CONTENT_BASE_URL=
ENV VITE_API_URL=/api VITE_DEBUG=$VITE_DEBUG VITE_SHOW_LOCKED_ENTRIES=$VITE_SHOW_LOCKED_ENTRIES \
    VITE_CONTENT_BASE_URL=$VITE_CONTENT_BASE_URL
# prebuild runs the content build (unless the content comes from the CDN) and the translation check, then vite +
# the type checks
RUN cd client && npm run build && find dist -name '*.map' -delete
# The editor: a SvelteKit single-page app at /editor (its API is the same /api)
RUN cd editor && npx svelte-kit sync && npm run build

# ---- 2. Serve it ------------------------------------------------------------------------------------------
FROM php:8.3-apache-bookworm

RUN docker-php-ext-install pdo_mysql \
    && a2enmod rewrite headers deflate remoteip \
    && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && echo "ServerName localhost" > /etc/apache2/conf-available/servername.conf && a2enconf servername

COPY server/docker/apache.conf /etc/apache2/sites-available/000-default.conf
COPY server/docker/entrypoint.sh /usr/local/bin/osct-entrypoint
COPY server/deploy/migrate.php server/deploy/mail-test.php /opt/osct/
RUN chmod +x /usr/local/bin/osct-entrypoint

# The API as /api next to the app (no config.local.php: every setting comes from OSCT_* environment variables)
COPY server/api /var/www/html/api
RUN rm -f /var/www/html/api/config.local.php /var/www/html/api/config.local.php.example \
          /var/www/html/api/db/*.sqlite /var/www/html/api/db/*.log

# The reader (index.html, assets/, the service worker, .htaccess with the SPA fallbacks) and the editor
COPY --from=build /src/client/dist /var/www/html
COPY --from=build /src/editor/build /var/www/html/editor
COPY client/public/.htaccess /var/www/html/.htaccess

ENV OSCT_API_DIR=/var/www/html/api
# Only for a local check with SQLite (docs/deploy.md); a deploy uses the MariaDB accessory
RUN mkdir -p /data
EXPOSE 80
# The entrypoint creates missing tables and columns, then hands over to Apache
ENTRYPOINT ["osct-entrypoint"]
CMD ["apache2-foreground"]
