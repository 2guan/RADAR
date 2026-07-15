/**
 * 文件：modules/release/routes.js
 * 用途：投产审批模块接口。审批对象为「投产申请」中所选择的需求/工单/问题（逐条展开），
 *       提供列表、详情（含评审会签、投产信息、关联制品情况）、负责人/状态/评审状态更新、会签签署。
 * 作者：hengguan
 * 说明：投产任务（release_task）以「实体编号 + 申请投产点」为唯一审批实例，entity_type 区分类型；
 *       首次打开某个申请投产点下的详情时惰性创建投产任务与会签项（不再有「UAT 终态方可发起」的限制）。
 *       「各系统投产登记」改为「关联制品情况」：读取引用了该需求/工单/问题的投产申请制品信息。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, all, run, tx, dialect } from '../../db/index.js';
import { config } from '../../config.js';
import { auditUpdate } from '../../lib/audit.js';
import { windowIds } from '../../lib/window.js';
import { ok, notFound, badRequest, forbidden } from '../../lib/http.js';
import { exportXlsx } from '../../lib/excel.js';
import { signatureDataUrl } from '../../lib/signature.js';
import { buildReleaseWordDoc } from '../../lib/release-word.js';
import { getWorkItem } from '../../lib/work-items.js';
import { defaultDictAttr } from '../../lib/status.js';
import { formatAttachments } from '../../lib/resolver.js';
import { parseJsonArray } from '../../lib/json.js';
import { statusTypeForReleaseStatus, validateRequiredFields } from '../../lib/required-fields.js';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const RELEASE_TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/release-documents');

async function templatePath(filename) {
  const fullPath = path.join(RELEASE_TEMPLATE_DIR, filename);
  try {
    await fs.access(fullPath);
    return fullPath;
  } catch {
    throw notFound(`模板文件不存在：${filename}`);
  }
}

function filenameSafe(text) {
  return String(text || '未命名').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
}

function unique(list) {
  return [...new Set((list || []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainTextFromXml(xml) {
  return xml.replace(/<[^>]+>/g, '');
}

const FILLED_TEXT_RUN_PROPS = [
  '<w:rPr>',
  '<w:rFonts w:ascii="微软雅黑" w:hAnsi="微软雅黑" w:eastAsia="微软雅黑" w:cs="微软雅黑"/>',
  '<w:sz w:val="18"/><w:szCs w:val="18"/>',
  '</w:rPr>',
].join('');

function cellTextXml(text, paragraphProps = '') {
  return String(text || '').split(/\r?\n/).map((line) => (
    `<w:p>${paragraphProps}<w:r>${FILLED_TEXT_RUN_PROPS}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`
  )).join('');
}

function replaceCellText(cellXml, text) {
  const cellProps = cellXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/)?.[0] || '';
  const paragraphProps = cellXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/)?.[0] || '';
  return cellXml.replace(/(<w:tc\b[^>]*>)[\s\S]*(<\/w:tc>)/, `$1${cellProps}${cellTextXml(text, paragraphProps)}$2`);
}

function fillRightCellByLabel(documentXml, label, value) {
  const rows = documentXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  for (const row of rows) {
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    if (cells.length < 2 || !plainTextFromXml(cells[0]).includes(label)) continue;
    return documentXml.replace(row, row.replace(cells[1], replaceCellText(cells[1], value)));
  }
  return documentXml;
}

function fillPersonRow(documentXml, label, person) {
  const rows = documentXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  for (const row of rows) {
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    if (cells.length < 5 || !plainTextFromXml(cells[0]).includes(label)) continue;
    let next = row;
    next = next.replace(cells[1], replaceCellText(cells[1], person?.org || ''));
    next = next.replace(cells[2], replaceCellText(cells[2], person?.name || ''));
    next = next.replace(cells[3], replaceCellText(cells[3], person?.phone || ''));
    return documentXml.replace(row, next);
  }
  return documentXml;
}

function replaceParagraphByText(documentXml, text, replacementXml) {
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  for (const paragraph of paragraphs) {
    if (!plainTextFromXml(paragraph).includes(text)) continue;
    return documentXml.replace(paragraph, replacementXml);
  }
  return documentXml;
}

function centeredBoldParagraph(text) {
  return [
    '<w:p>',
    '<w:pPr><w:jc w:val="center"/></w:pPr>',
    '<w:r><w:rPr>',
    '<w:rFonts w:ascii="微软雅黑" w:hAnsi="微软雅黑" w:eastAsia="微软雅黑" w:cs="微软雅黑"/>',
    '<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/>',
    '</w:rPr>',
    `<w:t xml:space="preserve">${xmlEscape(text)}</w:t>`,
    '</w:r>',
    '</w:p>',
  ].join('');
}

function insertParagraphAfterText(documentXml, text, paragraphXml) {
  const paragraphs = documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  for (const paragraph of paragraphs) {
    if (!plainTextFromXml(paragraph).includes(text)) continue;
    return documentXml.replace(paragraph, `${paragraph}${paragraphXml}`);
  }
  return documentXml;
}

function nextRelationshipId(relsXml) {
  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  return `rId${(ids.length ? Math.max(...ids) : 0) + 1}`;
}

function addPackageRelationship(relsXml, relId, target) {
  const rel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="${xmlEscape(target)}"/>`;
  return relsXml.replace('</Relationships>', `${rel}</Relationships>`);
}

function addImageRelationship(relsXml, relId, target) {
  const rel = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${xmlEscape(target)}"/>`;
  return relsXml.replace('</Relationships>', `${rel}</Relationships>`);
}

function ensureDefaultContentType(contentTypesXml, extension, contentType) {
  if (contentTypesXml.includes(`Extension="${extension}"`)) return contentTypesXml;
  const def = `<Default Extension="${extension}" ContentType="${contentType}"/>`;
  return contentTypesXml.replace('</Types>', `${def}</Types>`);
}

function attachmentObjectParagraph(packageRelId, imageRelId, shapeId, filename) {
  return [
    '<w:p>',
    '<w:r><w:object w:dxaOrig="2160" w:dyaOrig="720">',
    `<v:shape id="${shapeId}" type="#_x0000_t75" style="width:48pt;height:48pt" o:ole="">`,
    `<v:imagedata r:id="${imageRelId}" o:title="Excel附件"/>`,
    '</v:shape>',
    `<o:OLEObject Type="Embed" ProgID="Excel.Sheet.12" ShapeID="${shapeId}" DrawAspect="Icon" ObjectID="_${shapeId}" r:id="${packageRelId}"/>`,
    '</w:object></w:r>',
    `<w:r>${FILLED_TEXT_RUN_PROPS}<w:t xml:space="preserve"> 附件：${xmlEscape(filename)}</w:t></w:r>`,
    '</w:p>',
  ].join('');
}

/** 读取被打标为"会签角色"的角色列表 */
async function signoffRoles() {
  return await all('SELECT id, name FROM role WHERE is_signoff_role = 1 ORDER BY id');
}

