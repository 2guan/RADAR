/**
 * 文件：web/src/shared/workflow/stageSectionLayout.js
 * 说明：sort 是全局顺序；每个分区只通过 layout_mode 决定占左、右或整行。
 * 用途：统一计算阶段分区在详情页和分区配置预览中的行、列位置。
 * 作者：Codex、hengguan
 */

/**
 * 将全局排序的分区排成视觉行。
 *
 * 整行分区会独占一行；左右分区仅在相邻的布局序列中配对。这样可表达：
 * “整行 → 左右并排 → 整行”，也不会让后续右侧模块回填到前面的左侧行。
 */
export function buildStageSectionLayout(sections = []) {
  const ordered = [...sections]
    .sort((a, b) => Number(a.order ?? a.sort ?? 0) - Number(b.order ?? b.sort ?? 0)
      || Number(a.index ?? 0) - Number(b.index ?? 0));
  const placements = new Map();
  const rows = [];
  const segments = [];
  let currentRow = null;
  let currentColumnSegment = null;

  const createRow = () => {
    currentRow = { items: [] };
    rows.push(currentRow);
    return currentRow;
  };
  const closeRow = () => { currentRow = null; };

  for (const item of ordered) {
    const layout = item.layout_mode || item.layout || 'left';
    if (layout === 'full') {
      // 如果上一行已开始放置左右模块，整行模块必须从下一行开始。
      if (currentRow) closeRow();
      const row = createRow();
      row.items.push(item);
      placements.set(item.key || item.section_key, { row: rows.length, column: '1 / -1', layout: 'full' });
      closeRow();
      // 全宽模块是左右两列独立堆叠的分隔点。
      currentColumnSegment = null;
      segments.push({ type: 'full', items: [item] });
      continue;
    }

    if (!currentColumnSegment) {
      currentColumnSegment = { type: 'columns', items: [] };
      segments.push(currentColumnSegment);
    }
    currentColumnSegment.items.push(item);

    const column = layout === 'right' ? '2' : '1';
    const hasSameColumn = currentRow?.items.some((rowItem) => (rowItem.layout_mode || rowItem.layout || 'left') === layout);
    // 同一侧连续出现时需要开启新行，避免覆盖已占据的列。
    if (!currentRow || hasSameColumn) {
      if (currentRow) closeRow();
      createRow();
    }
    currentRow.items.push(item);
    placements.set(item.key || item.section_key, { row: rows.length, column, layout });
    // 左右均已放入时，该行完成；下一个模块从新行开始。
    if (currentRow.items.length === 2) closeRow();
  }

  return { ordered, placements, rows, segments };
}
