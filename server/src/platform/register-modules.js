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
import authRoutes from '../modules/identity-access/api/auth-routes.js';
import roleRoutes from '../modules/identity-access/api/roles-routes.js';
import userRoutes from '../modules/identity-access/api/users-routes.js';
import dictRoutes from '../modules/settings/api/dictionaries-routes.js';
import systemRoutes from '../modules/settings/api/systems-routes.js';
import releasePointRoutes from '../modules/settings/api/release-points-routes.js';
import settingsRoutes from '../modules/settings/api/settings-routes.js';
import processConfigurationRoutes from '../modules/settings/api/process-configuration-routes.js';
import requirementRoutes from '../modules/requirements/api/routes.js';
import ticketRoutes from '../modules/tickets/api/routes.js';
import issueRoutes from '../modules/issues/api/routes.js';
import devTaskRoutes from '../modules/development/api/routes.js';
import analysisRoutes from '../modules/development/api/analysis-routes.js';
import testTaskRoutes from '../modules/testing/api/routes.js';
import releaseRoutes from '../modules/release/api/routes.js';
import releaseApplyRoutes from '../modules/release/applications/release-apply/api/routes.js';
import signatureRoutes from './attachments/api/signatures-routes.js';
import attachmentRoutes from './attachments/api/routes.js';
import auditRoutes from './audit/api/routes.js';
import overviewRoutes from '../modules/overview/api/routes.js';
import dashboardRoutes from '../modules/dashboard/api/routes.js';

const MODULE_ROUTES = [
  authRoutes, dictRoutes, systemRoutes, releasePointRoutes, roleRoutes, userRoutes,
  settingsRoutes, processConfigurationRoutes, requirementRoutes, ticketRoutes, issueRoutes,
  devTaskRoutes, testTaskRoutes, analysisRoutes, releaseRoutes, releaseApplyRoutes,
  signatureRoutes, attachmentRoutes, auditRoutes, overviewRoutes, dashboardRoutes,
];

export async function registerBusinessModules(api) {
  for (const routes of MODULE_ROUTES) await api.register(routes);
}
