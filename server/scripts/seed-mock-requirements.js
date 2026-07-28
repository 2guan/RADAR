/**
 * Mock 数据脚本：为需求分析模块写入测试数据
 * 运行方式：cd server && node scripts/seed-mock-requirements.js
 */
import { loadEnvFile } from '../src/platform/runtime/env.js';
import { run, tx } from '../src/platform/persistence/index.js';
import { config } from '../src/platform/runtime/config.js';

loadEnvFile('../.env');

async function seed() {
  const reqTypes = ['新增监管需求', '新增优化需求', '延期需求', '急迫需求'];
  const statuses = ['需求登记', '需求分析', '分析完成'];
  const priorities = ['高', '中', '低'];
  const depts = ['风险管理板块', '计划财务板块', '渠道运营板块', '信贷管理板块', '对私金融板块', '对公金融板块'];

  const proposers = [
    { name: '张伟', phone: '13800001001' },
    { name: '李娜', phone: '13800001002' },
    { name: '王磊', phone: '13800001003' },
    { name: '陈静', phone: '13800001004' },
    { name: '刘洋', phone: '13800001005' },
    { name: '赵敏', phone: '13800001006' },
    { name: '周强', phone: '13800001007' },
  ];

  const systems = [
    { code: 'YN0320', name: '反电诈账户风险监测系统' },
    { code: 'WP9001', name: '公共综合管理报表P9' },
    { code: 'W0741Y-BASS', name: '监管应用-BASS_集中银行账户报送' },
    { code: 'YN0010', name: '财务管理系统' },
    { code: 'W01812', name: '存款-对公' },
    { code: 'WP5018', name: 'P5-存款信息报送' },
    { code: 'W11433', name: '定价管理' },
    { code: 'W03310', name: '支付结算-P6' },
    { code: 'W02016', name: '新一代个贷服务整合子系统' },
    { code: 'W10010', name: '反洗钱' },
  ];

  const mockRequirements = [
    {
      req_code: 'RC_202507_001',
      title: '反电诈账户风险监测-新增可疑交易识别模型',
      summary: '基于机器学习算法新增3类可疑交易识别模型，提升反电诈系统风险识别准确率至95%以上',
      status: '需求分析',
      req_type: '新增监管需求',
      priority: '高',
      propose_dept: '风险管理板块',
      proposer: JSON.stringify(['张伟']),
      yn_owner: '张伟',
      propose_time: '2026-07-05',
      main_systems: JSON.stringify(['YN0320']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '否',
    },
    {
      req_code: 'RC_202507_002',
      title: '监管报表P9-新增反洗钱大额交易报送模板',
      summary: '根据人民银行最新要求，在P9报表系统新增反洗钱大额交易报送模板，支持T+1自动生成报送文件',
      status: '分析完成',
      req_type: '新增监管需求',
      priority: '高',
      propose_dept: '风险管理板块',
      proposer: JSON.stringify(['李娜']),
      yn_owner: '李娜',
      propose_time: '2026-07-03',
      main_systems: JSON.stringify(['WP9001', 'W10010']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '是',
    },
    {
      req_code: 'RC_202507_003',
      title: '对公存款系统-优化定期存款到期自动转存流程',
      summary: '优化定期存款到期自动转存逻辑，支持部分金额转存+剩余金额解冻到活期的灵活配置模式',
      status: '需求登记',
      req_type: '新增优化需求',
      priority: '中',
      propose_dept: '对公金融板块',
      proposer: JSON.stringify(['王磊']),
      yn_owner: '王磊',
      propose_time: '2026-07-15',
      main_systems: JSON.stringify(['W01812']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '是',
    },
    {
      req_code: 'RC_202507_004',
      title: '定价管理系统-新增贷款利率差异化定价模型',
      summary: '基于客户信用等级、担保方式和贷款期限三个维度，实现贷款利率差异化自动定价',
      status: '需求分析',
      req_type: '新增优化需求',
      priority: '高',
      propose_dept: '计划财务板块',
      proposer: JSON.stringify(['陈静']),
      yn_owner: '陈静',
      propose_time: '2026-07-08',
      main_systems: JSON.stringify(['W11433']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '否',
    },
    {
      req_code: 'RC_202507_005',
      title: '个贷系统-新增线上签约流程适配移动端',
      summary: '在个贷业务流程中新增移动端线上签约功能，支持人脸识别+电子签章，适配iOS和Android双平台',
      status: '需求分析',
      req_type: '新增优化需求',
      priority: '中',
      propose_dept: '信贷管理板块',
      proposer: JSON.stringify(['刘洋']),
      yn_owner: '刘洋',
      propose_time: '2026-07-10',
      main_systems: JSON.stringify(['W02016']),
      collab_dev_systems: JSON.stringify(['TA2320']),
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: 'ISSUE-2026-0042',
      is_accounting: '否',
    },
    {
      req_code: 'RC_202507_006',
      title: '支付结算系统-网银跨行转账超时自动冲正',
      summary: '网银跨行转账超过60秒未收到对方行应答时，自动发起冲正交易，避免长时间挂账',
      status: '分析完成',
      req_type: '急迫需求',
      priority: '高',
      propose_dept: '渠道运营板块',
      proposer: JSON.stringify(['赵敏']),
      yn_owner: '赵敏',
      propose_time: '2026-07-01',
      main_systems: JSON.stringify(['W03310']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: 'ISSUE-2026-0038',
      is_accounting: '是',
    },
    {
      req_code: 'RC_202507_007',
      title: '财务管理-新增预算执行偏差预警功能',
      summary: '对各板块预算执行率进行实时监控，当执行偏差超过±15%时自动推送告警消息给财务负责人',
      status: '需求登记',
      req_type: '新增优化需求',
      priority: '低',
      propose_dept: '计划财务板块',
      proposer: JSON.stringify(['周强']),
      yn_owner: '周强',
      propose_time: '2026-07-20',
      main_systems: JSON.stringify(['YN0010']),
      collab_dev_systems: JSON.stringify(['TA2320']),
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '是',
    },
    {
      req_code: 'RC_202507_008',
      title: '反洗钱系统-制裁名单筛查接口升级至UN 2026版',
      summary: '将制裁名单筛查接口从UN 2025版升级至UN 2026版，同步更新命中规则和处置流程',
      status: '需求分析',
      req_type: '新增监管需求',
      priority: '高',
      propose_dept: '风险管理板块',
      proposer: JSON.stringify(['张伟']),
      yn_owner: '张伟',
      propose_time: '2026-07-12',
      main_systems: JSON.stringify(['W10010']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '否',
    },
    {
      req_code: 'RC_202507_009',
      title: 'BASS集中报送-新增人民币跨境支付CIPS数据报送',
      summary: '根据人行要求，BASS集中银行账户报送系统新增人民币跨境支付(CIPS)数据报送接口',
      status: '需求分析',
      req_type: '新增监管需求',
      priority: '中',
      propose_dept: '计划财务板块',
      proposer: JSON.stringify(['李娜']),
      yn_owner: '李娜',
      propose_time: '2026-07-14',
      main_systems: JSON.stringify(['W0741Y-BASS']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '是',
    },
    {
      req_code: 'RC_202507_010',
      title: '对公存款-通知存款利息计算方式调整',
      summary: '通知存款提前支取部分按活期利率计息，续存部分维持原通知存款利率不变',
      status: '分析完成',
      req_type: '延期需求',
      priority: '低',
      propose_dept: '对公金融板块',
      proposer: JSON.stringify(['王磊']),
      yn_owner: '王磊',
      propose_time: '2026-06-25',
      main_systems: JSON.stringify(['W01812']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: 'ISSUE-2026-0025',
      is_accounting: '是',
    },
    {
      req_code: 'RC_202507_011',
      title: '个贷系统-住房贷款LPR加点幅度动态调整',
      summary: '支持按年重定价日自动根据最新LPR调整住房贷款利率加点幅度，适配存量房贷利率调整政策',
      status: '需求登记',
      req_type: '急迫需求',
      priority: '高',
      propose_dept: '信贷管理板块',
      proposer: JSON.stringify(['刘洋']),
      yn_owner: '刘洋',
      propose_time: '2026-07-22',
      main_systems: JSON.stringify(['W02016']),
      collab_dev_systems: JSON.stringify(['W11433']),
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '是',
    },
    {
      req_code: 'RC_202507_012',
      title: '反电诈系统-新增老年人受骗转账智能拦截',
      summary: '针对65岁以上老年客户大额转账，引入AI行为分析模型，对可疑交易自动触发电话核实流程',
      status: '需求分析',
      req_type: '新增监管需求',
      priority: '中',
      propose_dept: '风险管理板块',
      proposer: JSON.stringify(['赵敏']),
      yn_owner: '赵敏',
      propose_time: '2026-07-16',
      main_systems: JSON.stringify(['YN0320']),
      collab_dev_systems: '[]',
      collab_test_systems: '[]',
      release_point_id: 1,
      issue_no: null,
      is_accounting: '否',
    },
  ];

  await tx(async () => {
    for (const r of mockRequirements) {
      await run(
        `INSERT INTO requirement 
           (req_code, title, summary, status, req_type, priority, propose_dept, proposer, yn_owner, propose_time, 
            main_systems, collab_dev_systems, collab_test_systems, release_point_id, issue_no, is_accounting, 
            registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        r.req_code, r.title, r.summary, r.status, r.req_type, r.priority,
        r.propose_dept, r.proposer, r.yn_owner, r.propose_time,
        r.main_systems, r.collab_dev_systems, r.collab_test_systems,
        r.release_point_id, r.issue_no, r.is_accounting,
        '超级管理员', '2026-07-28'
      );
    }
    console.log(`已插入 ${mockRequirements.length} 条需求 mock 数据`);
  });

  // 输出统计
  console.log('优先级分布：');
  for (const p of priorities) {
    const count = mockRequirements.filter(r => r.priority === p).length;
    console.log(`  ${p}: ${count} 条`);
  }
  console.log('\n状态分布：');
  for (const s of statuses) {
    const count = mockRequirements.filter(r => r.status === s).length;
    console.log(`  ${s}: ${count} 条`);
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
