/**
 * 文件：server/src/modules/settings/process-configuration/application/stage-content.js
 * 说明：具体状态始终读取 dict_item；范围注册仅描述实体与状态来源，不保存状态名称。
 * 用途：阶段内容与公共交付件的领域服务。集中处理阶段范围、参数状态、输入项、
 *       扩展字段值、交付件规则和配置版本，避免各业务模块维护重复硬编码。
 * 作者：hengguan
 */

import { all, get, run, tx, dialect } from '../../../../platform/persistence/index.js';
import { randomUUID } from 'node:crypto';
import { badRequest, notFound, parseJsonObject } from '../../../../platform/runtime/index.js';
import { getBusinessComponent } from './business-components.js';

const FIELD_KINDS = new Set(['native', 'extension', 'component']);
const INPUT_TYPES = new Set(['text', 'textarea', 'date', 'datetime', 'select', 'person', 'release_point', 'component']);
const FIXED_SOURCE_KEYS = new Set(['', 'system', 'person', 'release_point', 'priority']);
const INPUT_MODES = new Set(['file', 'path', 'both']);
const SECTION_LAYOUT_MODES = new Set(['left', 'right', 'full']);
const STATE_TYPE_LABELS = { initial: '初始态', inProgress: '进行中', final: '终态' };

/**
 * 阶段范围是代码级“实体适配”而非状态目录。真实状态由参数配置表维护。
 * 新阶段接入时只需在菜单声明同一个 scopeKey，并在这里注册实体映射。
 */
export const STAGE_SCOPE_DEFAULTS = [
  ['requirement', '需求分析', 'requirement', 'requirement', 'process_status', '需求', 'status', 'requirement'],
  ['ticket', '工单分析', 'ticket', 'ticket', 'process_status', '工单', 'status', 'ticket'],
  ['dev', '开发管理', 'dev', 'dev_task', 'process_status', '开发', 'status', 'dev'],
  ['test.SIT', '应用组装测试', 'test', 'test_task', 'process_status', '测试', 'status', 'test.SIT'],
  ['test.UAT', '用户测试', 'test', 'test_task', 'process_status', '测试', 'status', 'test.UAT'],
  ['test.NFT', '非功能测试', 'test', 'test_task', 'process_status', '测试', 'status', 'test.NFT'],
  ['test.SEC', '安全测试', 'test', 'test_task', 'process_status', '测试', 'status', 'test.SEC'],
  ['release_apply', '投产申请', 'release_apply', 'release_apply', 'review_status', null, 'review_status', 'release_apply'],
  ['release', '投产审批', 'release', 'release_task', 'process_status', '投产', 'status', 'release'],
];

/** 内置字段仅用于初始化定义；表单读取与保存仍由既有业务模块负责。 */
const NATIVE_FIELD_DEFAULTS = {
  requirement: [
    ['req_code', '需求编号', 'text'], ['status', '需求状态', 'select'], ['req_type', '需求类型', 'select', 'dict:req_type'],
    ['release_point_id', '计划投产点', 'release_point', 'release_point'], ['propose_time', '提出时间', 'datetime'],
    ['issue_no', 'OA编号/工单编号', 'text'], ['is_accounting', '是否涉账', 'select'], ['priority', '优先级', 'select', 'priority'], ['title', '需求标题', 'text'], ['workload', '工作量', 'text'],
    ['summary', '需求概述', 'textarea'], ['implementation_org', '实施机构', 'select', 'dict:org'], ['main_systems', '主责系统', 'select', 'system', 1],
    ['collab_dev_systems', '协同改造系统', 'select', 'system', 1], ['collab_test_systems', '协同测试系统', 'select', 'system', 1],
    ['propose_dept', '提出部门', 'select', 'dict:req_dept'], ['proposer', '提出人', 'person', 'person', 1],
    ['yn_owner', '云南农信业务负责人', 'person', 'person'], ['jk_owner', '建信金科业务负责人', 'person', 'person'], ['receiver', '需求接收人', 'person', 'person'], ['registrar', '录入人信息', 'text'],
  ],
  ticket: [
    ['ticket_code', '工单编号', 'text'], ['status', '工单状态', 'select'], ['ticket_type', '工单类型', 'select', 'dict:ticket_type'],
    ['release_point_id', '计划投产点', 'release_point', 'release_point'], ['propose_time', '提出时间', 'datetime'],
    ['issue_no', 'OA编号/工单编号', 'text'], ['is_accounting', '是否涉账', 'select'], ['priority', '优先级', 'select', 'priority'], ['title', '工单概述', 'text'], ['workload', '工作量', 'text'],
    ['summary', '工单详情', 'textarea'], ['implementation_org', '实施机构', 'select', 'dict:org'], ['main_systems', '主责系统', 'select', 'system', 1],
    ['collab_dev_systems', '协同改造系统', 'select', 'system', 1], ['collab_test_systems', '协同测试系统', 'select', 'system', 1],
    ['propose_dept', '提出部门', 'select', 'dict:req_dept'], ['proposer', '提出人', 'person', 'person', 1],
    ['yn_owner', '云南农信工单负责人', 'person', 'person'], ['jk_owner', '建信金科工单负责人', 'person', 'person'], ['receiver', '需求接收人', 'person', 'person'], ['registrar', '录入人信息', 'text'],
  ],
  dev: [
    ['task_name', '开发任务名称', 'text'], ['content', '开发内容概述', 'textarea'], ['status', '开发状态', 'select'],
    ['owner', '开发负责人', 'person', 'person'], ['impl_system', '开发实施系统', 'select', 'system'], ['impl_org', '开发实施方', 'select', 'dict:org'],
    ['plan_start', '计划开始时间', 'date'], ['plan_end', '计划结束时间', 'date'], ['actual_start', '实际开始时间', 'date'], ['actual_end', '实际完成时间', 'date'],
    ['impact_analysis', '影响性分析', 'component', '', 0, 'impact_analysis'],
  ],
  test: [
    ['task_name', '测试任务名称', 'text'], ['status', '测试状态', 'select'], ['owner', '测试负责人', 'person', 'person'],
    ['impl_system', '测试实施系统', 'select', 'system'], ['impl_org', '测试实施方', 'select', 'dict:org'],
    ['plan_start', '计划开始时间', 'date'], ['plan_end', '计划结束时间', 'date'], ['actual_start', '实际开始时间', 'date'], ['actual_end', '实际完成时间', 'date'],
    ['coverage_analysis', '测试覆盖性分析', 'component', '', 0, 'coverage_analysis'],
  ],
  release_apply: [
    ['change_code', '变更编号', 'text'], ['ref_codes', '关联需求/工单', 'text'], ['release_point_id', '计划投产点', 'release_point', 'release_point'],
    ['change_system', '变更系统', 'select', 'system'], ['change_content', '变更内容', 'textarea'], ['impact_scope', '影响范围', 'textarea'],
    ['impl_org', '实施机构', 'select', 'dict:org'], ['out_dept', '变更负责部门（输出口径）', 'select', 'dict:org'], ['deploy_dept', '变更负责部门（部署口径）', 'select', 'dict:org'],
    // 交付制品由多行结构化数据组成，按业务组件维护，不能退化为可自由拼接的普通字段。
    ['delivery_units', '交付制品', 'component', '', 0, 'release_apply_artifacts'],
  ],
  release: [
    ['status', '投产状态', 'select', 'dict:process_status'],
    ['owner', '投产负责人', 'person', 'person'],
    ['approval_overview', '审批对象概览', 'component', '', 0, 'approval_overview'],
    // 申请投产点变更会联动审批实例，使用业务组件承接既有专用交互。
    ['release_point', '申请投产点', 'component', '', 0, 'release_point'],
    // 投产审批中的会签、制品关联均有独立数据模型和操作规则，作为业务组件进入输入项配置。
    ['review_signoff', '评审会签', 'component', '', 0, 'release_signoff'],
    ['related_artifacts', '关联制品情况', 'component', '', 0, 'release_artifacts'],
  ],
};

/**
 * 内置配置目录是字段语义的唯一代码基线：数据库只保存管理员可调整的布局、可见性和状态规则。
 * `renderer` 明确区分可由公共控件呈现的普通字段和必须由业务 JSX 声明的复杂控件。
 */
export const BUILTIN_CONFIGURATION_UPGRADE_ID = 'settings.builtin-configuration.v3';
export const PRIORITY_OPTIONS = [
  { value: '高', label: '高' },
  { value: '中', label: '中' },
  { value: '低', label: '低' },
];

export function resolveBuiltinConfiguration(scopeKey, fieldKey) {
  const root = baseScope(scopeKey);
  const definition = (NATIVE_FIELD_DEFAULTS[root] || []).find(([key]) => key === fieldKey);
  if (!definition) return null;
  const [key, label, inputType, sourceKey = '', multiple = 0, componentKey = null] = definition;
  const priority = key === 'priority';
  return {
    scope_key: scopeKey,
    field_key: key,
    label,
    input_type: inputType,
    source_key: sourceKey || null,
    multiple: !!multiple,
    component_key: componentKey,
    renderer: priority ? 'standard' : (inputType === 'component' ? 'adapter' : 'declaration'),
    default_value: priority ? '中' : null,
    options: priority ? PRIORITY_OPTIONS : [],
    capabilities: priority ? { list: true, filter: true, dashboard: true, import: true, export: true } : {},
  };
}

/** 所有写入入口共用字段语义；调用方决定缺失字段是否应写入默认值。 */
export function normalizeConfiguredFieldValue(scopeKey, fieldKey, value, { defaultOnEmpty = true } = {}) {
  const definition = resolveBuiltinConfiguration(scopeKey, fieldKey);
  if (!definition || fieldKey !== 'priority') return value;
  const normalized = value === undefined || value === null ? '' : String(value).trim();
  if (!normalized) return defaultOnEmpty ? definition.default_value : value;
  if (!definition.options.some((option) => option.value === normalized)) {
    throw badRequest(`优先级仅支持${definition.options.map((option) => option.label).join('、')}`);
  }
  return normalized;
}

