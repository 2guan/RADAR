/**
 * 文件：modules/issues/routes.js
 * 说明：数据来源为外部 PAMS 系统，本平台不提供新增/编辑/删除；以 issue_code 为同步主键做 upsert。
 *       JSON 字段（analysis_log/tags/linked_cases）入库为字符串、出参解析为数组；is_major/is_common 出参转布尔。
 *       后台同步状态（bgState）保存在内存中，服务重启后重置；前端通过轮询 /issues/sync-detail-status 获取进度。
 * 用途：问题管理模块接口（手动上传 + 外部同步 + 清空）。提供问题列表、问题详情，
 *       Excel 模板下载/导入，以及「同步问题」（拉取概述列表）与「同步问题详情」（后台逐条慢速更新明细）两个同步端点。
 * 作者：hengguan
 */

import { get, run, tx, isSqlite } from '../../platform/persistence/index.js';
import { listQuery } from '../../lib/query.js';
import { ok, notFound, badRequest, parseJsonArray } from '../../platform/runtime/index.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import {
  getIssueSyncState,
  resetIssueSyncState,
  startIssueDetailSync,
  syncIssueDetails,
  syncIssueOverview,
} from './application/sync.js';

// 列表查询可排序/筛选的列白名单
const COLUMNS = [
  'id', 'issue_code', 'status', 'category', 'detailed_classification', 'system', 'module',
  'business_group', 'urgency', 'round', 'summary', 'details', 'work_order_no',
  'create_time', 'plan_resolve_time', 'synced_at',
];
// 关键字模糊检索列
const SEARCH = ['issue_code', 'summary', 'system', 'detailed_classification'];
// 出参需解析为数组的 JSON 字段
const JSON_FIELDS = ['analysis_log', 'tags', 'linked_cases'];

/** 把存储的 JSON 字符串字段解析为数组、is_major/is_common 转布尔，返回给前端 */
function decode(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS) out[f] = parseJsonArray(row[f]);
  out.is_major = !!row.is_major;
  out.is_common = !!row.is_common;
  return out;
}

/** 把外部布尔/数值统一转为 0/1 */
function toBit(v) {
  return v === true || v === 1 || ['1', 'true', 'yes', 'y', '是'].includes(String(v ?? '').trim().toLowerCase()) ? 1 : 0;
}

// 手动上传 Excel 模板：字段顺序与问题系统导出的“问题列表”完全一致。
const IMPORT_COLUMNS = [
  { key: 'round', title: '问题轮次' },
  { key: 'urgency', title: '问题紧急程度' },
  { key: 'handling_method', title: '问题处理方式' },
  { key: 'version_codes', title: '版本编号' },
  { key: 'business_group', title: '所属实施机构' },
  { key: 'module', title: '所属板块' },
  { key: 'system', title: '所属系统' },
  { key: 'issue_code', title: '问题编号' },
  { key: 'work_order_no', title: '工单编号' },
  { key: 'create_time', title: '提出时间' },
  { key: 'plan_resolve_time', title: '计划解决时间' },
  { key: 'status', title: '状态' },
  { key: 'category', title: '分类' },
  { key: 'detailed_classification', title: '详细分类' },
  { key: 'summary', title: '问题概述' },
  { key: 'details', title: '问题详情' },
  { key: 'analysis_log', title: '分析修改记录' },
  { key: 'tracker_name', title: '跟踪人' },
  { key: 'tracker_org', title: '跟踪人机构' },
  { key: 'tracker_contact', title: '跟踪人联系方式' },
  { key: 'reporter_name', title: '报障人' },
  { key: 'reporter_org', title: '报障人机构' },
  { key: 'reporter_contact', title: '报障人联系方式' },
  { key: 'handler_name', title: '处理人' },
  { key: 'handler_org', title: '处理机构' },
  { key: 'handler_contact', title: '处理人联系方式' },
  { key: 'linked_case_code', title: '关联案例编号' },
  { key: 'linked_case_name', title: '关联案例名称' },
  { key: 'is_major', title: '是否重大问题' },
  { key: 'is_common', title: '是否常见问题' },
  { key: 'root_cause', title: '问题原因分析' },
  { key: 'solution', title: '解决方案' },
  { key: 'release_status', title: '发版情况' },
];

const IMPORT_FIELD_KEYS = IMPORT_COLUMNS.map((column) => column.key);
const IMPORT_TITLE_BY_KEY = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column.title]));

