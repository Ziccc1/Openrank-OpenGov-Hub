/**
 * 从 OpenDigger OSS 批量拉取指标数据，生成用于数据大屏的扁平 JSON 表
 *
 * 输出文件：output文件夹下的 oss_dashboard_data.json
 *
 * 使用方法：
 * 1. 修改下面的 repos 列表，填入你关心的仓库（platform/org/repo）
 * 2. 在 OpenGov Hub 目录执行：npm run build
 * 3. 在 OpenGov Hub 目录执行：node lib/scripts/oss_dashboard_fetch.js
 */

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { URL } from 'url';
import { getOutputPath } from '../utils';

type Platform = 'github' | 'gitee';

interface RepoConfig {
  platform: Platform;
  org: string;
  repo: string;
  /** 国家/地区代码，建议用 ISO 3166-1 alpha-2，用于地图、分组 */
  country?: string;
  /** 项目类别，例如 database / cloud_native / ai，用于雷达图、矩阵热力图 */
  category?: string;
  /** 自定义标签，例如机构名称，用于机构聚合 */
  orgLabel?: string;
}

// 已填入全球 Top10 与中国 Top50 中可抓取的项目（22个）
const repos: RepoConfig[] = [
  // ===== 全球 Top10 =====
  { platform: 'github', org: 'NixOS', repo: 'nixpkgs', country: 'CH', category: 'os', orgLabel: 'NixOS' }, // Switzerland
  { platform: 'github', org: 'llvm', repo: 'llvm-project', country: 'US', category: 'compiler', orgLabel: 'LLVM' },
  { platform: 'github', org: 'home-assistant', repo: 'core', country: 'NL', category: 'iot', orgLabel: 'Home-Assistant' },
  { platform: 'github', org: 'microsoft', repo: 'vscode', country: 'US', category: 'ide', orgLabel: 'Microsoft' },
  { platform: 'github', org: 'digitalinnovationone', repo: 'dio-lab-open-source', country: 'BR', category: 'education', orgLabel: 'DIO' },
  { platform: 'github', org: 'vllm-project', repo: 'vllm', country: 'US', category: 'ai', orgLabel: 'vLLM' },
  { platform: 'github', org: 'microsoft', repo: 'winget-pkgs', country: 'US', category: 'pkg-mgr', orgLabel: 'Microsoft' },
  { platform: 'github', org: 'firstcontributions', repo: 'first-contributions', country: 'IN', category: 'community', orgLabel: 'FirstContributions' },
  { platform: 'github', org: 'pytorch', repo: 'pytorch', country: 'US', category: 'ai', orgLabel: 'PyTorch' },

  // ===== 中国 Top（可在 OSS 抓取到数据的名单）=====
  { platform: 'github', org: 'volcengine', repo: 'verl', country: 'CN', category: 'ai', orgLabel: 'Volcengine' },
  { platform: 'github', org: 'apache', repo: 'doris', country: 'CN', category: 'database', orgLabel: 'Apache' },
  { platform: 'github', org: 'ant-design', repo: 'ant-design', country: 'CN', category: 'frontend', orgLabel: 'AntGroup' },
  { platform: 'github', org: 'StarRocks', repo: 'starrocks', country: 'CN', category: 'database', orgLabel: 'StarRocks' },
  { platform: 'github', org: 'PaddlePaddle', repo: 'Paddle', country: 'CN', category: 'ai', orgLabel: 'Baidu' },
  { platform: 'github', org: 'pingcap', repo: 'tidb', country: 'CN', category: 'database', orgLabel: 'PingCAP' },
  { platform: 'github', org: 'lobehub', repo: 'lobe-chat', country: 'CN', category: 'ai', orgLabel: 'LobeHub' },
  { platform: 'github', org: 'milvus-io', repo: 'milvus', country: 'CN', category: 'database', orgLabel: 'Milvus' },
  { platform: 'github', org: 'DaoCloud', repo: 'public-image-mirror', country: 'CN', category: 'infra', orgLabel: 'DaoCloud' },
  { platform: 'github', org: 'espressif', repo: 'esp-idf', country: 'CN', category: 'iot', orgLabel: 'Espressif' },
  { platform: 'github', org: 'modelscope', repo: 'ms-swift', country: 'CN', category: 'ai', orgLabel: 'ModelScope' },
  { platform: 'github', org: 'taosdata', repo: 'TDengine', country: 'CN', category: 'database', orgLabel: 'TDengine' },
  { platform: 'github', org: 'web-infra-dev', repo: 'rspack', country: 'CN', category: 'frontend', orgLabel: 'Rspack' },
  { platform: 'github', org: '1Panel-dev', repo: '1Panel', country: 'CN', category: 'infra', orgLabel: '1Panel' },
  { platform: 'github', org: 'alibaba', repo: 'spring-ai-alibaba', country: 'CN', category: 'ai', orgLabel: 'Alibaba' },
  { platform: 'github', org: 'apache', repo: 'flink', country: 'CN', category: 'bigdata', orgLabel: 'Apache' },
  { platform: 'github', org: 'baidu', repo: 'amis', country: 'CN', category: 'frontend', orgLabel: 'Baidu' },
  { platform: 'github', org: 'alibaba', repo: 'higress', country: 'CN', category: 'cloud', orgLabel: 'Alibaba' },
  { platform: 'github', org: 'apache', repo: 'ozone', country: 'CN', category: 'storage', orgLabel: 'Apache' },
  { platform: 'github', org: 'PaddlePaddle', repo: 'PaddleOCR', country: 'CN', category: 'ai', orgLabel: 'Baidu' },
  { platform: 'github', org: 'PaddlePaddle', repo: 'FastDeploy', country: 'CN', category: 'ai', orgLabel: 'Baidu' },
  { platform: 'github', org: 'espressif', repo: 'arduino-esp32', country: 'CN', category: 'iot', orgLabel: 'Espressif' },
];