const DELIVERABLE_DEFAULTS = {
  requirement: ['需求说明书'],
  dev: ['概要设计', '详细设计', '代码走查', '单元测试报告', '编码检查表', '技术方案确认单'],
  test: ['测试方案', '测试报告'],
  // 投产申请的交付制品是业务组件；这里登记的是通用附件型交付件，供配置、必填校验和附件上传复用。
  release_apply: ['摆渡证明'],
  release: ['投产变更方案', '投产变更控制表'],
};

// 来源于当前本地配置基线；新库仅在首次种子化时写入，后续由系统设置维护。
const DELIVERABLE_DEFAULT_METADATA = {
  requirement: { 需求说明书: { layout: 'right', required_from: 'final' } },
  dev: {
    概要设计: { layout: 'right' },
    详细设计: { layout: 'right' },
    代码走查: { layout: 'right' },
    单元测试报告: { layout: 'right' },
    编码检查表: { layout: 'right', required_from: 'final' },
    技术方案确认单: { layout: 'right', required_from: 'final' },
  },
  test: { 测试方案: { layout: 'right' }, 测试报告: { layout: 'right' } },
  'test.UAT': { 测试报告: { required_from: 'final' } },
  release_apply: { 摆渡证明: { layout: 'right' } },
  release: {
    投产变更方案: { layout: 'right', required_from: 'final' },
    投产变更控制表: { layout: 'right', required_from: 'final' },
  },
};

// 这些模板由所属业务模块根据当前单据数据动态生成，不能按静态附件下载。
// 仅登记稳定的处理器标识，设置模块不依赖业务模块的私有实现。
const CUSTOM_DELIVERABLE_TEMPLATE_HANDLERS = {
  dev: {
    编码检查表: 'dev.coding-checklist',
    技术方案确认单: 'dev.tech-solution-confirmation',
  },
  release: {
    投产变更方案: 'release.change-plan',
    投产变更控制表: 'release.change-control',
  },
};

const BUILTIN_METADATA_VERSION_KEY = 'stage.content.builtin-metadata.v2';
const REGISTRATION_INFO_VERSION_KEY = 'stage.content.registration-info.v1';
// v6：按本地详情页已确认的两列纵向顺序校准内置分区，供新库与 mock 重建共用。
const BUILTIN_LAYOUT_VERSION_KEY = 'stage.content.builtin-layout.v7';
const DELIVERABLE_SECTION_PRESENTATION_VERSION_KEY = 'stage.content.deliverable-section-presentation.v1';

function baseScope(scopeKey) {
  return scopeKey.startsWith('test.') ? 'test' : scopeKey;
}

function nativeFieldMetadata(builtinMetadata, scopeKey, fieldKey) {
  return builtinMetadata?.[baseScope(scopeKey)]?.[fieldKey] || {};
}

/** 种子层提供详情页分区，而领域服务只消费声明，避免运行时保存页面布局硬编码。 */
function builtinSections(sectionDefaults, scopeKey) {
  const sections = sectionDefaults?.[baseScope(scopeKey)];
  return Array.isArray(sections)
    ? sections.filter((section) => !section.scope_keys || section.scope_keys.includes(scopeKey))
    : [];
}

/** 已下线或暂未接入某个细分阶段的内置分区，在校准时自动隐藏。 */
function excludedBuiltinSections(sectionDefaults, scopeKey) {
  const sections = sectionDefaults?.[baseScope(scopeKey)];
  return Array.isArray(sections)
    ? sections.filter((section) => section.scope_keys && !section.scope_keys.includes(scopeKey))
    : [];
}

function nativeRequiredRules(statuses, requiredFrom) {
  if (!requiredFrom) return {};
  const types = requiredFrom === 'initial'
    ? new Set(['initial', 'inProgress', 'final'])
    : (requiredFrom === 'inProgress' ? new Set(['inProgress', 'final']) : new Set(['final']));
  return Object.fromEntries(statuses.map((status) => [status.id, types.has(status.state_type)]));
}

function asBool(value) { return value === true || value === 1 || value === '1'; }

function safeKey(value, label = '编码') {
  const key = String(value || '').trim();
  if (!/^[a-z][a-z0-9_]{1,63}$/i.test(key)) throw badRequest(`${label}仅支持字母、数字和下划线，且以字母开头`);
  return key;
}

/** 扩展字段编码仅作内部稳定关联，新增时由服务端生成，管理员无需感知或维护。 */
function nextExtensionFieldKey() {
  return `extension_${randomUUID().replaceAll('-', '')}`;
}

/** 交付件编码仅作内部稳定关联，新增时由服务端生成，管理员无需感知或维护。 */
function nextDeliverableKey() {
  return `deliverable_${randomUUID().replaceAll('-', '')}`;
}

async function assertSourceKey(sourceKey) {
  if (FIXED_SOURCE_KEYS.has(sourceKey)) return;
  if (!sourceKey.startsWith('dict:')) throw badRequest('字段数据源非法');
  const category = sourceKey.slice(5);
  if (!/^[a-z][a-z0-9_]{0,63}$/i.test(category)) throw badRequest('参数数据源编码非法');
  if (!await get('SELECT id FROM dict_item WHERE category = ? LIMIT 1', category)) {
    throw badRequest('参数数据源不存在或尚无可用选项');
  }
}

/**
 * 供配置页选择的公共数据源目录。
 * 分类名称由 dict_category 维护，内部编码只用于关联，不向管理员暴露。
 */
export async function listFieldSourceOptions() {
  const categories = await all(`
    SELECT DISTINCT d.category,
      COALESCE(c.label, '未命名参数分类') AS label,
      COALESCE(c.sort, 999999) AS sort
    FROM dict_item d
    LEFT JOIN dict_category c ON c.category = d.category AND c.enabled = 1
    WHERE d.category IS NOT NULL AND d.category <> ''
    ORDER BY sort, label, d.category
  `);
  return [
    ...categories.map((row) => ({ value: `dict:${row.category}`, label: `参数配置 · ${row.label}`, group: 'dict' })),
    { value: 'system', label: '机构系统 · 所属系统', group: 'system' },
    { value: 'person', label: '人员管理', group: 'person' },
    { value: 'release_point', label: '投产点管理', group: 'release_point' },
    { value: 'priority', label: '固定枚举 · 优先级（高/中/低）', group: 'fixed' },
  ];
}

export async function getStageScope(scopeKey) {
  const row = await get('SELECT * FROM stage_scope WHERE scope_key = ? AND enabled = 1', scopeKey);
  if (!row) throw notFound('阶段不存在或已停用');
  return row;
}

export async function listStageScopes() {
  // 展示顺序由前端菜单驱动；这里使用跨 SQLite/TDSQL 都支持的稳定排序。
  return await all('SELECT * FROM stage_scope WHERE enabled = 1 ORDER BY scope_key');
}

/** 从参数配置读取阶段真实状态，规则绑定 dict_item.id。 */
export async function listStageStatuses(scopeKey) {
  const scope = await getStageScope(scopeKey);
  const rows = await all('SELECT id, attr_value, display_value, sort, extra FROM dict_item WHERE category = ? ORDER BY sort, id', scope.status_category);
  return rows
    .filter((row) => !scope.status_stage || parseJsonObject(row.extra).stage === scope.status_stage)
    .map((row) => {
      const extra = parseJsonObject(row.extra);
      // 状态类型属于参数配置（dict_item.extra），阶段配置仅消费该元数据，不维护状态名称。
      const rawType = String(extra.stateType || '').trim();
      const stateType = rawType === 'initial' ? 'initial' : (rawType === 'final' || extra.isTerminal === true ? 'final' : 'inProgress');
      return {
        id: row.id,
        value: row.attr_value,
        label: row.display_value || row.attr_value,
        sort: row.sort,
        state_type: stateType,
        state_type_label: extra.stateTypeLabel || STATE_TYPE_LABELS[stateType],
      };
    });
}

async function sectionMap(scopeKey) {
  const rows = await all('SELECT * FROM stage_section WHERE scope_key = ? AND deleted_at IS NULL ORDER BY sort, id', scopeKey);
  return new Map(rows.map((row) => [row.id, row]));
}

async function rulesFor(table, idColumn, ids) {
  if (!ids.length) return new Map();
  const rows = await all(`SELECT ${idColumn} AS definition_id, status_dict_item_id, required FROM ${table} WHERE ${idColumn} IN (${ids.map(() => '?').join(',')})`, ...ids);
  const map = new Map(ids.map((id) => [id, {}]));
  for (const row of rows) map.get(row.definition_id)[row.status_dict_item_id] = !!row.required;
  return map;
}

