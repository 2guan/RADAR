/**
 * 文件：lib/required-fields.js
 * 用途：维护各业务模块字段必填配置目录、默认值、状态归类与保存校验。
 * 作者：hengguan
 * 说明：必填字段配置存放在 app_config JSON 中。SQLite 读取为字符串，TDSQL JSON 字段可能
 *       直接返回对象，因此统一通过 parseJsonObject 解析，保证两类数据库行为一致。
 */

import { get } from '../db/index.js';
import { badRequest } from './http.js';
import { parseJsonObject } from './json.js';

export const REQUIRED_FIELDS_CONFIG_KEY = 'required.fields';

// 必填规则按业务状态粗分为初始态、进行中、终态，供前端配置页和后端校验共同使用。
export const REQUIRED_FIELD_STATES = [
  { key: 'initial', label: '初始态' },
  { key: 'inProgress', label: '进行中' },
  { key: 'final', label: '终态' },
];

export const ATTACHMENT_INPUT_MODES = [
  { key: 'both', label: '都可以' },
  { key: 'path', label: '填路径' },
  { key: 'file', label: '上传文档' },
];

const ATTACHMENT_MODE_KEYS = new Set(ATTACHMENT_INPUT_MODES.map((m) => m.key));

// 各业务模块可配置的字段清单。字段 key 与数据库列名或前端结构化字段保持一致。
export const REQUIRED_FIELD_MODULES = [
  {
    key: 'requirement',
    label: '需求分析',
    statusField: 'status',
    statusStage: '需求',
    attachmentEntity: 'requirement',
    attachmentFields: ['需求说明书'],
    fields: [
      { key: 'req_code', label: '需求编号' },
      { key: 'status', label: '需求状态' },
      { key: 'req_type', label: '需求类型' },
      { key: 'release_point_id', label: '计划投产点' },
      { key: 'propose_time', label: '提出时间' },
      { key: 'issue_no', label: '关联问题/工单编号' },
      { key: 'is_accounting', label: '是否涉账' },
      { key: 'title', label: '需求标题' },
      { key: 'summary', label: '需求概述' },
      { key: 'main_systems', label: '主责系统', valueType: 'array' },
      { key: 'collab_dev_systems', label: '协同改造系统', valueType: 'array' },
      { key: 'collab_test_systems', label: '协同测试系统', valueType: 'array' },
      { key: 'propose_dept', label: '提出部门' },
      { key: 'proposer', label: '提出人', valueType: 'array' },
      { key: 'yn_owner', label: '云南农信业务负责人' },
      { key: 'jk_owner', label: '建信金科业务负责人' },
    ],
  },
  {
    key: 'ticket',
    label: '工单分析',
    statusField: 'status',
    statusStage: '工单',
    fields: [
      { key: 'ticket_code', label: '工单编号' },
      { key: 'status', label: '工单状态' },
      { key: 'ticket_type', label: '工单类型' },
      { key: 'release_point_id', label: '计划投产点' },
      { key: 'propose_time', label: '提出时间' },
      { key: 'issue_no', label: '关联问题/工单编号' },
      { key: 'is_accounting', label: '是否涉账' },
      { key: 'title', label: '工单概述' },
      { key: 'summary', label: '工单详情' },
      { key: 'main_systems', label: '主责系统', valueType: 'array' },
      { key: 'collab_dev_systems', label: '协同改造系统', valueType: 'array' },
      { key: 'collab_test_systems', label: '协同测试系统', valueType: 'array' },
      { key: 'propose_dept', label: '提出部门' },
      { key: 'proposer', label: '提出人', valueType: 'array' },
      { key: 'yn_owner', label: '云南农信工单负责人' },
      { key: 'jk_owner', label: '建信金科工单负责人' },
    ],
  },
  {
    key: 'dev',
    label: '开发管理',
    statusField: 'status',
    statusStage: '开发',
    attachmentEntity: 'dev',
    attachmentFields: ['概要设计', '详细设计', '代码走查', '单元测试报告'],
    fields: [
      { key: 'task_name', label: '开发任务名称' },
      { key: 'content', label: '开发内容概述' },
      { key: 'impact_analysis', label: '影响性分析', valueType: 'impactAnalysis' },
      { key: 'status', label: '开发状态' },
      { key: 'owner', label: '开发负责人' },
      { key: 'impl_system', label: '开发实施系统' },
      { key: 'impl_org', label: '开发实施方' },
      { key: 'plan_start', label: '计划开始时间' },
      { key: 'plan_end', label: '计划结束时间' },
      { key: 'actual_start', label: '实际开始时间' },
      { key: 'actual_end', label: '实际结束时间' },
    ],
  },
  {
    key: 'test',
    label: '测试管理',
    statusField: 'status',
    statusStage: '测试',
    attachmentEntity: 'test',
    attachmentFields: ['测试方案', '测试报告'],
    fields: [
      { key: 'task_name', label: '测试任务名称' },
      { key: 'coverage_analysis', label: '测试覆盖性分析', valueType: 'coverageAnalysis' },
      { key: 'status', label: '测试状态' },
      { key: 'owner', label: '测试负责人' },
      { key: 'impl_system', label: '测试实施系统' },
      { key: 'impl_org', label: '测试实施方' },
      { key: 'impl_agency', label: '实施机构' },
      { key: 'plan_start', label: '计划开始时间' },
      { key: 'plan_end', label: '计划结束时间' },
      { key: 'actual_start', label: '实际开始时间' },
      { key: 'actual_end', label: '实际结束时间' },
    ],
  },
  {
    key: 'release_apply',
    label: '投产申请',
    fields: [
      { key: 'ref_codes', label: '关联需求/工单', valueType: 'array' },
      { key: 'change_code', label: '变更编号' },
      { key: 'release_point_id', label: '计划投产点' },
      { key: 'change_system', label: '变更系统' },
      { key: 'change_content', label: '变更内容' },
      { key: 'impact_scope', label: '影响范围' },
      { key: 'impl_org', label: '实施机构' },
      { key: 'out_dept', label: '变更负责部门（输出口径）' },
      { key: 'deploy_dept', label: '变更负责部门（部署口径）' },
      { key: 'delivery_units.artifact_type', label: '制品类型', valueType: 'deliveryUnit' },
      { key: 'delivery_units.delivery_unit', label: '交付单元名称' , valueType: 'deliveryUnit' },
      { key: 'delivery_units.new_version', label: '新版本号', valueType: 'deliveryUnit' },
      { key: 'delivery_units.ferry_status', label: '摆渡状态', valueType: 'deliveryUnit' },
    ],
  },
];

