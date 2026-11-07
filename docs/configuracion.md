# Ajustes y seguridad

Los ajustes se cambian desde la app con el botón del **engranaje**, al lado de "Salir". Se guardan en `data/settings.json` y se aplican al momento, sin reiniciar el contenedor.

## Impresora

| Ajuste | Qué poner |
|---|---|
| **Nombre de la impresora** | El que quieras (hasta 40 caracteres, se admiten tildes y emojis). Sale arriba en el panel, en la pestaña del navegador, al iniciar sesión y delante de cada notificación ("Mi K2: Impresión terminada"). Vacío = `K2`. |
| **IP de la impresora** | Por ejemplo `192.168.1.50`. Puede ser un nombre si tu red lo resuelve. Sin `http://` ni puerto: el dashboard usa los de la K2 (7125 para Moonraker y 9999 para el tiempo restante de Creality). |
| **Dominio del dashboard** | La dirección pública, por ejemplo `https://impresora.midominio.com`. Los avisos la usan para abrir la app al tocarlos. |
| **Proxy inverso de confianza** | La IP de tu Nginx Proxy Manager, Traefik, Caddy… Varias, separadas por comas. También acepta rangos (`10.0.0.0/8`). |

## Red local y proxy

El primer inicio de sesión (`admin` / `changeme`) solo funciona **desde la red local**. El dashboard decide de dónde viene cada visita así:

| Cómo llega la petición | Qué IP cuenta |
|---|---|
| Directa, sin proxy (`http://IP-DEL-SERVIDOR:8095`) | la de la conexión |
| Por un proxy que está en la **red local** (Nginx Proxy Manager en casa, por ejemplo) | la **última** IP de `X-Forwarded-For`, que la pone ese proxy y no se puede falsificar desde fuera |
| Por un proxy de **confianza** (Ajustes → Impresora) | la que diga el proxy (nginx `real_ip`) |
| Por un proxy con IP pública que no es de confianza | ninguna: se trata como externa |

Así, desde casa puedes entrar por la IP o por el dominio, y desde Internet nadie puede usar `admin` / `changeme`. La misma IP se usa para el límite de intentos de inicio de sesión (10 fallos cada 15 minutos por IP).

Se considera **red local**: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `100.64.0.0/10` (Tailscale y CGNAT), y en IPv6 `::1`, `fc00::/7` y `fe80::/10`.

> Si publicas el puerto del dashboard directamente en el router (sin proxy), Docker puede presentar las conexiones con la IP interna de su red. Usa un proxy inverso con HTTPS.

**Proxy de confianza.** No es obligatorio si el proxy está en tu red. Configurarlo sirve para que nginx registre la IP real en sus logs, y hace falta si el proxy está fuera de tu red (un VPS, Cloudflare…).

### Nginx Proxy Manager

1. Proxy Host → dominio → destino `http://IP-DEL-SERVIDOR:8095` (el mismo `PORT` del dashboard).
2. Activa **Websockets Support** y, en SSL, **Force SSL**.
3. No pongas una Access List: el dashboard ya tiene su propio inicio de sesión. El Basic Auth de NPM no funciona en iPhone con websockets.
4. Opcional: en los Ajustes del dashboard, pon la IP de NPM como proxy de confianza.

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

Las claves VAPID se crean en el primer arranque y se guardan en `data/secrets.json`, y los dispositivos en `data/devices.json`. Si borras `secrets.json`, hay que volver a activar los avisos en cada dispositivo.

## Cuenta

En **Ajustes → Cuenta** puedes cambiar el usuario y la contraseña. Se pide la contraseña actual. Al guardar se cierra la sesión en los demás dispositivos.

Las sesiones duran 30 días. La cookie es `HttpOnly` y `SameSite=Lax`, y lleva `Secure` cuando se entra por HTTPS. Tras 10 intentos fallidos desde la misma IP hay que esperar 15 minutos.

## Si olvidas la contraseña

```bash
docker exec k2-dashboard node /app/server/index.mjs --reset-login
```

Vuelve a `admin` / `changeme` (solo desde la red local) y conserva los ajustes. Entra desde casa y crea el usuario de nuevo.

## Cancelar una sola pieza

Si imprimes varias piezas a la vez y una sale mal, en la tarjeta de impresión aparece la lista **Piezas** con un botón para cancelar cada una. Las demás siguen imprimiéndose. Usa `EXCLUDE_OBJECT` de Klipper.

- **Creality Print / OrcaSlicer / PrusaSlicer**: ya marcan las piezas en el G-code. Funciona sin hacer nada.
- **Cura**: no las marca, solo deja comentarios `;MESH:nombre.stl`. Al **subir el archivo desde el panel**, se convierten en las órdenes de Klipper (`EXCLUDE_OBJECT_DEFINE`, `_START` y `_END`) y se avisa de cuántas piezas tiene. El resto del archivo no cambia.
- Los archivos de Cura subidos por otra vía (desde la propia Cura, una USB…) o antes de esta función no tienen las marcas. Vuelve a subirlos desde el panel.
- Con una sola pieza no aparece la lista: para eso está **Parar**.

## Calibrar la cama

- **Al imprimir**: en la ventana de imprimir, marca **Calibrar la cama antes**. La impresora ejecuta su macro `G29`: calienta, hace home, limpia la boquilla, mide 7×7 puntos y guarda la malla. Después empieza la impresión sola. Todo va en una sola orden, así que sigue aunque cierres la app.
- **Solo calibrar**: en **Control → Calibración → Calibrar cama**. La cama tiene que estar vacía.
- Si no marcas la opción, la K2 usa la última malla guardada. Su `START_PRINT` no calibra en cada impresión.

