# syntax=docker/dockerfile:1

# The site: built with Node, then served by nginx. The final image holds the
# built files only: no Node, no sources, no node_modules. Base images pinned
# by digest: a tag can be moved, a digest cannot.
#
# The Base Model (models/onnx/maia3-5m.onnx) and the Opening Book
# (data/dataset/opening-book.json) are not in the repository. They must be in
# the build context before `docker build`: the build stops if either is missing.

# ---------- Stage 1: build the site ----------
FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build

WORKDIR /app

# Dependencies first: this layer stays cached while the lockfile is unchanged.
COPY package.json package-lock.json ./
RUN npm ci

COPY astro.config.mjs tsconfig.json ./
COPY scripts/stage-model.ts ./scripts/
COPY models/onnx/maia3-5m.onnx ./models/onnx/
COPY data/dataset/opening-book.json ./data/dataset/
COPY docs/experiments/results ./docs/experiments/results
COPY src ./src
RUN npm run build

# ---------- Stage 2: static web server ----------
# Non-root nginx: runs as an unprivileged user and listens on port 8080.
FROM nginxinc/nginx-unprivileged:1.31.5-alpine@sha256:19c132c9ab02d3b783f478743dafc7a7f42e27aa7d2bdcbec1bb1128ca8f2a07 AS runtime

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
# Outside conf.d: nginx would load it at the http level on its own.
COPY docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# The reverse proxy only routes to a healthy container. Checked every second
# while starting, so a deployment does not wait a full interval.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=20s --start-interval=1s \
  CMD wget --quiet --spider http://127.0.0.1:8080/ || exit 1
