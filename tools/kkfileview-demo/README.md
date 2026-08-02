# kkFileView 本机预览 PoC

运行：

```bash
docker compose up --build
```

然后访问 <http://localhost:8091>，上传脱敏的 DOC/DOCX/XLS/XLSX/PDF 文件。

预览 URL 会携带原始 UTF-8 文件名，避免 kkFileView 把中文名称显示为乱码。若在升级前已打开预览，请重新上传一次以生成新链接。

本目录是隔离演示，未连接 RADAR 附件、认证或数据库。两个容器仅发布到本机回环地址；kkFileView 仅信任 `demo` 和 Docker Desktop 的 `host.docker.internal`，后者用于本机 RADAR 回连测试。正式接入必须使用 kkFileView v5.0.1+，并由 RADAR 后端生成短时签名文件 URL、校验实体授权、配置精确 `trust.host` 白名单和网络出口限制。

本机实测 kkFileView 空闲约占用 1.26 GiB 内存，且启动两个 LibreOffice 转换进程；演示容器约占 15 MiB。建议正式服务从 2 vCPU / 3 GiB 内存起步，并按并发转换、复杂 Excel 与大文件压测结果扩容。

停止并清理演示数据：

```bash
docker compose down --volumes --remove-orphans
```
