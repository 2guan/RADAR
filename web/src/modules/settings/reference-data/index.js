/**
 * 文件：web/src/modules/settings/reference-data/index.js
 * 说明：参考数据仍由设置模块拥有；其他模块只能经本入口读取和展示。
 * 用途：字典、人员、系统和投产点的前端公开契约。
 * 作者：hengguan
 */

export { default as DictSelect } from './components/DictSelect.jsx';
export { default as PersonPicker } from './components/PersonPicker.jsx';
export { default as SystemNameInput, SystemNamesSelect } from './components/SystemNameInput.jsx';
export { default as SystemSelect } from './components/SystemSelect.jsx';
export { ReleasePointText, ReleasePointOptionLabel, formatReleasePointDate, makeReleasePointOptions, releasePointFilter } from './components/ReleasePointText.jsx';
