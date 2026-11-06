# Cómo está hecho

```
Navegador ──► (proxy inverso con HTTPS, opcional) ──► contenedor k2-dashboard :80
                                                       │
                                                       ├─ nginx
                                                       │    ├─ /                 app React (archivos estáticos)
                                                       │    ├─ /websocket, /server, /printer…  ──► Moonraker  impresora:7125
                                                       │    ├─ /k2ws             ──► websocket de Creality  impresora:9999
                                                       │    └─ auth_request      ──► Node /auth/check (¿sesión válida?)
                                                       │
                                                       └─ Node (127.0.0.1:8080)
                                                            ├─ /login, /setup, /auth/*   inicio de sesión y primer arranque
                                                            ├─ /auth/api/*               ajustes y cuenta (para la app)
                                                            └─ avisos ──► Moonraker (websocket) y ──► Web Push (Apple, Google, Mozilla…)
```

## Un contenedor, dos procesos

`docker/entrypoint.sh` prepara la configuración y arranca:

- **nginx** como proceso principal. Si se cae, el contenedor termina y Docker lo reinicia (`restart: unless-stopped`).
- **Node** en un bucle que lo reinicia a los 2 segundos si se cae.

El `HEALTHCHECK` llama a `/auth/health` a través de nginx, así que comprueba los dos a la vez. `init: true` en el compose se encarga de las señales y de los procesos huérfanos.

## Ajustes en caliente

La IP de la impresora y los proxies de confianza los usa nginx. Al guardarlos, Node reescribe dos fragmentos y ejecuta `nginx -s reload`:

- `/run/k2/printer.conf`: `set $k2_host "IP";`
- `/run/k2/realip.conf`: `set_real_ip_from …; real_ip_header X-Forwarded-For;`

Los valores se validan antes de escribirlos (solo IP, nombres de host y rangos CIDR), así que no se pueden colar directivas.

## Inicio de sesión

- Al primer arranque se crea `data/config.json` con `admin` / `changeme` (contraseña con scrypt) y `mustChange: true`.
- Mientras `mustChange` sea true:
  - solo se puede entrar desde la red local;
  - `/auth/check` responde 401 para todo, así que la app no carga;
  - el inicio de sesión lleva a `/setup`, donde se crean el usuario y la contraseña definitivos.
- La sesión es una cookie firmada con HMAC (`usuario + caducidad`). Al cambiar la contraseña se genera un secreto nuevo, y eso invalida todas las sesiones anteriores.
- Las peticiones que cambian algo exigen `Content-Type: application/json` y, si el navegador manda `Origin`, que sea el mismo sitio. Esto protege contra CSRF.

## Notificaciones push

`server/lib/webpush.mjs` implementa Web Push sin dependencias: firma VAPID con ES256 (RFC 8292) y cifra el mensaje con `aes128gcm` (RFC 8291) para cada suscripción. Solo usa `node:crypto`. El correo de contacto va como `sub: mailto:…` en el JWT.

En el navegador, `public/sw.js` es un service worker que **solo** muestra notificaciones y abre la app al tocarlas. No guarda nada en caché, así que nunca sirve una versión vieja de la app.

## Por qué el websocket de Creality

Moonraker no sabe el tiempo restante que muestra la pantalla de la impresora. Ese dato sale del servicio propio de Creality en el puerto 9999 (`printLeftTime`), que la app consulta a través de `/k2ws`. Si no responde, la app usa su propia estimación.

## Estructura del código

| Carpeta | Contenido |
|---|---|
| `src/` | App React + TypeScript (Vite). `moonraker/` tiene el cliente JSON-RPC y la API, `components/` las tarjetas, y `settings/` la API de ajustes. |
| `server/` | Servidor Node sin dependencias externas. `lib/` tiene la lógica pura con pruebas: sesiones, configuración, red, eventos de la impresora y web push. |
| `docker/` | `nginx.conf` y `entrypoint.sh`. |
| `public/` | Iconos, manifiesto PWA y `sw.js` (service worker de las notificaciones). |
