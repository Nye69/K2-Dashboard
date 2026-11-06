# Instalación y actualización

## Requisitos

- Un servidor con Docker y Docker Compose v2.24 o más reciente (Linux `amd64` o `arm64`, por ejemplo una Raspberry Pi 4/5).
- El servidor y la impresora en la misma red.
- La impresora con su red configurada. Conviene **reservar su IP en el router** (DHCP estático) para que no cambie al reiniciarla.

## Instalar

```bash
mkdir k2-dashboard && cd k2-dashboard
curl -O https://raw.githubusercontent.com/Nye69/K2-Dashboard/main/docker-compose.yml
docker compose up -d
```

Por defecto escucha en el puerto `8095` y guarda los datos en `./data`. Para cambiarlos, crea un `.env` con `PORT=…` y `DATA_PATH=…` (ver abajo).

### Sin Docker Compose (docker run, Portainer…)

```bash
docker run -d --name k2-dashboard --restart unless-stopped --init \
  -p 8095:8095 \
  -v /ruta/en/tu/servidor/k2-data:/data \
  -e PRINTER_HOST=192.168.1.50 \
  -e PUSH_CONTACT_EMAIL=tu@correo.com \
  ghcr.io/nye69/k2-dashboard:latest
```

- El puerto es el **mismo dentro y fuera** (`8095:8095`). Si cambias el de fuera, cambia también `PORT` (`-p 9000:9000 -e PORT=9000`).
- **Monta siempre `/data`** en una carpeta tuya (`-v …:/data`). Si no, Docker usa un volumen anónimo y al recrear el contenedor se pierde el usuario, los ajustes y los dispositivos.

### Primer inicio de sesión

1. Desde un equipo de **tu red local**, abre `http://IP-DEL-SERVIDOR:8095` o tu dominio (si el proxy inverso también está en tu red).
2. Usuario `admin`, contraseña `changeme`.
3. Elige tu usuario y una contraseña de al menos 10 caracteres. Desde ese momento `admin` / `changeme` deja de funcionar.
4. En **Ajustes → Impresora**, escribe la IP de la impresora y guarda. El panel se conecta al momento.

Por seguridad, `admin` / `changeme` **no funciona desde Internet**. Sí funciona desde la red local, tanto por la IP como por el dominio si el proxy inverso (Nginx Proxy Manager…) está en tu red. Mira [configuracion.md](configuracion.md#red-local-y-proxy) para saber cómo lo decide.

## Archivo `.env` (opcional)

Sirve para dar los valores del **primer arranque** sin tener que entrar en Ajustes. Después manda lo que cambies en la app.

```bash
curl -o .env https://raw.githubusercontent.com/Nye69/K2-Dashboard/main/.env.example
nano .env
```

| Variable | Para qué |
|---|---|
| `PORT` | Puerto donde escucha el dashboard, dentro y fuera del contenedor (por defecto `8095`). |
| `DATA_PATH` | Carpeta del servidor donde se guardan los datos (por defecto `./data`). Ver [Rutas](#rutas). |
| `PRINTER_HOST` | IP o nombre de la impresora, sin `http://` ni puerto. |
| `PANEL_URL` | Dirección pública del dashboard (se usa en los avisos para abrir la app). |
| `TRUSTED_PROXIES` | IP del proxy inverso que tengas delante, separadas por comas. |
| `PUSH_CONTACT_EMAIL` | Correo de contacto para las notificaciones push. **Obligatorio para que lleguen**: Apple, Google y Mozilla lo exigen. |
| `TZ` | Zona horaria de los registros, por ejemplo `America/New_York`. |

`.env` nunca se sube a git.

## Rutas

Todo lo que el dashboard guarda está en **una sola carpeta**: `DATA_PATH` en el servidor (por defecto `./data`, junto al `docker-compose.yml`), que dentro del contenedor es `/data`.

```
data/                      ← DATA_PATH (en el contenedor: /data)
├── users.json             usuarios: nombre, contraseña cifrada (scrypt) y rol
├── settings.json          ajustes: IP de la impresora, dominio, proxies, correo de contacto
├── secrets.json           secreto de las sesiones y claves de las notificaciones (VAPID)
├── devices.json           dispositivos con notificaciones push
└── storage/               reservado para funciones futuras (archivos del usuario, copias…)
```

- Los `.json` tienen permisos `600` (solo los lee su dueño). **No los subas a ningún sitio**: `users.json` y `secrets.json` son sensibles.
- `settings.json` se puede editar a mano con el contenedor parado. Lo normal es usar Ajustes en la app.
- Si vienes de una versión con `config.json`, al arrancar se reparte solo en estos archivos y el viejo queda como `config.json.migrado`. Cuando compruebes que todo está bien, puedes borrarlo.
- **Copia de seguridad**: copia la carpeta entera. **Restaurar**: para el contenedor, pon la carpeta en su sitio y arráncalo.

Otras rutas dentro del contenedor (no hace falta tocarlas):

| Ruta | Qué es |
|---|---|
| `/usr/share/nginx/html` | la app compilada |
| `/app/server` | el servidor Node |
| `/etc/k2/nginx.conf.template` | plantilla de nginx (el puerto se pone al arrancar) |
| `/run/k2/*.conf` | fragmentos de nginx generados con los ajustes (IP de la impresora, proxies) |

Variables internas: `DATA_DIR` (por defecto `/data`) cambia dónde busca los datos dentro del contenedor, y `AUTH_PORT` (por defecto `47800`) es el puerto interno del servidor Node, que solo escucha en `127.0.0.1`.

## Actualizar

```bash
docker compose pull
docker compose up -d
```

Los datos (`./data`) se conservan.

## Construir la imagen en tu servidor

Si prefieres no usar la imagen publicada, en `docker-compose.yml` comenta `image:`, descomenta `build: .` y ejecuta, dentro de una copia del repositorio:

```bash
docker compose up -d --build
```

## Pasar de la versión de 3 contenedores

Las primeras versiones usaban tres contenedores (`k2-panel`, `k2-auth`, `k2-notify`). Para cambiar:

1. `docker compose down` en la carpeta antigua.
2. Instala esta versión en una carpeta nueva con el **mismo puerto** (`8095:8095`), así no hay que tocar el proxy inverso. Monta `/data` en una carpeta tuya.
3. Haz el primer inicio de sesión desde la red local y crea tu usuario. La contraseña antigua no se migra.
4. En Ajustes, pon la IP de la impresora, el dominio, el proxy y el correo de contacto.
5. Los avisos ya no usan ntfy: en cada celular, abre la app instalada → Ajustes → Avisos → **Activar avisos en este dispositivo**. Puedes desinstalar la app de ntfy.
