/**
 * 文件：server/src/modules/overview/api/routes.js
 * 说明：链路节点状态分 done(全部终态)/doing(进行中)/pending(无任务)；非功能/安全按需出现。
 * 用途：版本概览模块接口。按实施机构聚合当前投产窗口下的需求及其全链路进展，
 *       并提供单需求的 5 层全生命周期详情数据（需求/开发/SIT/NFT/SEC/UAT/投产）。
 * 作者：hengguan
 */

import { get, all } from '../../../platform/persistence/index.js';
import { appendStageExcelValues, getStageContentConfig, getStageExcelColumns, isIssueTerminalStatus, isTerminalStatus } from '../../settings/process-configuration/index.js';
import { listByEntity } from '../../../platform/attachments/index.js';
import { windowIds, inClause, formatAttachments, getDictDisplayMap, resolveOrganizationValues } from '../../settings/reference-data/index.js';
import { ok, notFound, forbidden, parseJsonArray } from '../../../platform/runtime/index.js';
import { exportXlsx } from '../../../platform/import-export/index.js';
import { getWorkItem, formatImpactItemsText, formatCoverageText } from '../../development/index.js';
import { appliedReleasePointsForWorkItems, workItemCodesForAppliedReleasePoints, withArtifactReleaseStatusDefaults } from '../../release/index.js';
import { buildTaskStatusChain } from '../index.js';
import { isOrganizationRestricted, workItemMatchesOrganization } from '../../../shared/utils/organization-scope.js';

async function assertOverviewOrganizationAccess(item, user) {
  if (!isOrganizationRestricted(user)) return;
  const systems = await all('SELECT sys_code, org FROM system');
  const orgByCode = Object.fromEntries(systems.map((system) => [system.sys_code, system.org]));
  if (!workItemMatchesOrganization(item, await resolveOrganizationValues(user?.org), orgByCode)) throw forbidden('无该机构数据权限');
}

/** 计算一组任务的节点状态（含单一代表状态 status，供阶段标签展示） */
function nodeState(tasks) {
  if (!tasks.length) return { state: 'pending', text: null, status: null };
  const allTerminal = tasks.every((t) => isTerminalStatus(t.status));
  const nonTerminal = tasks.find((t) => !isTerminalStatus(t.status));
  const status = nonTerminal ? nonTerminal.status : tasks[tasks.length - 1].status;
  const text = tasks.map((t) => t.status).join('、');
  return { state: allTerminal ? 'done' : 'doing', text, status };
}

/** 宽表按阶段拼接动态扩展字段和交付件，避免同名配置项覆盖且不跨实体类型取值。 */
async function appendOverviewStageColumns(rows, { scopeKey, prefix, idKey, matches }) {
  const stageColumns = await getStageExcelColumns(scopeKey);
  if (!stageColumns.length) return { columns: [], rows };
  const stageRows = rows.map((row) => ({ id: matches(row) ? row[idKey] : null }));
  const values = await appendStageExcelValues(scopeKey, stageRows);
  const columns = stageColumns.map((column) => ({
    ...column,
    key: `${scopeKey}__${column.key}`,
    title: `${prefix}：${column.title}`,
  }));
  return {
    columns,
    rows: rows.map((row, index) => ({
      ...row,
      ...Object.fromEntries(stageColumns.map((column) => [
        `${scopeKey}__${column.key}`, values[index]?.[column.key] || '',
      ])),
    })),
  };
}

// 宽表复用同一列展示需求和工单时，任一对应阶段仍可见才保留该列；单阶段列严格遵从该阶段配置。
const OVERVIEW_NATIVE_COLUMN_BINDINGS = {
  req_code: [['requirement', 'req_code'], ['ticket', 'ticket_code']],
  req_title: [['requirement', 'title'], ['ticket', 'title']],
  req_summary: [['requirement', 'summary'], ['ticket', 'summary']],
  req_status: [['requirement', 'status'], ['ticket', 'status']],
  req_type: [['requirement', 'req_type'], ['ticket', 'ticket_type']],
  is_accounting: [['requirement', 'is_accounting'], ['ticket', 'is_accounting']],
  priority: [['requirement', 'priority'], ['ticket', 'priority']],
  propose_dept: [['requirement', 'propose_dept'], ['ticket', 'propose_dept']],
  proposer: [['requirement', 'proposer'], ['ticket', 'proposer']],
  yn_owner: [['requirement', 'yn_owner'], ['ticket', 'yn_owner']],
  jk_owner: [['requirement', 'jk_owner'], ['ticket', 'jk_owner']],
  propose_time: [['requirement', 'propose_time'], ['ticket', 'propose_time']],
  expected_release_date: [['requirement', 'expected_release_date'], ['ticket', 'expected_release_date']],
  issue_no: [['requirement', 'issue_no'], ['ticket', 'issue_no']],
  receiver: [['requirement', 'receiver'], ['ticket', 'receiver']],
  workload: [['requirement', 'workload'], ['ticket', 'workload']],
  registrar: [['requirement', 'registrar'], ['ticket', 'registrar']],
  implementation_org: [['requirement', 'implementation_org'], ['ticket', 'implementation_org']],
  main_systems: [['requirement', 'main_systems'], ['ticket', 'main_systems']],
  collab_dev_systems: [['requirement', 'collab_dev_systems'], ['ticket', 'collab_dev_systems']],
  collab_test_systems: [['requirement', 'collab_test_systems'], ['ticket', 'collab_test_systems']],
  dev_name: [['dev', 'task_name']], dev_content: [['dev', 'content']], dev_status: [['dev', 'status']],
  dev_owner: [['dev', 'owner']], dev_intake_owner: [['dev', 'intake_owner']], dev_system: [['dev', 'impl_system']], dev_org: [['dev', 'impl_org']],
  dev_plan_start: [['dev', 'plan_start']], dev_plan_end: [['dev', 'plan_end']], dev_actual_start: [['dev', 'actual_start']], dev_actual_end: [['dev', 'actual_end']],
  sit_name: [['test.SIT', 'task_name']], sit_status: [['test.SIT', 'status']], sit_owner: [['test.SIT', 'owner']], sit_intake_owner: [['test.SIT', 'intake_owner']], sit_system: [['test.SIT', 'impl_system']], sit_org: [['test.SIT', 'impl_org']], sit_plan_start: [['test.SIT', 'plan_start']], sit_plan_end: [['test.SIT', 'plan_end']], sit_actual_start: [['test.SIT', 'actual_start']], sit_actual_end: [['test.SIT', 'actual_end']],
  uat_name: [['test.UAT', 'task_name']], uat_status: [['test.UAT', 'status']], uat_owner: [['test.UAT', 'owner']], uat_intake_owner: [['test.UAT', 'intake_owner']], uat_system: [['test.UAT', 'impl_system']], uat_org: [['test.UAT', 'impl_org']], uat_plan_start: [['test.UAT', 'plan_start']], uat_plan_end: [['test.UAT', 'plan_end']], uat_actual_start: [['test.UAT', 'actual_start']], uat_actual_end: [['test.UAT', 'actual_end']],
  nft_name: [['test.NFT', 'task_name']], nft_status: [['test.NFT', 'status']], nft_owner: [['test.NFT', 'owner']], nft_intake_owner: [['test.NFT', 'intake_owner']], nft_system: [['test.NFT', 'impl_system']], nft_org: [['test.NFT', 'impl_org']], nft_plan_start: [['test.NFT', 'plan_start']], nft_plan_end: [['test.NFT', 'plan_end']], nft_actual_start: [['test.NFT', 'actual_start']], nft_actual_end: [['test.NFT', 'actual_end']],
  sec_name: [['test.SEC', 'task_name']], sec_status: [['test.SEC', 'status']], sec_owner: [['test.SEC', 'owner']], sec_intake_owner: [['test.SEC', 'intake_owner']], sec_system: [['test.SEC', 'impl_system']], sec_org: [['test.SEC', 'impl_org']], sec_plan_start: [['test.SEC', 'plan_start']], sec_plan_end: [['test.SEC', 'plan_end']], sec_actual_start: [['test.SEC', 'actual_start']], sec_actual_end: [['test.SEC', 'actual_end']],
  release_status: [['release', 'status']], release_owner: [['release', 'owner']],
};