export async function getStageContentConfig(scopeKey, { includeDeleted = false } = {}) {
  const scope = await getStageScope(scopeKey);
  const deletedSql = includeDeleted ? '' : ' AND deleted_at IS NULL';
  const [sections, fields, deliverables, statuses] = await Promise.all([
    all(`SELECT * FROM stage_section WHERE scope_key = ?${deletedSql} ORDER BY sort, id`, scopeKey),
    all(`SELECT * FROM stage_field_definition WHERE scope_key = ?${deletedSql} ORDER BY sort, id`, scopeKey),
    all(`SELECT * FROM deliverable_definition WHERE scope_key = ?${deletedSql} ORDER BY sort, id`, scopeKey),
    listStageStatuses(scopeKey),
  ]);
  const [fieldRules, deliverableRules] = await Promise.all([
    rulesFor('stage_field_status_rule', 'field_definition_id', fields.map((row) => row.id)),
    rulesFor('deliverable_status_rule', 'deliverable_definition_id', deliverables.map((row) => row.id)),
  ]);
  const templates = deliverables.length
    // 配置回显与详情页下载必须读取同一份当前生效模板，不能被历史禁用版本覆盖。
    ? await all(`SELECT * FROM deliverable_template_version WHERE deliverable_definition_id IN (${deliverables.map(() => '?').join(',')}) AND enabled = 1 AND deleted_at IS NULL ORDER BY version_no DESC, id DESC`, ...deliverables.map((row) => row.id))
    : [];
  const templateMap = new Map();
  for (const template of templates) {
    if (!templateMap.has(template.deliverable_definition_id)) templateMap.set(template.deliverable_definition_id, template);
  }
  return {
    scope,
    statuses,
    sections,
    fields: fields.map((row) => ({ ...row, rules: fieldRules.get(row.id) || {}, catalog: resolveBuiltinConfiguration(scopeKey, row.field_key) })),
    deliverables: deliverables.map((row) => ({ ...row, rules: deliverableRules.get(row.id) || {}, template: templateMap.get(row.id) || null })),
  };
}

/** 配置保存即生效，同时记录完整快照供审计和后续回滚能力使用。 */
export async function recordConfigRevision(scopeKey, configType, operator) {
  const snapshot = await getStageContentConfig(scopeKey, { includeDeleted: true });
  await run('INSERT INTO content_config_revision (scope_key, config_type, snapshot, operator) VALUES (?,?,?,?)', scopeKey, configType, JSON.stringify(snapshot), operator || null);
}

function normalizeRules(rules, statuses) {
  const allowed = new Map(statuses.map((status) => [Number(status.id), status]));
  const requiredTypes = new Set();
  for (const [rawId, rawRequired] of Object.entries(rules || {})) {
    const id = Number(rawId);
    const status = allowed.get(id);
    if (status && asBool(rawRequired)) requiredTypes.add(status.state_type);
  }
  // 必填规则沿流程方向继承：初始态必填意味着后续状态都必填；
  // 进行中必填同样意味着终态必填。存储时展开到具体字典状态，校验无需额外分支。
  if (requiredTypes.has('initial')) requiredTypes.add('inProgress');
  if (requiredTypes.has('initial') || requiredTypes.has('inProgress')) requiredTypes.add('final');
  return Object.fromEntries(statuses.map((status) => [status.id, requiredTypes.has(status.state_type) ? 1 : 0]));
}

async function replaceRules(table, idColumn, definitionId, rules, statuses) {
  await run(`DELETE FROM ${table} WHERE ${idColumn} = ?`, definitionId);
  const normalized = normalizeRules(rules, statuses);
  for (const status of statuses) {
    await run(`INSERT INTO ${table} (${idColumn}, status_dict_item_id, required) VALUES (?,?,?)`, definitionId, status.id, normalized[status.id] || 0);
  }
}

async function ensureStageScopes(added = null) {
  for (const [scopeKey, label, entityType, tableName, statusCategory, statusStage, statusField, permissionModule] of STAGE_SCOPE_DEFAULTS) {
    if (await get('SELECT scope_key FROM stage_scope WHERE scope_key = ?', scopeKey)) continue;
    await run('INSERT INTO stage_scope (scope_key, label, entity_type, table_name, status_category, status_stage, status_field, permission_module) VALUES (?,?,?,?,?,?,?,?)', scopeKey, label, entityType, tableName, statusCategory, statusStage, statusField, permissionModule);
    added?.push(`scope:${scopeKey}`);
  }
}

/** 当前本地配置快照以状态值而非数据库 ID 保存，初始化时再绑定到目标库的字典状态。 */
function snapshotRulesToStatusIds(rules, statuses) {
  return Object.fromEntries(statuses.map((status) => [status.id, asBool(rules?.[status.value]) ? 1 : 0]));
}

/**
 * 以稳定键重放经确认的输入项、分区与交付件快照。仅插入完全缺失的定义，
 * 因而既有环境的管理员调整、软删除和历史附件均不会被覆盖。
 */
