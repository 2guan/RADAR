/**
 * 文件：server/src/modules/settings/process-configuration/application/business-components.js
 * 说明：新增安全扫描、性能压测等组件时，在此注册校验器及前端渲染器标识即可，管理员不能拼接业务 SQL。
 * 用途：复杂业务组件注册中心。公共阶段配置只引用 component_key，具体数据口径由组件实现维护。
 * 作者：hengguan
 */

import { get } from '../../../../platform/persistence/index.js';

const components = new Map();

export function registerBusinessComponent(key, definition) {
  if (!key || typeof definition?.isMissing !== 'function') throw new Error('业务组件必须提供 isMissing 校验器');
  components.set(key, definition);
}

export function getBusinessComponent(key) {
  return components.get(key) || null;
}

registerBusinessComponent('impact_analysis', {
  label: '影响性分析', renderer: 'impact_analysis',
  async isMissing(row) {
    if (!row?.req_code) return true;
    return !(await get('SELECT id FROM impact_change_item WHERE req_code = ? LIMIT 1', row.req_code));
  },
});

registerBusinessComponent('coverage_analysis', {
  label: '测试覆盖性分析', renderer: 'coverage_analysis',
  async isMissing(row) {
    if (!row?.req_code) return true;
    const total = await get('SELECT COUNT(*) AS c FROM impact_change_item WHERE req_code = ?', row.req_code);
    if (!total?.c) return true;
    const covered = await get(`SELECT COUNT(*) AS c FROM coverage_item WHERE req_code = ?
      AND strategy IS NOT NULL AND TRIM(strategy) <> ''
      AND result IS NOT NULL AND TRIM(result) <> ''
      AND case_no IS NOT NULL AND TRIM(case_no) <> ''
      AND tester IS NOT NULL AND TRIM(tester) <> ''`, row.req_code);
    return Number(covered?.c || 0) !== Number(total.c || 0);
  },
});

/** 投产申请的交付制品为可增删的明细行，必填时至少需要一组有效制品。 */
registerBusinessComponent('release_apply_artifacts', {
  label: '交付制品', renderer: 'release_apply_artifacts',
  async isMissing(row) {
    const raw = row?.delivery_units;
    const units = Array.isArray(raw) ? raw : (() => {
      try { return JSON.parse(raw || '[]'); } catch { return []; }
    })();
    return !units.some((unit) => unit?.artifact_type || unit?.delivery_unit || unit?.new_version);
  },
});

/** 审批实例的申请投产点会联动任务定位与关联记录，保留现有专用选择逻辑。 */
registerBusinessComponent('release_point', {
  label: '申请投产点', renderer: 'release_point',
  async isMissing() {
    // 审批详情必须由实体与投产点共同定位，进入详情时已完成该前置约束。
    return false;
  },
});

/** 审批对象概览聚合需求、工单或问题的进度与摘要，维持现有只读展示口径。 */
registerBusinessComponent('approval_overview', {
  label: '审批对象概览', renderer: 'approval_overview',
  async isMissing() {
    return false;
  },
});

/** 会签由角色、签署动作和签名数据共同组成，不能由管理员拆成普通输入字段。 */
registerBusinessComponent('release_signoff', {
  label: '评审会签', renderer: 'release_signoff',
  async isMissing(row) {
    if (!row?.id) return true;
    const summary = await get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN result = '已签署' THEN 1 ELSE 0 END) AS signed
      FROM release_signoff WHERE release_task_id = ?`, row.id);
    return !Number(summary?.total) || Number(summary?.signed || 0) < Number(summary.total);
  },
});

/** 关联制品从投产申请明细派生，保持现有查询口径，预留必填规则接入点。 */
registerBusinessComponent('release_artifacts', {
  label: '关联制品情况', renderer: 'release_artifacts',
  async isMissing() {
    // 当前关联制品为审批详情的只读汇总，不以“存在至少一条”限制审批流转。
    return false;
  },
});