async function visibleOverviewColumns(columns) {
  const scopeKeys = [...new Set(Object.values(OVERVIEW_NATIVE_COLUMN_BINDINGS).flat().map(([scopeKey]) => scopeKey))];
  const fieldMaps = new Map(await Promise.all(scopeKeys.map(async (scopeKey) => [
    scopeKey,
    new Map((await getStageContentConfig(scopeKey)).fields.filter((field) => field.field_kind === 'native').map((field) => [field.field_key, field])),
  ])));
  return columns
    .filter((column) => {
      const bindings = OVERVIEW_NATIVE_COLUMN_BINDINGS[column.key];
      if (!bindings) return true;
      return bindings.some(([scopeKey, fieldKey]) => fieldMaps.get(scopeKey)?.get(fieldKey)?.visible);
    })
    .map((column) => {
      const bindings = OVERVIEW_NATIVE_COLUMN_BINDINGS[column.key];
      if (!bindings || bindings.length !== 1) return column;
      const [scopeKey, fieldKey] = bindings[0];
      const field = fieldMaps.get(scopeKey)?.get(fieldKey);
      if (!field?.label) return column;
      const testPrefix = {
        'test.SIT': '应用组装', 'test.UAT': '用户', 'test.NFT': '非功能', 'test.SEC': '安全',
      }[scopeKey];
      return { ...column, title: testPrefix ? `${testPrefix}${field.label}` : field.label };
    });
}

/**
 * 取需求实施机构逻辑：
 * 1. 第一优先级：取需求/工单自身填写的实施机构（implementation_org）。
 * 2. 第二优先级：取系统的第一个主责系统对应的所属机构（org）。
 * 3. 第三优先级：默认兜底值 "未分配机构"。
 */
export function reqOrg(req, sysMap) {
  const implementationOrg = String(req.implementation_org || '').trim();
  if (implementationOrg) return implementationOrg;

  const main = parseJsonArray(req.main_systems);

  // 未填写工作项实施机构时，才按第一个主责系统的所属机构回退。
  if (main.length) {
    const org = sysMap[main[0]]?.org;
    if (org) return org;
  }

  // 不按提出部门分组；没有明确实施机构时统一归入未分配。
  return '未分配机构';
}

/** 系统编号转名称（标签展示用；sysMap 预载） */
function sysNames(codes, sysMap) {
  return (codes || []).map((c) => sysMap[c]?.name || c);
}

/**
 * 概览卡片标题下的标签与卡片分组机构是两套业务口径：
 * 主责系统来自需求/工单本身，实施机构也只取需求/工单填写值，不能被开发任务或系统所属机构替代。
 */
export function overviewCardLabels(req, sysMap, orgDisplayMap = {}) {
  const mainSystem = parseJsonArray(req.main_systems)[0];
  const implementationOrg = req.implementation_org;
  return {
    systemName: mainSystem ? (sysMap[mainSystem]?.name || mainSystem) : '未确定主责系统',
    systemOrg: implementationOrg ? (orgDisplayMap[implementationOrg] || implementationOrg) : '—',
  };
}

/** 按姓名解析人员（姓名 + 所属机构 + 手机号），兼容历史对象值。 */
async function resolvePerson(person) {
  const historicalPerson = person && typeof person === 'object' && !Array.isArray(person) ? person : null;
  const name = typeof person === 'string'
    ? person.trim()
    : (typeof historicalPerson?.name === 'string' ? historicalPerson.name.trim() : '');
  if (!name) return null;

  const u = await get('SELECT name, org, phone FROM user WHERE name = ? LIMIT 1', name);
  return u || {
    name,
    org: typeof historicalPerson?.org === 'string' ? historicalPerson.org : null,
    phone: typeof historicalPerson?.phone === 'string' ? historicalPerson.phone : null,
  };
}

/** 按编号解析系统（编号 + 名称 + 所属机构 + 业务板块） */
async function resolveSystem(code) {
  if (!code) return null;
  return await get('SELECT sys_code, sys_name, org, sector FROM system WHERE sys_code = ?', code)
    || { sys_code: code, sys_name: code, org: null, sector: null };
}

/** 读取引用了该需求/问题编号的投产申请制品；沿用 release 的历史投产状态默认化，供投产列展示。 */
async function entityArtifacts(code) {
  if (!code) return [];
  const rows = await all(
    `SELECT ra.*, s.sys_name FROM release_apply_reference rar
       JOIN release_apply ra ON ra.id = rar.release_apply_id
       LEFT JOIN system s ON s.sys_code = ra.change_system
      WHERE rar.ref_code = ?
     ORDER BY ra.id DESC`,
    code,
  );
  return await Promise.all(rows.map(async (r) => {
    const units = await withArtifactReleaseStatusDefaults(parseJsonArray(r.delivery_units));
    return {
      id: r.id,
      change_code: r.change_code,
      change_system: r.change_system,
      change_system_name: r.sys_name || r.change_system || null,
      impl_org: r.impl_org,
      change_content: r.change_content,
      units,
    };
  }));
}

/** 构建单需求/工单链路概要，复用公开任务状态契约保持所有入口口径一致。 */
function buildChain(req, devMap, testMap, rtMap) {
  const chain = buildTaskStatusChain(req, devMap, testMap, rtMap, { analysisLabel: 'entity' });
  return {
    nodes: chain.nodes,
    currentStage: chain.shortDisplay,
    currentStageFull: chain.display,
    currentStageStatus: chain.status,
  };
}

/** 问题状态节点：终态由 issue_status 字典标记，其余有状态为 doing，无状态为 pending */
function issueStatusNode(status) {
  if (!status) return { key: '问题', label: '问题状态', state: 'pending', text: null, status: null };
  const base = nodeState([{ status }]);
  if (isIssueTerminalStatus(status)) base.state = 'done';
  return { key: '问题', label: '问题状态', ...base };
}

/**
 * 把「投产申请关联的问题」追加为概览卡片（与需求卡片混排于同一实施机构分组下）。
 * 范围：当前投产窗口（或指定投产点）下的投产申请所关联的问题；进度仅含「问题状态 + 投产」两项。
 * 仅套用对问题适用的筛选（实施机构/编号/内容）；命中需求专属筛选（阶段/任务状态/系统）时不纳入问题，避免误导。
 */