async function seedStageContentSnapshot(snapshot, added = null) {
  if (!Array.isArray(snapshot?.scopes)) throw new Error('阶段内容 Seed 快照格式非法');
  await ensureStageScopes(added);
  for (const scopeSnapshot of snapshot.scopes) {
    const scopeKey = String(scopeSnapshot.scope_key || '');
    if (!scopeKey) throw new Error('阶段内容 Seed 快照缺少范围编码');
    await getStageScope(scopeKey);
    const sectionIds = new Map();
    for (const section of scopeSnapshot.sections || []) {
      const sectionKey = safeKey(section.section_key, '分区编码');
      let row = await get('SELECT id, deleted_at FROM stage_section WHERE scope_key = ? AND section_key = ?', scopeKey, sectionKey);
      if (!row) {
        const res = await run('INSERT INTO stage_section (scope_key, section_key, title, sort, collapsed, is_builtin, layout_mode, show_title) VALUES (?,?,?,?,?,?,?,?)', scopeKey, sectionKey, String(section.title || '').trim(), Number(section.sort || 0), asBool(section.collapsed) ? 1 : 0, asBool(section.is_builtin) ? 1 : 0, section.layout_mode || 'left', asBool(section.show_title) ? 1 : 0);
        row = { id: res.lastInsertRowid };
        added?.push(`section:${scopeKey}.${sectionKey}`);
      }
      if (!row.deleted_at) sectionIds.set(sectionKey, row.id);
    }
    const statuses = await listStageStatuses(scopeKey);
    for (const field of scopeSnapshot.fields || []) {
      const fieldKey = safeKey(field.field_key, '输入项编码');
      if (await get('SELECT id FROM stage_field_definition WHERE scope_key = ? AND field_key = ?', scopeKey, fieldKey)) continue;
      const res = await run(`INSERT INTO stage_field_definition (scope_key, field_key, label, field_kind, input_type, source_key, multiple, native_column, component_key, section_id, column_span, visible, list_visible, filterable, dashboard_dimension, sort, is_builtin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, scopeKey, fieldKey, String(field.label || '').trim(), field.field_kind, field.input_type, field.source_key || null, asBool(field.multiple) ? 1 : 0, field.native_column || null, field.component_key || null, sectionIds.get(field.section_key) || null, Number(field.column_span) === 24 ? 24 : 12, asBool(field.visible) ? 1 : 0, asBool(field.list_visible) ? 1 : 0, asBool(field.filterable) ? 1 : 0, asBool(field.dashboard_dimension) ? 1 : 0, Number(field.sort || 0), asBool(field.is_builtin) ? 1 : 0);
      if (Object.keys(field.rules || {}).length) await replaceRules('stage_field_status_rule', 'field_definition_id', res.lastInsertRowid, snapshotRulesToStatusIds(field.rules, statuses), statuses);
      added?.push(`field:${scopeKey}.${fieldKey}`);
    }
    for (const deliverable of scopeSnapshot.deliverables || []) {
      const deliverableKey = safeKey(deliverable.deliverable_key, '交付件编码');
      let row = await get('SELECT id FROM deliverable_definition WHERE scope_key = ? AND deliverable_key = ?', scopeKey, deliverableKey);
      if (!row) {
        const res = await run('INSERT INTO deliverable_definition (scope_key, deliverable_key, label, input_mode, visible, sort, layout_mode) VALUES (?,?,?,?,?,?,?)', scopeKey, deliverableKey, String(deliverable.label || '').trim(), deliverable.input_mode, asBool(deliverable.visible) ? 1 : 0, Number(deliverable.sort || 0), deliverable.layout_mode || 'left');
        row = { id: res.lastInsertRowid };
        if (Object.keys(deliverable.rules || {}).length) await replaceRules('deliverable_status_rule', 'deliverable_definition_id', row.id, snapshotRulesToStatusIds(deliverable.rules, statuses), statuses);
        added?.push(`deliverable:${scopeKey}.${deliverableKey}`);
      }
      for (const template of deliverable.templates || []) {
        if (!template.handler_key || template.template_mode !== 'custom') continue;
        if (await get('SELECT id FROM deliverable_template_version WHERE deliverable_definition_id = ? AND template_mode = ? AND handler_key = ? AND version_no = ? AND deleted_at IS NULL', row.id, template.template_mode, template.handler_key, Number(template.version_no || 0))) continue;
        await run('INSERT INTO deliverable_template_version (deliverable_definition_id, template_mode, handler_key, version_no, enabled) VALUES (?,?,?,?,?)', row.id, template.template_mode, template.handler_key, Number(template.version_no || 0), asBool(template.enabled) ? 1 : 0);
      }
    }
  }
}

export async function saveSection(scopeKey, body, operator) {
  await getStageScope(scopeKey);
  const sectionKey = safeKey(body.section_key, '分区编码');
  const title = String(body.title || '').trim();
  if (!title) throw badRequest('分区名称不能为空');
  const layoutMode = String(body.layout_mode || 'left');
  if (!SECTION_LAYOUT_MODES.has(layoutMode)) throw badRequest('分区布局非法');
  let id = Number(body.id || 0);
  if (id) {
    const old = await get('SELECT * FROM stage_section WHERE id = ? AND scope_key = ?', id, scopeKey);
    if (!old) throw notFound('分区不存在');
    if (old.is_builtin && sectionKey !== old.section_key) throw badRequest('内置分区编码不可修改');
    const showTitle = body.show_title === undefined ? !!old.show_title : asBool(body.show_title);
    if (asBool(body.collapsed) && !showTitle) throw badRequest('默认折叠的分区必须显示分区名称，以便用户展开');
    // 当前时间表达式由方言层提供，避免业务 SQL 绑定 SQLite 函数。
    await run(`UPDATE stage_section SET title=?, sort=?, collapsed=?, layout_mode=?, show_title=?, updated_at=${dialect.now} WHERE id=?`, title, Number(body.sort || 0), asBool(body.collapsed) ? 1 : 0, layoutMode, showTitle ? 1 : 0, id);
  } else {
    if (asBool(body.collapsed) && !asBool(body.show_title)) throw badRequest('默认折叠的分区必须显示分区名称，以便用户展开');
    const res = await run('INSERT INTO stage_section (scope_key, section_key, title, sort, collapsed, layout_mode, show_title) VALUES (?,?,?,?,?,?,?)', scopeKey, sectionKey, title, Number(body.sort || 0), asBool(body.collapsed) ? 1 : 0, layoutMode, asBool(body.show_title) ? 1 : 0);
    id = res.lastInsertRowid;
  }
  await recordConfigRevision(scopeKey, 'content', operator);
  return await get('SELECT * FROM stage_section WHERE id = ?', id);
}

export async function deleteSection(scopeKey, id, operator) {
  const row = await get('SELECT * FROM stage_section WHERE id = ? AND scope_key = ?', id, scopeKey);
  if (!row) throw notFound('分区不存在');
  if (row.is_builtin) throw badRequest('内置分区不可删除');
  const used = await get('SELECT COUNT(*) AS c FROM stage_field_definition WHERE section_id = ? AND deleted_at IS NULL', id);
  if (used?.c) throw badRequest('分区仍包含输入项，请先调整输入项布局');
  await run(`UPDATE stage_section SET deleted_at=${dialect.now} WHERE id=?`, id);
  await recordConfigRevision(scopeKey, 'content', operator);
}

/** 同一分区的字段布局必须一次提交，避免逐项更新导致配置修订膨胀或中途失败。 */
export async function saveSectionFieldLayout(scopeKey, body, operator) {
  const scope = await getStageScope(scopeKey);
  const sectionId = Number(body?.section_id || 0);
  const fieldIds = Array.isArray(body?.field_ids) ? body.field_ids.map((id) => Number(id)) : null;
  const columnSpans = body?.column_spans;
  if (!Number.isInteger(sectionId) || sectionId <= 0) throw badRequest('请选择需要排序的分区');
  if (!fieldIds || fieldIds.some((id) => !Number.isInteger(id) || id <= 0)) throw badRequest('字段排序参数非法');
  if (new Set(fieldIds).size !== fieldIds.length) throw badRequest('字段排序不能包含重复输入项');
  if (!columnSpans || typeof columnSpans !== 'object' || Array.isArray(columnSpans)) throw badRequest('字段宽度参数非法');
  const spanIds = Object.keys(columnSpans).map((id) => Number(id));
  if (spanIds.some((id) => !Number.isInteger(id) || id <= 0) || spanIds.length !== fieldIds.length || fieldIds.some((id) => !Object.hasOwn(columnSpans, id))) {
    throw badRequest('字段宽度必须覆盖该分区的全部输入项');
  }
  const spanById = new Map(fieldIds.map((id) => [id, Number(columnSpans[id])]));
  if ([...spanById.values()].some((span) => ![12, 24].includes(span))) throw badRequest('字段宽度仅支持半行或整行');

  const section = await get('SELECT id FROM stage_section WHERE id = ? AND scope_key = ? AND deleted_at IS NULL', sectionId, scopeKey);
  if (!section) throw badRequest('所属分区不存在');
  // 状态字段由各阶段详情标题栏独立承载，不能以空白网格槽位参与分区排序或宽度保存。
  const configuredFields = await all(`SELECT id, sort, column_span FROM stage_field_definition
    WHERE scope_key = ? AND section_id = ? AND deleted_at IS NULL AND field_key <> ? ORDER BY sort, id`, scopeKey, sectionId, scope.status_field);
  if (configuredFields.length !== fieldIds.length || configuredFields.some((field) => !fieldIds.includes(field.id))) {
    throw badRequest('字段排序必须包含该分区的全部输入项');
  }
  const hasChanged = configuredFields.some((field, index) => (
    field.id !== fieldIds[index]
    || Number(field.sort) !== (index + 1) * 10
    || Number(field.column_span) !== spanById.get(field.id)
  ));
  if (!hasChanged) return configuredFields;

  await tx(async () => {
    for (const [index, fieldId] of fieldIds.entries()) {
      await run(`UPDATE stage_field_definition SET sort = ?, column_span = ?, updated_at = ${dialect.now} WHERE id = ?`, (index + 1) * 10, spanById.get(fieldId), fieldId);
    }
    await recordConfigRevision(scopeKey, 'content', operator);
  });
  return await all(`SELECT * FROM stage_field_definition WHERE scope_key = ? AND section_id = ? AND deleted_at IS NULL AND field_key <> ? ORDER BY sort, id`, scopeKey, sectionId, scope.status_field);
}

export async function saveFieldDefinition(scopeKey, body, operator) {
  const scope = await getStageScope(scopeKey);
  const statuses = await listStageStatuses(scopeKey);
  const id = Number(body.id || 0);
  const exists = id ? await get('SELECT * FROM stage_field_definition WHERE id = ? AND scope_key = ?', id, scopeKey) : null;
  if (id && !exists) throw notFound('输入项不存在');
  const fieldKind = exists?.field_kind || String(body.field_kind || 'extension');
  if (!FIELD_KINDS.has(fieldKind)) throw badRequest('输入项类型非法');
  if (fieldKind !== 'extension' && !exists) throw badRequest('仅允许新增扩展字段');
  // 不接收客户端传入的扩展字段编码，避免名称、编码和仪表盘历史配置之间产生人为耦合。
  const fieldKey = exists?.field_key || nextExtensionFieldKey();
  // 内置字段/组件的结构由代码适配器维护；扩展字段在尚无值时允许调整类型和数据源。
  const inputType = exists && fieldKind !== 'extension'
    ? exists.input_type : String(body.input_type || exists?.input_type || 'text');
  const sourceKey = exists && fieldKind !== 'extension'
    ? (exists.source_key || '') : String(body.source_key ?? exists?.source_key ?? '');
  if (!INPUT_TYPES.has(inputType)) throw badRequest('字段类型非法');
  await assertSourceKey(sourceKey);
  if (fieldKind === 'extension' && inputType === 'component') throw badRequest('扩展字段不支持业务组件类型');
  if (fieldKind === 'extension' && inputType === 'select' && !sourceKey) throw badRequest('模糊下拉字段必须选择数据源');
  if (inputType === 'person' && sourceKey !== 'person') throw badRequest('人员选择字段必须使用人员数据源');
  if (inputType === 'release_point' && sourceKey !== 'release_point') throw badRequest('投产点选择字段必须使用投产点数据源');
  if (sourceKey && !['select', 'person', 'release_point'].includes(inputType)) throw badRequest('该数据源不适用于当前字段类型');
  if (fieldKind === 'extension' && inputType === 'select' && ['person', 'release_point'].includes(sourceKey)) throw badRequest('请选择与字段类型匹配的数据源');
  const label = String(body.label || '').trim();
  if (!label) throw badRequest('输入项名称不能为空');
  const sectionId = body.section_id ? Number(body.section_id) : null;
  if (sectionId && !await get('SELECT id FROM stage_section WHERE id = ? AND scope_key = ? AND deleted_at IS NULL', sectionId, scopeKey)) throw badRequest('所属分区不存在');
  const multiple = asBool(body.multiple) ? 1 : 0;
  if (exists && (exists.input_type !== inputType || (exists.source_key || '') !== sourceKey || Number(exists.multiple) !== multiple)) {
    const used = await get('SELECT COUNT(*) AS c FROM stage_field_value WHERE field_definition_id = ?', id);
    if (used?.c) throw badRequest('已有填写数据的字段不可修改类型、数据源或单多选模式');
  }
  // 新增扩展字段的默认值与配置界面保持一致：只进入详情页，避免未确认口径的数据直接进入列表、筛选和仪表盘。
  const visible = !exists && body.visible === undefined ? 1 : (asBool(body.visible) ? 1 : 0);
  // 业务组件是结构化交互或聚合区域，没有可安全映射的一行值；仅详情显示能力适用。
  const supportsListCapabilities = inputType !== 'component';
  const presentationData = [sectionId, Number(body.column_span) === 24 ? 24 : 12, visible,
    supportsListCapabilities && asBool(body.list_visible) ? 1 : 0,
    supportsListCapabilities && asBool(body.filterable) ? 1 : 0,
    supportsListCapabilities && asBool(body.dashboard_dimension) ? 1 : 0, Number(body.sort || 0)];
  let fieldId = id;
  if (exists) {
    await run(`UPDATE stage_field_definition SET label=?, section_id=?, column_span=?, visible=?, list_visible=?, filterable=?, dashboard_dimension=?, sort=?, updated_at=${dialect.now} WHERE id=?`, label, ...presentationData, id);
  } else {
    const res = await run(`INSERT INTO stage_field_definition (scope_key, field_key, label, field_kind, input_type, source_key, multiple, section_id, column_span, visible, list_visible, filterable, dashboard_dimension, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, scopeKey, fieldKey, label, fieldKind, inputType, sourceKey || null, multiple, ...presentationData);
    fieldId = res.lastInsertRowid;
  }
  await replaceRules('stage_field_status_rule', 'field_definition_id', fieldId, body.rules, statuses);
  await recordConfigRevision(scopeKey, 'content', operator);
  return await get('SELECT * FROM stage_field_definition WHERE id = ?', fieldId);
}

export async function deleteFieldDefinition(scopeKey, id, operator) {
  const row = await get('SELECT * FROM stage_field_definition WHERE id = ? AND scope_key = ?', id, scopeKey);
  if (!row) throw notFound('输入项不存在');
  if (row.is_builtin || row.field_kind !== 'extension') throw badRequest('内置字段和业务组件不可删除');
  await run(`UPDATE stage_field_definition SET deleted_at=${dialect.now} WHERE id=?`, id);
  await recordConfigRevision(scopeKey, 'content', operator);
}

export async function saveDeliverableDefinition(scopeKey, body, operator) {
  await getStageScope(scopeKey);
  const statuses = await listStageStatuses(scopeKey);
  const id = Number(body.id || 0);
  const exists = id ? await get('SELECT * FROM deliverable_definition WHERE id = ? AND scope_key = ?', id, scopeKey) : null;
  if (id && !exists) throw notFound('交付件不存在');
  const key = exists?.deliverable_key || nextDeliverableKey();
  const label = String(body.label || '').trim();
  const inputMode = String(body.input_mode || 'both');
  if (!label) throw badRequest('交付件名称不能为空');
  if (!INPUT_MODES.has(inputMode)) throw badRequest('提交方式非法');
  let deliverableId = id;
  if (exists) {
    await run(`UPDATE deliverable_definition SET label=?, input_mode=?, visible=?, sort=?, updated_at=${dialect.now} WHERE id=?`, label, inputMode, asBool(body.visible) ? 1 : 0, Number(body.sort || 0), id);
  } else {
    const res = await run('INSERT INTO deliverable_definition (scope_key, deliverable_key, label, input_mode, visible, sort) VALUES (?,?,?,?,?,?)', scopeKey, key, label, inputMode, asBool(body.visible) ? 1 : 0, Number(body.sort || 0));
    deliverableId = res.lastInsertRowid;
  }
  await replaceRules('deliverable_status_rule', 'deliverable_definition_id', deliverableId, body.rules, statuses);
  await recordConfigRevision(scopeKey, 'deliverable', operator);
  return await get('SELECT * FROM deliverable_definition WHERE id = ?', deliverableId);
}

export async function deleteDeliverableDefinition(scopeKey, id, operator) {
  const row = await get('SELECT * FROM deliverable_definition WHERE id = ? AND scope_key = ?', id, scopeKey);
  if (!row) throw notFound('交付件不存在');
  await run(`UPDATE deliverable_definition SET deleted_at=${dialect.now} WHERE id=?`, id);
  await recordConfigRevision(scopeKey, 'deliverable', operator);
}

/** 动态字段值读取；多选字段按 ordinal 还原为数组。 */
export async function getExtensionValues(scopeKey, entityId) {
  const scope = await getStageScope(scopeKey);
  const fields = await all("SELECT * FROM stage_field_definition WHERE scope_key = ? AND field_kind = 'extension' AND deleted_at IS NULL ORDER BY sort, id", scopeKey);
  if (!fields.length) return {};
  const rows = await all(`SELECT v.* FROM stage_field_value v WHERE v.entity_type = ? AND v.entity_id = ? AND v.field_definition_id IN (${fields.map(() => '?').join(',')}) ORDER BY v.field_definition_id, v.ordinal`, scope.entity_type, entityId, ...fields.map((field) => field.id));
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.field_definition_id)) byId.set(row.field_definition_id, []);
    byId.get(row.field_definition_id).push(row);
  }
  const out = {};
  for (const field of fields) {
    const values = byId.get(field.id) || [];
    const mapped = values.map((value) => value.value_ref_id ?? value.value_code ?? value.value_date ?? value.value_text ?? '');
    out[field.field_key] = field.multiple ? mapped : (mapped[0] ?? null);
  }
  return out;
}

