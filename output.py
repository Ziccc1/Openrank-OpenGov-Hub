#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
根据 output.csv 中的 topics 字段，统计技术热点词的出现次数，生成词云图数据（前15排名）

输入文件：OpenGov Hub 目录下的 output.csv
输出文件：output文件夹下的 tech_wordcloud_data.json 和 tech_wordcloud_data.csv

使用方法：
1. 确保 output.csv 文件存在（包含 topics 字段）
2. 安装依赖：pip install pandas openpyxl
3. 运行：python output.py
"""

import json
import os
import csv
from collections import Counter
from typing import Dict, List
import pandas as pd

# 文件路径配置（相对于 OpenGov Hub 目录）
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 输入 CSV 文件：从 OpenGov Hub 根目录读取
INPUT_CSV = os.path.join(SCRIPT_DIR, 'output.csv')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, 'output')
# 使用分类输出目录
OUTPUT_JSON = os.path.join(OUTPUT_DIR, 'json', 'tech_wordcloud_data.json')
OUTPUT_CSV = os.path.join(OUTPUT_DIR, 'csv', 'tech_wordcloud_data.csv')
OUTPUT_EXCEL = os.path.join(OUTPUT_DIR, 'excel', 'tech_wordcloud_data.xlsx')

# 确保输出目录存在
for dir_path in [os.path.join(OUTPUT_DIR, 'json'), os.path.join(OUTPUT_DIR, 'csv'), os.path.join(OUTPUT_DIR, 'excel')]:
    os.makedirs(dir_path, exist_ok=True)


def count_topics_from_csv(csv_path: str) -> Dict[str, Dict]:
    """
    从 output.csv 中统计所有 topics 的出现次数
    
    Args:
        csv_path: CSV 文件路径
    
    Returns:
        {topic: {topic: str, count: int, repos: List[str]}}
    """
    topic_map = {}
    
    print(f'开始读取 {csv_path}...')
    df = pd.read_csv(csv_path)
    
    print(f'读取到 {len(df)} 行数据')
    
    # 统计每个 topic 的出现次数
    for idx, row in df.iterrows():
        repo_name = row.get('repo_name', '')
        topics_str = row.get('topics', '')
        
        if pd.isna(topics_str) or topics_str == '':
            continue
        
        # 解析 topics（逗号分隔的字符串）
        topics = [t.strip() for t in str(topics_str).split(',') if t.strip()]
        
        for topic in topics:
            topic_lower = topic.lower()
            if topic_lower not in topic_map:
                topic_map[topic_lower] = {
                    'topic': topic,  # 保留原始大小写
                    'count': 0,
                    'repos': [],
                }
            topic_map[topic_lower]['count'] += 1
            if repo_name and repo_name not in topic_map[topic_lower]['repos']:
                topic_map[topic_lower]['repos'].append(repo_name)
    
    return topic_map


def generate_wordcloud_data(topic_map: Dict[str, Dict], top_n: int = 15) -> List[Dict]:
    """
    生成词云图数据（按出现次数排序，取前N名）
    
    Args:
        topic_map: topics 统计字典
        top_n: 取前N名
    
    Returns:
        词云图数据列表
    """
    # 转换为列表并排序
    stats_list = list(topic_map.values())
    stats_list.sort(key=lambda x: x['count'], reverse=True)
    
    # 取前N名
    top_n_list = stats_list[:top_n]
    
    return [
        {
            'name': stat['topic'],
            'value': stat['count'],  # 词云图权重使用出现次数
            'count': stat['count'],
            'repos': stat['repos'],
        }
        for stat in top_n_list
    ]


def save_json(data: List[Dict], topic_map: Dict[str, Dict]):
    """保存 JSON 文件"""
    output = {
        'generatedAt': pd.Timestamp.now().isoformat(),
        'description': '热门技术热点词云图数据（前15排名，按出现次数排序）',
        'data': data,
        'stats': {
            'totalTopics': len(topic_map),
            'top15Topics': len(data),
        },
    }
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f'\n✅ JSON 文件已保存: {OUTPUT_JSON}')


def save_csv(data: List[Dict]):
    """保存 CSV 文件"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_CSV, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['name', 'value', 'count', 'repoCount'])
        for item in data:
            writer.writerow([
                item['name'],
                item['value'],
                item['count'],
                len(item['repos']),
            ])
    
    print(f'✅ CSV 文件已保存: {OUTPUT_CSV}')


def save_excel(data: List[Dict], topic_map: Dict[str, Dict]):
    """保存 Excel 文件"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 工作表1：词云图数据（前15排名）
    df1 = pd.DataFrame([
        {
            '排名': i + 1,
            '技术热点词': item['name'],
            '出现次数': item['count'],
            '涉及仓库数': len(item['repos']),
            '仓库列表': ', '.join(item['repos'][:10]),  # 只显示前10个仓库，避免过长
        }
        for i, item in enumerate(data)
    ])
    
    # 工作表2：详细统计（所有技术热点词）
    all_stats = list(topic_map.values())
    all_stats.sort(key=lambda x: x['count'], reverse=True)
    df2 = pd.DataFrame([
        {
            '排名': i + 1,
            '技术热点词': stat['topic'],
            '出现次数': stat['count'],
            '涉及仓库数': len(stat['repos']),
            '仓库列表': ', '.join(stat['repos'][:10]),  # 只显示前10个仓库
        }
        for i, stat in enumerate(all_stats)
    ])
    
    # 保存到 Excel
    with pd.ExcelWriter(OUTPUT_EXCEL, engine='openpyxl') as writer:
        df1.to_excel(writer, sheet_name='词云图数据（Top15）', index=False)
        df2.to_excel(writer, sheet_name='详细统计（全部）', index=False)
    
    print(f'✅ Excel 文件已保存: {OUTPUT_EXCEL}')


def main():
    """主函数"""
    print('开始生成热门技术词云图数据...')
    
    # 检查输入文件
    if not os.path.exists(INPUT_CSV):
        print(f'❌ 错误：找不到输入文件 {INPUT_CSV}')
        print('请确保 output.csv 文件存在于 OpenGov Hub 目录或 output 目录下')
        print('文件应包含 repo_name 和 topics 字段')
        return
    
    # 统计 topics
    topic_map = count_topics_from_csv(INPUT_CSV)
    print(f'\n统计到 {len(topic_map)} 个不同的技术热点词')
    
    # 生成词云图数据（按出现次数排序，前15名）
    wordcloud_data = generate_wordcloud_data(topic_map, top_n=15)
    
    print('\n热门技术热点词 Top15（按出现次数）：')
    for i, item in enumerate(wordcloud_data, 1):
        print(f'{i}. {item["name"]}: {item["count"]} 次 (涉及 {len(item["repos"])} 个仓库)')
    
    # 保存文件
    save_json(wordcloud_data, topic_map)
    save_csv(wordcloud_data)
    save_excel(wordcloud_data, topic_map)
    
    print('\n==============================')
    print('热门技术词云图数据生成完成！')
    print(f'输出文件：')
    print(f'  - {OUTPUT_JSON}')
    print(f'  - {OUTPUT_CSV}')
    print(f'  - {OUTPUT_EXCEL}')


if __name__ == '__main__':
    main()