async function appendIssueCards({ groups, body, targetReleasePointIds, sysMap, rtMap, filters }) {
  const { orgsFilter, reqCodeFilter, contentFilter, stageFilter, taskStatusFilter, mainSystemsFilter, collabSystemsFilter } = filters;
  // 命中需求专属筛选时，问题卡片整体不参与
  if (stageFilter || taskStatusFilter || mainSystemsFilter || collabSystemsFilter) return;

  // 1) 取窗口（或指定投产点）下的投产申请
  let raSql = `SELECT rar.ref_code, ra.impl_org
    FROM release_apply_reference rar
    JOIN release_apply ra ON ra.id = rar.release_apply_id`;
  const raParams = [];
  if (targetReleasePointIds) {
    if (!targetReleasePointIds.length) return;
    // release_apply_reference 与 release_apply 都有同名列；筛选工作项引用的申请投产点，必须显式限定关联表。
    raSql += ` WHERE rar.release_point_id IN (${targetReleasePointIds.map(() => '?').join(',')})`;
    raParams.push(...targetReleasePointIds);
  } else {
    // release_apply_reference 与 release_apply 均含投产点字段；窗口筛选必须限定为申请记录，
    // 避免 SQLite/TDSQL 在 JOIN 查询中将 release_point_id 判定为歧义列。
    const win = inClause('ra.release_point_id', windowIds(body));
    if (win.where) { raSql += ` WHERE ${win.where}`; raParams.push(...win.params); }
  }
  const applies = await all(raSql, ...raParams);
  if (!applies.length) return;

  // 2) 问题主数据 + 系统名→机构 映射（问题的 system 字段多为系统名称）
  const issueMap = {};
  for (const it of await all('SELECT issue_code, status, summary, system FROM issue')) issueMap[it.issue_code] = it;
  const workItemCodes = new Set([
    ...(await all('SELECT req_code AS code FROM requirement')).map((r) => r.code),
    ...(await all('SELECT ticket_code AS code FROM ticket')).map((r) => r.code),
  ]);
  const sysNameOrg = {};
  for (const s of await all('SELECT sys_name, org FROM system')) sysNameOrg[s.sys_name] = s.org;

  // 3) 收集关联到的问题编号（去重，记录首个关联申请的实施机构作分组兜底）
  const issueImplOrg = {};
  for (const ra of applies) {
    const code = ra.ref_code;
    // 工单编号按业务口径等于问题编号；若编号已存在于需求/工单表，概览必须按工作项展示，不能再重复追加为问题卡片。
    if (issueMap[code] && !workItemCodes.has(code) && !(code in issueImplOrg)) issueImplOrg[code] = ra.impl_org || null;
  }

  // 4) 逐个问题生成卡片
  for (const code of Object.keys(issueImplOrg)) {
    const it = issueMap[code];
    const org = (it.system && (sysMap[it.system]?.org || sysNameOrg[it.system])) || issueImplOrg[code] || '未分配机构';

    if (orgsFilter && !orgsFilter.includes(org)) continue;
    if (reqCodeFilter && !code.toLowerCase().includes(reqCodeFilter)) continue;
    if (contentFilter) {
      const sumMatch = it.summary && it.summary.toLowerCase().includes(contentFilter);
      if (!sumMatch && !code.toLowerCase().includes(contentFilter)) continue;
    }

    const rtStatus = rtMap[code];
    const rt = rtStatus ? { status: rtStatus } : null;
    const nodes = [
      issueStatusNode(it.status),
      { key: '投产', label: '投产', ...nodeState(rt ? [{ status: rt.status }] : []) },
    ];
    let current = nodes.find((n) => n.state === 'doing') || nodes.filter((n) => n.state === 'done').pop() || nodes[0];

    // 物理子系统：问题表存的是子系统编号，按系统表解析为名称展示
    const sysName = it.system ? (sysMap[it.system]?.name || it.system) : '—';
    const card = {
      entityType: 'issue',
      code,
      req_code: code,
      title: it.summary || code,
      systems: sysName !== '—' ? [sysName] : [],
      systemName: sysName,
      systemOrg: org,
      currentStage: `${current.label}-${current.status || '未开始'}`,
      nodes,
    };
    (groups[org] ||= []).push(card);
  }
}

