/**
 * @file BasicConfig.tsx
 * @description PAMS 系统功能页面 / 提供 [config/components/BasicConfig.tsx] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useState } from 'react';
import DictEditor from './DictEditor';
import ConfigSection from './ConfigSection';

export default function BasicConfig() {
    const [activeKey, setActiveKey] = useState('issue_round');

    const items = [
        {
            key: 'issue_round',
            label: '问题轮次',
            children: <DictEditor dictCode="issue_round" title="问题轮次" description="管理问题发生的轮次" />
        },
        {
            key: 'issue_status',
            label: '问题状态',
            children: <DictEditor dictCode="issue_status" title="问题状态" description="管理问题的生命周期状态" />
        },
        {
            key: 'issue_category',
            label: '问题分类',
            children: <DictEditor dictCode="issue_category" title="问题分类" description="管理问题的大类" />
        },
        {
            key: 'issue_detailed_classification',
            label: '详细分类',
            children: <DictEditor dictCode="issue_detailed_classification" title="问题详细分类" description="管理具体的问题原因子类" />
        },
        {
            key: 'issue_tag',
            label: '问题标签',
            children: <DictEditor dictCode="issue_tag" title="问题标签" description="用于标记常见问题的特殊属性" />
        },
        {
            key: 'issue_urgency',
            label: '紧急程度',
            children: <DictEditor dictCode="issue_urgency" title="紧急程度" description="管理问题的紧急程度等级" />
        },
        {
            key: 'issue_handling_method',
            label: '处理方式',
            children: <DictEditor dictCode="issue_handling_method" title="处理方式" description="管理问题的解决手段" />
        }
    ];

    return (
        <ConfigSection
            items={items}
            activeKey={activeKey}
            onChange={setActiveKey}
        />
    );
}
