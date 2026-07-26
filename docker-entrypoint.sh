#!/bin/sh
# =============================================================================
# 文件：docker-entrypoint.sh
# 说明：在 Docker Compose 覆盖镜像用户启动时，初始化已挂载的持久化目录属主，
#       然后将进程降权为镜像内 radar 用户。
# 用途：兼容旧版 root 所有的 SQLite 与附件卷，同时保证 RADAR 应用进程不以 root 运行。
# 作者：hengguan
# =============================================================================

set -eu

# Compose 为兼容历史绑定卷以 root 启动本入口；只允许入口阶段调整两个固定的持久化目录。
if [ "$(id -u)" = "0" ]; then
  for persistent_dir in /app/data /app/attachments; do
    mkdir -p "$persistent_dir"
    chown -R radar:radar "$persistent_dir"
  done

  # 降权后 exec 业务进程，避免保留 root shell 或额外父进程。
  exec su-exec radar "$@"
fi

# 非 Compose 的直接 docker run 保持镜像默认的 radar 用户，直接运行应用。
exec "$@"
