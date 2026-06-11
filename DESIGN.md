---
name: RADAR · 日常需求研发流程管理平台
description: 精密、沉稳、数据导向的现代企业研发控制台
colors:
  primary: "#0E9F6E"
  primary-deep: "#0B7D56"
  primary-soft: "#0E9F6E33"
  success: "#52C41A"
  processing: "#13C2C2"
  warning: "#FAAD14"
  error: "#CF1322"
  accent-violet: "#722ED1"
  accent-magenta: "#EB2F96"
  ink: "#1F1F1F"
  ink-secondary: "#666666"
  neutral-bg-light: "#F5F5F5"
  surface-light: "#FFFFFF"
  neutral-bg-dark: "#141414"
  surface-dark: "#1F1F1F"
  ink-dark: "#E6E6E6"
  ink-secondary-dark: "#AAAAAA"
  login-gradient-1: "#0B3D2E"
  login-gradient-2: "#0F5132"
  login-gradient-3: "#0A2E22"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "1px"
  title:
    fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5715
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  status-badge:
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
  input:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "32px"
---

## Overview

**Creative North Star — "精密研发控制台 (The Precision Console)"。** RADAR 看起来应当像一台为金融研发协作而生、运转精良的控制台：现代、有质感、信息密集而不拥挤，每一处视觉都为"看清状态、高效填报、可追溯"服务。

气质关键词：**精密 · 沉稳 · 数据导向**。视觉语言克制现代，带科技感，但不炫技、不重动效、不卖弄。识别色是**翡翠青绿 `#0E9F6E`（刻意非蓝）**，呼应代号 RADAR 的"雷达扫描"意象。

支持白天/夜间双主题（基于 Ant Design `defaultAlgorithm` / `darkAlgorithm`），首次跟随系统 `prefers-color-scheme`，偏好持久化。全中文界面，无中英混杂。

**它不应是什么**：不是营销 landing（无 hero 大标语/巨型字号/滚动叙事）；不是消费级大留白低密度界面；不是"默认蓝 + 到处圆角阴影 + 组件库原味"的廉价模板；动效不喧宾夺主。

布局采用经典 app-shell：可收起侧栏 + 顶栏（平台名 / 投产窗口全局选择器 / 明暗切换 / 用户菜单）+ 内容区 + 页脚版权。响应式三档：PC（≥1024）/ PAD（768–1024）/ 手机（<768，侧栏转抽屉、列表 Table 转卡片）。间距走 8 的倍数栅格。

## Colors

主色 **翡翠青绿 `#0E9F6E`（Emerald）** 用于品牌标识、主按钮、选中态、进度条已完成节点、关键数值。深色态 `#0B7D56` 用于 hover；`#0E9F6E33`（13% 透明）用于选中态柔光。

语义色服务于"状态先行"原则，刻意避开蓝色主调以免与功能色混淆：

- **成功/终态** `#52C41A`（需求完成、开发完成、测试完成、已上线、已签署、已投产、评审通过）
- **进行中** `#13C2C2` 青（需求分析、开发设计/实施、测试方案/实施/报告等）
- **预警/待办** `#FAAD14` 琥珀（待评审、待投产、未签署）
- **异常** `#CF1322` 品红（已驳回、已取消）
- 图表扩展配色：`#0E9F6E → #52C41A → #13C2C2 → #FAAD14 → #EB2F96 → #722ED1`，随明暗模式联动。

中性色用石墨灰阶（由 AntD 算法生成）。明亮模式：背景 `#F5F5F5`、卡面 `#FFFFFF`、正文 `#1F1F1F`、次要文字 `#666`。夜间模式：背景 `#141414`、卡面 `#1F1F1F`、正文 `#E6E6E6`、次要文字 `#AAA`。登录页用深翡翠渐变（`#0B3D2E / #0F5132 / #0A2E22`）。

**对比度纪律（WCAG AA）**：正文 ≥4.5:1、大字号 ≥3:1，占位符同样达标；夜间模式严禁低对比"暗灰字"。状态不只靠颜色——徽章始终带中文文案、进度条节点配标签。

## Typography

单一系统字体栈：`-apple-system, PingFang SC, Microsoft YaHei, …`，中文优先、跨平台稳定，不引入额外字体造成混搭或加载负担（呼应"克制"原则）。

层级：**Display 30px/700**（登录品牌、强标题，letter-spacing 1px）；**Title 16px/600**（卡片/弹窗标题）；**Body 14px/400**（默认正文与表单，行高 1.5715）；**Label 12px/400**（次要说明、徽章、进度标签、辅助提示）。正文行长在长文本处控制在 65–75ch 内。

## Elevation

整体**偏平、以分层（tonal layering）为主**，阴影克制、仅作结构性提示而非装饰：

- 卡片/弹窗：轻微阴影（约 `0 1px 4px rgba(0,0,0,.06)`，顶栏同级），区分层级但不喧哗。
- 可点击卡片 hover：上浮 `translateY(-2px)` + 加重阴影（`0 4px 16px rgba(0,0,0,.12)`），提供"可点击"的克制反馈。
- 选中态/聚焦：用主色柔光环（`#0E9F6E33`）而非重投影。
- 圆角统一 `8px`（按钮/卡片/输入/弹窗），徽章 `4px`，标签/进度点用圆形。

## Components

- **按钮**：主操作用实心翡翠绿主按钮；次级用默认/文本按钮；危险操作（删除/驳回）用红色 + 二次确认（Popconfirm/Modal.confirm）。高 32px，圆角 8px。
- **状态徽章 (StatusBadge)**：全平台状态的唯一表达方式，按语义映射颜色 + 中文文案，圆角 4px。
- **数据表格 (DataTable)**：统一承载搜索（输入即搜）/筛选/列头排序/列宽拖拽/分页/导入导出；窄屏自动转卡片列表。是产品"密度即效率"的主载体。
- **卡片**：概览/移动端列表的基本单元；含编号、系统标签、状态徽章、进度条。
- **进度条 (ChainBar)**：横向连接各阶段节点（done/doing/pending 三态着色），节点下标注阶段名，非功能/安全测试按需出现。
- **选择器**：DictSelect / SystemSelect / PersonPicker 统一支持跨机构/系统名称的模糊检索、输入即搜。
- **弹窗/抽屉**：详情与填报在原位弹窗一次完成；右上角附"历史记录"抽屉（过程留痕）。
- **图表 (ECharts)**：主题随明暗联动，配色与主色协调；柱/面积/饼/表格，颜色可配。

## Do's and Don'ts

**Do**
- 让状态成为每个界面最先被读到的信息（徽章/进度/语义色）。
- 在不拥挤的前提下追求高信息密度，减少点击与跳转。
- 复用统一封装组件（DataTable/弹窗/选择器/StatusBadge/ChainBar），保持全平台一致。
- 用精准的间距、对齐、层级与克制的微反馈营造质感。
- 两套主题分别校验对比度；状态同时用文案/图标，不只靠颜色。

**Don't**
- 不要把蓝色当主色或语义主调（识别色是翡翠绿）。
- 不要堆叠装饰、重动效、炫光、过场——动效只为状态反馈与空间连续性。
- 不要消费级大留白/低密度，也不要一屏塞满到难以扫读。
- 不要中英混杂；能用中文处一律中文。
- 不要让组件风格在不同模块间漂移；新页面先复用既有组件再考虑新增。
