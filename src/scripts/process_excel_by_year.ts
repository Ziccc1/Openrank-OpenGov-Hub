/**
 * 处理已生成的Excel文件，按年份整合数据
 * 将时间键统一为年份格式，按年份聚合数据
 *
 * 使用方法：
 * 1. 确保output文件夹中已有 oss_issue_data.xlsx 和 oss_pr_data.xlsx（通过运行1.ts生成）
 * 2. npm run build
 * 3. node lib/scripts/process_excel_by_year.js
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getOutputPath } from '../utils';

/**
 * 从时间键中提取年份
 * 支持格式：2024, 2024-08, 2024Q3, 2024-08-15 等
 */
function extractYear(timeKey: string): number | null {
  const yearMatch = timeKey.match(/^(\d{4})/);
  if (yearMatch) {
    return parseInt(yearMatch[1], 10);
  }
  return null;
}

/**
 * 统一年份范围格式（确保只显示年份）
 */
function normalizeYearRange(yearRange: string): string {
  if (!yearRange) return '';
  
  // 提取所有年份
  const yearMatches = yearRange.match(/\d{4}/g);
  if (!yearMatches || yearMatches.length === 0) return yearRange;
  
  const years = yearMatches.map(y => parseInt(y, 10)).sort((a, b) => a - b);
  const uniqueYears = Array.from(new Set(years));
  
  if (uniqueYears.length === 1) {
    return String(uniqueYears[0]);
  } else {
    return `${uniqueYears[0]}-${uniqueYears[uniqueYears.length - 1]}`;
  }
}

/**
 * 处理单个Excel文件
 */
