# Ajustes y seguridad

Los ajustes se cambian desde la app con el botón del **engranaje**, al lado de "Salir". Se guardan en `data/config.json` y se aplican al momento, sin reiniciar el contenedor.

## Impresora

| Ajuste | Qué poner |
|---|---|
| **IP de la impresora** | Por ejemplo `192.168.1.50`. Puede ser un nombre si tu red lo resuelve. Sin `http://` ni puerto: el dashboard usa los de la K2 (7125 para Moonraker y 9999 para el tiempo restante de Creality). |
| **Dominio del dashboard** | La dirección pública, por ejemplo `https://impresora.midominio.com`. Los avisos la usan para abrir la app al tocarlos. |
| **Proxy inverso de confianza** | La IP de tu Nginx Proxy Manager, Traefik, Caddy… Varias, separadas por comas. También acepta rangos (`10.0.0.0/8`). |

## Red local y proxy

Si el dashboard está detrás de un proxy, el proxy pone en las cabeceras `X-Forwarded-For` y `X-Real-IP` la IP de quien entra. El dashboard solo se fía de esas cabeceras si vienen de un **proxy de confianza** (el ajuste de arriba):

- **Con el proxy configurado**: el dashboard ve la IP real de cada visitante. El límite de intentos de inicio de sesión se aplica por persona, y alguien de tu casa que entra por el dominio cuenta como red local.
- **Sin configurar**: toda petición que llega reenviada por un proxy se trata como **externa**, aunque el proxy esté en tu red. Así, nadie desde Internet puede usar `admin` / `changeme`. El límite de intentos se comparte entre todos los que entran por el proxy.

Se considera **red local**: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `100.64.0.0/10` (Tailscale y CGNAT), y en IPv6 `::1`, `fc00::/7` y `fe80::/10`.

> Si publicas el puerto del dashboard directamente en el router (sin proxy), Docker puede presentar las conexiones con la IP interna de su red. Usa un proxy inverso con HTTPS.

### Nginx Proxy Manager

1. Proxy Host → dominio → destino `http://IP-DEL-SERVIDOR:8095`.
2. Activa **Websockets Support** y, en SSL, **Force SSL**.
3. No pongas una Access List: el dashboard ya tiene su propio inicio de sesión. El Basic Auth de NPM no funciona en iPhone con websockets.
4. En los Ajustes del dashboard, pon la IP de NPM como proxy de confianza.

## Notificaciones push

El propio dashboard manda las notificaciones (Web Push estándar, con claves VAPID propias). No hace falta ntfy, ni Pushover, ni instalar otra app.

1. **Ajustes → Avisos**: pon un **correo de contacto** y guarda. Apple, Google y Mozilla lo exigen para aceptar los avisos: sin él no llegan. Viene de `PUSH_CONTACT_EMAIL` si lo pusiste en `.env`.
2. En cada dispositivo donde quieras recibirlos, pulsa **Activar avisos en este dispositivo** y acepta el permiso. Llega una notificación de prueba.

Requisitos:

- **HTTPS**: entra por tu dominio, no por la IP. Los navegadores solo permiten notificaciones en sitios seguros.
- **iPhone y iPad (iOS 16.4+)**: solo funciona desde la app **añadida a la pantalla de inicio** (Safari → Compartir → Añadir a pantalla de inicio). Desde Safari normal no se puede.
- **Android, Mac, Windows y Linux**: funciona en Chrome, Edge, Firefox y Safari, también sin instalar la app.

Avisa cuando una impresión empieza, termina, falla, se pausa o se cancela, cuando se acaba el filamento y cuando Klipper se apaga o da error. Al tocar la notificación se abre el dashboard (en el dominio de Ajustes → Impresora, si lo pusiste).

La lista **Dispositivos con avisos** muestra los suscritos y permite quitar cualquiera. Las suscripciones que caducan (por ejemplo, si borras la app del móvil) se eliminan solas.

Las claves VAPID se crean en el primer arranque y se guardan en `data/config.json`. Si borras ese archivo, hay que volver a activar los avisos en cada dispositivo.

## Cuenta

En **Ajustes → Cuenta** puedes cambiar el usuario y la contraseña. Se pide la contraseña actual. Al guardar se cierra la sesión en los demás dispositivos.

Las sesiones duran 30 días. La cookie es `HttpOnly` y `SameSite=Lax`, y lleva `Secure` cuando se entra por HTTPS. Tras 10 intentos fallidos desde la misma IP hay que esperar 15 minutos.

## Si olvidas la contraseña

```bash
docker exec k2-dashboard node /app/server/index.mjs --reset-login
```

Vuelve a `admin` / `changeme` (solo desde la red local) y conserva los ajustes. Entra desde casa y crea el usuario de nuevo.
