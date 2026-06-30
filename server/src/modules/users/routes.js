/**
 * 文件：modules/users/routes.js
 * 用途：人员（用户）管理接口。CRUD（含一人多角色）、重置密码、Excel 导入/导出、
 *       人员模糊搜索（供需求/开发/测试等表单的负责人选择）。
 * 作者：hengguan
 * 说明：手机号为唯一登录名；导入支持"覆盖更新/重复跳过/事务回滚"三种冲突策略。
 */

import { get, all, run, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { hashPassword, validatePasswordComplexity, getSecurityConfig } from '../../lib/password.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { ok, notFound, badRequest } from '../../lib/http.js';
import { resolveDictAttr } from '../../lib/resolver.js';
import { sanitizeText } from '../../lib/sanitize.js';

// 导出列定义（不含密码）
const EXPORT_COLUMNS = [
  { key: 'phone', title: '手机号' },
  { key: 'name', title: '姓名' },
  { key: 'org', title: '所属机构' },
  { key: 'roles', title: '角色' },
  { key: 'status', title: '状态' },
];
// 导入列定义（额外含初始密码）
const IMPORT_COLUMNS = [
  { key: 'phone', title: '手机号' },
  { key: 'name', title: '姓名' },
  { key: 'org', title: '所属机构' },
  { key: 'roles', title: '角色' },
  { key: 'status', title: '状态' },
  { key: 'password', title: '初始密码' },
];

/** 兼容性解析单个角色标识或名称 */
function resolveRoleCode(text) {
  if (!text) return null;
  const val = String(text).trim();
  const row = get('SELECT code FROM role WHERE LOWER(code) = LOWER(?) OR LOWER(name) = LOWER(?)', val, val);
  return row ? row.code : val;
}

/** 兼容性解析多个角色（多标识/多名称） */
function resolveRoleCodes(text) {
  if (!text) return [];
  const parts = String(text).split(/[、,，;\s|]+/).map(p => p.trim()).filter(Boolean);
  return parts.map(p => resolveRoleCode(p) || p);
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
function rolesOfUser(userId) {
  return all(
    `SELECT r.id, r.code, r.name FROM role r JOIN user_role ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
    userId,
  );
}

/** 设置用户角色（按角色标识数组） */
function setUserRoles(userId, roleCodes) {
  run('DELETE FROM user_role WHERE user_id = ?', userId);
  for (const code of roleCodes || []) {
    const role = get('SELECT id FROM role WHERE code = ?', code);
    if (role) run('INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (?,?)', userId, role.id);
  }
}

export default async function userRoutes(fastify) {
  // 列表（附带角色信息）
  fastify.post('/users/list', { preHandler: fastify.requirePerm('user', 'view') }, async (request) => {
    const { query, baseWhere, baseParams } = buildUserListQuery(request.body || {});
    
    const result = listQuery({
      table: 'user',
      columns: ['id', 'phone', 'name', 'org', 'status', 'created_at'],
      searchColumns: ['phone', 'name', 'org'],
      query,
      baseWhere,
      baseParams,
      select: 'id, phone, name, org, status, is_super, created_at, login_fail_count, lockout_until',
    });
    result.list = result.list.map((u) => ({ ...u, roles: rolesOfUser(u.id) }));
    return ok(result);
  });

  // 人员模糊搜索（任意登录用户，供负责人/提出人选择）
  fastify.get('/users/search', { preHandler: fastify.authenticate }, async (request) => {
    const kw = String(request.query.keyword || '').trim();
    const rows = kw
      ? all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 30', `%${kw}%`, `%${kw}%`)
      : all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' ORDER BY name LIMIT 30');
    return ok(rows);
  });

  // 获取所有启用的人员（不限流，任意登录用户，供下拉列表选择）
  fastify.get('/users/active', { preHandler: fastify.authenticate }, async () => {
    const rows = all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' ORDER BY name');
    return ok(rows);
  });

  // 详情
  fastify.get('/users/:id', { preHandler: fastify.requirePerm('user', 'view') }, async (request) => {
    const u = get('SELECT id, phone, name, org, status, is_super, login_fail_count, lockout_until FROM user WHERE id = ?', request.params.id);
    if (!u) throw notFound();
    return ok({ ...u, roles: rolesOfUser(u.id) });
  });

  // 解锁用户（重置登录失败计数与锁定时间）
  fastify.post('/users/:id/unlock', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    const u = get('SELECT id, name, login_fail_count, lockout_until FROM user WHERE id = ?', id);
    if (!u) throw notFound();
    if (!u.lockout_until && !u.login_fail_count) throw badRequest('该账号未被锁定，无需解锁');
    run(
      "UPDATE user SET login_fail_count = 0, lockout_until = NULL, updated_at = datetime('now','localtime') WHERE id = ?",
      id
    );
    return ok(null, `已解锁用户 ${u.name}`);
  });

  // 新增
  fastify.post('/users', { preHandler: fastify.requirePerm('user', 'create') }, async (request) => {
    let { phone, name, org, password, roles } = request.body || {};
    if (!phone || !name) throw badRequest('手机号与姓名必填');
    name = sanitizeText(name);
    if (!name) throw badRequest('姓名不能为空或仅含无效字符');
    if (get('SELECT id FROM user WHERE phone = ?', phone)) throw badRequest('手机号已存在');

    const finalPwd = String(password || '').trim();
    if (!finalPwd) throw badRequest('初始密码必填');
    if (!validatePasswordComplexity(finalPwd)) {
      const minLength = getSecurityConfig()['security.password.minLength'];
      throw badRequest(`密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
    }

    const id = tx(() => {
      const res = run(
        'INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime(\'now\',\'localtime\'))',
        phone, name, org || null, hashPassword(finalPwd), '启用',
      );
      setUserRoles(res.lastInsertRowid, roles);
      return res.lastInsertRowid;
    });
    return ok({ id });
  });

  // 修改
  fastify.put('/users/:id', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM user WHERE id = ?', id);
    if (!old) throw notFound();
    const { name: rawName, org, status, roles } = request.body || {};
    const name = rawName !== undefined ? sanitizeText(rawName) : undefined;
    tx(() => {
      run(
        `UPDATE user SET name=?, org=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
        name ?? old.name, org ?? old.org, status ?? old.status, id,
      );
      // 角色可自由编辑（含超级管理员）；超管权限源于 is_super 标识，与角色无关，不会因改角色而丢失
      if (roles !== undefined) setUserRoles(id, roles);
    });
    return ok({ id });
  });

  // 重置密码
  fastify.post('/users/:id/reset-password', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    if (!get('SELECT id FROM user WHERE id = ?', id)) throw notFound();
    const pwd = String(request.body?.password || '').trim();
    if (!pwd) throw badRequest('新密码必填');
    if (!validatePasswordComplexity(pwd)) {
      const minLength = getSecurityConfig()['security.password.minLength'];
      throw badRequest(`密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
    }
    run(`UPDATE user SET password_hash=?, updated_at=datetime('now','localtime'), password_changed_at=datetime('now','localtime') WHERE id=?`, hashPassword(pwd), id);
    return ok(null, '密码已重置');
  });

  // 删除
  fastify.delete('/users/:id', { preHandler: fastify.requirePerm('user', 'delete') }, async (request) => {
    const id = request.params.id;
    const u = get('SELECT * FROM user WHERE id = ?', id);
    if (!u) throw notFound();
    if (u.is_super) throw badRequest('超级管理员不可删除');
    run('DELETE FROM user WHERE id = ?', id);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/users/export', { preHandler: fastify.requirePerm('user', 'export') }, async (request, reply) => {
    const { query, baseWhere, baseParams } = buildUserListQuery(request.body || {});
    const result = listQuery({
      table: 'user',
      columns: ['id', 'phone', 'name', 'org', 'status'],
      searchColumns: ['phone', 'name', 'org'],
      query: { ...query, pageSize: 0 },
      baseWhere,
      baseParams,
      select: 'id, phone, name, org, status',
    });

    const orgsAll = all("SELECT attr_value, display_value FROM dict_item WHERE category = 'org'");
    const orgMap = {};
    for (const o of orgsAll) orgMap[o.attr_value] = o.display_value;

    const rows = result.list.map((u) => ({
      ...u,
      org: orgMap[u.org] || u.org || '',
      roles: rolesOfUser(u.id).map((r) => r.name).join('、'),
    }));
    const buf = await exportXlsx(EXPORT_COLUMNS, rows, '人员清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=users.xlsx');
    return reply.send(buf);
  });

  // 导入模板（含初始密码列）
  fastify.get('/users/template', { preHandler: fastify.requirePerm('user', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IMPORT_COLUMNS, [], '人员模板');
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
    const orgsAll = all("SELECT attr_value, display_value FROM dict_item WHERE category = 'org'");
    const orgMap = {};
    for (const o of orgsAll) orgMap[o.attr_value] = o.display_value;

    const rolesAll = all('SELECT code, name FROM role');
    const roleNameMap = {};
    for (const r of rolesAll) {
      roleNameMap[r.code] = r.name;
    }

    const apply = () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.phone) throw new Error('手机号不能为空');
          if (!r.name) throw new Error('姓名不能为空');

          const phone = String(r.phone).trim();
          if (!phone) throw new Error('手机号不能为空');

          // 兼容性字典转换
          const resolvedOrg = resolveDictAttr('org', r.org);
          const resolvedStatus = resolveDictAttr('user_status', r.status) || '启用';

          const exists = get('SELECT * FROM user WHERE phone = ?', phone);

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
            const oldRoles = rolesOfUser(exists.id).map(r => r.name).join('、');
            const resolvedRoleCodes = resolveRoleCodes(r.roles);
            const hasRolesInput = r.roles !== undefined && String(r.roles).trim() !== '';
            if (hasRolesInput) {
              const newRoleNames = resolvedRoleCodes.map(code => roleNameMap[code] || code).join('、');
              compareAndPush('roles', '角色', oldRoles || '无', newRoleNames || '无');
            }

            if (changes.length > 0) {
              run(
                `UPDATE user SET name=?, org=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
                r.name, resolvedOrg || null, resolvedStatus, exists.id
              );
              if (hasRolesInput) {
                setUserRoles(exists.id, resolvedRoleCodes);
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
              const minLength = getSecurityConfig()['security.password.minLength'];
              throw new Error(`密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
            }
            const res = run(
              'INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime(\'now\',\'localtime\'))',
              phone, r.name, resolvedOrg || null, hashPassword(initPwd), resolvedStatus
            );
            const resolvedRoleCodes = resolveRoleCodes(r.roles);
            if (resolvedRoleCodes.length) {
              setUserRoles(res.lastInsertRowid, resolvedRoleCodes);
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
        tx(apply);
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
      apply();
    }

    return ok({ stat, details }, '导入完成');
  });
}
