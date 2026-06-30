/**
 * 文件：lib/dict-cascade.js
 * 用途：系统配置项（字典属性值、系统编号）改名时的“存量数据同步”。业务表直接存储中文属性值
 *       （如流程状态/机构）或系统编号，而非稳定外键，故当配置项被改名时，必须把所有引用旧值的
 *       业务行级联更新为新值，否则历史数据会“悬空”（显示为已不存在的旧名/旧编号）。
 * 作者：hengguan
 * 说明：*_REFERENCES 集中登记“配置项 → 引用其值的业务表字段”。引用分三类：
 *       plain          ：普通文本列，整列等值替换；
 *       jsonKey        ：JSON 对象数组列，逐元素替换其 jsonKey 字段（如投产申请 delivery_units）；
 *       jsonArray:true ：JSON 字符串数组列，替换数组中等于旧值的元素（如需求的主责/协同系统）。
 *       级联在单事务内完成并写入 audit_log 留痕。
 */

import { all, run, tx } from '../db/index.js';
import { parseJsonArray } from './json.js';

/**
 * 字典分类 → 引用该字典 attr_value 的业务表字段清单。
 */
const DICT_REFERENCES = {
  // 流程状态（需求/开发/测试三段共用，attr_value 全局唯一，按文本等值替换安全）
  process_status: [
    { table: 'requirement', column: 'status' },
    { table: 'dev_task', column: 'status' },
    { table: 'test_task', column: 'status' },
  ],
  // 投产状态
  release_status: [
    { table: 'release_task', column: 'status' },
    { table: 'release_system', column: 'status' },
  ],
  // 评审状态
  review_status: [
    { table: 'release_task', column: 'review_status' },
    { table: 'release_apply', column: 'review_status' },
  ],
  // 需求类型
  req_type: [
    { table: 'requirement', column: 'req_type' },
  ],
  // 投产版本类型
  version_type: [
    { table: 'release_point', column: 'version_type' },
  ],
  // 机构（实施方/提出部门/变更负责部门等多处共用）
  org: [
    { table: 'system', column: 'org' },
    { table: 'user', column: 'org' },
    { table: 'requirement', column: 'propose_dept' },
    { table: 'dev_task', column: 'impl_org' },
    { table: 'test_task', column: 'impl_org' },
    { table: 'release_system', column: 'impl_org' },
    { table: 'release_apply', column: 'impl_org' },
    { table: 'release_apply', column: 'out_dept' },
    { table: 'release_apply', column: 'deploy_dept' },
  ],
  // 业务板块
  sector: [
    { table: 'system', column: 'sector' },
  ],
  // 制品类型（存于投产申请 delivery_units JSON 对象数组的每个元素）
  artifact_type: [
    { table: 'release_apply', column: 'delivery_units', jsonKey: 'artifact_type' },
  ],
  // 摆渡状态（同上，存于 delivery_units 元素）
  ferry_status: [
    { table: 'release_apply', column: 'delivery_units', jsonKey: 'ferry_status' },
  ],
};

/**
 * 系统编号（sys_code）→ 引用该编号的业务表字段清单。
 */
const SYSTEM_REFERENCES = [
  { table: 'requirement', column: 'main_systems', jsonArray: true },
  { table: 'requirement', column: 'collab_dev_systems', jsonArray: true },
  { table: 'requirement', column: 'collab_test_systems', jsonArray: true },
  { table: 'dev_task', column: 'impl_system' },
  { table: 'test_task', column: 'impl_system' },
  { table: 'release_system', column: 'system_code' },
  { table: 'release_apply', column: 'change_system' },
];

/** 替换某普通文本列中等于 oldVal 的值为 newVal，返回受影响行数。 */
async function cascadePlain(table, column, oldVal, newVal) {
  const res = await run(
    `UPDATE ${table} SET ${column} = ?, updated_at = datetime('now','localtime') WHERE ${column} = ?`,
    newVal, oldVal,
  );
  return res.changes || 0;
}

