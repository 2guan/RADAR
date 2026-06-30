# RADAR 数据迁移说明

> 作者：hengguan
>
> 用途：集中说明 RADAR 在 SQLite、TDSQL MySQL 兼容版、TDSQL 文件卸数/装数之间的迁移路径、脚本用法与注意事项。

本文整理 RADAR 支持的所有数据库迁移方式。当前项目支持 SQLite 与 TDSQL MySQL 兼容版，并提供应用级迁移脚本；如果源库和目标库都是 TDSQL，也可以使用 TDSQL/MySQL 原生卸数恢复方式。

## 迁移前准备

1. 停止业务写入，避免迁移过程中源库继续变化。
2. 备份源数据库和附件目录。
3. 确认目标环境已部署相同版本的 RADAR 代码。
4. 如果目标是 TDSQL，先创建目标数据库，并用 `DB_CLIENT=tdsql` 启动一次服务完成建表。
5. 如果目标是 SQLite，迁移工具会在目标 SQLite 文件不存在时自动执行 SQLite migrations 建表。
6. 附件文件不在数据库内，数据库迁移后还需要单独迁移 `ATTACHMENT_DIR`。

常用目录：

```text
server/scripts/sqlite-to-tdsql.js   # 应用级迁移工具
data/radar.db                       # 默认 SQLite 数据库文件
attachments/                        # 默认附件目录
```

进入后端目录：

```bash
cd /path/to/RADAR/server
```

## 连接参数

应用级迁移工具支持命令行参数，也会读取仓库根目录 `.env`。

普通 TDSQL 参数：

```bash
--host TDSQL_HOST
--port TDSQL_PORT
--database TDSQL_DATABASE
--user TDSQL_USER
--password 'TDSQL_PASSWORD'
```

TDSQL 到 TDSQL 直连迁移使用源库和目标库参数：

```bash
--source-host SOURCE_HOST
--source-port SOURCE_PORT
--source-database SOURCE_DATABASE
--source-user SOURCE_USER
--source-password 'SOURCE_PASSWORD'
--target-host TARGET_HOST
--target-port TARGET_PORT
--target-database TARGET_DATABASE
--target-user TARGET_USER
--target-password 'TARGET_PASSWORD'
```

通用选项：

```bash
--truncate   # 迁移前清空目标表
--dry-run    # 只统计源数据行数，不写入目标库
```

## 方式一：SQLite 迁移到 TDSQL

适用场景：本地 SQLite 文件数据库切换到 TDSQL MySQL 兼容版。

```bash
npm run migrate:tdsql -- \
  --sqlite ../data/radar.db \
  --host target.example.com \
  --port 3306 \
  --database radar \
  --user radar_app \
  --password 'target-password'
```

清空目标 TDSQL 表后重新导入：

```bash
npm run migrate:tdsql -- \
  --sqlite ../data/radar.db \
  --host target.example.com \
  --port 3306 \
  --database radar \
  --user radar_app \
  --password 'target-password' \
  --truncate
```

迁移后将目标环境 `.env` 切到：

```env
DB_CLIENT=tdsql
TDSQL_HOST=target.example.com
TDSQL_PORT=3306
TDSQL_DATABASE=radar
TDSQL_USER=radar_app
TDSQL_PASSWORD=target-password
```

## 方式二：TDSQL 迁移到 SQLite

适用场景：从 TDSQL 回迁到文件库，或为物理隔离迁移生成可携带的 SQLite 离线包。

```bash
npm run migrate:sqlite -- \
  --sqlite ../data/radar-from-tdsql.db \
  --host source.example.com \
  --port 3306 \
  --database radar \
  --user radar_app \
  --password 'source-password'
```

清空目标 SQLite 表后重新导入：

```bash
npm run migrate:sqlite -- \
  --sqlite ../data/radar-from-tdsql.db \
  --host source.example.com \
  --port 3306 \
  --database radar \
  --user radar_app \
  --password 'source-password' \
  --truncate
```

迁移后将目标环境 `.env` 切到：

