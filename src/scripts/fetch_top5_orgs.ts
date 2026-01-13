/**
 * 爬取中国和世界各Top5机构的数据，按指定格式输出
 * 
 * 输出格式：
 * - 指标
 * - 和（平均值）
 * - 数据点数
 * - 年份
 * - 国家
 * - 类别
 * - 机构标签
 * - 项目（org/repo）
 * 
 * 使用方法：
 * 1. npm run build
 * 2. node lib/scripts/fetch_top5_orgs.js
 */

import * as https from 'https';
import * as path from 'path';
import { URL } from 'url';
import * as XLSX from 'xlsx';
import { getOutputPath } from '../utils';

type Platform = 'github' | 'gitee';

interface RepoConfig {
  platform: Platform;
  org: string;
  repo: string;
  country?: string;
  category?: string;
  orgLabel?: string;
}

interface FlatRow {
  platform: Platform;
  org: string;
  repo: string;
  metric: string;
  timeKey: string;
  value: number;
  country?: string;
  category?: string;
  orgLabel?: string;
}

// 使用现有的项目列表
const repos: RepoConfig[] = [
  // ===== 全球 Top30 =====
  { platform: 'github', org: 'DigitalPlatDev', repo: 'FreeDomain', country: 'US', category: 'platform', orgLabel: 'DigitalPlatDev' },
  { platform: 'github', org: 'NixOS', repo: 'nixpkgs', country: 'CH', category: 'os', orgLabel: 'NixOS' },
  { platform: 'github', org: 'digitalinnovationone', repo: 'dio-lab-open-source', country: 'BR', category: 'education', orgLabel: 'DIO' },
  { platform: 'github', org: 'llvm', repo: 'llvm-project', country: 'US', category: 'compiler', orgLabel: 'LLVM' },
  { platform: 'github', org: 'home-assistant', repo: 'core', country: 'NL', category: 'iot', orgLabel: 'Home-Assistant' },
  { platform: 'github', org: 'microsoft', repo: 'vscode', country: 'US', category: 'ide', orgLabel: 'Microsoft' },
  { platform: 'github', org: 'openharmony', repo: 'docs', country: 'CN', category: 'os', orgLabel: 'Huawei' },
  { platform: 'github', org: 'firstcontributions', repo: 'first-contributions', country: 'IN', category: 'community', orgLabel: 'FirstContributions' },
  { platform: 'github', org: 'pytorch', repo: 'pytorch', country: 'US', category: 'ai', orgLabel: 'PyTorch' },
  { platform: 'github', org: 'microsoft', repo: 'winget-pkgs', country: 'US', category: 'pkg-mgr', orgLabel: 'Microsoft' },
  { platform: 'github', org: 'flutter', repo: 'flutter', country: 'US', category: 'framework', orgLabel: 'Google' },
  { platform: 'github', org: 'odoo', repo: 'odoo', country: 'BE', category: 'erp', orgLabel: 'Odoo' },
  { platform: 'github', org: 'godotengine', repo: 'godot', country: 'AR', category: 'game', orgLabel: 'Godot' },
  { platform: 'github', org: 'DaoCloud', repo: 'public-image-mirror', country: 'CN', category: 'infra', orgLabel: 'DaoCloud' },
  { platform: 'github', org: 'zephyrproject-rtos', repo: 'zephyr', country: 'US', category: 'iot', orgLabel: 'Zephyr' },
  { platform: 'github', org: 'elastic', repo: 'kibana', country: 'US', category: 'bigdata', orgLabel: 'Elastic' },
  { platform: 'github', org: 'openshift', repo: 'release', country: 'US', category: 'cloud', orgLabel: 'RedHat' },
  { platform: 'github', org: 'rust-lang', repo: 'rust', country: 'US', category: 'language', orgLabel: 'Rust' },
  { platform: 'github', org: 'zed-industries', repo: 'zed', country: 'US', category: 'ide', orgLabel: 'Zed' },
  { platform: 'github', org: 'Expensify', repo: 'App', country: 'US', category: 'app', orgLabel: 'Expensify' },
  { platform: 'github', org: 'ibm-developer-skills-network', repo: 'jbbmo-Introduction-to-Git-and-GitHub', country: 'US', category: 'education', orgLabel: 'IBM' },
  { platform: 'github', org: 'dotnet', repo: 'runtime', country: 'US', category: 'runtime', orgLabel: 'Microsoft' },
  { platform: 'github', org: 'grafana', repo: 'grafana', country: 'SE', category: 'monitoring', orgLabel: 'Grafana' },
  { platform: 'github', org: 'vllm-project', repo: 'vllm', country: 'US', category: 'ai', orgLabel: 'vLLM' },
  { platform: 'github', org: 'langchain-ai', repo: 'langchain', country: 'US', category: 'ai', orgLabel: 'LangChain' },
  { platform: 'github', org: 'kubernetes', repo: 'kubernetes', country: 'US', category: 'cloud', orgLabel: 'CNCF' },
  { platform: 'github', org: 'openshift', repo: 'openshift-docs', country: 'US', category: 'cloud', orgLabel: 'RedHat' },
  { platform: 'github', org: 'python', repo: 'cpython', country: 'NL', category: 'language', orgLabel: 'Python' },
  { platform: 'github', org: 'Kas-tle', repo: 'java2bedrock.sh', country: 'US', category: 'tool', orgLabel: 'Kas-tle' },
  { platform: 'github', org: 'vercel', repo: 'next.js', country: 'US', category: 'frontend', orgLabel: 'Vercel' },

  // ===== 中国 Top30 =====
  { platform: 'github', org: 'openharmony', repo: 'docs', country: 'CN', category: 'os', orgLabel: 'Huawei' },
  { platform: 'github', org: 'DaoCloud', repo: 'public-image-mirror', country: 'CN', category: 'infra', orgLabel: 'DaoCloud' },
  { platform: 'github', org: 'mindspore', repo: 'mindspore', country: 'CN', category: 'ai', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openharmony', repo: 'arkui_ace_engine', country: 'CN', category: 'frontend', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openharmony', repo: 'interface_sdk-js', country: 'CN', category: 'sdk', orgLabel: 'Huawei' },
  { platform: 'github', org: 'apache', repo: 'doris', country: 'CN', category: 'database', orgLabel: 'Apache' },
  { platform: 'github', org: 'openharmony', repo: 'graphic_graphic_2d', country: 'CN', category: 'graphics', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openharmony', repo: 'xts_acts', country: 'CN', category: 'test', orgLabel: 'Huawei' },
  { platform: 'github', org: 'PaddlePaddle', repo: 'Paddle', country: 'CN', category: 'ai', orgLabel: 'Baidu' },
  { platform: 'github', org: 'StarRocks', repo: 'starrocks', country: 'CN', category: 'database', orgLabel: 'StarRocks' },
  { platform: 'github', org: 'ant-design', repo: 'ant-design', country: 'CN', category: 'frontend', orgLabel: 'AntGroup' },
  { platform: 'github', org: 'pingcap', repo: 'tidb', country: 'CN', category: 'database', orgLabel: 'PingCAP' },
  { platform: 'github', org: 'milvus-io', repo: 'milvus', country: 'CN', category: 'database', orgLabel: 'Milvus' },
  { platform: 'github', org: 'espressif', repo: 'esp-idf', country: 'CN', category: 'iot', orgLabel: 'Espressif' },
  { platform: 'github', org: 'openharmony', repo: 'window_window_manager', country: 'CN', category: 'os', orgLabel: 'Huawei' },
  { platform: 'github', org: 'lobehub', repo: 'lobe-chat', country: 'CN', category: 'ai', orgLabel: 'LobeHub' },
  { platform: 'github', org: 'openharmony', repo: 'communication_dsoftbus', country: 'CN', category: 'communication', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openharmony', repo: 'ability_ability_runtime', country: 'CN', category: 'runtime', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openeuler', repo: 'kernel', country: 'CN', category: 'os', orgLabel: 'OpenEuler' },
  { platform: 'github', org: 'opengauss', repo: 'openGauss-server', country: 'CN', category: 'database', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openharmony', repo: 'security_selinux_adapter', country: 'CN', category: 'security', orgLabel: 'Huawei' },
  { platform: 'github', org: '1Panel-dev', repo: '1Panel', country: 'CN', category: 'infra', orgLabel: '1Panel' },
  { platform: 'github', org: 'mindspore', repo: 'mindformers', country: 'CN', category: 'ai', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openharmony', repo: 'arkcompiler_ets_runtime', country: 'CN', category: 'runtime', orgLabel: 'Huawei' },
  { platform: 'github', org: 'matrixorigin', repo: 'matrixone', country: 'CN', category: 'database', orgLabel: 'MatrixOne' },
  { platform: 'github', org: 'openharmony', repo: 'multimedia_audio_framework', country: 'CN', category: 'multimedia', orgLabel: 'Huawei' },
  { platform: 'github', org: 'dataease', repo: 'dataease', country: 'CN', category: 'bigdata', orgLabel: 'DataEase' },
  { platform: 'github', org: 'taosdata', repo: 'TDengine', country: 'CN', category: 'database', orgLabel: 'TDengine' },
  { platform: 'github', org: 'openharmony', repo: 'interface_sdk_c', country: 'CN', category: 'sdk', orgLabel: 'Huawei' },
  { platform: 'github', org: 'openharmony', repo: 'arkcompiler_ets_frontend', country: 'CN', category: 'compiler', orgLabel: 'Huawei' },
];

// Issue相关指标
const issueMetrics = [
  'issues_new',
  'issues_closed',
];

// PR相关指标
const prMetrics = [
  'change_requests',
  'change_requests_accepted',
  'change_requests_closed',
  'change_request_reviews',
];

// 所有指标
const prIssueMetrics = [...issueMetrics, ...prMetrics];

const OSS_BASE = 'https://oss.open-digger.cn';

/**
 * 从时间键中提取年份
 */
function extractYear(timeKey: string): number | null {
  const yearMatch = timeKey.match(/^(\d{4})/);
  if (yearMatch) {
    return parseInt(yearMatch[1], 10);
  }
  return null;
}

/**
 * 从OSS获取JSON数据
 */
function fetchJson(url: string): Promise<any | null> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname,
      method: 'GET',
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          console.warn(`解析JSON失败: ${url}`);
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn(`请求超时: ${url}`);
      resolve(null);
    });

    req.on('error', (err) => {
      console.warn(`请求失败: ${url}, ${err.message}`);
      resolve(null);
    });

    req.end();
  });
}