function allRequired() {
  // 默认三类状态均必填，用于需求/工单等核心登记字段。
  return { initial: true, inProgress: true, final: true };
}

function finalRequired() {
  // 默认仅终态必填，用于计划/实际日期等随流程推进补录的字段。
  return { initial: false, inProgress: false, final: true };
}

// 系统默认必填配置。用户未配置或配置不完整时会以该对象作为基线补齐。
export const DEFAULT_REQUIRED_FIELD_CONFIG = {
  requirement: {
    req_code: allRequired(),
    req_type: allRequired(),
    release_point_id: allRequired(),
    propose_time: allRequired(),
    is_accounting: allRequired(),
    title: allRequired(),
    summary: allRequired(),
    main_systems: allRequired(),
    propose_dept: allRequired(),
    proposer: allRequired(),
  },
  ticket: {
    ticket_code: allRequired(),
    ticket_type: allRequired(),
    release_point_id: allRequired(),
    propose_time: allRequired(),
    is_accounting: allRequired(),
    title: allRequired(),
    summary: allRequired(),
    main_systems: allRequired(),
    propose_dept: allRequired(),
    proposer: allRequired(),
  },
  dev: {
    plan_start: finalRequired(),
    plan_end: finalRequired(),
    actual_start: finalRequired(),
    actual_end: finalRequired(),
  },
  test: {
    plan_start: finalRequired(),
    plan_end: finalRequired(),
    actual_start: finalRequired(),
    actual_end: finalRequired(),
  },
  release_apply: {
    ref_codes: allRequired(),
    release_point_id: allRequired(),
    change_system: allRequired(),
    change_content: allRequired(),
    'delivery_units.artifact_type': allRequired(),
    'delivery_units.delivery_unit': allRequired(),
    'delivery_units.new_version': allRequired(),
  },
};

const MODULE_MAP = new Map(REQUIRED_FIELD_MODULES.map((m) => [m.key, m]));

const ENTITY_MODULE_MAP = {
  requirement: { moduleKey: 'requirement', table: 'requirement' },
  dev: { moduleKey: 'dev', table: 'dev_task' },
  test: { moduleKey: 'test', table: 'test_task' },
};