```env
DB_CLIENT=sqlite
DB_FILE=./data/radar-from-tdsql.db
```

## 方式三：TDSQL 直连迁移到另一个 TDSQL

适用场景：源 TDSQL 和目标 TDSQL 网络互通，希望不经过中间文件直接迁移。

```bash
npm run migrate:tdsql-to-tdsql -- \
  --source-host source.example.com \
  --source-port 3306 \
  --source-database radar_source \
  --source-user radar_app \
  --source-password 'source-password' \
  --target-host target.example.com \
  --target-port 3306 \
  --target-database radar_target \
  --target-user radar_app \
  --target-password 'target-password'
```

清空目标 TDSQL 表后重新导入：

```bash
npm run migrate:tdsql-to-tdsql -- \
  --source-host source.example.com \
  --source-port 3306 \
  --source-database radar_source \
  --source-user radar_app \
  --source-password 'source-password' \
  --target-host target.example.com \
  --target-port 3306 \
  --target-database radar_target \
  --target-user radar_app \
  --target-password 'target-password' \
  --truncate
```

安全保护：如果源库和目标库指向同一个库，工具会拒绝执行 `--truncate`。

## 方式四：物理隔离环境的 SQLite 离线包迁移

适用场景：两个 TDSQL 库网络不连通，但允许通过离线介质传输文件。

源环境导出 TDSQL 到 SQLite：

```bash
npm run migrate:sqlite -- \
  --sqlite ./radar-transfer.db \
  --host source.example.com \
  --port 3306 \
  --database radar \
  --user radar_app \
  --password 'source-password' \
  --truncate
```

打包附件：

```bash
tar -czf radar-attachments.tar.gz ../attachments
sha256sum radar-transfer.db radar-attachments.tar.gz > SHA256SUMS
```

把以下文件传到目标环境：

```text
radar-transfer.db
radar-attachments.tar.gz
SHA256SUMS
```

目标环境校验并导入：

```bash
sha256sum -c SHA256SUMS

npm run migrate:tdsql -- \
  --sqlite ./radar-transfer.db \
  --host target.example.com \
  --port 3306 \
  --database radar \
  --user radar_app \
  --password 'target-password' \
  --truncate
```

恢复附件到目标 `ATTACHMENT_DIR`：

```bash
tar -xzf radar-attachments.tar.gz -C /path/to/RADAR
```

## 方式五：TDSQL 卸数成 SQL 文件，再恢复到 TDSQL

适用场景：源和目标都是 TDSQL/MySQL 兼容库，并且希望使用数据库原生逻辑备份文件，不转换成 SQLite。

项目提供了两个封装脚本：

- A 卸数：`npm run dump:tdsql`
- B 装数：`npm run restore:tdsql`

这两个脚本底层调用系统中的 `mysqldump` 和 `mysql` 客户端。密码通过 `MYSQL_PWD` 环境变量传给子进程，不会拼到实际执行的 mysql 参数列表中。

### A：源环境卸数

导出压缩 SQL 文件：

```bash
cd server
npm run dump:tdsql -- \
  --source-host source.example.com \
  --source-port 3306 \
  --source-database radar \
  --source-user radar_app \
  --source-password 'source-password' \
  --output ./radar-tdsql-dump.sql.gz
```

导出非压缩 SQL 文件：

```bash
npm run dump:tdsql -- \
  --source-host source.example.com \
  --source-port 3306 \
  --source-database radar \
  --source-user radar_app \
  --source-password 'source-password' \
  --output ./radar-tdsql-dump.sql \
  --no-gzip
```

如果输出文件已存在，默认会拒绝覆盖；需要覆盖时加 `--force`：

```bash
npm run dump:tdsql -- ... --output ./radar-tdsql-dump.sql.gz --force
```

### B：目标环境装数

恢复压缩 SQL 文件：

```bash
cd server
npm run restore:tdsql -- \
  --target-host target.example.com \
  --target-port 3306 \
  --target-database radar \
  --target-user radar_app \
  --target-password 'target-password' \
  --input ./radar-tdsql-dump.sql.gz
```

