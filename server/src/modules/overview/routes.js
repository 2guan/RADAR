/**
 * 文件：modules/overview/routes.js
 * 用途：版本概览模块接口。按实施机构聚合当前投产窗口下的需求及其全链路进展，
 *       并提供单需求的 5 层全生命周期详情数据（需求/开发/SIT/NFT/SEC/UAT/投产）。
 * 作者：hengguan
 * 说明：链路节点状态分 done(全部终态)/doing(进行中)/pending(无任务)；非功能/安全按需出现。
 */

import { get, all } from '../../db/index.js';
import { isTerminalStatus } from '../../lib/status.js';
import { listByEntity } from '../../lib/attachment.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound } from '../../lib/http.js';
import { exportXlsx } from '../../lib/excel.js';
import { formatAttachments } from '../../lib/resolver.js';

/** 计算一组任务的节点状态（含单一代表状态 status，供阶段标签展示） */
function nodeState(tasks) {
  if (!tasks.length) return { state: 'pending', text: null, status: null };
  const allTerminal = tasks.every((t) => isTerminalStatus(t.status));
  const nonTerminal = tasks.find((t) => !isTerminalStatus(t.status));
  const status = nonTerminal ? nonTerminal.status : tasks[tasks.length - 1].status;
  const text = tasks.map((t) => t.status).join('、');
  return { state: allTerminal ? 'done' : 'doing', text, status };
}

/**
 * 取需求实施机构逻辑：
 * 1. 第一优先级：取需求关联的主责系统的第一个开发任务的开发实施方（impl_org）。
 * 2. 第二优先级：取系统的第一个主责系统对应的所属机构（org）。
 * 3. 第三优先级：取需求提出部门（propose_dept）。
 * 4. 第四优先级：默认兜底值 "未分配机构"。
 */
export function reqOrg(req, sysMap, devMap) {
  const main = req.main_systems ? JSON.parse(req.main_systems) : [];
  
  // 第一优先级：取需求关联的主责系统的第一个开发任务的开发实施方
  if (main.length) {
    const devTasks = devMap[req.req_code] || [];
    const mainDevTasks = devTasks.filter((t) => main.includes(t.impl_system));
    if (mainDevTasks.length) {
      const org = mainDevTasks[0].impl_org;
      if (org) return org;
    }
  }

  // 第二优先级：取系统的第一个主责系统对应的所属机构
  if (main.length) {
    const org = sysMap[main[0]]?.org;
    if (org) return org;
  }

  // 第三优先级：取需求提出部门
  // 第四优先级：默认兜底值 "未分配机构"
  return req.propose_dept || '未分配机构';
}

/** 系统编号转名称（标签展示用；sysMap 预载） */
function sysNames(codes, sysMap) {
  return (codes || []).map((c) => sysMap[c]?.name || c);
}

/** 按姓名解析人员（姓名 + 所属机构 + 手机号），找不到则仅返回姓名 */
function resolvePerson(name) {
  if (!name) return null;
  const u = get('SELECT name, org, phone FROM user WHERE name = ? LIMIT 1', name);
  return u || { name, org: null, phone: null };
}

/** 按编号解析系统（编号 + 名称 + 所属机构 + 业务板块） */
function resolveSystem(code) {
  if (!code) return null;
  return get('SELECT sys_code, sys_name, org, sector FROM system WHERE sys_code = ?', code)
    || { sys_code: code, sys_name: code, org: null, sector: null };
}

/** 读取引用了该需求/问题编号的投产申请制品（含各交付单元的摆渡状态），供投产列展示 */
function entityArtifacts(code) {
  if (!code) return [];
  const rows = all(
    `SELECT * FROM release_apply ra
       WHERE EXISTS (SELECT 1 FROM json_each(ra.ref_codes) WHERE value = ?)
     ORDER BY ra.id DESC`,
    code,
  );
  return rows.map((r) => {
    let units = [];
    try { units = r.delivery_units ? JSON.parse(r.delivery_units) : []; } catch { units = []; }
    const sys = r.change_system ? resolveSystem(r.change_system) : null;
    return {
      id: r.id,
      change_code: r.change_code,
      change_system: r.change_system,
      change_system_name: sys ? (sys.sys_name || r.change_system) : (r.change_system || null),
      impl_org: r.impl_org,
      change_content: r.change_content,
      units,
    };
  });
}

