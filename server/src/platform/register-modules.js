/**
 * 文件：server/src/platform/register-modules.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：RADAR 后端业务或平台逻辑。
 * 作者：hengguan
 */

/**
 * Composition root for business modules. Business modules are registered here,
 * while `app.js` remains responsible only for runtime and HTTP platform setup.
 */
import authRoutes from '../modules/auth/api/routes.js';
import dictRoutes from '../modules/dict/api/routes.js';
import systemRoutes from '../modules/systems/api/routes.js';
import releasePointRoutes from '../modules/release-points/api/routes.js';
import roleRoutes from '../modules/roles/api/routes.js';
import userRoutes from '../modules/users/api/routes.js';
import settingsRoutes from '../modules/settings/api/routes.js';
import requirementRoutes from '../modules/requirements/api/routes.js';
import ticketRoutes from '../modules/tickets/api/routes.js';
import issueRoutes from '../modules/issues/api/routes.js';
import devTaskRoutes from '../modules/dev-tasks/api/routes.js';
import testTaskRoutes from '../modules/test-tasks/api/routes.js';
import analysisRoutes from '../modules/analysis/api/routes.js';
import releaseRoutes from '../modules/release/api/routes.js';
import releaseApplyRoutes from '../modules/release-apply/api/routes.js';
import signatureRoutes from '../modules/signatures/api/routes.js';
import attachmentRoutes from '../modules/attachments/api/routes.js';
import auditRoutes from '../modules/audit/api/routes.js';
import overviewRoutes from '../modules/overview/api/routes.js';
import dashboardRoutes from '../modules/dashboard/api/routes.js';
import stageContentRoutes from '../modules/stage-content/api/routes.js';

const MODULE_ROUTES = [
  authRoutes, dictRoutes, systemRoutes, releasePointRoutes, roleRoutes, userRoutes,
  settingsRoutes, stageContentRoutes, requirementRoutes, ticketRoutes, issueRoutes,
  devTaskRoutes, testTaskRoutes, analysisRoutes, releaseRoutes, releaseApplyRoutes,
  signatureRoutes, attachmentRoutes, auditRoutes, overviewRoutes, dashboardRoutes,
];

export async function registerBusinessModules(api) {
  for (const routes of MODULE_ROUTES) await api.register(routes);
}
