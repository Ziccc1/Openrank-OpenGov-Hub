/**
 * 从 Open Leaderboard 提取2024年全球Top10和中国Top10项目OpenRank和企业活跃度数据
 * 
 * 数据来源：https://github.com/X-lab2017/open-leaderboard
 * API地址：https://oss.x-lab.info/open_leaderboard/open_rank/{type}/{region}/{filename}.json
 * 
 * 输出文件：
 * - leaderboard_top10_2024.xlsx (Excel格式，4个工作表)
 * 
 * 使用方法：
 * 1. npm run build
 * 2. node lib/scripts/fetch_leaderboard_data.js
 */

import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { URL } from 'url';
import * as XLSX from 'xlsx';

const OSS_BASE_URL = 'https://oss.x-lab.info';

interface LeaderboardItem {
  name: string;
  openrank?: number;
  activity?: number;
  rank?: number;
  value?: number;
  [key: string]: any;
}

interface LeaderboardResponse {
  type?: string;
  time?: string;
  data?: Array<{
    item: {
      name: string;
    };
    rank: number;
    value: number;
    rankDelta?: number;
    valueDelta?: number;
  }>;
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
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        console.warn(`⚠️  请求失败 ${res.statusCode} - ${url}`);
        res.resume();
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString('utf-8');
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          console.warn(`⚠️  解析JSON失败: ${url}`);
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn(`⚠️  请求超时: ${url}`);
      resolve(null);
    });

    req.on('error', (err) => {
      console.warn(`⚠️  请求出错: ${url}`, err.message);
      resolve(null);
    });

    req.end();
  });
}

/**
 * 解析排行榜响应数据
 */
function parseLeaderboardData(response: LeaderboardResponse | any): LeaderboardItem[] {
  if (!response) {
    return [];
  }

  // 如果响应有 data 字段，使用它
  let dataArray: any[] = [];
  if (response.data && Array.isArray(response.data)) {
    dataArray = response.data;
  } else if (Array.isArray(response)) {
    dataArray = response;
  } else {
    return [];
  }

  // 转换为统一格式
  return dataArray.map((item: any) => {
    if (item.item && item.item.name) {
      // 格式：{ item: { name: "xxx" }, rank: 1, value: 296.53 }
      return {
        name: item.item.name,
        rank: item.rank,
        value: item.value,
        openrank: item.value, // value 就是 OpenRank 或 Activity
        activity: item.value,
        rankDelta: item.rankDelta,
        valueDelta: item.valueDelta,
      };
    } else if (item.name) {
      // 格式：{ name: "xxx", openrank: 296.53 }
      return item;
    }
    return null;
  }).filter((item: any) => item !== null);
}

/**
 * 获取Top10数据（按value排序）
 */
function getTop10(data: LeaderboardItem[]): LeaderboardItem[] {
  if (!data || data.length === 0) {
    return [];
  }

  // 按 value 降序排列（value 可能是 openrank 或 activity）
  const sorted = [...data].sort((a, b) => {
    const aValue = a.value || a.openrank || a.activity || 0;
    const bValue = b.value || b.openrank || b.activity || 0;
    return bValue - aValue;
  });

  // 返回Top10，更新rank
  return sorted.slice(0, 10).map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

/**
 * 将数据转换为CSV格式
 */
function toCsv(data: any[]): string {
  if (data.length === 0) return '';
  
  // 获取所有可能的键
  const allKeys = new Set<string>();
  data.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });
  
  const keys = Array.from(allKeys);
  const lines: string[] = [];
  
  // 表头
  lines.push(keys.map(k => `"${k}"`).join(','));
  
  // 数据行
  data.forEach(item => {
    const values = keys.map(key => {
      const value = item[key];
      if (value === null || value === undefined) return '""';
      const str = String(value).replace(/"/g, '""');
      return `"${str}"`;
    });
    lines.push(values.join(','));
  });
  
  return lines.join('\n');
}

