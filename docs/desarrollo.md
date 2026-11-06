# Desarrollo

Requiere Node 22 o más reciente.

```bash
npm install
npm test                 # pruebas (app y servidor)

# en una terminal: servidor Node (datos en ./data, que está en .gitignore)
npm run dev:server

# en otra: la app, apuntando a tu impresora
K2_URL=http://192.168.1.50:7125 npm run dev
```

Abre `http://localhost:5173/login`. En desarrollo, Vite reenvía la API de Moonraker a `K2_URL` y `/auth`, `/login` y `/setup` al servidor Node. La app no pide sesión porque eso lo hace nginx en el contenedor. Para probar el flujo completo, entra primero por `/login`.

## Imagen Docker

```bash
docker build -t k2-dashboard .
docker run --rm -p 8095:80 -v "$PWD/data:/data" k2-dashboard
```

El `Dockerfile` ejecuta las pruebas antes de compilar: si fallan, no hay imagen.

## Publicación

El workflow [`.github/workflows/build.yml`](../.github/workflows/build.yml):

- **En cada PR**: pruebas, compilación y construcción de la imagen, sin publicarla.
- **En `main`**: publica `ghcr.io/nye69/k2-dashboard:latest` y `:sha-xxxxxxx` para `amd64` y `arm64`.
- **Con una etiqueta `v1.2.3`**: publica además `:1.2.3` y `:1.2`.

Dependabot ([`.github/dependabot.yml`](../.github/dependabot.yml)) revisa cada lunes las dependencias de npm, las imágenes base de Docker y las acciones de GitHub.
