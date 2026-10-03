# Sin "# syntax=docker/dockerfile:1" a proposito: ver el comentario
# equivalente en backend/Dockerfile (evita una dependencia extra de
# Docker Hub y hace el build compatible con Docker y con Podman por igual).

# Reverse proxy dedicado, imagen minima y sin privilegios.
#
# Se parte de la imagen oficial de Nginx en vez de
# "nginxinc/nginx-unprivileged" (esa imagen es de un tercero, no forma
# parte de las "Docker Official Images"). El hardening no-root se hace a
# mano: ver proxy/nginx.conf.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/proxy-health || exit 1

USER nginx
