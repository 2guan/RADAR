/**
 * 文件：lib/excel.js
 * 用途：通用 Excel（.xlsx）导入导出工具，基于 exceljs。导出生成带表头的工作簿 Buffer；
 *       导入解析首行为表头并按中文列名映射回字段。
 * 作者：hengguan
 * 说明：columns 形如 [{ key:'name', title:'姓名' }]，导入时按 title 匹配表头列。
 */

import ExcelJS from 'exceljs';

/**
 * 导出数据为 xlsx Buffer。
 * @param {Array<{key:string,title:string,width?:number,wrapText?:boolean}>} columns 列定义
 * @param {object[]} rows 数据行
 * @param {string} [sheetName] 工作表名
 * @returns {Promise<Buffer>}
 */
export async function exportXlsx(columns, rows, sheetName = '数据') {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RADAR';
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.title, key: c.key, width: c.width || 22 }));
  // 表头加粗
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(row);
  columns.forEach((column, index) => {
    if (!column.wrapText) return;
    ws.getColumn(index + 1).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber > 1) cell.alignment = { vertical: 'top', wrapText: true };
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * 解析上传的 xlsx Buffer 为对象数组。
 * @param {Buffer} buffer 文件内容
 * @param {Array<{key:string,title:string}>} columns 列定义
 * @returns {Promise<object[]>}
 */
export async function parseXlsx(buffer, columns) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  // 读取表头，建立 列索引 -> 字段key 映射
  const headerRow = ws.getRow(1);
  const titleToKey = new Map(columns.map((c) => [c.title, c.key]));
  const colKeyByIndex = {};
  headerRow.eachCell((cell, colNumber) => {
    const title = String(cell.value ?? '').trim();
    if (titleToKey.has(title)) colKeyByIndex[colNumber] = titleToKey.get(title);
  });

  const rows = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const obj = {};
    let hasValue = false;
    for (const [colNumber, key] of Object.entries(colKeyByIndex)) {
      const v = row.getCell(Number(colNumber)).value;
      const val = v == null ? '' : (typeof v === 'object' && v.text ? v.text : v);
      obj[key] = typeof val === 'string' ? val.trim() : val;
      if (obj[key] !== '' && obj[key] != null) hasValue = true;
    }
    if (hasValue) {
      obj.__rowNum__ = i;
      rows.push(obj);
    }
  }
  return rows;
}