/** 构建单需求链路概要（dev/test/rt 状态均由预载 Map 提供，免逐需求查询） */
function buildChain(req, devMap, testMap, rtMap) {
  const dev = devMap[req.req_code] || [];
  const t = testMap[req.req_code] || {};
  const sit = t.SIT || [];
  const nft = t.NFT || [];
  const sec = t.SEC || [];
  const uat = t.UAT || [];
  const rtStatus = rtMap[req.req_code];
  const rt = rtStatus ? { status: rtStatus } : null;

  // 阶段顺序：需求 / 开发 / 应用组装 / 非功能测试(按需) / 安全测试(按需) / 用户测试 / 投产
  const nodes = [
    { key: '需求', label: '需求', ...nodeState([{ status: req.status }]) },
    { key: '开发', label: '开发', ...nodeState(dev) },
    { key: 'SIT', label: '应用组装', ...nodeState(sit) },
  ];
  if (nft.length) nodes.push({ key: 'NFT', label: '非功能测试', ...nodeState(nft) });
  if (sec.length) nodes.push({ key: 'SEC', label: '安全测试', ...nodeState(sec) });
  nodes.push({ key: 'UAT', label: '用户测试', ...nodeState(uat) });
  nodes.push({ key: '投产', label: '投产', ...nodeState(rt ? [{ status: rt.status === '已投产' ? '已上线' : '待评审' }] : []) });

  // 当前阶段：最后一个 doing；若无 doing 取最后一个 done
  let current = nodes.find((n) => n.state === 'doing');
  if (!current) {
    const dones = nodes.filter((n) => n.state === 'done');
    current = dones[dones.length - 1] || nodes[0];
  }
  return { nodes, currentStage: `${current.label}-${current.status || '未开始'}` };
}

// 问题状态的终态集合：待验证 / 已解决 视为已完成（进度条显示终态）
const ISSUE_TERMINAL_STATUS = new Set(['待验证', '已解决']);

/** 问题状态节点：待验证/已解决 视为终态(done)，其余有状态为 doing，无状态为 pending */
function issueStatusNode(status) {
  if (!status) return { key: '问题', label: '问题状态', state: 'pending', text: null, status: null };
  const base = nodeState([{ status }]);
  if (ISSUE_TERMINAL_STATUS.has(status)) base.state = 'done';
  return { key: '问题', label: '问题状态', ...base };
}

/**
 * 把「投产申请关联的问题」追加为概览卡片（与需求卡片混排于同一实施机构分组下）。
 * 范围：当前投产窗口（或指定投产点）下的投产申请所关联的问题；进度仅含「问题状态 + 投产」两项。
 * 仅套用对问题适用的筛选（实施机构/编号/内容）；命中需求专属筛选（阶段/任务状态/系统）时不纳入问题，避免误导。
 */