/** 替换某 JSON 对象数组列中各元素 jsonKey 字段等于 oldVal 的值为 newVal，返回受影响行数。 */
async function cascadeJsonKey(table, column, jsonKey, oldVal, newVal) {
  const rows = await all(`SELECT id, ${column} AS raw FROM ${table} WHERE ${column} LIKE ?`, `%${oldVal}%`);
  let affected = 0;
  for (const r of rows) {
    if (!r.raw) continue;
    const arr = parseJsonArray(r.raw);
    if (!Array.isArray(arr)) continue;
    let changed = false;
    for (const el of arr) {
      if (el && el[jsonKey] === oldVal) { el[jsonKey] = newVal; changed = true; }
    }
    if (changed) {
      await run(`UPDATE ${table} SET ${column} = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
        JSON.stringify(arr), r.id);
      affected++;
    }
  }
  return affected;
}

/** 替换某 JSON 字符串数组列中等于 oldVal 的元素为 newVal，返回受影响行数。 */
async function cascadeJsonArray(table, column, oldVal, newVal) {
  const rows = await all(`SELECT id, ${column} AS raw FROM ${table} WHERE ${column} LIKE ?`, `%${oldVal}%`);
  let affected = 0;
  for (const r of rows) {
    if (!r.raw) continue;
    const arr = parseJsonArray(r.raw);
    if (!Array.isArray(arr)) continue;
    let changed = false;
    const next = arr.map((v) => {
      if (v === oldVal) { changed = true; return newVal; }
      return v;
    });
    if (changed) {
      await run(`UPDATE ${table} SET ${column} = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
        JSON.stringify(next), r.id);
      affected++;
    }
  }
  return affected;
}

/** 按引用定义执行一处级联替换。 */
async function applyRef(ref, oldVal, newVal) {
  if (ref.jsonKey) return cascadeJsonKey(ref.table, ref.column, ref.jsonKey, oldVal, newVal);
  if (ref.jsonArray) return cascadeJsonArray(ref.table, ref.column, oldVal, newVal);
  return cascadePlain(ref.table, ref.column, oldVal, newVal);
}

/** 写一条级联同步留痕。 */
async function auditCascade(entityCode, ref, affected, oldVal, newVal, operator) {
  await run(
    `INSERT INTO audit_log
       (entity_type, entity_id, entity_code, action, operator, field, old_value, new_value)
     VALUES (?,?,?,?,?,?,?,?)`,
    'config', 0, entityCode, 'cascade', operator || null,
    `${ref.table}.${ref.column}（${affected} 条）`, oldVal, newVal,
  );
}

/** 在单事务内执行一组引用替换并留痕，返回各表受影响明细。 */
async function runCascade(refs, oldVal, newVal, entityCode, operator) {
  if (!refs || !refs.length || oldVal === newVal || oldVal == null || newVal == null) return [];
  const details = [];
  await tx(async () => {
    for (const ref of refs) {
      const affected = await applyRef(ref, oldVal, newVal);
      if (affected > 0) {
        details.push({ table: ref.table, column: ref.column, affected });
        await auditCascade(entityCode, ref, affected, oldVal, newVal, operator);
      }
    }
  });
  return details;
}

/**
 * 字典属性值改名时级联同步存量业务数据。
 * @param {string} category 字典分类
 * @param {string} oldVal   旧属性值
 * @param {string} newVal   新属性值
 * @param {string} [operator] 操作人（留痕用）
 * @returns {{table:string, column:string, affected:number}[]}
 */
export async function cascadeDictRename(category, oldVal, newVal, operator) {
  return runCascade(DICT_REFERENCES[category], oldVal, newVal, category, operator);
}

/**
 * 系统编号改名时级联同步存量业务数据。
 * @param {string} oldCode 旧系统编号
 * @param {string} newCode 新系统编号
 * @param {string} [operator] 操作人（留痕用）
 * @returns {{table:string, column:string, affected:number}[]}
 */
export async function cascadeSystemRename(oldCode, newCode, operator) {
  return runCascade(SYSTEM_REFERENCES, oldCode, newCode, oldCode, operator);
}