async function signoffsWithRoleConfig(releaseTaskId) {
  return (await all(
    `SELECT rs.*, r.signoff_check_content AS signoff_check_content
       FROM release_signoff rs
       LEFT JOIN role r ON r.id = rs.role_id
      WHERE rs.release_task_id = ?
      ORDER BY rs.id`,
    releaseTaskId,
  )).map((s) => ({ ...s, signature_image: signatureDataUrl(s.signature_path) }));
}

/** 汇总某投产任务的会签进度 */
async function signoffSummary(releaseTaskId) {
  const rows = await all('SELECT result FROM release_signoff WHERE release_task_id = ?', releaseTaskId);
  const activeRows = rows.filter((r) => r.result !== '不涉及');
  const total = activeRows.length;
  const signed = activeRows.filter((r) => r.result === '已签署').length;
  const rejected = rows.filter((r) => r.result === '已驳回').length;
  return { total, signed, rejected };
}

async function isAdminUser(user) {
  if (user?.is_super) return true;
  if (!user?.id) return false;
  return !!await get(
    `SELECT 1
       FROM user_role ur
       JOIN role r ON r.id = ur.role_id
      WHERE ur.user_id = ?
        AND (r.code IN ('管理员', '超级管理员') OR r.name IN ('管理员', '超级管理员'))
      LIMIT 1`,
    user.id,
  );
}