/**
 * 获取Top5机构（按项目数量或总指标值）
 */
function getTop5Orgs(rows: FlatRow[], isChina: boolean): string[] {
  // 按国家筛选
  const filteredRows = isChina 
    ? rows.filter(r => r.country === 'CN')
    : rows.filter(r => r.country !== 'CN');

  // 按机构标签分组，计算每个机构的项目数和总指标值
  const orgMap = new Map<string, { 
    projectCount: number; 
    totalValue: number;
    projects: Set<string>;
  }>();

  for (const row of filteredRows) {
    if (!row.orgLabel) continue;
    
    const projectKey = `${row.org}/${row.repo}`;
    
    if (!orgMap.has(row.orgLabel)) {
      orgMap.set(row.orgLabel, {
        projectCount: 0,
        totalValue: 0,
        projects: new Set(),
      });
    }
    
    const org = orgMap.get(row.orgLabel)!;
    if (!org.projects.has(projectKey)) {
      org.projects.add(projectKey);
      org.projectCount = org.projects.size;
    }
    org.totalValue += row.value;
  }

  // 按总指标值排序，取Top5
  const sortedOrgs = Array.from(orgMap.entries())
    .sort((a, b) => b[1].totalValue - a[1].totalValue)
    .slice(0, 5)
    .map(([orgLabel]) => orgLabel);

  return sortedOrgs;
}