/** Excel 的日期/数字单元格统一转为便于数据库存储和页面展示的文本。 */
function importText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}${value.getHours() || value.getMinutes() || value.getSeconds() ? ` ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}` : ''}`;
  }
  return String(value).trim();
}

/** 将模板中的自由文本记录转换为详情页可展示的时间线数据。 */
function importAnalysisLog(value) {
  const text = importText(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    return JSON.stringify([{ content: text }]);
  }
}

/** 将模板行规范为 issue 表字段。 */
function normalizeImportRow(row) {
  const item = {};
  for (const key of IMPORT_FIELD_KEYS) {
    if (key === 'is_major' || key === 'is_common') item[key] = toBit(row[key]);
    else if (key === 'analysis_log') item[key] = importAnalysisLog(row[key]);
    else item[key] = importText(row[key]);
  }
  return item;
}

function importValueForDisplay(key, value) {
  if (key === 'is_major' || key === 'is_common') return value ? '是' : '否';
  if (key === 'analysis_log') {
    const parsed = parseJsonArray(value);
    return parsed.map((entry) => entry?.content || '').filter(Boolean).join('\n');
  }
  return importText(value);
}


export default async function issueRoutes(fastify) {
  // 列表
  fastify.post('/issues/list', { preHandler: fastify.requirePerm('issue', 'view') }, async (request) => {
    const result = await listQuery({
      table: 'issue', columns: COLUMNS, searchColumns: SEARCH,
      query: request.body || {},
    });
    return ok(result);
  });

  // 清空全部问题数据
  fastify.delete('/issues', { preHandler: fastify.requirePerm('issue', 'delete') }, async () => {
    if (getIssueSyncState().running) throw badRequest('后台同步正在进行中，请等待完成后再清空');
    const before = (await get('SELECT COUNT(*) AS c FROM issue'))?.c ?? 0;
    await tx(async () => {
      await run('DELETE FROM issue');
      if (isSqlite()) await run("DELETE FROM sqlite_sequence WHERE name = 'issue'");
    });
    resetIssueSyncState();
    return ok({ deleted: before }, '已清空问题数据');
  });

  // 详情
  fastify.get('/issues/:id', { preHandler: fastify.requirePerm('issue', 'view') }, async (request) => {
    const row = await get('SELECT * FROM issue WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok(decode(row));
  });

  // 手动上传问题模板：字段与外部问题列表导出保持一致。
  fastify.get('/issues/template', { preHandler: fastify.requirePerm('issue', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IMPORT_COLUMNS, [], '问题导入模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=issues_template.xlsx');
    return reply.send(buf);
  });

  // 手动上传问题：以问题编号为唯一键，支持覆盖更新、重复跳过和出错回滚。
  fastify.post('/issues/import', { preHandler: fastify.requirePerm('issue', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'overwrite';
    if (!['overwrite', 'skip', 'rollback'].includes(mode)) throw badRequest('不支持的数据冲突处理模式');

    const rows = await parseXlsx(await data.toBuffer(), IMPORT_COLUMNS);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];
    const apply = async () => {
      for (const sourceRow of rows) {
        const rowNum = sourceRow.__rowNum__;
        const row = normalizeImportRow(sourceRow);
        const issueCode = row.issue_code;
        try {
          if (!issueCode) throw new Error('问题编号不能为空');

          const existing = await get('SELECT * FROM issue WHERE issue_code = ?', issueCode);
          if (existing && mode === 'skip') {
            stat.skipped++;
            details.push({ key: issueCode, title: row.summary || existing.summary || '问题', action: 'skip', status: 'success', __rowNum__: rowNum });
            continue;
          }

          if (existing) {
            const changes = IMPORT_FIELD_KEYS
              .filter((key) => importValueForDisplay(key, existing[key]) !== importValueForDisplay(key, row[key]))
              .map((key) => ({
                field: IMPORT_TITLE_BY_KEY[key],
                old: importValueForDisplay(key, existing[key]),
                new: importValueForDisplay(key, row[key]),
              }));
            await run(
              `UPDATE issue SET ${IMPORT_FIELD_KEYS.map((key) => `${key}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE issue_code=?`,
              ...IMPORT_FIELD_KEYS.map((key) => row[key]), issueCode,
            );
            stat.updated++;
            details.push({ key: issueCode, title: row.summary || existing.summary || '问题', action: 'update', status: 'success', __rowNum__: rowNum, changes });
          } else {
            await run(
              `INSERT INTO issue (${IMPORT_FIELD_KEYS.join(',')}) VALUES (${IMPORT_FIELD_KEYS.map(() => '?').join(',')})`,
              ...IMPORT_FIELD_KEYS.map((key) => row[key]),
            );
            stat.inserted++;
            details.push({ key: issueCode, title: row.summary || '问题', action: 'insert', status: 'success', __rowNum__: rowNum });
          }
        } catch (err) {
          stat.failed++;
          details.push({
            key: issueCode || '未知项',
            title: row.summary || '空概述',
            status: 'fail',
            __rowNum__: rowNum,
            error: err.message || '导入失败',
          });
          if (mode === 'rollback') throw err;
        }
      }
    };

    if (mode === 'rollback') {
      try {
        await tx(apply);
      } catch {
        for (const item of details) if (item.status === 'success') item.action = 'skip';
        stat.inserted = 0;
        stat.updated = 0;
      }
    } else {
      await apply();
    }

    return ok({ stat, details }, '导入完成');
  });

  // 同步问题：拉取外部概述列表，按 issue_code upsert
  fastify.post('/issues/sync', { preHandler: fastify.requirePerm('issue', 'sync') }, async () => {
    return ok(await syncIssueOverview(), '同步问题完成');
  });

  // 同步问题详情：逐条按问题编号拉取明细并更新整条记录
  // body 可传 { codes: [...] } 指定范围，缺省则同步库内全部问题
  fastify.post('/issues/sync-detail', { preHandler: fastify.requirePerm('issue', 'sync') }, async (request) => {
    const result = await syncIssueDetails(request.body?.codes);
    if (!result.total) throw badRequest('暂无可同步的问题，请先点击「同步问题」');
    return ok(result, '同步问题详情完成');
  });

  // 启动后台同步：立即返回，任务在后台以每秒一条的速度执行
  fastify.post('/issues/sync-detail-bg', { preHandler: fastify.requirePerm('issue', 'sync') }, async (request) => {
    const result = await startIssueDetailSync(request.body?.codes);
    if (result.empty) throw badRequest('暂无可同步的问题，请先点击「同步问题」');
    return ok(result, result.started ? '后台同步已启动' : '后台同步已在运行中');
  });

  // 查询后台同步状态
  fastify.get('/issues/sync-detail-status', { preHandler: fastify.requirePerm('issue', 'view') }, async () => {
    return ok(getIssueSyncState());
  });
}
