/**
 * 生成2024年中国Top10机构的24小时贡献行为占比数据（使用OSS URL）
 * 
 * 机构列表（2024年排名）：
 * 1. Huawei
 * 2. Alibaba
 * 3. Ant group
 * 4. Baidu
 * 5. DaoCloud
 * 6. ByteDance
 * 7. PingCAP
 * 8. ESPRESSIF
 * 9. Tencent
 * 10. Fit2Cloud
 * 
 * 输出格式：
 * - 工作表1：汇总数据（所有仓库合并后的24小时占比）
 * - 工作表2：每个仓库的详细数据（小时、活动次数、占比）
 * 
 * 使用方法：
 * 1. npm run build
 * 2. node lib/scripts/generate_hourly_activity_data.js
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
  orgLabel: string;
  name: string;
}

// 2024年中国Top10机构对应的主要仓库
const chinaTop10Repos: RepoConfig[] = [
  // 1. Huawei
  { platform: 'github', org: 'openharmony', repo: 'docs', orgLabel: 'Huawei', name: 'openharmony/docs' },
  { platform: 'github', org: 'mindspore', repo: 'mindspore', orgLabel: 'Huawei', name: 'mindspore/mindspore' },
  { platform: 'github', org: 'opengauss', repo: 'openGauss-server', orgLabel: 'Huawei', name: 'opengauss/openGauss-server' },
  
  // 2. Alibaba
  { platform: 'github', org: 'alibaba', repo: 'higress', orgLabel: 'Alibaba', name: 'alibaba/higress' },
  { platform: 'github', org: 'apache', repo: 'dubbo', orgLabel: 'Alibaba', name: 'apache/dubbo' },
  
  // 3. Ant group
  { platform: 'github', org: 'ant-design', repo: 'ant-design', orgLabel: 'AntGroup', name: 'ant-design/ant-design' },
  
  // 4. Baidu
  { platform: 'github', org: 'PaddlePaddle', repo: 'Paddle', orgLabel: 'Baidu', name: 'PaddlePaddle/Paddle' },
  
  // 5. DaoCloud
  { platform: 'github', org: 'DaoCloud', repo: 'public-image-mirror', orgLabel: 'DaoCloud', name: 'DaoCloud/public-image-mirror' },
  
  // 6. ByteDance
  { platform: 'github', org: 'bytedance', repo: 'sonic', orgLabel: 'ByteDance', name: 'bytedance/sonic' },
  
  // 7. PingCAP
  { platform: 'github', org: 'pingcap', repo: 'tidb', orgLabel: 'PingCAP', name: 'pingcap/tidb' },
  
  // 8. ESPRESSIF
  { platform: 'github', org: 'espressif', repo: 'esp-idf', orgLabel: 'ESPRESSIF', name: 'espressif/esp-idf' },
  
  // 9. Tencent
  { platform: 'github', org: 'Tencent', repo: 'tmagic-editor', orgLabel: 'Tencent', name: 'Tencent/tmagic-editor' },
  
  // 10. Fit2Cloud
  { platform: 'github', org: 'fit2cloud', repo: 'fit2cloud-opensource', orgLabel: 'Fit2Cloud', name: 'fit2cloud/fit2cloud-opensource' },
];

const OSS_BASE = 'https://oss.open-digger.cn';

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
 * 尝试从OSS获取active_dates_and_times数据
 * 如果不存在，则使用activity数据来估算
 */
async function getHourlyActivityData(repo: RepoConfig): Promise<number[] | null> {
  // 先尝试获取active_dates_and_times数据
  const activeDatesUrl = `${OSS_BASE}/${repo.platform}/${repo.org}/${repo.repo}/active_dates_and_times.json`;
  console.log(`  尝试获取 active_dates_and_times: ${activeDatesUrl}`);
  let data = await fetchJson(activeDatesUrl);
  
  if (data && typeof data === 'object') {
    // 检查是否有2024年的数据
    const year2024Data = data['2024'];
    if (year2024Data && Array.isArray(year2024Data) && year2024Data.length === 168) {
      return year2024Data;
    }
    // 如果有其他格式的数据，尝试解析
    if (Array.isArray(data) && data.length === 168) {
      return data;
    }
  }
  
  // 如果active_dates_and_times不存在，返回null，后续使用activity数据估算
  console.log(`  active_dates_and_times 数据不可用，将使用activity数据估算`);
  return null;
}

/**
 * 从activity数据估算24小时分布
 * 这是一个简化的方法：假设活动在一天内均匀分布
 */
