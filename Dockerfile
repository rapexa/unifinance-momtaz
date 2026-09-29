# One image = web app + API. One container serves one customer (tenant).
#
#   docker build -t unifinance:latest \
#     --build-arg LICENSE_PUBLIC_KEY="$(cat deploy/keys/license-public.key)" .
#
# Base images are build args so servers that cannot reach Docker Hub (e.g. in Iran) can use
# a mirror:  --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine  (etc.)

ARG NODE_IMAGE=node:22-alpine
ARG GO_IMAGE=golang:1.24-alpine
ARG RUNTIME_IMAGE=alpine:3.20

# ---- web app ----
FROM ${NODE_IMAGE} AS web
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig*.json tailwind.config.ts postcss.config.js components.json ./
COPY public ./public
COPY src ./src
# Same-origin API: works on any customer domain.
ENV VITE_API_BASE_URL=/api/v1
RUN npx vite build

# ---- API ----
FROM ${GO_IMAGE} AS api
ARG GOPROXY=https://proxy.golang.org,direct
ARG LICENSE_PUBLIC_KEY=""
ARG VERSION=dev
ENV GOPROXY=${GOPROXY} CGO_ENABLED=0 GOTOOLCHAIN=local
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend ./
RUN go build -trimpath \
      -ldflags "-s -w -X github.com/soheilsshh/unifinance-momtaz/pkg/license.PublicKey=${LICENSE_PUBLIC_KEY}" \
      -o /out/unifinance ./cmd \
 && go build -trimpath -ldflags "-s -w" -o /out/license ./cmd/license

# ---- runtime ----
FROM ${RUNTIME_IMAGE}
RUN apk add --no-cache ca-certificates tzdata wget \
 && addgroup -S app && adduser -S -G app -u 10001 app \
 && mkdir -p /app/uploads && chown -R app:app /app
ENV TZ=Asia/Tehran \
    UNIFINANCE_APP_ENV=production \
    UNIFINANCE_SERVER_ADDR=:8081 \
    UNIFINANCE_STATIC_DIR=/app/web \
    UNIFINANCE_DB_TIMEZONE=Local
WORKDIR /app
COPY --from=api /out/unifinance /app/unifinance
COPY --from=api /out/license /usr/local/bin/license
COPY --from=web /src/dist /app/web
USER app
VOLUME ["/app/uploads"]
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/health >/dev/null || exit 1
ENTRYPOINT ["/app/unifinance"]
