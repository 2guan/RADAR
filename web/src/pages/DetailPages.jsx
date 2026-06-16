/**
 * 文件：pages/DetailPages.jsx
 * 用途：五类业务对象的「详情单页」。通过 URL 中的编号直达，复用对应编辑器的 page 模式正文。
 *       需求分析 / 开发管理 / 测试管理 / 投产申请 / 投产审批，权限与各自列表页一致（由路由守卫保证）。
 * 作者：hengguan
 * 说明：编号来自路由参数；关闭即返回上一页（无历史则回首页）。
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import RequirementEditor from '../components/editors/RequirementEditor.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import ReleaseApplyEditor from '../components/editors/ReleaseApplyEditor.jsx';
import ReleaseDetail from '../components/editors/ReleaseDetail.jsx';

/** 返回上一页；无浏览历史时回首页 */
function useBack() {
  const navigate = useNavigate();
  return () => { if (window.history.length > 1) navigate(-1); else navigate('/'); };
}

/** 需求详情单页 */
export function RequirementDetailPage() {
  const { code } = useParams();
  const back = useBack();
  return <RequirementEditor mode="page" code={code} open onClose={back} />;
}

/** 开发任务详情单页 */
export function DevTaskDetailPage() {
  const { code } = useParams();
  const back = useBack();
  return <TaskEditor mode="page" kind="dev" code={code} open onClose={back} />;
}

/** 测试任务详情单页（SIT/UAT/NFT/SEC 共用，类型由后端记录决定） */
export function TestTaskDetailPage() {
  const { code } = useParams();
  const back = useBack();
  return <TaskEditor mode="page" kind="test" code={code} open onClose={back} />;
}

/** 投产申请详情单页 */
export function ReleaseApplyDetailPage() {
  const { code } = useParams();
  const back = useBack();
  return <ReleaseApplyEditor mode="page" code={code} open onClose={back} />;
}

/** 投产审批详情单页（编号为需求编号或问题编号） */
export function ReleaseApprovalDetailPage() {
  const { code } = useParams();
  const back = useBack();
  return <ReleaseDetail mode="page" code={code} open onClose={back} />;
}
