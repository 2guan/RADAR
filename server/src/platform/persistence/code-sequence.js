/**
 * 文件：platform/persistence/code-sequence.js
 * 说明：序列以“规则键 + 不含序号的编号前缀”为唯一键；首次使用由调用方提供历史最大值后的起始序号。
 * 用途：封装业务编号序列的原子领号，兼容 SQLite 的写事务和 TDSQL/MySQL 的行锁事务。
 * 作者：hengguan
 */

import { get, isSqlite, isTdsql, run, tx } from '../../db/index.js';

// node:sqlite 使用单连接；并发事务会被底层直接拒绝，因此仅对“领号”这一极短临界区串行。
// TDSQL 保持数据库行锁并发，不经过该队列。
let sqliteSequenceQueue = Promise.resolve();

function enqueueSqliteSequence(work) {
  const result = sqliteSequenceQueue.then(work, work);
  // 失败不能阻塞后续编号申请；调用方仍会收到本次异常。
  sqliteSequenceQueue = result.catch(() => undefined);
  return result;
}

/** 校验内部固定规则，避免将不可信值带入编号序列表。 */
function assertSequenceInput(ruleKey, prefix, initialValue) {
  if (!String(ruleKey || '').trim() || !String(prefix || '').trim()) {
    throw new Error('编号规则键和前缀不能为空');
  }
  if (!Number.isSafeInteger(initialValue) || initialValue < 1) {
    throw new Error('编号序列初始值必须是正整数');
  }
}

/** 查询指定编号前缀是否已经建立序列。 */
export async function getCodeSequenceNext(ruleKey, prefix) {
  const row = await get(
    'SELECT next_value FROM code_sequence WHERE rule_key = ? AND prefix = ?',
    ruleKey,
    prefix,
  );
  return row ? Number(row.next_value) : null;
}

/**
 * 在事务中领用一个序号；并发调用会得到不同的递增值。
 * SQLite 的 BEGIN IMMEDIATE 与 TDSQL 的事务连接均由统一 provider 保障。
 */
export async function reserveCodeSequence({ ruleKey, prefix, initialValue = 1 }) {
  assertSequenceInput(ruleKey, prefix, initialValue);
  const reserve = () => tx(async () => {
    // 已存在时忽略插入，首次领号才使用从历史编号计算出的 initialValue。
    await run(
      `INSERT OR IGNORE INTO code_sequence (rule_key, prefix, next_value)
       VALUES (?, ?, ?)`,
      ruleKey,
      prefix,
      initialValue,
    );
    // TDSQL/MySQL 必须锁住当前序列行，防止两个事务读到同一个 next_value。
    // SQLite 已通过 BEGIN IMMEDIATE 和本模块短队列获得等价的单写者语义。
    const row = await get(
      `SELECT next_value FROM code_sequence WHERE rule_key = ? AND prefix = ?${isTdsql() ? ' FOR UPDATE' : ''}`,
      ruleKey,
      prefix,
    );
    const sequence = Number(row?.next_value);
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new Error(`编号序列异常：${ruleKey}/${prefix}`);
    }
    // 仅按主键更新当前行，事务提交前其他领号请求无法读取同一个旧值。
    await run(
      `UPDATE code_sequence
          SET next_value = ?, updated_at = datetime('now','localtime')
        WHERE rule_key = ? AND prefix = ?`,
      sequence + 1,
      ruleKey,
      prefix,
    );
    return sequence;
  });
  return isSqlite() ? enqueueSqliteSequence(reserve) : reserve();
}
