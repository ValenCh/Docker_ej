# Sin "# syntax=docker/dockerfile:1" a proposito: ver el comentario
# equivalente en backend/Dockerfile (evita una dependencia extra de
# Docker Hub y hace el build compatible con Docker y con Podman por igual).

# ---------- Stage 1: build de la app React con Vite ----------
FROM node:20.17.0-alpine3.20 AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Stage 2: runtime con Nginx sin privilegios ----------
# Se parte de la imagen oficial de Nginx en vez de
# "nginxinc/nginx-unprivileged" (esa imagen es de un tercero, no forma
# parte de las "Docker Official Images"). El hardening para correr sin
# root se hace a mano mas abajo: puerto no privilegiado (8080), usuario
# "nginx" sin privilegios, y todos los directorios que Nginx necesita
# escribir redirigidos a /tmp (que en docker-compose.yml esta montado
# como tmpfs escribible aunque el resto del filesystem sea read_only).
FROM nginx:1.27-alpine

# Solo copiamos el resultado del build: la imagen final no tiene Node,
# npm, ni el codigo fuente/dependencias de desarrollo.
COPY --from=build /app/dist /usr/share/nginx/html

# Reemplazamos el nginx.conf completo (contexto principal) por uno que:
#  - no requiere privilegios de root (sin "user nginx;", ya el proceso
#    entero corre como usuario no-root),
#  - escucha en un puerto >1024 (8080), evitando CAP_NET_BIND_SERVICE,
#  - manda todos sus archivos temporales/pid a /tmp.
COPY nginx.conf /etc/nginx/nginx.conf

# El usuario "nginx" (uid 101) ya viene creado en la imagen oficial; solo
# nos falta poder leer los archivos que copiamos y usarlo como USER.
RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/health || exit 1

USER nginx