function processExcelFile(filePath: string, outputPath: string) {
  console.log(`处理文件: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.warn(`文件不存在: ${filePath}`);
    return;
  }

  const wb = XLSX.readFile(filePath);
  const newWb = XLSX.utils.book_new();

  // 先收集所有原始数据，用于重新计算时间均值
  const rawDataMap = new Map<string, any[]>(); // key: 工作表名称（世界/中国）

  // 第一遍：收集原始数据
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any>(ws);

    if (data.length === 0) continue;

    // 检查是否包含时间键列（原始数据）
    const hasTimeKey = data[0] && data[0].hasOwnProperty('时间键');
    
    if (hasTimeKey) {
      // 保存原始数据（包含所有时间格式的原始数据）
      rawDataMap.set(sheetName, data);
      console.log(`    收集原始数据: ${sheetName}, 行数: ${data.length}`);
    }
  }

  // 第二遍：处理所有工作表
  for (const sheetName of wb.SheetNames) {
    console.log(`  处理工作表: ${sheetName}`);
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any>(ws);

    if (data.length === 0) continue;

    // 检查是否包含时间键列
    const hasTimeKey = data[0].hasOwnProperty('时间键');
    const hasYearRange = data[0].hasOwnProperty('年份范围') || data[0].hasOwnProperty('时间范围');

    if (hasTimeKey) {
      // 原始数据：按年份聚合

      const yearMap = new Map<string, {
        platform: string;
        org: string;
        repo: string;
        metric: string;
        year: number;
        sum: number;
        count: number;
        country: string;
        category: string;
        orgLabel: string;
      }>();

      for (const row of data) {
        const year = extractYear(row['时间键']);
        if (year === null) continue;

        const key = `${row['平台']}|${row['组织']}|${row['仓库']}|${row['指标']}|${year}`;
        if (!yearMap.has(key)) {
          yearMap.set(key, {
            platform: row['平台'],
            org: row['组织'],
            repo: row['仓库'],
            metric: row['指标'],
            year,
            sum: 0,
            count: 0,
            country: row['国家'] || '',
            category: row['类别'] || '',
            orgLabel: row['机构标签'] || '',
          });
        }
        const item = yearMap.get(key)!;
        item.sum += row['数值'];
        item.count += 1;
      }

      // 转换为Excel格式
      const yearData = Array.from(yearMap.values())
        .sort((a, b) => {
          if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
          if (a.org !== b.org) return a.org.localeCompare(b.org);
          if (a.repo !== b.repo) return a.repo.localeCompare(b.repo);
          return a.year - b.year;
        })
        .map(item => ({
          '平台': item.platform,
          '组织': item.org,
          '仓库': item.repo,
          '指标': item.metric,
          '年份': item.year,
          '平均值': parseFloat((item.sum / item.count).toFixed(4)),
          '数据点数': item.count,
          '国家': item.country,
          '类别': item.category,
          '机构标签': item.orgLabel,
        }));

      const newWs = XLSX.utils.json_to_sheet(yearData);
      newWs['!cols'] = [
        { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
        { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
    } else if (hasYearRange) {
      // 时间均值数据：从对应的原始数据重新计算，按年份分别显示
      // 找到对应的原始数据工作表（世界/中国）
      const isGlobal = sheetName.includes('世界');
      const rawDataSheetName = isGlobal ? '世界原始数据' : '中国原始数据';
      const rawData = rawDataMap.get(rawDataSheetName) || [];

      console.log(`    查找原始数据: ${rawDataSheetName}`);
      console.log(`    可用的原始数据工作表: ${Array.from(rawDataMap.keys()).join(', ')}`);
      console.log(`    找到的原始数据行数: ${rawData.length}`);

      if (rawData.length === 0) {
        console.warn(`    警告: 未找到原始数据，将统一年份范围格式`);
        // 如果没有原始数据，统一年份范围格式
        const processedData = data.map((row: any) => {
          const normalizedRange = normalizeYearRange(row['年份范围'] || '');
          return {
            '平台': row['平台'],
            '组织': row['组织'],
            '仓库': row['仓库'],
            '指标': row['指标'],
            '年份范围': normalizedRange,
            '平均值': row['平均值'],
            '数据点数': row['数据点数'],
            '国家': row['国家'] || '',
            '类别': row['类别'] || '',
            '机构标签': row['机构标签'] || '',
          };
        });

        const newWs = XLSX.utils.json_to_sheet(processedData);
        newWs['!cols'] = [
          { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 },
          { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 20 },
        ];
        XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
      } else {
        console.log(`    从原始数据重新计算时间均值，生成透视表格式（年份为列）`);
        
        // 第一步：按项目+年份聚合数据
        const yearMap = new Map<string, {
          platform: string;
          org: string;
          repo: string;
          metric: string;
          year: number;
          sum: number;
          count: number;
          country: string;
          category: string;
          orgLabel: string;
        }>();

        const allYears = new Set<number>();

        for (const row of rawData) {
          if (!row['时间键']) continue;
          const year = extractYear(row['时间键']);
          if (year === null) continue;

          allYears.add(year);

          const key = `${row['平台']}|${row['组织']}|${row['仓库']}|${row['指标']}|${year}`;
          if (!yearMap.has(key)) {
            yearMap.set(key, {
              platform: row['平台'],
              org: row['组织'],
              repo: row['仓库'],
              metric: row['指标'],
              year,
              sum: 0,
              count: 0,
              country: row['国家'] || '',
              category: row['类别'] || '',
              orgLabel: row['机构标签'] || '',
            });
          }
          const item = yearMap.get(key)!;
          item.sum += row['数值'];
          item.count += 1;
        }

        // 第二步：按项目分组，生成透视表格式
        const projectMap = new Map<string, {
          platform: string;
          org: string;
          repo: string;
          metric: string;
          country: string;
          category: string;
          orgLabel: string;
          yearValues: Map<number, number>; // year -> average value
        }>();

        for (const item of yearMap.values()) {
          const projectKey = `${item.platform}|${item.org}|${item.repo}|${item.metric}`;
          if (!projectMap.has(projectKey)) {
            projectMap.set(projectKey, {
              platform: item.platform,
              org: item.org,
              repo: item.repo,
              metric: item.metric,
              country: item.country,
              category: item.category,
              orgLabel: item.orgLabel,
              yearValues: new Map<number, number>(),
            });
          }
          const project = projectMap.get(projectKey)!;
          const avgValue = item.sum / item.count;
          project.yearValues.set(item.year, parseFloat(avgValue.toFixed(4)));
        }

        // 第三步：转换为Excel格式（透视表）
        const sortedYears = Array.from(allYears).sort((a, b) => a - b);
        const sortedProjects = Array.from(projectMap.values())
          .sort((a, b) => {
            // 先按指标排序，再按组织、仓库排序
            if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
            if (a.org !== b.org) return a.org.localeCompare(b.org);
            return a.repo.localeCompare(b.repo);
          });

        // 构建表头（项目信息列在前，年份列在后）
        const headers = ['平台', '组织', '仓库', '指标', '国家', '类别', '机构标签', ...sortedYears.map(y => String(y))];
        
        // 构建数据行
        const rows = sortedProjects.map(project => {
          const row = [
            project.platform,
            project.org,
            project.repo,
            project.metric,
            project.country,
            project.category,
            project.orgLabel,
            ...sortedYears.map(year => project.yearValues.get(year) || '')
          ];
          return row;
        });

        // 使用数组格式创建工作表，确保列顺序正确
        const newWs = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        
        // 设置列宽
        const colWidths = [
          { wch: 10 }, // 平台
          { wch: 25 }, // 组织
          { wch: 30 }, // 仓库
          { wch: 30 }, // 指标
          { wch: 8 },  // 国家
          { wch: 15 }, // 类别
          { wch: 20 }, // 机构标签
        ];
        // 为每个年份列设置宽度
        for (let i = 0; i < sortedYears.length; i++) {
          colWidths.push({ wch: 12 });
        }
        newWs['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
        console.log(`    生成透视表：${rows.length} 行，${sortedYears.length} 个年份列`);
      }
    } else {
      // 其他数据：直接保留
      const newWs = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(newWb, newWs, sheetName);
    }
  }

  // 如果文件已存在，先删除
  if (fs.existsSync(outputPath)) {
    try {
      fs.unlinkSync(outputPath);
    } catch (e) {
      console.warn(`  警告：无法删除旧文件 ${outputPath}，可能正在被使用`);
    }
  }
  
  XLSX.writeFile(newWb, outputPath);
  console.log(`  已保存到: ${outputPath}`);
}

function run() {
  const baseOutputDir = path.resolve(__dirname, '../../output');
  
  // 从excel文件夹读取输入文件
  const issueFile = path.join(baseOutputDir, 'excel', 'oss_issue_data.xlsx');
  const issueFileAlt = path.join(baseOutputDir, 'oss_issue_data.xlsx');
  const actualIssueFile = fs.existsSync(issueFile) ? issueFile : issueFileAlt;
  
  const prFile = path.join(baseOutputDir, 'excel', 'oss_pr_data.xlsx');
  const prFileAlt = path.join(baseOutputDir, 'oss_pr_data.xlsx');
  const actualPrFile = fs.existsSync(prFile) ? prFile : prFileAlt;
  
  // 使用带时间戳的文件名，避免覆盖正在使用的文件
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const issueOutput = getOutputPath(`oss_issue_data_by_year_${timestamp}.xlsx`, baseOutputDir);
  const prOutput = getOutputPath(`oss_pr_data_by_year_${timestamp}.xlsx`, baseOutputDir);

  console.log('开始处理Excel文件，按年份整合数据...\n');

  if (fs.existsSync(actualIssueFile)) {
    processExcelFile(actualIssueFile, issueOutput);
    console.log('');
  } else {
    console.warn(`未找到文件: ${actualIssueFile}`);
  }

  if (fs.existsSync(actualPrFile)) {
    processExcelFile(actualPrFile, prOutput);
    console.log('');
  } else {
    console.warn(`未找到文件: ${actualPrFile}`);
  }

  console.log('处理完成！');
}

if (require.main === module) {
  try {
    run();
  } catch (e) {
    console.error('❌ 运行出错:', e);
    process.exit(1);
  }
}

