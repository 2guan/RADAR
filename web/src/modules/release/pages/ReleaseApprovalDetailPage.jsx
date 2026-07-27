/**
 * 文件：web/src/modules/release/pages/ReleaseApprovalDetailPage.jsx
 * 说明：从投产审批详情路由中读取关联业务编号，并复用审批详情编辑器的页面模式。
 * 用途：投产审批详情单页入口。
 * 作者：hengguan
 */

import { useParams } from 'react-router-dom';
import ReleaseDetail from '../components/ReleaseDetail.jsx';
import { useBackNavigation } from '../../../platform/routing/navigation.js';

export default function ReleaseApprovalDetailPage() {
  const { code } = useParams();
  const back = useBackNavigation();
  return <ReleaseDetail mode="page" code={code} open onClose={back} />;
}