function pointWhere(alias = 'release_task') {
  // release_point_id 允许历史空值；所有按申请投产点定位的查询都通过此片段统一处理 NULL。
  return `(${alias}.release_point_id = ? OR (${alias}.release_point_id IS NULL AND ? IS NULL))`;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function releaseTaskByCodePoint(code, releasePointId) {
  return await get(
    `SELECT * FROM release_task WHERE req_code = ? AND ${pointWhere('release_task')}`,
    code, releasePointId, releasePointId,
  );
}

/** 未显式传申请投产点时，按投产申请、工作项计划投产点依次推断，兼容旧入口。 */
async function resolveReleasePointId(code, explicitValue) {
  const explicit = numberOrNull(explicitValue);
  if (explicit !== null) return explicit;
  const ap = await get(
    `SELECT release_point_id FROM release_apply ra
       WHERE ${dialect.jsonArrayContains('ra.ref_codes')} ORDER BY ra.id LIMIT 1`,
    code,
  );
  if (ap?.release_point_id) return Number(ap.release_point_id);
  const item = await getWorkItem(code);
  if (item?.release_point_id) return Number(item.release_point_id);
  return null;
}

// 手动设置后不被自动逻辑覆盖的评审状态
const REVIEW_MANUAL = ['评审撤销', '应急审批'];

/**
 * 重算评审状态：任一会签驳回 -> 评审拒绝；全部已签署 -> 评审同意；否则 待评审。
 * 手动状态（评审撤销/应急审批）不被覆盖。返回最终评审状态。
 */
async function recomputeReviewStatus(releaseTaskId) {
  const rt = await get('SELECT review_status FROM release_task WHERE id = ?', releaseTaskId);
  if (!rt) return null;
  if (REVIEW_MANUAL.includes(rt.review_status)) return rt.review_status;
  const { total, signed, rejected } = await signoffSummary(releaseTaskId);
  let next = '待评审';
  if (rejected > 0) next = '评审拒绝';
  else if (total > 0 && signed === total) next = '评审同意';
  if (next !== rt.review_status) {
    await run(`UPDATE release_task SET review_status=?, updated_at=datetime('now','localtime') WHERE id=?`, next, releaseTaskId);
  }
  return next;
}

/** 判定实体类型：需求 / 工单 / 问题 / 未知 */
async function classifyEntity(code) {
  const item = await getWorkItem(code);
  if (item) return item.entity_type;
  if (await get('SELECT 1 FROM issue WHERE issue_code = ?', code)) return 'issue';
  return 'unknown';
}

/**
 * 惰性获取/创建投产任务：首次打开详情时自动创建投产任务与会签项（无 UAT 终态限制）。
 */
async function ensureReleaseTask(code, entityType, releasePointId) {
  let rt = await releaseTaskByCodePoint(code, releasePointId);
  if (rt) return rt;
  return await tx(async () => {
    const releaseStatus = await defaultDictAttr('release_status', '待投产');
    const reviewStatus = await defaultDictAttr('review_status', '待评审');
    const res = await run(
      `INSERT INTO release_task (req_code, release_point_id, entity_type, status, review_status) VALUES (?,?,?,?,?)`,
      code, releasePointId, entityType || 'unknown', releaseStatus, reviewStatus,
    );
    const rtId = res.lastInsertRowid;
    for (const role of await signoffRoles()) {
      await run('INSERT INTO release_signoff (release_task_id, role_id, role_name, result) VALUES (?,?,?,?)',
        rtId, role.id, role.name, '未签署');
    }
    return await get('SELECT * FROM release_task WHERE id = ?', rtId);
  });
}

/** 读取引用了该需求/工单/问题编号的投产申请制品信息（关联制品情况） */
async function entityArtifacts(code, releasePointId, sysMap) {
  const pointFilter = releasePointId === null
    ? 'AND ra.release_point_id IS NULL'
    : 'AND ra.release_point_id = ?';
  const params = releasePointId === null ? [code] : [code, releasePointId];
  const rows = await all(
    `SELECT ra.* FROM release_apply ra
       WHERE ${dialect.jsonArrayContains('ra.ref_codes')}
       ${pointFilter}
     ORDER BY ra.id DESC`,
    ...params,
  );
  return rows.map((r) => {
    const units = parseJsonArray(r.delivery_units);
    return {
      id: r.id,
      change_code: r.change_code,
      change_system: r.change_system,
      change_system_name: r.change_system ? `${r.change_system} - ${sysMap[r.change_system] || r.change_system}` : null,
      impl_org: r.impl_org,
      change_content: r.change_content,
      units,
    };
  });
}

async function applicantPrioritySystems(code, entityType) {
  const systems = [];
  const item = await getWorkItem(code);
  if (item?.main_systems?.length) systems.push(...item.main_systems);

  if (entityType === 'issue') {
    const issue = await get('SELECT system FROM issue WHERE issue_code = ?', code);
    const issueSystem = String(issue?.system || '').trim();
    if (issueSystem) {
      systems.push(issueSystem);
      const sys = await get('SELECT sys_code, sys_name FROM system WHERE sys_code = ? OR sys_name = ?', issueSystem, issueSystem);
      if (sys?.sys_code) systems.push(sys.sys_code);
      if (sys?.sys_name) systems.push(sys.sys_name);
    }
  }

  return [...new Set(systems.filter(Boolean).map(String))];
}

function applicantDisplay(user, fallbackName) {
  const name = user?.name || fallbackName;
  if (!name) return null;
  return `${user?.org || '—'}-${name}(${user?.phone || '—'})`;
}

async function releaseApplicantFor(code, releasePointId, entityType) {
  const pointFilter = releasePointId === null
    ? 'AND ra.release_point_id IS NULL'
    : 'AND ra.release_point_id = ?';
  const params = releasePointId === null ? [code] : [code, releasePointId];
  const applies = await all(
    `SELECT ra.* FROM release_apply ra
       WHERE ${dialect.jsonArrayContains('ra.ref_codes')}
       ${pointFilter}
     ORDER BY ra.id DESC`,
    ...params,
  );
  if (!applies.length) return null;

  const prioritySystems = await applicantPrioritySystems(code, entityType);
  const selected = [...applies].sort((a, b) => {
    const ar = prioritySystems.indexOf(String(a.change_system || ''));
    const br = prioritySystems.indexOf(String(b.change_system || ''));
    const ah = ar >= 0;
    const bh = br >= 0;
    if (ah !== bh) return ah ? -1 : 1;
    if (ah && ar !== br) return ar - br;
    return Number(b.id || 0) - Number(a.id || 0);
  })[0];

  const registrar = String(selected.registrar || '').trim();
  const user = registrar
    ? await get(
      `SELECT name, phone, org FROM user
        WHERE name = ?
        ORDER BY CASE WHEN status = '启用' THEN 0 ELSE 1 END, id
        LIMIT 1`,
      registrar,
    )
    : null;
  const display = applicantDisplay(user, registrar);
  return display ? {
    display,
    name: user?.name || registrar,
    phone: user?.phone || null,
    org: user?.org || null,
    release_apply_id: selected.id,
    change_code: selected.change_code,
    register_time: selected.created_at || selected.register_time,
  } : null;
}

async function releaseApplyRowsFor(code, releasePointId) {
  const pointFilter = releasePointId === null
    ? 'AND ra.release_point_id IS NULL'
    : 'AND ra.release_point_id = ?';
  const params = releasePointId === null ? [code] : [code, releasePointId];
  return await all(
    `SELECT ra.* FROM release_apply ra
       WHERE ${dialect.jsonArrayContains('ra.ref_codes')}
       ${pointFilter}
     ORDER BY ra.id`,
    ...params,
  );
}

async function personByName(name) {
  const val = String(name || '').trim();
  if (!val) return null;
  const row = await get(
    `SELECT name, org, phone FROM user
      WHERE name = ?
      ORDER BY CASE WHEN status = '启用' THEN 0 ELSE 1 END, id
      LIMIT 1`,
    val,
  );
  return row || { name: val, org: '', phone: '' };
}

async function peopleByNames(names) {
  const people = [];
  for (const name of unique(names)) {
    const person = await personByName(name);
    if (person) people.push(person);
  }
  if (!people.length) return null;
  return {
    org: unique(people.map((p) => p.org)).join('、'),
    name: people.map((p) => p.name).join('、'),
    phone: unique(people.map((p) => p.phone)).join('、'),
  };
}

async function releaseTemplateContext(code, releasePointId, entityType, rt) {
  const item = await getWorkItem(code);
  const issue = item ? null : await get('SELECT * FROM issue WHERE issue_code = ?', code);
  const applies = await releaseApplyRowsFor(code, releasePointId);
  const releasePoint = releasePointId ? await get('SELECT release_date FROM release_point WHERE id = ?', releasePointId) : null;
  const rawSystemCodes = item
    ? [...(item.main_systems || []), ...(item.collab_dev_systems || []), ...(item.collab_test_systems || [])]
    : [issue?.system];
  const applySystemCodes = applies.map((row) => row.change_system);
  const systemCodes = unique([...rawSystemCodes, ...applySystemCodes]);
  const systems = [];
  for (const codeValue of systemCodes) {
    const sys = await get('SELECT * FROM system WHERE sys_code = ? OR sys_name = ?', codeValue, codeValue);
    systems.push(sys || { sys_code: codeValue, sys_name: codeValue, out_dept: '' });
  }

  const outputDeptBySystem = new Map(applies.map((row) => [String(row.change_system || ''), row.out_dept || '']));
  const systemOutDept = (sys) => sys?.out_dept || outputDeptBySystem.get(String(sys?.sys_code || '')) || '';
  const mainSystemCodes = item ? item.main_systems || [] : [issue?.system].filter(Boolean);
  const mainSystems = systems.filter((sys) => mainSystemCodes.includes(sys.sys_code) || mainSystemCodes.includes(sys.sys_name));
  const title = item?.title || issue?.summary || code;
  const summary = item?.summary || issue?.details || issue?.summary || '';
  const proposeDept = item?.propose_dept || issue?.reporter_org || issue?.business_group || '';
  const devOwners = (await all('SELECT owner FROM dev_task WHERE req_code = ? ORDER BY id', code)).map((row) => row.owner);
  const businessOwner = item?.yn_owner || issue?.reporter_name || '';

  return {
    code,
    rt,
    item,
    issue,
    applies,
    releasePointText: releasePoint?.release_date || '',
    title,
    summary,
    proposeDept,
    systemCodes: systems.map((sys) => sys.sys_code || sys.sys_name),
    systemNames: systems.map((sys) => sys.sys_name || sys.sys_code),
    systemOutDepts: unique(systems.map(systemOutDept)),
    mainOutputDept: unique((mainSystems.length ? mainSystems : systems).map(systemOutDept))[0] || '',
    releaseOwner: await personByName(rt?.owner),
    devOwner: await peopleByNames(devOwners),
    businessOwner: await personByName(businessOwner),
  };
}

async function buildReleaseControlTemplate(ctx) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await templatePath('变更控制表模板.xlsx'));
  const sheet = workbook.worksheets[0];
  const systemNameText = ctx.systemNames.join('、');
  for (let row = 4; row <= 15; row++) sheet.getCell(`C${row}`).value = systemNameText;
  return await workbook.xlsx.writeBuffer();
}

