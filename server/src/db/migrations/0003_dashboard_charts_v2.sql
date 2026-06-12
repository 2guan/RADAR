-- ---------------------------------------------------------------------------
-- 仪表盘分析图表 v2：系统图表/我的图表分区 + 卡片布局列
-- 作者：hengguan
-- 说明：scope='system' 为管理员维护、对所有人可见；scope='user' 仅本人可见可改。
--       col_span 12=半宽 24=全宽；height 为图表像素高（0=表格自适应）。
-- ---------------------------------------------------------------------------
ALTER TABLE dashboard_chart ADD COLUMN scope    TEXT    NOT NULL DEFAULT 'user';
ALTER TABLE dashboard_chart ADD COLUMN col_span INTEGER NOT NULL DEFAULT 12;
ALTER TABLE dashboard_chart ADD COLUMN height   INTEGER NOT NULL DEFAULT 320;

CREATE INDEX idx_dash_chart_scope ON dashboard_chart(scope, user_id, sort);
