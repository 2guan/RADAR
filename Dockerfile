# ============================================================================
# 文件：Dockerfile
# 说明：本镜像使用多阶段构建，构建产物由单一 Fastify 进程同时提供 API 与前端静态资源。
# 用途：RADAR 平台多阶段构建镜像。阶段一构建前端静态资源，阶段二安装后端依赖并运行，
#       由 Fastify 同时提供 API 与前端静态页面。适配 ARM/AMD 架构。
# 作者：hengguan
# ============================================================================

# ---- 可替换基础镜像：国内服务器可在 Compose/.env 中指定 Docker Hub 加速地址 ----
ARG NODE_IMAGE=node:22-alpine
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

# ---- 阶段一：构建前端 ----
FROM ${NODE_IMAGE} AS web-builder
ARG NPM_CONFIG_REGISTRY
ARG WEB_BUILD_NODE_OPTIONS=--max-old-space-size=2048
WORKDIR /build/web
COPY web/package*.json ./
RUN npm config set registry "${NPM_CONFIG_REGISTRY}" && npm ci
COPY web/ ./
ENV NODE_OPTIONS=${WEB_BUILD_NODE_OPTIONS}
RUN npm run build

# ---- 阶段二：后端运行环境 ----
FROM ${NODE_IMAGE}
ARG NPM_CONFIG_REGISTRY
WORKDIR /app

# 安装后端依赖（仅生产）与降权工具，然后移除最终运行镜像不需要的 npm/corepack 工具及其依赖。
COPY server/package*.json ./server/
RUN apk add --no-cache su-exec \
  && npm config set registry "${NPM_CONFIG_REGISTRY}" \
  && cd server && npm ci --omit=dev \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# 拷贝后端源码与前端构建产物
COPY server/ ./server/
COPY --from=web-builder /build/web/dist ./web/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# 数据与附件目录（将通过 volume 挂载）；服务进程不以 root 身份运行。
RUN addgroup -S radar && adduser -S -G radar -h /app radar \
  && mkdir -p /app/data /app/attachments \
  && chown -R radar:radar /app \
  && chmod 755 /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV DB_CLIENT=sqlite

ARG APP_PORT=3000
EXPOSE ${APP_PORT}

USER radar

# Compose 会仅在入口脚本初始化挂载目录时覆盖为 root；脚本完成属主修正后，
# 立即通过 su-exec 以 radar 用户启动服务。直接运行镜像仍默认保持非 root。
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# 启动后端（自动迁移 + 种子 + 提供前端）
CMD ["node", "server/src/server.js"]
