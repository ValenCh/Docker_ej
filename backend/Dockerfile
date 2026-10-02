# Sin "# syntax=docker/dockerfile:1" a proposito: esa directiva hace que
# BuildKit (el motor de build de Docker) baje el frontend de build desde
# docker.io/docker/dockerfile antes de arrancar, lo que agrega otra
# dependencia de Docker Hub y puede fallar por los mismos motivos que las
# imagenes base (rate limit/auth). Como este Dockerfile no usa ninguna
# funcionalidad "nueva" de BuildKit (heredocs, --mount, etc.), no hace
# falta esa directiva: funciona igual con Docker (BuildKit) y con Podman
# (buildah), sin depender de Docker Hub para resolver la sintaxis.

# ---------- Stage 1: dependencias e instalacion ----------
# Version de Node pinneada (no "latest") + variante alpine para reducir
# superficie de ataque y tamaño de imagen.
FROM node:20.17.0-alpine3.20 AS deps

WORKDIR /app

# Solo copiamos los manifiestos primero para aprovechar la cache de capas.
COPY package.json package-lock.json* ./

# npm ci con --omit=dev: no instalamos devDependencies en la imagen final.
# --no-audit/--no-fund: reduce ruido y llamadas de red innecesarias en build.
RUN npm install --omit=dev --no-audit --no-fund

# ---------- Stage 2: imagen final de runtime ----------
FROM node:20.17.0-alpine3.20 AS runtime

# Actualizamos paquetes del SO base para parches de seguridad y limpiamos
# la cache de apk para no dejar artefactos innecesarios en la imagen.
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

# Copiamos node_modules ya instalados (sin devDependencies) y el codigo.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# La imagen oficial de node:alpine ya incluye un usuario/grupo "node" sin
# privilegios (uid 1000). Lo usamos en vez de correr como root.
USER node

EXPOSE 4000

# Healthcheck: usa el endpoint de liveness (no depende de la DB) para que
# Docker sepa si el proceso backend sigue vivo. wget viene incluido en
# BusyBox (alpine), no requiere instalar curl.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:4000/api/health || exit 1

CMD ["node", "src/index.js"]
