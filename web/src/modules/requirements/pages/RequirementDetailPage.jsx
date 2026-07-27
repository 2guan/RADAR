/**
 * 文件：web/src/modules/requirements/pages/RequirementDetailPage.jsx
 * 说明：从需求详情路由中读取编号，并复用需求编辑器的只读/编辑页面模式。
 * 用途：需求详情单页入口。
 * 作者：hengguan
 */

import { useParams } from 'react-router-dom';
import RequirementEditor from '../components/RequirementEditor.jsx';
import { useBackNavigation } from '../../../platform/routing/navigation.js';

export default function RequirementDetailPage() {
  const { code } = useParams();
  const back = useBackNavigation();
  return <RequirementEditor mode="page" code={code} open onClose={back} />;
}
