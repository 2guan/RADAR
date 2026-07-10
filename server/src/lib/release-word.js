/**
 * 文件：lib/release-word.js
 * 用途：投产审批「版本发布评审单」Word 文档生成。按模板格式输出：
 *       一、投产基本信息；二、需求/工单/问题信息；三、开发情况；四、测试情况；
 *       五、影响性分析；六、测试覆盖分析；评审会签。
 *       全文微软雅黑、黑色；表头/标签列灰色底纹。
 * 作者：hengguan
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  ImageRun, VerticalAlign, convertInchesToTwip,
} from 'docx';
import { coverageItemExportLines, decodeChangeItem, impactItemExportLines } from './impact-schema.js';

// ── 基础常量 ──────────────────────────────────────────────────────────────
const FONT = '微软雅黑';
const COLOR_BLACK = '000000';
const FILL_GRAY = 'D9D9D9';   // 标签/表头灰色底纹
const FILL_WHITE = 'FFFFFF';

/** 全量单元格边框 */
const CELL_BORDER = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  left:   { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
  right:  { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA' },
};

// ── 基础构建函数 ──────────────────────────────────────────────────────────

/** 统一 TextRun：微软雅黑、黑色 */
function run(text, { bold = false, size = 20 } = {}) {
  return new TextRun({
    text: String(text ?? ''),
    font: { eastAsia: FONT, ascii: FONT, hAnsi: FONT, cs: FONT },
    size,
    color: COLOR_BLACK,
    bold,
  });
}

/** 段落工厂 */
function para(children, { alignment = AlignmentType.LEFT, spaceBefore = 0, spaceAfter = 0 } = {}) {
  const arr = Array.isArray(children) ? children : [children];
  return new Paragraph({ alignment, spacing: { before: spaceBefore, after: spaceAfter }, children: arr });
}

/** 灰色标签单元格（th） */
function thCell(text, width, { vAlign = VerticalAlign.CENTER } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: vAlign,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: FILL_GRAY },
    borders: CELL_BORDER,
    children: [para(run(text, { bold: true, size: 20 }), { alignment: AlignmentType.CENTER })],
  });
}

/** 白色数据单元格（td），支持多段 */
function tdCell(text, width, { children: extraChildren, vAlign = VerticalAlign.CENTER } = {}) {
  const content = extraChildren ?? [para(run(String(text ?? '—'), { size: 20 }), { alignment: AlignmentType.CENTER })];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: vAlign,
    borders: CELL_BORDER,
    children: content,
  });
}

/** 节标题段落（二、三、四…） */
function section(title) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    children: [run(title, { bold: true, size: 28 })],
  });
}

/** 子标题段落（任务编号等） */
function subTitle(text) {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [run(text, { bold: true, size: 20 })],
  });
}

/** 空行 */
function spacer(size = 60) {
  return new Paragraph({ spacing: { after: size }, children: [run('')] });
}

/** 解析 base64 DataURL -> Buffer；失败返回 null */
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  try { return Buffer.from(m[2], 'base64'); } catch { return null; }
}

/** Word 中显示的日期时间：2026-5-5 8:15。 */
export function formatWordDateTime(value) {
  if (!value) return '—';

  const fromParts = (y, mo, d, h, mi) => {
    const date = `${Number(y)}-${Number(mo)}-${Number(d)}`;
    if (h === undefined || mi === undefined) return date;
    return `${date} ${Number(h)}:${String(Number(mi)).padStart(2, '0')}`;
  };

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '—';
    return fromParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
    );
  }

  const text = String(value).trim();
  if (!text) return '—';

  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/.exec(text);
  if (m) return fromParts(m[1], m[2], m[3], m[4], m[5]);

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatWordDateTime(parsed);

  return text;
}

// ── 表格构建辅助 ─────────────────────────────────────────────────────────

/** 两列 key-value 行（label 宽 2000，value 宽 6500） */
function kvRow(label, value) {
  return new TableRow({ children: [thCell(label, 2000), tdCell(value, 6500)] });
}

/** 4 列基本信息行：[label1, val1, label2, val2] */
function fourColRow(label1, val1, label2, val2) {
  return new TableRow({
    children: [
      thCell(label1, 1700),
      tdCell(val1,   2700),
      thCell(label2, 1700),
      tdCell(val2,   2700),
    ],
  });
}

/** 构建标准两列 kv 表格 */
function kvTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

/** 左侧灰底：序号与变更分类，垂直/水平居中。 */
function analysisTitleCell(index, category, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: FILL_GRAY },
    borders: CELL_BORDER,
    children: [
      para(run(String(index), { bold: true, size: 20 }), { alignment: AlignmentType.CENTER, spaceAfter: 30 }),
      para(run(category || '—', { bold: true, size: 20 }), { alignment: AlignmentType.CENTER }),
    ],
  });
}