/** 列表页元数据和当前页展示值共用，避免每个业务模块重复拼扩展字段 SQL。 */
export async function listStageListFields(scopeKey) {
  await getStageScope(scopeKey);
  return await all(`SELECT id, field_key, label, input_type, source_key, multiple, list_visible, filterable, sort
    FROM stage_field_definition
    WHERE scope_key = ? AND field_kind = 'extension'
      AND (list_visible = 1 OR filterable = 1) AND deleted_at IS NULL
    ORDER BY sort, id`, scopeKey);
}

/** 为已分页的行补充扩展字段显示快照，不改变原主表结构。 */
export async function appendStageListValues(scopeKey, rows) {
  if (!rows?.length) return rows || [];
  const scope = await getStageScope(scopeKey);
  const fields = await listStageListFields(scopeKey);
  if (!fields.length) return rows;
  const ids = rows.map((row) => Number(row.id)).filter(Boolean);
  if (!ids.length) return rows;
  const values = await all(`SELECT field_definition_id, entity_id, ordinal, value_text, value_date, value_code, value_ref_id, value_label_snapshot
    FROM stage_field_value
    WHERE entity_type = ? AND entity_id IN (${ids.map(() => '?').join(',')})
      AND field_definition_id IN (${fields.map(() => '?').join(',')})
    ORDER BY entity_id, field_definition_id, ordinal`, scope.entity_type, ...ids, ...fields.map((field) => field.id));
  const byId = new Map(fields.map((field) => [field.id, field]));
  const byEntity = new Map();
  for (const value of values) {
    const field = byId.get(value.field_definition_id);
    if (!field) continue;
    if (!byEntity.has(value.entity_id)) byEntity.set(value.entity_id, {});
    const target = byEntity.get(value.entity_id);
    (target[field.field_key] ||= []).push(value.value_label_snapshot ?? value.value_code ?? value.value_date ?? value.value_text ?? String(value.value_ref_id ?? ''));
  }
  return rows.map((row) => ({ ...row, _stage_fields: byEntity.get(row.id) || {} }));
}

/**
 * Excel 的扩展列使用稳定前缀，既避免与业务主表字段重名，也允许管理员修改展示名称。
 * 仅导入、导出当前可见的扩展字段，隐藏字段不会意外被批量覆盖。
 */
function extensionExcelKey(fieldKey) {
  return `extension__${fieldKey}`;
}

async function listExcelExtensionFields(scopeKey) {
  await getStageScope(scopeKey);
  return await all(`SELECT id, field_key, label, multiple
    FROM stage_field_definition
    WHERE scope_key = ? AND field_kind = 'extension' AND visible = 1 AND deleted_at IS NULL
    ORDER BY sort, id`, scopeKey);
}

/** 为既有业务 Excel 模板/导出文件追加扩展字段列。 */
export async function getStageExcelColumns(scopeKey) {
  const fields = await listExcelExtensionFields(scopeKey);
  return fields.map((field) => ({
    key: extensionExcelKey(field.field_key),
    title: `扩展字段：${field.label}`,
  }));
}

/**
 * 从业务模块原有导入行中抽取扩展值。多选仍以英文逗号分隔，和现有导入约定一致。
 * 当上传的是旧模板时不会出现这些列，返回空对象，从而保持向后兼容。
 */
export async function extensionValuesFromExcelRow(scopeKey, row) {
  const fields = await listExcelExtensionFields(scopeKey);
  const values = {};
  for (const field of fields) {
    const key = extensionExcelKey(field.field_key);
    if (!Object.hasOwn(row || {}, key)) continue;
    const raw = row[key];
    values[field.field_key] = field.multiple
      ? String(raw || '').split(',').map((item) => item.trim()).filter(Boolean)
      : raw;
  }
  return values;
}

/**
 * 在业务模块原有导出行中追加扩展字段展示快照，避免每个模块重复查询值表。
 */
export async function appendStageExcelValues(scopeKey, rows) {
  if (!rows?.length) return rows || [];
  const scope = await getStageScope(scopeKey);
  const fields = await listExcelExtensionFields(scopeKey);
  if (!fields.length) return rows;
  const ids = rows.map((row) => Number(row.id)).filter(Boolean);
  if (!ids.length) return rows;
  const values = await all(`SELECT field_definition_id, entity_id, ordinal, value_text, value_date, value_code, value_ref_id, value_label_snapshot
    FROM stage_field_value
    WHERE entity_type = ? AND entity_id IN (${ids.map(() => '?').join(',')})
      AND field_definition_id IN (${fields.map(() => '?').join(',')})
    ORDER BY entity_id, field_definition_id, ordinal`, scope.entity_type, ...ids, ...fields.map((field) => field.id));
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const valuesByEntity = new Map();
  for (const value of values) {
    const field = fieldById.get(value.field_definition_id);
    if (!field) continue;
    if (!valuesByEntity.has(value.entity_id)) valuesByEntity.set(value.entity_id, {});
    const entityValues = valuesByEntity.get(value.entity_id);
    (entityValues[field.field_key] ||= []).push(value.value_label_snapshot ?? value.value_code ?? value.value_date ?? value.value_text ?? String(value.value_ref_id ?? ''));
  }
  return rows.map((row) => {
    const entityValues = valuesByEntity.get(row.id) || {};
    const extensionValues = Object.fromEntries(fields.map((field) => [
      extensionExcelKey(field.field_key), (entityValues[field.field_key] || []).join(','),
    ]));
    return { ...row, ...extensionValues };
  });
}