function estimateHourlyFromActivity(activityData: Record<string, number>, year: number): number[] {
  const yearKey = String(year);
  const monthlyData = activityData[yearKey] || 0;
  
  // 如果没有年度数据，尝试获取月度数据并求和
  let totalActivity = monthlyData;
  if (!totalActivity || totalActivity === 0) {
    for (let month = 1; month <= 12; month++) {
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const monthValue = activityData[monthKey] || 0;
      totalActivity += monthValue;
    }
  }
  
  // 如果还是没有数据，返回0数组
  if (!totalActivity || totalActivity === 0) {
    return new Array(24).fill(0);
  }
  
  // 简化估算：假设活动在24小时内均匀分布（实际应该根据历史数据调整）
  const hourlyAverage = totalActivity / (365 * 24); // 全年平均每小时活动
  return new Array(24).fill(hourlyAverage);
}

/**
 * 将168个数据点（7天×24小时）聚合为24小时
 * 数据格式：索引 = (day - 1) * 24 + hour
 * 其中 day: 1-7 (周一到周日), hour: 0-23
 */
function aggregateTo24Hours(countArray: number[]): number[] {
  const hourlyCounts = new Array(24).fill(0);
  
  // countArray 有168个元素，按 (day-1)*24 + hour 索引
  for (let day = 1; day <= 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const index = (day - 1) * 24 + hour;
      if (index < countArray.length) {
        const value = typeof countArray[index] === 'string' 
          ? parseFloat(countArray[index] as any) 
          : countArray[index];
        if (!isNaN(value)) {
          hourlyCounts[hour] += value;
        }
      }
    }
  }
  
  return hourlyCounts;
}

/**
 * 计算占比
 */
function calculatePercentage(hourlyCounts: number[]): number[] {
  const total = hourlyCounts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return hourlyCounts.map(() => 0);
  
  return hourlyCounts.map(count => (count / total) * 100);
}

interface RepoHourlyData {
  repoName: string;
  orgLabel: string;
  hourlyCounts: number[];
  hourlyPercentages: number[];
  totalCount: number;
  dataSource: 'active_dates_and_times' | 'estimated';
}