function cloneConfig(config) {
  // 必填配置是嵌套对象，使用深拷贝避免归一化过程污染默认常量。
  return JSON.parse(JSON.stringify(config || {}));
}

export function normalizeRequiredFieldConfig(input = {}) {
  // 只保留当前模块允许配置的字段，并补齐每个字段在三个状态下的布尔值。
  const out = cloneConfig(DEFAULT_REQUIRED_FIELD_CONFIG);
  for (const mod of REQUIRED_FIELD_MODULES) {
    const fieldKeys = new Set([
      ...mod.fields.map((f) => f.key),
      ...(mod.attachmentFields || []).map((name) => `attachment:${name}`),
    ]);
    const moduleInput = input?.[mod.key] || {};
    out[mod.key] = out[mod.key] || {};
    for (const field of Object.keys(moduleInput)) {
      if (!fieldKeys.has(field)) continue;
      const incomingMode = moduleInput[field]?.mode || {};
      out[mod.key][field] = {
        initial: !!moduleInput[field]?.initial,
        inProgress: !!moduleInput[field]?.inProgress,
        final: !!moduleInput[field]?.final,
      };
      if (field.startsWith('attachment:')) {
        out[mod.key][field].mode = {
          initial: ATTACHMENT_MODE_KEYS.has(incomingMode.initial) ? incomingMode.initial : 'both',
          inProgress: ATTACHMENT_MODE_KEYS.has(incomingMode.inProgress) ? incomingMode.inProgress : 'both',
          final: ATTACHMENT_MODE_KEYS.has(incomingMode.final) ? incomingMode.final : 'both',
        };
      }
    }
    for (const field of Object.keys(out[mod.key])) {
      if (!fieldKeys.has(field)) {
        delete out[mod.key][field];
        continue;
      }
      if (field.startsWith('attachment:')) {
        out[mod.key][field].mode = {
          initial: ATTACHMENT_MODE_KEYS.has(out[mod.key][field].mode?.initial) ? out[mod.key][field].mode.initial : 'both',
          inProgress: ATTACHMENT_MODE_KEYS.has(out[mod.key][field].mode?.inProgress) ? out[mod.key][field].mode.inProgress : 'both',
          final: ATTACHMENT_MODE_KEYS.has(out[mod.key][field].mode?.final) ? out[mod.key][field].mode.final : 'both',
        };
      }
      if (out[mod.key][field].initial) {
        out[mod.key][field].inProgress = true;
        out[mod.key][field].final = true;
      }
    }
  }
  return out;
}

export async function readRequiredFieldConfig() {
  const row = await get('SELECT value FROM app_config WHERE key = ?', REQUIRED_FIELDS_CONFIG_KEY);
  if (!row?.value) return normalizeRequiredFieldConfig();
  try {
    return normalizeRequiredFieldConfig(JSON.parse(row.value));
  } catch {
    return normalizeRequiredFieldConfig();
  }
}

export async function statusTypeForProcessStatus(statusAttr) {
  if (!statusAttr) return 'initial';
  const row = await get('SELECT extra FROM dict_item WHERE category = ? AND attr_value = ?', 'process_status', statusAttr);
  if (row?.extra) {
    try {
      const extra = parseJsonObject(row.extra);
      if (extra.stateType === 'initial') return 'initial';
      if (extra.stateType === 'final' || extra.isTerminal) return 'final';
      return 'inProgress';
    } catch {}
  }
  const val = String(statusAttr);
  if (val.includes('登记') || val.includes('承接') || val.includes('初始') || val.includes('新建')) return 'initial';
  if (val.includes('完成') || val.includes('上线') || val.includes('通过') || val.includes('同意')) return 'final';
  return 'inProgress';
}

export function statusTypeForReleaseApply(reviewStatus) {
  if (!reviewStatus || reviewStatus === '待评审') return 'initial';
  if (reviewStatus === '评审同意') return 'final';
  return 'inProgress';
}

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function deliveryUnitsMissing(row, childKey) {
  const units = Array.isArray(row.delivery_units) ? row.delivery_units : [];
  if (!units.length) return true;
  return units.some((unit) => isEmptyValue(unit?.[childKey]));
}

