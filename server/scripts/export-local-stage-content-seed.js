/**
 * 文件：server/scripts/export-local-stage-content-seed.js
 * 说明：从当前本地 SQLite 的有效系统设置导出稳定的阶段内容初始化快照。
 * 用途：管理员确认输入项、分区或交付件配置后，机械更新新库与 Mock 共用的默认 Seed。
 * 作者：hengguan
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, closeDb } from '../src/platform/persistence/engine/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '../src/modules/settings/process-configuration/application/local-stage-content-seed.js');

function rulesById(rows) {
  const values = new Map();
  for (const row of rows) {
    if (!values.has(row.definition_id)) values.set(row.definition_id, {});
    values.get(row.definition_id)[row.status_value] = Number(row.required) ? 1 : 0;
  }
  return values;
}

async function exportSnapshot() {
  const scopes = await all('SELECT scope_key FROM stage_scope ORDER BY scope_key');
  const sections = await all(`SELECT id, scope_key, section_key, title, sort, collapsed, is_builtin, layout_mode, show_title
    FROM stage_section WHERE deleted_at IS NULL ORDER BY scope_key, sort, id`);
  const fields = await all(`SELECT f.id, f.scope_key, f.field_key, f.label, f.field_kind, f.input_type,
    COALESCE(f.source_key, '') AS source_key, f.multiple, COALESCE(f.native_column, '') AS native_column,
    COALESCE(f.component_key, '') AS component_key, s.section_key, f.column_span, f.visible, f.list_visible,
    f.filterable, f.dashboard_dimension, f.sort, f.is_builtin
    FROM stage_field_definition f LEFT JOIN stage_section s ON s.id = f.section_id
    WHERE f.deleted_at IS NULL ORDER BY f.scope_key, f.sort, f.id`);
  const fieldRules = rulesById(await all(`SELECT r.field_definition_id AS definition_id, d.attr_value AS status_value, r.required
    FROM stage_field_status_rule r JOIN dict_item d ON d.id = r.status_dict_item_id ORDER BY r.field_definition_id, d.sort, d.id`));
  const deliverables = await all(`SELECT id, scope_key, deliverable_key, label, input_mode, visible, sort, layout_mode
    FROM deliverable_definition WHERE deleted_at IS NULL ORDER BY scope_key, sort, id`);
  const deliverableRules = rulesById(await all(`SELECT r.deliverable_definition_id AS definition_id, d.attr_value AS status_value, r.required
    FROM deliverable_status_rule r JOIN dict_item d ON d.id = r.status_dict_item_id ORDER BY r.deliverable_definition_id, d.sort, d.id`));
  const templates = await all(`SELECT deliverable_definition_id, template_mode, handler_key, version_no, enabled
    FROM deliverable_template_version WHERE deleted_at IS NULL AND template_mode = 'custom' AND handler_key IS NOT NULL
    ORDER BY deliverable_definition_id, version_no`);
  const templatesByDeliverable = new Map();
  for (const item of templates) (templatesByDeliverable.get(item.deliverable_definition_id) || templatesByDeliverable.set(item.deliverable_definition_id, []).get(item.deliverable_definition_id)).push({
    template_mode: item.template_mode, handler_key: item.handler_key, version_no: Number(item.version_no), enabled: Number(item.enabled) ? 1 : 0,
  });

  return {
    source: 'current-local-settings',
    captured_on: '2026-08-03',
    scopes: scopes.map(({ scope_key }) => ({
      scope_key,
      sections: sections.filter((item) => item.scope_key === scope_key).map(({ id, scope_key: ignored, ...item }) => item),
      fields: fields.filter((item) => item.scope_key === scope_key).map(({ id, scope_key: ignored, ...item }) => ({ ...item, rules: fieldRules.get(id) || {} })),
      deliverables: deliverables.filter((item) => item.scope_key === scope_key).map(({ id, scope_key: ignored, ...item }) => ({ ...item, rules: deliverableRules.get(id) || {}, templates: templatesByDeliverable.get(id) || [] })),
    })),
  };
}

try {
  const snapshot = await exportSnapshot();
  const serialized = JSON.stringify(snapshot, null, 2)
    .replace('\n  "scopes": [', '\n  // 各范围均按分区、字段、状态规则和交付件完整保存；seed 仅补齐缺失定义。\n  "scopes": [')
    .replace('\n    {\n      "scope_key": "test.NFT"', '\n    // 测试范围按类型独立保留，避免某类测试的字段或交付件覆盖其他类型。\n    {\n      "scope_key": "test.NFT"');
  const source = `/**\n * 文件：server/src/modules/settings/process-configuration/application/local-stage-content-seed.js\n * 说明：由当前本地已确认的系统设置完整导出。\n * 用途：为新库初始化与 Mock 重建提供同一份只补缺、不覆盖现有管理员配置的默认快照。\n * 作者：hengguan\n */\n\nexport const LOCAL_STAGE_CONTENT_SEED = Object.freeze(${serialized});\n`;
  await fs.writeFile(target, source, 'utf8');
  process.stdout.write(`已导出 ${snapshot.scopes.length} 个范围到 ${target}\n`);
} finally {
  await closeDb();
}
