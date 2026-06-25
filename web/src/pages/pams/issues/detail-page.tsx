import React, { useEffect, useState } from 'react';
import { Button, Spin, Space, message } from 'antd';
import { ArrowLeftOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { IssueDetailView } from '@/components/IssueDetailView';
import { useAuth } from '@/components/AuthProvider';
import type { DictItem } from '@/types';
import { pamsFetch } from '@/lib/api-client';

const fetch = pamsFetch;

export default function PamsIssueDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);
  const [dicts, setDicts] = useState<Record<string, DictItem[]>>({
    issue_status: [],
    issue_category: [],
    issue_detailed_classification: [],
    issue_round: [],
    issue_tag: [],
    module: [],
    system: [],
    business_group: [],
    organization: [],
    issue_urgency: [],
    issue_handling_method: [],
  });

  const load = async () => {
    setLoading(true);
    try {
      const types = Object.keys(dicts);
      const [issueRes, ...dictRes] = await Promise.all([
        fetch(`/PAMS/api/issues/${id}`).then((res) => res.json()),
        ...types.map((type) => fetch(`/PAMS/api/dicts?dict_code=${type}`).then((res) => res.json())),
      ]);
      setExists(!!issueRes.success);
      const next = { ...dicts };
      types.forEach((type, index) => {
        if (dictRes[index]?.success) next[type] = dictRes[index].data;
      });
      setDicts(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) load(); }, [id]);

  const handleShare = () => {
    navigator.clipboard.writeText(`${window.location.origin}/#/pams/issues/${id}`);
    message.success('分享链接已复制到剪贴板');
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!exists) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <h2>未找到该问题</h2>
        <Button type="primary" onClick={() => navigate('/pams/issues')}>返回列表</Button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/pams/issues')}>返回</Button>
          <strong>{id}</strong>
        </Space>
        <Button icon={<ShareAltOutlined />} onClick={handleShare} />
      </div>
      <IssueDetailView issueId={id} dicts={dicts} user={user} onRefresh={load} />
    </div>
  );
}
