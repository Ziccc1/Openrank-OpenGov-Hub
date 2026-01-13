/**
 * 从 OpenDigger OSS 批量拉取 PR 和 Issue 相关指标数据
 *
 * 输出文件：
 * - oss_pr_issue_data.json (JSON格式)
 * - oss_pr_issue_data.csv (CSV格式)
 *
 * 使用方法：
 * 1. 修改下面的 repos 列表，填入你关心的仓库（platform/org/repo）
 * 2. 在 OpenGov Hub 目录执行：npm run build
 * 3. 在 OpenGov Hub 目录执行：node lib/scripts/fetch_issue_pr_data.js
 */

import * as fs from 'fs';
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
  /** 国家/地区代码，建议用 ISO 3166-1 alpha-2 */
  country?: string;
  /** 项目类别，例如 database / cloud_native / ai */
  category?: string;
  /** 自定义标签，例如机构名称 */
  orgLabel?: string;
}

// 全球 Top30 和中国 Top30 项目列表
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

/**
 * PR 和 Issue 相关的指标列表
 */
const prIssueMetrics = [
  // Issue 相关指标
  'issues_new',                    // 新增 Issue 数量
  'issues_closed',                 // 关闭的 Issue 数量
  'issue_resolution_duration',     // Issue 解决时长
  'issue_response_time',           // Issue 响应时间
  'issue_age',                     // Issue 年龄（未解决的 Issue 存在时间）
  
  // PR / Change Requests 相关指标
  'change_requests',               // PR 总数
  'change_requests_accepted',      // 被接受的 PR 数量
  'change_requests_declined',      // 被拒绝的 PR 数量
  'change_requests_acceptance_ratio', // PR 接受率
  'change_requests_duration',      // PR 处理时长
  'change_requests_response_time', // PR 响应时间
  'change_request_age',            // PR 年龄（未处理的 PR 存在时间）
] as const;

type MetricName = (typeof prIssueMetrics)[number];

// Issue 相关指标
const issueMetrics = [
  'issues_new',
  'issues_closed',
  'issue_resolution_duration',
  'issue_response_time',
  'issue_age',
] as const;

// PR 相关指标
const prMetrics = [
  'change_requests',
  'change_requests_accepted',
  'change_requests_declined',
  'change_requests_acceptance_ratio',
  'change_requests_duration',
  'change_requests_response_time',
  'change_request_age',
] as const;

const OSS_BASE = 'https://oss.open-digger.cn';

interface FlatRow {
  platform: Platform;
  org: string;
  repo: string;
  metric: MetricName;
  /** 时间键：如 2020 / 2020-08 / 2020Q3 等 */
  timeKey: string;
  value: number;
  /** 可选增强字段 */
  country?: string;
  category?: string;
  orgLabel?: string;
}

function fetchJson(url: string): Promise<any | null> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        protocol: u.protocol,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          console.warn(`⚠️  请求失败 ${res.statusCode} - ${url}`);
          res.resume();
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk.toString('utf-8')));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            console.warn(`⚠️  解析 JSON 失败: ${url}`, e);
            resolve(null);
          }
        });
      },
    );
    req.on('error', (err) => {
      console.warn(`⚠️  请求出错: ${url}`, err);
      resolve(null);
    });
    req.setTimeout(30000, () => {
      req.destroy();
      console.warn(`⚠️  请求超时: ${url}`);
      resolve(null);
    });
  });
}

/**
 * 将数据转换为 CSV 格式
 */