function appendIssueCards({ groups, body, targetReleasePointIds, sysMap, rtMap, filters }) {
  const { orgsFilter, reqCodeFilter, contentFilter, stageFilter, taskStatusFilter, mainSystemsFilter, collabSystemsFilter } = filters;
  // 命中需求专属筛选时，问题卡片整体不参与
  if (stageFilter || taskStatusFilter || mainSystemsFilter || collabSystemsFilter) return;

  // 1) 取窗口（或指定投产点）下的投产申请
  let raSql = 'SELECT ref_codes, impl_org FROM release_apply';
  const raParams = [];
  if (targetReleasePointIds) {
    if (!targetReleasePointIds.length) return;
    raSql += ` WHERE release_point_id IN (${targetReleasePointIds.map(() => '?').join(',')})`;
    raParams.push(...targetReleasePointIds);
  } else {
    const win = inClause('release_point_id', windowIds(body));
    if (win.where) { raSql += ` WHERE ${win.where}`; raParams.push(...win.params); }
  }
  const applies = all(raSql, ...raParams);
  if (!applies.length) return;

  // 2) 问题主数据 + 系统名→机构 映射（问题的 system 字段多为系统名称）
  const issueMap = {};
  for (const it of all('SELECT issue_code, status, summary, system FROM issue')) issueMap[it.issue_code] = it;
  const sysNameOrg = {};
  for (const s of all('SELECT sys_name, org FROM system')) sysNameOrg[s.sys_name] = s.org;

  // 3) 收集关联到的问题编号（去重，记录首个关联申请的实施机构作分组兜底）
  const issueImplOrg = {};
  for (const ra of applies) {
    let refs = [];
    try { refs = ra.ref_codes ? JSON.parse(ra.ref_codes) : []; } catch { refs = []; }
    for (const code of refs) {
      if (issueMap[code] && !(code in issueImplOrg)) issueImplOrg[code] = ra.impl_org || null;
    }
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
      { key: '投产', label: '投产', ...nodeState(rt ? [{ status: rt.status === '已投产' ? '已上线' : '待评审' }] : []) },
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
    
    let sql = 'SELECT * FROM requirement';
    const params = [];
    
    if (targetReleasePointIds) {
      if (targetReleasePointIds.length) {
        sql += ` WHERE release_point_id IN (${targetReleasePointIds.map(() => '?').join(',')})`;
        params.push(...targetReleasePointIds);
      }
    } else {
      const win = inClause('release_point_id', windowIds(body));
      if (win.where) { sql += ` WHERE ${win.where}`; params.push(...win.params); }
    }
    sql += ' ORDER BY id DESC';
    const reqs = all(sql, ...params);
 
    // 关联状态与系统主数据一次性载入并分桶，替代逐需求 N+1 查询
    const sysMap = {};
    for (const s of all('SELECT sys_code, sys_name, org FROM system')) {
      sysMap[s.sys_code] = { name: s.sys_name, org: s.org };
    }
    const devMap = {};
    for (const d of all('SELECT id, req_code, status, impl_system, impl_org FROM dev_task ORDER BY id ASC')) {
      (devMap[d.req_code] ||= []).push(d);
    }
    const testMap = {};
    for (const t of all('SELECT req_code, test_type, status FROM test_task')) {
      const bucket = (testMap[t.req_code] ||= {});
      (bucket[t.test_type] ||= []).push({ status: t.status });
    }
    const rtMap = {};
    for (const rt of all('SELECT req_code, status FROM release_task')) {
      rtMap[rt.req_code] = rt.status;
    }
 
    const groups = {};
    for (const r of reqs) {
      const org = reqOrg(r, sysMap, devMap);
      const chain = buildChain(r, devMap, testMap, rtMap);
      const mainSystems = r.main_systems ? JSON.parse(r.main_systems) : [];
      const collabDevSystems = r.collab_dev_systems ? JSON.parse(r.collab_dev_systems) : [];
      const collabTestSystems = r.collab_test_systems ? JSON.parse(r.collab_test_systems) : [];
      const names = sysNames(mainSystems, sysMap);
      
      // 1. 实施机构
      if (orgsFilter && !orgsFilter.includes(org)) continue;
      
      // 2. 需求编号
      if (reqCodeFilter && !r.req_code.toLowerCase().includes(reqCodeFilter)) continue;
      
      // 3. 需求内容
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
        entityType: 'requirement',
        code: r.req_code,
        req_code: r.req_code,
        title: r.title,
        systems: names,
        systemName: names[0] || '—',     // 主责系统名称（标签展示）
        systemOrg: org,                    // 系统所属机构（标签展示）
        currentStage: chain.currentStage,
        nodes: chain.nodes,
      };
      (groups[org] ||= []).push(card);
    }

    // ── 投产申请关联的「问题」也纳入概览（卡片样式同需求，进度仅「问题状态 + 投产」两项） ──
    appendIssueCards({
      groups, body, targetReleasePointIds, sysMap, rtMap,
      filters: { orgsFilter, reqCodeFilter, contentFilter, stageFilter, taskStatusFilter, mainSystemsFilter, collabSystemsFilter },
    });

    const list = Object.entries(groups).map(([org, cards]) => ({ org, cards }));
    return ok({ list });
  });

  // 单需求 5 层全生命周期详情
  fastify.get('/overview/:reqCode/detail', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const reqCode = request.params.reqCode;
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');

    const attachOf = (type, id) => listByEntity(type, id);
    // 任务：附加 附件 + 负责人解析 + 实施系统解析
    const withInfo = (rows, type) => rows.map((t) => ({
      ...t,
      attachments: attachOf(type, t.id),
      ownerInfo: resolvePerson(t.owner),
      systemInfo: resolveSystem(t.impl_system),
    }));

    const dev = withInfo(all('SELECT * FROM dev_task WHERE req_code = ? ORDER BY id', reqCode), 'dev');
    const sit = withInfo(all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'SIT'), 'test');
    const nft = withInfo(all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'NFT'), 'test');
    const sec = withInfo(all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'SEC'), 'test');
    const uat = withInfo(all('SELECT * FROM test_task WHERE req_code = ? AND test_type=? ORDER BY id', reqCode, 'UAT'), 'test');
    const rt = get('SELECT * FROM release_task WHERE req_code = ?', reqCode);
    const releaseDetail = rt ? {
      ...rt,
      ownerInfo: resolvePerson(rt.owner),
      systems: all('SELECT * FROM release_system WHERE release_task_id = ?', rt.id)
        .map((s) => ({ ...s, systemInfo: resolveSystem(s.system_code) })),
      signoffs: all('SELECT * FROM release_signoff WHERE release_task_id = ?', rt.id)
        .map((s) => ({ ...s, signerInfo: resolvePerson(s.signer_name) })),
      artifacts: entityArtifacts(reqCode),
    } : null;

    // 需求：解析人员、主责系统与协同改造系统
    const mainCodes = req.main_systems ? JSON.parse(req.main_systems) : [];
    const collabCodes = req.collab_dev_systems ? JSON.parse(req.collab_dev_systems) : [];
    const rp = req.release_point_id ? get('SELECT release_date FROM release_point WHERE id = ?', req.release_point_id) : null;
    const requirement = {
      ...req,
      release_date: rp ? rp.release_date : null,
      attachments: attachOf('requirement', req.id),
      proposerInfo: resolvePerson(req.proposer),
      ynOwnerInfo: resolvePerson(req.yn_owner),
      jkOwnerInfo: resolvePerson(req.jk_owner),
      mainSystemsInfo: mainCodes.map(resolveSystem),
      collabDevSystemsInfo: collabCodes.map(resolveSystem),
    };

    return ok({ requirement, dev, sit, nft, sec, uat, release: releaseDetail });
  });

  // 问题两列概览详情（问题 + 投产）：供版本概览中问题卡片点开
  fastify.get('/overview/issue/:code/detail', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const code = request.params.code;
    const issue = get('SELECT * FROM issue WHERE issue_code = ?', code);
    if (!issue) throw notFound('问题不存在');

    // 关联投产申请（取最早一条）以推导计划投产点
    const ap = get(
      `SELECT release_point_id FROM release_apply
         WHERE EXISTS (SELECT 1 FROM json_each(release_apply.ref_codes) WHERE value = ?)
         ORDER BY id ASC LIMIT 1`,
      code,
    );
    const rp = ap?.release_point_id ? get('SELECT release_date FROM release_point WHERE id = ?', ap.release_point_id) : null;

    // 投产任务（与需求详情同款结构：负责人 + 会签 + 系统）
    const rt = get('SELECT * FROM release_task WHERE req_code = ?', code);
    const releaseDetail = rt ? {
      ...rt,
      ownerInfo: resolvePerson(rt.owner),
      systems: all('SELECT * FROM release_system WHERE release_task_id = ?', rt.id)
        .map((s) => ({ ...s, systemInfo: resolveSystem(s.system_code) })),
      signoffs: all('SELECT * FROM release_signoff WHERE release_task_id = ?', rt.id)
        .map((s) => ({ ...s, signerInfo: resolvePerson(s.signer_name) })),
      artifacts: entityArtifacts(code),
    } : null;

    const issueOut = {
      ...issue,
      release_point_id: ap?.release_point_id || null,
      release_date: rp ? rp.release_date : null,
      systemInfo: resolveSystem(issue.system),
    };
    return ok({ issue: issueOut, release: releaseDetail });
  });

  // 需求全流程变更历史
  fastify.get('/overview/:reqCode/audit', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const reqCode = request.params.reqCode;
    const req = get('SELECT id FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');

    const rows = all(
      `SELECT id, entity_type, entity_code, action, operator, field, old_value, new_value, created_at
       FROM audit_log
       WHERE (entity_type = 'requirement' AND entity_id = ?)
          OR (entity_type = 'dev' AND entity_id IN (SELECT id FROM dev_task WHERE req_code = ?))
          OR (entity_type = 'test' AND entity_id IN (SELECT id FROM test_task WHERE req_code = ?))
          OR (entity_type = 'release' AND entity_id IN (SELECT id FROM release_task WHERE req_code = ?))
       ORDER BY id DESC`,
      req.id, reqCode, reqCode, reqCode
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
    
    let sql = 'SELECT * FROM requirement';
    const params = [];
    
    if (targetReleasePointIds) {
      if (targetReleasePointIds.length) {
        sql += ` WHERE release_point_id IN (${targetReleasePointIds.map(() => '?').join(',')})`;
        params.push(...targetReleasePointIds);
      }
    } else {
      const win = inClause('release_point_id', windowIds(body));
      if (win.where) { sql += ` WHERE ${win.where}`; params.push(...win.params); }
    }
    sql += ' ORDER BY id DESC';
    const reqs = all(sql, ...params);
 
    const sysMap = {};
    for (const s of all('SELECT sys_code, sys_name, org FROM system')) {
      sysMap[s.sys_code] = { name: s.sys_name, org: s.org };
    }
    const devMap = {};
    for (const d of all('SELECT * FROM dev_task ORDER BY id ASC')) {
      (devMap[d.req_code] ||= []).push(d);
    }
    const testMap = {};
    for (const t of all('SELECT * FROM test_task')) {
      const bucket = (testMap[t.req_code] ||= {});
      (bucket[t.test_type] ||= []).push(t);
    }
    const rtMap = {};
    for (const rt of all('SELECT * FROM release_task')) {
      rtMap[rt.req_code] = rt;
    }
    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    const filteredReqs = [];
    for (const r of reqs) {
      const org = reqOrg(r, sysMap, devMap);
      
      const testBucket = testMap[r.req_code] || {};
      const chain = buildChain(
        r,
        devMap,
        Object.fromEntries(Object.entries(testBucket).map(([k, v]) => [k, v.map(t => ({ status: t.status }))])),
        Object.fromEntries(Object.entries(rtMap).map(([k, v]) => [k, v.status]))
      );

      const mainSystems = r.main_systems ? JSON.parse(r.main_systems) : [];
      const collabDevSystems = r.collab_dev_systems ? JSON.parse(r.collab_dev_systems) : [];
      const collabTestSystems = r.collab_test_systems ? JSON.parse(r.collab_test_systems) : [];
      
      // 1. 实施机构
      if (orgsFilter && !orgsFilter.includes(org)) continue;
      // 2. 需求编号
      if (reqCodeFilter && !r.req_code.toLowerCase().includes(reqCodeFilter)) continue;
      // 3. 需求内容
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

    // 2. 将筛选出来的需求按开发任务行展开
    const wideRows = [];
    for (const r of filteredReqs) {
      const devTasks = devMap[r.req_code] || [];
      const testBucket = testMap[r.req_code] || {};
      const rtRow = rtMap[r.req_code];

      // 提取需求层级的基础信息
      const reqMainSys = r.main_systems ? JSON.parse(r.main_systems) : [];
      const reqCollabDev = r.collab_dev_systems ? JSON.parse(r.collab_dev_systems) : [];
      const reqCollabTest = r.collab_test_systems ? JSON.parse(r.collab_test_systems) : [];

      const reqAttaches = all("SELECT * FROM attachment WHERE entity_type = 'requirement' AND entity_id = ?", r.id);
      const reqSpecFormatted = formatAttachments(reqAttaches, '需求说明书');

      const reqInfo = {
        req_code: r.req_code,
        req_title: r.title,
        req_summary: r.summary,
        req_status: r.status,
        req_type: r.req_type,
        propose_dept: r.propose_dept,
        proposer: r.proposer,
        yn_owner: r.yn_owner,
        jk_owner: r.jk_owner,
        propose_time: r.propose_time,
        release_date: rpMap[r.release_point_id] || '',
        main_systems: reqMainSys.map(c => sysMap[c]?.name || c).join(', '),
        collab_dev_systems: reqCollabDev.map(c => sysMap[c]?.name || c).join(', '),
        collab_test_systems: reqCollabTest.map(c => sysMap[c]?.name || c).join(', '),
        req_spec: reqSpecFormatted,
      };

      // 投产与会签信息（同一需求共享）
      let releaseInfo = {
        release_status: rtRow?.status || '未发起',
        release_owner: rtRow?.owner || '',
        signoff_details: '无',
      };
      if (rtRow) {
        const signoffs = all('SELECT * FROM release_signoff WHERE release_task_id = ? ORDER BY id', rtRow.id);
        releaseInfo.signoff_details = signoffs.map(s => `${s.role_name}·${s.signer_name || '未签署'}(${s.result}${s.conclusion ? ':' + s.conclusion : ''})`).join('; ') || '无会签记录';
      }

      // 如果没有任何开发任务，我们依然保留这一行，只是开发相关的字段和关联系统状态为空
      const tasksToLoop = devTasks.length ? devTasks : [null];

      for (const d of tasksToLoop) {
        let devInfo = {
          dev_code: '', dev_name: '', dev_content: '', dev_status: '', dev_owner: '',
          dev_system: '', dev_org: '', dev_plan_start: '', dev_plan_end: '',
          dev_actual_start: '', dev_actual_end: '', dev_deviation_rate: '',
          dev_design_brief: '', dev_design_detail: '', dev_code_review: '', dev_unit_test: '',
        };
        let sysReleaseTime = '无';
        let sysReleaseStatus = '无';

        let sitInfo = { sit_code: '无', sit_status: '无', sit_owner: '无', sit_actual_end: '无', sit_test_plan: '无', sit_test_report: '无' };
        let uatInfo = { uat_code: '无', uat_status: '无', uat_owner: '无', uat_actual_end: '无', uat_test_plan: '无', uat_test_report: '无' };
        let nftInfo = { nft_code: '无', nft_status: '无', nft_owner: '无', nft_actual_end: '无', nft_test_plan: '无', nft_test_report: '无' };
        let secInfo = { sec_code: '无', sec_status: '无', sec_owner: '无', sec_actual_end: '无', sec_test_plan: '无', sec_test_report: '无' };

        if (d) {
          const devAttaches = all("SELECT * FROM attachment WHERE entity_type = 'dev' AND entity_id = ?", d.id);

          devInfo = {
            dev_code: d.task_code,
            dev_name: d.task_name,
            dev_content: d.content || '',
            dev_status: d.status,
            dev_owner: d.owner || '',
            dev_system: sysMap[d.impl_system]?.name || d.impl_system,
            dev_org: d.impl_org || '',
            dev_plan_start: d.plan_start || '',
            dev_plan_end: d.plan_end || '',
            dev_actual_start: d.actual_start || '',
            dev_actual_end: d.actual_end || '',
            dev_deviation_rate: d.deviation_rate != null ? `${d.deviation_rate}%` : '0%',
            dev_design_brief: formatAttachments(devAttaches, '概要设计'),
            dev_design_detail: formatAttachments(devAttaches, '详细设计'),
            dev_code_review: formatAttachments(devAttaches, '代码走查'),
            dev_unit_test: formatAttachments(devAttaches, '单元测试报告'),
          };

          // 关联投产系统状态
          if (rtRow) {
            const relSys = get('SELECT * FROM release_system WHERE release_task_id = ? AND system_code = ?', rtRow.id, d.impl_system);
            if (relSys) {
              sysReleaseTime = relSys.actual_release_time || '待发布';
              sysReleaseStatus = relSys.status || '';
            }
          }

          // 映射测试任务
          const mapTestInfo = (testType) => {
            const list = testBucket[testType] || [];
            // 匹配 impl_system === d.impl_system；如果没有则取 impl_system 为空/NULL (即合并建立的)
            let match = list.find(t => t.impl_system === d.impl_system);
            if (!match) {
              match = list.find(t => !t.impl_system);
            }
            if (match) {
              const testAttaches = all("SELECT * FROM attachment WHERE entity_type = 'test' AND entity_id = ?", match.id);
              return {
                code: match.task_code,
                status: match.status,
                owner: match.owner || '',
                actual_end: match.actual_end || '进行中',
                test_plan: formatAttachments(testAttaches, '测试方案') || '无',
                test_report: formatAttachments(testAttaches, '测试报告') || '无',
              };
            }
            return null;
          };

          const sitMatch = mapTestInfo('SIT');
          if (sitMatch) {
            sitInfo = {
              sit_code: sitMatch.code,
              sit_status: sitMatch.status,
              sit_owner: sitMatch.owner,
              sit_actual_end: sitMatch.actual_end,
              sit_test_plan: sitMatch.test_plan,
              sit_test_report: sitMatch.test_report
            };
          }
          const uatMatch = mapTestInfo('UAT');
          if (uatMatch) {
            uatInfo = {
              uat_code: uatMatch.code,
              uat_status: uatMatch.status,
              uat_owner: uatMatch.owner,
              uat_actual_end: uatMatch.actual_end,
              uat_test_plan: uatMatch.test_plan,
              uat_test_report: uatMatch.test_report
            };
          }
          const nftMatch = mapTestInfo('NFT');
          if (nftMatch) {
            nftInfo = {
              nft_code: nftMatch.code,
              nft_status: nftMatch.status,
              nft_owner: nftMatch.owner,
              nft_actual_end: nftMatch.actual_end,
              nft_test_plan: nftMatch.test_plan,
              nft_test_report: nftMatch.test_report
            };
          }
          const secMatch = mapTestInfo('SEC');
          if (secMatch) {
            secInfo = {
              sec_code: secMatch.code,
              sec_status: secMatch.status,
              sec_owner: secMatch.owner,
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
          sit_status: sitInfo.sit_status,
          sit_owner: sitInfo.sit_owner,
          sit_actual_end: sitInfo.sit_actual_end,
          sit_test_plan: sitInfo.sit_test_plan,
          sit_test_report: sitInfo.sit_test_report,

          uat_code: uatInfo.uat_code,
          uat_status: uatInfo.uat_status,
          uat_owner: uatInfo.uat_owner,
          uat_actual_end: uatInfo.uat_actual_end,
          uat_test_plan: uatInfo.uat_test_plan,
          uat_test_report: uatInfo.uat_test_report,

          nft_code: nftInfo.nft_code,
          nft_status: nftInfo.nft_status,
          nft_owner: nftInfo.nft_owner,
          nft_actual_end: nftInfo.nft_actual_end,
          nft_test_plan: nftInfo.nft_test_plan,
          nft_test_report: nftInfo.nft_test_report,

          sec_code: secInfo.sec_code,
          sec_status: secInfo.sec_status,
          sec_owner: secInfo.sec_owner,
          sec_actual_end: secInfo.sec_actual_end,
          sec_test_plan: secInfo.sec_test_plan,
          sec_test_report: secInfo.sec_test_report,
        });
      }
    }

    const cols = [
      // 需求信息
      { key: 'req_code', title: '需求编号' },
      { key: 'req_title', title: '需求标题' },
      { key: 'req_summary', title: '需求概述' },
      { key: 'req_status', title: '需求状态' },
      { key: 'req_type', title: '需求类型' },
      { key: 'propose_dept', title: '农信提出部门' },
      { key: 'proposer', title: '农信提出人' },
      { key: 'yn_owner', title: '云南农信业务负责人' },
      { key: 'jk_owner', title: '建信金科业务负责人' },
      { key: 'propose_time', title: '提出时间' },
      { key: 'release_date', title: '计划投产点' },
      { key: 'main_systems', title: '主责系统' },
      { key: 'collab_dev_systems', title: '协同改造系统' },
      { key: 'collab_test_systems', title: '协同测试系统' },
      { key: 'req_spec', title: '需求说明书' },
      // 开发任务
      { key: 'dev_code', title: '开发任务编号' },
      { key: 'dev_name', title: '开发任务名称' },
      { key: 'dev_content', title: '开发内容概述' },
      { key: 'dev_status', title: '开发状态' },
      { key: 'dev_owner', title: '开发负责人' },
      { key: 'dev_system', title: '开发实施系统' },
      { key: 'dev_org', title: '开发实施方' },
      { key: 'dev_plan_start', title: '开发计划开始' },
      { key: 'dev_plan_end', title: '开发计划结束' },
      { key: 'dev_actual_start', title: '开发实际开始' },
      { key: 'dev_actual_end', title: '开发实际结束' },
      { key: 'dev_deviation_rate', title: '开发排期偏差率' },
      { key: 'dev_design_brief', title: '概要设计' },
      { key: 'dev_design_detail', title: '详细设计' },
      { key: 'dev_code_review', title: '代码走查' },
      { key: 'dev_unit_test', title: '单元测试报告' },
      // 应用组装测试 (SIT)
      { key: 'sit_code', title: '应用组装测试任务编号' },
      { key: 'sit_status', title: '应用组装测试状态' },
      { key: 'sit_owner', title: '应用组装测试负责人' },
      { key: 'sit_actual_end', title: '应用组装测试实际完成时间' },
      { key: 'sit_test_plan', title: '应用组装测试方案' },
      { key: 'sit_test_report', title: '应用组装测试报告' },
      // 用户测试 (UAT)
      { key: 'uat_code', title: '用户测试任务编号' },
      { key: 'uat_status', title: '用户测试状态' },
      { key: 'uat_owner', title: '用户测试负责人' },
      { key: 'uat_actual_end', title: '用户测试实际完成时间' },
      { key: 'uat_test_plan', title: '用户测试方案' },
      { key: 'uat_test_report', title: '用户测试报告' },
      // 非功能测试 (NFT)
      { key: 'nft_code', title: '非功能测试任务编号' },
      { key: 'nft_status', title: '非功能测试状态' },
      { key: 'nft_owner', title: '非功能测试负责人' },
      { key: 'nft_actual_end', title: '非功能测试实际完成时间' },
      { key: 'nft_test_plan', title: '非功能测试方案' },
      { key: 'nft_test_report', title: '非功能测试报告' },
      // 安全测试 (SEC)
      { key: 'sec_code', title: '安全测试任务编号' },
      { key: 'sec_status', title: '安全测试状态' },
      { key: 'sec_owner', title: '安全测试负责人' },
      { key: 'sec_actual_end', title: '安全测试实际完成时间' },
      { key: 'sec_test_plan', title: '安全测试方案' },
      { key: 'sec_test_report', title: '安全测试报告' },
      // 投产
      { key: 'release_status', title: '投产状态' },
      { key: 'release_owner', title: '投产负责人' },
      { key: 'signoff_details', title: '会签决议详情' },
      { key: 'sys_release_time', title: '系统上线实际时间' },
      { key: 'sys_release_status', title: '系统上线状态' },
    ];

    const buf = await exportXlsx(cols, wideRows, '版本概览宽表');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=version_overview_wide_table.xlsx');
    return reply.send(buf);
  });
}
