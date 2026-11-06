# --- compilar la app (en la arquitectura del que construye: rápido también para arm64) ---
FROM --platform=$BUILDPLATFORM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm test && npm run build

# --- imagen final: nginx + Node en un solo contenedor ---
FROM nginx:1.29-alpine
RUN apk add --no-cache nodejs tzdata \
 && rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/k2.conf
COPY --chmod=755 docker/entrypoint.sh /entrypoint.sh
COPY server /app/server
COPY --from=build /app/dist /usr/share/nginx/html

ENV DATA_DIR=/data
VOLUME /data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/auth/health >/dev/null || exit 1
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/entrypoint.sh"]
CMD []
