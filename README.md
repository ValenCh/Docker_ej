# TP Docker - Gestor de Tareas (Node.js + React + PostgreSQL)

Aplicación de ejemplo para el TP de Docker: una API CRUD de "tareas" con
Node.js/Express, un frontend en React (Vite), base de datos PostgreSQL,
todo orquestado con `docker compose`, detrás de un **reverse proxy Nginx**
y con **configuraciones de seguridad** aplicadas a cada Dockerfile.
Incluye además la funcionalidad pedida en la prueba de **Chaos Testing**:
si la base de datos se cae en caliente, el backend no crashea y responde
`503 Service Unavailable` con un mensaje amigable.

## Arquitectura

```
                     host:8080
                         |
                    +---------+
                    |  proxy  |  (Nginx, único puerto publicado)
                    +---------+
                     /        \
              "/"  /            \  "/api/*"
                   v              v
            +-----------+   +-----------+
            | frontend  |   |  backend  |
            | (Nginx +  |   | (Node.js/ |
            |  React    |   |  Express) |
            |  build)   |   +-----------+
            +-----------+         |
                                   v
                              +---------+
                              |   db    |
                              |Postgres |
                              +---------+
```

- `proxy` es el **único** servicio con puerto publicado al host
  (`8080:8080`). Enruta por path: `/` → `frontend`, `/api/*` → `backend`.
- `db` y `backend` viven en una red Docker interna (`backend_net`,
  `internal: true`), sin salida a internet y sin acceso directo desde el
  host. Solo `proxy` y `backend` pueden hablar con la base de datos... en
  realidad **solo `backend` puede hablar con `db`**; `proxy` comparte la
  red `backend_net` únicamente para poder alcanzar a `backend`.
- `frontend` sirve los archivos estáticos generados por `vite build`
  (no corre Node en producción, solo Nginx).

## Requisitos

- Docker y Docker Compose v2 (`docker compose version`).

## Puesta en marcha

```bash
# 1. Copiar el archivo de variables de entorno
cp .env.example .env
# (opcional) editar .env y cambiar POSTGRES_PASSWORD

# 2. Levantar todo
docker compose up -d --build

# 3. Ver estado / esperar a que todo quede "healthy"
docker compose ps

# 4. Abrir la app
# http://localhost:8080
```

Para ver logs en vivo de un servicio:

```bash
docker compose logs -f backend
```

Para bajar todo:

```bash
docker compose down          # conserva el volumen de datos
docker compose down -v       # borra también el volumen de datos
```

## Endpoints de la API (a través del proxy)

| Método | Ruta                  | Descripción                          |
|--------|-----------------------|---------------------------------------|
| GET    | `/api/health`          | Liveness del backend (no toca la DB) |
| GET    | `/api/health/db`        | Readiness: chequea conexión a la DB  |
| GET    | `/api/tareas`           | Lista todas las tareas               |
| GET    | `/api/tareas/:id`       | Obtiene una tarea                    |
| POST   | `/api/tareas`           | Crea una tarea (`titulo` requerido)  |
| PUT    | `/api/tareas/:id`       | Actualiza una tarea                  |
| DELETE | `/api/tareas/:id`       | Borra una tarea                      |

## Configuraciones de seguridad aplicadas

**En los Dockerfiles (backend, frontend, proxy):**

- Builds **multi-stage**: las imágenes finales no contienen herramientas
  de build, `devDependencies` ni código fuente de compilación (solo lo
  estrictamente necesario para correr).
- Imágenes base **pinneadas** a una versión concreta (nunca `latest`),
  variante `alpine` para minimizar superficie de ataque.
- El backend corre como el usuario **no-root** `node` (uid 1000, incluido
  en la imagen oficial). El frontend y el proxy usan
  `nginxinc/nginx-unprivileged`, que corre como usuario no-root (`nginx`,
  uid 101) escuchando en el puerto 8080 (no requiere binder un puerto
  privilegiado ni `CAP_NET_BIND_SERVICE`).
- `HEALTHCHECK` en cada imagen, para que Docker/Compose puedan detectar
  contenedores caídos o no listos.
- `.dockerignore` en backend y frontend: evita copiar `node_modules`,
  `.env`, `.git` y demás archivos innecesarios/sensibles al contexto de
  build.
- `server_tokens off;` en Nginx (no se expone la versión del servidor).

**En `docker-compose.yml`:**

- `security_opt: [no-new-privileges:true]` en todos los servicios: evita
  escalada de privilegios dentro del contenedor.
