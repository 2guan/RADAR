/**
 * 文件：server/src/modules/identity-access/api/users-routes.js
 * 说明：手机号为唯一登录名；导入支持"覆盖更新/重复跳过/事务回滚"三种冲突策略。
 * 用途：人员（用户）管理接口。CRUD（含一人多角色）、重置密码、Excel 导入/导出、
 *       人员模糊搜索（供需求/开发/测试等表单的负责人选择）。
 * 作者：hengguan
 */

import { get, all, run, tx, listQuery } from '../../../platform/persistence/index.js';
import { hashPassword, validatePasswordComplexity, getSecurityConfig } from '../../../platform/auth/index.js';
import { exportXlsx, parseXlsx } from '../../../platform/import-export/index.js';
import { ok, notFound, badRequest, sanitizeText } from '../../../platform/runtime/index.js';
import { getDictDisplayMap, resolveDictAttr, resolveExistingDictAttr } from '../../settings/reference-data/index.js';
import { resolveEffectiveAllOrgAccess } from '../../../shared/utils/organization-scope.js';

// 导出列定义（不含密码）
const EXPORT_COLUMNS = [
  { key: 'phone', title: '手机号' },
  { key: 'name', title: '姓名' },
  { key: 'org', title: '所属机构' },
  { key: 'roles', title: '角色' },
  { key: 'all_org_access_override', title: '全机构权限（单独设置）' },
  { key: 'all_org_access', title: '全机构权限（生效）' },
  { key: 'all_org_access_source', title: '权限来源' },
  { key: 'status', title: '状态' },
  { key: 'created_at', title: '创建时间', valueType: 'datetime' },
  { key: 'updated_at', title: '更新时间', valueType: 'datetime' },
];
// 导入列定义（额外含初始密码）
const IMPORT_COLUMNS = [
  { key: 'phone', title: '手机号' },
  { key: 'name', title: '姓名' },
  { key: 'org', title: '所属机构' },
  { key: 'roles', title: '角色' },
  { key: 'all_org_access_override', title: '全机构权限' },
  { key: 'status', title: '状态' },
  { key: 'password', title: '初始密码' },
];

/** 兼容性解析单个角色标识或名称 */
async function resolveRoleCode(text) {
  if (!text) return null;
  const val = String(text).trim();
  const row = await get('SELECT code FROM role WHERE LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?)', val, val);
  return row ? row.code : val;
}

/** 兼容性解析多个角色（多标识/多名称） */
async function resolveRoleCodes(text) {
  if (!text) return [];
  const parts = String(text).split(/[、,，;\s|]+/).map(p => p.trim()).filter(Boolean);
  return Promise.all(parts.map(async (p) => await resolveRoleCode(p) || p));
}

/** 用户所属机构只保存 org 属性值；管理端和 Excel 可输入对应显示值。 */
async function normalizeOrganization(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const attrValue = await resolveExistingDictAttr('org', text);
  if (!attrValue) throw badRequest(`所属机构 [${text}] 不存在或已停用`);
  return attrValue;
}

/** 统一的人员查询过滤条件构建器 */
function buildUserListQuery(body) {
  const wh = [];
  const params = [];
  const filters = Array.isArray(body.filters) ? body.filters : [];
  const normalFilters = [];
  
  for (const f of filters) {
    if (!f || f.value === undefined || f.value === null || f.value === '') continue;
    
    if (f.field === 'user_info') {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      if (vals.length) {
        const placeholders = vals.map(() => '?').join(',');
        wh.push(`(name IN (${placeholders}) OR phone IN (${placeholders}))`);
        params.push(...vals, ...vals);
      }
    } else if (f.field === 'role') {
      const roleCodes = Array.isArray(f.value) ? f.value : [f.value];
      if (roleCodes.length) {
        const placeholders = roleCodes.map(() => '?').join(',');
        wh.push(`id IN (SELECT user_id FROM user_role WHERE role_id IN (SELECT id FROM role WHERE code IN (${placeholders})))`);
        params.push(...roleCodes);
      }
    } else {
      normalFilters.push(f);
    }
  }
  
  return {
    query: { ...body, filters: normalFilters },
    baseWhere: wh.join(' AND '),
    baseParams: params,
  };
}