/**
 * 指标名称映射（英文 -> 中文）
 */
const metricNameMap: Record<string, string> = {
  'issues_new': '新增Issue数',
  'issues_closed': '关闭Issue数',
  'change_requests': 'PR总数',
  'change_requests_accepted': '已接受PR数',
  'change_requests_closed': '已关闭PR数',
  'change_request_reviews': 'PR审查数',
};

/**
 * 按年份聚合数据
 */
function aggregateByYear(rows: FlatRow[]): Array<{
  指标: string;
  和: number;
  数据点数: number;
  年份: number;
  国家: string;
  类别: string;
  机构标签: string;
  项目: string;
}> {
  const yearMap = new Map<string, {
    metric: string;
    year: number;
    sum: number;
    count: number;
    country: string;
    category: string;
    orgLabel: string;
    project: string;
  }>();

  for (const row of rows) {
    const year = extractYear(row.timeKey);
    if (year === null) continue;

    const key = `${row.org}/${row.repo}|${row.metric}|${year}`;
    if (!yearMap.has(key)) {
      yearMap.set(key, {
        metric: row.metric,
        year,
        sum: 0,
        count: 0,
        country: row.country || '',
        category: row.category || '',
        orgLabel: row.orgLabel || '',
        project: `${row.org}/${row.repo}`,
      });
    }
    const item = yearMap.get(key)!;
    item.sum += row.value;
    item.count += 1;
  }

  return Array.from(yearMap.values())
    .sort((a, b) => {
      if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
      if (a.orgLabel !== b.orgLabel) return a.orgLabel.localeCompare(b.orgLabel);
      if (a.project !== b.project) return a.project.localeCompare(b.project);
      return a.year - b.year;
    })
    .map(item => ({
      指标: metricNameMap[item.metric] || item.metric, // 使用中文名称，如果没有映射则使用英文
      和: parseFloat(item.sum.toFixed(4)), // 直接求和（该年份所有数据点的总和）
      数据点数: item.count, // 该年份的原始数据点数量（如2024-01, 2024-02, 2024Q1等合并后的数量）
      年份: item.year,
      国家: item.country,
      类别: item.category,
      机构标签: item.orgLabel,
      项目: item.project,
    }));
}

