#!/bin/sh
# Un solo contenedor con dos procesos: nginx (principal) y el servidor Node.
# - Node se vigila con un bucle: si se cae, se reinicia a los 2 s.
# - Si nginx se cae, el contenedor termina y Docker lo reinicia (restart: unless-stopped).
# - El HEALTHCHECK prueba los dos a la vez (nginx → Node).
set -e

mkdir -p /data /run/k2

# Crea /data/config.json si no existe (admin / changeme) y escribe los fragmentos de nginx.
node /app/server/index.mjs --prepare

(
  while true; do
    node /app/server/index.mjs || true
    echo "$(date -Iseconds) servidor Node detenido; se reinicia en 2 s" >&2
    sleep 2
  done
) &

exec nginx -g 'daemon off;'
