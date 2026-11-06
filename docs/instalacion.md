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

Por defecto se publica en el puerto `8095`. Para usar otro, crea un `.env` con `PORT=8080` (ver abajo).

### Primer inicio de sesión

1. Desde un equipo de **tu red local**, abre `http://IP-DEL-SERVIDOR:8095`.
2. Usuario `admin`, contraseña `changeme`.
3. Elige tu usuario y una contraseña de al menos 10 caracteres. Desde ese momento `admin` / `changeme` deja de funcionar.
4. En **Ajustes → Impresora**, escribe la IP de la impresora y guarda. El panel se conecta al momento.

Por seguridad, `admin` / `changeme` **no funciona desde Internet**, aunque el dashboard ya esté detrás de un proxy con dominio. Mira [configuracion.md](configuracion.md#red-local-y-proxy) para saber cómo lo decide.

## Archivo `.env` (opcional)

Sirve para dar los valores del **primer arranque** sin tener que entrar en Ajustes. Después manda lo que cambies en la app.

```bash
curl -o .env https://raw.githubusercontent.com/Nye69/K2-Dashboard/main/.env.example
nano .env
```

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del servidor (por defecto `8095`). |
| `PRINTER_HOST` | IP o nombre de la impresora, sin `http://` ni puerto. |
| `PANEL_URL` | Dirección pública del dashboard (se usa en los avisos para abrir la app). |
| `TRUSTED_PROXIES` | IP del proxy inverso que tengas delante, separadas por comas. |
| `NTFY_URL` / `NTFY_TOPIC` | Servidor y tema de ntfy para los avisos. |
| `TZ` | Zona horaria de los registros, por ejemplo `America/New_York`. |

`.env` nunca se sube a git.

## Actualizar

```bash
docker compose pull
docker compose up -d
```

Los datos (`./data`) se conservan.

## Copia de seguridad

Todo lo importante está en la carpeta `./data` (`config.json`). Cópiala y listo.

## Construir la imagen en tu servidor

Si prefieres no usar la imagen publicada, en `docker-compose.yml` comenta `image:`, descomenta `build: .` y ejecuta, dentro de una copia del repositorio:

```bash
docker compose up -d --build
```

## Pasar de la versión de 3 contenedores

Las primeras versiones usaban tres contenedores (`k2-panel`, `k2-auth`, `k2-notify`). Para cambiar:

1. Apunta el tema de ntfy que usabas, que está en el `.env` antiguo.
2. `docker compose down` en la carpeta antigua.
3. Instala esta versión en una carpeta nueva con el **mismo puerto**, así no hay que tocar el proxy inverso.
4. Haz el primer inicio de sesión desde la red local y crea tu usuario. La contraseña antigua no se migra.
5. En Ajustes, pon la IP de la impresora, el dominio, el proxy y el tema de ntfy.