async function run() {
  console.log('开始从 OSS 拉取 PR 和 Issue 指标数据...');
  console.log(`仓库数: ${repos.length}, 指标数: ${prIssueMetrics.length}`);

  const rows: FlatRow[] = [];
  const errors: { repo: RepoConfig; metric: string; url: string }[] = [];

  // 拉取所有数据
  for (const repo of repos) {
    for (const metric of prIssueMetrics) {
      const url = `${OSS_BASE}/${repo.platform}/${repo.org}/${repo.repo}/${metric}.json`;
      console.log(`拉取 ${repo.platform}/${repo.org}/${repo.repo}/${metric} ...`);
      const json = await fetchJson(url);
      if (!json) {
        errors.push({ repo, metric, url });
        continue;
      }

      for (const [timeKey, v] of Object.entries(json)) {
        if (typeof v !== 'number') continue;
        rows.push({
          platform: repo.platform,
          org: repo.org,
          repo: repo.repo,
          metric,
          timeKey,
          value: v,
          country: repo.country,
          category: repo.category,
          orgLabel: repo.orgLabel,
        });
      }
    }
  }

  console.log(`\n总数据行数: ${rows.length}`);
  if (errors.length > 0) {
    console.log(`有 ${errors.length} 个 (repo, metric) 拉取失败`);
  }

  // 获取Top5机构
  const globalTop5Orgs = getTop5Orgs(rows, false);
  const chinaTop5Orgs = getTop5Orgs(rows, true);

  console.log(`\n全球Top5机构: ${globalTop5Orgs.join(', ')}`);
  console.log(`中国Top5机构: ${chinaTop5Orgs.join(', ')}`);

  // 筛选Top5机构的数据
  const globalRows = rows.filter(r => r.country !== 'CN' && r.orgLabel && globalTop5Orgs.includes(r.orgLabel));
  const chinaRows = rows.filter(r => r.country === 'CN' && r.orgLabel && chinaTop5Orgs.includes(r.orgLabel));

  // 分离Issue和PR数据
  const globalIssueRows = globalRows.filter(r => issueMetrics.includes(r.metric));
  const globalPrRows = globalRows.filter(r => prMetrics.includes(r.metric));
  const chinaIssueRows = chinaRows.filter(r => issueMetrics.includes(r.metric));
  const chinaPrRows = chinaRows.filter(r => prMetrics.includes(r.metric));

  // 按年份聚合
  const globalIssueData = aggregateByYear(globalIssueRows);
  const globalPrData = aggregateByYear(globalPrRows);
  const chinaIssueData = aggregateByYear(chinaIssueRows);
  const chinaPrData = aggregateByYear(chinaPrRows);

  // 输出Excel
  const wb = XLSX.utils.book_new();

  const colWidths = [
    { wch: 25 }, // 指标
    { wch: 15 }, // 和
    { wch: 12 }, // 数据点数
    { wch: 10 }, // 年份
    { wch: 8 },  // 国家
    { wch: 15 }, // 类别
    { wch: 20 }, // 机构标签
    { wch: 40 }, // 项目
  ];

  // 全球Top5机构Issue数据
  const wsGlobalIssue = XLSX.utils.json_to_sheet(globalIssueData);
  wsGlobalIssue['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsGlobalIssue, '全球Top5机构Issue');

  // 全球Top5机构PR数据
  const wsGlobalPr = XLSX.utils.json_to_sheet(globalPrData);
  wsGlobalPr['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsGlobalPr, '全球Top5机构PR');

  // 中国Top5机构Issue数据
  const wsChinaIssue = XLSX.utils.json_to_sheet(chinaIssueData);
  wsChinaIssue['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsChinaIssue, '中国Top5机构Issue');

  // 中国Top5机构PR数据
  const wsChinaPr = XLSX.utils.json_to_sheet(chinaPrData);
  wsChinaPr['!cols'] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsChinaPr, '中国Top5机构PR');

  // 保存到output/excel文件夹
  const baseOutputDir = path.resolve(__dirname, '../../output');
  const outputPath = getOutputPath('top5_orgs_data.xlsx', baseOutputDir);
  XLSX.writeFile(wb, outputPath);

  console.log(`\n数据已保存到: ${outputPath}`);
  console.log(`全球Top5机构Issue数据: ${globalIssueData.length} 行`);
  console.log(`全球Top5机构PR数据: ${globalPrData.length} 行`);
  console.log(`中国Top5机构Issue数据: ${chinaIssueData.length} 行`);
  console.log(`中国Top5机构PR数据: ${chinaPrData.length} 行`);
}

if (require.main === module) {
  run().catch((e) => {
    console.error('❌ 运行出错:', e);
    process.exit(1);
  });
}

