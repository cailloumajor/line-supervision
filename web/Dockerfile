FROM node:16.15.1-buster as frontend-builder

WORKDIR /app

COPY frontend/package.json frontend/yarn.lock ./
# hadolint ignore=DL3060
RUN yarn install

COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/.browserslistrc \
     frontend/.eslintrc.js \
     frontend/.prettierrc \
     frontend/babel.config.js \
     frontend/tsconfig.json \
     frontend/vue.config.js \
     ./
RUN yarn run build


FROM caddy:2.4.6 AS final

# hadolint ignore=DL3018
RUN set -eux; \
    apk --no-cache add curl;

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-builder /app/dist /site

COPY docker-healthcheck.sh /usr/local/bin/
HEALTHCHECK CMD ["docker-healthcheck.sh"]
