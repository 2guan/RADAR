/**
 * 文件：scripts/check-readme-tree.mjs
 * 说明：从受管目录和模块清单生成 README 的目录树，避免文档与仓库结构漂移。
 * 用途：校验或同步 README 中的工程目录树。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJsonYaml, root } from './governance-utils.mjs';

const readmePath = path.join(root, 'README.md');
const startMarker = '<!-- repository-tree:start -->';
const endMarker = '<!-- repository-tree:end -->';
const manifest = readJsonYaml('governance/modules.yaml');
const businessModules = Object.entries(manifest.modules || {})
  .filter(([, definition]) => definition.type === 'business')
  .map(([name]) => name);

const requiredPaths = [
  '.github', 'AGENTS.md', 'DESIGN.md', 'Dockerfile', 'MIGRATION.md', 'PRODUCT.md', 'README.md',
  'docker-compose.yml', 'docs/architecture', 'docs/governance', 'docs/manuals', 'docs/planning',
  'docs/requirements', 'governance/modules.yaml', 'scripts', 'server/scripts', 'server/templates',
  'server/test', 'server/src/bootstrap', 'server/src/platform', 'server/src/shared', 'server/src/modules',
  'web/public', 'web/src/platform', 'web/src/shared', 'web/src/modules',
];

// 模块目录来自唯一机器事实源，新增或删除模块时会自动反映到 README 校验结果。
for (const name of businessModules) {
  requiredPaths.push('server/src/modules/' + name, 'web/src/modules/' + name);
}

const missingPaths = requiredPaths.filter((file) => !fs.existsSync(path.join(root, file)));
if (missingPaths.length) {
  console.error('README 目录树无法生成，以下受管路径不存在：\n' + missingPaths.join('\n'));
  process.exit(1);
}

const moduleList = businessModules.join('、');
const tree = `\`\`\`text
RADAR/
├── .github/                         # CI、CODEOWNERS、Issue 与 PR 模板
├── AGENTS.md                        # AI 开发入口：资料定位与读取顺序
├── DESIGN.md                        # 设计系统与交互约束
├── Dockerfile                       # 生产镜像构建
├── MIGRATION.md                     # 数据迁移、备份与恢复操作手册
├── PRODUCT.md                       # 产品边界、流程与验收口径
├── README.md                        # 本文件：工程入口与运行说明
├── docker-compose.yml               # 单服务部署、端口和卷挂载编排
├── docs/
│   ├── architecture/                # 模块说明、契约说明与 ADR
│   ├── governance/                  # 项目、AI、GitHub 三类正式规约
│   ├── manuals/                     # 用户、部署与业务操作手册
│   ├── planning/                    # 建设方案
│   └── requirements/                # 模板、示例与 <开发者账号>/REQ-... 需求目录
├── governance/
│   └── modules.yaml                 # 模块、Owner、依赖与公开契约机器事实源
├── scripts/                         # CI 可复用的治理、边界、迁移与文档检查
├── server/
│   ├── AGENTS.md                    # 后端目录级实现约定
│   ├── scripts/                     # 数据搬迁、备份与恢复工具
│   ├── templates/                   # 文档模板资产
│   ├── test/                        # 单元、API 与权限回归测试
│   └── src/
│       ├── bootstrap/               # 默认种子数据与装配
│       ├── platform/                # 认证、持久化、附件、审计、运行时等基础设施
│       ├── shared/                  # DTO、纯工具与流程协作能力
│       └── modules/                 # ${moduleList}
└── web/
    ├── AGENTS.md                    # 前端目录级实现约定
    ├── public/                      # Logo、字体等静态资源
    └── src/
        ├── platform/                # HTTP、路由、布局、状态、主题、附件与审计
        ├── shared/                  # 共享 UI、流程展示与工具
        └── modules/                 # ${moduleList}
\`\`\``;

const readme = fs.readFileSync(readmePath, 'utf8');
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  console.error('README 缺少有效的目录树标记。');
  process.exit(1);
}

// 只替换受控区块，保留 README 其他由人工维护的项目介绍、运行和部署说明。
const generated = readme.slice(0, start + startMarker.length) + '\n' + tree + '\n' + readme.slice(end);
if (process.argv.includes('--write')) {
  fs.writeFileSync(readmePath, generated);
  console.log('README 目录树已同步。');
} else if (generated !== readme) {
  console.error('README 目录树已过期。请运行：node scripts/check-readme-tree.mjs --write');
  process.exit(1);
} else {
  console.log('README 目录树检查通过：' + businessModules.length + ' 个业务模块已同步。');
}
