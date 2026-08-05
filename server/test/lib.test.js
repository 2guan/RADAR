/**
 * 文件：server/test/lib.test.js
 * 说明：遵循项目研发规约；跨模块能力仅可经公开契约访问。
 * 用途：核心纯函数库单元测试（密码哈希、排期偏差率）。不依赖数据库与网络，快速回归。
 * 作者：hengguan
 * 运行：cd server && npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, validatePasswordComplexity } from '../src/platform/auth/index.js';
import { config, DEFAULT_DELIVERABLE_UPLOAD_EXTENSIONS } from '../src/platform/runtime/config.js';
import { exportXlsx } from '../src/platform/import-export/index.js';
import { calcDeviation, formatCoverageText, formatImpactItemsText } from '../src/modules/development/index.js';
import { buildReleaseWordDoc, formatWordDateTime } from '../src/modules/release/index.js';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  normalizeRequiredFieldConfig, REQUIRED_FIELD_CONFIG_MODULES, REQUIRED_FIELD_MODULES,
} from '../src/modules/settings/process-configuration/index.js';
import { WORK_ITEM_TYPES, isWorkItemType } from '../src/shared/contracts/work-item.js';
import { REQUIREMENT_WORK_ITEM_TYPE } from '../src/modules/requirements/contracts/work-item.js';
import { TICKET_WORK_ITEM_TYPE } from '../src/modules/tickets/contracts/work-item.js';
import { workItemCodesInReleasePoints } from '../src/modules/development/index.js';
import {
  codePrefix, codeTemplateValues, formatCode, templateUsesReleaseWindow,
} from '../src/shared/utils/code-template.js';
import { validateCodeRuleTemplate } from '../src/modules/settings/reference-data/index.js';
import { MOCK_ISSUE_SNAPSHOT } from '../scripts/mock-data.js';
import { checkExt, isPreviewableAttachment, previewAllowedExtensions } from '../src/platform/attachments/index.js';
import {
  beijingCompactDateString, beijingDateString, beijingDateTimeString, isValidDateOnly,
} from '../src/shared/utils/time.js';
import { isDue as isIssueSyncScheduleDue } from '../src/modules/issues/application/issue-sync-scheduler.js';
import { parseImportedDeliveryUnits } from '../src/modules/release/applications/release-apply/routes.js';
import { normalizeDefaultTheme } from '../src/modules/identity-access/api/roles-routes.js';

test('运行时路径：平台配置从仓库根目录解析静态资源与持久化默认目录', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const resolveFromProjectRoot = (value, fallback) => {
    const target = value || fallback;
    return path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
  };
  assert.equal(config.REPO_ROOT, projectRoot);
  assert.equal(config.webDist, resolveFromProjectRoot(process.env.WEB_DIST, 'web/dist'));
  assert.equal(config.dbFile, resolveFromProjectRoot(process.env.DB_FILE, 'data/radar.db'));
  assert.equal(config.attachmentDir, resolveFromProjectRoot(process.env.ATTACHMENT_DIR, 'attachments'));
  assert.equal(process.env.TZ, 'Asia/Shanghai');
});

test('交付件文件类型：默认 kkFileView 清单可由环境配置覆盖并同步预览', () => {
  const allowed = [
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff',
    '.pdf', '.ofd', '.txt', '.html', '.htm', '.xml', '.json', '.properties', '.md', '.log', '.py', '.sql', '.zip', '.rar',
  ];
  assert.deepEqual(DEFAULT_DELIVERABLE_UPLOAD_EXTENSIONS, allowed);
  assert.deepEqual(previewAllowedExtensions(), config.upload.allowedExt);
  for (const ext of config.upload.allowedExt) {
    assert.equal(checkExt(`交付件${ext.toUpperCase()}`), ext);
    assert.equal(isPreviewableAttachment({ kind: 'file', filename: `交付件${ext}` }), true);
  }
  for (const ext of ['.7z', '.csv', '.bmp', '.svg', '.exe'].filter((item) => !config.upload.allowedExt.includes(item))) {
    assert.throws(() => checkExt(`不允许${ext}`), /不支持的文件类型/);
    assert.equal(isPreviewableAttachment({ kind: 'file', filename: `不允许${ext}` }), false);
  }
  assert.throws(() => checkExt('无后缀'), /不支持的文件类型/);
});

test('工作项公共契约：需求和工单保持独立且类型受控', () => {
  assert.deepEqual(WORK_ITEM_TYPES, ['requirement', 'ticket']);
  assert.equal(REQUIREMENT_WORK_ITEM_TYPE, 'requirement');
  assert.equal(TICKET_WORK_ITEM_TYPE, 'ticket');
  assert.equal(isWorkItemType('requirement'), true);
  assert.equal(isWorkItemType('ticket'), true);
  assert.equal(isWorkItemType('release'), false);
});

test('工作项投产点筛选：空集合代表全部投产点，不追加空编号条件', async () => {
  assert.equal(await workItemCodesInReleasePoints([]), null);
});

test('编号模板：需求/工单编号为标准占位符，并兼容历史需求编号占位符', () => {
  const values = { '需求/工单编号': 'TK_20260630_003' };
  assert.equal(codePrefix('RW_{需求/工单编号}_{序号}', values), 'RW_TK_20260630_003_');
  assert.equal(formatCode('RW_{需求/工单编号}_{序号}', values, 1), 'RW_TK_20260630_003_001');
  assert.equal(formatCode('RW_{需求编号}_{序号}', values, 2), 'RW_TK_20260630_003_002');
});

test('编号模板：公共占位符提供投产点、当前日期与关联工作项编号', () => {
  const values = codeTemplateValues({
    releaseWindow: '20261231', workItemCode: 'REQ_001', now: new Date(2026, 6, 29),
  });
  assert.equal(formatCode(
    '{投产点}_{当前年月}_{当前年月日}_{需求/工单编号}_{序号[2]}', values, 7,
  ), '20261231_202607_20260729_REQ_001_07');
  assert.equal(formatCode('RC_{投产点}_{序号[4]}', values, 7), 'RC_20261231_0007');
  assert.equal(codePrefix('RC_{投产点}_{序号[4]}', values), 'RC_20261231_');
  assert.equal(formatCode('RC_{投产窗口}_{序号}', values, 7), 'RC_20261231_007');
  assert.equal(templateUsesReleaseWindow('{投产点}_{序号[3]}'), true);
  assert.equal(templateUsesReleaseWindow('{投产窗口}_{序号}'), true);
  assert.equal(templateUsesReleaseWindow('{当前年月}_{序号}'), false);
  assert.match(validateCodeRuleTemplate('code.requirement', '{需求/工单编号}_{序号}'), /不能使用/);
  assert.match(validateCodeRuleTemplate('code.dev', '{序号[0]}'), /位数/);
  assert.equal(validateCodeRuleTemplate('code.dev', '{需求/工单编号}_{序号}'), null);
});

test('北京时间工具：瞬时时间、业务日期和无时区日期时间采用不同且稳定的语义', () => {
  const instant = new Date('2026-05-24T16:25:59.000Z');
  assert.equal(beijingDateString(instant), '2026-05-25');
  assert.equal(beijingCompactDateString(instant), '20260525');
  assert.equal(beijingDateTimeString(instant), '2026-05-25 00:25:59');
  assert.equal(isValidDateOnly('2026-02-29'), false);
  assert.equal(isValidDateOnly('2028-02-29'), true);
});

test('问题每日同步：按北京时间日期与 HH:mm 判断，跨日后只触发一次', () => {
  const schedule = { enabled: true, mode: 'daily', dailyTime: '00:20', interval: 1 };
  const now = new Date('2026-05-24T16:25:00.000Z'); // 北京时间 2026-5-25 00:25
  assert.equal(isIssueSyncScheduleDue({ ...schedule, lastRunAt: '' }, now), true);
  assert.equal(isIssueSyncScheduleDue({ ...schedule, lastRunAt: '2026-05-24T16:21:00.000Z' }, now), false);
  assert.equal(isIssueSyncScheduleDue({ ...schedule, lastRunAt: '2026-05-23T16:21:00.000Z' }, now), true);
});

test('密码哈希：正确密码校验通过、错误密码失败', () => {
  const h = hashPassword('admin2026');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(verifyPassword('admin2026', h), true);
  assert.equal(verifyPassword('wrong', h), false);
  assert.equal(verifyPassword('admin2026', 'badformat'), false);
});

test('排期偏差率：延期为正、提前为负、信息不全为 null', () => {
  // 计划 10 天，实际结束晚 5 天 -> 50%
  assert.equal(calcDeviation('2026-07-01', '2026-07-10', '2026-07-15'), 56);
  // 提前结束 -> 负值
  assert.ok(calcDeviation('2026-07-01', '2026-07-10', '2026-07-05') < 0);
  // 缺少实际结束 -> null
  assert.equal(calcDeviation('2026-07-01', '2026-07-10', null), null);
});

test('投产申请 Excel：一个单元格按换行导入多组交付制品，并兼容历史四列和当前五列', () => {
  assert.deepEqual(parseImportedDeliveryUnits({
    delivery_units: '镜像制品 / 包A / v1.0.0 / 未摆渡\n二进制制品 / 包B / v1.0.1 / 已摆渡',
  }), [
    { artifact_type: '镜像制品', delivery_unit: '包A', new_version: 'v1.0.0', ferry_status: '未摆渡', artifact_release_status: null },
    { artifact_type: '二进制制品', delivery_unit: '包B', new_version: 'v1.0.1', ferry_status: '已摆渡', artifact_release_status: null },
  ]);
  assert.deepEqual(parseImportedDeliveryUnits({
    artifact_type: '镜像制品', delivery_unit: '包A', new_version: 'v1.0.0', ferry_status: '未摆渡',
  }), [{ artifact_type: '镜像制品', delivery_unit: '包A', new_version: 'v1.0.0', ferry_status: '未摆渡', artifact_release_status: null }]);
  assert.deepEqual(parseImportedDeliveryUnits({
    delivery_units: '镜像制品 / 包C / v2.0.0 / 已摆渡 / 已投产',
  }), [{ artifact_type: '镜像制品', delivery_unit: '包C', new_version: 'v2.0.0', ferry_status: '已摆渡', artifact_release_status: '已投产' }]);
  assert.throws(() => parseImportedDeliveryUnits({ delivery_units: '镜像制品 / 包A' }), /第 1 行/);
});

test('角色 Excel：默认主题导出展示值，导入兼容展示值和稳定键', () => {
  assert.equal(normalizeDefaultTheme('蔚蓝'), 'sky');
  assert.equal(normalizeDefaultTheme('滇红'), 'teal');
  assert.equal(normalizeDefaultTheme('sky'), 'sky');
  assert.throws(() => normalizeDefaultTheme('未知主题'), /默认主题/);
});

test('投产评审 Word 日期时间格式：使用北京时间且时间补零到分钟', () => {
  assert.equal(formatWordDateTime('2026-05-05 08:15:00'), '2026-5-5 08:15');
  assert.equal(formatWordDateTime('2026-05-05T08:15:30.000Z'), '2026-5-5 16:15');
  assert.equal(formatWordDateTime(new Date('2026-05-05T00:15:00.000Z')), '2026-5-5 08:15');
  assert.equal(formatWordDateTime(null), '—');
});

test('投产评审 Word：包含影响性分析与测试覆盖分析章节时可正常生成', async () => {
  const buffer = await buildReleaseWordDoc({
    entityType: 'requirement',
    entity: { code: 'RQ_001', title: '测试需求', summary: '需求说明' },
    releaseTask: {},
    signoffs: [],
    artifacts: [],
  }, [], [], {
    impactItems: [{
      id: 1,
      category: '前端P2',
      system: '渠道系统',
      change_kind: '新增',
      change_content: '新增查询页面',
      detail: JSON.stringify({ artifact: 'query.vue', impact_analysis: '影响账户查询流程', involve_other: '否' }),
    }],
    coverageMap: new Map([[1, { strategy: '覆盖正常查询场景', case_no: 'SIT-001', tester: '张三', result: '已覆盖' }]]),
  });

  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 1000);
});

test('投产评审 Word：按 A4 正文宽度固定所有表格列宽', async () => {
  const buffer = await buildReleaseWordDoc({
    entityType: 'requirement',
    entity: { code: 'RQ_001', title: '测试需求', summary: '需求说明' },
    releaseTask: {},
    signoffs: [{ role_name: '项目经理', result: '同意', sign_time: '2026-05-05 08:15:00' }],
    artifacts: [{
      change_code: 'CHG_001',
      units: [{ artifact_type: '应用包', new_version: '1.0.0', delivery_unit: 'radar.jar' }],
    }],
  }, [], [], {
    impactItems: [{ id: 1, category: '前端P2', detail: '{}' }],
    coverageMap: new Map(),
  });

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml').async('string');

  assert.match(documentXml, /<w:pgSz\b[^>]*w:w="11906"[^>]*w:h="16838"[^>]*\/>/);
  assert.match(documentXml, /<w:t xml:space="preserve">RQ_001<\/w:t>/);
  assert.doesNotMatch(documentXml, /RQ_001  测试需求/);
  assert.equal((documentXml.match(/<w:tblLayout w:type="fixed"\/>/g) || []).length, 7);
  assert.equal((documentXml.match(/<w:tblW w:type="dxa" w:w="8450"\/>/g) || []).length, 7);
  assert.match(documentXml, /<w:tblGrid><w:gridCol w:w="1650"\/><w:gridCol w:w="2575"\/><w:gridCol w:w="1650"\/><w:gridCol w:w="2575"\/><\/w:tblGrid>/);
  assert.match(documentXml, /<w:tblGrid><w:gridCol w:w="1350"\/><w:gridCol w:w="1050"\/><w:gridCol w:w="1300"\/><w:gridCol w:w="2100"\/><w:gridCol w:w="2650"\/><\/w:tblGrid>/);
});

test('影响性分析导出：一个单元格内输出全部适用字段', () => {
  const text = formatImpactItemsText([{
    id: 1,
    category: '联机接口/功能',
    system: '核心系统',
    change_kind: '修改',
    change_content: '调整支付接口参数校验逻辑',
    detail: JSON.stringify({
      artifact: 'PaymentService.java',
      impact_analysis: '影响支付交易入参校验，需要回归支付链路',
      involve_other: '是',
      involve_other_systems: ['网关系统', '渠道系统'],
    }),
  }]);

  assert.match(text, /变更分类：联机接口\/功能/);
  assert.match(text, /系统名称：核心系统/);
  assert.match(text, /对应制品\/脚本：PaymentService\.java/);
  assert.match(text, /影响系统：网关系统、渠道系统/);
});

test('测试覆盖分析导出：一个单元格内输出分类、系统与完整覆盖内容', () => {
  const text = formatCoverageText([{
    id: 1,
    category: '前端P2',
    system: '渠道系统',
    change_kind: '新增',
    change_content: '新增账户查询页面',
    detail: '{}',
  }], new Map([[1, {
    strategy: '覆盖正常查询、无数据及权限不足场景',
    case_no: 'SIT-001, SIT-002',
    tester: '张三',
    result: '已覆盖',
  }]]));

  assert.match(text, /影响性分析分类：前端P2/);
  assert.match(text, /系统名称：渠道系统/);
  assert.match(text, /变更内容：新增账户查询页面/);
  assert.match(text, /案例覆盖策略简述：覆盖正常查询、无数据及权限不足场景/);
  assert.match(text, /测试案例编号：SIT-001, SIT-002/);
  assert.match(text, /测试人员：张三/);
  assert.match(text, /测试覆盖检查结果：已覆盖/);
});

test('Excel 导出：分析内容在单个单元格内换行显示', async () => {
  const buffer = await exportXlsx(
    [{ key: 'analysis', title: '分析内容', width: 60, wrapText: true }],
    [{ analysis: '第一条内容\n第二条内容' }],
    '导出测试',
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const cell = workbook.worksheets[0].getCell('A2');

  assert.equal(cell.value, '第一条内容\n第二条内容');
  assert.equal(cell.alignment.wrapText, true);
});

test('Excel 导出：日期和时间列统一为可读格式且不误改编号', async () => {
  const buffer = await exportXlsx([
    { key: 'code', title: '编号' },
    { key: 'date', title: '日期', valueType: 'date' },
    { key: 'datetime', title: '时间', valueType: 'datetime' },
  ], [{ code: '20260505', date: '20260505', datetime: '2026-05-05 18:46:12' }], '格式测试');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const row = workbook.worksheets[0].getRow(2);
  assert.equal(row.getCell(1).value, '20260505');
  assert.equal(row.getCell(2).value, '2026-05-05');
  assert.equal(row.getCell(3).value, '2026-05-05 18:46');
});

test('检查内容设置：支持影响性分析与测试覆盖性分析', () => {
  const dev = REQUIRED_FIELD_MODULES.find((module) => module.key === 'dev');
  const testModule = REQUIRED_FIELD_MODULES.find((module) => module.key === 'test');
  const sitModule = REQUIRED_FIELD_CONFIG_MODULES.find((module) => module.key === 'test.SIT');
  const uatModule = REQUIRED_FIELD_CONFIG_MODULES.find((module) => module.key === 'test.UAT');
  const nftModule = REQUIRED_FIELD_CONFIG_MODULES.find((module) => module.key === 'test.NFT');
  const secModule = REQUIRED_FIELD_CONFIG_MODULES.find((module) => module.key === 'test.SEC');
  assert.ok(dev.fields.some((field) => field.key === 'impact_analysis'));
  assert.ok(dev.attachmentFields.includes('编码检查表'));
  assert.ok(dev.attachmentFields.includes('技术方案确认单'));
  assert.ok(!dev.attachmentFields.includes('影响性分析文档'));
  assert.ok(testModule.fields.some((field) => field.key === 'coverage_analysis'));
  assert.ok(!testModule.attachmentFields.includes('测试覆盖设计文档'));
  assert.ok(sitModule.fields.some((field) => field.key === 'coverage_analysis'));
  assert.ok(!uatModule.fields.some((field) => field.key === 'coverage_analysis'));
  assert.ok(!nftModule.fields.some((field) => field.key === 'coverage_analysis'));
  assert.ok(!secModule.fields.some((field) => field.key === 'coverage_analysis'));

  const config = normalizeRequiredFieldConfig({
    dev: {
      impact_analysis: { final: true },
      'attachment:编码检查表': { final: true, mode: { final: 'path' } },
    },
    test: { coverage_analysis: { final: true } },
  });
  assert.equal(config.dev.impact_analysis.required.final, true);
  assert.equal(config.dev['attachment:编码检查表'].required.final, true);
  assert.equal(config.dev['attachment:编码检查表'].mode.final, 'path');
  assert.equal(config['test.SIT'].coverage_analysis.required.final, true);
  assert.equal(config['test.UAT'].coverage_analysis, undefined);
  assert.equal(config['test.NFT'].coverage_analysis, undefined);
  assert.equal(config['test.SEC'].coverage_analysis, undefined);
});

test('检查内容设置：不显示时自动取消必填，测试管理按类型拆分', () => {
  const config = normalizeRequiredFieldConfig({
    'test.SIT': {
      owner: {
        visible: false,
        required: { initial: false, inProgress: false, final: true },
      },
    },
    'test.UAT': {
      owner: {
        visible: { initial: true, inProgress: true, final: true },
        required: { initial: false, inProgress: false, final: true },
      },
    },
  });

  assert.equal(config['test.SIT'].owner.visible.initial, false);
  assert.equal(config['test.SIT'].owner.visible.inProgress, false);
  assert.equal(config['test.SIT'].owner.visible.final, false);
  assert.equal(config['test.SIT'].owner.required.final, false);
  assert.equal(config['test.UAT'].owner.visible.final, true);
  assert.equal(config['test.UAT'].owner.required.final, true);
});

test('检查内容设置：支持投产审批负责人和投产变更文档', () => {
  const release = REQUIRED_FIELD_MODULES.find((module) => module.key === 'release');
  assert.ok(release.fields.some((field) => field.key === 'owner'));
  assert.deepEqual(release.attachmentFields, ['投产变更方案', '投产变更控制表']);

  const config = normalizeRequiredFieldConfig({
    release: {
      owner: { visible: true, required: { initial: false, inProgress: true, final: true } },
      'attachment:投产变更方案': {
        visible: true,
        required: { initial: false, inProgress: false, final: true },
        mode: { initial: 'path', inProgress: 'file', final: 'both' },
      },
    },
  });

  assert.equal(config.release.owner.required.inProgress, true);
  assert.equal(config.release['attachment:投产变更方案'].required.final, true);
  assert.equal(config.release['attachment:投产变更方案'].mode.initial, 'path');
  assert.equal(config.release['attachment:投产变更方案'].mode.inProgress, 'file');
  assert.equal(config.release['attachment:投产变更方案'].mode.final, 'both');
});

test('静态 mock 问题快照：数量、状态、脱敏和处理方式保持稳定', () => {
  assert.equal(MOCK_ISSUE_SNAPSHOT.length, 20);
  assert.equal(new Set(MOCK_ISSUE_SNAPSHOT.map((issue) => issue.code)).size, 20);
  assert.ok(MOCK_ISSUE_SNAPSHOT.every((issue) => issue.status === '待验证'));
  assert.ok(MOCK_ISSUE_SNAPSHOT.every((issue) => issue.code && issue.summary && issue.details));
  assert.ok(MOCK_ISSUE_SNAPSHOT.every((issue) => issue.summary.length === 7 && issue.summary.endsWith('**')));
  assert.ok(MOCK_ISSUE_SNAPSHOT.every((issue) => issue.details.length === 12 && issue.details.endsWith('**')));
  assert.ok(MOCK_ISSUE_SNAPSHOT.every((issue) => issue.handling_method === '换版'));
});

import { overviewCardLabels, reqOrg } from '../src/modules/overview/api/routes.js';

test('reqOrg 实施机构分组逻辑：第一优先级为需求工单填写的实施机构', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify(['SYS001', 'SYS002']),
    implementation_org: '需求填写实施机构',
    propose_dept: '提出部门A'
  };
  const sysMap = {
    SYS001: { name: '系统1', org: '系统机构1' },
    SYS002: { name: '系统2', org: '系统机构2' }
  };
  // 开发任务实施方不参与版本概览分组，必须以工作项填写值为准。
  assert.equal(reqOrg(req, sysMap), '需求填写实施机构');
});

test('reqOrg 实施机构分组逻辑：工作项未填写时回退主责系统机构', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify(['SYS001', 'SYS002']),
    propose_dept: '提出部门A'
  };
  const sysMap = {
    SYS001: { name: '系统1', org: '系统机构1' },
    SYS002: { name: '系统2', org: '系统机构2' }
  };
  assert.equal(reqOrg(req, sysMap), '系统机构1');
});

test('reqOrg 实施机构分组逻辑：第二优先级（第一个主责系统对应的所属机构）', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify(['SYS001', 'SYS002']),
    propose_dept: '提出部门A'
  };
  const sysMap = {
    SYS001: { name: '系统1', org: '系统机构1' },
    SYS002: { name: '系统2', org: '系统机构2' }
  };
  // 应该回退到系统的第一个主责系统（SYS001）对应的机构
  assert.equal(reqOrg(req, sysMap), '系统机构1');
});

test('reqOrg 实施机构分组逻辑：无实施机构时不按提出部门分组', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify([]),
    propose_dept: '提出部门A'
  };
  const sysMap = {};
  assert.equal(reqOrg(req, sysMap), '未分配机构');
});

test('reqOrg 实施机构分组逻辑：第四优先级（未分配机构兜底）', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: null,
    propose_dept: null
  };
  const sysMap = {};
  assert.equal(reqOrg(req, sysMap), '未分配机构');
});

test('版本概览卡片标签：未选主责系统时保留需求填写的实施机构显示值', () => {
  const labels = overviewCardLabels(
    { main_systems: '[]', implementation_org: '厦门事业群' },
    {},
    { 厦门事业群: '厦门' },
  );
  assert.deepEqual(labels, { systemName: '未确定主责系统', systemOrg: '厦门' });
});

test('版本概览卡片标签：选定主责系统后仍使用需求填写的实施机构', () => {
  const labels = overviewCardLabels(
    { main_systems: '["SYS001"]', implementation_org: '厦门事业群' },
    { SYS001: { name: '核心支付系统', org: '北京事业群' } },
    { 厦门事业群: '厦门', 北京事业群: '北京' },
  );
  assert.deepEqual(labels, { systemName: '核心支付系统', systemOrg: '厦门' });
});


test('密码复杂度校验：满足各项复杂度要求时通过，不满足时拒绝', () => {
  // 满足：大写、小写、数字、特殊字符，长度>=8
  assert.equal(validatePasswordComplexity('DemoPassword!2026!'), true);
  // 长度不够
  assert.equal(validatePasswordComplexity('Rad@12'), false);
  // 无大写
  assert.equal(validatePasswordComplexity('radar@2026!'), false);
  // 无小写
  assert.equal(validatePasswordComplexity('RADAR@2026!'), false);
  // 无数字
  assert.equal(validatePasswordComplexity('Radar@xxxx!'), false);
  // 无特殊字符
  assert.equal(validatePasswordComplexity('Radar2026x'), false);
});

import { extract, matchFilters } from '../src/modules/dashboard/index.js';
import { buildTaskStatusChain } from '../src/modules/overview/index.js';

test('chart-dims 维度提取与过滤：阶段与任务状态，以及全部（all）数据源', () => {
  const req = {
    req_code: 'RC_001',
    status: '需求登记',
    propose_dept: '部门A',
    main_systems: JSON.stringify(['SYS001'])
  };
  const ctx = {
    sysMap: {
      SYS001: { name: '系统1', org: '机构1', sector: '板块1' }
    },
    devMap: {
      RC_001: [
        { status: '开发承接' }
      ]
    },
    testMap: {
      RC_001: {
        SIT: [{ status: '测试实施' }]
      }
    },
    rtMap: {
      RC_001: '待评审'
    }
  };

  // 1. 验证 stage 提取：链条中需求登记(doing), 开发承接(doing), SIT测试实施(doing), RT待评审(doing)
  // nodeState中，开发承接是非终态 -> state='doing'
  // buildChain中：需求(doing), 开发(doing), SIT(doing), UAT(pending), 投产(doing)
  // current = nodes.find(state === 'doing')，应该找到第一个 'doing'，即“需求/工单分析”
  const stages = extract('requirement', 'stage', req, ctx);
  assert.deepEqual(stages, ['需求/工单分析']);

  // 2. 验证 task_status 提取
  const taskStatus = extract('requirement', 'task_status', req, ctx);
  assert.deepEqual(taskStatus, ['需求/工单分析-需求登记']);

  // 3. 验证 all 数据源支持
  const rowWithSource = {
    ...req,
    _source: 'requirement'
  };
  const org = extract('all', 'org', rowWithSource, ctx);
  assert.deepEqual(org, ['机构1']);

  // 4. 验证 matchFilters 与 all 数据源结合
  const filters = {
    org: ['机构1'],
    stage: ['需求/工单分析']
  };
  assert.equal(matchFilters('all', rowWithSource, filters, ctx), true);
});

test('task-status：统一阶段顺序优先用户测试，且保留阶段-状态展示', () => {
  const chain = buildTaskStatusChain(
    { req_code: 'REQ-DEMO-001', status: '需求分析完成' },
    { 'REQ-DEMO-001': [{ id: 1, status: '开发完成' }] },
    {
      'REQ-DEMO-001': {
        SIT: [{ id: 2, status: '测试完成' }],
        UAT: [{ id: 3, status: '用户测试中' }],
        NFT: [{ id: 4, status: '非功能测试中' }],
      },
    },
    {},
  );

  assert.equal(chain.stage, '用户测试');
  assert.equal(chain.status, '用户测试中');
  assert.equal(chain.display, '用户测试-用户测试中');
  assert.equal(chain.shortDisplay, 'UAT · 用户测试中');
});

test('task-status：无下游任务时回退到已完成的需求/工单分析阶段', () => {
  const chain = buildTaskStatusChain({ req_code: 'REQ-DEMO-002', status: '需求分析完成' });
  assert.equal(chain.display, '需求/工单分析-需求分析完成');
  assert.equal(chain.shortDisplay, '需求 · 需求分析完成');
});

test('task-status：版本概览按实体类型显示需求分析或工单分析，默认统计口径不变', () => {
  const requirement = buildTaskStatusChain(
    { req_code: 'REQ-DEMO-003', status: '需求分析中' }, {}, {}, {}, { analysisLabel: 'entity' },
  );
  const ticket = buildTaskStatusChain(
    { ticket_code: 'TICKET-DEMO-001', entity_type: 'ticket', status: '工单分析中' }, {}, {}, {}, { analysisLabel: 'entity' },
  );

  assert.equal(requirement.nodes[0].label, '需求分析');
  assert.equal(ticket.nodes[0].label, '工单分析');
  assert.equal(ticket.display, '工单分析-工单分析中');
  assert.equal(buildTaskStatusChain({ req_code: 'REQ-DEMO-004', status: '需求分析中' }).nodes[0].label, '需求/工单分析');
});
