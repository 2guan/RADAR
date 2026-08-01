/**
 * 文件：server/src/modules/requirements/application/development-system-roles.js
 * 说明：需求模块拥有主责系统和协同改造系统字段；开发承接只能通过本公开能力回写。
 * 用途：提供开发承接替换需求开发系统角色的语义化公开能力，并记录变更审计。
 * 作者：hengguan
 */
import { get, run } from '../../../platform/persistence/index.js';
import { auditUpdate } from '../../../platform/audit/index.js';
import { parseJsonArray } from '../../../platform/runtime/index.js';

const LABELS = { main_systems: '主责系统', collab_dev_systems: '协同改造系统' };

export async function replaceRequirementDevelopmentSystemRoles({ workItemCode, mainSystem, collabSystems, actor }) {
  const old = await get('SELECT * FROM requirement WHERE req_code = ?', workItemCode);
  if (!old) return null;
  const data = {
    main_systems: JSON.stringify([mainSystem]),
    collab_dev_systems: JSON.stringify(collabSystems),
  };
  await run(
    "UPDATE requirement SET main_systems=?, collab_dev_systems=?, updated_at=datetime('now','localtime') WHERE id=?",
    data.main_systems, data.collab_dev_systems, old.id,
  );
  await auditUpdate('requirement', old.id, old.req_code, actor, {
    ...old,
    main_systems: parseJsonArray(old.main_systems),
    collab_dev_systems: parseJsonArray(old.collab_dev_systems),
  }, { main_systems: [mainSystem], collab_dev_systems: collabSystems }, LABELS);
  return { id: old.id, workItemCode: old.req_code };
}
