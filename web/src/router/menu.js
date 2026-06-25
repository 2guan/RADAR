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

export const PAMS_TOP_MENU = [
  { key: '/pams/dashboard', label: '统计仪表盘', module: 'pams' },
  {
    key: 'pams-report', label: '问题上报', module: 'pams',
    children: [
      { key: '/pams/report', label: '问题上报-报障人', module: 'pams' },
      { key: '/pams/report-tracker', label: '问题上报-跟踪人', module: 'pams' },
      { key: '/pams/report-ticket', label: '问题上报-工单', module: 'pams' },
    ],
  },
  {
    key: 'pams-detail', label: '问题详情', module: 'pams',
    children: [
      { key: '/pams/my-issues', label: '我的问题', module: 'pams' },
      { key: '/pams/issues', label: '问题管理', module: 'pams' },
      { key: '/pams/major-issues', label: '重大问题', module: 'pams' },
      { key: '/pams/faq', label: '常见问题', module: 'pams' },
    ],
  },
  {
    key: 'pams-ticket', label: '工单明细', module: 'pams',
    children: [
      { key: '/pams/business-ticket', label: '业务工单', module: 'pams' },
      { key: '/pams/kongming', label: '孔明工单', module: 'pams' },
      { key: '/pams/itsm', label: 'ITSM工单', module: 'pams' },
    ],
  },
  {
    key: 'pams-analysis', label: '问题分析', module: 'pams',
    children: [
      { key: '/pams/problem-report', label: '问题快报', module: 'pams' },
      { key: '/pams/analyst', label: '分析报告', module: 'pams' },
    ],
  },
  { key: '/pams/config', label: '系统配置', module: 'pams' },
];

export const MENU = [
  { key: '/dashboard', label: '效能仪表盘', module: 'dashboard', icon: React.createElement(DashboardOutlined) },
  { key: '/overview', label: '版本概览', module: 'overview', icon: React.createElement(AppstoreOutlined) },
  { key: '/requirements', label: '需求分析', module: 'requirement', icon: React.createElement(FileTextOutlined) },
  { key: '/dev', label: '开发管理', module: 'dev', icon: React.createElement(CodeOutlined) },
  {
    key: '/test', label: '测试管理', module: 'test', icon: React.createElement(ExperimentOutlined),
    children: [
      { key: '/test/sit', label: '应用组装测试', module: 'test' },
      { key: '/test/uat', label: '用户测试', module: 'test' },
      { key: '/test/nft', label: '非功能测试', module: 'test' },
      { key: '/test/sec', label: '安全测试', module: 'test' },
    ],
  },
  {
    key: '/release-mgmt', label: '投产管理', module: 'release_apply', icon: React.createElement(RocketOutlined),
    children: [
      { key: '/release/apply', label: '投产申请', module: 'release_apply' },
      { key: '/release', label: '投产审批', module: 'release' },
    ],
  },
  { key: '/pams/dashboard', label: '问题管理', module: 'pams', icon: React.createElement(BugOutlined) },
  { key: '/users', label: '人员管理', module: 'user', icon: React.createElement(TeamOutlined) },
  { key: '/settings', label: '系统设置', module: 'settings', icon: React.createElement(SettingOutlined) },
];
