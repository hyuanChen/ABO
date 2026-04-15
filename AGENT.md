# ABO — AGENT.md

## TODO

- `semantic-scholar-tracker` 在搜索/监控 follow up 论文时，当前会对每篇结果调用 `agent_json` 做摘要、打分、标签、贡献提炼。
- 需要补一个可关闭的开关或 fallback 模式：暂时不需要这个 part 时，直接跳过 agent 分析，只保留基础搜索结果、图片、链接和 metadata。
- 触发入口：
  - 手动搜索：`POST /api/modules/semantic-scholar-tracker/crawl`
  - 定时监控：`semantic-scholar-tracker` 调度运行
- 代码位置：
  - `abo/main.py` → `crawl_semantic_scholar_tracker()`
  - `abo/default_modules/semantic_scholar_tracker/__init__.py` → `process()` 内的 `agent_json(...)`
