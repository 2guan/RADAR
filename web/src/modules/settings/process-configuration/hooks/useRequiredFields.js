/**
 * 文件：web/src/modules/settings/process-configuration/hooks/useRequiredFields.js
 * 说明：遵循项目研发规约；详情页的必填性只能来自流程输入项配置。
 * 用途：兼容既有业务编辑器的 Hook 名称，同时将必填标记和表单规则统一映射到
 * stage-content schema，避免旧 required.fields 配置与系统设置出现两套事实源。
 * 作者：hengguan
 */

import { useMemo } from 'react';
import { useStageFormConfig } from './useStageFormConfig.js';

function resolveScopeKey(moduleKey, scopeKey) {
  // 测试任务详情首次挂载时，任务类型尚未返回；此时不能请求不存在的 `test` 范围，
  // 否则全局 API 错误提示会偶发显示“阶段不存在或已停用”。拿到真实类型后再加载 test.SIT/UAT/NFT/SEC。
  if (moduleKey === 'test' && !scopeKey) return null;
  if (moduleKey !== 'test') return moduleKey;
  return String(scopeKey).startsWith('test.') ? scopeKey : `test.${scopeKey}`;
}

/**
 * @param {string} moduleKey 兼容既有调用方的模块键。
 * @param {string} statusValue 当前真实状态值，而非粗粒度状态类型。
 */
export function useRequiredFields(moduleKey, statusValue, readonly, scopeKey) {
  const resolvedScopeKey = resolveScopeKey(moduleKey, scopeKey);
  const formConfig = useStageFormConfig(resolvedScopeKey, statusValue, readonly);

  return useMemo(() => {
    const attachmentFields = (formConfig.schema?.deliverables || [])
      .filter((item) => item.visible)
      .map((item) => item.label);
    const attachmentMode = (fieldKey) => {
      const item = (formConfig.schema?.deliverables || []).find((candidate) => candidate.label === fieldKey);
      return item?.input_mode || 'both';
    };
    return { ...formConfig, attachmentFields, attachmentMode };
  }, [formConfig]);
}

// 旧调用方可能在保存配置后显式调用该函数；schema 缓存由配置更新事件统一失效，保留空实现以兼容。
export function resetRequiredFieldsCache() {}
