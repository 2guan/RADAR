/**
 * 文件：pages/pams/PamsReport.jsx
 * 用途：PAMS 问题上报-报障人页面。
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AutoComplete, Button, Card, Col, Form, Input, Row, Select, Space, Tag,
  Modal, message,
} from 'antd';
import { DeleteOutlined, SendOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client.js';

const { TextArea } = Input;

const ISSUE_TEMPLATE = `请详细描述问题，要包含以下内容：
【问题现象描述】
【界面菜单】页面菜单信息
【全局流水号】页面报错中的流水号
【操作步骤】
【测试数据】用户信息、客户信息、账户信息等
【报错信息描述+错误代码】可以截图`;

const VERSION_CHANGE_TEMPLATE = `请详细描述换版情况，要包含以下内容：
【情况说明】描述问题发生的现象、原因等。
【解决方案】描述问题解决的方式，程序、参数、数据修改的详细内容。`;

function dictOptions(rows, code) {
  return (rows || [])
    .filter((item) => item.dict_code === code)
    .map((item) => ({ value: item.item_key, label: item.item_value, raw: item }));
}

export default function PamsReport() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [dictRows, setDictRows] = useState([]);
  const [radarOptions, setRadarOptions] = useState({ users: [], systems: [], orgs: [], sectors: [] });
  const [linkedCases, setLinkedCases] = useState([]);
  const [caseInput, setCaseInput] = useState('');
  const [attachmentInput, setAttachmentInput] = useState('');
  const [attachments, setAttachments] = useState([]);

  const dicts = useMemo(() => ({
    category: dictOptions(dictRows, 'issue_category'),
    round: dictOptions(dictRows, 'issue_round'),
    detailed: dictOptions(dictRows, 'issue_detailed_classification'),
    urgency: dictOptions(dictRows, 'issue_urgency'),
    handling: dictOptions(dictRows, 'issue_handling_method'),
  }), [dictRows]);

  const systemOptions = useMemo(() => (radarOptions.systems || []).map((s) => ({
    value: s.sys_code,
    label: `${s.sys_code}-${s.sys_name}`,
    raw: s,
  })), [radarOptions.systems]);

  const userOptions = useMemo(() => (radarOptions.users || []).map((u) => ({
    value: u.name,
    label: `${u.name}${u.org ? ` / ${u.org}` : ''}${u.phone ? ` / ${u.phone}` : ''}`,
    raw: u,
  })), [radarOptions.users]);

  useEffect(() => {
    Promise.all([apiGet('/pams/dicts'), apiGet('/pams/radar-options')])
      .then(([dictRowsRes, radarRes]) => {
        setDictRows(dictRowsRes || []);
        setRadarOptions(radarRes || {});
        const defaultCategory = (dictRowsRes || []).find((d) => d.dict_code === 'issue_category' && d.is_default_val === 1);
        const defaultRound = (dictRowsRes || []).find((d) => d.dict_code === 'issue_round' && d.is_default_val === 1);
        const defaultDetailed = (dictRowsRes || []).find((d) => d.dict_code === 'issue_detailed_classification' && d.is_default_val === 1);
        const defaultUrgency = (dictRowsRes || []).find((d) => d.dict_code === 'issue_urgency' && d.is_default_val === 1);
        const defaultHandling = (dictRowsRes || []).find((d) => d.dict_code === 'issue_handling_method' && d.is_default_val === 1);
        form.setFieldsValue({
          category: defaultCategory?.item_key || '未分类',
          round: defaultRound?.item_key,
          detailed_classification: defaultDetailed?.item_key || '未分类',
          urgency: defaultUrgency?.item_key || '中',
          handling_method: defaultHandling?.item_key || '其它',
          reporter_name: localStorage.getItem('pams_reporter_name') || undefined,
          reporter_contact: localStorage.getItem('pams_reporter_contact') || undefined,
          reporter_org: localStorage.getItem('pams_reporter_org') || undefined,
        });
      })
      .catch((err) => message.error(err.message || '加载上报配置失败'));
  }, [form]);

  const fillTemplate = (template) => {
    const current = form.getFieldValue('details');
    if (current?.trim()) {
      Modal.confirm({
        title: '确认覆盖',
        content: '当前已有内容，是否覆盖？',
        onOk: () => form.setFieldValue('details', template),
      });
    } else {
      form.setFieldValue('details', template);
    }
  };

  const onSystemChange = (value) => {
    const system = radarOptions.systems?.find((s) => s.sys_code === value);
    if (system) {
      form.setFieldsValue({
        module: system.sector,
        business_group: system.org,
      });
    }
  };

  const onUserSelect = (_, option) => {
    const user = option.raw;
    form.setFieldsValue({
      reporter_name: user.name,
      reporter_org: user.org,
      reporter_contact: user.phone,
    });
  };

  const addCase = () => {
    const value = caseInput.trim();
    if (!value) return;
    if (linkedCases.some((item) => item.case_id === value)) {
      message.warning('该案例已关联');
      return;
    }
    setLinkedCases((prev) => [...prev, { case_id: value, case_name: '' }]);
    setCaseInput('');
  };

  const addAttachment = () => {
    const value = attachmentInput.trim();
    if (!value) return;
    setAttachments((prev) => [...prev, value]);
    setAttachmentInput('');
  };

  const onFinish = async (values) => {
    setSaving(true);
    try {
      localStorage.setItem('pams_reporter_name', values.reporter_name || '');
      localStorage.setItem('pams_reporter_contact', values.reporter_contact || '');
      localStorage.setItem('pams_reporter_org', values.reporter_org || '');
      const res = await apiPost('/pams/issues', {
        ...values,
        tracker_name: '',
        tracker_org: '',
        tracker_contact: '',
        attachments,
        linked_cases: linkedCases,
      });
      message.success(`提交成功：${res.issue_id}`);
      navigate('/pams/my-issues');
    } catch (err) {
      message.error(err.message || '提交失败');
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/pams/report`;
    await navigator.clipboard?.writeText(url);
    message.success('链接已复制');
  };

  return (
    <div className="pams-report-page">
      <div className="pams-report-sticky">
        <div className="pams-report-inner pams-report-head">
          <span>　　请详细填写问题，快速上报</span>
          <Space>
            <Button icon={<ShareAltOutlined />} onClick={share} />
            <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={() => form.submit()}>提交问题</Button>
          </Space>
        </div>
      </div>

      <div className="pams-report-inner">
        <Card size="small" variant="borderless">
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="报障人" name="reporter_name" rules={[{ required: true, message: '请输入报障人姓名' }]}>
                  <AutoComplete options={userOptions} onSelect={onUserSelect} placeholder="请输入报障人的姓名并选择" filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="所属机构" name="reporter_org" rules={[{ required: true, message: '请输入所属机构' }]}>
                  <Select
                    showSearch
                    placeholder="选择或由上一步自动带出"
                    options={(radarOptions.orgs || []).map((o) => ({ value: o.attr_value, label: o.display_value || o.attr_value }))}
                    filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="联系方式" name="reporter_contact" rules={[{ required: true, pattern: /^[0-9]+$/, message: '请输入纯数字' }]}>
                  <Input placeholder="常用手机号" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item label="关联案例">
              <Space.Compact style={{ width: '100%' }}>
                <Input value={caseInput} onChange={(e) => setCaseInput(e.target.value)} placeholder="输入案例 ID 或关键字" onPressEnter={addCase} />
                <Button onClick={addCase}>添加</Button>
              </Space.Compact>
              <div className="pams-inline-tags">
                {linkedCases.map((item, index) => (
                  <Tag key={`${item.case_id}-${index}`} closable onClose={() => setLinkedCases((prev) => prev.filter((_, i) => i !== index))} style={{ borderRadius: 0 }}>
                    {item.case_id}
                  </Tag>
                ))}
              </div>
            </Form.Item>

            <Form.Item name="category" hidden><Input /></Form.Item>
            <Form.Item name="round" hidden><Input /></Form.Item>

            <Form.Item label="问题概述" name="summary" rules={[{ required: true, message: '请输入问题概述' }, { max: 100, message: '问题概述不超过100字' }]}>
              <Input maxLength={100} showCount placeholder="一句话描述问题" />
            </Form.Item>

            <Form.Item
              label={
                <Space size={12}>
                  <span>问题详情</span>
                  <Button size="small" type="link" onClick={() => fillTemplate(ISSUE_TEMPLATE)}>填入问题模板</Button>
                  <Button size="small" type="link" onClick={() => fillTemplate(VERSION_CHANGE_TEMPLATE)}>填入换版模板</Button>
                </Space>
              }
              name="details"
              rules={[{ required: true, message: '请输入问题详情' }]}
            >
              <TextArea rows={8} placeholder={ISSUE_TEMPLATE} />
            </Form.Item>

            <Form.Item label="所属系统" name="system" rules={[{ required: true, message: '请选择所属系统' }]}>
              <Select
                showSearch
                placeholder="请选择受影响的系统"
                options={systemOptions}
                onChange={onSystemChange}
                filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>

            <Form.Item label="问题截图/附件">
              <Space.Compact style={{ width: '100%' }}>
                <Input value={attachmentInput} onChange={(e) => setAttachmentInput(e.target.value)} placeholder="粘贴附件路径或链接" onPressEnter={addAttachment} />
                <Button onClick={addAttachment}>添加</Button>
              </Space.Compact>
              <div className="pams-inline-tags">
                {attachments.map((item, index) => (
                  <Tag key={`${item}-${index}`} closable closeIcon={<DeleteOutlined />} onClose={() => setAttachments((prev) => prev.filter((_, i) => i !== index))} style={{ borderRadius: 0 }}>
                    {item}
                  </Tag>
                ))}
              </div>
            </Form.Item>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="所属板块" name="module">
                  <Select
                    disabled
                    placeholder="系统关联板块"
                    options={(radarOptions.sectors || []).map((s) => ({ value: s.attr_value, label: s.display_value || s.attr_value }))}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="所属实施机构" name="business_group">
                  <Select
                    disabled
                    placeholder="系统关联实施机构"
                    options={(radarOptions.orgs || []).map((o) => ({ value: o.attr_value, label: o.display_value || o.attr_value }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={8}>
                <Form.Item label="详细分类" name="detailed_classification">
                  <Select options={dicts.detailed} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="紧急程度" name="urgency">
                  <Select options={dicts.urgency} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="处理方式" name="handling_method">
                  <Select options={dicts.handling} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Card>
      </div>
    </div>
  );
}
