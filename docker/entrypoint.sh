#!/bin/sh
# Un solo contenedor con dos procesos: nginx (principal) y el servidor Node.
# - Node se vigila con un bucle: si se cae, se reinicia a los 2 s.
# - Si nginx se cae, el contenedor termina y Docker lo reinicia (restart: unless-stopped).
# - El HEALTHCHECK prueba los dos a la vez (nginx → Node).
set -e

PORT="${PORT:-8095}"
case "$PORT" in
  ''|*[!0-9]*) echo "PORT no válido: $PORT" >&2; exit 1 ;;
esac
AUTH_PORT="${AUTH_PORT:-47800}"
if [ "$AUTH_PORT" = "$PORT" ]; then AUTH_PORT=47801; fi
export PORT AUTH_PORT

mkdir -p "${DATA_DIR:-/data}" /run/k2

# nginx escucha en el mismo puerto que se publica (así "8095:8095" funciona sin pensar).
sed -e "s/__PORT__/$PORT/g" -e "s/__AUTH_PORT__/$AUTH_PORT/g" /etc/k2/nginx.conf.template > /etc/nginx/conf.d/k2.conf

# Crea los datos si no existen (admin / changeme), migra versiones antiguas y escribe los fragmentos de nginx.
node /app/server/index.mjs --prepare

(
  while true; do
    node /app/server/index.mjs || true
    echo "$(date -Iseconds) servidor Node detenido; se reinicia en 2 s" >&2
    sleep 2
  done
) &

exec nginx -g 'daemon off;'