async function resolveValue(field, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (field.input_type === 'date' || field.input_type === 'datetime') return { value_date: String(raw), value_label_snapshot: String(raw) };
  if (field.input_type === 'text' || field.input_type === 'textarea') return { value_text: String(raw).trim(), value_label_snapshot: String(raw).trim() };
  if (field.source_key === 'person') {
    const rawText = String(raw).trim();
    const personName = rawText.replace(/\([^)]*\)$/, '').trim();
    const personPhone = rawText.match(/\(([^)]*)\)$/)?.[1]?.trim();
    const row = /^\d+$/.test(rawText)
      ? await get('SELECT id, name, phone FROM user WHERE id = ?', Number(rawText))
      : (personPhone
        ? await get('SELECT id, name, phone FROM user WHERE name = ? AND phone = ? LIMIT 1', personName, personPhone)
        : await get('SELECT id, name, phone FROM user WHERE name = ? OR phone = ? LIMIT 1', personName, rawText));
    if (!row) throw badRequest(`${field.label}中的人员不存在`);
    return { value_ref_id: row.id, value_label_snapshot: `${row.name}(${row.phone})` };
  }
  if (field.source_key === 'release_point') {
    const rawText = String(raw).trim();
    const releaseDate = rawText.split(/[ /]/)[0];
    const row = /^\d+$/.test(rawText)
      ? await get('SELECT id, release_date, version_type FROM release_point WHERE id = ?', Number(rawText))
      : await get('SELECT id, release_date, version_type FROM release_point WHERE release_date = ? LIMIT 1', releaseDate);
    if (!row) throw badRequest(`${field.label}中的投产点不存在`);
    return { value_ref_id: row.id, value_label_snapshot: `${row.release_date}${row.version_type ? ` / ${row.version_type}` : ''}` };
  }
  if (field.source_key === 'system') {
    const rawText = String(raw).trim();
    // 导出快照为“系统编码 系统名称”，导入时兼容编码、名称和该快照格式。
    const systemCode = rawText.split(/\s+/)[0];
    const row = await get('SELECT sys_code, sys_name FROM system WHERE sys_code = ? OR sys_code = ? OR sys_name = ? LIMIT 1', rawText, systemCode, rawText);
    if (!row) throw badRequest(`${field.label}中的系统不存在`);
    return { value_code: row.sys_code, value_label_snapshot: `${row.sys_code} ${row.sys_name}` };
  }
  if (field.source_key?.startsWith('dict:')) {
    const category = field.source_key.slice(5);
    const row = await get('SELECT attr_value, display_value FROM dict_item WHERE category = ? AND (attr_value = ? OR display_value = ?) LIMIT 1', category, String(raw), String(raw));
    if (!row) throw badRequest(`${field.label}中的选项不存在`);
    return { value_code: row.attr_value, value_label_snapshot: row.display_value || row.attr_value };
  }
  return { value_text: String(raw), value_label_snapshot: String(raw) };
}

export async function saveExtensionValues(scopeKey, entityId, values, operator) {
  const scope = await getStageScope(scopeKey);
  const fields = await all("SELECT * FROM stage_field_definition WHERE scope_key = ? AND field_kind = 'extension' AND deleted_at IS NULL", scopeKey);
  const byKey = new Map(fields.map((field) => [field.field_key, field]));
  await tx(async () => {
    for (const [key, raw] of Object.entries(values || {})) {
      const field = byKey.get(key);
      if (!field) continue;
      const rawValues = field.multiple ? (Array.isArray(raw) ? raw : String(raw || '').split(',').map((x) => x.trim()).filter(Boolean)) : [raw];
      await run('DELETE FROM stage_field_value WHERE field_definition_id = ? AND entity_type = ? AND entity_id = ?', field.id, scope.entity_type, entityId);
      let ordinal = 0;
      for (const value of rawValues) {
        const resolved = await resolveValue(field, value);
        if (!resolved) continue;
        await run(`INSERT INTO stage_field_value (field_definition_id, entity_type, entity_id, ordinal, value_text, value_date, value_code, value_ref_id, value_label_snapshot) VALUES (?,?,?,?,?,?,?,?,?)`, field.id, scope.entity_type, entityId, ordinal++, resolved.value_text || null, resolved.value_date || null, resolved.value_code || null, resolved.value_ref_id || null, resolved.value_label_snapshot || null);
      }
    }
  });
  return await getExtensionValues(scopeKey, entityId);
}

function emptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '' || value === '[]';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

async function statusIdForRow(scope, row) {
  const value = row?.[scope.status_field];
  if (!value) return null;
  const statuses = await listStageStatuses(scope.scope_key);
  return statuses.find((status) => status.value === value)?.id || null;
}

async function componentMissing(componentKey, row) {
  const component = getBusinessComponent(componentKey);
  // 未注册组件不得被视为“已填写”，防止配置领先于代码时绕过可追溯校验。
  return component ? component.isMissing(row) : true;
}

/**
 * 校验当前参数状态下启用的阶段内容。旧业务字段、扩展字段、复杂组件和交付件共用此入口。
 * 新建记录尚无 id 时不会误判交付件/扩展值，后续保存或状态流转时会补齐校验。
 */
export async function validateStageContent(scopeKey, row) {
  const scope = await getStageScope(scopeKey);
  const statusId = await statusIdForRow(scope, row);
  if (!statusId) return;
  const config = await getStageContentConfig(scopeKey);
  const missing = [];
  const extensionValues = row?.id ? await getExtensionValues(scopeKey, row.id) : {};
  for (const field of config.fields) {
    if (!field.visible || !field.rules?.[statusId]) continue;
    if (field.field_kind === 'component') {
      if (await componentMissing(field.component_key, row)) missing.push(field.label);
      continue;
    }
    const value = field.field_kind === 'extension' ? extensionValues[field.field_key] : row?.[field.native_column];
    if (emptyValue(value)) missing.push(field.label);
  }
  if (row?.id) {
    for (const deliverable of config.deliverables) {
      if (!deliverable.visible || !deliverable.rules?.[statusId]) continue;
      const modeSql = deliverable.input_mode === 'both' ? '' : ' AND a.kind = ?';
      // 内置交付件兼容既有附件的 field_key；新增公共交付件一律使用 deliverable_id。
      const identitySql = String(deliverable.deliverable_key).startsWith('builtin_')
        ? ' AND (a.deliverable_id = ? OR (a.deliverable_id IS NULL AND a.field_key = ?))'
        : ' AND a.deliverable_id = ?';
      const params = [scope.entity_type, row.id, deliverable.id];
      if (String(deliverable.deliverable_key).startsWith('builtin_')) params.push(deliverable.label);
      if (modeSql) params.push(deliverable.input_mode);
      const count = await get(`SELECT COUNT(*) AS c FROM attachment a WHERE a.entity_type = ? AND a.entity_id = ?${identitySql}${modeSql}`, ...params);
      if (!count?.c) missing.push(`${deliverable.label}（交付件）`);
    }
  }
  if (missing.length) throw badRequest(`${scope.label}当前状态必填：${missing.join('、')}`);
}

/** 根据实体与任务类型解析交付件范围，供公共附件接口统一校验。 */
export async function scopeForEntity(entityType, entityId) {
  if (entityType === 'test') {
    const row = await get('SELECT test_type FROM test_task WHERE id = ?', entityId);
    return row ? await getStageScope(`test.${row.test_type}`) : null;
  }
  const row = await get('SELECT * FROM stage_scope WHERE entity_type = ? AND enabled = 1 LIMIT 1', entityType);
  return row || null;
}

export async function assertDeliverableInputAllowed({ entityType, entityId, deliverableId, kind }) {
  const scope = await scopeForEntity(entityType, entityId);
  if (!scope || !deliverableId) throw badRequest('交付件信息缺失');
  const deliverable = await get('SELECT * FROM deliverable_definition WHERE id = ? AND scope_key = ? AND deleted_at IS NULL', deliverableId, scope.scope_key);
  if (!deliverable) throw badRequest('交付件不存在或不属于当前阶段');
  if (deliverable.input_mode === 'file' && kind !== 'file') throw badRequest(`${deliverable.label}仅允许上传文件`);
  if (deliverable.input_mode === 'path' && kind !== 'path') throw badRequest(`${deliverable.label}仅允许填写路径`);
  return deliverable;
}

/** 删除凭证前校验：不能使当前状态下的必填交付件失去最后一份有效凭证。 */
export async function assertDeliverableRemovable(attachment) {
  const scope = await scopeForEntity(attachment.entity_type, attachment.entity_id);
  if (!scope) return;
  let deliverableId = attachment.deliverable_id;
  if (!deliverableId && attachment.field_key) {
    const legacy = await get(`SELECT id FROM deliverable_definition
      WHERE scope_key = ? AND deliverable_key LIKE 'builtin_%' AND label = ? AND deleted_at IS NULL`, scope.scope_key, attachment.field_key);
    deliverableId = legacy?.id;
  }
  if (!deliverableId) return;
  const row = await get(`SELECT * FROM ${scope.table_name} WHERE id = ?`, attachment.entity_id);
  if (!row) return;
  const statusId = await statusIdForRow(scope, row);
  const rule = statusId ? await get('SELECT required FROM deliverable_status_rule WHERE deliverable_definition_id = ? AND status_dict_item_id = ?', deliverableId, statusId) : null;
  if (!rule?.required) return;
  const deliverable = await get('SELECT deliverable_key, label FROM deliverable_definition WHERE id = ?', deliverableId);
  const legacySql = String(deliverable?.deliverable_key || '').startsWith('builtin_') ? ' OR (deliverable_id IS NULL AND field_key = ?)' : '';
  const params = [attachment.entity_type, attachment.entity_id, deliverableId];
  if (legacySql) params.push(deliverable.label);
  params.push(attachment.id);
  const remaining = await get(`SELECT COUNT(*) AS c FROM attachment WHERE entity_type = ? AND entity_id = ? AND (deliverable_id = ?${legacySql}) AND id <> ?`, ...params);
  if (!remaining?.c) throw badRequest('当前状态下该交付件为必填，不能删除最后一份有效凭证');
}

