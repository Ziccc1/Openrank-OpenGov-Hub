/**
 * 从 oss_rows.csv 计算健康度总览表（类似矩阵热力图/雷达图的数据）
 *
 * 维度（dimension）：
 * - 活跃度
 * - 协作效率
 * - 影响力
 * - 代码质量
 * - 社区生态
 *
 * 列（category）：
 * - 使用 oss_rows.csv 中的 category 字段（如需映射为“工具类/框架类”等，可在 DataEase 里再做二次映射）
 *
 * 输出：项目根目录下 health_overview.csv
 *
 * 使用方法（在 OpenGov Hub 目录）：
 * 1. 确保已生成 oss_rows.csv（通过 oss_rows_to_csv.ts）
 * 2. npm run build
 * 3. node lib/scripts/health_overview_from_oss.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getOutputPath } from '../utils';

interface Row {
  platform: string;
  org: string;
  repo: string;
  metric: string;
  timeKey: string;
  value: number;
  country?: string;
  category?: string;
  orgLabel?: string;
}

interface MetricAgg {
  sum: number;
  count: number;
}

interface RepoCatAgg {
  category: string;
  metrics: Record<string, MetricAgg>;
}

function parseCsv(filePath: string): Row[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const header = lines[0].split(',');
  const idx = (name: string) => header.indexOf(name);

  const iPlatform = idx('platform');
  const iOrg = idx('org');
  const iRepo = idx('repo');
  const iMetric = idx('metric');
  const iTimeKey = idx('timeKey');
  const iValue = idx('value');
  const iCountry = idx('country');
  const iCategory = idx('category');
  const iOrgLabel = idx('orgLabel');

  if (iPlatform < 0 || iOrg < 0 || iRepo < 0 || iMetric < 0 || iTimeKey < 0 || iValue < 0) {
    throw new Error('oss_rows.csv 缺少必要字段（platform/org/repo/metric/timeKey/value）');
  }

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // 简单 CSV 解析（因为我们生成时已做了基本转义，这里按逗号切割）
    const cols = line.split(',');
    const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx] : '');

    const value = parseFloat(get(iValue));
    if (Number.isNaN(value)) continue;

    rows.push({
      platform: get(iPlatform),
      org: get(iOrg),
      repo: get(iRepo),
      metric: get(iMetric),
      timeKey: get(iTimeKey),
      value,
      country: iCountry >= 0 ? get(iCountry) : undefined,
      category: iCategory >= 0 ? get(iCategory) : undefined,
      orgLabel: iOrgLabel >= 0 ? get(iOrgLabel) : undefined,
    });
  }
  return rows;
}

function ensureMetric(agg: RepoCatAgg['metrics'], name: string): MetricAgg {
  if (!agg[name]) agg[name] = { sum: 0, count: 0 };
  return agg[name];
}

function calcHealthOverview(rows: Row[]) {
  const repoCatMap = new Map<string, RepoCatAgg>(); // key = repo|category

  for (const r of rows) {
    // 只统计中国项目
    if (!r.category) continue; // 没有类别的不参与汇总
    if (r.country !== 'CN') continue;
    const key = `${r.repo}|${r.category}`;
    if (!repoCatMap.has(key)) {
      repoCatMap.set(key, {
        category: r.category,
        metrics: {},
      });
    }
    const agg = repoCatMap.get(key)!;
    const m = ensureMetric(agg.metrics, r.metric);
    m.sum += r.value;
    m.count += 1;
  }

  // 计算每个 repo-category 的 5 个原始维度得分
  type DimName = 'activity' | 'efficiency' | 'impact' | 'code_quality' | 'community';
  interface RepoCatScore {
    category: string;
    dims: Record<DimName, number>;
  }

  const repoScores: RepoCatScore[] = [];

  const safeAvg = (m?: MetricAgg) => (m && m.count > 0 ? m.sum / m.count : 0);
  const inv = (x: number) => (x > 0 ? 1 / (1 + x) : 0); // 时间类：越小越好

  for (const agg of repoCatMap.values()) {
    const m = agg.metrics;
    const openrankSum = m['openrank']?.sum ?? 0;
    const activitySum = m['activity']?.sum ?? 0;
    const attentionSum = m['attention']?.sum ?? 0;

    const issuesNew = m['issues_new']?.sum ?? 0;
    const issuesClosed = m['issues_closed']?.sum ?? 0;
    const issueResDur = safeAvg(m['issue_resolution_duration']);
    const issueAge = safeAvg(m['issue_age']);

    const crAll = m['change_requests']?.sum ?? 0;
    const crAcc = m['change_requests_accepted']?.sum ?? 0;
    const crDur = safeAvg(m['change_requests_duration']);
    const crResp = safeAvg(m['change_requests_response_time']);

    const contributors = safeAvg(m['contributors']);
    const newContributors = safeAvg(m['new_contributors']);
    const inactiveContrib = safeAvg(m['inactive_contributors']);
    const busFactor = safeAvg(m['bus_factor']);

    const issueCloseRate = issuesNew > 0 ? issuesClosed / issuesNew : 0;
    const crAcceptRate = crAll > 0 ? crAcc / crAll : 0;

    // 各原始维度（未归一化）
    const dimActivity = activitySum;

    const dimEfficiency =
      0.35 * issueCloseRate +
      0.25 * crAcceptRate +
      0.2 * inv(issueResDur) +
      0.2 * inv(crDur || crResp);

    const dimImpact = 0.7 * openrankSum + 0.3 * attentionSum;

    const dimCodeQuality =
      0.4 * issueCloseRate +
      0.3 * inv(issueResDur) +
      0.3 * inv(issueAge);

    const dimCommunity =
      0.3 * contributors +
      0.25 * newContributors +
      0.2 * busFactor +
      0.25 * inv(inactiveContrib);

    repoScores.push({
      category: agg.category,
      dims: {
        activity: dimActivity,
        efficiency: dimEfficiency,
        impact: dimImpact,
        code_quality: dimCodeQuality,
        community: dimCommunity,
      },
    });
  }

  // 按类别聚合（取平均）
  const catAgg = new Map<
    string,
    {
      count: number;
      sums: Record<DimName, number>;
    }
  >();

  for (const r of repoScores) {
    if (!catAgg.has(r.category)) {
      catAgg.set(r.category, {
        count: 0,
        sums: {
          activity: 0,
          efficiency: 0,
          impact: 0,
          code_quality: 0,
          community: 0,
        },
      });
    }
    const ca = catAgg.get(r.category)!;
    ca.count += 1;
    (Object.keys(r.dims) as DimName[]).forEach(d => {
      ca.sums[d] += r.dims[d];
    });
  }

  const catAvg: Record<
    string,
    {
      activity: number;
      efficiency: number;
      impact: number;
      code_quality: number;
      community: number;
    }
  > = {};

  for (const [cat, agg] of catAgg.entries()) {
    const avg: any = {};
    (Object.keys(agg.sums) as DimName[]).forEach(d => {
      avg[d] = agg.count > 0 ? agg.sums[d] / agg.count : 0;
    });
    catAvg[cat] = avg;
  }

  // 对每个维度做 min-max 归一化到 [6,10]
  const dims: DimName[] = ['activity', 'efficiency', 'impact', 'code_quality', 'community'];
  const scores: { dimension: string; category: string; score: number }[] = [];

  const dimNameMap: Record<DimName, string> = {
    activity: '活跃度',
    efficiency: '协作效率',
    impact: '影响力',
    code_quality: '代码质量',
    community: '社区生态',
  };

  // 类别映射：英文技术类别 → 中文类别（业务分类名称）
  const categoryMap: Record<string, string> = {
    'ai': 'AI平台',
    'database': '数据库系统',
    'frontend': '前端框架',
    'infra': '基础设施平台',
    'iot': '物联网平台',
    'bigdata': '大数据平台',
    'cloud': '云平台',
    'storage': '存储系统',
    'tool': '工具',
    'ide': 'IDE',
    'pkg-mgr': '包管理',
    'compiler': '编译器',
    'framework': '框架',
    'sdk': 'SDK',
    'application': '应用',
    'app': '应用',
    'community': '社区',
    'ui': 'UI',
    'component': '组件',
    'graphics': '图形',
    'test': '测试',
    'os': '操作系统',
    'education': '教育',
  };

  for (const dim of dims) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const cat of Object.keys(catAvg)) {
      const v = (catAvg as any)[cat][dim] as number;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    for (const cat of Object.keys(catAvg)) {
      const v = (catAvg as any)[cat][dim] as number;
      let score = 8; // 默认中间值
      if (max > min) {
        const norm = (v - min) / (max - min); // 0-1
        score = 6 + norm * 4; // 6-10
      }
      // 映射英文类别到中文类别
      const chineseCategory = categoryMap[cat] || cat;
      scores.push({
        dimension: dimNameMap[dim],
        category: chineseCategory,
        score: parseFloat(score.toFixed(2)),
      });
    }
  }

  return scores;
}

function toExcel(scores: { dimension: string; category: string; score: number }[]): XLSX.WorkBook {
  // 创建工作簿
  const wb = XLSX.utils.book_new();

  // ===== 工作表1：矩阵格式（用于热力图）=====
  // 收集所有唯一的类别和维度
  const categories = Array.from(new Set(scores.map(s => s.category))).sort();
  const dimensions = Array.from(new Set(scores.map(s => s.dimension))).sort();

  // 构建矩阵数据：第一列是健康维度，后续列是各个项目类别
  const matrixData: any[][] = [];

  // 表头行：第一列是"健康维度"，后面是各个类别
  const headerRow: any[] = ['健康维度', ...categories];
  matrixData.push(headerRow);

  // 数据行：每行是一个健康维度，每列是该维度在不同类别下的得分
  for (const dim of dimensions) {
    const row: any[] = [dim];
    for (const cat of categories) {
      const score = scores.find(s => s.dimension === dim && s.category === cat);
      row.push(score ? score.score : null);
    }
    matrixData.push(row);
  }

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixData);
  // 设置列宽
  wsMatrix['!cols'] = [
    { wch: 15 }, // 健康维度列
    ...categories.map(() => ({ wch: 18 })), // 各个类别列
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, '矩阵格式');

  // ===== 工作表2：雷达图（宽格式，类别为行，维度为列，英文名 radar）=====
  const radarData: any[][] = [];
  
  // 表头行：第一列是"项目类别"，后面是各个健康维度
  const radarHeaderRow: any[] = ['项目类别', ...dimensions];
  radarData.push(radarHeaderRow);
  
  // 数据行：每行是一个项目类别，每列是该类别在不同维度下的得分
  for (const cat of categories) {
    const row: any[] = [cat];
    for (const dim of dimensions) {
      const score = scores.find(s => s.category === cat && s.dimension === dim);
      row.push(score ? score.score : null);
    }
    radarData.push(row);
  }
  const wsRadar = XLSX.utils.aoa_to_sheet(radarData);
  wsRadar['!cols'] = [
    { wch: 20 }, // 项目类别
    ...dimensions.map(() => ({ wch: 15 })), // 各维度
  ];
  XLSX.utils.book_append_sheet(wb, wsRadar, 'radar');

  // ===== 工作表3：长格式（用于其他图表，按类别分组）=====
  // 按类别排序，然后按维度排序，使同一类别的数据聚集在一起
  const sortedScores = [...scores].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category, 'zh-CN');
    }
    // 维度排序：活跃度、协作效率、影响力、代码质量、社区生态
    const dimOrder = ['活跃度', '协作效率', '影响力', '代码质量', '社区生态'];
    const aIdx = dimOrder.indexOf(a.dimension);
    const bIdx = dimOrder.indexOf(b.dimension);
    return aIdx - bIdx;
  });
  
  const longFormatData = sortedScores.map(s => ({
    '项目类别': s.category,
    '健康维度': s.dimension,
    '得分': s.score,
  }));
  const wsLong = XLSX.utils.json_to_sheet(longFormatData);
  wsLong['!cols'] = [
    { wch: 20 }, // 项目类别
    { wch: 15 }, // 健康维度
    { wch: 12 }, // 得分
  ];
  XLSX.utils.book_append_sheet(wb, wsLong, '长格式');

  return wb;
}

function run() {
  const baseOutputDir = path.resolve(__dirname, '../../output');
  const input = path.join(baseOutputDir, 'csv', 'oss_rows.csv');
  // 如果csv文件夹中没有，尝试根目录
  const inputAlt = path.resolve(__dirname, '../../output/oss_rows.csv');
  const actualInput = fs.existsSync(input) ? input : inputAlt;
  const output = getOutputPath('health_overview.xlsx', baseOutputDir);

  if (!fs.existsSync(actualInput)) {
    throw new Error(`未找到输入文件：${actualInput}，请先运行 oss_rows_to_csv.ts 生成 oss_rows.csv`);
  }

  console.log('读取 oss_rows.csv...');
  const rows = parseCsv(actualInput);
  console.log(`共 ${rows.length} 行`);

  console.log('计算健康度总览...');
  const scores = calcHealthOverview(rows);

  const wb = toExcel(scores);
  XLSX.writeFile(wb, output);

  console.log('健康度总览 Excel 导出完成');
  console.log(`行数: ${scores.length}`);
  console.log(`输出文件: ${output}`);
}

if (require.main === module) {
  run();
}


