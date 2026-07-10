/**
 * 文件：modules/analysis/routes.js
 * 用途：影响性分析（开发阶段）与测试覆盖性分析（应用组装阶段）接口。
 *       两者均按需求/工单（req_code）级别组织：
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

  // 保存影响性分析（整表替换语义：按 id upsert，未出现的旧条目删除）
  fastify.post('/impact-analysis/:reqCode/save', { preHandler: fastify.requirePerm('dev', 'edit') }, async (request) => {
    const reqCode = request.params.reqCode;
    const item = await getWorkItem(reqCode);
    if (!item) throw notFound('需求/工单不存在');
    const incoming = Array.isArray(request.body?.items) ? request.body.items : [];

    // 先校验全部条目，任一不合法则整体拒绝
    const normalized = incoming.map((it) => ({ id: it.id || null, ...validateChangeItem(it) }));

    const operator = request.currentUser?.name;
    await tx(async () => {
      const existing = await all('SELECT * FROM impact_change_item WHERE req_code = ?', reqCode);
      const existingMap = new Map(existing.map((r) => [r.id, r]));
      const keptIds = new Set();

      for (let i = 0; i < normalized.length; i++) {
        const n = normalized[i];
        const base = {
          category: n.category, system: n.system, change_kind: n.change_kind,
          change_content: n.change_content, detail: n.detail, sort_order: i,
        };
        const old = n.id ? existingMap.get(n.id) : null;
        if (old) {
          keptIds.add(old.id);
          await run(
            `UPDATE impact_change_item SET category=?, system=?, change_kind=?, change_content=?, detail=?, sort_order=?, updated_at=datetime('now','localtime') WHERE id=?`,
            base.category, base.system, base.change_kind, base.change_content, base.detail, base.sort_order, old.id,
          );
          await auditUpdate('impact', old.id, reqCode, operator, old, base, IMPACT_LABELS);
        } else {
          const res = await run(
            `INSERT INTO impact_change_item (req_code, category, system, change_kind, change_content, detail, sort_order) VALUES (?,?,?,?,?,?,?)`,
            reqCode, base.category, base.system, base.change_kind, base.change_content, base.detail, base.sort_order,
          );
          keptIds.add(res.lastInsertRowid);
          await auditCreate('impact', res.lastInsertRowid, reqCode, operator);
        }
      }

      // 删除本次未保留的旧条目及其覆盖登记
      for (const r of existing) {
        if (!keptIds.has(r.id)) {
          await run('DELETE FROM coverage_item WHERE change_item_id = ?', r.id);
          await run('DELETE FROM impact_change_item WHERE id = ?', r.id);
          await auditDelete('impact', r.id, reqCode, operator);
        }
      }
    });

    const rows = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', reqCode);
    return ok({ items: rows.map(decodeChangeItem) }, '已保存');
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
      };
    });
    return ok({ header, rows, hasImpact: items.length > 0 });
  });

  // 保存测试覆盖性分析（针对影响条目逐条 upsert）
  fastify.post('/coverage-analysis/:reqCode/save', { preHandler: fastify.requirePerm('test', 'edit') }, async (request) => {
    const reqCode = request.params.reqCode;
    const item = await getWorkItem(reqCode);
    if (!item) throw notFound('需求/工单不存在');

    const impactItems = await all('SELECT id FROM impact_change_item WHERE req_code = ?', reqCode);
    if (impactItems.length === 0) throw badRequest('请先在开发阶段填写影响性分析后再填写测试覆盖性分析');
    const validIds = new Set(impactItems.map((r) => r.id));

    const rows = Array.isArray(request.body?.rows) ? request.body.rows : [];
    // 先校验全部行
    const normalized = rows.map((r) => {
      const cid = Number(r.change_item_id);
      if (!validIds.has(cid)) throw badRequest('存在无效的变更条目');
      return { change_item_id: cid, ...validateCoverageRow(r) };
    });

    const operator = request.currentUser?.name;
    await tx(async () => {
      for (const n of normalized) {
        const old = await get('SELECT * FROM coverage_item WHERE change_item_id = ?', n.change_item_id);
        if (old) {
          await run(
            `UPDATE coverage_item SET strategy=?, result=?, case_no=?, tester=?, updated_at=datetime('now','localtime') WHERE id=?`,
            n.strategy, n.result, n.case_no, n.tester, old.id,
          );
          await auditUpdate('coverage', old.id, reqCode, operator, old, n, COVERAGE_LABELS);
        } else {
          const res = await run(
            `INSERT INTO coverage_item (change_item_id, req_code, strategy, result, case_no, tester) VALUES (?,?,?,?,?,?)`,
            n.change_item_id, reqCode, n.strategy, n.result, n.case_no, n.tester,
          );
          await auditCreate('coverage', res.lastInsertRowid, reqCode, operator);
        }
      }
    });

    return ok(null, '已保存');
  });
}
