import { existsSync, readFileSync, mkdirSync } from 'fs';
import * as path from 'path';

/**
 * 读取文件并解析为对象（支持JSON和YAML格式）
 * @param path 文件路径
 * @returns 解析后的对象，如果文件不存在或解析失败返回null
 */
export function readFileAsObj(path: string) {
  if (!existsSync(path)) {
    return null;
  }
  const content = readFileSync(path).toString();
  if (path.toLocaleLowerCase().endsWith('.json')) {
    // json format
    try {
      return JSON.parse(content);
    } catch (e) {
      console.log(`Parse JSON content failed, e=${e}`);
      return null;
    }
  }
  // 如果需要YAML支持，可以添加js-yaml依赖
  return null;
}

/**
 * 格式化日期字符串（ISO 8601 -> YYYY-MM-DD HH:MM:SS）
 * @param date ISO 8601格式的日期字符串
 * @returns 格式化后的日期字符串
 * @example
 * formatDate("2024-06-01T12:34:56Z") // returns "2024-06-01 12:34:56"
 */
export const formatDate = (date: string) => {
  return date.replace('T', ' ').replace('Z', '').slice(0, 19);
};

/**
 * 创建日志记录器
 * @param tag 日志标签
 * @returns 日志记录器对象
 */
export const getLogger = (tag: string) => {
  const log = (level: string, ...args: any[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    console.log(`${timestamp} ${level} [${tag}]`, ...args);
  };
  return {
    info: (...args: any[]) => log('INFO', ...args),
    warn: (...args: any[]) => log('WARN', ...args),
    error: (...args: any[]) => log('ERROR', ...args),
  };
};

/**
 * 等待指定毫秒数
 * @param mill 毫秒数
 */
export async function waitFor(mill: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, mill);
  });
}

/**
 * 获取分类的输出目录路径
 * @param format 文件格式：'excel' | 'csv' | 'json'
 * @param baseDir 基础输出目录，默认为相对于脚本的 output 目录
 * @returns 格式化的输出目录路径
 */
export function getOutputDir(format: 'excel' | 'csv' | 'json', baseDir?: string): string {
  const base = baseDir || path.resolve(__dirname, '../output');
  const dir = path.join(base, format);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  return dir;
}

/**
 * 获取输出文件路径（自动分类到对应格式文件夹）
 * @param filename 文件名（包含扩展名）
 * @param baseDir 基础输出目录，默认为相对于脚本的 output 目录
 * @returns 完整的文件路径
 */
export function getOutputPath(filename: string, baseDir?: string): string {
  const ext = path.extname(filename).toLowerCase();
  let format: 'excel' | 'csv' | 'json';
  
  if (ext === '.xlsx' || ext === '.xls') {
    format = 'excel';
  } else if (ext === '.csv') {
    format = 'csv';
  } else if (ext === '.json') {
    format = 'json';
  } else {
    // 默认放到根目录
    const base = baseDir || path.resolve(__dirname, '../output');
    return path.join(base, filename);
  }
  
  const dir = getOutputDir(format, baseDir);
  return path.join(dir, filename);
}
