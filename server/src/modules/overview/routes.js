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

/** 计算一组任务的节点状态（含单一代表状态 status，供阶段标签展示） */
function nodeState(tasks) {
  if (!tasks.length) return { state: 'pending', text: null, status: null };
  const allTerminal = tasks.every((t) => isTerminalStatus(t.status));
  const nonTerminal = tasks.find((t) => !isTerminalStatus(t.status));
  const status = nonTerminal ? nonTerminal.status : tasks[tasks.length - 1].status;
  const text = tasks.map((t) => t.status).join('、');
  return { state: allTerminal ? 'done' : 'doing', text, status };
}

/** 取需求实施机构：主责系统首个所属机构，回退提出部门 */
function reqOrg(req) {
  const main = req.main_systems ? JSON.parse(req.main_systems) : [];
  if (main.length) {
    const sys = get('SELECT org FROM system WHERE sys_code = ?', main[0]);
    if (sys?.org) return sys.org;
  }
  return req.propose_dept || '未分配机构';
}

/** 系统编号转名称（标签展示用） */
function sysNames(codes) {
  return (codes || []).map((c) => get('SELECT sys_name FROM system WHERE sys_code = ?', c)?.sys_name || c);
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

/** 构建单需求链路概要 */
function buildChain(req) {
  const dev = all('SELECT status FROM dev_task WHERE req_code = ?', req.req_code);
  const sit = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', req.req_code, 'SIT');
  const nft = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', req.req_code, 'NFT');
  const sec = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', req.req_code, 'SEC');
  const uat = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', req.req_code, 'UAT');
  const rt = get('SELECT status FROM release_task WHERE req_code = ?', req.req_code);

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

export default async function overviewRoutes(fastify) {
  // 概览列表（按实施机构分组）
  fastify.post('/overview/list', { preHandler: fastify.requirePerm('overview', 'view') }, async (request) => {
    const body = request.body || {};
    let sql = 'SELECT * FROM requirement';
    const params = [];
    const win = inClause('release_point_id', windowIds(body));
    if (win.where) { sql += ` WHERE ${win.where}`; params.push(...win.params); }
    sql += ' ORDER BY id DESC';
    const reqs = all(sql, ...params);

    const groups = {};
    for (const r of reqs) {
      const org = reqOrg(r);
      const chain = buildChain(r);
      const names = sysNames(r.main_systems ? JSON.parse(r.main_systems) : []);
      const card = {
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
    } : null;

    // 需求：解析人员、主责系统与协同改造系统
    const mainCodes = req.main_systems ? JSON.parse(req.main_systems) : [];
    const collabCodes = req.collab_dev_systems ? JSON.parse(req.collab_dev_systems) : [];
    const requirement = {
      ...req,
      attachments: attachOf('requirement', req.id),
      proposerInfo: resolvePerson(req.proposer),
      ynOwnerInfo: resolvePerson(req.yn_owner),
      jkOwnerInfo: resolvePerson(req.jk_owner),
      mainSystemsInfo: mainCodes.map(resolveSystem),
      collabDevSystemsInfo: collabCodes.map(resolveSystem),
    };

    return ok({ requirement, dev, sit, nft, sec, uat, release: releaseDetail });
  });
}