/**
 * 需要从 OSS 拉取的指标列表
 * 可根据 5 个模块需求增删
 */
const metrics = [
  // 核心影响力 & 活跃度
  'openrank',
  'activity',
  'attention',
  'community_openrank',
  // 协作效率 - Issue
  'issues_new',
  'issues_closed',
  'issue_resolution_duration',
  'issue_response_time',
  'issue_age',
  // 协作效率 - PR / Change Requests
  'change_requests',
  'change_requests_accepted',
  'change_requests_declined',
  'change_requests_acceptance_ratio',
  'change_requests_duration',
  'change_requests_response_time',
  'change_request_age',
  // 社区健康度
  'new_contributors',
  'contributors',
  'inactive_contributors',
  'bus_factor',
] as const;

type MetricName = (typeof metrics)[number];

const OSS_BASE = 'https://oss.open-digger.cn';

interface FlatRow {
  platform: Platform;
  org: string;
  repo: string;
  metric: MetricName;
  /** 时间键：如 2020 / 2020-08 / 2020Q3 等 */
  timeKey: string;
  value: number;
  /** 可选增强字段：国家 / 类别 / 机构标签，便于在 DataEase 里过滤聚合 */
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
          console.warn(`⚠️ 请求失败 ${res.statusCode} - ${url}`);
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
            console.warn(`⚠️ 解析 JSON 失败: ${url}`, e);
            resolve(null);
          }
        });
      },
    );
    req.on('error', (err) => {
      console.warn(`⚠️ 请求出错: ${url}`, err);
      resolve(null);
    });
  });
}

async function run() {
  console.log('开始从 OSS 拉取指标数据...');
  console.log(`仓库数: ${repos.length}, 指标数: ${metrics.length}`);

  const rows: FlatRow[] = [];
  const errors: { repo: RepoConfig; metric: MetricName; url: string }[] = [];

  for (const repo of repos) {
    for (const metric of metrics) {
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
    metricCount: metrics.length,
    rowCount: rows.length,
    repos,
    metrics,
    rows,
    errors,
  };

  const baseOutputDir = path.resolve(__dirname, '../../output');
  const outputPath = getOutputPath('oss_dashboard_data.json', baseOutputDir);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log('==============================');
  console.log('OSS 指标数据拉取完成');
  console.log(`总行数: ${rows.length}`);
  console.log(`输出文件: ${outputPath}`);
  if (errors.length > 0) {
    console.log(`有 ${errors.length} 个 (repo, metric) 拉取失败，可在 errors 字段中查看详情`);
  }
}

if (require.main === module) {
  run().catch((e) => {
    console.error('❌ 运行出错:', e);
    process.exit(1);
  });
}


