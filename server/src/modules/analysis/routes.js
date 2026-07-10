/**
 * 文件：modules/analysis/routes.js
 * 用途：影响性分析（开发阶段）与测试覆盖性分析（应用组装阶段）接口。
 *       两者均按需求/工单（req_code）级别组织，支持逐条新增/修改/删除：
 *         - 影响性分析：登记若干「变更内容」条目（复用开发 dev 权限）；
 *         - 测试覆盖性分析：针对影响性分析每个条目逐条登记覆盖（复用测试 test 权限），
 *           必须先有影响性分析条目才能填写。
 * 作者：hengguan
 */

import { get, all, run, tx } from '../../db/index.js';
import { ok, notFound, badRequest } from '../../lib/http.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { getWorkItem } from '../../lib/work-items.js';
import {
  validateChangeItem, decodeChangeItem, validateCoverageRow,
} from '../../lib/impact-schema.js';

// 影响性分析条目留痕字段
const IMPACT_LABELS = {
  category: '变更分类', system: '系统名称', change_kind: '变更类型',
  change_content: '变更内容', detail: '明细',
};
const COVERAGE_LABELS = {
  strategy: '案例覆盖策略简述', result: '测试覆盖检查结果',
  case_no: '测试案例编号', tester: '测试人员',
};

/**
 * 组装需求/工单头部信息（编号/名称/主责系统/协同系统）。
 * @param {string} collabField 协同系统取值字段：开发用 collab_dev_systems，测试用 collab_test_systems
 */
async function buildHeader(reqCode, collabField) {
  const item = await getWorkItem(reqCode);
  if (!item) throw notFound('需求/工单不存在');
  const sysMap = {};
  for (const s of await all('SELECT sys_code, sys_name FROM system')) sysMap[s.sys_code] = s.sys_name;
  const toNames = (codes) => (codes || []).map((c) => sysMap[c] || c);
  return {
    req_code: item.req_code,
    title: item.title || '',
    entity_label: item.entity_label,
    main_system_names: toNames(item.main_systems),
    collab_system_names: toNames(item[collabField]),
  };
}

export default async function analysisRoutes(fastify) {
  // ---- 影响性分析 ----

  // 读取某需求/工单的影响性分析（头部 + 全部变更条目）
  fastify.get('/impact-analysis/:reqCode', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const reqCode = request.params.reqCode;
    const header = await buildHeader(reqCode, 'collab_dev_systems');
    const rows = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', reqCode);
    return ok({ header, items: rows.map(decodeChangeItem) });
  });

  // 新增一条变更条目
  fastify.post('/impact-analysis/:reqCode/items', { preHandler: fastify.requirePerm('dev', 'edit') }, async (request) => {
    const reqCode = request.params.reqCode;
    if (!(await getWorkItem(reqCode))) throw notFound('需求/工单不存在');
    const n = validateChangeItem(request.body || {});
    const maxRow = await get('SELECT MAX(sort_order) AS m FROM impact_change_item WHERE req_code = ?', reqCode);
    const sort = (maxRow?.m ?? -1) + 1;
    const res = await run(
      `INSERT INTO impact_change_item (req_code, category, system, change_kind, change_content, detail, sort_order) VALUES (?,?,?,?,?,?,?)`,
      reqCode, n.category, n.system, n.change_kind, n.change_content, n.detail, sort,
    );
    await auditCreate('impact', res.lastInsertRowid, reqCode, request.currentUser?.name);
    const row = await get('SELECT * FROM impact_change_item WHERE id = ?', res.lastInsertRowid);
    return ok(decodeChangeItem(row), '已保存');
  });

  // 修改一条变更条目
  fastify.put('/impact-analysis/items/:id', { preHandler: fastify.requirePerm('dev', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = await get('SELECT * FROM impact_change_item WHERE id = ?', id);
    if (!old) throw notFound('变更条目不存在');
    const n = validateChangeItem(request.body || {});
    const base = { category: n.category, system: n.system, change_kind: n.change_kind, change_content: n.change_content, detail: n.detail };
    await run(
      `UPDATE impact_change_item SET category=?, system=?, change_kind=?, change_content=?, detail=?, updated_at=datetime('now','localtime') WHERE id=?`,
      base.category, base.system, base.change_kind, base.change_content, base.detail, id,
    );
    await auditUpdate('impact', id, old.req_code, request.currentUser?.name, old, base, IMPACT_LABELS);
    const row = await get('SELECT * FROM impact_change_item WHERE id = ?', id);
    return ok(decodeChangeItem(row), '已保存');
  });

  // 删除一条变更条目（连带其覆盖登记）
  fastify.delete('/impact-analysis/items/:id', { preHandler: fastify.requirePerm('dev', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = await get('SELECT * FROM impact_change_item WHERE id = ?', id);
    if (!old) throw notFound('变更条目不存在');
    await tx(async () => {
      await run('DELETE FROM coverage_item WHERE change_item_id = ?', id);
      await run('DELETE FROM impact_change_item WHERE id = ?', id);
    });
    await auditDelete('impact', id, old.req_code, request.currentUser?.name);
    return ok(null, '已删除');
  });

  // ---- 测试覆盖性分析 ----

  // 读取某需求/工单的测试覆盖性分析（头部 + 逐条影响条目及其覆盖登记）
  fastify.get('/coverage-analysis/:reqCode', { preHandler: fastify.requirePerm('test', 'view') }, async (request) => {
    const reqCode = request.params.reqCode;
    const header = await buildHeader(reqCode, 'collab_test_systems');
    const items = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', reqCode);
    const covs = await all('SELECT * FROM coverage_item WHERE req_code = ?', reqCode);
    const covMap = new Map(covs.map((c) => [c.change_item_id, c]));
    const rows = items.map((it) => {
      const d = decodeChangeItem(it);
      const c = covMap.get(it.id) || {};
      return {
        change_item_id: it.id,
        category: d.category, system: d.system, change_kind: d.change_kind, change_content: d.change_content,
        strategy: c.strategy || '', result: c.result || '', case_no: c.case_no || '', tester: c.tester || '',
        saved: !!c.id,
      };
    });
    return ok({ header, rows, hasImpact: items.length > 0 });
  });

  // 保存（新增/修改）一条覆盖登记
  fastify.put('/coverage-analysis/items/:changeItemId', { preHandler: fastify.requirePerm('test', 'edit') }, async (request) => {
    const cid = Number(request.params.changeItemId);
    const impact = await get('SELECT * FROM impact_change_item WHERE id = ?', cid);
    if (!impact) throw notFound('变更条目不存在');
    const n = validateCoverageRow(request.body || {});
    const operator = request.currentUser?.name;
    const old = await get('SELECT * FROM coverage_item WHERE change_item_id = ?', cid);
    if (old) {
      await run(
        `UPDATE coverage_item SET strategy=?, result=?, case_no=?, tester=?, updated_at=datetime('now','localtime') WHERE id=?`,
        n.strategy, n.result, n.case_no, n.tester, old.id,
      );
      await auditUpdate('coverage', old.id, impact.req_code, operator, old, n, COVERAGE_LABELS);
    } else {
      const res = await run(
        `INSERT INTO coverage_item (change_item_id, req_code, strategy, result, case_no, tester) VALUES (?,?,?,?,?,?)`,
        cid, impact.req_code, n.strategy, n.result, n.case_no, n.tester,
      );
      await auditCreate('coverage', res.lastInsertRowid, impact.req_code, operator);
    }
    return ok({ change_item_id: cid, ...n, saved: true }, '已保存');
  });
}