- `cap_drop: [ALL]` en todos los servicios, con `cap_add` mínimo y
  explícito solo donde es imprescindible (Postgres necesita
  `CHOWN`,`DAC_OVERRIDE`,`FOWNER`,`SETGID`,`SETUID` para fijar permisos
  de su directorio de datos y bajar de root a su usuario interno al
  iniciar).
- `read_only: true` (filesystem raíz de solo lectura) en todos los
  servicios, con `tmpfs` explícito solo para los directorios que
  realmente necesitan ser escribibles en runtime (`/tmp`,
  `/var/cache/nginx`, `/var/run`, `/var/run/postgresql`). Los datos
  persistentes de Postgres van en un volumen nombrado (`db_data`), nunca
  en el filesystem del contenedor.
- **Ningún puerto publicado** salvo el del `proxy`: `db`, `backend` y
  `frontend` solo son alcanzables dentro de la red interna de Docker.
- Red `backend_net` marcada `internal: true`: ni `db` ni `backend` tienen
  ruta de salida a internet.
- Límites de recursos (`mem_limit`, `pids_limit`) por servicio, para
  contener el impacto de un contenedor comprometido o con fugas.
- Secretos (usuario/contraseña de la DB) inyectados vía `.env`
  (no versionado, ver `.gitignore`), nunca hardcodeados en el compose ni
  en las imágenes.
- `init: true` en el backend: agrega `tini` como proceso PID 1 para un
  manejo correcto de señales (`SIGTERM`) y evitar procesos zombis.

**En la aplicación (backend):**

- `helmet` (headers de seguridad HTTP), `cors` configurado, límite de
  tamaño de body (`express.json({ limit: "100kb" })`) y rate limiting
  (`express-rate-limit`) sobre `/api`.
- Validación de entrada en cada endpoint del CRUD (400 ante datos
  inválidos, en vez de dejar que explote como 500).

## Prueba de Resiliencia (Chaos Testing)

Objetivo: demostrar que si la base de datos se cae **en caliente** (con la
app en uso), el backend **no crashea**: sigue vivo, atrapa el error de
conexión y responde `503 Service Unavailable` con un mensaje claro, que el
frontend muestra en un banner sin romperse.

### Cómo está implementado

- `backend/src/db/pool.js`:
  - El `Pool` de `pg` registra un listener `pool.on("error", ...)`. Sin
    este listener, cuando Postgres se cae abruptamente, el cliente idle
    del pool emite un error no capturado que **tira abajo todo el
    proceso de Node**. Con el listener, el error solo se loguea.
  - Toda query pasa por una función `query()` que detecta códigos de
    error de conectividad (`ECONNREFUSED`, `ETIMEDOUT`, `57P03`, etc.) y
    los traduce a un `ServiceUnavailableError` (503), en vez de dejar
    que se propague como un 500 genérico.
- `backend/src/middleware/errorHandler.js`: middleware central que
  convierte ese error en una respuesta JSON `503` con `Retry-After` y un
  mensaje amigable, sin exponer stack traces.
- `backend/src/index.js`: además, `process.on("uncaughtException")` y
  `process.on("unhandledRejection")` actúan como red de seguridad
  adicional (loguean en vez de matar el proceso).
- `frontend/src/api.js` + `App.jsx`: si cualquier request recibe `503` (o
  directamente falla la conexión), la UI muestra un banner de "Servicio
  no disponible" y **reintenta automáticamente cada 5 segundos** hasta
  que la base de datos vuelve.

### Pasos para reproducir la prueba

```bash
# 1. Levantar todo y confirmar que está sano
docker compose up -d --build
docker compose ps
# Todos los servicios deberían figurar "healthy"

# 2. Abrir http://localhost:8080 y usar la app normalmente
#    (crear un par de tareas, marcarlas, etc.)

# 3. Simular una caida abrupta de la base de datos
docker stop adr_db

# 4. Con la app abierta, intentar crear/listar una tarea:
#    debería aparecer el banner "Servicio no disponible" en la UI.
#    Verificarlo también directo contra la API:
curl -i http://localhost:8080/api/tareas
# Esperado: HTTP/1.1 503 ...
# {"error":"service_unavailable","message":"Base de datos no disponible..."}

# 5. Confirmar que el backend SIGUE VIVO (no reinició, no crasheó):
docker compose ps backend
docker logs adr_backend --tail 30
# Se deberian ver logs de "[db] Error de conectividad..." pero el
# contenedor sigue "Up" (no "Restarting" ni con exit code de crash).

# 6. Restaurar la base de datos
docker start adr_db

# 7. Verificar la recuperación automática (sin reiniciar el backend):
curl -i http://localhost:8080/api/tareas
# Esperado: HTTP/1.1 200 ... con el listado de tareas otra vez.
# En la UI, el banner desaparece solo en <=5s (o al tocar "Reintentar").
```