async function run() {
  console.log('开始获取2024年中国Top10机构的活动数据...');
  console.log(`仓库数量: ${chinaTop10Repos.length}`);
  console.log(`时间范围: 2024年`);
  
  const repoDataList: RepoHourlyData[] = [];
  const errors: { repo: string; error: string }[] = [];
  
  // 获取每个仓库的数据
  for (const repo of chinaTop10Repos) {
    try {
      console.log(`正在获取 ${repo.name} (${repo.orgLabel}) 的数据...`);
      
      // 先尝试获取active_dates_and_times数据
      let hourlyCounts: number[] | null = await getHourlyActivityData(repo);
      let dataSource: 'active_dates_and_times' | 'estimated' = 'active_dates_and_times';
      
      // 如果没有active_dates_and_times数据，使用activity数据估算
      if (!hourlyCounts) {
        const activityUrl = `${OSS_BASE}/${repo.platform}/${repo.org}/${repo.repo}/activity.json`;
        console.log(`  获取 activity 数据: ${activityUrl}`);
        const activityData = await fetchJson(activityUrl);
        
        if (activityData && typeof activityData === 'object') {
          const estimatedHourly = estimateHourlyFromActivity(activityData, 2024);
          hourlyCounts = estimatedHourly;
          dataSource = 'estimated';
        } else {
          errors.push({ repo: repo.name, error: '无法获取activity数据' });
          console.warn(`  ⚠️ ${repo.name} 无法获取数据`);
          continue;
        }
      } else {
        // 如果有active_dates_and_times数据，聚合为24小时
        hourlyCounts = aggregateTo24Hours(hourlyCounts);
      }
      
      const totalCount = hourlyCounts.reduce((sum, count) => sum + count, 0);
      const hourlyPercentages = calculatePercentage(hourlyCounts);
      
      repoDataList.push({
        repoName: repo.name,
        orgLabel: repo.orgLabel,
        hourlyCounts,
        hourlyPercentages,
        totalCount,
        dataSource,
      });
      
      console.log(`  ✓ ${repo.name} 数据获取成功，总活动次数: ${totalCount.toLocaleString()}, 数据源: ${dataSource}`);
    } catch (error: any) {
      errors.push({ repo: repo.name, error: error.message || String(error) });
      console.error(`  ❌ ${repo.name} 获取失败:`, error.message || error);
    }
  }
  
  console.log(`\n成功获取 ${repoDataList.length} 个仓库的数据`);
  if (errors.length > 0) {
    console.log(`有 ${errors.length} 个仓库获取失败:`);
    errors.forEach(e => console.log(`  - ${e.repo}: ${e.error}`));
  }
  
  // 按机构分组并合并数据
  const orgDataMap = new Map<string, RepoHourlyData[]>();
  for (const repoData of repoDataList) {
    if (!orgDataMap.has(repoData.orgLabel)) {
      orgDataMap.set(repoData.orgLabel, []);
    }
    orgDataMap.get(repoData.orgLabel)!.push(repoData);
  }
  
  // 计算每个机构的汇总数据
  const orgSummaryData: Array<{
    orgLabel: string;
    hourlyCounts: number[];
    hourlyPercentages: number[];
    totalCount: number;
    repoCount: number;
  }> = [];
  
  for (const [orgLabel, repos] of orgDataMap.entries()) {
    const orgHourlyCounts = new Array(24).fill(0);
    let orgTotalCount = 0;
    
    for (const repoData of repos) {
      for (let hour = 0; hour < 24; hour++) {
        orgHourlyCounts[hour] += repoData.hourlyCounts[hour];
      }
      orgTotalCount += repoData.totalCount;
    }
    
    const orgPercentages = calculatePercentage(orgHourlyCounts);
    
    orgSummaryData.push({
      orgLabel,
      hourlyCounts: orgHourlyCounts,
      hourlyPercentages: orgPercentages,
      totalCount: orgTotalCount,
      repoCount: repos.length,
    });
  }
  
  // 计算所有机构的汇总数据
  const aggregatedHourlyCounts = new Array(24).fill(0);
  for (const orgData of orgSummaryData) {
    for (let hour = 0; hour < 24; hour++) {
      aggregatedHourlyCounts[hour] += orgData.hourlyCounts[hour];
    }
  }
  const aggregatedPercentages = calculatePercentage(aggregatedHourlyCounts);
  
  // 生成Excel
  const wb = XLSX.utils.book_new();
  
  // ===== 工作表1：汇总数据（所有机构合并）=====
  const summaryData: any[] = [];
  summaryData.push(['小时', '活动次数', '占比 (%)']);
  
  for (let hour = 0; hour < 24; hour++) {
    summaryData.push([
      hour,
      Math.round(aggregatedHourlyCounts[hour]),
      parseFloat(aggregatedPercentages[hour].toFixed(2)),
    ]);
  }
  
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [
    { wch: 10 }, // 小时
    { wch: 15 }, // 活动次数
    { wch: 15 }, // 占比
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, '汇总数据');
  
  // ===== 工作表2：各机构汇总数据 =====
  const orgSummarySheet: any[] = [];
  orgSummarySheet.push(['机构', '仓库数', '总活动次数', ...Array.from({ length: 24 }, (_, i) => `${i}时占比(%)`)]);
  
  for (const orgData of orgSummaryData) {
    orgSummarySheet.push([
      orgData.orgLabel,
      orgData.repoCount,
      Math.round(orgData.totalCount),
      ...orgData.hourlyPercentages.map(p => parseFloat(p.toFixed(2))),
    ]);
  }
  
  const wsOrgSummary = XLSX.utils.aoa_to_sheet(orgSummarySheet);
  wsOrgSummary['!cols'] = [
    { wch: 20 }, // 机构
    { wch: 10 }, // 仓库数
    { wch: 15 }, // 总活动次数
    ...Array(24).fill({ wch: 12 }), // 24小时占比
  ];
  XLSX.utils.book_append_sheet(wb, wsOrgSummary, '各机构汇总');
  
  // ===== 工作表3：各仓库详细数据 =====
  const detailData: any[] = [];
  detailData.push(['机构', '仓库', '小时', '活动次数', '占比 (%)', '数据源']);
  
  for (const repoData of repoDataList) {
    for (let hour = 0; hour < 24; hour++) {
      detailData.push([
        repoData.orgLabel,
        repoData.repoName,
        hour,
        Math.round(repoData.hourlyCounts[hour]),
        parseFloat(repoData.hourlyPercentages[hour].toFixed(2)),
        repoData.dataSource,
      ]);
    }
  }
  
  const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
  wsDetail['!cols'] = [
    { wch: 15 }, // 机构
    { wch: 30 }, // 仓库
    { wch: 10 }, // 小时
    { wch: 15 }, // 活动次数
    { wch: 15 }, // 占比
    { wch: 20 }, // 数据源
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, '各仓库详细数据');
  
  // 保存到output/excel文件夹
  const baseOutputDir = path.resolve(__dirname, '../../output');
  const outputPath = getOutputPath('2024年中国Top10机构24小时贡献行为占比.xlsx', baseOutputDir);
  XLSX.writeFile(wb, outputPath);
  
  console.log(`\n数据已保存到: ${outputPath}`);
  console.log(`汇总数据: 24行`);
  console.log(`各机构汇总: ${orgSummaryData.length}行`);
  console.log(`详细数据: ${repoDataList.length * 24}行`);
}

if (require.main === module) {
  run().catch((e) => {
    console.error('❌ 运行出错:', e);
    process.exit(1);
  });
}
