# K2 Dashboard

Panel web para controlar una impresora **Creality K2** (K2 SE, K2 Plus, K2 Pro) desde el navegador o el móvil, en casa o desde fuera. Habla con Klipper a través de Moonraker, que ya viene en la impresora.

Va en **un solo contenedor Docker**: nginx sirve la app y hace de proxy hacia la impresora, y un pequeño servidor Node se encarga del inicio de sesión, los ajustes y las notificaciones push.

## Qué hace

- **Impresión en curso**: progreso, capa, tiempo restante (el mismo que calcula la impresora), pausar, reanudar, cancelar y **cancelar una sola pieza** (también con archivos de Cura: el panel los prepara al subirlos).
- **Archivos**: subir G-code (también arrastrando), miniaturas, imprimir, borrar y buscar.
- **Vista 3D del G-code**, con la capa que se está imprimiendo.
- **Temperaturas** con gráfica, y precalentado para PLA, PETG, ABS y TPU.
- **Control**: luz, ventiladores, velocidad, flujo, sacar y meter filamento, y mover el filamento unos milímetros.
- **Historial** de impresiones.
- **Notificaciones push** al móvil y al ordenador cuando una impresión empieza, termina, falla, se pausa o se acaba el filamento. Las manda la propia app, sin servicios ni apps extra.
- **Inicio de sesión propio** (funciona bien en iPhone, también con websockets) y **app instalable** (PWA).
- **Ajustes desde la app**: IP de la impresora, dominio, proxy de confianza, avisos y cuenta.

## Puesta en marcha rápida

```bash
mkdir k2-dashboard && cd k2-dashboard
curl -O https://raw.githubusercontent.com/Nye69/K2-Dashboard/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/Nye69/K2-Dashboard/main/.env.example   # opcional
docker compose up -d
```

1. Abre `http://IP-DEL-SERVIDOR:8095` **desde tu red local** (por la IP o por tu dominio).
2. Entra con **`admin` / `changeme`**. Este acceso solo funciona desde la red local y solo hasta que lo cambies.
3. Te pedirá un **usuario y una contraseña nuevos**. Ese será el administrador.
4. Se abren los **Ajustes** (engranaje, al lado del botón de salir). Pon la IP de la impresora y guarda.
5. Para los avisos: en **Ajustes → Avisos** pon un correo de contacto, guarda y pulsa **Activar avisos en este dispositivo**. Necesitas HTTPS (tu dominio).

Más detalles en [docs/instalacion.md](docs/instalacion.md).

## Documentación

- [Instalación y actualización](docs/instalacion.md)
- [Ajustes y seguridad](docs/configuracion.md): proxy inverso, red local, notificaciones, recuperar el acceso
- [Cómo está hecho](docs/arquitectura.md)
- [Desarrollo](docs/desarrollo.md)

## Datos privados

Nada privado va en el repositorio ni en la imagen:

- `.env` (valores iniciales) está en `.gitignore`. Hay un ejemplo en [.env.example](.env.example).
- El usuario, la contraseña (cifrada con scrypt), el secreto de las sesiones, las claves de las notificaciones y los ajustes se guardan en la carpeta de datos (`DATA_PATH`, por defecto `./data`) con permisos `600`. Ver [Rutas](docs/instalacion.md#rutas).

## Licencia

Aún sin licencia: de momento, todos los derechos reservados.