/** 保存默认范围、分区、内置字段及已有交付件定义。仅在全新库首次种子化时插入。 */
export async function seedStageContentDefaults({ builtinMetadata = {}, sectionDefaults = {}, snapshot = null } = {}) {
  if (snapshot) {
    await seedStageContentSnapshot(snapshot);
    return;
  }
  for (const [scopeKey, label, entityType, tableName, statusCategory, statusStage, statusField, permissionModule] of STAGE_SCOPE_DEFAULTS) {
    if (!await get('SELECT scope_key FROM stage_scope WHERE scope_key = ?', scopeKey)) {
      await run('INSERT INTO stage_scope (scope_key, label, entity_type, table_name, status_category, status_stage, status_field, permission_module) VALUES (?,?,?,?,?,?,?,?)', scopeKey, label, entityType, tableName, statusCategory, statusStage, statusField, permissionModule);
    }
    const root = baseScope(scopeKey);
    const sectionIds = new Map();
    for (const [index, definition] of builtinSections(sectionDefaults, scopeKey).entries()) {
      const sectionKey = definition.key;
      let section = await get('SELECT id FROM stage_section WHERE scope_key = ? AND section_key = ?', scopeKey, sectionKey);
      if (!section) {
        const res = await run('INSERT INTO stage_section (scope_key, section_key, title, sort, collapsed, is_builtin, layout_mode, show_title) VALUES (?,?,?,?,?,1,?,?)', scopeKey, sectionKey, definition.title, index * 10, definition.collapsed ? 1 : 0, definition.layout || 'left', definition.show_title === false ? 0 : 1);
        section = { id: res.lastInsertRowid };
      }
      sectionIds.set(sectionKey, section.id);
    }
    const statuses = await listStageStatuses(scopeKey);
    const fields = NATIVE_FIELD_DEFAULTS[root] || [];
    for (const [index, [fieldKey, fieldLabel, inputType, sourceKey = '', multiple = 0, componentKey = null]] of fields.entries()) {
      if (root !== 'test' && fieldKey === 'coverage_analysis') continue;
      if (root === 'test' && fieldKey === 'coverage_analysis' && scopeKey !== 'test.SIT') continue;
      if (!await get('SELECT id FROM stage_field_definition WHERE scope_key = ? AND field_key = ?', scopeKey, fieldKey)) {
        const isComponent = inputType === 'component';
        const metadata = nativeFieldMetadata(builtinMetadata, scopeKey, fieldKey);
        // 字段所属分区与页面布局共同维护在 seed 中；未知内置字段保守落到首个分区。
        const sectionKey = metadata.section || builtinSections(sectionDefaults, scopeKey)[0]?.key || null;
        const res = await run(`INSERT INTO stage_field_definition (scope_key, field_key, label, field_kind, input_type, source_key, multiple, native_column, component_key, section_id, column_span, visible, list_visible, filterable, dashboard_dimension, sort, is_builtin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, scopeKey, fieldKey, fieldLabel, isComponent ? 'component' : 'native', inputType, sourceKey || null, multiple ? 1 : 0, isComponent ? null : fieldKey, componentKey, sectionIds.get(sectionKey) || null, isComponent || inputType === 'textarea' || multiple ? 24 : 12, 1, metadata.list || 0, metadata.filter || 0, metadata.dashboard || 0, index * 10);
        await replaceRules('stage_field_status_rule', 'field_definition_id', res.lastInsertRowid, nativeRequiredRules(statuses, metadata.required_from), statuses);
      }
    }
    for (const [index, labelText] of (DELIVERABLE_DEFAULTS[root] || []).entries()) {
      const deliverableKey = `builtin_${index + 1}`;
      const metadata = { ...(DELIVERABLE_DEFAULT_METADATA[root]?.[labelText] || {}), ...(DELIVERABLE_DEFAULT_METADATA[scopeKey]?.[labelText] || {}) };
      let deliverable = await get('SELECT id FROM deliverable_definition WHERE scope_key = ? AND deliverable_key = ?', scopeKey, deliverableKey);
      if (!deliverable) {
        const res = await run('INSERT INTO deliverable_definition (scope_key, deliverable_key, label, input_mode, visible, sort, layout_mode) VALUES (?,?,?,?,?,?,?)', scopeKey, deliverableKey, labelText, 'both', 1, index * 10, metadata.layout || 'left');
        deliverable = { id: res.lastInsertRowid };
        await replaceRules('deliverable_status_rule', 'deliverable_definition_id', deliverable.id, nativeRequiredRules(statuses, metadata.required_from), statuses);
      }
      const handlerKey = CUSTOM_DELIVERABLE_TEMPLATE_HANDLERS[root]?.[labelText];
      if (handlerKey && !await get(`SELECT id FROM deliverable_template_version
        WHERE deliverable_definition_id = ? AND template_mode = ? AND handler_key = ? AND enabled = 1 AND deleted_at IS NULL`, deliverable.id, 'custom', handlerKey)) {
        // 版本号 0 是内置动态模板的回退位：不会覆盖既有管理员上传模板（其版本从 1 开始）。
        await run(`INSERT INTO deliverable_template_version (deliverable_definition_id, template_mode, handler_key, version_no, enabled)
          VALUES (?,?,?,?,1)`, deliverable.id, 'custom', handlerKey, 0);
      }
    }
  }
  await synchronizeBuiltinFieldMetadata(builtinMetadata);
  await synchronizeBuiltinLayout(sectionDefaults, builtinMetadata);
  await synchronizeDeliverableSectionPresentation();
  await reconcileLegacyReleaseApplyDeliverable();
}

/**
 * 为已运行环境补齐目录中新出现的默认定义。该入口不调用全量种子校准：
 * 已存在（包括软删除）的分区、字段、交付件、规则和模板均视为管理员意图，绝不覆盖。
 */
export async function applyBuiltinConfigurationUpgrades({ builtinMetadata = {}, sectionDefaults = {}, snapshot = null } = {}) {
  const upgrade = await tx(async () => {
    const applied = await get('SELECT upgrade_id FROM configuration_upgrade_ledger WHERE upgrade_id = ?', BUILTIN_CONFIGURATION_UPGRADE_ID);
    if (applied) return { applied: false, upgrade_id: BUILTIN_CONFIGURATION_UPGRADE_ID, added: [] };

    const added = [];
    if (snapshot) {
      await seedStageContentSnapshot(snapshot, added);
      await run('INSERT INTO configuration_upgrade_ledger (upgrade_id, details) VALUES (?,?)', BUILTIN_CONFIGURATION_UPGRADE_ID, JSON.stringify({ added }));
      return { applied: true, upgrade_id: BUILTIN_CONFIGURATION_UPGRADE_ID, added };
    }
    for (const [scopeKey, label, entityType, tableName, statusCategory, statusStage, statusField, permissionModule] of STAGE_SCOPE_DEFAULTS) {
      if (!await get('SELECT scope_key FROM stage_scope WHERE scope_key = ?', scopeKey)) {
        await run('INSERT INTO stage_scope (scope_key, label, entity_type, table_name, status_category, status_stage, status_field, permission_module) VALUES (?,?,?,?,?,?,?,?)', scopeKey, label, entityType, tableName, statusCategory, statusStage, statusField, permissionModule);
        added.push(`scope:${scopeKey}`);
      }
      const sectionIds = new Map();
      for (const [index, definition] of builtinSections(sectionDefaults, scopeKey).entries()) {
        let section = await get('SELECT id, deleted_at FROM stage_section WHERE scope_key = ? AND section_key = ?', scopeKey, definition.key);
        if (!section) {
          const res = await run('INSERT INTO stage_section (scope_key, section_key, title, sort, collapsed, is_builtin, layout_mode, show_title) VALUES (?,?,?,?,?,1,?,?)', scopeKey, definition.key, definition.title, index * 10, definition.collapsed ? 1 : 0, definition.layout || 'left', definition.show_title === false ? 0 : 1);
          section = { id: res.lastInsertRowid };
          added.push(`section:${scopeKey}.${definition.key}`);
        }
        // 已软删除分区不可被升级重新启用，也不应成为新增字段的挂载位置。
        if (!section.deleted_at) sectionIds.set(definition.key, section.id);
      }
      const statuses = await listStageStatuses(scopeKey);
      const root = baseScope(scopeKey);
      for (const [index, [fieldKey, fieldLabel, inputType, sourceKey = '', multiple = 0, componentKey = null]] of (NATIVE_FIELD_DEFAULTS[root] || []).entries()) {
        if ((root !== 'test' && fieldKey === 'coverage_analysis') || (root === 'test' && fieldKey === 'coverage_analysis' && scopeKey !== 'test.SIT')) continue;
        // 不过滤 deleted_at：管理员删除某项后，升级必须保留该意图。
        if (await get('SELECT id FROM stage_field_definition WHERE scope_key = ? AND field_key = ?', scopeKey, fieldKey)) continue;
        const metadata = nativeFieldMetadata(builtinMetadata, scopeKey, fieldKey);
        const sectionKey = metadata.section || builtinSections(sectionDefaults, scopeKey)[0]?.key || null;
        const isComponent = inputType === 'component';
        const res = await run(`INSERT INTO stage_field_definition (scope_key, field_key, label, field_kind, input_type, source_key, multiple, native_column, component_key, section_id, column_span, visible, list_visible, filterable, dashboard_dimension, sort, is_builtin) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, scopeKey, fieldKey, fieldLabel, isComponent ? 'component' : 'native', inputType, sourceKey || null, multiple ? 1 : 0, isComponent ? null : fieldKey, componentKey, sectionIds.get(sectionKey) || null, isComponent || inputType === 'textarea' || multiple ? 24 : 12, 1, metadata.list || 0, metadata.filter || 0, metadata.dashboard || 0, index * 10);
        await replaceRules('stage_field_status_rule', 'field_definition_id', res.lastInsertRowid, nativeRequiredRules(statuses, metadata.required_from), statuses);
        added.push(`field:${scopeKey}.${fieldKey}`);
      }
      for (const [index, labelText] of (DELIVERABLE_DEFAULTS[root] || []).entries()) {
        const deliverableKey = `builtin_${index + 1}`;
        // 同样不按 deleted_at 查询，避免复活已被管理员移除的交付件。
        if (await get('SELECT id FROM deliverable_definition WHERE scope_key = ? AND deliverable_key = ?', scopeKey, deliverableKey)) continue;
        const metadata = { ...(DELIVERABLE_DEFAULT_METADATA[root]?.[labelText] || {}), ...(DELIVERABLE_DEFAULT_METADATA[scopeKey]?.[labelText] || {}) };
        const res = await run('INSERT INTO deliverable_definition (scope_key, deliverable_key, label, input_mode, visible, sort, layout_mode) VALUES (?,?,?,?,?,?,?)', scopeKey, deliverableKey, labelText, 'both', 1, index * 10, metadata.layout || 'left');
        await replaceRules('deliverable_status_rule', 'deliverable_definition_id', res.lastInsertRowid, nativeRequiredRules(statuses, metadata.required_from), statuses);
        const handlerKey = CUSTOM_DELIVERABLE_TEMPLATE_HANDLERS[root]?.[labelText];
        if (handlerKey) await run('INSERT INTO deliverable_template_version (deliverable_definition_id, template_mode, handler_key, version_no, enabled) VALUES (?,?,?,?,1)', res.lastInsertRowid, 'custom', handlerKey, 0);
        added.push(`deliverable:${scopeKey}.${deliverableKey}`);
      }
    }
    await run('INSERT INTO configuration_upgrade_ledger (upgrade_id, details) VALUES (?,?)', BUILTIN_CONFIGURATION_UPGRADE_ID, JSON.stringify({ added }));
    return { applied: true, upgrade_id: BUILTIN_CONFIGURATION_UPGRADE_ID, added };
  });
  await synchronizeRegistrationInfoFields();
  return upgrade;
}

