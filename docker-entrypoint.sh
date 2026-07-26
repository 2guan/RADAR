#!/bin/sh
# =============================================================================
# 文件：docker-entrypoint.sh
# 说明：在 Docker Compose 覆盖镜像用户启动时，初始化已挂载的持久化目录属主，
#       然后将进程降权为镜像内 radar 用户。
# 用途：兼容旧版 root 所有的 SQLite 与附件卷，同时保证 RADAR 应用进程不以 root 运行。
# 作者：hengguan
# =============================================================================

set -eu

# 将相对 DB_FILE 解析为容器内 /app 路径；SQLite 的 -wal/-shm 文件必须与主库同属应用用户。
database_file="${DB_FILE:-/app/data/radar.db}"
case "$database_file" in
  /*) ;;
  *) database_file="/app/${database_file#./}" ;;
esac

# Compose 为兼容历史绑定卷以 root 启动本入口；只允许入口阶段调整两个固定的持久化目录。
if [ "$(id -u)" = "0" ]; then
  for persistent_dir in "$(dirname "$database_file")" /app/attachments; do
    mkdir -p "$persistent_dir"
    chown radar:radar "$persistent_dir"
  done

  # 常规重启只处理 SQLite 运行文件，避免附件数量增长后每次递归 chown 造成线性启动耗时。
  for sqlite_file in "$database_file" "$database_file-wal" "$database_file-shm"; do
    if [ -e "$sqlite_file" ]; then chown radar:radar "$sqlite_file"; fi
  done

  # 历史升级且附件原先归 root 时，管理员可显式执行一次完整修复；该操作绝不作为常规启动路径。
  if [ "${RADAR_REPAIR_VOLUME_OWNERSHIP:-0}" = "1" ]; then
    chown -R radar:radar "$(dirname "$database_file")" /app/attachments
    echo "[RADAR] 已完成持久化目录属主修复"
  fi

  # 降权后 exec 业务进程，避免保留 root shell 或额外父进程。
  exec su-exec radar "$@"
fi

# 非 Compose 的直接 docker run 保持镜像默认的 radar 用户，直接运行应用。
exec "$@"