function formatChangeContents(applies) {
  const values = (applies || []).map((row) => row.change_content).filter(Boolean);
  if (values.length <= 1) return values[0] || '';
  return values.map((text, index) => `${index + 1}. ${text}`).join('\n');
}

async function uploadedControlTableAttachment(releaseTaskId) {
  if (!releaseTaskId) return null;
  const attachment = await get(
    `SELECT * FROM attachment
      WHERE entity_type = 'release'
        AND entity_id = ?
        AND field_key = ?
        AND kind = 'file'
      ORDER BY id DESC
      LIMIT 1`,
    releaseTaskId, '投产变更控制表',
  );
  if (!attachment?.stored_path) return null;
  const abs = path.join(config.attachmentDir, attachment.stored_path);
  try {
    const buffer = await fs.readFile(abs);
    return { buffer, filename: attachment.filename || '投产变更控制表.xlsx' };
  } catch {
    return null;
  }
}

async function buildReleasePlanTemplate(ctx) {
  const template = await fs.readFile(await templatePath('投产变更方案模版.docx'));
  const zip = await JSZip.loadAsync(template);
  const documentPath = 'word/document.xml';
  let xml = await zip.file(documentPath).async('string');

  xml = insertParagraphAfterText(xml, '云南农信投产变更方案', centeredBoldParagraph(ctx.code));
  xml = fillRightCellByLabel(xml, '需求提出单位', ctx.proposeDept);
  xml = fillRightCellByLabel(xml, '变更实施单位', ctx.mainOutputDept);
  xml = fillRightCellByLabel(xml, '变更单号', `${ctx.code}-${ctx.releasePointText || '投产点'}`);
  xml = fillRightCellByLabel(xml, '变更目的', ctx.title);
  xml = fillRightCellByLabel(xml, '需求描述', ctx.summary);
  xml = fillRightCellByLabel(xml, '变更内容', formatChangeContents(ctx.applies));
  xml = fillRightCellByLabel(xml, '系统编号', ctx.systemCodes.join('、'));
  xml = fillRightCellByLabel(xml, '系统名称', ctx.systemNames.join('、'));
  xml = fillRightCellByLabel(xml, '系统运维部门', ctx.systemOutDepts.join('、'));
  xml = fillRightCellByLabel(xml, '业务功能', ctx.title);
  xml = fillPersonRow(xml, '运维人员', ctx.releaseOwner);
  xml = fillPersonRow(xml, '开发人员', ctx.devOwner);
  xml = fillPersonRow(xml, '业务人员', ctx.businessOwner);

  const controlAttachment = await uploadedControlTableAttachment(ctx.rt?.id);
  if (controlAttachment) {
    const relsPath = 'word/_rels/document.xml.rels';
    const contentTypesPath = '[Content_Types].xml';
    let relsXml = await zip.file(relsPath).async('string');
    let contentTypesXml = await zip.file(contentTypesPath).async('string');
    const packageRelId = nextRelationshipId(relsXml);
    relsXml = addPackageRelationship(relsXml, packageRelId, `embeddings/release_control_${ctx.rt.id}.xlsx`);
    const imageRelId = nextRelationshipId(relsXml);
    const shapeId = `_x0000_i${Date.now()}`;
    const embeddedName = `release_control_${ctx.rt.id}.xlsx`;
    const iconName = 'excel-attachment-icon.png';
    zip.file(`word/embeddings/${embeddedName}`, controlAttachment.buffer);
    zip.file(`word/media/${iconName}`, await fs.readFile(await templatePath(iconName)));
    relsXml = addImageRelationship(relsXml, imageRelId, `media/${iconName}`);
    contentTypesXml = ensureDefaultContentType(contentTypesXml, 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    contentTypesXml = ensureDefaultContentType(contentTypesXml, 'png', 'image/png');
    zip.file(relsPath, relsXml);
    zip.file(contentTypesPath, contentTypesXml);
    xml = replaceParagraphByText(xml, '填写变更控制表。', attachmentObjectParagraph(packageRelId, imageRelId, shapeId, controlAttachment.filename));
  }

  zip.file(documentPath, xml);
  return await zip.generateAsync({ type: 'nodebuffer' });
}

function isNewer(a, b) {
  // SQLite/TDSQL 都以可比较的时间字符串保存 updated_at；空值按最旧处理。
  return String(a || '') > String(b || '');
}

async function cloneSignoffToTask(source, targetTaskId) {
  await run(
    `INSERT INTO release_signoff
       (release_task_id, role_id, role_name, signer_user_id, signer_name, result, conclusion, sign_time, signature_path, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    targetTaskId, source.role_id, source.role_name, source.signer_user_id, source.signer_name,
    source.result, source.conclusion, source.sign_time, source.signature_path, source.created_at, source.updated_at,
  );
}

async function cloneSystemToTask(source, targetTaskId) {
  await run(
    `INSERT INTO release_system
       (release_task_id, system_code, impl_org, actual_release_time, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    targetTaskId, source.system_code, source.impl_org, source.actual_release_time,
    source.status, source.created_at, source.updated_at,
  );
}

async function mergeReleaseTaskIntoTarget(source, target, operatorName) {
  // 合并主表：投产负责人、投产状态、评审状态等以更新时间较新的审批实例为准。
  if (isNewer(source.updated_at, target.updated_at)) {
    await run(
      `UPDATE release_task
          SET status=?, owner=?, registrar=?, register_time=?, review_status=?, updated_at=?
        WHERE id=?`,
      source.status, source.owner, source.registrar, source.register_time, source.review_status, source.updated_at, target.id,
    );
  }

  // 合并会签：按 role_id/role_name 匹配，同一角色以 updated_at 较新的签署内容为准。
  const targetSignoffs = await all('SELECT * FROM release_signoff WHERE release_task_id = ?', target.id);
  const targetKeyMap = new Map(targetSignoffs.map((s) => [`${s.role_id || ''}::${s.role_name || ''}`, s]));
  for (const sourceSignoff of await all('SELECT * FROM release_signoff WHERE release_task_id = ?', source.id)) {
    const key = `${sourceSignoff.role_id || ''}::${sourceSignoff.role_name || ''}`;
    const targetSignoff = targetKeyMap.get(key);
    if (!targetSignoff) {
      await cloneSignoffToTask(sourceSignoff, target.id);
    } else if (isNewer(sourceSignoff.updated_at, targetSignoff.updated_at)) {
      await run(
        `UPDATE release_signoff
            SET signer_user_id=?, signer_name=?, result=?, conclusion=?, sign_time=?, signature_path=?, updated_at=?
          WHERE id=?`,
        sourceSignoff.signer_user_id, sourceSignoff.signer_name, sourceSignoff.result, sourceSignoff.conclusion,
        sourceSignoff.sign_time, sourceSignoff.signature_path, sourceSignoff.updated_at, targetSignoff.id,
      );
    }
  }

  // 兼容旧的系统投产登记数据：同一系统以 updated_at 较新的状态为准。
  const targetSystems = await all('SELECT * FROM release_system WHERE release_task_id = ?', target.id);
  const targetSystemMap = new Map(targetSystems.map((s) => [s.system_code, s]));
  for (const sourceSystem of await all('SELECT * FROM release_system WHERE release_task_id = ?', source.id)) {
    const targetSystem = targetSystemMap.get(sourceSystem.system_code);
    if (!targetSystem) {
      await cloneSystemToTask(sourceSystem, target.id);
    } else if (isNewer(sourceSystem.updated_at, targetSystem.updated_at)) {
      await run(
        `UPDATE release_system
            SET impl_org=?, actual_release_time=?, status=?, updated_at=?
          WHERE id=?`,
        sourceSystem.impl_org, sourceSystem.actual_release_time, sourceSystem.status,
        sourceSystem.updated_at, targetSystem.id,
      );
    }
  }

  await run('DELETE FROM release_task WHERE id = ?', source.id);
  await auditUpdate('release', target.id, target.req_code, operatorName,
    { release_point_id: source.release_point_id, merged_task_id: source.id },
    { release_point_id: target.release_point_id, merged_task_id: target.id },
    { release_point_id: '申请投产点', merged_task_id: '投产审批合并' });
  return await get('SELECT * FROM release_task WHERE id = ?', target.id);
}

async function moveReleaseTaskPoint(code, fromPointId, toPointId, operatorName) {
  const source = await releaseTaskByCodePoint(code, fromPointId);
  if (!source) throw notFound('投产任务未发起');
  if (Number(source.release_point_id) === Number(toPointId)) return source;

  return await tx(async () => {
    // 从审批详情切换申请投产点时，同步移动引用当前工作项的投产申请，从而让关联制品自动进入新投产点。
    await run(
      `UPDATE release_apply
          SET release_point_id=?, updated_at=datetime('now','localtime')
        WHERE ${dialect.jsonArrayContains('ref_codes')}
          AND ${fromPointId === null ? 'release_point_id IS NULL' : 'release_point_id = ?'}`,
      ...(fromPointId === null ? [toPointId, code] : [toPointId, code, fromPointId]),
    );

    const target = await releaseTaskByCodePoint(code, toPointId);
    if (!target) {
      await run(
        `UPDATE release_task SET release_point_id=?, updated_at=datetime('now','localtime') WHERE id=?`,
        toPointId, source.id,
      );
      return await get('SELECT * FROM release_task WHERE id = ?', source.id);
    }
    return await mergeReleaseTaskIntoTarget(source, target, operatorName);
  });
}

/**
 * 计算投产审批清单：从投产申请的 ref_codes 展开为逐条需求/工单/问题，附投产任务/评审/会签进度。
 * @returns {Array} 完整行集合（未分页）
 */
async function computeEntities(windowIdList) {
  const defaultReleaseStatus = await defaultDictAttr('release_status', '待投产');
  const defaultReviewStatus = await defaultDictAttr('review_status', '待评审');
  let applies;
  if (windowIdList.length) {
    const ph = windowIdList.map(() => '?').join(',');
    applies = await all(`SELECT id, ref_codes, release_point_id, change_code, impl_org FROM release_apply WHERE release_point_id IN (${ph})`, ...windowIdList);
  } else {
    applies = await all('SELECT id, ref_codes, release_point_id, change_code, impl_org FROM release_apply');
  }

  const codeMap = new Map(); // `${code}::${releasePointId}` -> { code, applyPointId, implOrg, changeCode, changeCodes }
  for (const ap of applies) {
    const refs = parseJsonArray(ap.ref_codes);
    for (const code of refs) {
      if (!code) continue;
      const key = `${code}::${ap.release_point_id || ''}`;
      const cur = codeMap.get(key);
      if (!cur) {
        // 首次记录：同一工作项在不同申请投产点下是不同审批实例；同点多申请则聚合变更编号。
        codeMap.set(key, {
          code,
          applyPointId: ap.release_point_id,
          implOrg: ap.impl_org || null,
          changeCode: ap.change_code || '',
          changeCodes: ap.change_code ? [ap.change_code] : [],
        });
      } else {
        if (ap.change_code && !cur.changeCodes.includes(ap.change_code)) cur.changeCodes.push(ap.change_code);
        if (ap.change_code && (!cur.changeCode || String(ap.change_code) < String(cur.changeCode))) {
          // 实施机构取「申请编号最小」的投产申请
          cur.implOrg = ap.impl_org || null;
          cur.changeCode = ap.change_code;
        }
      }
    }
  }

  const rps = await all('SELECT id, release_date FROM release_point');
  const rpMap = {};
  for (const rp of rps) rpMap[rp.id] = rp.release_date;

  // 会签角色数：未发起的实体会签进度按 0/角色数 展示（与首次打开详情后惰性创建的会签项数一致）
  const signoffRoleCount = (await get('SELECT COUNT(*) AS c FROM role WHERE is_signoff_role = 1'))?.c || 0;

  const list = [];
  for (const info of codeMap.values()) {
    const code = info.code;
    const item = await getWorkItem(code);
    const issue = item ? null : await get('SELECT issue_code, summary, status FROM issue WHERE issue_code = ?', code);
    const type = item ? item.entity_type : (issue ? 'issue' : 'unknown');
    const title = item ? item.title : (issue ? issue.summary : '');
    const pointId = info.applyPointId;
    const releaseDate = rpMap[pointId] || null;

    const rt = await releaseTaskByCodePoint(code, pointId);
    const releaseAttaches = rt ? await all("SELECT * FROM attachment WHERE entity_type = 'release' AND entity_id = ?", rt.id) : [];
    // 未发起时按默认基线展示：投产/评审状态取字典默认值，会签进度=签0/角色数
    const summary = rt ? await signoffSummary(rt.id) : { total: signoffRoleCount, signed: 0, rejected: 0 };

    list.push({
      release_task_id: rt?.id || null,
      entity_type: type,
      code,
      change_codes: [...(info.changeCodes || [])].sort((a, b) => String(a).localeCompare(String(b))),
      title,
      impl_org: info.implOrg || null,
      release_point_id: pointId || null,
      release_date: releaseDate,
      release_status: rt?.status || defaultReleaseStatus,
      review_status: rt?.review_status || defaultReviewStatus,
      signoff: summary,
      initiated: !!rt,
      release_change_plan: formatAttachments(releaseAttaches, '投产变更方案'),
      release_change_control: formatAttachments(releaseAttaches, '投产变更控制表'),
    });
  }

  // 默认按申请投产点倒序、再按编号排序。
  list.sort((a, b) => {
    const da = a.release_date || '';
    const db = b.release_date || '';
    if (da !== db) return db.localeCompare(da);
    return String(b.code).localeCompare(String(a.code));
  });
  return list;
}

/** 内存筛选：编号(like) / 标题概述(like) / 申请投产点(in) / 投产状态(in) / 评审状态(in) / 实施机构(in) */
function applyFilters(rows, filters) {
  let out = rows;
  for (const f of (filters || [])) {
    if (!f || f.value === undefined || f.value === null || f.value === '') continue;
    if (f.field === 'code') {
      const kw = String(f.value).toLowerCase();
      out = out.filter((r) => String(r.code).toLowerCase().includes(kw));
    } else if (f.field === 'change_code') {
      const kw = String(f.value).toLowerCase();
      out = out.filter((r) => (r.change_codes || []).some((code) => String(code).toLowerCase().includes(kw)));
    } else if (f.field === 'content') {
      const kw = String(f.value).toLowerCase();
      out = out.filter((r) => String(r.title || '').toLowerCase().includes(kw));
    } else if (f.field === 'release_point_id') {
      const vals = (Array.isArray(f.value) ? f.value : [f.value]).map(Number);
      out = out.filter((r) => vals.includes(Number(r.release_point_id)));
    } else if (f.field === 'status') {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      out = out.filter((r) => vals.includes(r.release_status));
    } else if (f.field === 'review_status') {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      out = out.filter((r) => vals.includes(r.review_status));
    } else if (f.field === 'impl_org') {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      out = out.filter((r) => vals.includes(r.impl_org));
    }
  }
  return out;
}

export default async function releaseRoutes(fastify) {
  // 列表：投产申请所选需求/工单/问题逐条展开
  fastify.post('/release/list', { preHandler: fastify.requirePerm('release', 'view') }, async (request) => {
    const body = request.body || {};
    const all0 = await computeEntities(windowIds(body));
    const filtered = applyFilters(all0, body.filters);

    const page = Number(body.page) || 1;
    const pageSize = Number(body.pageSize) || 10;
    const start = (page - 1) * pageSize;
    const list = pageSize > 0 ? filtered.slice(start, start + pageSize) : filtered;
    return ok({ list, total: filtered.length, page, pageSize });
  });

  // 详情：首次打开惰性创建投产任务；返回实体信息（需求/工单或问题）+ 会签 + 关联制品
  fastify.get('/release/:code', { preHandler: fastify.requirePerm('release', 'view') }, async (request) => {
    const code = request.params.code;
    const releasePointId = await resolveReleasePointId(code, request.query?.releasePointId);
    const entityType = await classifyEntity(code);
    const rt = await ensureReleaseTask(code, entityType, releasePointId);
    const signoffs = await signoffsWithRoleConfig(rt.id);

    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;
    const artifacts = await entityArtifacts(code, releasePointId, sysMap);
    const releaseApplicant = await releaseApplicantFor(code, releasePointId, entityType);

    const rps = await all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    let entity = { type: entityType, code };
    let taskStatuses = null;

    if (entityType === 'requirement' || entityType === 'ticket') {
      const req = await getWorkItem(code);
      entity = {
        type: entityType, code,
        title: req?.title || code,
        summary: req?.summary || '',
        status: req?.status || null,
        yn_owner: req?.yn_owner || null,
        jk_owner: req?.jk_owner || null,
        plan_release_date: rpMap[req?.release_point_id] || null,
        release_date: rpMap[req?.release_point_id] || null,
        apply_release_point_id: releasePointId,
        apply_release_date: rpMap[releasePointId] || null,
      };
      // 阶段任务：返回任务标识(id/编号/系统/状态)，供详情页点击状态标签直达对应任务弹窗
      const tt = async (type) => all('SELECT id, task_code, impl_system, status FROM test_task WHERE req_code = ? AND test_type = ? ORDER BY id', code, type);
      taskStatuses = {
        dev: await all('SELECT id, task_code, impl_system, status FROM dev_task WHERE req_code = ? ORDER BY id', code),
        sit: await tt('SIT'),
        uat: await tt('UAT'),
        nft: await tt('NFT'),
        sec: await tt('SEC'),
      };
    } else if (entityType === 'issue') {
      const issue = await get('SELECT * FROM issue WHERE issue_code = ?', code);
      entity = {
        type: 'issue', code,
        summary: issue?.summary || '',
        details: issue?.details || '',
        status: issue?.status || null,
        release_date: rpMap[releasePointId] || null,
        apply_release_point_id: releasePointId,
        apply_release_date: rpMap[releasePointId] || null,
      };
    }

    return ok({ entityType, entity, releaseTask: rt, releaseApplicant, signoffs, artifacts, taskStatuses });
  });

  // 阶段附件模板下载：按当前投产审批实例预填业务信息
  fastify.get('/release/:code/attachment-template', { preHandler: fastify.requirePerm('release', 'view') }, async (request, reply) => {
    const code = request.params.code;
    const fieldKey = String(request.query?.fieldKey || '').trim();
    if (!['投产变更方案', '投产变更控制表'].includes(fieldKey)) throw badRequest('不支持的模板类型');

    const releasePointId = await resolveReleasePointId(code, request.query?.releasePointId);
    const entityType = await classifyEntity(code);
    const rt = await ensureReleaseTask(code, entityType, releasePointId);
    const ctx = await releaseTemplateContext(code, releasePointId, entityType, rt);
    const isControl = fieldKey === '投产变更控制表';
    const filename = isControl
      ? `变更控制表-${filenameSafe(code)}.xlsx`
      : `投产变更方案-${filenameSafe(code)}.docx`;
    const buf = isControl ? await buildReleaseControlTemplate(ctx) : await buildReleasePlanTemplate(ctx);

    reply.header('Content-Type', isControl
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return reply.send(Buffer.from(buf));
  });

  // 更新投产任务负责人/投产状态/评审状态
  fastify.put('/release/:code', { preHandler: fastify.requirePerm('release', 'edit') }, async (request) => {
    const releasePointId = await resolveReleasePointId(request.params.code, request.query?.releasePointId ?? request.body?.releasePointId);
    let rt = await releaseTaskByCodePoint(request.params.code, releasePointId);
    if (!rt) throw notFound('投产任务未发起');
    const { owner, status, review_status, release_point_id } = request.body || {};

    if (review_status !== undefined) {
      const valid = await get('SELECT 1 FROM dict_item WHERE category = ? AND attr_value = ?', 'review_status', review_status);
      if (!valid) throw badRequest('评审状态取值非法');
    }

    if (release_point_id !== undefined) {
      const nextPointId = numberOrNull(release_point_id);
      if (nextPointId === null) throw badRequest('申请投产点不能为空');
      const moved = await moveReleaseTaskPoint(request.params.code, releasePointId, nextPointId, request.currentUser?.name);
      return ok({ id: moved.id, release_point_id: moved.release_point_id });
    }

    const updateData = {};
    if (owner !== undefined) updateData.owner = owner;
    if (status !== undefined) updateData.status = status;
    if (review_status !== undefined) updateData.review_status = review_status;

    const keys = Object.keys(updateData);
    if (keys.length > 0) {
      const merged = { ...rt, ...updateData };
      await validateRequiredFields('release', statusTypeForReleaseStatus(merged.status), merged);
      await run(
        `UPDATE release_task SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
        ...keys.map((k) => updateData[k]), rt.id,
      );
      const labels = { owner: '投产负责人', status: '投产状态', review_status: '评审状态' };
      await auditUpdate('release', rt.id, rt.req_code, request.currentUser?.name, rt, updateData, labels);
    }
    return ok({ id: rt.id });
  });

  // 会签签署
  fastify.post('/release/signoff/:id', { preHandler: fastify.requirePerm('release', 'release.signoff') }, async (request) => {
    const id = request.params.id;
    const so = await get('SELECT * FROM release_signoff WHERE id = ?', id);
    if (!so) throw notFound('会签项不存在');
    const { result, conclusion, signatureId } = request.body || {};
    if (!['已签署', '已驳回', '未签署', '不涉及'].includes(result)) throw badRequest('签署状态非法');
    const adminUser = await isAdminUser(request.currentUser);
    if (result === '不涉及' && !adminUser) throw forbidden('仅管理员可将会签项设置为不涉及');
    if (so.result === '不涉及' && result !== '不涉及' && !adminUser) throw forbidden('仅管理员可调整不涉及的会签项');
    if (result !== '不涉及' && !request.currentUser.is_super && so.role_id) {
      const hasRole = await get('SELECT 1 FROM user_role WHERE user_id = ? AND role_id = ?', request.currentUser.id, so.role_id);
      if (!hasRole) throw forbidden(`仅【${so.role_name}】角色可签署该项`);
    }
    // 签名：传入 signatureId 时校验归属当前用户并记录其路径；未传则沿用原签名
    let signaturePath = result === '不涉及' ? null : (so.signature_path || null);
    if (result !== '不涉及' && signatureId) {
      const sig = await get('SELECT * FROM user_signature WHERE id = ?', signatureId);
      if (!sig || sig.user_id !== request.currentUser.id) throw badRequest('签名无效');
      signaturePath = sig.stored_path;
    }
    await run(
      `UPDATE release_signoff SET result=?, conclusion=?, signature_path=?, signer_user_id=?, signer_name=?, sign_time=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?`,
      result, conclusion || (result === '不涉及' ? '不涉及' : null), signaturePath, request.currentUser?.id, request.currentUser?.name, id,
    );
    await auditUpdate('release', so.release_task_id, so.role_name, request.currentUser?.name,
      { result: so.result, conclusion: so.conclusion },
      { result, conclusion: conclusion || (result === '不涉及' ? '不涉及' : null) },
      {
        result: `会签-${so.role_name}-签署状态`,
        conclusion: `会签-${so.role_name}-签署意见`,
      });

    const beforeReview = (await get('SELECT review_status FROM release_task WHERE id = ?', so.release_task_id))?.review_status;
    const afterReview = await recomputeReviewStatus(so.release_task_id);
    if (beforeReview !== afterReview) {
      const rt = await get('SELECT req_code FROM release_task WHERE id = ?', so.release_task_id);
      await auditUpdate('release', so.release_task_id, rt?.req_code, request.currentUser?.name,
        { v: beforeReview }, { v: afterReview }, { v: '评审状态' });
    }
    return ok(null, '签署完成');
  });

  // 导出 Word 详情（单条审批对象的完整信息）
  fastify.get('/release/export-word/:code', { preHandler: fastify.requirePerm('release', 'view') }, async (request, reply) => {
    const code = request.params.code;
    const releasePointId = await resolveReleasePointId(code, request.query?.releasePointId);
    const entityType = await classifyEntity(code);
    const rt = await ensureReleaseTask(code, entityType, releasePointId);
    const signoffs = await signoffsWithRoleConfig(rt.id);

    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;
    const artifacts = await entityArtifacts(code, releasePointId, sysMap);

    const rps = await all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    let entity = { type: entityType, code };
    let devTasksFull = [];
    let testTasksFull = [];
    let analysisData = {};

    if (entityType === 'requirement' || entityType === 'ticket') {
      const req = await getWorkItem(code);
      entity = {
        type: entityType, code,
        title: req?.title || code,
        summary: req?.summary || '',
        status: req?.status || null,
        yn_owner: req?.yn_owner || null,
        jk_owner: req?.jk_owner || null,
        plan_release_date: rpMap[req?.release_point_id] || null,
        release_date: rpMap[req?.release_point_id] || null,
        apply_release_point_id: releasePointId,
        apply_release_date: rpMap[releasePointId] || null,
      };
      devTasksFull = await all(
        'SELECT id, task_code, task_name, content, owner, status, impl_system FROM dev_task WHERE req_code = ? ORDER BY id',
        code,
      );
      testTasksFull = await all(
        'SELECT id, task_code, task_name, test_type, owner, status, impl_system FROM test_task WHERE req_code = ? ORDER BY id',
        code,
      );
      const impactItems = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', code);
      const coverages = await all('SELECT * FROM coverage_item WHERE req_code = ?', code);
      const coverageMap = new Map(coverages.map((coverage) => [coverage.change_item_id, coverage]));
      analysisData = {
        impactItems,
        coverageMap,
      };
    } else if (entityType === 'issue') {
      const issue = await get('SELECT * FROM issue WHERE issue_code = ?', code);
      entity = {
        type: 'issue', code,
        summary: issue?.summary || '',
        details: issue?.details || '',
        status: issue?.status || null,
        release_date: rpMap[releasePointId] || null,
        apply_release_point_id: releasePointId,
        apply_release_date: rpMap[releasePointId] || null,
      };
    }

    const detail = { entityType, entity, releaseTask: rt, signoffs, artifacts };
    const buf = await buildReleaseWordDoc(detail, devTasksFull, testTasksFull, analysisData);

    const filename = `版本发布评审单_${code}.docx`;
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return reply.send(buf);
  });

  // 导出
  fastify.post('/release/export', { preHandler: fastify.requirePerm('release', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const rows = applyFilters(await computeEntities(windowIds(body)), body.filters);

    const cols = [
      { key: 'impl_org', title: '实施机构' },
      { key: 'change_codes_text', title: '变更编号' },
      { key: 'code', title: '需求/问题/工单编号' },
      { key: 'entity_label', title: '类型' },
      { key: 'title', title: '需求标题/工单概述/问题概述' },
      { key: 'release_date', title: '申请投产点' },
      { key: 'release_status', title: '投产状态' },
      { key: 'review_status', title: '评审状态' },
      { key: 'signoff_progress', title: '会签进度' },
      { key: 'release_change_plan', title: '投产变更方案' },
      { key: 'release_change_control', title: '投产变更控制表' },
    ];

    const mapped = rows.map((r) => ({
      impl_org: r.impl_org || '',
      change_codes_text: (r.change_codes || []).join('\n'),
      code: r.code,
      entity_label: r.entity_type === 'requirement' ? '需求' : (r.entity_type === 'ticket' ? '工单' : (r.entity_type === 'issue' ? '问题' : '其他')),
      title: r.title,
      release_date: r.release_date || '',
      release_status: r.release_status,
      review_status: r.review_status || '',
      signoff_progress: r.signoff.total ? `签 ${r.signoff.signed} 驳 ${r.signoff.rejected} / ${r.signoff.total}` : '未发起',
      release_change_plan: r.release_change_plan || '',
      release_change_control: r.release_change_control || '',
    }));

    const buf = await exportXlsx(cols, mapped, '投产审批清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=release_approval.xlsx');
    return reply.send(buf);
  });
}
