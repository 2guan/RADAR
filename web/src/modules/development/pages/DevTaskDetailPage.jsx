/**
 * 文件：web/src/modules/development/pages/DevTaskDetailPage.jsx
 * 说明：从开发任务详情路由中读取编号，并复用开发任务编辑器的页面模式。
 * 用途：开发任务详情单页入口。
 * 作者：hengguan
 */

import { useParams } from 'react-router-dom';
import { TaskEditor } from '../../../shared/workflow/index.js';
import { useBackNavigation } from '../../../platform/routing/navigation.js';

export default function DevTaskDetailPage() {
  const { code } = useParams();
  const back = useBackNavigation();
  return <TaskEditor mode="page" kind="dev" code={code} open onClose={back} />;
}