function toCsv(rows: FlatRow[]): string {
  const header = [
    'platform',
    'org',
    'repo',
    'metric',
    'timeKey',
    'value',
    'country',
    'category',
    'orgLabel',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    // 简单转义逗号/引号
    const esc = (v: any) => {
      const s = v === undefined || v === null ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    lines.push([
      esc(r.platform),
      esc(r.org),
      esc(r.repo),
      esc(r.metric),
      esc(r.timeKey),
      esc(r.value),
      esc(r.country),
      esc(r.category),
      esc(r.orgLabel),
    ].join(','));
  }
  return lines.join('\n');
}

/**
 * 从时间键中提取年份
 * 支持格式：2024, 2024-08, 2024Q3, 2024-08-15 等
 */
function extractYear(timeKey: string): number | null {
  // 匹配年份（4位数字）
  const yearMatch = timeKey.match(/^(\d{4})/);
  if (yearMatch) {
    return parseInt(yearMatch[1], 10);
  }
  return null;
}

/**
 * 按年份聚合数据（按项目+指标+年份聚合）
 */
function aggregateByYear(rows: FlatRow[]): Array<{
  platform: string;
  org: string;
  repo: string;
  metric: string;
  year: number;
  avgValue: number;
  count: number;
  country?: string;
  category?: string;
  orgLabel?: string;
}> {
  const map = new Map<string, { 
    sum: number; 
    count: number; 
    row: FlatRow;
  }>();
  
  for (const row of rows) {
    const year = extractYear(row.timeKey);
    if (year === null) continue; // 跳过无法解析年份的数据
    
    const key = `${row.platform}|${row.org}|${row.repo}|${row.metric}|${year}`;
    if (!map.has(key)) {
      map.set(key, { sum: 0, count: 0, row });
    }
    const item = map.get(key)!;
    item.sum += row.value;
    item.count += 1;
  }
  
  return Array.from(map.values()).map(item => {
    const year = extractYear(item.row.timeKey)!;
    return {
      platform: item.row.platform,
      org: item.row.org,
      repo: item.row.repo,
      metric: item.row.metric,
      year,
      avgValue: item.sum / item.count,
      count: item.count,
      country: item.row.country,
      category: item.row.category,
      orgLabel: item.row.orgLabel,
    };
  });
}

/**
 * 按时间维度计算均值（按项目+指标聚合，显示年份范围）
 */
function calculateTimeAverage(rows: FlatRow[]): Array<{
  platform: string;
  org: string;
  repo: string;
  metric: string;
  avgValue: number;
  count: number;
  yearRange: string;
  country?: string;
  category?: string;
  orgLabel?: string;
}> {
  // 先按年份聚合
  const yearData = aggregateByYear(rows);
  
  // 再按项目+指标聚合，计算总体平均值和年份范围
  const map = new Map<string, { 
    sum: number; 
    count: number; 
    row: FlatRow;
    years: Set<number>;
  }>();
  
  for (const item of yearData) {
    const key = `${item.platform}|${item.org}|${item.repo}|${item.metric}`;
    if (!map.has(key)) {
      map.set(key, { 
        sum: 0, 
        count: 0, 
        row: {
          platform: item.platform as Platform,
          org: item.org,
          repo: item.repo,
          metric: item.metric as MetricName,
          timeKey: '',
          value: 0,
          country: item.country,
          category: item.category,
          orgLabel: item.orgLabel,
        },
        years: new Set()
      });
    }
    const mapItem = map.get(key)!;
    // 使用年份的平均值乘以年份数量来累加
    mapItem.sum += item.avgValue * item.count;
    mapItem.count += item.count;
    mapItem.years.add(item.year);
  }
  
  return Array.from(map.values()).map(item => {
    // 计算年份范围
    const sortedYears = Array.from(item.years).sort((a, b) => a - b);
    const earliestYear = sortedYears[0];
    const latestYear = sortedYears[sortedYears.length - 1];
    
    let yearRange = '';
    if (earliestYear === latestYear) {
      yearRange = String(earliestYear);
    } else {
      yearRange = `${earliestYear}-${latestYear}`;
    }
    
    return {
      platform: item.row.platform,
      org: item.row.org,
      repo: item.row.repo,
      metric: item.row.metric,
      avgValue: item.sum / item.count,
      count: item.count,
      yearRange,
      country: item.row.country,
      category: item.row.category,
      orgLabel: item.row.orgLabel,
    };
  });
}

/**
 * 将数据转换为 Excel 格式（按世界/中国分组，每个指标类型放在一块）
 */
function toExcel(rows: FlatRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  
  // 分离世界和中国数据
  const globalRows = rows.filter(r => r.country !== 'CN');
  const chinaRows = rows.filter(r => r.country === 'CN');
  
  // ===== 工作表1：世界数据（原始数据，按指标类型分组）=====
  const globalData = globalRows.sort((a, b) => {
    // 先按指标排序，再按组织、仓库排序
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    if (a.org !== b.org) return a.org.localeCompare(b.org);
    return a.repo.localeCompare(b.repo);
  });
  
  const globalJsonData = globalData.map(r => ({
    '平台': r.platform,
    '组织': r.org,
    '仓库': r.repo,
    '指标': r.metric,
    '时间键': r.timeKey,
    '数值': r.value,
    '国家': r.country || '',
    '类别': r.category || '',
    '机构标签': r.orgLabel || '',
  }));
  
  const wsGlobal = XLSX.utils.json_to_sheet(globalJsonData);
  wsGlobal['!cols'] = [
    { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
    { wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsGlobal, '世界原始数据');
  
  // ===== 工作表2：世界数据（按年份聚合，按指标类型分组）=====
  const globalYearData = aggregateByYear(globalRows).sort((a, b) => {
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    if (a.org !== b.org) return a.org.localeCompare(b.org);
    if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
    return a.year - b.year;
  });
  
  const globalYearJsonData = globalYearData.map(r => ({
    '平台': r.platform,
    '组织': r.org,
    '仓库': r.repo,
    '指标': r.metric,
    '年份': r.year,
    '平均值': parseFloat(r.avgValue.toFixed(4)),
    '数据点数': r.count,
    '国家': r.country || '',
    '类别': r.category || '',
    '机构标签': r.orgLabel || '',
  }));
  
  const wsGlobalYear = XLSX.utils.json_to_sheet(globalYearJsonData);
  wsGlobalYear['!cols'] = [
    { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
    { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsGlobalYear, '世界按年份聚合');
  
  // ===== 工作表3：世界数据（时间维度均值，按指标类型分组）=====
  const globalAvgData = calculateTimeAverage(globalRows).sort((a, b) => {
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    if (a.org !== b.org) return a.org.localeCompare(b.org);
    return a.repo.localeCompare(b.repo);
  });
  
  const globalAvgJsonData = globalAvgData.map(r => ({
    '平台': r.platform,
    '组织': r.org,
    '仓库': r.repo,
    '指标': r.metric,
    '年份范围': r.yearRange,
    '平均值': parseFloat(r.avgValue.toFixed(4)),
    '数据点数': r.count,
    '国家': r.country || '',
    '类别': r.category || '',
    '机构标签': r.orgLabel || '',
  }));
  
  const wsGlobalAvg = XLSX.utils.json_to_sheet(globalAvgJsonData);
  wsGlobalAvg['!cols'] = [
    { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
    { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsGlobalAvg, '世界时间均值');
  
  // ===== 工作表4：中国数据（原始数据，按指标类型分组）=====
  const chinaData = chinaRows.sort((a, b) => {
    // 先按指标排序，再按组织、仓库排序
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    if (a.org !== b.org) return a.org.localeCompare(b.org);
    return a.repo.localeCompare(b.repo);
  });
  
  const chinaJsonData = chinaData.map(r => ({
    '平台': r.platform,
    '组织': r.org,
    '仓库': r.repo,
    '指标': r.metric,
    '时间键': r.timeKey,
    '数值': r.value,
    '国家': r.country || '',
    '类别': r.category || '',
    '机构标签': r.orgLabel || '',
  }));
  
  const wsChina = XLSX.utils.json_to_sheet(chinaJsonData);
  wsChina['!cols'] = [
    { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
    { wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsChina, '中国原始数据');
  
  // ===== 工作表5：中国数据（按年份聚合，按指标类型分组）=====
  const chinaYearData = aggregateByYear(chinaRows).sort((a, b) => {
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    if (a.org !== b.org) return a.org.localeCompare(b.org);
    if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
    return a.year - b.year;
  });
  
  const chinaYearJsonData = chinaYearData.map(r => ({
    '平台': r.platform,
    '组织': r.org,
    '仓库': r.repo,
    '指标': r.metric,
    '年份': r.year,
    '平均值': parseFloat(r.avgValue.toFixed(4)),
    '数据点数': r.count,
    '国家': r.country || '',
    '类别': r.category || '',
    '机构标签': r.orgLabel || '',
  }));
  
  const wsChinaYear = XLSX.utils.json_to_sheet(chinaYearJsonData);
  wsChinaYear['!cols'] = [
    { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
    { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsChinaYear, '中国按年份聚合');
  
  // ===== 工作表6：中国数据（时间维度均值，按指标类型分组）=====
  const chinaAvgData = calculateTimeAverage(chinaRows).sort((a, b) => {
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    if (a.org !== b.org) return a.org.localeCompare(b.org);
    return a.repo.localeCompare(b.repo);
  });
  
  const chinaAvgJsonData = chinaAvgData.map(r => ({
    '平台': r.platform,
    '组织': r.org,
    '仓库': r.repo,
    '指标': r.metric,
    '年份范围': r.yearRange,
    '平均值': parseFloat(r.avgValue.toFixed(4)),
    '数据点数': r.count,
    '国家': r.country || '',
    '类别': r.category || '',
    '机构标签': r.orgLabel || '',
  }));
  
  const wsChinaAvg = XLSX.utils.json_to_sheet(chinaAvgJsonData);
  wsChinaAvg['!cols'] = [
    { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
    { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsChinaAvg, '中国时间均值');
  
  return wb;
}


async function run() {
  console.log('开始从 OSS 拉取 PR 和 Issue 指标数据...');
  console.log(`仓库数: ${repos.length}, 指标数: ${prIssueMetrics.length}`);

  const rows: FlatRow[] = [];
  const errors: { repo: RepoConfig; metric: MetricName; url: string }[] = [];

  for (const repo of repos) {
    for (const metric of prIssueMetrics) {
      const url = `${OSS_BASE}/${repo.platform}/${repo.org}/${repo.repo}/${metric}.json`;
      console.log(`拉取 ${repo.platform}/${repo.org}/${repo.repo}/${metric} ...`);
      const json = await fetchJson(url);
      if (!json) {
        errors.push({ repo, metric, url });
        continue;
      }

      // JSON 一般是 { "2020": 40.25, "2020-08": 6.79, "2020Q3": 12.83, ... }
      // 这里全部打平成 (platform, org, repo, metric, timeKey, value)
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

  const output = {
    generatedAt: new Date().toISOString(),
    repoCount: repos.length,
    metricCount: prIssueMetrics.length,
    rowCount: rows.length,
    repos,
    metrics: prIssueMetrics,
    rows,
    errors,
  };

  // 使用分类输出目录
  const baseOutputDir = path.resolve(__dirname, '../../output');
  
  // 输出 JSON 文件
  const jsonOutputPath = getOutputPath('oss_pr_issue_data.json', baseOutputDir);
  fs.writeFileSync(jsonOutputPath, JSON.stringify(output, null, 2), 'utf-8');

  // 输出 CSV 文件
  const csvOutputPath = getOutputPath('oss_pr_issue_data.csv', baseOutputDir);
  const csv = toCsv(rows);
  fs.writeFileSync(csvOutputPath, csv, 'utf-8');

  // 分离 Issue 和 PR 数据
  const issueRows = rows.filter(r => issueMetrics.includes(r.metric as any));
  const prRows = rows.filter(r => prMetrics.includes(r.metric as any));

  // 输出 Issue Excel 文件
  const issueExcelPath = getOutputPath('oss_issue_data.xlsx', baseOutputDir);
  const issueWb = toExcel(issueRows);
  XLSX.writeFile(issueWb, issueExcelPath);

  // 输出 PR Excel 文件
  const prExcelPath = getOutputPath('oss_pr_data.xlsx', baseOutputDir);
  const prWb = toExcel(prRows);
  XLSX.writeFile(prWb, prExcelPath);

  console.log('==============================');
  console.log('OSS PR 和 Issue 数据拉取完成');
  console.log(`总行数: ${rows.length}`);
  console.log(`Issue 数据行数: ${issueRows.length}`);
  console.log(`PR 数据行数: ${prRows.length}`);
  console.log(`JSON 输出文件: ${jsonOutputPath}`);
  console.log(`CSV 输出文件: ${csvOutputPath}`);
  console.log(`Issue Excel 文件: ${issueExcelPath}`);
  console.log(`PR Excel 文件: ${prExcelPath}`);
  if (errors.length > 0) {
    console.log(`有 ${errors.length} 个 (repo, metric) 拉取失败，可在 JSON 文件的 errors 字段中查看详情`);
  }
}

if (require.main === module) {
  run().catch((e) => {
    console.error('❌ 运行出错:', e);
    process.exit(1);
  });
}