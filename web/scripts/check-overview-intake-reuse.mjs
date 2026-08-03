/**
 * 防止版本概览重新维护一套承接流程：概览只能经开发、测试模块公开入口嵌入承接弹窗。
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const [overview, developmentIndex, testingIndex, developmentPage, testingPage] = await Promise.all([
  read('src/modules/overview/pages/OverviewPage.jsx'),
  read('src/modules/development/index.js'),
  read('src/modules/testing/index.js'),
  read('src/modules/development/pages/DevTasksPage.jsx'),
  read('src/modules/testing/pages/TestTasksPage.jsx'),
]);

const required = [
  [developmentIndex, "DevIntakeModal } from './components/DevIntakeModal.jsx'", '开发模块未公开 DevIntakeModal'],
  [testingIndex, "TestIntakeModal } from './components/TestIntakeModal.jsx'", '测试模块未公开 TestIntakeModal'],
  [overview, "DevIntakeModal as SharedDevIntakeModal } from '../../development/index.js'", '概览未从开发模块公开入口引用承接弹窗'],
  [overview, "TestIntakeModal as SharedTestIntakeModal } from '../../testing/index.js'", '概览未从测试模块公开入口引用承接弹窗'],
  [overview, '<SharedDevIntakeModal open={!!devIntakeReq} initialWorkItem={devIntakeReq}', '概览未以当前工作项嵌入开发承接'],
  [overview, '<SharedTestIntakeModal open={!!testIntakeReq} initialWorkItem={testIntakeReq?.req}', '概览未以当前工作项嵌入测试承接'],
  [developmentPage, '<DevIntakeModal\n        open={intakeOpen}', '开发管理页未使用共享开发承接弹窗'],
  [testingPage, '<TestIntakeModal\n        open={intakeOpen}', '测试管理页未使用共享测试承接弹窗'],
];

for (const [source, fragment, error] of required) {
  if (!source.includes(fragment)) throw new Error(error);
}

if (overview.includes('export function DevIntakeModal') || overview.includes('export function TestIntakeModal')) {
  throw new Error('概览仍保留专用承接弹窗实现，不能保证后续与管理页同步');
}

console.log('Overview intake reuse check passed.');
