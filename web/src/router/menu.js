/**
 * 文件：router/menu.js
 * 用途：导航菜单与路由的统一配置。每项含路径、标题、图标、所属权限模块，
 *       供侧栏菜单渲染与路由守卫共用。
 * 作者：hengguan
 * 说明：前端左侧导航菜单配置，定义路由路径、文字标签、图标类以及关联的权限模块。
 */

import React from 'react';
import {
  DashboardOutlined, AppstoreOutlined, FileTextOutlined, CodeOutlined,
  ExperimentOutlined, RocketOutlined, TeamOutlined, SettingOutlined, BugOutlined,
} from '@ant-design/icons';

export const MENU = [
  { key: '/dashboard', label: '效能仪表盘', module: 'dashboard', icon: React.createElement(DashboardOutlined) },
  { key: '/overview', label: '版本概览', module: 'overview', icon: React.createElement(AppstoreOutlined) },
  { key: '/requirements', label: '需求分析', module: 'requirement', icon: React.createElement(FileTextOutlined) },
  { key: '/tickets', label: '工单分析', module: 'ticket', icon: React.createElement(FileTextOutlined) },
  { key: '/dev', label: '开发管理', module: 'dev', icon: React.createElement(CodeOutlined) },
  {
    key: '/test', label: '测试管理', module: 'test.SIT', icon: React.createElement(ExperimentOutlined),
    children: [
      { key: '/test/sit', label: '应用组装测试', module: 'test.SIT' },
      { key: '/test/uat', label: '用户测试', module: 'test.UAT' },
      { key: '/test/nft', label: '非功能测试', module: 'test.NFT' },
      { key: '/test/sec', label: '安全测试', module: 'test.SEC' },
    ],
  },
  {
    key: '/release-mgmt', label: '投产管理', module: 'release_apply', icon: React.createElement(RocketOutlined),
    children: [
      { key: '/release/apply', label: '投产申请', module: 'release_apply' },
      { key: '/release', label: '投产审批', module: 'release' },
      { key: '/issues', label: '问题管理', module: 'issue', icon: React.createElement(BugOutlined) },
    ],
  },
  { key: '/users', label: '人员管理', module: 'user', icon: React.createElement(TeamOutlined) },
  { key: '/settings', label: '系统设置', module: 'settings', icon: React.createElement(SettingOutlined) },
];
