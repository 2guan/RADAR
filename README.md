# RADAR · 日常需求研发流程管理平台

> Requirement & Agile Development Administration Resource
>
> 常规投产版本全生命周期流程管控平台 —— 以"投产版本（投产点）"为主线，把"需求分析 → 开发管理 → 测试管理(SIT/UAT/NFT/SEC) → 投产管理"全链路数字化。

## 技术栈

- **后端**：Node.js (v22+，推荐 v25)、Fastify、`node:sqlite`（原生 SQLite）、JWT 鉴权、RBAC 权限矩阵
- **前端**：React 18 + Vite + Ant Design 5 + ECharts，支持白天/夜间模式，主题色翡翠绿（非蓝）
- **部署**：Docker Compose（ARM 友好），数据库与附件目录挂载持久化

## 目录结构

```
RADAR/
├─ server/        # Fastify 后端（API + 静态资源）
├─ web/           # React 前端
├─ data/          # 【挂载】SQLite 数据库文件 radar.db
├─ attachments/   # 【挂载】上传附件
├─ docker-compose.yml
└─ Dockerfile
```

## 本地开发

```bash
# 1. 安装依赖
cd server && npm install
cd ../web && npm install

# 2. 启动后端（默认 http://localhost:3000）
cd server && npm run dev

# 3. 启动前端（默认 http://localhost:5173，已代理 /api 到后端）
cd web && npm run dev
```

首次启动后端会自动执行数据库迁移并写入初始数据。

## 初始账号

| 登录名 | 密码        | 角色       |
| ------ | ----------- | ---------- |
| admin  | admin2026   | 超级管理员 |

## 生产部署（Docker Compose / ARM）

```bash
docker compose up -d --build
# 访问 http://<服务器IP>:3000
```

`./data` 与 `./attachments` 已挂载到宿主机，容器删除后数据与附件不丢失。

## 作者

hengguan
