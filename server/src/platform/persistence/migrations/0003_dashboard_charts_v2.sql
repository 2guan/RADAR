-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0003_dashboard_charts_v2.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ---------------------------------------------------------------------------
-- 仪表盘分析图表 v2：系统图表/我的图表分区 + 卡片布局列
-- 作者：hengguan
-- 说明：scope='system' 为管理员维护、对所有人可见；scope='user' 仅本人可见可改。
--       col_span 6=1/4宽 12=半宽 18=3/4宽 24=全宽；height 为图表像素高（0=表格自适应）。
-- ---------------------------------------------------------------------------
ALTER TABLE dashboard_chart ADD COLUMN scope    TEXT    NOT NULL DEFAULT 'user';
ALTER TABLE dashboard_chart ADD COLUMN col_span INTEGER NOT NULL DEFAULT 12;
ALTER TABLE dashboard_chart ADD COLUMN height   INTEGER NOT NULL DEFAULT 320;

CREATE INDEX idx_dash_chart_scope ON dashboard_chart(scope, user_id, sort);