/**
 * 早期 Mock 会创建 release_apply/ferry_proof；新版将“摆渡证明”作为内置交付件。
 * 合并时迁移附件、模板和必填规则，避免配置列表出现两个同名交付件。
 */
async function reconcileLegacyReleaseApplyDeliverable() {
  const builtin = await get(`SELECT id FROM deliverable_definition
    WHERE scope_key = ? AND deliverable_key = ? AND deleted_at IS NULL`, 'release_apply', 'builtin_1');
  const legacy = await get(`SELECT id FROM deliverable_definition
    WHERE scope_key = ? AND deliverable_key = ? AND deleted_at IS NULL`, 'release_apply', 'ferry_proof');
  if (!builtin || !legacy || Number(builtin.id) === Number(legacy.id)) return;

  await run('UPDATE attachment SET deliverable_id = ? WHERE deliverable_id = ?', builtin.id, legacy.id);
  await run('UPDATE deliverable_template_version SET deliverable_definition_id = ? WHERE deliverable_definition_id = ?', builtin.id, legacy.id);
  const rules = await all('SELECT status_dict_item_id, required FROM deliverable_status_rule WHERE deliverable_definition_id = ?', legacy.id);
  for (const rule of rules) {
    const exists = await get('SELECT required FROM deliverable_status_rule WHERE deliverable_definition_id = ? AND status_dict_item_id = ?', builtin.id, rule.status_dict_item_id);
    if (exists) {
      await run(`UPDATE deliverable_status_rule SET required = ?, updated_at = ${dialect.now}
        WHERE deliverable_definition_id = ? AND status_dict_item_id = ?`,
      Number(exists.required || rule.required) ? 1 : 0, builtin.id, rule.status_dict_item_id);
    } else {
      await run('INSERT INTO deliverable_status_rule (deliverable_definition_id, status_dict_item_id, required) VALUES (?,?,?)', builtin.id, rule.status_dict_item_id, rule.required);
    }
  }
  await run('DELETE FROM deliverable_status_rule WHERE deliverable_definition_id = ?', legacy.id);
  await run(`UPDATE deliverable_definition SET deleted_at = ${dialect.now}, updated_at = ${dialect.now} WHERE id = ?`, legacy.id);
}

/**
 * 将已存在库中的内置字段校准到既有业务页面能力。只执行一次，后续管理员在配置页
 * 对内置字段做的显示、排序等调整不会在每次启动时被种子逻辑覆盖。
 */
async function synchronizeBuiltinFieldMetadata(builtinMetadata) {
  if (await get('SELECT value FROM app_config WHERE key = ?', BUILTIN_METADATA_VERSION_KEY)) return;
  for (const scopeKey of ['requirement', 'ticket']) {
    const statuses = await listStageStatuses(scopeKey);
    const fields = await all(`SELECT id, field_key FROM stage_field_definition
      WHERE scope_key = ? AND field_kind = 'native' AND is_builtin = 1 AND deleted_at IS NULL`, scopeKey);
    for (const field of fields) {
      if (!['implementation_org', 'receiver', 'workload', 'registrar', 'register_time'].includes(field.field_key)) continue;
      const metadata = nativeFieldMetadata(builtinMetadata, scopeKey, field.field_key);
      await run(`UPDATE stage_field_definition SET list_visible=?, filterable=?, dashboard_dimension=?, updated_at=${dialect.now} WHERE id=?`, metadata.list || 0, metadata.filter || 0, metadata.dashboard || 0, field.id);
      await replaceRules('stage_field_status_rule', 'field_definition_id', field.id, nativeRequiredRules(statuses, metadata.required_from), statuses);
    }
    // 仅将仍使用旧系统默认文案的字段更名，管理员自定义名称保持不变。
    await run(`UPDATE stage_field_definition SET label=?, updated_at=${dialect.now}
      WHERE scope_key=? AND field_key='issue_no' AND label='关联问题/工单编号'`, 'OA编号/工单编号', scopeKey);
    await run(`UPDATE stage_field_definition SET label=?, updated_at=${dialect.now}
      WHERE scope_key=? AND field_key='registrar' AND label='登记人'`, '录入人', scopeKey);
    await run(`UPDATE stage_field_definition SET label=?, updated_at=${dialect.now}
      WHERE scope_key=? AND field_key='register_time' AND label='登记时间'`, '录入时间', scopeKey);
  }
  await run('INSERT INTO app_config (key, value, remark) VALUES (?,?,?)', BUILTIN_METADATA_VERSION_KEY, '1', '分析字段默认展示、筛选与兼容文案校准版本');
}

/** 将录入人和录入时间收敛为一个只读展示项；底层两列仍保留用于审计与历史兼容。 */
async function synchronizeRegistrationInfoFields() {
  if (await get('SELECT value FROM app_config WHERE key = ?', REGISTRATION_INFO_VERSION_KEY)) return;
  await tx(async () => {
    if (await get('SELECT value FROM app_config WHERE key = ?', REGISTRATION_INFO_VERSION_KEY)) return;
    for (const scopeKey of ['requirement', 'ticket']) {
      await run(`UPDATE stage_field_definition SET label=?, updated_at=${dialect.now}
        WHERE scope_key=? AND field_key='registrar' AND field_kind='native' AND is_builtin=1 AND deleted_at IS NULL`, '录入人信息', scopeKey);
      await run(`UPDATE stage_field_definition SET deleted_at=${dialect.now}, updated_at=${dialect.now}
        WHERE scope_key=? AND field_key='register_time' AND field_kind='native' AND is_builtin=1 AND deleted_at IS NULL`, scopeKey);
    }
    await run('INSERT INTO app_config (key, value, remark) VALUES (?,?,?)', REGISTRATION_INFO_VERSION_KEY, '1', '需求和工单录入信息输入项合并版本');
  });
}

/**
 * 对开发期旧种子做一次分区校准：以当前详情页真实模块为准更新标题、左右/整行布局
 * 和内置字段归属。版本标识确保管理员后续调整不会被每次启动覆盖。
 */
async function synchronizeBuiltinLayout(sectionDefaults, builtinMetadata) {
  if (await get('SELECT value FROM app_config WHERE key = ?', BUILTIN_LAYOUT_VERSION_KEY)) return;
  for (const scopeKey of ['requirement', 'ticket']) {
    await run(`UPDATE stage_section SET title=?, updated_at=${dialect.now}
      WHERE scope_key=? AND section_key='systems' AND title='涉及系统'`, '实施机构及系统', scopeKey);
  }
  await run('INSERT INTO app_config (key, value, remark) VALUES (?,?,?)', BUILTIN_LAYOUT_VERSION_KEY, '1', '分析分区默认标题兼容校准版本');
}

/**
 * 交付件统一从“交付件”分区读取布局。开发期曾允许单项交付件保存布局，
 * 此处在所有可见交付件布局一致时平滑转写到分区，避免丢失已有管理员调整。
 */
async function synchronizeDeliverableSectionPresentation() {
  if (await get('SELECT value FROM app_config WHERE key = ?', DELIVERABLE_SECTION_PRESENTATION_VERSION_KEY)) return;
  for (const [scopeKey] of STAGE_SCOPE_DEFAULTS) {
    const section = await get("SELECT id, layout_mode FROM stage_section WHERE scope_key = ? AND section_key = 'deliverables' AND deleted_at IS NULL", scopeKey);
    if (!section) continue;
    const rows = await all('SELECT DISTINCT layout_mode FROM deliverable_definition WHERE scope_key = ? AND deleted_at IS NULL AND visible = 1 AND layout_mode IS NOT NULL', scopeKey);
    const layouts = rows.map((row) => row.layout_mode).filter((layout) => SECTION_LAYOUT_MODES.has(layout));
    const layout = layouts.length === 1 ? layouts[0] : section.layout_mode;
    await run(`UPDATE stage_section SET layout_mode=?, show_title=0, updated_at=${dialect.now} WHERE id=?`, layout || 'left', section.id);
  }
  await run('INSERT INTO app_config (key, value, remark) VALUES (?,?,?)', DELIVERABLE_SECTION_PRESENTATION_VERSION_KEY, '1', '交付件分区布局及标题展示校准版本');
}