async function analysisMissing(valueType, row) {
  const reqCode = String(row?.req_code || '').trim();
  if (!reqCode) return true;

  if (valueType === 'impactAnalysis') {
    const item = await get('SELECT id FROM impact_change_item WHERE req_code = ? LIMIT 1', reqCode);
    return !item;
  }

  if (valueType === 'coverageAnalysis') {
    // 测试覆盖性分析仅适用于 SIT；其他测试类型无需填写该结构化分析。
    if (row?.test_type !== 'SIT') return false;
    const total = await get('SELECT COUNT(*) AS c FROM impact_change_item WHERE req_code = ?', reqCode);
    if (!total?.c) return true;
    const covered = await get(
      `SELECT COUNT(*) AS c FROM coverage_item
       WHERE req_code = ?
         AND strategy IS NOT NULL AND TRIM(strategy) <> ''
         AND result IS NOT NULL AND TRIM(result) <> ''
         AND case_no IS NOT NULL AND TRIM(case_no) <> ''
         AND tester IS NOT NULL AND TRIM(tester) <> ''`,
      reqCode,
    );
    return Number(covered?.c || 0) !== Number(total.c || 0);
  }

  return false;
}

async function countAttachments(entityType, entityId, fieldKey, mode = 'both') {
  if (!entityType || !entityId || !fieldKey) return 0;
  const kindSql = mode === 'path' || mode === 'file' ? ' AND kind = ?' : '';
  const params = [entityType, entityId, fieldKey];
  if (kindSql) params.push(mode);
  const row = await get(
    `SELECT COUNT(*) AS c FROM attachment WHERE entity_type = ? AND entity_id = ? AND field_key = ?${kindSql}`,
    ...params,
  );
  return row?.c ?? 0;
}

export async function validateRequiredFields(moduleKey, stateType, row) {
  const mod = MODULE_MAP.get(moduleKey);
  if (!mod) return;
  const config = await readRequiredFieldConfig();
  const stateKey = stateType === 'final' ? 'final' : (stateType === 'initial' ? 'initial' : 'inProgress');
  const moduleConfig = config[moduleKey] || {};
  const missing = [];

  for (const field of mod.fields) {
    if (!moduleConfig[field.key]?.[stateKey]) continue;
    if (field.valueType === 'deliveryUnit') {
      const childKey = field.key.split('.')[1];
      if (deliveryUnitsMissing(row, childKey)) missing.push(field.label);
    } else if (field.valueType === 'impactAnalysis' || field.valueType === 'coverageAnalysis') {
      if (await analysisMissing(field.valueType, row)) missing.push(field.label);
    } else if (isEmptyValue(row[field.key])) {
      missing.push(field.label);
    }
  }
  for (const attachmentName of mod.attachmentFields || []) {
    const key = `attachment:${attachmentName}`;
    if (!moduleConfig[key]?.[stateKey]) continue;
    if (!row.id) continue;
    const mode = moduleConfig[key]?.mode?.[stateKey] || 'both';
    if (await countAttachments(mod.attachmentEntity, row.id, attachmentName, mode) === 0) {
      const modeLabel = ATTACHMENT_INPUT_MODES.find((m) => m.key === mode)?.label || '都可以';
      missing.push(`${attachmentName}（${modeLabel}）`);
    }
  }

  if (missing.length) {
    throw badRequest(`${mod.label}${REQUIRED_FIELD_STATES.find((s) => s.key === stateKey)?.label || ''}必填：${missing.join('、')}`);
  }
}

export async function getAttachmentInputMode(moduleKey, stateType, fieldKey) {
  const stateKey = stateType === 'final' ? 'final' : (stateType === 'initial' ? 'initial' : 'inProgress');
  const config = await readRequiredFieldConfig();
  return config[moduleKey]?.[`attachment:${fieldKey}`]?.mode?.[stateKey] || 'both';
}

export async function assertAttachmentInputAllowed(entityType, entityId, fieldKey, kind) {
  const meta = ENTITY_MODULE_MAP[entityType];
  if (!meta || !fieldKey || !entityId) return;
  const row = await get(`SELECT status FROM ${meta.table} WHERE id = ?`, entityId);
  if (!row) return;
  const mode = await getAttachmentInputMode(meta.moduleKey, await statusTypeForProcessStatus(row.status), fieldKey);
  if (mode === 'path' && kind === 'file') throw badRequest(`${fieldKey}仅允许填写路径`);
  if (mode === 'file' && kind === 'path') throw badRequest(`${fieldKey}仅允许上传文档`);
}

export async function requiredFieldCatalogPayload() {
  return {
    states: REQUIRED_FIELD_STATES,
    attachmentModes: ATTACHMENT_INPUT_MODES,
    modules: REQUIRED_FIELD_MODULES,
    config: await readRequiredFieldConfig(),
  };
}
