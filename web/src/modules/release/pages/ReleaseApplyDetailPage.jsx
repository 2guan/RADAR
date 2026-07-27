/**
 * 文件：web/src/modules/release/pages/ReleaseApplyDetailPage.jsx
 * 说明：从投产申请详情路由中读取编号，并复用投产申请编辑器的页面模式。
 * 用途：投产申请详情单页入口。
 * 作者：hengguan
 */

import { useParams } from 'react-router-dom';
import ReleaseApplyEditor from '../components/ReleaseApplyEditor.jsx';
import { useBackNavigation } from '../../../platform/routing/navigation.js';

export default function ReleaseApplyDetailPage() {
  const { code } = useParams();
  const back = useBackNavigation();
  return <ReleaseApplyEditor mode="page" code={code} open onClose={back} />;
}
