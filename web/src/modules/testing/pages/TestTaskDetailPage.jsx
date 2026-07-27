/**
 * 文件：web/src/modules/testing/pages/TestTaskDetailPage.jsx
 * 说明：从测试详情路由中读取编号；测试类型由服务端记录决定，页面不重复推断。
 * 用途：SIT、UAT、NFT 和 SEC 测试任务的统一详情单页入口。
 * 作者：hengguan
 */

import { useParams } from 'react-router-dom';
import { TaskEditor } from '../../../shared/workflow/index.js';
import { useBackNavigation } from '../../../platform/routing/navigation.js';

export default function TestTaskDetailPage() {
  const { code } = useParams();
  const back = useBackNavigation();
  return <TaskEditor mode="page" kind="test" code={code} open onClose={back} />;
}