async function run() {
  console.log('🚀 开始提取 Open Leaderboard 数据...\n');

  const baseOutputDir = path.resolve(__dirname, '../../output');
  
  // 创建三个不同的输出文件夹
  const excelDir = path.join(baseOutputDir, 'excel');
  const csvDir = path.join(baseOutputDir, 'csv');
  const jsonDir = path.join(baseOutputDir, 'json');
  
  [excelDir, csvDir, jsonDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  console.log(`📁 输出文件夹:`);
  console.log(`  Excel: ${excelDir}`);
  console.log(`  CSV:   ${csvDir}`);
  console.log(`  JSON:  ${jsonDir}\n`);

  // 1. 获取2024年中国项目排行榜（OpenRank）
  console.log('📊 获取2024年中国项目排行榜（OpenRank）...');
  const repoChinese2024Url = `${OSS_BASE_URL}/open_leaderboard/open_rank/repo/chinese/2024.json`;
  const repoChinese2024Response = await fetchJson(repoChinese2024Url);
  
  let chinaTop10Repos: LeaderboardItem[] = [];
  if (repoChinese2024Response) {
    const repoList = parseLeaderboardData(repoChinese2024Response);
    chinaTop10Repos = getTop10(repoList);
    console.log(`  ✓ 获取到 ${chinaTop10Repos.length} 个中国Top10项目`);
  } else {
    console.warn('  ⚠️  无法获取中国项目数据');
  }

  // 2. 获取2024年全球项目排行榜（OpenRank）
  console.log('\n📊 获取2024年全球项目排行榜（OpenRank）...');
  const repoGlobal2024Url = `${OSS_BASE_URL}/open_leaderboard/open_rank/repo/global/2024.json`;
  const repoGlobal2024Response = await fetchJson(repoGlobal2024Url);
  
  let globalTop10Repos: LeaderboardItem[] = [];
  if (repoGlobal2024Response) {
    const repoList = parseLeaderboardData(repoGlobal2024Response);
    globalTop10Repos = getTop10(repoList);
    console.log(`  ✓ 获取到 ${globalTop10Repos.length} 个全球Top10项目`);
  } else {
    console.warn('  ⚠️  无法获取全球项目数据');
  }

  // 3. 获取2024年中国企业排行榜（活跃度）
  console.log('\n📊 获取2024年中国企业排行榜（活跃度）...');
  const companyChinese2024Url = `${OSS_BASE_URL}/open_leaderboard/open_rank/company/chinese/2024.json`;
  const companyChinese2024Response = await fetchJson(companyChinese2024Url);
  
  let chinaTop10Orgs: LeaderboardItem[] = [];
  if (companyChinese2024Response) {
    const orgList = parseLeaderboardData(companyChinese2024Response);
    chinaTop10Orgs = getTop10(orgList);
    console.log(`  ✓ 获取到 ${chinaTop10Orgs.length} 个中国Top10企业`);
  } else {
    console.warn('  ⚠️  无法获取中国企业数据');
  }

  // 4. 获取2024年全球企业排行榜（活跃度）
  console.log('\n📊 获取2024年全球企业排行榜（活跃度）...');
  const companyGlobal2024Url = `${OSS_BASE_URL}/open_leaderboard/open_rank/company/global/2024.json`;
  const companyGlobal2024Response = await fetchJson(companyGlobal2024Url);
  
  let globalTop10Orgs: LeaderboardItem[] = [];
  if (companyGlobal2024Response) {
    const orgList = parseLeaderboardData(companyGlobal2024Response);
    globalTop10Orgs = getTop10(orgList);
    console.log(`  ✓ 获取到 ${globalTop10Orgs.length} 个全球Top10企业`);
  } else {
    console.warn('  ⚠️  无法获取全球企业数据');
  }

  // 5. 生成Excel文件
  console.log('\n💾 生成Excel文件...');
  const wb = XLSX.utils.book_new();

  // 工作表1：2024年中国Top10项目（OpenRank）
  if (chinaTop10Repos.length > 0) {
    const data = chinaTop10Repos.map(item => ({
      排名: item.rank,
      项目名称: item.name,
      OpenRank: item.value || item.openrank,
    }));
    const ws1 = XLSX.utils.json_to_sheet(data);
    ws1['!cols'] = [
      { wch: 8 },   // 排名
      { wch: 40 },  // 项目名称
      { wch: 15 },  // OpenRank
    ];
    XLSX.utils.book_append_sheet(wb, ws1, '中国Top10项目');
    console.log('  ✓ 工作表1：2024年中国Top10项目（OpenRank）');
  }

  // 工作表2：2024年全球Top10项目（OpenRank）
  if (globalTop10Repos.length > 0) {
    const data = globalTop10Repos.map(item => ({
      排名: item.rank,
      项目名称: item.name,
      OpenRank: item.value || item.openrank,
    }));
    const ws2 = XLSX.utils.json_to_sheet(data);
    ws2['!cols'] = [
      { wch: 8 },   // 排名
      { wch: 40 },  // 项目名称
      { wch: 15 },  // OpenRank
    ];
    XLSX.utils.book_append_sheet(wb, ws2, '全球Top10项目');
    console.log('  ✓ 工作表2：2024年全球Top10项目（OpenRank）');
  }

  // 工作表3：2024年中国Top10企业（活跃度）
  if (chinaTop10Orgs.length > 0) {
    const data = chinaTop10Orgs.map(item => ({
      排名: item.rank,
      企业名称: item.name,
      活跃度: item.value || item.activity,
    }));
    const ws3 = XLSX.utils.json_to_sheet(data);
    ws3['!cols'] = [
      { wch: 8 },   // 排名
      { wch: 40 },  // 企业名称
      { wch: 15 },  // 活跃度
    ];
    XLSX.utils.book_append_sheet(wb, ws3, '中国Top10企业');
    console.log('  ✓ 工作表3：2024年中国Top10企业（活跃度）');
  }

  // 工作表4：2024年全球Top10企业（活跃度）
  if (globalTop10Orgs.length > 0) {
    const data = globalTop10Orgs.map(item => ({
      排名: item.rank,
      企业名称: item.name,
      活跃度: item.value || item.activity,
    }));
    const ws4 = XLSX.utils.json_to_sheet(data);
    ws4['!cols'] = [
      { wch: 8 },   // 排名
      { wch: 40 },  // 企业名称
      { wch: 15 },  // 活跃度
    ];
    XLSX.utils.book_append_sheet(wb, ws4, '全球Top10企业');
    console.log('  ✓ 工作表4：2024年全球Top10企业（活跃度）');
  }

  // 检查是否有数据
  if (wb.SheetNames.length === 0) {
    console.error('  ❌ 没有获取到任何数据，无法生成Excel文件');
    return;
  }

  // 5.1 保存Excel文件
  console.log('\n💾 保存文件...');
  const excelPath = path.join(excelDir, 'leaderboard_top10_2024.xlsx');
  
  // 如果文件被占用，尝试删除后重新创建
  let retryCount = 0;
  const maxRetries = 3;
  
  while (retryCount < maxRetries) {
    try {
      if (fs.existsSync(excelPath)) {
        fs.unlinkSync(excelPath);
        await new Promise(resolve => setTimeout(resolve, 500)); // 等待文件释放
      }
      XLSX.writeFile(wb, excelPath);
      console.log(`  ✓ Excel已保存: ${excelPath}`);
      break;
    } catch (e: any) {
      retryCount++;
      if (retryCount >= maxRetries) {
        // 如果还是失败，使用带时间戳的文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const altPath = path.join(excelDir, `leaderboard_top10_2024_${timestamp}.xlsx`);
        XLSX.writeFile(wb, altPath);
        console.log(`  ✓ Excel已保存（带时间戳）: ${altPath}`);
        console.log(`    提示：请关闭原文件后重新运行脚本以更新原文件`);
      } else {
        console.warn(`  ⚠️  文件被占用，重试 ${retryCount}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // 5.2 保存JSON文件
  const allData = {
    chinaTop10Repos,
    globalTop10Repos,
    chinaTop10Orgs,
    globalTop10Orgs,
    metadata: {
      year: 2024,
      generatedAt: new Date().toISOString(),
      source: 'Open Leaderboard',
    },
  };
  
  const jsonPath = path.join(jsonDir, 'leaderboard_top10_2024.json');
  fs.writeFileSync(jsonPath, JSON.stringify(allData, null, 2), 'utf-8');
  console.log(`  ✓ JSON已保存: ${jsonPath}`);

  // 5.3 保存CSV文件（分别保存每个工作表）
  if (chinaTop10Repos.length > 0) {
    const csvData = chinaTop10Repos.map(item => ({
      排名: item.rank,
      项目名称: item.name,
      OpenRank: item.value || item.openrank,
    }));
    const csvPath = path.join(csvDir, 'leaderboard_china_top10_repos_2024.csv');
    fs.writeFileSync(csvPath, toCsv(csvData), 'utf-8');
    console.log(`  ✓ CSV已保存: ${csvPath}`);
  }

  if (globalTop10Repos.length > 0) {
    const csvData = globalTop10Repos.map(item => ({
      排名: item.rank,
      项目名称: item.name,
      OpenRank: item.value || item.openrank,
    }));
    const csvPath = path.join(csvDir, 'leaderboard_global_top10_repos_2024.csv');
    fs.writeFileSync(csvPath, toCsv(csvData), 'utf-8');
    console.log(`  ✓ CSV已保存: ${csvPath}`);
  }

  if (chinaTop10Orgs.length > 0) {
    const csvData = chinaTop10Orgs.map(item => ({
      排名: item.rank,
      企业名称: item.name,
      活跃度: item.value || item.activity,
    }));
    const csvPath = path.join(csvDir, 'leaderboard_china_top10_companies_2024.csv');
    fs.writeFileSync(csvPath, toCsv(csvData), 'utf-8');
    console.log(`  ✓ CSV已保存: ${csvPath}`);
  }

  if (globalTop10Orgs.length > 0) {
    const csvData = globalTop10Orgs.map(item => ({
      排名: item.rank,
      企业名称: item.name,
      活跃度: item.value || item.activity,
    }));
    const csvPath = path.join(csvDir, 'leaderboard_global_top10_companies_2024.csv');
    fs.writeFileSync(csvPath, toCsv(csvData), 'utf-8');
    console.log(`  ✓ CSV已保存: ${csvPath}`);
  }

  // 6. 输出统计信息
  console.log('\n📊 数据统计:');
  console.log(`  中国Top10项目: ${chinaTop10Repos.length} 条`);
  console.log(`  全球Top10项目: ${globalTop10Repos.length} 条`);
  console.log(`  中国Top10企业: ${chinaTop10Orgs.length} 条`);
  console.log(`  全球Top10企业: ${globalTop10Orgs.length} 条`);
}

if (require.main === module) {
  run().catch((e) => {
    console.error('❌ 运行出错:', e);
    process.exit(1);
  });
}
