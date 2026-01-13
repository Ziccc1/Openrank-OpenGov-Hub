/**
 * 将 oss_dashboard_data.json 中的 rows 扁平表导出为 CSV
 * 方便直接在 DataEase 导入使用。
 *
 * 用法：
 * 1) 先运行 oss_dashboard_fetch.ts 生成 oss_dashboard_data.json（在output文件夹中）
 * 2) 在 OpenGov Hub 目录执行：
 *    npm run build
 *    node lib/scripts/oss_rows_to_csv.js
 * 3) 输出文件：output文件夹下 oss_rows.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import { getOutputPath } from '../utils';

interface FlatRow {
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

interface OssData {
  rows: FlatRow[];
}

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
      if (s.includes(',') || s.includes('"')) {
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

function run() {
  const baseOutputDir = path.resolve(__dirname, '../../output');
  // 从json文件夹读取输入文件
  const inputJson = path.join(baseOutputDir, 'json', 'oss_dashboard_data.json');
  const inputAlt = path.resolve(__dirname, '../../output/oss_dashboard_data.json');
  const input = fs.existsSync(inputJson) ? inputJson : inputAlt;
  
  const output = getOutputPath('oss_rows.csv', baseOutputDir);

  if (!fs.existsSync(input)) {
    throw new Error(`未找到输入文件：${input}，请先运行 oss_dashboard_fetch.ts`);
  }

  const data = JSON.parse(fs.readFileSync(input, 'utf-8')) as OssData;
  if (!data.rows || !Array.isArray(data.rows)) {
    throw new Error('oss_dashboard_data.json 缺少 rows 字段，请确认文件是否正确生成');
  }

  const csv = toCsv(data.rows);
  fs.writeFileSync(output, csv, 'utf-8');
  console.log('CSV 导出完成');
  console.log(`行数: ${data.rows.length}`);
  console.log(`输出文件: ${output}`);
}

if (require.main === module) {
  run();
}


