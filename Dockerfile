# ============================================================================
# 文件：Dockerfile
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
WORKDIR /build/web
COPY web/package*.json ./
RUN npm config set registry "${NPM_CONFIG_REGISTRY}" && npm ci
COPY web/ ./
RUN npm run build

# ---- 阶段二：后端运行环境 ----
FROM ${NODE_IMAGE}
ARG NPM_CONFIG_REGISTRY
WORKDIR /app

# 安装后端依赖（仅生产）
COPY server/package*.json ./server/
RUN npm config set registry "${NPM_CONFIG_REGISTRY}" && cd server && npm ci --omit=dev

# 拷贝后端源码与前端构建产物
COPY server/ ./server/
COPY --from=web-builder /build/web/dist ./web/dist

# 数据与附件目录（将通过 volume 挂载）
RUN mkdir -p /app/data /app/attachments

ENV NODE_ENV=production
ENV DB_CLIENT=sqlite

ARG APP_PORT=3000
EXPOSE ${APP_PORT}

# 启动后端（自动迁移 + 种子 + 提供前端）
CMD ["node", "server/src/server.js"]
