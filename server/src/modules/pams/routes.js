/**
 * 文件：modules/pams/routes.js
 * 用途：PAMS 问题管理子系统基础接口。提供独立库健康检查、字典、AI 设置、
 *       RADAR 角色映射和 PAMS 权限配置，为逐页迁移做底座。
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { all as radarAll } from '../../db/index.js';
import { config } from '../../config.js';
import { pamsAll, pamsGet, pamsRun, pamsTx } from '../../db/pams.js';
import { ok, badRequest, notFound } from '../../lib/http.js';

const DICT_COLUMNS = [
  'dict_id', 'dict_code', 'item_key', 'item_value', 'sort_order',
  'description', 'is_system', 'is_default_val', 'created_at',
];

const ISSUE_LIST_COLUMNS = [
  'issue_id', 'create_time', 'status', 'category', 'summary', 'details',
  'tracker_name', 'tracker_org', 'tracker_contact', 'reporter_name', 'reporter_org',
  'reporter_contact', 'handler_name', 'handler_org', 'handler_contact', 'module',
  'system', 'business_group', 'is_major', 'is_common', 'root_cause', 'solution',
  'plan_fix_time', 'resolve_time', 'detailed_classification', 'round', 'tags', 'urgency', 'handling_method',
  'version_number', 'release_status', 'work_order_no',
];

const ISSUE_UPDATE_COLUMNS = new Set([
  'status', 'category', 'summary', 'details', 'attachments', 'analysis_log',
  'tracker_name', 'tracker_org', 'tracker_contact', 'reporter_name', 'reporter_org',
  'reporter_contact', 'handler_name', 'handler_org', 'handler_contact', 'linked_cases',
  'module', 'system', 'business_group', 'is_major', 'is_common', 'root_cause', 'solution',
  'plan_fix_time', 'resolve_time', 'detailed_classification', 'round', 'tags', 'urgency',
  'handling_method', 'version_number', 'release_status', 'work_order_no',
]);

const DIMENSIONS = new Set([
  'status', 'category', 'detailed_classification', 'urgency', 'handling_method',
  'business_group', 'module', 'system', 'round', 'created_at_day', 'plan_fix_time_day',
  'category_group',
]);

function fieldExpr(dim) {
  if (dim === 'created_at_day') return 'substr(create_time, 1, 10)';
  if (dim === 'plan_fix_time_day') return 'substr(plan_fix_time, 1, 10)';
  if (dim === 'category_group') {
    return `CASE
      WHEN category IN ('农信技术', '农信业务') THEN '农信'
      WHEN category IN ('金科技术', '金科业务') THEN '金科'
      WHEN category = '新增需求' THEN '需求'
      ELSE '其它'
    END`;
  }
  return dim;
}

function buildIssueWhere(filters = {}) {
  const conditions = [];
  const params = [];
  const addInCondition = (field, rawValue) => {
    const values = Array.isArray(rawValue) ? rawValue.filter(Boolean) : String(rawValue).split(',').filter(Boolean);
    if (!values.length) return;
    conditions.push(`${field} IN (${values.map(() => '?').join(',')})`);
    params.push(...values);
  };

  for (const [key, value] of Object.entries(filters || {})) {
    if (value === undefined || value === null || value === '' || value === '__ALL__') continue;
    if (Array.isArray(value) && (value.length === 0 || value.includes('__ALL__'))) continue;

    if (key === 'keyword') {
      conditions.push('(issue_id LIKE ? OR summary LIKE ? OR details LIKE ? OR system LIKE ?)');
      const like = `%${value}%`;
      params.push(like, like, like, like);
      continue;
    }
    if (key === 'q') {
      conditions.push('(summary LIKE ? OR details LIKE ? OR analysis_log LIKE ?)');
      const like = `%${value}%`;
      params.push(like, like, like);
      continue;
    }
    if (key === 'issue_id_or_no') {
      conditions.push('(issue_id LIKE ? OR work_order_no LIKE ?)');
      const like = `%${value}%`;
      params.push(like, like);
      continue;
    }
    if (key === 'my_issues_contact') {
      conditions.push('(tracker_contact = ? OR reporter_contact = ? OR handler_contact = ?)');
      params.push(value, value, value);
      continue;
    }
    if (key === 'my_issues_user') {
      conditions.push('(tracker_name = ? OR handler_name = ?)');
      params.push(value, value);
      continue;
    }
    if (['summary', 'tracker_name', 'reporter_name', 'handler_name', 'issue_id', 'work_order_no'].includes(key)) {
      conditions.push(`${key} LIKE ?`);
      params.push(`%${value}%`);
      continue;
    }
    if (['tracker_contact', 'reporter_contact', 'handler_contact'].includes(key)) {
      conditions.push(`${key} = ?`);
      params.push(value);
      continue;
    }
    if (key === 'plan_fix_time') {
      const values = Array.isArray(value) ? value.filter(Boolean) : String(value).split(',').filter(Boolean);
      if (values.length === 1) {
        conditions.push('substr(plan_fix_time, 1, 10) = ?');
        params.push(values[0]);
      } else if (values.length > 1) {
        conditions.push(`substr(plan_fix_time, 1, 10) IN (${values.map(() => '?').join(',')})`);
        params.push(...values);
      }
      continue;
    }
    if (key === 'version_number' || key === 'release_status') {
      const values = Array.isArray(value) ? value.filter(Boolean) : String(value).split(',').filter(Boolean);
      if (!values.length) continue;
      const hasBlank = values.includes('未填写');
      const realValues = values.filter((item) => item !== '未填写');
      const parts = [];
      if (hasBlank) parts.push(`(${key} IS NULL OR ${key} = '')`);
      if (realValues.length) {
        if (key === 'version_number') {
          parts.push(...realValues.map(() => `${key} LIKE ?`));
          params.push(...realValues.map((item) => `%${item}%`));
        } else {
          parts.push(`${key} IN (${realValues.map(() => '?').join(',')})`);
          params.push(...realValues);
        }
      }
      if (parts.length) conditions.push(`(${parts.join(' OR ')})`);
      continue;
    }
    if (key === 'is_major') {
      conditions.push('is_major = ?');
      params.push(value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0);
      continue;
    }
    const isNot = key.endsWith('_not');
    const dimKey = isNot ? key.slice(0, -4) : key;
    if (!DIMENSIONS.has(dimKey)) continue;
    const expr = fieldExpr(dimKey);
    const values = Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
    if (isNot) {
      conditions.push(`${expr} NOT IN (${values.map(() => '?').join(',')})`);
      params.push(...values);
      continue;
    }
    if (Array.isArray(value)) {
      if ((key === 'created_at_day' || key === 'plan_fix_time_day') && value.length === 2) {
        conditions.push(`${expr} BETWEEN ? AND ?`);
        params.push(value[0], value[1]);
      } else {
        addInCondition(expr, value);
      }
    } else {
      addInCondition(expr, value);
    }
  }
  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function statusFilterWhere(statusFilter) {
  if (!statusFilter || statusFilter === 'all') return { sql: '', params: [] };
  if (statusFilter === 'resolved') return { sql: " AND status = '已解决'", params: [] };
  if (statusFilter === 'unresolved') return { sql: " AND status != '已解决'", params: [] };
  const values = Array.isArray(statusFilter) ? statusFilter.filter(Boolean) : String(statusFilter).split(',').filter(Boolean);
  if (!values.length) return { sql: '', params: [] };
  return { sql: ` AND status IN (${values.map(() => '?').join(',')})`, params: values };
}

function extraFilterSql(round, businessGroup) {
  const sql = [];
  const params = [];
  const addIn = (field, value) => {
    if (!value) return;
    const vals = Array.isArray(value) ? value.filter(Boolean) : String(value).split(',').filter(Boolean);
    if (!vals.length) return;
    sql.push(` AND ${field} IN (${vals.map(() => '?').join(',')})`);
    params.push(...vals);
  };
  addIn('round', round);
  addIn('business_group', businessGroup);
  return { sql: sql.join(''), params };
}

function distribution(field, statusSql, baseSql, params) {
  return pamsAll(
    `SELECT COALESCE(${fieldExpr(field)}, '未分配') AS name, COUNT(*) AS value
       FROM biz_issue
      WHERE 1=1 ${statusSql} ${baseSql}
      GROUP BY name
      ORDER BY value DESC`,
    ...params,
  );
}

function decodeIssue(row) {
  if (!row) return row;
  const out = { ...row };
  for (const key of ['attachments', 'analysis_log', 'linked_cases', 'tags']) {
    out[key] = parseJson(row[key], []);
  }
  out.is_major = !!row.is_major;
  out.is_common = !!row.is_common;
  return out;
}

function issueFieldValue(key, value) {
  if (['attachments', 'analysis_log', 'linked_cases', 'tags'].includes(key)) {
    return JSON.stringify(Array.isArray(value) ? value : []);
  }
  if (['is_major', 'is_common'].includes(key)) return value ? 1 : 0;
  return value ?? null;
}

function operatorName(request, fallback = '未知用户') {
  return request.currentUser?.name || request.currentUser?.phone || fallback;
}

function addIssueHistory(issueId, operator, content) {
  pamsRun(
    'INSERT INTO biz_issue_history (issue_id, operator_name, operation_time, content) VALUES (?,?,?,?)',
    issueId,
    operator,
    localTimeString(),
    content,
  );
}

function localTimeString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function defaultDictValue(code, fallback) {
  return pamsGet(
    'SELECT item_key FROM sys_dict WHERE dict_code = ? AND is_default_val = 1 ORDER BY sort_order, dict_id LIMIT 1',
    code,
  )?.item_key || fallback;
}

function generatePamsIssueId() {
  const now = localTimeString();
  const YYYY = now.slice(0, 4);
  const YY = YYYY.slice(2);
  const MM = now.slice(5, 7);
  const DD = now.slice(8, 10);
  let template = pamsGet(
    "SELECT setting_value FROM sys_ai_settings WHERE setting_key = 'issue_id_template'",
  )?.setting_value || 'NX{YYYY}{MM}{DD}{SEQ3}';
  template = template || 'NX{YYYY}{MM}{DD}{SEQ3}';

  const withDate = template
    .replaceAll('{YYYY}', YYYY)
    .replaceAll('{YY}', YY)
    .replaceAll('{MM}', MM)
    .replaceAll('{DD}', DD);
  const seqMatch = withDate.match(/{SEQ(\d+)}/);
  const seqLen = seqMatch ? Number(seqMatch[1]) : 3;
  const seqToken = seqMatch ? seqMatch[0] : '{SEQ3}';
  const prefix = seqMatch ? withDate.split(seqToken)[0] : withDate;
  const last = pamsGet(
    'SELECT issue_id FROM biz_issue WHERE issue_id LIKE ? ORDER BY issue_id DESC LIMIT 1',
    `${prefix}%`,
  )?.issue_id;
  let seq = 1;
  if (last) {
    const n = Number.parseInt(String(last).slice(prefix.length, prefix.length + seqLen), 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return withDate.replace(/{SEQ\d+}/, String(seq).padStart(seqLen, '0'));
}

function computeStats({ statusFilter = 'all', round, businessGroup, boardColDim, boardRowDim }) {
  const status = statusFilterWhere(statusFilter);
  const extra = extraFilterSql(round, businessGroup);
  const params = [...status.params, ...extra.params];

  const totalCount = pamsGet(`SELECT COUNT(*) AS c FROM biz_issue WHERE 1=1 ${status.sql} ${extra.sql}`, ...params)?.c || 0;
  const resolvedCount = pamsGet(`SELECT COUNT(*) AS c FROM biz_issue WHERE status = '已解决' ${extra.sql}`, ...extra.params)?.c || 0;
  const pendingCount = pamsGet(`SELECT COUNT(*) AS c FROM biz_issue WHERE status != '已解决' ${extra.sql}`, ...extra.params)?.c || 0;
  const majorCount = pamsGet(`SELECT COUNT(*) AS c FROM biz_issue WHERE is_major = 1 ${status.sql} ${extra.sql}`, ...params)?.c || 0;

  const categoryGroupRows = pamsAll(
    `SELECT ${fieldExpr('category_group')} AS category_group,
            COUNT(*) AS total,
            SUM(CASE WHEN status = '已解决' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status != '已解决' THEN 1 ELSE 0 END) AS unresolved
       FROM biz_issue
      WHERE 1=1 ${extra.sql}
      GROUP BY category_group`,
    ...extra.params,
  );
  const categoryGroups = {
    金科: { total: 0, resolved: 0, unresolved: 0 },
    农信: { total: 0, resolved: 0, unresolved: 0 },
    需求: { total: 0, resolved: 0, unresolved: 0 },
    其它: { total: 0, resolved: 0, unresolved: 0 },
  };
  for (const row of categoryGroupRows) {
    if (categoryGroups[row.category_group]) {
      categoryGroups[row.category_group] = {
        total: row.total || 0,
        resolved: row.resolved || 0,
        unresolved: row.unresolved || 0,
      };
    }
  }

  const categoryGroupByStatus = pamsAll(
    `SELECT ${fieldExpr('category_group')} AS category_group,
            COALESCE(status, '提出') AS status,
            COUNT(*) AS count
       FROM biz_issue
      WHERE 1=1 ${extra.sql}
      GROUP BY category_group, status`,
    ...extra.params,
  );

  let boardPivot = [];
  if (boardColDim && boardRowDim && DIMENSIONS.has(boardColDim) && DIMENSIONS.has(boardRowDim)) {
    boardPivot = pamsAll(
      `SELECT COALESCE(${fieldExpr(boardColDim)}, '未分配') AS colVal,
              COALESCE(${fieldExpr(boardRowDim)}, '未分配') AS rowVal,
              COUNT(*) AS count
         FROM biz_issue
        WHERE 1=1 ${extra.sql}
        GROUP BY colVal, rowVal`,
      ...extra.params,
    );
  }

  const statusParams = [...status.params, ...extra.params];
  return {
    total: totalCount,
    pending: pendingCount,
    resolved: resolvedCount,
    major: majorCount,
    categoryGroups,
    categoryGroupByStatus,
    byCategoryGroup: pamsAll(
      `SELECT ${fieldExpr('category_group')} AS name, COUNT(*) AS value
         FROM biz_issue
        WHERE 1=1 ${status.sql} ${extra.sql}
        GROUP BY name ORDER BY value DESC`,
      ...statusParams,
    ),
    byJinkeDetailedClass: pamsAll(
      `SELECT COALESCE(detailed_classification, '未分类') AS name, COUNT(*) AS value
         FROM biz_issue
        WHERE category = '金科技术' ${status.sql} ${extra.sql}
        GROUP BY name ORDER BY value DESC`,
      ...statusParams,
    ),
    byNongxinDetailedClass: pamsAll(
      `SELECT COALESCE(detailed_classification, '未分类') AS name, COUNT(*) AS value
         FROM biz_issue
        WHERE category IN ('农信技术', '农信业务') ${status.sql} ${extra.sql}
        GROUP BY name ORDER BY value DESC`,
      ...statusParams,
    ),
    byCombinedDetailedClass: pamsAll(
      `SELECT REPLACE(REPLACE(COALESCE(detailed_classification, '未分类'), '金科-', ''), '农信-', '') AS name,
              COUNT(*) AS value
         FROM biz_issue
        WHERE 1=1 ${status.sql} ${extra.sql}
        GROUP BY name ORDER BY value DESC`,
      ...statusParams,
    ),
    byStatus: distribution('status', '', extra.sql, extra.params),
    byCategory: distribution('category', status.sql, extra.sql, statusParams),
    byUrgency: distribution('urgency', status.sql, extra.sql, statusParams),
    byHandlingMethod: distribution('handling_method', status.sql, extra.sql, statusParams),
    byBusinessGroup: distribution('business_group', status.sql, extra.sql, statusParams),
    byModule: distribution('module', status.sql, extra.sql, statusParams),
    bySystem: distribution('system', status.sql, extra.sql, statusParams),
    byRound: distribution('round', status.sql, extra.sql, statusParams),
    boardPivot,
  };
}

function normalizeCountRow(row = {}) {
  return {
    total: Number(row.total || 0),
    resolved: Number(row.resolved || 0),
    analysis: Number(row.analysis || 0),
    verifying: Number(row.verifying || 0),
    major: Number(row.major || 0),
  };
}

function reportStatusExpr(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `
    COUNT(*) AS total,
    SUM(CASE WHEN ${p}status = '已解决' THEN 1 ELSE 0 END) AS resolved,
    SUM(CASE WHEN ${p}status IN ('提出', '已查明原因', '处理中', '重现') THEN 1 ELSE 0 END) AS analysis,
    SUM(CASE WHEN ${p}status IN ('待验证', '下轮验证') THEN 1 ELSE 0 END) AS verifying,
    SUM(CASE WHEN ${p}is_major = 1 THEN 1 ELSE 0 END) AS major
  `;
}

function categoryStats(categoryGroup, round) {
  if (!['jinke', 'nongxin', 'other'].includes(categoryGroup)) throw badRequest('无效的分类组参数');
  const roundSql = round ? ' AND i.round = ?' : '';
  const roundSqlNoAlias = round ? ' AND round = ?' : '';
  const params = round ? [round] : [];

  if (categoryGroup === 'jinke' || categoryGroup === 'nongxin') {
    const categories = categoryGroup === 'jinke'
      ? ['金科技术', '金科业务']
      : ['农信技术', '农信业务'];
    const items = pamsAll(
      `SELECT COALESCE(d.item_value, i.business_group, '未分配') AS group_name,
              ${reportStatusExpr('i')}
         FROM biz_issue i
         LEFT JOIN sys_dict d ON d.dict_code = 'business_group' AND d.item_key = i.business_group
        WHERE i.category IN (${categories.map(() => '?').join(',')}) ${roundSql}
        GROUP BY group_name
       HAVING total > 0
        ORDER BY total DESC`,
      ...categories,
      ...params,
    ).map((row) => ({ group_name: row.group_name, ...normalizeCountRow(row) }));
    const summary = normalizeCountRow(pamsGet(
      `SELECT ${reportStatusExpr()}
         FROM biz_issue
        WHERE category IN (${categories.map(() => '?').join(',')}) ${roundSqlNoAlias}`,
      ...categories,
      ...params,
    ));
    return { items, summary };
  }

  const excluded = ['金科技术', '金科业务', '农信技术', '农信业务'];
  const rawItems = pamsAll(
    `SELECT COALESCE(cd.item_value, i.category, '未分类') AS category_name,
            COALESCE(i.category, '未分类') AS category_key,
            COALESCE(bd.item_value, i.business_group, '未分配') AS group_name,
            ${reportStatusExpr('i')}
       FROM biz_issue i
       LEFT JOIN sys_dict cd ON cd.dict_code = 'issue_category' AND cd.item_key = i.category
       LEFT JOIN sys_dict bd ON bd.dict_code = 'business_group' AND bd.item_key = i.business_group
      WHERE (i.category NOT IN (${excluded.map(() => '?').join(',')}) OR i.category IS NULL) ${roundSql}
      GROUP BY category_name, category_key, group_name
     HAVING total > 0
      ORDER BY category_name, total DESC`,
    ...excluded,
    ...params,
  );
  const categoryMap = new Map();
  for (const row of rawItems) {
    if (!categoryMap.has(row.category_name)) {
      categoryMap.set(row.category_name, {
        category_name: row.category_name,
        category_key: row.category_key,
        items: [],
        summary: { total: 0, resolved: 0, analysis: 0, verifying: 0, major: 0 },
      });
    }
    const cat = categoryMap.get(row.category_name);
    const counts = normalizeCountRow(row);
    cat.items.push({ group_name: row.group_name, ...counts });
    for (const key of Object.keys(cat.summary)) cat.summary[key] += counts[key];
  }
  const summary = normalizeCountRow(pamsGet(
    `SELECT ${reportStatusExpr()}
       FROM biz_issue
      WHERE (category NOT IN (${excluded.map(() => '?').join(',')}) OR category IS NULL) ${roundSqlNoAlias}`,
    ...excluded,
    ...params,
  ));
  return { type: 'grouped', categories: [...categoryMap.values()], summary };
}

function issuesForReportFilters(body = {}, pendingOnly = false) {
  const filters = {};
  if (body.business_group?.length) filters.business_group = body.business_group;
  if (body.round) filters.round = body.round;
  if (body.rounds?.length) filters.round = body.rounds;
  if (body.business_groups?.length) filters.business_group = body.business_groups;
  if (body.status?.length) filters.status = body.status;
  if (pendingOnly) filters.status_not = '已解决';
  const { where, params } = buildIssueWhere(filters);
  return pamsAll(
    `SELECT ${ISSUE_LIST_COLUMNS.join(',')}
       FROM biz_issue
       ${where}
      ORDER BY create_time DESC, issue_id DESC
      LIMIT 10000`,
    ...params,
  ).map(decodeIssue);
}

function reportStatsFromIssues(issues) {
  return {
    total: issues.length,
    resolved: issues.filter((item) => item.status === '已解决').length,
    pending: issues.filter((item) => item.status !== '已解决').length,
  };
}

function dictValueMap(code) {
  return Object.fromEntries(pamsAll('SELECT item_key, item_value FROM sys_dict WHERE dict_code = ?', code).map((row) => [row.item_key, row.item_value]));
}

function issueBrief(issue) {
  const source = [issue.summary, issue.root_cause || issue.cause_analysis, issue.solution || issue.details]
    .filter(Boolean)
    .join('，')
    .replace(/\s+/g, ' ')
    .replace(/<[^>]+>/g, '');
  return source.slice(0, 90) || '暂无问题描述';
}

function generateProblemReport(body = {}) {
  const totalIssues = issuesForReportFilters(body, false);
  const pendingIssues = totalIssues.filter((item) => item.status !== '已解决');
  const systemMap = dictValueMap('system');
  const bgMap = dictValueMap('business_group');

  const jinkeMain = pendingIssues.filter((item) => ['金科技术', '金科业务'].includes(item.category) && item.detailed_classification !== '金科-迁移版本');
  const nongxinMain = pendingIssues.filter((item) => ['农信技术', '农信业务'].includes(item.category) && item.detailed_classification !== '农信-迁移版本');
  const jinkeMig = pendingIssues.filter((item) => ['金科技术', '金科业务'].includes(item.category) && item.detailed_classification === '金科-迁移版本');
  const nongxinMig = pendingIssues.filter((item) => ['农信技术', '农信业务'].includes(item.category) && item.detailed_classification === '农信-迁移版本');
  const analyzing = totalIssues.filter((item) => ['提出', '已查明原因', '处理中', '重现'].includes(item.status));
  const verifying = totalIssues.filter((item) => ['待验证', '下轮验证'].includes(item.status));

  const jinkeAnalyzing = analyzing.filter((item) => ['金科技术', '金科业务'].includes(item.category));
  const nongxinAnalyzing = analyzing.filter((item) => ['农信技术', '农信业务'].includes(item.category));
  const byBg = {};
  for (const item of jinkeAnalyzing) {
    const name = bgMap[item.business_group] || item.business_group || '未分配';
    byBg[name] = (byBg[name] || 0) + 1;
  }
  const bgText = Object.entries(byBg).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}${count}个`).join('，');
  const header = `【问题快报】截至${localTimeString().slice(5, 16).replace('-', '月').replace(' ', '日 ')}，共收集问题${totalIssues.length}个。已解决${totalIssues.filter((item) => item.status === '已解决').length}个，处理中${analyzing.length}个，待验证${verifying.length}个。其中金科处理中${jinkeAnalyzing.length}个${bgText ? `（${bgText}）` : ''}，农信处理中${nongxinAnalyzing.length}个。`;

  const formatLines = (issues) => issues.slice(0, 200).map((item) => {
    const systemName = systemMap[item.system] || item.system || '未知系统';
    return `${item.issue_id}-${systemName}-${issueBrief(item)}`;
  });
  const sections = [header];
  if (jinkeMain.length) sections.push(`【金科主要问题】\n${formatLines(jinkeMain).join('\n')}`);
  if (nongxinMain.length) sections.push(`【农信主要问题】\n${formatLines(nongxinMain).join('\n')}`);
  if (jinkeMig.length) sections.push(`【金科迁移问题】\n${formatLines(jinkeMig).join('\n')}`);
  if (nongxinMig.length) sections.push(`【农信迁移问题】\n${formatLines(nongxinMig).join('\n')}`);
  return { report: sections.join('\n'), stats: reportStatsFromIssues(totalIssues) };
}

function quickDailyTimeString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generateQuickDaily(round) {
  let selectedRoundId = round;
  const roundDicts = pamsAll("SELECT item_key, item_value FROM sys_dict WHERE dict_code = 'issue_round'");
  const bgDicts = pamsAll("SELECT item_key, item_value FROM sys_dict WHERE dict_code = 'business_group'");
  const roundMap = new Map(roundDicts.map((item) => [item.item_key, item.item_value]));
  const bgMap = new Map(bgDicts.map((item) => [item.item_key, item.item_value]));

  const shortenBgName = (name) => {
    if (!name) return '其它';
    return String(name).replace(/事业(部|群)/g, '');
  };

  if (selectedRoundId) {
    const matched = [...roundMap.entries()].find(([, value]) => value === selectedRoundId);
    if (matched) selectedRoundId = matched[0];
  }

  const issues = pamsAll(
    'SELECT round, status, category, business_group, detailed_classification, handling_method FROM biz_issue',
  );
  const timeStr = quickDailyTimeString();

  const BT_CATEGORIES = ['金科技术', '农信业务', '农信技术'];
  const OPERATION_UNDERSTANDING = ['金科-操作理解', '农信-操作理解', '工单操作理解'];
  const REQ_CONF_METHODS = ['待解释沟通', '待农信采购', '待业务细化'];
  const BIZ_VAL_METHODS = ['待业务测试', '待业务验证后关单'];
  const CATEGORY_ORDER = [
    '业务技术问题',
    '工单急迫需求',
    '延后承诺需求',
    '工单阻塞问题',
    '其它优化需求',
    '操作理解问题',
  ];

  const getIssueCategory = (issue) => {
    const catName = issue.category || '未分类';
    const detailedCat = issue.detailed_classification || '未分类';

    if (OPERATION_UNDERSTANDING.includes(detailedCat)) return '操作理解问题';
    if (BT_CATEGORIES.includes(catName) && !OPERATION_UNDERSTANDING.includes(detailedCat)) return '业务技术问题';
    if (catName === '工单问题' && detailedCat === '工单急迫需求') return '工单急迫需求';
    if (catName === '延后需求' && detailedCat === '延后承诺需求') return '延后承诺需求';
    if (catName === '工单问题' && detailedCat === '工单阻塞问题') return '工单阻塞问题';
    if ((catName === '工单问题' && detailedCat === '工单优化需求') || (catName === '新增需求' && detailedCat === '新增需求')) {
      return '其它优化需求';
    }
    return '其它';
  };

  const createCatStats = () => ({
    total: 0,
    resolved: 0,
    analysis: 0,
    verifying: 0,
    jinkeBgStats: {},
    nongxinBgStats: 0,
    bgStats: {},
    devImplCount: 0,
    reqConfCount: 0,
    bizValCount: 0,
    devImplBgStats: {},
  });

  const calculateDetailedStats = (filterFn) => {
    const stats = {};
    for (const category of CATEGORY_ORDER) stats[category] = createCatStats();
    stats['其它'] = createCatStats();

    const overall = { total: 0, resolved: 0, analysis: 0, verifying: 0 };

    for (const issue of issues) {
      const roundName = roundMap.get(issue.round) || '';
      if (!filterFn(issue, roundName)) continue;

      overall.total += 1;
      const isResolved = issue.status === '已解决';
      const isAnalysis = ['提出', '已查明原因', '处理中', '重现'].includes(issue.status);
      const isVerifying = ['待验证', '下轮验证'].includes(issue.status);

      if (isResolved) overall.resolved += 1;
      else if (isAnalysis) overall.analysis += 1;
      else if (isVerifying) overall.verifying += 1;

      const category = getIssueCategory(issue);
      const targetStats = stats[category];
      targetStats.total += 1;

      if (isResolved) {
        targetStats.resolved += 1;
      } else if (isAnalysis) {
        targetStats.analysis += 1;
        const bgDisplay = bgMap.get(issue.business_group) || issue.business_group || '其它';
        const shortBg = shortenBgName(bgDisplay);
        const method = issue.handling_method || '其它';
        let handlingType = '开发实施';
        if (REQ_CONF_METHODS.includes(method)) handlingType = '需求确认';
        else if (BIZ_VAL_METHODS.includes(method)) handlingType = '业务验证';

        if (handlingType === '开发实施') {
          targetStats.devImplCount += 1;
          targetStats.devImplBgStats[shortBg] = (targetStats.devImplBgStats[shortBg] || 0) + 1;
        } else if (handlingType === '需求确认') {
          targetStats.reqConfCount += 1;
        } else if (handlingType === '业务验证') {
          targetStats.bizValCount += 1;
        }

        if (category === '业务技术问题') {
          const isNongxin = issue.category?.startsWith('农信');
          if (isNongxin) {
            targetStats.nongxinBgStats += 1;
          } else {
            targetStats.jinkeBgStats[shortBg] = (targetStats.jinkeBgStats[shortBg] || 0) + 1;
          }
        } else {
          targetStats.bgStats[shortBg] = (targetStats.bgStats[shortBg] || 0) + 1;
        }
      } else if (isVerifying) {
        targetStats.verifying += 1;
      }
    }

    return { overall, detailed: stats };
  };

  const formatBgStats = (bgStats) => {
    const entries = Object.entries(bgStats).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return '';
    return entries.map(([name, count]) => `${name}${count}个`).join('，');
  };

  const formatCategoryLine = (label, catStats) => {
    if (catStats.total === 0) return '';
    const stateParts = [];
    if (catStats.resolved > 0) stateParts.push(`已解决${catStats.resolved}个`);
    if (catStats.verifying > 0) stateParts.push(`待验证${catStats.verifying}个`);
    if (catStats.analysis > 0) stateParts.push(`处理中${catStats.analysis}个`);

    const stateStr = stateParts.join('，');
    let line = `${label}：${catStats.total}个。${stateStr ? `${stateStr}。` : ''}`;

    if (label !== '操作理解问题' && catStats.analysis > 0) {
      const details = [];
      if (catStats.devImplCount > 0) {
        const bgStr = formatBgStats(catStats.devImplBgStats);
        details.push(`开发实施${catStats.devImplCount}个${bgStr ? `（${bgStr}）` : ''}`);
      }
      if (catStats.reqConfCount > 0) details.push(`需求确认${catStats.reqConfCount}个`);
      if (catStats.bizValCount > 0) details.push(`业务验证${catStats.bizValCount}个`);
      if (details.length > 0) line += `其中${details.join('，')}。`;
    }
    return line;
  };

  const generateSection = (label, data, detailed = false) => {
    const { overall, detailed: stats } = data;
    if (overall.total === 0) return '';

    const stateParts = [];
    if (overall.resolved > 0) stateParts.push(`已解决${overall.resolved}个`);
    if (overall.verifying > 0) stateParts.push(`待验证${overall.verifying}个`);
    if (overall.analysis > 0) stateParts.push(`处理中${overall.analysis}个`);

    const stateStr = stateParts.join('，');
    let section = `【${label}】截至${timeStr}，共收集问题${overall.total}个。${stateStr ? `${stateStr}。` : ''}`;

    if (detailed) {
      const lines = [];
      for (const catName of CATEGORY_ORDER) {
        const line = formatCategoryLine(catName, stats[catName]);
        if (line) lines.push(line);
      }
      if (lines.length > 0) section += `\n${lines.join('\n')}`;
    }
    return section;
  };

  const allStats = calculateDetailedStats(() => true);
  const prodStats = calculateDetailedStats((_, roundName) => roundName.includes('投产'));
  const round5Stats = calculateDetailedStats((_, roundName) => roundName.includes('五轮'));
  const round4Stats = calculateDetailedStats((_, roundName) => roundName.includes('四轮'));
  const round3Stats = calculateDetailedStats((_, roundName) => roundName.includes('三轮'));
  const round2Stats = calculateDetailedStats((_, roundName) => roundName.includes('二轮'));
  const drillStats = calculateDetailedStats((_, roundName) => roundName.includes('灾切'));

  const lines = [
    generateSection('问题快报', allStats, false),
    generateSection('投产', prodStats, true),
    generateSection('第五轮', round5Stats, false),
    generateSection('第四轮', round4Stats, false),
    generateSection('第三轮', round3Stats, false),
    generateSection('第二轮', round2Stats, false),
    generateSection('灾备切换演练', drillStats, false),
  ].filter(Boolean);

  let finalReport = lines.join('\n');

  if (selectedRoundId) {
    const selectedRoundName = roundMap.get(selectedRoundId);
    if (selectedRoundName) {
      const selectedRoundStats = calculateDetailedStats((_, roundName) => roundName === selectedRoundName);
      if (selectedRoundStats.overall.total > 0) {
        const stateParts = [];
        if (selectedRoundStats.overall.resolved > 0) stateParts.push(`已解决${selectedRoundStats.overall.resolved}个`);
        if (selectedRoundStats.overall.verifying > 0) stateParts.push(`待验证${selectedRoundStats.overall.verifying}个`);
        if (selectedRoundStats.overall.analysis > 0) stateParts.push(`处理中${selectedRoundStats.overall.analysis}个`);
        const stateStr = stateParts.join('，');
        let leaderSummary = `各位领导：截至${timeStr}，${selectedRoundName}共收集问题${selectedRoundStats.overall.total}个。${stateStr ? `${stateStr}。` : ''}`;
        const detailedLines = [];
        for (const catName of CATEGORY_ORDER) {
          const line = formatCategoryLine(catName, selectedRoundStats.detailed[catName]);
          if (line) detailedLines.push(line);
        }
        if (detailedLines.length > 0) leaderSummary += `\n${detailedLines.join('\n')}`;
        finalReport += `\n\n${leaderSummary}`;
      }
    }
  }

  return finalReport;
}

function promptSettings() {
  const value = (key, fallback) => pamsGet('SELECT setting_value FROM sys_ai_settings WHERE setting_key = ?', key)?.setting_value || fallback;
  return {
    single: value('openai_prompt_single', '请根据问题信息生成单问题深入分析报告。'),
    summary: value('openai_prompt_summary', '请根据筛选问题生成总体分析报告。'),
    production: value('openai_prompt_production', '请根据问题信息生成投产期问题报告。'),
    quick_report: value('openai_prompt_quick_report', '请为问题快报生成问题摘要。'),
    quick_daily: value('openai_prompt_quick_daily', '请根据当天统计生成简洁日报摘要。'),
  };
}

function generateSingleAnalysis(issue) {
  const systemMap = dictValueMap('system');
  const bgMap = dictValueMap('business_group');
  const logs = Array.isArray(issue.analysis_log) ? issue.analysis_log : [];
  const logText = logs.length
    ? logs.map((log, index) => `${index + 1}. ${log.handler_name || '未知'}：${log.content || ''}`).join('\n')
    : '暂无分析记录';
  return [
    `【问题编号】${issue.issue_id}`,
    `【所属实施机构】${bgMap[issue.business_group] || issue.business_group || '未知'}`,
    `【所属系统】${systemMap[issue.system] || issue.system || '未知系统'}`,
    `【当前状态】${issue.status || '未知'}`,
    `【问题分类】${issue.category || '未分类'} / ${issue.detailed_classification || '未分类'}`,
    `【问题概述】${issue.summary || '无'}`,
    `【问题详情】${String(issue.details || '无').replace(/<[^>]+>/g, '')}`,
    `【原因分析】${issue.root_cause || issue.cause_analysis || '暂无'}`,
    `【解决方案】${issue.solution || '暂无'}`,
    `【处理记录】\n${logText}`,
  ].join('\n');
}

function generateSummaryAnalysis(issues) {
  const statusCounts = {};
  const classCounts = {};
  for (const issue of issues) {
    statusCounts[issue.status || '未知'] = (statusCounts[issue.status || '未知'] || 0) + 1;
    classCounts[issue.detailed_classification || issue.category || '未分类'] = (classCounts[issue.detailed_classification || issue.category || '未分类'] || 0) + 1;
  }
  const statusText = Object.entries(statusCounts).map(([name, count]) => `${name}${count}个`).join('，') || '无';
  const classText = Object.entries(classCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => `${name}${count}个`).join('，') || '无';
  const typical = issues
    .filter((item) => item.is_major || item.is_common || item.status === '重现')
    .concat(issues)
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.issue_id}：${item.summary || issueBrief(item)}（${item.status || '未知'}）`)
    .join('\n');
  return [
    `【问题分析报告】本次筛选共纳入${issues.length}个问题。`,
    `【状态分布】${statusText}`,
    `【分类分布】${classText}`,
    `【典型问题】\n${typical || '暂无典型问题'}`,
  ].join('\n');
}

function chartStatsBase(dimension, xAxisDimension, filters = {}, groups, xAxisGroups) {
  if (!DIMENSIONS.has(dimension)) return [];
  const { where, params } = buildIssueWhere(filters);
  const dimExpr = fieldExpr(dimension);

  const mapGroup = (name, defs, dim) => {
    if (!defs?.length) return name;
    const hit = defs.find((g) => Array.isArray(g.values) && g.values.includes(name));
    if (hit) return hit.label;
    if (defs.some((g) => g.values?.includes(dim))) return name;
    return '其它';
  };

  if (xAxisDimension && DIMENSIONS.has(xAxisDimension)) {
    const rows = pamsAll(
      `SELECT COALESCE(${dimExpr}, '未分配') AS name_y,
              COALESCE(${fieldExpr(xAxisDimension)}, '未分配') AS name_x,
              COUNT(*) AS value
         FROM biz_issue
         ${where}
        GROUP BY name_y, name_x
        ORDER BY name_y ASC, name_x ASC`,
      ...params,
    );
    if (!groups?.length && !xAxisGroups?.length) return rows;
    const acc = new Map();
    for (const row of rows) {
      const y = mapGroup(row.name_y, groups, dimension);
      const x = mapGroup(row.name_x, xAxisGroups, xAxisDimension);
      const key = `${y}\u0000${x}`;
      acc.set(key, (acc.get(key) || 0) + row.value);
    }
    const flattened = [...acc.entries()].map(([key, value]) => {
      const [name_y, name_x] = key.split('\u0000');
      return { name_y, name_x, value };
    });
    const yOrder = groups?.map((g) => g.label) || [];
    const xOrder = xAxisGroups?.map((g) => g.label) || [];
    const isYTime = dimension === 'created_at_day' || dimension === 'plan_fix_time_day';
    const isXTime = xAxisDimension === 'created_at_day' || xAxisDimension === 'plan_fix_time_day';
    return flattened.sort((a, b) => {
      const yA = yOrder.indexOf(a.name_y);
      const yB = yOrder.indexOf(b.name_y);
      let yCompare = 0;
      if (yA !== -1 && yB !== -1) yCompare = yA - yB;
      else if (yA !== -1) yCompare = -1;
      else if (yB !== -1) yCompare = 1;
      else if (isYTime) yCompare = a.name_y.localeCompare(b.name_y);
      else yCompare = b.value - a.value;
      if (yCompare !== 0) return yCompare;

      const xA = xOrder.indexOf(a.name_x);
      const xB = xOrder.indexOf(b.name_x);
      if (xA !== -1 && xB !== -1) return xA - xB;
      if (xA !== -1) return -1;
      if (xB !== -1) return 1;
      if (isXTime) return a.name_x.localeCompare(b.name_x);
      return 0;
    });
  }

  let rows = pamsAll(
    `SELECT COALESCE(${dimExpr}, '未分配') AS name, COUNT(*) AS value
       FROM biz_issue
       ${where}
      GROUP BY name
      ORDER BY ${dimension === 'created_at_day' || dimension === 'plan_fix_time_day' ? 'name ASC' : 'value DESC'}`,
    ...params,
  );
  if (dimension === 'created_at_day' || dimension === 'plan_fix_time_day') rows = rows.filter((r) => r.name !== '未分配');
  if (!groups?.length) return rows;
  const acc = new Map();
  for (const row of rows) {
    const name = mapGroup(row.name, groups, dimension);
    acc.set(name, (acc.get(name) || 0) + row.value);
  }
  const groupOrder = groups.map((g) => g.label);
  return [...acc.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((r) => r.value > 0)
    .sort((a, b) => {
      const aIdx = groupOrder.indexOf(a.name);
      const bIdx = groupOrder.indexOf(b.name);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      if (dimension === 'created_at_day' || dimension === 'plan_fix_time_day') return a.name.localeCompare(b.name);
      return b.value - a.value;
    });
}

function traverseChartDimension(dim, groups, filters) {
  const results = [{ dim, groups, filters, path: [] }];
  if (!groups?.length) return results;

  for (const group of groups) {
    if (!group.subDimension || !DIMENSIONS.has(group.subDimension)) continue;

    let values = Array.isArray(group.values) ? group.values : [];
    const currentFilter = filters?.[dim];
    if (currentFilter) {
      const filterValues = Array.isArray(currentFilter) ? currentFilter : [currentFilter];
      if (!filterValues.includes('__ALL__')) {
        values = values.filter((value) => filterValues.includes(value));
        if (values.length === 0) continue;
      }
    }

    const subFilters = { ...(filters || {}), [dim]: values };
    const subResults = traverseChartDimension(group.subDimension, group.subGroups || [], subFilters);
    for (const result of subResults) {
      results.push({ ...result, path: [group.label, ...result.path] });
    }
  }
  return results;
}

export function groupedChartStats(dimension, xAxisDimension, filters = {}, groups, xAxisGroups) {
  if (!DIMENSIONS.has(dimension)) return [];
  const yConfigs = traverseChartDimension(dimension, groups || [], filters || {});
  const xConfigs = xAxisDimension && DIMENSIONS.has(xAxisDimension)
    ? traverseChartDimension(xAxisDimension, xAxisGroups || [], filters || {})
    : [{ dim: undefined, groups: undefined, filters: filters || {}, path: [] }];

  const result = [];
  for (const yConf of yConfigs) {
    for (const xConf of xConfigs) {
      const combinedFilters = { ...(yConf.filters || {}), ...(xConf.filters || {}) };
      const rows = chartStatsBase(yConf.dim, xConf.dim, combinedFilters, yConf.groups, xConf.groups);
      for (const row of rows) {
        const item = { ...row };
        if (yConf.path.length > 0) {
          item.path_y = yConf.path;
          item.parent_y = yConf.path[0];
          if (yConf.path.length >= 2) item.parent_y_2 = yConf.path[1];
          if (yConf.path.length >= 3) item.parent_y_3 = yConf.path[2];
        }
        if (xConf.path.length > 0) {
          item.path_x = xConf.path;
          item.parent_x = xConf.path[0];
          if (xConf.path.length >= 2) item.parent_x_2 = xConf.path[1];
          if (xConf.path.length >= 3) item.parent_x_3 = xConf.path[2];
        }
        result.push(item);
      }
    }
  }
  return result;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeBool(value) {
  return value ? 1 : 0;
}

function syncPamsRoleName(row) {
  const role = pamsGet(
    "SELECT item_value FROM sys_dict WHERE dict_code = 'user_role' AND item_key = ?",
    row.pams_role_key,
  );
  return role?.item_value || row.pams_role_name || row.pams_role_key;
}

function findDictMatch(dictCode, text) {
  const haystack = String(text || '').toLowerCase();
  if (!haystack) return null;
  const rows = pamsAll(
    'SELECT item_key, item_value FROM sys_dict WHERE dict_code = ? ORDER BY sort_order, dict_id',
    dictCode,
  );
  return rows.find((row) => {
    const key = String(row.item_key || '').toLowerCase();
    const value = String(row.item_value || '').toLowerCase();
    return (key && haystack.includes(key)) || (value && haystack.includes(value));
  }) || null;
}

function smartFillFromText(text) {
  const source = String(text || '').trim();
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] || source;
  const phone = source.match(/1[3-9]\d{9}|(?:\+?\d[\d\s-]{6,}\d)/)?.[0]?.replace(/\s+/g, '') || '';
  const system = findDictMatch('system', source);
  const org = findDictMatch('organization', source) || findDictMatch('business_group', source);
  const users = radarAll(
    `SELECT name AS real_name, org AS organization, phone AS contact
       FROM user
      WHERE status != 'disabled'
      ORDER BY LENGTH(name) DESC, name`,
  );
  const user = users.find((item) => item.real_name && source.includes(item.real_name)) || null;
  const caseMatches = pamsAll(
    `SELECT case_id, scenario AS case_name
       FROM biz_case
      WHERE instr(?, case_id) > 0
      ORDER BY created_at DESC, id DESC
      LIMIT 5`,
    source,
  );
  const unmatched = [];
  if (!user?.real_name) unmatched.push('reporter_name');
  if (!system?.item_key) unmatched.push('system');
  if (!org?.item_key && !user?.organization) unmatched.push('reporter_org');
  return {
    reporter_name: user?.real_name || '',
    reporter_org: user?.organization || org?.item_key || '',
    reporter_contact: user?.contact || phone,
    summary: firstLine.slice(0, 100),
    details: source,
    system: system?.item_key || '',
    linked_cases: caseMatches,
    unmatched_fields: unmatched,
    match_confidence: unmatched.length ? 'low' : 'medium',
  };
}

const ISSUE_IMPORT_HEADERS = [
  ['issue_id', '问题编号'],
  ['summary', '问题概述'],
  ['details', '问题详情'],
  ['status', '状态'],
  ['category', '问题分类'],
  ['detailed_classification', '详细分类'],
  ['round', '轮次'],
  ['urgency', '紧急程度'],
  ['handling_method', '处理方式'],
  ['tracker_name', '跟踪人'],
  ['tracker_org', '跟踪人机构'],
  ['tracker_contact', '跟踪人联系方式'],
  ['reporter_name', '报障人'],
  ['reporter_org', '报障人机构'],
  ['reporter_contact', '报障人联系方式'],
  ['handler_name', '处理人'],
  ['handler_org', '处理人机构'],
  ['handler_contact', '处理人联系方式'],
  ['system', '所属系统'],
  ['business_group', '所属实施机构'],
  ['module', '所属板块'],
  ['is_major', '重大问题'],
  ['version_number', '版本编号'],
  ['release_status', '发版情况'],
  ['work_order_no', '工单编号'],
];

function issueTemplateWorkbook(rows = []) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('issues');
  sheet.columns = ISSUE_IMPORT_HEADERS.map(([key, header]) => ({ key, header, width: Math.max(14, header.length + 8) }));
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  return workbook;
}

function rowValue(row, key, headerMap) {
  const index = headerMap.get(key);
  if (!index) return undefined;
  const cell = row.getCell(index).value;
  if (cell === null || cell === undefined) return undefined;
  if (typeof cell === 'object' && 'text' in cell) return String(cell.text || '').trim();
  if (typeof cell === 'object' && 'result' in cell) return String(cell.result || '').trim();
  return String(cell).trim();
}

function issuePayloadFromExcelRow(row, headerMap) {
  const payload = {};
  for (const [key, label] of ISSUE_IMPORT_HEADERS) {
    const value = rowValue(row, key, headerMap) ?? rowValue(row, label, headerMap);
    if (value !== undefined && value !== '') payload[key] = value;
  }
  if (payload.is_major !== undefined) {
    payload.is_major = ['1', 'true', '是', '重大'].includes(String(payload.is_major).toLowerCase());
  }
  return payload;
}

function upsertImportedIssue(data, operator) {
  const issueId = data.issue_id || generatePamsIssueId();
  const exists = pamsGet('SELECT issue_id FROM biz_issue WHERE issue_id = ?', issueId);
  const payload = {
    status: data.status || '提出',
    category: data.category || defaultDictValue('issue_category', '未分类'),
    summary: data.summary,
    details: data.details,
    tracker_name: data.tracker_name || operator || '',
    tracker_org: data.tracker_org || '',
    tracker_contact: data.tracker_contact || '',
    reporter_name: data.reporter_name || null,
    reporter_org: data.reporter_org || null,
    reporter_contact: data.reporter_contact || null,
    handler_name: data.handler_name || null,
    handler_org: data.handler_org || null,
    handler_contact: data.handler_contact || null,
    module: data.module || null,
    system: data.system || null,
    business_group: data.business_group || null,
    is_major: data.is_major ? 1 : 0,
    detailed_classification: data.detailed_classification || defaultDictValue('issue_detailed_classification', '未分类'),
    round: data.round || defaultDictValue('issue_round', '第二轮'),
    urgency: data.urgency || defaultDictValue('issue_urgency', '中'),
    handling_method: data.handling_method || defaultDictValue('issue_handling_method', '其它'),
    version_number: data.version_number || null,
    release_status: data.release_status || '',
    work_order_no: data.work_order_no || null,
  };
  if (exists) {
    const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
    pamsRun(
      `UPDATE biz_issue SET ${entries.map(([key]) => `${key}=?`).join(', ')} WHERE issue_id=?`,
      ...entries.map(([, value]) => value),
      issueId,
    );
    addIssueHistory(issueId, operator, '批量导入更新问题');
    return issueId;
  }
  pamsRun(
    `INSERT INTO biz_issue (
      issue_id, create_time, status, category, summary, details, attachments, analysis_log,
      tracker_name, tracker_org, tracker_contact, reporter_name, reporter_org, reporter_contact,
      handler_name, handler_org, handler_contact, linked_cases, module, system, business_group,
      is_major, is_common, root_cause, solution, detailed_classification, round, tags, urgency,
      handling_method, version_number, release_status, work_order_no
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    issueId, localTimeString(), payload.status, payload.category, payload.summary, payload.details,
    JSON.stringify([]), JSON.stringify([]), payload.tracker_name, payload.tracker_org, payload.tracker_contact,
    payload.reporter_name, payload.reporter_org, payload.reporter_contact, payload.handler_name,
    payload.handler_org, payload.handler_contact, JSON.stringify([]), payload.module, payload.system,
    payload.business_group, payload.is_major, 0, null, null, payload.detailed_classification, payload.round,
    JSON.stringify([]), payload.urgency, payload.handling_method, payload.version_number,
    payload.release_status, payload.work_order_no,
  );
  addIssueHistory(issueId, operator, '批量导入创建问题');
  return issueId;
}

const TICKET_CONFIGS = {
  'business-ticket': {
    table: 'biz_business_ticket',
    primaryKey: 'id',
    issueKey: 'issue_control_no',
    defaultOrder: 'updated_at DESC, created_at DESC',
    templateName: 'business_ticket_template.xlsx',
    exportName: 'business_tickets.xlsx',
  },
  kongming: {
    table: 'biz_kongming_ticket',
    primaryKey: 'ticket_issue_id',
    issueKey: 'ticket_issue_id',
    defaultOrder: 'updated_at DESC, creation_time DESC',
    templateName: 'kongming_template.xlsx',
    exportName: 'kongming.xlsx',
  },
  itsm: {
    table: 'biz_itsm_ticket',
    primaryKey: 'id',
    issueKey: 'id',
    defaultOrder: 'updated_at DESC, creation_time DESC',
    templateName: 'itsm_template.xlsx',
    exportName: 'itsm.xlsx',
  },
};

function tableInfo(table) {
  return pamsAll(`PRAGMA table_info(${table})`);
}

function tableColumnNames(table) {
  return tableInfo(table).map((row) => row.name);
}

function ticketWorkbook(config, rows = []) {
  const columns = tableColumnNames(config.table);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(config.table);
  sheet.columns = columns.map((key) => ({ key, header: key, width: Math.min(40, Math.max(14, key.length + 4)) }));
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  return workbook;
}

function buildTicketWhere(config, query = {}) {
  const columns = new Set(tableColumnNames(config.table));
  const conditions = [];
  const params = [];
  for (const [key, value] of Object.entries(query)) {
    if (['page', 'pageSize', '_t'].includes(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    if (key === 'is_converted') {
      const exists = `EXISTS (SELECT 1 FROM biz_issue i WHERE i.issue_id = t.${config.issueKey})`;
      conditions.push(value === '1' || value === 1 || value === true ? exists : `NOT ${exists}`);
      continue;
    }
    if (!columns.has(key)) continue;
    conditions.push(`t.${key} LIKE ?`);
    params.push(`%${value}%`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

function withTicketFlags(config, rows) {
  return rows.map((row) => {
    const issueId = row[config.issueKey];
    const linked = issueId ? !!pamsGet('SELECT issue_id FROM biz_issue WHERE issue_id = ?', issueId) : false;
    return {
      ...row,
      is_linked: linked,
      is_converted: linked,
    };
  });
}

function registerTicketRoutes(fastify, routeName, config) {
  fastify.get(`/pams/${routeName}`, { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const q = request.query || {};
    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.min(5000, Math.max(1, Number(q.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const { where, params } = buildTicketWhere(config, q);
    const total = pamsGet(`SELECT COUNT(*) AS c FROM ${config.table} t ${where}`, ...params)?.c || 0;
    const items = pamsAll(
      `SELECT t.*
         FROM ${config.table} t
         ${where}
        ORDER BY ${config.defaultOrder}
        LIMIT ? OFFSET ?`,
      ...params, pageSize, offset,
    );
    return ok({ items: withTicketFlags(config, items), total, page, pageSize });
  });

  fastify.get(`/pams/${routeName}/template`, { preHandler: fastify.requirePerm('pams', 'view') }, async (_request, reply) => {
    const buffer = Buffer.from(await ticketWorkbook(config).xlsx.writeBuffer());
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${config.templateName}"`);
    return reply.send(buffer);
  });

  fastify.get(`/pams/${routeName}/export`, { preHandler: fastify.requirePerm('pams', 'view') }, async (request, reply) => {
    const { where, params } = buildTicketWhere(config, request.query || {});
    const rows = withTicketFlags(config, pamsAll(
      `SELECT t.*
         FROM ${config.table} t
         ${where}
        ORDER BY ${config.defaultOrder}`,
      ...params,
    ));
    const buffer = Buffer.from(await ticketWorkbook(config, rows).xlsx.writeBuffer());
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${config.exportName}"`);
    return reply.send(buffer);
  });

  fastify.post(`/pams/${routeName}/import`, { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传 Excel 文件');
    const buffer = await data.toBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest('Excel 文件没有工作表');
    const columns = tableColumnNames(config.table);
    const columnSet = new Set(columns);
    const headerMap = new Map();
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const header = String(cell.value || '').trim();
      if (columnSet.has(header)) headerMap.set(header, colNumber);
    });
    let count = 0;
    pamsTx(() => {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const payload = {};
        for (const column of columns) {
          const index = headerMap.get(column);
          if (!index) continue;
          const value = row.getCell(index).value;
          payload[column] = value === null || value === undefined ? null : String(value);
        }
        const primary = payload[config.primaryKey] || payload.ticket_no || payload[config.issueKey];
        if (!primary) return;
        payload[config.primaryKey] = primary;
        const insertColumns = columns.filter((column) => payload[column] !== undefined);
        const values = insertColumns.map((column) => payload[column]);
        const placeholders = insertColumns.map(() => '?').join(',');
        const updates = insertColumns
          .filter((column) => column !== config.primaryKey)
          .map((column) => `${column}=excluded.${column}`)
          .join(',');
        pamsRun(
          `INSERT INTO ${config.table} (${insertColumns.join(',')})
           VALUES (${placeholders})
           ON CONFLICT(${config.primaryKey}) DO UPDATE SET ${updates || `${config.primaryKey}=excluded.${config.primaryKey}`}`,
          ...values,
        );
        count += 1;
      });
    });
    return { success: true, count };
  });

  fastify.post(`/pams/${routeName}/clear`, { preHandler: fastify.requirePerm('pams', 'manage') }, async () => {
    const res = pamsRun(`DELETE FROM ${config.table}`);
    return { success: true, deleted: res.changes || 0 };
  });

  fastify.post(`/pams/${routeName}/:id/convert`, { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const ticket = pamsGet(`SELECT * FROM ${config.table} WHERE ${config.primaryKey} = ?`, request.params.id);
    if (!ticket) throw notFound('工单不存在');
    const issueId = ticket[config.issueKey] || ticket[config.primaryKey];
    const exists = pamsGet('SELECT issue_id FROM biz_issue WHERE issue_id = ?', issueId);
    if (!exists) {
      const data = {
        issue_id: issueId,
        summary: ticket.issue_title || ticket.title || ticket.ticket_name || ticket.problem_description || `工单转问题 ${issueId}`,
        details: ticket.issue_desc || ticket.detail || ticket.problem_description || ticket.remarks || ticket.ticket_name || '',
        status: '提出',
        category: defaultDictValue('issue_category', '未分类'),
        detailed_classification: defaultDictValue('issue_detailed_classification', '未分类'),
        round: '投产',
        urgency: ticket.urgency || defaultDictValue('issue_urgency', '中'),
        handling_method: defaultDictValue('issue_handling_method', '其它'),
        tracker_name: request.currentUser?.name || ticket.creator || '',
        tracker_org: request.currentUser?.org || '',
        tracker_contact: request.currentUser?.phone || '',
        reporter_name: ticket.reporter_name || ticket.issue_proposer_name || ticket.creator || ticket.reporter_dept_contact || null,
        reporter_org: ticket.reporter_org || ticket.proposer_org || ticket.creator_dept || null,
        reporter_contact: ticket.reporter_phone || ticket.proposer_phone || ticket.creator_contact || ticket.reporter_contact_info || null,
        system: ticket.issue_app_system_code || ticket.issue_app_system || ticket.app_system || ticket.subsystem || null,
        business_group: ticket.business_group || null,
        work_order_no: ticket.ticket_no || ticket.id || ticket.ticket_issue_id || null,
      };
      upsertImportedIssue(data, operatorName(request));
    }
    return ok({ issue_id: issueId }, '成功转为问题单');
  });

  fastify.get(`/pams/${routeName}/:id`, { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const row = pamsGet(`SELECT * FROM ${config.table} WHERE ${config.primaryKey} = ?`, request.params.id);
    if (!row) throw notFound('工单不存在');
    return withTicketFlags(config, [row])[0];
  });
}

export default async function pamsRoutes(fastify) {
  fastify.get('/pams/meta', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    const tables = pamsAll("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
    const counts = Object.fromEntries(
      ['biz_issue', 'biz_common_issue', 'biz_itsm_ticket', 'biz_kongming_ticket', 'biz_business_ticket', 'biz_case']
        .map((table) => [table, pamsGet(`SELECT COUNT(*) AS c FROM ${table}`)?.c || 0]),
    );
    return ok({ dbFile: config.pamsDbFile, tables, counts });
  });

  fastify.get('/pams/stats', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const q = request.query || {};
    const statusFilter = q.statusFilter
      ? (['all', 'resolved', 'unresolved'].includes(q.statusFilter) ? q.statusFilter : String(q.statusFilter).split(','))
      : 'all';
    return ok(computeStats({
      statusFilter,
      round: q.round,
      businessGroup: q.businessGroup,
      boardColDim: q.boardColDim,
      boardRowDim: q.boardRowDim,
    }));
  });

  fastify.post('/pams/stats/chart', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const body = request.body || {};
    if (!body.dimension) throw badRequest('缺少必需的统计维度');
    return ok(groupedChartStats(
      body.dimension,
      body.xAxisDimension,
      body.filters || {},
      body.groups || [],
      body.xAxisGroups || [],
    ));
  });

  fastify.get('/pams/config/dashboard', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const userKey = `RADAR_${request.currentUser.id}`;
    const system = pamsGet("SELECT config_content FROM sys_user_dashboard WHERE user_id = 'SYSTEM'");
    const user = pamsGet('SELECT config_content FROM sys_user_dashboard WHERE user_id = ?', userKey);
    return ok({
      system: parseJson(system?.config_content, null),
      user: parseJson(user?.config_content, null),
    });
  });

  fastify.post('/pams/config/dashboard', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const { type, config: dashboardConfig } = request.body || {};
    if (!['system', 'user'].includes(type)) throw badRequest('无效的配置类型');
    if (!dashboardConfig || typeof dashboardConfig !== 'object') throw badRequest('配置内容不能为空');
    if (type === 'system') {
      if (!request.currentUser.is_super) {
        const roleNames = radarAll(
          `SELECT r.code FROM role r JOIN user_role ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
          request.currentUser.id,
        ).map((r) => r.code);
        if (!roleNames.includes('管理员') && !roleNames.includes('超级管理员')) throw badRequest('只有管理员可以修改系统图表');
      }
    }
    const userKey = type === 'system' ? 'SYSTEM' : `RADAR_${request.currentUser.id}`;
    pamsRun(
      `INSERT INTO sys_user_dashboard (user_id, config_content, updated_at)
       VALUES (?,?,datetime('now','localtime'))
       ON CONFLICT(user_id) DO UPDATE SET
         config_content=excluded.config_content,
         updated_at=excluded.updated_at`,
      userKey,
      JSON.stringify(dashboardConfig),
    );
    return ok(null, '仪表盘配置已保存');
  });

  fastify.post('/pams/report/category-stats', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const body = request.body || {};
    return ok(categoryStats(body.categoryGroup, body.round));
  });

  fastify.post('/pams/report/stats', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    return ok(reportStatsFromIssues(issuesForReportFilters(request.body || {}, false)));
  });

  fastify.post('/pams/report/generate', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    return ok(generateProblemReport(request.body || {}));
  });

  fastify.post('/pams/report/quick-daily', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    return ok({ report: generateQuickDaily((request.body || {}).round) });
  });

  fastify.get('/pams/analyst/prompts', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    return ok(promptSettings());
  });

  fastify.post('/pams/analyst/generate', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const { issue_id: issueId } = request.body || {};
    if (!issueId) throw badRequest('缺少问题编号');
    const issue = decodeIssue(pamsGet('SELECT * FROM biz_issue WHERE issue_id = ?', issueId));
    if (!issue) throw notFound('未找到该问题');
    return ok({ report: generateSingleAnalysis(issue) });
  });

  fastify.post('/pams/analyst/summary', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const issues = issuesForReportFilters(request.body || {}, false);
    if (!issues.length) throw notFound('未找到符合条件的问题');
    return ok({ report: generateSummaryAnalysis(issues), count: issues.length });
  });

  fastify.get('/pams/issues', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const q = request.query || {};
    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.min(5000, Math.max(1, Number(q.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const filters = {};
    for (const key of [
      ...DIMENSIONS,
      ...[...DIMENSIONS].map((k) => `${k}_not`),
      'keyword', 'q', 'issue_id_or_no', 'my_issues_contact', 'my_issues_user',
      'summary', 'tracker_name', 'tracker_contact', 'reporter_name', 'reporter_contact',
      'handler_name', 'handler_contact', 'issue_id', 'work_order_no', 'plan_fix_time',
      'version_number', 'release_status', 'is_major',
    ]) {
      if (q[key] === undefined) continue;
      filters[key] = String(q[key]).includes(',') && key !== 'keyword' ? String(q[key]).split(',') : q[key];
    }
    const { where, params } = buildIssueWhere(filters);
    const total = pamsGet(`SELECT COUNT(*) AS c FROM biz_issue ${where}`, ...params)?.c || 0;
    const items = pamsAll(
      `SELECT ${ISSUE_LIST_COLUMNS.join(',')}
         FROM biz_issue
         ${where}
        ORDER BY create_time DESC, issue_id DESC
        LIMIT ? OFFSET ?`,
      ...params, pageSize, offset,
    ).map(decodeIssue);
    return ok({ items, total, page, pageSize });
  });

  fastify.get('/pams/issues/release-status-list', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    const rows = pamsAll(
      `SELECT DISTINCT release_status
         FROM biz_issue
        WHERE release_status IS NOT NULL AND release_status != ''
        ORDER BY release_status ASC`,
    );
    return ok(rows.map((row) => row.release_status));
  });

  fastify.get('/pams/issues/template', { preHandler: fastify.requirePerm('pams', 'view') }, async (_request, reply) => {
    const workbook = issueTemplateWorkbook([{
      summary: '示例问题概述',
      details: '示例问题详情',
      status: '提出',
      category: defaultDictValue('issue_category', '未分类'),
      detailed_classification: defaultDictValue('issue_detailed_classification', '未分类'),
      round: defaultDictValue('issue_round', '第二轮'),
      urgency: defaultDictValue('issue_urgency', '中'),
      handling_method: defaultDictValue('issue_handling_method', '其它'),
    }]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="issues_template.xlsx"');
    return reply.send(buffer);
  });

  fastify.get('/pams/issues/export', { preHandler: fastify.requirePerm('pams', 'view') }, async (request, reply) => {
    const q = request.query || {};
    const filters = {};
    for (const key of [
      ...DIMENSIONS,
      ...[...DIMENSIONS].map((k) => `${k}_not`),
      'keyword', 'q', 'issue_id_or_no', 'my_issues_contact', 'my_issues_user',
      'summary', 'tracker_name', 'tracker_contact', 'reporter_name', 'reporter_contact',
      'handler_name', 'handler_contact', 'issue_id', 'work_order_no', 'plan_fix_time',
      'version_number', 'release_status', 'is_major',
    ]) {
      if (q[key] === undefined) continue;
      filters[key] = String(q[key]).includes(',') && key !== 'keyword' ? String(q[key]).split(',') : q[key];
    }
    const { where, params } = buildIssueWhere(filters);
    const rows = pamsAll(
      `SELECT ${ISSUE_LIST_COLUMNS.join(',')}
         FROM biz_issue
         ${where}
        ORDER BY create_time DESC, issue_id DESC`,
      ...params,
    ).map(decodeIssue);
    const workbook = issueTemplateWorkbook(rows.map((row) => ({
      ...row,
      is_major: row.is_major ? '是' : '否',
    })));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="issues.xlsx"');
    return reply.send(buffer);
  });

  fastify.post('/pams/issues/import', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传 Excel 文件');
    const buffer = await data.toBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest('Excel 文件没有工作表');
    const headerMap = new Map();
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const value = String(cell.value || '').trim();
      if (value) headerMap.set(value, colNumber);
      const found = ISSUE_IMPORT_HEADERS.find(([key, label]) => key === value || label === value);
      if (found) headerMap.set(found[0], colNumber);
    });

    const errors = [];
    let successCount = 0;
    pamsTx(() => {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        try {
          const payload = issuePayloadFromExcelRow(row, headerMap);
          if (!payload.summary && !payload.details && !payload.issue_id) return;
          if (!payload.summary) throw new Error('问题概述不能为空');
          if (!payload.details) throw new Error('问题详情不能为空');
          upsertImportedIssue(payload, operatorName(request));
          successCount += 1;
        } catch (err) {
          errors.push({ row: rowNumber, message: err?.message || '导入失败' });
        }
      });
    });
    return {
      success: errors.length === 0,
      total: Math.max(0, sheet.rowCount - 1),
      successCount,
      errorCount: errors.length,
      errors,
    };
  });

  fastify.post('/pams/issues/batch-adjust', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const { field, updates } = request.body || {};
    if (!ISSUE_UPDATE_COLUMNS.has(field) && field !== 'summary') throw badRequest('不支持的批量调整字段');
    if (!Array.isArray(updates) || !updates.length) throw badRequest('没有可更新的数据');
    let successCount = 0;
    pamsTx(() => {
      for (const item of updates) {
        if (!item?.issue_id) continue;
        const res = pamsRun(`UPDATE biz_issue SET ${field} = ? WHERE issue_id = ?`, issueFieldValue(field, item.value), item.issue_id);
        if (res.changes > 0) {
          successCount += 1;
          addIssueHistory(item.issue_id, operatorName(request), `批量调整 ${field}`);
        }
      }
    });
    return ok({ successCount }, `批量调整完成，成功 ${successCount} 条`);
  });

  fastify.post('/pams/issues/batch-update-release', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const updates = Array.isArray(request.body) ? request.body : [];
    if (!updates.length) throw badRequest('没有可更新的数据');
    let successCount = 0;
    pamsTx(() => {
      for (const item of updates) {
        if (!item?.issue_id) continue;
        const res = pamsRun(
          'UPDATE biz_issue SET version_number = ?, release_status = ? WHERE issue_id = ?',
          item.version_number || '',
          item.release_status || '',
          item.issue_id,
        );
        if (res.changes > 0) {
          successCount += 1;
          addIssueHistory(item.issue_id, operatorName(request), '批量更新发版情况');
        }
      }
    });
    return ok({ successCount }, `批量更新完成，成功 ${successCount} 条`);
  });

  fastify.post('/pams/issues', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const data = request.body || {};
    if (!data.summary || !data.details) throw badRequest('问题概述和详情不能为空');

    const tracker = {
      tracker_name: data.tracker_name ?? request.currentUser?.name ?? '',
      tracker_org: data.tracker_org ?? request.currentUser?.org ?? '',
      tracker_contact: data.tracker_contact ?? request.currentUser?.phone ?? '',
    };
    const hasTracker = tracker.tracker_name && tracker.tracker_org && tracker.tracker_contact;
    const hasReporter = data.reporter_name && data.reporter_org && data.reporter_contact;
    if (!hasTracker && !hasReporter) throw badRequest('必须填写跟踪人或报障人信息');

    const category = data.category || defaultDictValue('issue_category', '未分类');
    const existsCategory = pamsGet(
      'SELECT dict_id FROM sys_dict WHERE dict_code = ? AND item_key = ?',
      'issue_category',
      category,
    );
    if (!existsCategory) throw badRequest(`无效的问题分类：${category}`);

    let issueId = null;
    pamsTx(() => {
      for (let retry = 0; retry < 5; retry++) {
        issueId = data.issue_id || generatePamsIssueId();
        try {
          pamsRun(
            `INSERT INTO biz_issue (
              issue_id, create_time, status, category, summary, details,
              attachments, analysis_log, tracker_name, tracker_org, tracker_contact,
              reporter_name, reporter_org, reporter_contact, handler_name, handler_org, handler_contact,
              linked_cases, module, system, business_group, is_major, is_common, root_cause, solution,
              detailed_classification, round, tags, urgency, handling_method, version_number, release_status, work_order_no
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            issueId,
            localTimeString(),
            data.status || '提出',
            category,
            data.summary,
            data.details,
            JSON.stringify(Array.isArray(data.attachments) ? data.attachments : []),
            JSON.stringify([]),
            tracker.tracker_name || '',
            tracker.tracker_org || '',
            tracker.tracker_contact || '',
            data.reporter_name || null,
            data.reporter_org || null,
            data.reporter_contact || null,
            data.handler_name || null,
            data.handler_org || null,
            data.handler_contact || null,
            JSON.stringify(Array.isArray(data.linked_cases) ? data.linked_cases : []),
            data.module || null,
            data.system || null,
            data.business_group || null,
            data.is_major ? 1 : 0,
            data.is_common ? 1 : 0,
            data.root_cause || null,
            data.solution || null,
            data.detailed_classification || defaultDictValue('issue_detailed_classification', '未分类'),
            data.round || defaultDictValue('issue_round', '第二轮'),
            JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
            data.urgency || defaultDictValue('issue_urgency', '中'),
            data.handling_method || defaultDictValue('issue_handling_method', '其它'),
            data.version_number || null,
            data.release_status || '',
            data.work_order_no || null,
          );
          pamsRun(
            'INSERT INTO biz_issue_history (issue_id, operator_name, operation_time, content) VALUES (?,?,?,?)',
            issueId,
            request.currentUser?.name || data.reporter_name || tracker.tracker_name || '未知用户',
            localTimeString(),
            '创建问题',
          );
          return;
        } catch (err) {
          if (String(err?.message || '').includes('UNIQUE constraint failed') && retry < 4) {
            issueId = null;
            continue;
          }
          throw err;
        }
      }
    });

    return ok({ issue_id: issueId }, '问题上报成功');
  });

  fastify.post('/pams/issues/smart-fill', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const text = String(request.body?.text || '').trim();
    if (!text) throw badRequest('请输入要解析的文本');
    return ok(smartFillFromText(text));
  });

  fastify.get('/pams/issues/:id', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const row = pamsGet(
      `SELECT i.*,
              CASE WHEN t.id IS NOT NULL THEN 1 ELSE 0 END AS has_itsm,
              CASE WHEN k.ticket_issue_id IS NOT NULL THEN 1 ELSE 0 END AS has_kongming,
              bt.id AS business_ticket_id,
              bt.jinke_initial_feedback AS bt_jinke_initial_feedback,
              bt.next_step_processing AS bt_next_step_processing,
              bt.is_problem_resolved AS bt_is_problem_resolved,
              bt.remarks AS bt_remarks,
              bt.is_disputed AS bt_is_disputed,
              bt.is_demand_closed AS bt_is_demand_closed
         FROM biz_issue i
         LEFT JOIN biz_itsm_ticket t ON i.issue_id = t.id
         LEFT JOIN biz_kongming_ticket k ON i.issue_id = k.ticket_issue_id
         LEFT JOIN (
           SELECT id, issue_control_no, jinke_initial_feedback, next_step_processing,
                  is_problem_resolved, remarks, is_disputed, is_demand_closed
             FROM biz_business_ticket
            GROUP BY issue_control_no
         ) bt ON i.issue_id = bt.issue_control_no
        WHERE i.issue_id = ?`,
      request.params.id,
    );
    if (!row) throw notFound();
    return ok(decodeIssue(row));
  });

  fastify.put('/pams/issues/:id', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const issueId = request.params.id;
    const old = pamsGet('SELECT * FROM biz_issue WHERE issue_id = ?', issueId);
    if (!old) throw notFound();

    const body = request.body || {};
    const entries = Object.entries(body).filter(([key]) => ISSUE_UPDATE_COLUMNS.has(key));
    if (!entries.length) return ok(decodeIssue(old));

    const setSql = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([key, value]) => issueFieldValue(key, value));
    pamsTx(() => {
      pamsRun(`UPDATE biz_issue SET ${setSql} WHERE issue_id = ?`, ...values, issueId);
      addIssueHistory(issueId, operatorName(request), `更新问题：${entries.map(([key]) => key).join('、')}`);
    });

    return ok(decodeIssue(pamsGet('SELECT * FROM biz_issue WHERE issue_id = ?', issueId)), '问题更新成功');
  });

  fastify.delete('/pams/issues/:id', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const issueId = request.params.id;
    const old = pamsGet('SELECT issue_id FROM biz_issue WHERE issue_id = ?', issueId);
    if (!old) throw notFound();
    pamsTx(() => {
      pamsRun('DELETE FROM biz_issue_history WHERE issue_id = ?', issueId);
      pamsRun('DELETE FROM biz_issue WHERE issue_id = ?', issueId);
    });
    return ok(null, '删除成功');
  });

  fastify.get('/pams/issues/:id/history', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const rows = pamsAll(
      'SELECT id, issue_id, operator_name, operation_time, content FROM biz_issue_history WHERE issue_id = ? ORDER BY operation_time DESC, id DESC',
      request.params.id,
    );
    return ok(rows);
  });

  fastify.post('/pams/issues/:id/analysis', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const issueId = request.params.id;
    const row = pamsGet('SELECT * FROM biz_issue WHERE issue_id = ?', issueId);
    if (!row) throw notFound();
    const body = request.body || {};
    if (!body.content?.trim()) throw badRequest('分析内容不能为空');

    const issue = decodeIssue(row);
    const entry = {
      content: body.content.trim(),
      handler_name: body.handler_name || request.currentUser?.name || '',
      handler_org: body.handler_org || request.currentUser?.org || '',
      handler_contact: body.handler_contact || request.currentUser?.phone || '',
      time: localTimeString(),
    };
    const logs = [...(issue.analysis_log || []), entry];
    pamsTx(() => {
      pamsRun('UPDATE biz_issue SET analysis_log = ?, handler_name = COALESCE(?, handler_name), handler_org = COALESCE(?, handler_org), handler_contact = COALESCE(?, handler_contact) WHERE issue_id = ?',
        JSON.stringify(logs), entry.handler_name || null, entry.handler_org || null, entry.handler_contact || null, issueId);
      addIssueHistory(issueId, operatorName(request, entry.handler_name), '添加分析记录');
    });
    return ok(entry, '分析记录添加成功');
  });

  fastify.get('/pams/users', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const q = request.query || {};
    const keyword = `%${q.search || q.keyword || ''}%`;
    const pageSize = Math.min(50, Math.max(1, Number(q.pageSize || 10)));
    const rows = radarAll(
      `SELECT id AS user_id, phone AS username, name AS real_name, org AS organization, phone AS contact
         FROM user
        WHERE name LIKE ? OR phone LIKE ? OR org LIKE ?
        ORDER BY name
        LIMIT ?`,
      keyword, keyword, keyword, pageSize,
    );
    return ok({ items: rows, total: rows.length });
  });

  fastify.get('/pams/cases', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const q = request.query || {};
    const keyword = `%${q.keyword || q.search || ''}%`;
    const pageSize = Math.min(50, Math.max(1, Number(q.pageSize || 10)));
    const rows = pamsAll(
      `SELECT * FROM biz_case
        WHERE case_id LIKE ? OR scenario LIKE ? OR module LIKE ? OR system LIKE ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
      keyword, keyword, keyword, keyword, pageSize,
    );
    return ok({ items: rows, total: rows.length });
  });

  fastify.get('/pams/cases/:id', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const row = pamsGet('SELECT * FROM biz_case WHERE case_id = ? ORDER BY id DESC LIMIT 1', request.params.id);
    if (!row) throw notFound();
    return ok(row);
  });

  registerTicketRoutes(fastify, 'business-ticket', TICKET_CONFIGS['business-ticket']);
  registerTicketRoutes(fastify, 'kongming', TICKET_CONFIGS.kongming);
  registerTicketRoutes(fastify, 'itsm', TICKET_CONFIGS.itsm);

  fastify.get('/pams/common-issues', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const q = request.query || {};
    const page = Math.max(1, Number(q.page || 1));
    const pageSize = Math.min(5000, Math.max(1, Number(q.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    if (q.summary) {
      conditions.push('(summary LIKE ? OR cause LIKE ? OR solution LIKE ?)');
      const like = `%${q.summary}%`;
      params.push(like, like, like);
    }
    if (q.tags) {
      conditions.push('tags LIKE ?');
      params.push(`%${q.tags}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = pamsGet(`SELECT COUNT(*) AS c FROM biz_common_issue ${where}`, ...params)?.c || 0;
    const items = pamsAll(
      `SELECT *
         FROM biz_common_issue
         ${where}
        ORDER BY updated_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      ...params, pageSize, offset,
    );
    return ok({ items, total, page, pageSize });
  });

  fastify.post('/pams/common-issues', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const body = request.body || {};
    if (!body.summary?.trim()) throw badRequest('常见问题标题不能为空');
    const res = pamsRun(
      `INSERT INTO biz_common_issue (summary, cause, solution, screenshots, tags, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,datetime('now','localtime'),datetime('now','localtime'))`,
      body.summary,
      body.cause || '',
      body.solution || '',
      JSON.stringify(Array.isArray(body.screenshots) ? body.screenshots : parseJson(body.screenshots, [])),
      JSON.stringify(Array.isArray(body.tags) ? body.tags : parseJson(body.tags, [])),
      body.created_by || operatorName(request),
    );
    return ok({ id: res.lastInsertRowid }, '创建成功');
  });

  fastify.put('/pams/common-issues/:id', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const id = Number(request.params.id);
    const old = pamsGet('SELECT * FROM biz_common_issue WHERE id = ?', id);
    if (!old) throw notFound('常见问题不存在');
    const body = request.body || {};
    pamsRun(
      `UPDATE biz_common_issue
          SET summary = ?, cause = ?, solution = ?, screenshots = ?, tags = ?, updated_at = datetime('now','localtime')
        WHERE id = ?`,
      body.summary ?? old.summary,
      body.cause ?? old.cause,
      body.solution ?? old.solution,
      JSON.stringify(Array.isArray(body.screenshots) ? body.screenshots : parseJson(body.screenshots, parseJson(old.screenshots, []))),
      JSON.stringify(Array.isArray(body.tags) ? body.tags : parseJson(body.tags, parseJson(old.tags, []))),
      id,
    );
    return ok({ id }, '更新成功');
  });

  fastify.delete('/pams/common-issues/:id', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const id = Number(request.params.id);
    const res = pamsRun('DELETE FROM biz_common_issue WHERE id = ?', id);
    if (!res.changes) throw notFound('常见问题不存在');
    return ok(null, '删除成功');
  });

  fastify.post('/pams/upload', { preHandler: fastify.requirePerm('pams', 'manage') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const ext = path.extname(data.filename || '').toLowerCase();
    if (!config.upload.allowedExt.includes(ext)) throw badRequest(`不支持的文件类型：${ext || '未知'}`);
    const buffer = await data.toBuffer();
    const dir = path.join(config.attachmentDir, 'pams');
    fs.mkdirSync(dir, { recursive: true });
    const safeName = path.basename(data.filename || `upload${ext}`).replace(/[/\\?%*:|"<>]/g, '_');
    const stored = `${randomBytes(8).toString('hex')}_${safeName}`;
    fs.writeFileSync(path.join(dir, stored), buffer);
    const protocol = request.headers['x-forwarded-proto'] || request.protocol || 'http';
    const host = request.headers.host || `localhost:${config.port}`;
    return ok({ url: `${protocol}://${host}/api/pams/files/${encodeURIComponent(stored)}` });
  });

  fastify.get('/pams/files/:name', async (request, reply) => {
    const filePath = path.join(config.attachmentDir, 'pams', path.basename(request.params.name));
    if (!fs.existsSync(filePath)) throw notFound('文件不存在');
    return reply.send(fs.createReadStream(filePath));
  });

  fastify.get('/pams/radar-options', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    const roles = radarAll('SELECT id, code, name, default_home, is_builtin FROM role ORDER BY id');
    const users = radarAll('SELECT id, phone, name, org, status FROM user ORDER BY name');
    const systems = radarAll('SELECT sys_code, sys_name, org, sector, sort FROM system ORDER BY sort, sys_code');
    const orgs = radarAll("SELECT attr_value, display_value, sort FROM dict_item WHERE category = 'org' ORDER BY sort");
    const sectors = radarAll("SELECT attr_value, display_value, sort FROM dict_item WHERE category = 'sector' ORDER BY sort");
    return ok({ roles, users, systems, orgs, sectors });
  });

  fastify.get('/pams/dicts', { preHandler: fastify.requirePerm('pams', 'view') }, async (request) => {
    const { dict_code } = request.query || {};
    const rows = dict_code
      ? pamsAll(`SELECT ${DICT_COLUMNS.join(',')} FROM sys_dict WHERE dict_code = ? ORDER BY sort_order, dict_id`, dict_code)
      : pamsAll(`SELECT ${DICT_COLUMNS.join(',')} FROM sys_dict ORDER BY dict_code, sort_order, dict_id`);
    return ok(rows);
  });

  fastify.post('/pams/dicts', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const body = request.body || {};
    if (!body.dict_code || !body.item_key || !body.item_value) {
      throw badRequest('字典类型、键值和显示值必填');
    }
    const res = pamsRun(
      `INSERT INTO sys_dict (dict_code, item_key, item_value, sort_order, description, is_system, is_default_val)
       VALUES (?,?,?,?,?,?,?)`,
      body.dict_code,
      body.item_key,
      body.item_value,
      Number(body.sort_order || 0),
      body.description || null,
      normalizeBool(body.is_system),
      normalizeBool(body.is_default_val),
    );
    return ok({ id: res.lastInsertRowid });
  });

  fastify.post('/pams/dicts/batch', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const { dict_code: dictCode, items } = request.body || {};
    if (!dictCode || !Array.isArray(items) || !items.length) throw badRequest('批量导入内容不能为空');
    let successCount = 0;
    pamsTx(() => {
      for (const [index, item] of items.entries()) {
        if (!item?.item_key || !item?.item_value) continue;
        pamsRun(
          `INSERT INTO sys_dict (dict_code, item_key, item_value, sort_order, description, is_system, is_default_val)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(dict_code, item_key) DO UPDATE SET
             item_value=excluded.item_value,
             sort_order=excluded.sort_order,
             description=excluded.description`,
          dictCode,
          String(item.item_key),
          String(item.item_value),
          Number(item.sort_order ?? (index + 1) * 10),
          item.description || null,
          normalizeBool(item.is_system),
          normalizeBool(item.is_default_val),
        );
        successCount += 1;
      }
    });
    return ok({ successCount }, `批量导入完成，成功 ${successCount} 条`);
  });

  fastify.post('/pams/dicts/default', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const { dict_code: dictCode, item_key: itemKey } = request.body || {};
    if (!dictCode || !itemKey) throw badRequest('字典类型和键值必填');
    const exists = pamsGet('SELECT dict_id FROM sys_dict WHERE dict_code = ? AND item_key = ?', dictCode, itemKey);
    if (!exists) throw notFound('字典项不存在');
    pamsTx(() => {
      pamsRun('UPDATE sys_dict SET is_default_val = 0 WHERE dict_code = ?', dictCode);
      pamsRun('UPDATE sys_dict SET is_default_val = 1 WHERE dict_code = ? AND item_key = ?', dictCode, itemKey);
    });
    return ok(null, '默认值已更新');
  });

  fastify.delete('/pams/dicts/clear', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const dictCode = request.query?.code || request.query?.dict_code;
    if (!dictCode) throw badRequest('缺少字典类型');
    const res = pamsRun('DELETE FROM sys_dict WHERE dict_code = ? AND COALESCE(is_system, 0) = 0', dictCode);
    return ok({ deleted: res.changes || 0 }, '清空成功');
  });

  fastify.put('/pams/dicts/:id', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const id = Number(request.params.id);
    const old = pamsGet('SELECT * FROM sys_dict WHERE dict_id = ?', id);
    if (!old) throw notFound();
    const body = request.body || {};
    pamsRun(
      `UPDATE sys_dict SET item_key=?, item_value=?, sort_order=?, description=?, is_default_val=?
       WHERE dict_id=?`,
      body.item_key ?? old.item_key,
      body.item_value ?? old.item_value,
      Number(body.sort_order ?? old.sort_order ?? 0),
      body.description ?? old.description,
      body.is_default_val === undefined ? old.is_default_val : normalizeBool(body.is_default_val),
      id,
    );
    return ok({ id });
  });

  fastify.delete('/pams/dicts/:id', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const id = Number(request.params.id);
    const row = pamsGet('SELECT * FROM sys_dict WHERE dict_id = ?', id);
    if (!row) throw notFound();
    if (row.is_system) throw badRequest('系统预设字典项不可删除');
    pamsRun('DELETE FROM sys_dict WHERE dict_id = ?', id);
    return ok(null, '删除成功');
  });

  fastify.get('/pams/ai-settings', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    return ok(pamsAll('SELECT * FROM sys_ai_settings ORDER BY setting_key'));
  });

  fastify.put('/pams/ai-settings', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const settings = Array.isArray(request.body?.settings) ? request.body.settings : [];
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    pamsTx(() => {
      for (const item of settings) {
        if (!item?.key) continue;
        pamsRun(
          `INSERT INTO sys_ai_settings (setting_key, setting_value, description, updated_at)
           VALUES (?,?,?,?)
           ON CONFLICT(setting_key) DO UPDATE SET
             setting_value=excluded.setting_value,
             updated_at=excluded.updated_at`,
          item.key,
          String(item.value ?? ''),
          item.description || null,
          now,
        );
      }
    });
    return ok(null, '设置已保存');
  });

  fastify.post('/pams/ai-settings/test', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    const apiUrl = pamsGet("SELECT setting_value FROM sys_ai_settings WHERE setting_key = 'openai_api_url'")?.setting_value;
    const model = pamsGet("SELECT setting_value FROM sys_ai_settings WHERE setting_key = 'openai_model'")?.setting_value;
    if (!apiUrl || !model) throw badRequest('AI配置不完整，请先配置 API URL 和模型名称');
    return ok({ response: `配置已读取：${model}` }, '连接配置可用');
  });

  fastify.get('/pams/roles/mapping', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    const radarRoles = radarAll('SELECT id, code, name FROM role ORDER BY id');
    const pamsRoles = pamsAll(
      "SELECT item_key, item_value, description FROM sys_dict WHERE dict_code = 'user_role' ORDER BY sort_order, dict_id",
    );
    const mappings = pamsAll('SELECT * FROM pams_role_mapping ORDER BY COALESCE(radar_role_id, 0), radar_role_code')
      .map((row) => ({ ...row, pams_role_name: syncPamsRoleName(row) }));
    return ok({ radarRoles, pamsRoles, mappings });
  });

  fastify.put('/pams/roles/mapping', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const mappings = Array.isArray(request.body?.mappings) ? request.body.mappings : [];
    pamsTx(() => {
      for (const item of mappings) {
        if (!item?.radar_role_code || !item?.pams_role_key) continue;
        const radar = radarAll('SELECT id, code, name FROM role WHERE code = ?', item.radar_role_code)[0];
        if (!radar) continue;
        const pamsRole = pamsGet(
          "SELECT item_key, item_value FROM sys_dict WHERE dict_code = 'user_role' AND item_key = ?",
          item.pams_role_key,
        );
        if (!pamsRole) continue;
        pamsRun(
          `INSERT INTO pams_role_mapping (radar_role_id, radar_role_code, radar_role_name, pams_role_key, pams_role_name)
           VALUES (?,?,?,?,?)
           ON CONFLICT(radar_role_code) DO UPDATE SET
             radar_role_id=excluded.radar_role_id,
             radar_role_name=excluded.radar_role_name,
             pams_role_key=excluded.pams_role_key,
             pams_role_name=excluded.pams_role_name,
             updated_at=datetime('now','localtime')`,
          radar.id, radar.code, radar.name, pamsRole.item_key, pamsRole.item_value,
        );
      }
    });
    return ok(null, '角色映射已保存');
  });

  fastify.get('/pams/permissions/config', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    const row = pamsGet("SELECT value FROM pams_permission_config WHERE key = 'permissions'");
    return ok(parseJson(row?.value, {}));
  });

  fastify.get('/pams/config/permissions', { preHandler: fastify.requirePerm('pams', 'view') }, async () => {
    const row = pamsGet("SELECT value FROM pams_permission_config WHERE key = 'permissions'");
    return ok(parseJson(row?.value, {}));
  });

  fastify.put('/pams/permissions/config', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const value = request.body?.config;
    if (!value || typeof value !== 'object') throw badRequest('权限配置不能为空');
    pamsRun(
      `INSERT INTO pams_permission_config (key, value, updated_at)
       VALUES ('permissions', ?, datetime('now','localtime'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      JSON.stringify(value),
    );
    return ok(null, '权限配置已保存');
  });

  fastify.post('/pams/config/permissions', { preHandler: fastify.requirePerm('pams', 'config') }, async (request) => {
    const value = request.body?.config || request.body;
    if (!value || typeof value !== 'object') throw badRequest('权限配置不能为空');
    pamsRun(
      `INSERT INTO pams_permission_config (key, value, updated_at)
       VALUES ('permissions', ?, datetime('now','localtime'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      JSON.stringify(value),
    );
    return ok(null, '权限配置已保存');
  });
}