/** 查询用户的角色名数组 */
async function rolesOfUser(userId) {
  return await all(
    `SELECT r.id, r.code, r.name, r.all_org_access FROM role r JOIN user_role ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
    userId,
  );
}

function parseAllOrgAccessOverride(value, { allowUndefined = false } = {}) {
  if (value === undefined && allowUndefined) return undefined;
  if (value === undefined) return null;
  if (value === null || value === '' || String(value).trim() === '继承角色配置') return null;
  if (value === true || value === 1 || String(value).trim().toLowerCase() === 'true' || String(value).trim() === '是') return 1;
  if (value === false || value === 0 || String(value).trim().toLowerCase() === 'false' || String(value).trim() === '否') return 0;
  throw badRequest('全机构权限仅支持“继承角色配置 / 是 / 否”');
}

async function withEffectiveAccess(user) {
  const roles = await rolesOfUser(user.id);
  const resolved = resolveEffectiveAllOrgAccess(user, roles);
  return {
    ...user,
    roles,
    all_org_access: resolved.allOrgAccess ? 1 : 0,
    all_org_access_source: resolved.source,
  };
}

/** 设置用户角色（按角色标识数组） */
async function setUserRoles(userId, roleCodes) {
  await run('DELETE FROM user_role WHERE user_id = ?', userId);
  for (const code of roleCodes || []) {
    const role = await get('SELECT id FROM role WHERE code = ?', code);
    if (role) await run('INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (?,?)', userId, role.id);
  }
}

export default async function userRoutes(fastify) {
  // 列表（附带角色信息）
  fastify.post('/users/list', { preHandler: fastify.requirePerm('user', 'view') }, async (request) => {
    const { query, baseWhere, baseParams } = buildUserListQuery(request.body || {});
    
    const result = await listQuery({
      table: 'user',
      columns: ['id', 'phone', 'name', 'org', 'all_org_access_override', 'status', 'created_at'],
      searchColumns: ['phone', 'name', 'org'],
      query,
      baseWhere,
      baseParams,
      select: 'id, phone, name, org, all_org_access_override, status, is_super, created_at, login_fail_count, lockout_until',
    });
    const orgDisplayMap = await getDictDisplayMap('org');
    result.list = await Promise.all(result.list.map((user) => withEffectiveAccess({
      ...user,
      org_display: orgDisplayMap[user.org] || user.org || null,
    })));
    return ok(result);
  });

  // 人员模糊搜索（任意登录用户，供负责人/提出人选择）
  fastify.get('/users/search', { preHandler: fastify.authenticate }, async (request) => {
    const kw = String(request.query.keyword || '').trim();
    const rows = kw
      ? await all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 30', `%${kw}%`, `%${kw}%`)
      : await all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' ORDER BY name LIMIT 30');
    return ok(rows);
  });

  // 获取所有启用的人员（不限流，任意登录用户，供下拉列表选择）
  fastify.get('/users/active', { preHandler: fastify.authenticate }, async () => {
    const rows = await all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' ORDER BY name');
    return ok(rows);
  });

  // 详情
  fastify.get('/users/:id', { preHandler: fastify.requirePerm('user', 'view') }, async (request) => {
    const u = await get('SELECT id, phone, name, org, all_org_access_override, status, is_super, login_fail_count, lockout_until FROM user WHERE id = ?', request.params.id);
    if (!u) throw notFound();
    const orgDisplayMap = await getDictDisplayMap('org');
    return ok(await withEffectiveAccess({ ...u, org_display: orgDisplayMap[u.org] || u.org || null }));
  });

  // 解锁用户（重置登录失败计数与锁定时间）
  fastify.post('/users/:id/unlock', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    const u = await get('SELECT id, name, login_fail_count, lockout_until FROM user WHERE id = ?', id);
    if (!u) throw notFound();
    if (!u.lockout_until && !u.login_fail_count) throw badRequest('该账号未被锁定，无需解锁');
    await run(
      "UPDATE user SET login_fail_count = 0, lockout_until = NULL, updated_at = datetime('now','localtime') WHERE id = ?",
      id
    );
    return ok(null, `已解锁用户 ${u.name}`);
  });

  // 新增
  fastify.post('/users', { preHandler: fastify.requirePerm('user', 'create') }, async (request) => {
    let { phone, name, org, password, roles, all_org_access_override } = request.body || {};
    if (!phone || !name) throw badRequest('手机号与姓名必填');
    name = sanitizeText(name);
    if (!name) throw badRequest('姓名不能为空或仅含无效字符');
    if (await get('SELECT id FROM user WHERE phone = ?', phone)) throw badRequest('手机号已存在');

    const finalPwd = String(password || '').trim();
    if (!finalPwd) throw badRequest('初始密码必填');
    if (!validatePasswordComplexity(finalPwd)) {
      const minLength = (await getSecurityConfig())['security.password.minLength'];
      throw badRequest(`密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
    }

    org = await normalizeOrganization(org);
    const accessOverride = parseAllOrgAccessOverride(all_org_access_override, { allowUndefined: true });
    const id = await tx(async () => {
      const res = await run(
        'INSERT INTO user (phone, name, org, all_org_access_override, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,?,datetime(\'now\',\'localtime\'))',
        phone, name, org || null, accessOverride ?? null, hashPassword(finalPwd), '启用',
      );
      await setUserRoles(res.lastInsertRowid, roles);
      return res.lastInsertRowid;
    });
    return ok({ id });
  });

  // 修改
  fastify.put('/users/:id', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = await get('SELECT * FROM user WHERE id = ?', id);
    if (!old) throw notFound();
    const { name: rawName, org, status, roles, all_org_access_override } = request.body || {};
    const name = rawName !== undefined ? sanitizeText(rawName) : undefined;
    const normalizedOrg = org === undefined ? old.org : await normalizeOrganization(org);
    const accessOverride = parseAllOrgAccessOverride(all_org_access_override, { allowUndefined: true });
    await tx(async () => {
      await run(
        `UPDATE user SET name=?, org=?, all_org_access_override=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
        name ?? old.name, normalizedOrg, accessOverride === undefined ? old.all_org_access_override : accessOverride, status ?? old.status, id,
      );
      // 角色可自由编辑（含超级管理员）；超管权限源于 is_super 标识，与角色无关，不会因改角色而丢失
      if (roles !== undefined) await setUserRoles(id, roles);
    });
    return ok({ id });
  });

  // 重置密码
  fastify.post('/users/:id/reset-password', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    if (!await get('SELECT id FROM user WHERE id = ?', id)) throw notFound();
    const pwd = String(request.body?.password || '').trim();
    if (!pwd) throw badRequest('新密码必填');
    if (!validatePasswordComplexity(pwd)) {
      const minLength = (await getSecurityConfig())['security.password.minLength'];
      throw badRequest(`密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
    }
    await run(`UPDATE user SET password_hash=?, updated_at=datetime('now','localtime'), password_changed_at=datetime('now','localtime') WHERE id=?`, hashPassword(pwd), id);
    return ok(null, '密码已重置');
  });

  // 删除
  fastify.delete('/users/:id', { preHandler: fastify.requirePerm('user', 'delete') }, async (request) => {
    const id = request.params.id;
    const u = await get('SELECT * FROM user WHERE id = ?', id);
    if (!u) throw notFound();
    if (u.is_super) throw badRequest('超级管理员不可删除');
    await run('DELETE FROM user WHERE id = ?', id);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/users/export', { preHandler: fastify.requirePerm('user', 'export') }, async (request, reply) => {
    const { query, baseWhere, baseParams } = buildUserListQuery(request.body || {});
    const result = await listQuery({
      table: 'user',
      columns: ['id', 'phone', 'name', 'org', 'all_org_access_override', 'status', 'created_at', 'updated_at'],
      searchColumns: ['phone', 'name', 'org'],
      query: { ...query, pageSize: 0 },
      baseWhere,
      baseParams,
      select: 'id, phone, name, org, all_org_access_override, status, is_super, created_at, updated_at',
    });

    const orgMap = await getDictDisplayMap('org');

    const rows = await Promise.all(result.list.map(async (u) => {
      const enriched = await withEffectiveAccess(u);
      return {
        ...enriched,
        org: orgMap[u.org] || u.org || '',
        roles: enriched.roles.map((r) => r.name).join('、'),
        all_org_access_override: enriched.all_org_access_override === null || enriched.all_org_access_override === undefined
          ? '继承角色配置'
          : (Number(enriched.all_org_access_override) ? '是' : '否'),
        all_org_access: enriched.all_org_access ? '是' : '否',
        all_org_access_source: enriched.all_org_access_source === 'person' ? '人员单独设置' : '角色配置',
      };
    }));
    const buf = await exportXlsx(EXPORT_COLUMNS, rows, '人员清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=users.xlsx');
    return reply.send(buf);
  });

  // 导入模板（含初始密码列）
  fastify.get('/users/template', { preHandler: fastify.requirePerm('user', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IMPORT_COLUMNS, [{
      phone: '13800000001', name: '示例人员', org: '示例机构', roles: '业务人员,测试人员', all_org_access_override: '继承角色配置', status: '启用', password: 'Demo@2026Pass',
    }], '人员模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=users_template.xlsx');
    return reply.send(buf);
  });

  // 导入（multipart，含冲突策略 mode：overwrite/skip/rollback；支持初始密码列）
  fastify.post('/users/import', { preHandler: fastify.requirePerm('user', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || request.query.mode || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, IMPORT_COLUMNS);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];

    // 载入机构和角色映射用于变化展示及解析
    const orgMap = await getDictDisplayMap('org');

    const rolesAll = await all('SELECT code, name FROM role');
    const roleNameMap = {};
    for (const r of rolesAll) {
      roleNameMap[r.code] = r.name;
    }

    const apply = async () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.phone) throw new Error('手机号不能为空');
          if (!r.name) throw new Error('姓名不能为空');

          const phone = String(r.phone).trim();
          if (!phone) throw new Error('手机号不能为空');

          // 兼容性字典转换
          const resolvedOrg = await normalizeOrganization(r.org);
          const resolvedStatus = await resolveDictAttr('user_status', r.status) || '启用';

          const exists = await get('SELECT * FROM user WHERE phone = ?', phone);

          if (exists) {
            if (mode === 'skip') {
              stat.skipped++;
              details.push({
                key: phone,
                title: r.name,
                action: 'skip',
                status: 'success',
                __rowNum__: rowNum,
              });
              continue;
            }
            if (mode === 'rollback') {
              throw new Error(`手机号 [${phone}] 已存在`);
            }

            // overwrite 模式：比对并更新
            const changes = [];
            const compareAndPush = (fieldKey, fieldName, oldVal, newVal) => {
              if (oldVal !== newVal) {
                changes.push({ field: fieldName, old: oldVal, new: newVal });
              }
            };

            compareAndPush('name', '姓名', exists.name || '', r.name || '');
            
            const oldOrgName = orgMap[exists.org] || exists.org || '无';
            const newOrgName = orgMap[resolvedOrg] || resolvedOrg || '无';
            compareAndPush('org', '所属机构', oldOrgName, newOrgName);

            compareAndPush('status', '状态', exists.status || '启用', resolvedStatus || '启用');

            // 角色比对
            const oldRoles = (await rolesOfUser(exists.id)).map(r => r.name).join('、');
            const resolvedRoleCodes = await resolveRoleCodes(r.roles);
            const hasRolesInput = r.roles !== undefined && String(r.roles).trim() !== '';
            const accessOverride = parseAllOrgAccessOverride(r.all_org_access_override);
            if (hasRolesInput) {
              const newRoleNames = resolvedRoleCodes.map(code => roleNameMap[code] || code).join('、');
              compareAndPush('roles', '角色', oldRoles || '无', newRoleNames || '无');
            }
            compareAndPush(
              'all_org_access_override',
              '全机构权限',
              exists.all_org_access_override === null || exists.all_org_access_override === undefined ? '继承角色配置' : (Number(exists.all_org_access_override) ? '是' : '否'),
              accessOverride === null ? '继承角色配置' : (accessOverride ? '是' : '否'),
            );

            if (changes.length > 0) {
              await run(
                `UPDATE user SET name=?, org=?, all_org_access_override=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
                r.name, resolvedOrg || null, accessOverride, resolvedStatus, exists.id
              );
              if (hasRolesInput) {
                await setUserRoles(exists.id, resolvedRoleCodes);
              }
            }

            stat.updated++;
            details.push({
              key: phone,
              title: r.name,
              action: 'update',
              status: 'success',
              __rowNum__: rowNum,
              changes,
            });

          } else {
            // insert 新建
            const initPwd = String(r.password || '').trim();
            if (!initPwd) throw new Error('初始密码不能为空');
            if (!validatePasswordComplexity(initPwd)) {
              const minLength = (await getSecurityConfig())['security.password.minLength'];
              throw new Error(`密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
            }
            const accessOverride = parseAllOrgAccessOverride(r.all_org_access_override);
            const res = await run(
              'INSERT INTO user (phone, name, org, all_org_access_override, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,?,datetime(\'now\',\'localtime\'))',
              phone, r.name, resolvedOrg || null, accessOverride, hashPassword(initPwd), resolvedStatus
            );
            const resolvedRoleCodes = await resolveRoleCodes(r.roles);
            if (resolvedRoleCodes.length) {
              await setUserRoles(res.lastInsertRowid, resolvedRoleCodes);
            }
            stat.inserted++;
            details.push({
              key: phone,
              title: r.name,
              action: 'insert',
              status: 'success',
              __rowNum__: rowNum,
            });
          }
        } catch (err) {
          stat.failed++;
          details.push({
            key: r.phone || '未知手机号',
            title: r.name || '空姓名',
            status: 'fail',
            __rowNum__: rowNum,
            error: err.message,
          });
          if (mode === 'rollback') {
            throw err;
          }
        }
      }
    };

    if (mode === 'rollback') {
      try {
        await tx(apply);
      } catch (err) {
        for (const item of details) {
          if (item.status === 'success') {
            item.action = 'skip';
          }
        }
        stat.inserted = 0;
        stat.updated = 0;
      }
    } else {
      await apply();
    }

    return ok({ stat, details }, '导入完成');
  });
}