/** 分析导出内容：每条影响项单独成行，右侧字段顺序与 Excel 导出一致。 */
function analysisTable(items, lineOf, emptyText) {
  if (!items?.length) return para(run(emptyText, { size: 18 }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: items.map((item, index) => {
      const impact = decodeChangeItem(item);
      return new TableRow({
        children: [
          analysisTitleCell(index + 1, impact.category, 2000),
          tdCell('', 6500, {
            vAlign: VerticalAlign.TOP,
            children: lineOf(item).map((line) => para(run(line, { size: 20 }), { alignment: AlignmentType.LEFT, spaceAfter: 30 })),
          }),
        ],
      });
    }),
  });
}

// ── 主入口 ───────────────────────────────────────────────────────────────

/**
 * 生成「版本发布评审单」Word 文档。
 * @param {object} detail  GET /release/:code 返回数据
 * @param {object[]} devTasksFull  完整 dev_task 行（含 task_name, content, owner, status）
 * @param {object[]} testTasksFull 完整 test_task 行（含 task_name, test_type, owner, status）
 * @param {{impactItems?: object[], coverageMap?: Map}} analysisData 影响/覆盖分析原始数据
 * @returns {Promise<Buffer>}
 */
export async function buildReleaseWordDoc(detail, devTasksFull, testTasksFull, analysisData = {}) {
  const { entityType, entity, releaseTask, signoffs = [], artifacts = [] } = detail;
  const isWorkItem = entityType === 'requirement' || entityType === 'ticket';
  const workLabel = entityType === 'ticket' ? '工单' : '需求';

  const children = [];

  // ── 文档大标题 ────────────────────────────────────────────────────────
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [run('云南农信同业输出项目版本发布评审单', { bold: true, size: 46 })],
  }));

  // 副标题：编号 + 标题/概述
  const entityLabel = isWorkItem ? (entity.title || '') : (entity.summary || '');
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [run(`${entity.code || ''}  ${entityLabel}`, { size: 24 })],
  }));

  // ── 一、投产基本信息 ──────────────────────────────────────────────────
  children.push(section('一、投产基本信息'));

  // 4 列基础信息表
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      fourColRow('投产负责人', releaseTask?.owner, '投产状态', releaseTask?.status),
      fourColRow('申请投产点', entity?.apply_release_date || entity?.release_date, '评审状态', releaseTask?.review_status),
      fourColRow('发起人', releaseTask?.registrar, '发起时间', releaseTask?.register_time),
    ],
  }));

  // 每条关联制品申请
  if (artifacts && artifacts.length > 0) {
    artifacts.forEach((a, ai) => {
      children.push(spacer(100));
      children.push(subTitle(`关联变更申请 ${ai + 1}：${a.change_code || ''}`));

      children.push(kvTable([
        kvRow('变更编号', a.change_code),
        kvRow('变更内容', a.change_content),
        kvRow('影响范围', a.impact_scope),
        kvRow('变更系统', a.change_system_name || a.change_system),
        kvRow('实施机构', a.impl_org),
      ]));

      const units = Array.isArray(a.units) ? a.units : [];
      if (units.length > 0) {
        children.push(new Paragraph({
          spacing: { before: 100, after: 60 },
          children: [run('制品清单：', { bold: true, size: 20 })],
        }));
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                thCell('制品类型', 2200),
                thCell('新版本号', 1800),
                thCell('交付单元名称', 4800),
              ],
            }),
            ...units.map((u) => new TableRow({
              children: [
                tdCell(u.artifact_type, 2200),
                tdCell(u.new_version,   1800),
                tdCell(u.delivery_unit, 4800),
              ],
            })),
          ],
        }));
      }
    });
  } else {
    children.push(spacer(80));
    children.push(para(run('暂无关联投产申请', { size: 18 })));
  }

  // ── 二、需求/工单/问题信息 ─────────────────────────────────────────────
  children.push(spacer());
  children.push(section(isWorkItem ? `二、${workLabel}信息` : '二、问题信息'));

  if (isWorkItem) {
    children.push(kvTable([
      kvRow(`${workLabel}${entityType === 'ticket' ? '概述' : '标题'}`, entity.title),
      kvRow(`${workLabel}详情`, entity.summary),
      kvRow(entityType === 'ticket' ? '云南农信工单负责人' : '云南农信业务负责人', entity.yn_owner),
      kvRow(entityType === 'ticket' ? '建信金科工单负责人' : '建信金科业务负责人', entity.jk_owner),
      kvRow(`${workLabel}状态`, entity.status),
      kvRow('计划投产点', entity.plan_release_date || entity.release_date),
    ]));
  } else {
    children.push(kvTable([
      kvRow('问题编号', entity.code),
      kvRow('问题概述', entity.summary),
      kvRow('问题详情', entity.details),
      kvRow('问题状态', entity.status),
      kvRow('申请投产点', entity.apply_release_date || entity.release_date),
    ]));
  }

  // ── 三、开发情况（仅需求/工单） ───────────────────────────────────────
  if (isWorkItem) {
    children.push(spacer());
    children.push(section('三、开发情况'));

    if (!devTasksFull || devTasksFull.length === 0) {
      children.push(para(run('暂无开发任务', { size: 18 })));
    } else {
      devTasksFull.forEach((t, i) => {
        if (i > 0) children.push(spacer(80));
        children.push(subTitle(`开发任务 ${i + 1}：${t.task_code || ''}`));
        children.push(kvTable([
          kvRow('任务名称', t.task_name),
          kvRow('开发负责人', t.owner),
          kvRow('任务概述', t.content),
          kvRow('任务状态', t.status),
        ]));
      });
    }
  }

  // ── 四、测试情况（仅需求/工单） ───────────────────────────────────────
  if (isWorkItem) {
    const typeLabel = { SIT: '应用组装', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };
    children.push(spacer());
    children.push(section('四、测试情况'));

    if (!testTasksFull || testTasksFull.length === 0) {
      children.push(para(run('暂无测试任务', { size: 18 })));
    } else {
      testTasksFull.forEach((t, i) => {
        if (i > 0) children.push(spacer(80));
        const typeName = typeLabel[t.test_type] || t.test_type || '';
        children.push(subTitle(`${typeName}：${t.task_code || ''}`));
        children.push(kvTable([
          kvRow('任务名称', t.task_name),
          kvRow('测试负责人', t.owner),
          kvRow('测试类型', typeName),
          kvRow('任务状态', t.status),
        ]));
      });
    }

    // ── 五、影响性分析 ────────────────────────────────────────────────
    children.push(spacer());
    children.push(section('五、影响性分析'));
    children.push(analysisTable(
      analysisData.impactItems,
      (item) => impactItemExportLines(item, { includeCategory: false }),
      '暂无影响性分析内容',
    ));

    // ── 六、测试覆盖分析 ──────────────────────────────────────────────
    children.push(spacer());
    children.push(section('六、测试覆盖分析'));
    children.push(analysisTable(
      analysisData.impactItems,
      (item) => coverageItemExportLines(item, analysisData.coverageMap?.get(item.id), { includeCategory: false }),
      '暂无测试覆盖分析内容',
    ));
  }

  // ── 评审会签（紧凑5列表） ─────────────────────────────────────────────
  const signoffSectionNum = isWorkItem ? '七' : '三';
  children.push(spacer());
  children.push(section(`${signoffSectionNum}、评审会签`));

  if (!signoffs || signoffs.length === 0) {
    children.push(para(run('未配置会签角色', { size: 18 })));
  } else {
    // 列宽：签署角色 | 签署结论 | 签署时间 | 签署意见 | 签署人及签名
    const COL = [1400, 1100, 1350, 2150, 2800];

    const headerRow = new TableRow({
      children: [
        thCell('签署角色',    COL[0]),
        thCell('签署结论',    COL[1]),
        thCell('签署时间',    COL[2]),
        thCell('签署意见',    COL[3]),
        thCell('签署人及签名', COL[4]),
      ],
    });

    const dataRows = signoffs.map((so) => {
      const sigBuf = dataUrlToBuffer(so.signature_image);
      const signTime = formatWordDateTime(so.sign_time);

      // 「签署人及签名」列：姓名 + 签名图片（有则显示）
      const sigCellChildren = [
        para(run(so.signer_name || '—', { size: 20 }), { alignment: AlignmentType.CENTER }),
        ...(sigBuf ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40 },
            children: [new ImageRun({
              data: sigBuf,
              transformation: { width: 120, height: 46 },
              type: 'png',
            })],
          }),
        ] : []),
      ];

      return new TableRow({
        children: [
          tdCell(so.role_name,  COL[0]),
          tdCell(so.result,     COL[1]),
          tdCell(signTime,      COL[2]),
          tdCell(so.conclusion, COL[3]),
          tdCell('',            COL[4], { children: sigCellChildren }),
        ],
      });
    });

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
  }

  // ── 组装 Document ─────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: { eastAsia: FONT, ascii: FONT, hAnsi: FONT },
            size: 20,
            color: COLOR_BLACK,
          },
        },
        heading3: {
          run: {
            font: { eastAsia: FONT, ascii: FONT, hAnsi: FONT },
            size: 28,
            bold: true,
            color: COLOR_BLACK,
          },
          paragraph: { spacing: { before: 240, after: 80 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1),
            right:  convertInchesToTwip(1.2),
            bottom: convertInchesToTwip(1),
            left:   convertInchesToTwip(1.2),
          },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