恢复非压缩 SQL 文件：

```bash
npm run restore:tdsql -- \
  --target-host target.example.com \
  --target-port 3306 \
  --target-database radar \
  --target-user radar_app \
  --target-password 'target-password' \
  --input ./radar-tdsql-dump.sql
```

装数脚本默认会先执行：

```sql
CREATE DATABASE IF NOT EXISTS radar DEFAULT CHARACTER SET utf8mb4;
```

如果要先删除并重建目标库，必须同时使用 `--drop-database --force`：

```bash
npm run restore:tdsql -- \
  --target-host target.example.com \
  --target-port 3306 \
  --target-database radar \
  --target-user radar_app \
  --target-password 'target-password' \
  --input ./radar-tdsql-dump.sql.gz \
  --drop-database \
  --force
```

如果当前机器的 mysql 客户端命令不叫 `mysql` / `mysqldump`，可以指定路径：

```bash
npm run dump:tdsql -- ... --mysqldump-bin /path/to/mysqldump
npm run restore:tdsql -- ... --mysql-bin /path/to/mysql
```

### 底层等价命令

源环境导出：

```bash
mysqldump \
  -h source.example.com \
  -P 3306 \
  -u radar_app \
  -p \
  --default-character-set=utf8mb4 \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  radar > radar-tdsql-dump.sql
```

压缩导出：

```bash
mysqldump \
  -h source.example.com \
  -P 3306 \
  -u radar_app \
  -p \
  --default-character-set=utf8mb4 \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  radar | gzip > radar-tdsql-dump.sql.gz
```

目标环境建库：

```bash
mysql \
  -h target.example.com \
  -P 3306 \
  -u radar_app \
  -p \
  -e "CREATE DATABASE IF NOT EXISTS radar DEFAULT CHARACTER SET utf8mb4;"
```

恢复 SQL 文件：

```bash
mysql \
  -h target.example.com \
  -P 3306 \
  -u radar_app \
  -p \
  radar < radar-tdsql-dump.sql
```

恢复压缩文件：

```bash
gunzip -c radar-tdsql-dump.sql.gz | mysql \
  -h target.example.com \
  -P 3306 \
  -u radar_app \
  -p \
  radar
```

附件仍需单独打包迁移：

```bash
tar -czf radar-attachments.tar.gz ../attachments
sha256sum radar-tdsql-dump.sql.gz radar-attachments.tar.gz > SHA256SUMS
```

## 应用级迁移脚本与 mysqldump 的选择

优先使用应用级迁移脚本的情况：

- SQLite 和 TDSQL 之间迁移。
- 需要处理 RADAR 的 JSON 字段兼容。
- 需要按应用表顺序 upsert 数据。
- 希望保留原始 `id` 并重置自增序列。

优先使用 `mysqldump/mysql` 的情况：

- 源和目标都是 TDSQL/MySQL 兼容库。
- 两端数据库版本和字符集兼容。
- 需要数据库原生 SQL 备份文件。
- 物理隔离环境中希望交付标准 `.sql` 或 `.sql.gz` 文件。

## 迁移后检查

1. 启动目标环境服务。
2. 使用管理员账号登录。
3. 抽查以下功能：
   - 用户和角色权限
   - 字典、系统、投产点
   - 需求和工单列表、详情
   - 开发任务、测试任务
   - 投产申请、投产审批
   - 版本概览、仪表盘
   - 附件列表和附件下载
4. 确认 `.env` 中 `DB_CLIENT` 指向目标数据库类型。
5. 如使用 Docker，确认数据目录和附件目录已正确挂载。

## 常见风险

- `--truncate` 会清空目标表，正式执行前必须确认目标库可覆盖。
- 数据库迁移不包含附件文件本体，必须同步迁移 `ATTACHMENT_DIR`。
- `mysqldump` 恢复前建议确认目标库字符集为 `utf8mb4`。
- 物理隔离文件传输建议生成并校验 `SHA256SUMS`。
- 生产迁移建议先在演练环境完整跑通一次。