### Qué mirar para la evaluación

- El contenedor `adr_backend` nunca cambia a estado `Restarting` ni se cae
  durante el paso 3-4 (`docker compose ps` / `docker logs`).
- La API responde `503` (no `500`, no timeout colgado, no conexión
  rechazada sin respuesta) mientras la DB está caída.
- Al volver la DB, el sistema se recupera solo, sin necesidad de
  `docker compose restart backend`.

## Estructura del proyecto

```
.
├── backend/            # API Node.js + Express
│   ├── src/
│   │   ├── db/          # Pool de conexión + manejo defensivo de errores
│   │   ├── middleware/   # Error handler central + async wrapper
│   │   ├── routes/       # /api/tareas, /api/health
│   │   └── index.js      # Entry point
│   └── Dockerfile
├── frontend/            # React + Vite
│   ├── src/
│   │   ├── components/   # TaskForm, TaskList, StatusBanner
│   │   ├── api.js        # Cliente HTTP con manejo de 503
│   │   └── App.jsx
│   ├── nginx.conf        # Sirve el build estático
│   └── Dockerfile
├── proxy/               # Reverse proxy Nginx
│   ├── nginx.conf
│   └── Dockerfile
├── db/
│   └── init/01-schema.sql  # Se ejecuta al crear el volumen por primera vez
├── docker-compose.yml
├── .env.example
└── README.md
```

## Notas / troubleshooting

- **Todas las imágenes se bajan directo de Docker Hub** (`node`,
  `postgres`, `nginx`), sin mirrors intermedios. Para que los `docker
  build`/`podman build` funcionen hace falta estar logueado en Docker Hub
  (ver el punto siguiente); sin login, Docker Hub limita/corta los pulls
  anónimos y el build falla con errores de "unauthorized" que en realidad
  no tienen nada que ver con que las credenciales estén mal.
  Además, los Dockerfiles no tienen la línea `# syntax=docker/dockerfile:1`:
  esa directiva hace que BuildKit baje un frontend de build desde Docker
  Hub antes de compilar, otra dependencia innecesaria que puede fallar por
  lo mismo. Ninguno de los Dockerfiles usa funcionalidades que requieran
  esa directiva, así que el build funciona igual con
  `docker build`/`docker compose` (BuildKit) y con `podman
  build`/`podman compose` (buildah).
  En `frontend/` y `proxy/` se parte de la imagen oficial de `nginx` (no de
  `nginxinc/nginx-unprivileged`, que es de un tercero) y el hardening
  no-root (puerto 8080, usuario `nginx`, archivos temporales en `/tmp`) se
  hace a mano en el `Dockerfile` y en `nginx.conf` (ver los comentarios
  ahí).
- **Si el build falla al bajar alguna imagen con un error de
  autenticación** (`unauthorized`, `invalid username/password`, etc.),
  Docker Hub está pisando el límite de pulls anónimos o rechazando
  credenciales viejas guardadas. La forma confiable de resolverlo es
  loguearse con una cuenta real:
  1. Crear una cuenta gratuita en <https://hub.docker.com> si no tenés una.
  2. Generar un **Access Token** (no usar la contraseña de la cuenta):
     en hub.docker.com → ícono de usuario → *Account Settings* →
     *Security* → *Personal access tokens* → *Generate new token*
     (alcanza con permisos de solo lectura).
  3. Loguearse con ese token como si fuera la contraseña:
     ```powershell
     docker login -u <tu_usuario_de_docker_hub>
     # o, si usas Podman:
     podman login docker.io -u <tu_usuario_de_docker_hub>
     ```
     Cuando pida la contraseña, pegar el Access Token (no la contraseña
     real de la cuenta).
  4. Reintentar `docker compose up -d --build` / `podman compose up -d --build`.
- Si `db` no llega a `healthy` con `read_only: true` en tu entorno de
  Docker (por permisos del volumen en algunas configuraciones de Windows
  con Docker Desktop), se puede quitar temporalmente `read_only: true` y
  el bloque `tmpfs` del servicio `db` en `docker-compose.yml`: el resto
  del hardening (cap_drop, no-new-privileges, red interna) sigue
  aplicando igual.
- El backend tolera que la base de datos todavía no esté lista al
  arrancar (reintenta preparar el esquema varias veces antes de
  rendirse), aunque `depends_on: condition: service_healthy` ya debería
  garantizar el orden correcto en la mayoría de los casos.