export default async function overviewRoutes(fastify) {
  // 概览列表（按实施机构分组）
  fastify.post('/overview/list', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const body = request.body || {};

    // 解析筛选条件
    const filters = Array.isArray(body.filters) ? body.filters : [];

    let targetReleasePointIds = null;
    let reqCodeFilter = null;
    let contentFilter = null;
    let orgsFilter = null;
    let stageFilter = null;
    let taskStatusFilter = null;
    let mainSystemsFilter = null;
    let collabSystemsFilter = null;

    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;

      if (f.field === 'release_point_id') {
        targetReleasePointIds = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'req_code') {
        reqCodeFilter = String(f.value).toLowerCase().trim();
      } else if (f.field === 'content') {
        contentFilter = String(f.value).toLowerCase().trim();
      } else if (f.field === 'org') {
        orgsFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'stage') {
        stageFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'taskStatus') {
        taskStatusFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'main_systems') {
        mainSystemsFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'collab_systems') {
        collabSystemsFilter = Array.isArray(f.value) ? f.value : [f.value];
      }
    }

    const reqs = (await all('SELECT * FROM requirement ORDER BY id DESC')).map((r) => ({ ...r, entityType: 'requirement', firstLabel: '需求' }));
    const tickets = (await all('SELECT * FROM ticket ORDER BY id DESC')).map((t) => ({ ...t, req_code: t.ticket_code, entityType: 'ticket', firstLabel: '工单' }));
    const selectedPointIds = targetReleasePointIds || windowIds(body);
    const allWorkItems = [...reqs, ...tickets];
    const matchedCodes = await workItemCodesForAppliedReleasePoints(allWorkItems.map((item) => item.req_code), selectedPointIds);
    const workItems = matchedCodes ? allWorkItems.filter((item) => matchedCodes.includes(item.req_code)) : allWorkItems;
    // 关联状态与系统主数据一次性载入并分桶，替代逐需求 N+1 查询
    const sysMap = {};
    for (const s of await all('SELECT sys_code, sys_name, org FROM system')) {
      sysMap[s.sys_code] = { name: s.sys_name, org: s.org };
    }
    const orgDisplayMap = await getDictDisplayMap('org');
    const devMap = {};
    for (const d of await all('SELECT id, req_code, status, impl_system, impl_org FROM dev_task ORDER BY id ASC')) {
      (devMap[d.req_code] ||= []).push(d);
    }
    const testMap = {};
    for (const t of await all('SELECT req_code, test_type, status FROM test_task')) {
      const bucket = (testMap[t.req_code] ||= {});
      (bucket[t.test_type] ||= []).push({ status: t.status });
    }
    const rtMap = {};
    for (const rt of await all('SELECT req_code, status FROM release_task')) {
      rtMap[rt.req_code] = rt.status;
    }

    const groups = {};
    for (const r of workItems) {
      if (isOrganizationRestricted(request.currentUser) && !workItemMatchesOrganization(r, await resolveOrganizationValues(request.currentUser?.org), Object.fromEntries(Object.entries(sysMap).map(([code, system]) => [code, system.org])))) continue;
      const org = reqOrg(r, sysMap);
      const chain = buildChain(r, devMap, testMap, rtMap, r.firstLabel);
      const mainSystems = parseJsonArray(r.main_systems);
      const collabDevSystems = parseJsonArray(r.collab_dev_systems);
      const collabTestSystems = parseJsonArray(r.collab_test_systems);
      const names = sysNames(mainSystems, sysMap);
      const cardLabels = overviewCardLabels(r, sysMap, orgDisplayMap);

      // 1. 实施机构
      if (orgsFilter && !orgsFilter.includes(org)) continue;

      // 2. 需求/工单编号
      if (reqCodeFilter && !r.req_code.toLowerCase().includes(reqCodeFilter)) continue;

      // 3. 需求/工单内容
      if (contentFilter) {
        const titleMatch = r.title && r.title.toLowerCase().includes(contentFilter);
        const summaryMatch = r.summary && r.summary.toLowerCase().includes(contentFilter);
        if (!titleMatch && !summaryMatch) continue;
      }

      // 4. 任务阶段
      let current = chain.nodes.find((n) => n.state === 'doing');
      if (!current) {
        const dones = chain.nodes.filter((n) => n.state === 'done');
        current = dones[dones.length - 1] || chain.nodes[0];
      }
      if (stageFilter && !stageFilter.includes(current.label)) continue;

      // 5. 任务状态
      if (taskStatusFilter) {
        const matchesStatus = taskStatusFilter.some(ts => {
          if (ts.includes('-')) {
            const [stg, stat] = ts.split('-');
            return current.label === stg && current.status === stat;
          }
          return current.status === ts;
        });
        if (!matchesStatus) continue;
      }

      // 6. 主责系统
      if (mainSystemsFilter && !mainSystems.some(s => mainSystemsFilter.includes(s))) continue;

      // 7. 协同系统
      if (collabSystemsFilter) {
        const hasCollab = collabDevSystems.some(s => collabSystemsFilter.includes(s)) ||
                          collabTestSystems.some(s => collabSystemsFilter.includes(s));
        if (!hasCollab) continue;
      }

      const card = {
        entityType: r.entityType,
        code: r.req_code,
        req_code: r.req_code,
        title: r.title,
        systems: names,
        systemName: cardLabels.systemName,
        systemOrg: cardLabels.systemOrg,
        currentStage: chain.currentStage,
        currentStageFull: chain.currentStageFull,
        currentStageStatus: chain.currentStageStatus,
        nodes: chain.nodes,
      };
      (groups[org] ||= []).push(card);
    }

    // ── 投产申请关联的「问题」也纳入概览（卡片样式同需求，进度仅「问题状态 + 投产」两项） ──
    await appendIssueCards({
      groups, body, targetReleasePointIds, sysMap, rtMap,
      filters: { orgsFilter, reqCodeFilter, contentFilter, stageFilter, taskStatusFilter, mainSystemsFilter, collabSystemsFilter },
    });

    // 概览卡片在数据量大时会显著放大接口响应与浏览器布局成本；按卡片分页，分组结构保持原接口兼容。
    const page = Math.max(1, Number(body.page) || 1);
    const pageSize = Math.min(200, Math.max(20, Number(body.pageSize) || 100));
    const cards = Object.entries(groups).flatMap(([org, groupCards]) => groupCards.map((card) => ({ org, card })));
    const pageCards = cards.slice((page - 1) * pageSize, page * pageSize);
    const pageGroups = {};
    for (const { org, card } of pageCards) (pageGroups[org] ||= []).push(card);
    const list = Object.entries(pageGroups).map(([org, groupCards]) => ({ org, cards: groupCards }));
    return ok({ list, total: cards.length, page, pageSize, hasMore: page * pageSize < cards.length });
  });

  // 单需求/工单 5 层全生命周期详情
  fastify.get('/overview/:reqCode/detail', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const reqCode = request.params.reqCode;
    const req = await getWorkItem(reqCode);
    if (!req || !['requirement', 'ticket'].includes(req.entity_type)) throw notFound('需求/工单不存在');
    await assertOverviewOrganizationAccess(req, request.currentUser);

    const attachOf = (type, id) => listByEntity(type, id);
    // 任务：附加 附件 + 负责人解析 + 实施系统解析
    const withInfo = (rows, type) => Promise.all(rows.map(async (t) => ({
      ...t,
      attachments: await attachOf(type, t.id),
      ownerInfo: await resolvePerson(t.owner),
      systemInfo: await resolveSystem(t.impl_system),
    })));

    const dev = await withInfo(await all('SELECT * FROM dev_task WHERE req_code = ? ORDER BY id', reqCode), 'dev');
    const sit = await withInfo(await all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'SIT'), 'test');
    const nft = await withInfo(await all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'NFT'), 'test');
    const sec = await withInfo(await all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'SEC'), 'test');
    const uat = await withInfo(await all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'UAT'), 'test');
    const rt = await get('SELECT * FROM release_task WHERE req_code = ?', reqCode);
    const releaseDetail = rt ? {
      ...rt,
      ownerInfo: await resolvePerson(rt.owner),
      systems: await Promise.all((await all('SELECT * FROM release_system WHERE release_task_id = ?', rt.id))
        .map(async (s) => ({ ...s, systemInfo: await resolveSystem(s.system_code) }))),
      signoffs: await Promise.all((await all('SELECT * FROM release_signoff WHERE release_task_id = ?', rt.id))
        .map(async (s) => ({ ...s, signerInfo: await resolvePerson(s.signer_name) }))),
      artifacts: await entityArtifacts(reqCode),
    } : null;

    // 需求/工单：解析人员、主责系统与协同改造系统
    const mainCodes = req.main_systems || [];
    const collabCodes = req.collab_dev_systems || [];
    const applyPointMap = await appliedReleasePointsForWorkItems([req.req_code]);
    const proposerNames = (() => {
      if (!req.proposer) return [];
      return Array.isArray(req.proposer) ? req.proposer : [req.proposer];
    })();

    const requirement = {
      ...req,
      req_type: req.entity_type === 'ticket' ? req.ticket_type : req.req_type,
      apply_release_points: (applyPointMap[req.req_code] || []).map((point) => point.release_date),
      attachments: await attachOf(req.entity_type, req.id),
      proposerInfo: (await Promise.all(proposerNames.map(resolvePerson))).filter(Boolean),
      ynOwnerInfo: await resolvePerson(req.yn_owner),
      jkOwnerInfo: await resolvePerson(req.jk_owner),
      mainSystemsInfo: await Promise.all(mainCodes.map(resolveSystem)),
      collabDevSystemsInfo: await Promise.all(collabCodes.map(resolveSystem)),
    };

    return ok({ entityType: req.entity_type, requirement, dev, sit, nft, sec, uat, release: releaseDetail });
  });

  // 问题两列概览详情（问题 + 投产）：供版本概览中问题卡片点开
  fastify.get('/overview/issue/:code/detail', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const code = request.params.code;
    const issue = await get('SELECT * FROM issue WHERE issue_code = ?', code);
    if (!issue) throw notFound('问题不存在');

    // 关联投产申请（取最早一条）以展示申请投产点。
    const ap = await get(
      `SELECT ra.release_point_id FROM release_apply_reference rar
         JOIN release_apply ra ON ra.id = rar.release_apply_id
        WHERE rar.ref_code = ? ORDER BY ra.id ASC LIMIT 1`,
      code,
    );
    const rp = ap?.release_point_id ? await get('SELECT release_date FROM release_point WHERE id = ?', ap.release_point_id) : null;

    // 投产任务（与需求详情同款结构：负责人 + 会签 + 系统）
    const rt = await get('SELECT * FROM release_task WHERE req_code = ?', code);
    const releaseDetail = rt ? {
      ...rt,
      ownerInfo: await resolvePerson(rt.owner),
      systems: await Promise.all((await all('SELECT * FROM release_system WHERE release_task_id = ?', rt.id))
        .map(async (s) => ({ ...s, systemInfo: await resolveSystem(s.system_code) }))),
      signoffs: await Promise.all((await all('SELECT * FROM release_signoff WHERE release_task_id = ?', rt.id))
        .map(async (s) => ({ ...s, signerInfo: await resolvePerson(s.signer_name) }))),
      artifacts: await entityArtifacts(code),
    } : null;

    const issueOut = {
      ...issue,
      release_point_id: ap?.release_point_id || null,
      release_date: rp ? rp.release_date : null,
      systemInfo: await resolveSystem(issue.system),
    };
    return ok({ issue: issueOut, release: releaseDetail });
  });

  // 需求/工单全流程变更历史
  fastify.get('/overview/:reqCode/audit', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const reqCode = request.params.reqCode;
    const req = await getWorkItem(reqCode);
    if (!req || !['requirement', 'ticket'].includes(req.entity_type)) throw notFound('需求/工单不存在');

    const rows = await all(
      `SELECT id, entity_type, entity_code, action, operator, field, old_value, new_value, created_at
       FROM audit_log
       WHERE (
          (entity_type = ? AND entity_id = ?)
          OR (entity_type = 'dev' AND entity_id IN (SELECT id FROM dev_task WHERE req_code = ?))
          OR (entity_type = 'test' AND entity_id IN (SELECT id FROM test_task WHERE req_code = ?))
          OR (entity_type = 'release' AND entity_id IN (SELECT id FROM release_task WHERE req_code = ?))
       )
         AND NOT (entity_type = 'release' AND (COALESCE(field, '') LIKE '会签-%-签署人' OR COALESCE(field, '') LIKE '会签-%-签署时间'))
       ORDER BY id DESC`,
      req.entity_type, req.id, reqCode, reqCode, reqCode
    );
    return ok(rows);
  });

  // 导出版本概览宽表
  fastify.post('/overview/export', { preHandler: fastify.requirePerm('overview', 'view') }, async (request, reply) => {
    const body = request.body || {};

    // 1. 复用 /overview/list 的筛选逻辑找出匹配的需求
    const filters = Array.isArray(body.filters) ? body.filters : [];

    let targetReleasePointIds = null;
    let reqCodeFilter = null;
    let contentFilter = null;
    let orgsFilter = null;
    let stageFilter = null;
    let taskStatusFilter = null;
    let mainSystemsFilter = null;
    let collabSystemsFilter = null;

    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;

      if (f.field === 'release_point_id') {
        targetReleasePointIds = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'req_code') {
        reqCodeFilter = String(f.value).toLowerCase().trim();
      } else if (f.field === 'content') {
        contentFilter = String(f.value).toLowerCase().trim();
      } else if (f.field === 'org') {
        orgsFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'stage') {
        stageFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'taskStatus') {
        taskStatusFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'main_systems') {
        mainSystemsFilter = Array.isArray(f.value) ? f.value : [f.value];
      } else if (f.field === 'collab_systems') {
        collabSystemsFilter = Array.isArray(f.value) ? f.value : [f.value];
      }
    }

    const reqs = (await all('SELECT * FROM requirement ORDER BY id DESC')).map((r) => ({ ...r, entityType: 'requirement', firstLabel: '需求' }));
    const tickets = (await all('SELECT * FROM ticket ORDER BY id DESC')).map((t) => ({ ...t, req_code: t.ticket_code, req_type: t.ticket_type, entityType: 'ticket', firstLabel: '工单' }));
    const selectedPointIds = targetReleasePointIds || windowIds(body);
    const allWorkItems = [...reqs, ...tickets];
    const matchedCodes = await workItemCodesForAppliedReleasePoints(allWorkItems.map((item) => item.req_code), selectedPointIds);
    const workItems = matchedCodes ? allWorkItems.filter((item) => matchedCodes.includes(item.req_code)) : allWorkItems;
    const [applyPointMap, orgDisplayMap, statusDisplayMap, reqTypeDisplayMap, ticketTypeDisplayMap, deptDisplayMap] = await Promise.all([
      appliedReleasePointsForWorkItems(workItems.map((item) => item.req_code)),
      getDictDisplayMap('org'),
      getDictDisplayMap('process_status'), getDictDisplayMap('req_type'), getDictDisplayMap('ticket_type'), getDictDisplayMap('req_dept'),
    ]);

    const sysMap = {};
    for (const s of await all('SELECT sys_code, sys_name, org FROM system')) {
      sysMap[s.sys_code] = { name: s.sys_name, org: s.org };
    }
    const devMap = {};
    for (const d of await all('SELECT * FROM dev_task ORDER BY id ASC')) {
      (devMap[d.req_code] ||= []).push(d);
    }
    const testMap = {};
    for (const t of await all('SELECT * FROM test_task')) {
      const bucket = (testMap[t.req_code] ||= {});
      (bucket[t.test_type] ||= []).push(t);
    }
    const rtMap = {};
    for (const rt of await all('SELECT * FROM release_task')) {
      rtMap[rt.req_code] = rt;
    }
    const analysisCache = {};
    const analysisTextFor = async (reqCode) => {
      if (!reqCode) return { impact: '', coverage: '' };
      if (!analysisCache[reqCode]) {
        const items = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', reqCode);
        const covs = await all('SELECT * FROM coverage_item WHERE req_code = ?', reqCode);
        const covMap = new Map(covs.map((c) => [c.change_item_id, c]));
        analysisCache[reqCode] = {
          impact: formatImpactItemsText(items),
          coverage: formatCoverageText(items, covMap),
        };
      }
      return analysisCache[reqCode];
    };

    const filteredReqs = [];
    for (const r of workItems) {
      const org = reqOrg(r, sysMap);

      const testBucket = testMap[r.req_code] || {};
      const chain = buildChain(
        r,
        devMap,
        Object.fromEntries(Object.entries(testBucket).map(([k, v]) => [k, v.map(t => ({ status: t.status }))])),
        Object.fromEntries(Object.entries(rtMap).map(([k, v]) => [k, v.status])),
        r.firstLabel
      );

      const mainSystems = parseJsonArray(r.main_systems);
      const collabDevSystems = parseJsonArray(r.collab_dev_systems);
      const collabTestSystems = parseJsonArray(r.collab_test_systems);

      // 1. 实施机构
      if (orgsFilter && !orgsFilter.includes(org)) continue;
      // 2. 需求/工单编号
      if (reqCodeFilter && !r.req_code.toLowerCase().includes(reqCodeFilter)) continue;
      // 3. 需求/工单内容
      if (contentFilter) {
        const titleMatch = r.title && r.title.toLowerCase().includes(contentFilter);
        const summaryMatch = r.summary && r.summary.toLowerCase().includes(contentFilter);
        if (!titleMatch && !summaryMatch) continue;
      }
      // 4. 任务阶段
      let current = chain.nodes.find((n) => n.state === 'doing');
      if (!current) {
        const dones = chain.nodes.filter((n) => n.state === 'done');
        current = dones[dones.length - 1] || chain.nodes[0];
      }
      if (stageFilter && !stageFilter.includes(current.label)) continue;
      // 5. 任务状态
      if (taskStatusFilter) {
        const matchesStatus = taskStatusFilter.some(ts => {
          if (ts.includes('-')) {
            const [stg, stat] = ts.split('-');
            return current.label === stg && current.status === stat;
          }
          return current.status === ts;
        });
        if (!matchesStatus) continue;
      }
      // 6. 主责系统
      if (mainSystemsFilter && !mainSystems.some(s => mainSystemsFilter.includes(s))) continue;
      // 7. 协同系统
      if (collabSystemsFilter) {
        const hasCollab = collabDevSystems.some(s => collabSystemsFilter.includes(s)) ||
                          collabTestSystems.some(s => collabSystemsFilter.includes(s));
        if (!hasCollab) continue;
      }

      filteredReqs.push(r);
    }

    // 2. 将筛选出来的需求/工单按开发任务行展开
    let wideRows = [];
    for (const r of filteredReqs) {
      const devTasks = devMap[r.req_code] || [];
      const testBucket = testMap[r.req_code] || {};
      const rtRow = rtMap[r.req_code];
      const taskStatus = buildChain(
        r, devMap,
        Object.fromEntries(Object.entries(testBucket).map(([key, value]) => [key, value.map((item) => ({ status: item.status }))])),
        Object.fromEntries(Object.entries(rtMap).map(([key, value]) => [key, value.status])),
      ).currentStageFull;
      const analysisText = await analysisTextFor(r.req_code);

      // 提取需求/工单层级的基础信息
      const reqMainSys = parseJsonArray(r.main_systems);
      const reqCollabDev = parseJsonArray(r.collab_dev_systems);
      const reqCollabTest = parseJsonArray(r.collab_test_systems);

      const reqAttaches = r.entityType === 'requirement'
        ? await all("SELECT * FROM attachment WHERE entity_type = 'requirement' AND entity_id = ?", r.id)
        : [];
      const reqSpecFormatted = r.entityType === 'requirement'
        ? formatAttachments(reqAttaches, '需求说明书')
        : '';

      const proposerArray = parseJsonArray(r.proposer);

      const reqInfo = {
        id: r.id,
        entity_label: r.entityType === 'ticket' ? '工单' : '需求',
        req_code: r.req_code,
        req_title: r.title,
        req_summary: r.summary,
        req_status: statusDisplayMap[r.status] || r.status || '',
        task_status: taskStatus,
        req_type: (r.entityType === 'ticket' ? ticketTypeDisplayMap[r.req_type] : reqTypeDisplayMap[r.req_type]) || r.req_type || '',
        is_accounting: r.is_accounting || '否',
        priority: r.priority || '',
        propose_dept: deptDisplayMap[r.propose_dept] || r.propose_dept || '',
        proposer: proposerArray.join(', '),
        yn_owner: r.yn_owner,
        jk_owner: r.jk_owner,
        propose_time: r.propose_time,
        expected_release_date: r.expected_release_date || '',
        issue_no: r.issue_no || '',
        receiver: r.receiver || '',
        workload: r.workload || '',
        registrar: r.registrar || '',
        implementation_org: orgDisplayMap[r.implementation_org] || r.implementation_org || '',
        release_date: (applyPointMap[r.req_code] || []).map((point) => String(point.release_date || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')).join(', '),
        main_systems: reqMainSys.map(c => sysMap[c]?.name || c).join(', '),
        collab_dev_systems: reqCollabDev.map(c => sysMap[c]?.name || c).join(', '),
        collab_test_systems: reqCollabTest.map(c => sysMap[c]?.name || c).join(', '),
        req_spec: reqSpecFormatted,
      };

      // 投产与会签信息（同一需求/工单共享）
      let releaseInfo = {
        release_entity_id: rtRow?.id || null,
        release_status: rtRow?.status || '未发起',
        release_owner: rtRow?.owner || '',
        release_change_plan: '',
        release_change_control: '',
        signoff_details: '无',
        related_artifacts: '',
      };
      const artifacts = await entityArtifacts(r.req_code);
      releaseInfo.related_artifacts = artifacts.flatMap((artifact) => (artifact.units || []).map((unit) => [artifact.change_code, artifact.change_system_name, unit.artifact_type, unit.delivery_unit, unit.new_version, unit.ferry_status, unit.artifact_release_status].filter(Boolean).join(' / '))).join('\n');
      if (rtRow) {
        const signoffs = await all('SELECT * FROM release_signoff WHERE release_task_id = ? ORDER BY id', rtRow.id);
        const releaseAttaches = await all("SELECT * FROM attachment WHERE entity_type = 'release' AND entity_id = ?", rtRow.id);
        releaseInfo.release_change_plan = formatAttachments(releaseAttaches, '投产变更方案');
        releaseInfo.release_change_control = formatAttachments(releaseAttaches, '投产变更控制表');
        releaseInfo.signoff_details = signoffs.map((s) => [s.role_name, s.signer_name || '未签署', s.conclusion || s.result || '', s.sign_time || ''].join(' / ')).join('\n') || '无会签记录';
      }

      // 如果没有任何开发任务，我们依然保留这一行，只是开发相关的字段和关联系统状态为空
      const tasksToLoop = devTasks.length ? devTasks : [null];

      for (const d of tasksToLoop) {
        let devInfo = {
          dev_entity_id: '',
          dev_code: '', dev_name: '', dev_content: '', dev_status: '', dev_owner: '', dev_intake_owner: '',
          dev_system: '', dev_org: '', dev_plan_start: '', dev_plan_end: '',
          dev_actual_start: '', dev_actual_end: '', dev_deviation_rate: '',
          dev_design_brief: '', dev_design_detail: '', dev_code_review: '', dev_unit_test: '',
          dev_coding_checklist: '', dev_tech_solution_confirm: '', dev_impact_analysis: '',
        };
        let sysReleaseTime = '无';
        let sysReleaseStatus = '无';

        let sitInfo = { sit_code: '无', sit_status: '无', sit_owner: '无', sit_actual_end: '无', sit_test_plan: '无', sit_test_coverage_design: '无', sit_test_report: '无' };
        let uatInfo = { uat_code: '无', uat_status: '无', uat_owner: '无', uat_actual_end: '无', uat_test_plan: '无', uat_test_report: '无' };
        let nftInfo = { nft_code: '无', nft_status: '无', nft_owner: '无', nft_actual_end: '无', nft_test_plan: '无', nft_test_report: '无' };
        let secInfo = { sec_code: '无', sec_status: '无', sec_owner: '无', sec_actual_end: '无', sec_test_plan: '无', sec_test_report: '无' };

        if (d) {
          const devAttaches = await all("SELECT * FROM attachment WHERE entity_type = 'dev' AND entity_id = ?", d.id);

          devInfo = {
            dev_entity_id: d.id,
            dev_code: d.task_code,
            dev_name: d.task_name,
            dev_content: d.content || '',
            dev_status: d.status,
            dev_owner: d.owner || '',
            dev_intake_owner: d.intake_owner || '',
            dev_system: sysMap[d.impl_system]?.name || d.impl_system,
            dev_org: orgDisplayMap[d.impl_org] || d.impl_org || '',
            dev_plan_start: d.plan_start || '',
            dev_plan_end: d.plan_end || '',
            dev_actual_start: d.actual_start || '',
            dev_actual_end: d.actual_end || '',
            dev_deviation_rate: d.deviation_rate != null ? `${d.deviation_rate}%` : '0%',
            dev_design_brief: formatAttachments(devAttaches, '概要设计'),
            dev_design_detail: formatAttachments(devAttaches, '详细设计'),
            dev_code_review: formatAttachments(devAttaches, '代码走查'),
            dev_unit_test: formatAttachments(devAttaches, '单元测试报告'),
            dev_coding_checklist: formatAttachments(devAttaches, '编码检查表'),
            dev_tech_solution_confirm: formatAttachments(devAttaches, '技术方案确认单'),
            dev_impact_analysis: analysisText.impact,
          };

          // 关联投产系统状态
          if (rtRow) {
            const relSys = await get('SELECT * FROM release_system WHERE release_task_id = ? AND system_code = ?', rtRow.id, d.impl_system);
            if (relSys) {
              sysReleaseTime = relSys.actual_release_time || '待发布';
              sysReleaseStatus = relSys.status || '';
            }
          }

          // 映射测试任务
          const mapTestInfo = async (testType) => {
            const list = testBucket[testType] || [];
            // 匹配 impl_system === d.impl_system；如果没有则取 impl_system 为空/NULL (即合并建立的)
            let match = list.find(t => t.impl_system === d.impl_system);
            if (!match) {
              match = list.find(t => !t.impl_system);
            }
            if (match) {
              const testAttaches = await all("SELECT * FROM attachment WHERE entity_type = 'test' AND entity_id = ?", match.id);
              return {
                id: match.id,
                code: match.task_code,
                name: match.task_name || '',
                status: match.status,
                owner: match.owner || '',
                intake_owner: match.intake_owner || '',
                impl_system: sysMap[match.impl_system]?.name || match.impl_system || '',
                impl_org: orgDisplayMap[match.impl_org] || match.impl_org || '',
                plan_start: match.plan_start || '',
                plan_end: match.plan_end || '',
                actual_start: match.actual_start || '',
                actual_end: match.actual_end || '进行中',
                test_plan: formatAttachments(testAttaches, '测试方案') || '无',
                test_report: formatAttachments(testAttaches, '测试报告') || '无',
              };
            }
            return null;
          };

          const sitMatch = await mapTestInfo('SIT');
          if (sitMatch) {
            sitInfo = {
              sit_code: sitMatch.code,
              sit_entity_id: sitMatch.id,
              sit_name: sitMatch.name,
              sit_status: sitMatch.status,
              sit_owner: sitMatch.owner,
              sit_intake_owner: sitMatch.intake_owner,
              sit_system: sitMatch.impl_system,
              sit_org: sitMatch.impl_org,
              sit_plan_start: sitMatch.plan_start,
              sit_plan_end: sitMatch.plan_end,
              sit_actual_start: sitMatch.actual_start,
              sit_actual_end: sitMatch.actual_end,
              sit_test_plan: sitMatch.test_plan,
              sit_test_report: sitMatch.test_report,
              sit_test_coverage_design: analysisText.coverage,
            };
          }
          const uatMatch = await mapTestInfo('UAT');
          if (uatMatch) {
            uatInfo = {
              uat_code: uatMatch.code,
              uat_entity_id: uatMatch.id,
              uat_name: uatMatch.name,
              uat_status: uatMatch.status,
              uat_owner: uatMatch.owner,
              uat_intake_owner: uatMatch.intake_owner,
              uat_system: uatMatch.impl_system,
              uat_org: uatMatch.impl_org,
              uat_plan_start: uatMatch.plan_start,
              uat_plan_end: uatMatch.plan_end,
              uat_actual_start: uatMatch.actual_start,
              uat_actual_end: uatMatch.actual_end,
              uat_test_plan: uatMatch.test_plan,
              uat_test_report: uatMatch.test_report
            };
          }
          const nftMatch = await mapTestInfo('NFT');
          if (nftMatch) {
            nftInfo = {
              nft_code: nftMatch.code,
              nft_entity_id: nftMatch.id,
              nft_name: nftMatch.name,
              nft_status: nftMatch.status,
              nft_owner: nftMatch.owner,
              nft_intake_owner: nftMatch.intake_owner,
              nft_system: nftMatch.impl_system,
              nft_org: nftMatch.impl_org,
              nft_plan_start: nftMatch.plan_start,
              nft_plan_end: nftMatch.plan_end,
              nft_actual_start: nftMatch.actual_start,
              nft_actual_end: nftMatch.actual_end,
              nft_test_plan: nftMatch.test_plan,
              nft_test_report: nftMatch.test_report
            };
          }
          const secMatch = await mapTestInfo('SEC');
          if (secMatch) {
            secInfo = {
              sec_code: secMatch.code,
              sec_entity_id: secMatch.id,
              sec_name: secMatch.name,
              sec_status: secMatch.status,
              sec_owner: secMatch.owner,
              sec_intake_owner: secMatch.intake_owner,
              sec_system: secMatch.impl_system,
              sec_org: secMatch.impl_org,
              sec_plan_start: secMatch.plan_start,
              sec_plan_end: secMatch.plan_end,
              sec_actual_start: secMatch.actual_start,
              sec_actual_end: secMatch.actual_end,
              sec_test_plan: secMatch.test_plan,
              sec_test_report: secMatch.test_report
            };
          }
        }

        wideRows.push({
          ...reqInfo,
          ...devInfo,
          sys_release_time: sysReleaseTime,
          sys_release_status: sysReleaseStatus,
          ...releaseInfo,

          sit_code: sitInfo.sit_code,
          sit_name: sitInfo.sit_name,
          sit_status: sitInfo.sit_status,
          sit_owner: sitInfo.sit_owner,
          sit_intake_owner: sitInfo.sit_intake_owner,
          sit_system: sitInfo.sit_system,
          sit_org: sitInfo.sit_org,
          sit_plan_start: sitInfo.sit_plan_start,
          sit_plan_end: sitInfo.sit_plan_end,
          sit_actual_start: sitInfo.sit_actual_start,
          sit_actual_end: sitInfo.sit_actual_end,
          sit_test_plan: sitInfo.sit_test_plan,
          sit_test_coverage_design: sitInfo.sit_test_coverage_design,
          sit_test_report: sitInfo.sit_test_report,

          uat_code: uatInfo.uat_code,
          uat_name: uatInfo.uat_name,
          uat_status: uatInfo.uat_status,
          uat_owner: uatInfo.uat_owner,
          uat_intake_owner: uatInfo.uat_intake_owner,
          uat_system: uatInfo.uat_system,
          uat_org: uatInfo.uat_org,
          uat_plan_start: uatInfo.uat_plan_start,
          uat_plan_end: uatInfo.uat_plan_end,
          uat_actual_start: uatInfo.uat_actual_start,
          uat_actual_end: uatInfo.uat_actual_end,
          uat_test_plan: uatInfo.uat_test_plan,
          uat_test_report: uatInfo.uat_test_report,

          nft_code: nftInfo.nft_code,
          nft_name: nftInfo.nft_name,
          nft_status: nftInfo.nft_status,
          nft_owner: nftInfo.nft_owner,
          nft_intake_owner: nftInfo.nft_intake_owner,
          nft_system: nftInfo.nft_system,
          nft_org: nftInfo.nft_org,
          nft_plan_start: nftInfo.nft_plan_start,
          nft_plan_end: nftInfo.nft_plan_end,
          nft_actual_start: nftInfo.nft_actual_start,
          nft_actual_end: nftInfo.nft_actual_end,
          nft_test_plan: nftInfo.nft_test_plan,
          nft_test_report: nftInfo.nft_test_report,

          sec_code: secInfo.sec_code,
          sec_name: secInfo.sec_name,
          sec_status: secInfo.sec_status,
          sec_owner: secInfo.sec_owner,
          sec_intake_owner: secInfo.sec_intake_owner,
          sec_system: secInfo.sec_system,
          sec_org: secInfo.sec_org,
          sec_plan_start: secInfo.sec_plan_start,
          sec_plan_end: secInfo.sec_plan_end,
          sec_actual_start: secInfo.sec_actual_start,
          sec_actual_end: secInfo.sec_actual_end,
          sec_test_plan: secInfo.sec_test_plan,
          sec_test_report: secInfo.sec_test_report,
        });
      }
    }

    const dynamicStages = [
      { scopeKey: 'requirement', prefix: '需求分析', idKey: 'id', matches: (row) => row.entity_label === '需求' },
      { scopeKey: 'ticket', prefix: '工单分析', idKey: 'id', matches: (row) => row.entity_label === '工单' },
      { scopeKey: 'dev', prefix: '开发管理', idKey: 'dev_entity_id', matches: () => true },
      { scopeKey: 'test.SIT', prefix: '应用组装测试', idKey: 'sit_entity_id', matches: () => true },
      { scopeKey: 'test.UAT', prefix: '用户测试', idKey: 'uat_entity_id', matches: () => true },
      { scopeKey: 'test.NFT', prefix: '非功能测试', idKey: 'nft_entity_id', matches: () => true },
      { scopeKey: 'test.SEC', prefix: '安全测试', idKey: 'sec_entity_id', matches: () => true },
      { scopeKey: 'release', prefix: '投产审批', idKey: 'release_entity_id', matches: () => true },
    ];
    const dynamicColumns = [];
    for (const stage of dynamicStages) {
      const result = await appendOverviewStageColumns(wideRows, stage);
      wideRows = result.rows;
      dynamicColumns.push(...result.columns);
    }

    const cols = [
      // 需求信息
      { key: 'entity_label', title: '类型' },
      { key: 'req_code', title: '需求/工单编号' },
      { key: 'req_title', title: '需求标题/工单标题' },
      { key: 'req_summary', title: '需求概述/工单详情' },
      { key: 'req_status', title: '需求/工单状态' },
      { key: 'task_status', title: '任务状态' },
      { key: 'req_type', title: '需求/工单类型' },
      { key: 'is_accounting', title: '是否涉账' },
      { key: 'priority', title: '优先级' },
      { key: 'propose_dept', title: '提出部门' },
      { key: 'proposer', title: '提出人' },
      { key: 'yn_owner', title: '云南农信负责人' },
      { key: 'jk_owner', title: '建信金科负责人' },
      { key: 'propose_time', title: '提出时间', valueType: 'datetime' },
      { key: 'expected_release_date', title: '期望投产时间', valueType: 'date' },
      { key: 'issue_no', title: 'OA编号/工单编号' },
      { key: 'receiver', title: '需求接收人' },
      { key: 'workload', title: '工作量(人天)' },
      { key: 'registrar', title: '录入人' },
      { key: 'implementation_org', title: '实施机构' },
      { key: 'release_date', title: '申请投产点', valueType: 'date' },
      { key: 'main_systems', title: '主责系统' },
      { key: 'collab_dev_systems', title: '协同改造系统' },
      { key: 'collab_test_systems', title: '协同测试系统' },
      // 开发任务
      { key: 'dev_code', title: '开发任务编号' },
      { key: 'dev_name', title: '开发任务名称' },
      { key: 'dev_content', title: '开发内容概述' },
      { key: 'dev_status', title: '开发状态' },
      { key: 'dev_owner', title: '开发负责人' },
      { key: 'dev_intake_owner', title: '开发承接人' },
      { key: 'dev_system', title: '开发实施系统' },
      { key: 'dev_org', title: '开发实施方' },
      { key: 'dev_plan_start', title: '开发计划开始', valueType: 'date' },
      { key: 'dev_plan_end', title: '开发计划结束', valueType: 'date' },
      { key: 'dev_actual_start', title: '开发实际开始', valueType: 'date' },
      { key: 'dev_actual_end', title: '开发实际结束', valueType: 'date' },
      { key: 'dev_deviation_rate', title: '开发排期偏差率' },
      { key: 'dev_impact_analysis', title: '影响性分析', width: 60, wrapText: true },
      // 应用组装测试 (SIT)
      { key: 'sit_code', title: '应用组装测试任务编号' },
      { key: 'sit_name', title: '应用组装测试任务名称' },
      { key: 'sit_status', title: '应用组装测试状态' },
      { key: 'sit_owner', title: '应用组装测试负责人' },
      { key: 'sit_intake_owner', title: '应用组装测试承接人' },
      { key: 'sit_system', title: '应用组装测试实施系统' },
      { key: 'sit_org', title: '应用组装测试实施方' },
      { key: 'sit_plan_start', title: '应用组装测试计划开始时间', valueType: 'date' },
      { key: 'sit_plan_end', title: '应用组装测试计划结束时间', valueType: 'date' },
      { key: 'sit_actual_start', title: '应用组装测试实际开始时间', valueType: 'date' },
      { key: 'sit_actual_end', title: '应用组装测试实际完成时间', valueType: 'date' },
      { key: 'sit_test_coverage_design', title: '应用组装测试覆盖性分析', width: 60, wrapText: true },
      // 用户测试 (UAT)
      { key: 'uat_code', title: '用户测试任务编号' },
      { key: 'uat_name', title: '用户测试任务名称' },
      { key: 'uat_status', title: '用户测试状态' },
      { key: 'uat_owner', title: '用户测试负责人' },
      { key: 'uat_intake_owner', title: '用户测试承接人' },
      { key: 'uat_system', title: '用户测试实施系统' },
      { key: 'uat_org', title: '用户测试实施方' },
      { key: 'uat_plan_start', title: '用户测试计划开始时间', valueType: 'date' },
      { key: 'uat_plan_end', title: '用户测试计划结束时间', valueType: 'date' },
      { key: 'uat_actual_start', title: '用户测试实际开始时间', valueType: 'date' },
      { key: 'uat_actual_end', title: '用户测试实际完成时间', valueType: 'date' },
      // 非功能测试 (NFT)
      { key: 'nft_code', title: '非功能测试任务编号' },
      { key: 'nft_name', title: '非功能测试任务名称' },
      { key: 'nft_status', title: '非功能测试状态' },
      { key: 'nft_owner', title: '非功能测试负责人' },
      { key: 'nft_intake_owner', title: '非功能测试承接人' },
      { key: 'nft_system', title: '非功能测试实施系统' },
      { key: 'nft_org', title: '非功能测试实施方' },
      { key: 'nft_plan_start', title: '非功能测试计划开始时间', valueType: 'date' },
      { key: 'nft_plan_end', title: '非功能测试计划结束时间', valueType: 'date' },
      { key: 'nft_actual_start', title: '非功能测试实际开始时间', valueType: 'date' },
      { key: 'nft_actual_end', title: '非功能测试实际完成时间', valueType: 'date' },
      // 安全测试 (SEC)
      { key: 'sec_code', title: '安全测试任务编号' },
      { key: 'sec_name', title: '安全测试任务名称' },
      { key: 'sec_status', title: '安全测试状态' },
      { key: 'sec_owner', title: '安全测试负责人' },
      { key: 'sec_intake_owner', title: '安全测试承接人' },
      { key: 'sec_system', title: '安全测试实施系统' },
      { key: 'sec_org', title: '安全测试实施方' },
      { key: 'sec_plan_start', title: '安全测试计划开始时间', valueType: 'date' },
      { key: 'sec_plan_end', title: '安全测试计划结束时间', valueType: 'date' },
      { key: 'sec_actual_start', title: '安全测试实际开始时间', valueType: 'date' },
      { key: 'sec_actual_end', title: '安全测试实际完成时间', valueType: 'date' },
      // 投产
      { key: 'release_status', title: '投产状态' },
      { key: 'release_owner', title: '投产负责人' },
      { key: 'related_artifacts', title: '关联制品情况', wrapText: true },
      { key: 'signoff_details', title: '会签决议详情' },
      { key: 'sys_release_time', title: '系统上线实际时间', valueType: 'datetime' },
      { key: 'sys_release_status', title: '系统上线状态' },
    ];

    const buf = await exportXlsx([...(await visibleOverviewColumns(cols)), ...dynamicColumns], wideRows, '版本概览宽表');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=version_overview_wide_table.xlsx');
    return reply.send(buf);
  });
}
