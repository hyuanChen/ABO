# ABO — AGENT.md

## Highest Priority Rule For Scheduled Feed Work

- 任何“每日情报 / 定时任务 / feed 监控”功能，必须复用对应“主动工具”的前端组件、后端抓取逻辑、卡片结构、保存路径、入库逻辑、过滤逻辑和配置结构。
- 不允许为了定时任务另外写一套平行实现；定时任务本质上只是“在定时触发时执行一次主动工具已有链路”。
- 如果主动工具已经有：
  - 卡片组件
  - crawl / fetch / process 逻辑
  - 保存到文献库 / Wiki / Vault 的逻辑
  - 过滤配置、页数、条数、时间窗等参数
  - 调试入口
  那么 feed / 定时任务必须直接复用这些实现，优先抽公共函数或公共组件，不能在 feed 里复制一份简化版或残缺版。
- 对论文、Follow Up、小红书、Bilibili 都适用这条规则。
- 开始实现任何 feed / 定时任务需求前，先检查：
  1. 对应主动工具的现有前端组件是否能直接复用
  2. 对应主动工具的后端 fetch / process / save 是否能直接复用
  3. 当前改动是否只是“调度 + 配置透传 + 去重 / 展示适配”
- 如果发现 feed 和主动工具出现不一致，默认判断为 bug，优先修成“主动工具单一事实来源”，而不是继续补 feed 专用分支。

## TODO

- `semantic-scholar-tracker` 在搜索/监控 follow up 论文时，当前会对每篇结果调用 `agent_json` 做摘要、打分、标签、贡献提炼。
- 需要补一个可关闭的开关或 fallback 模式：暂时不需要这个 part 时，直接跳过 agent 分析，只保留基础搜索结果、图片、链接和 metadata。
- 触发入口：
  - 手动搜索：`POST /api/modules/semantic-scholar-tracker/crawl`
  - 定时监控：`semantic-scholar-tracker` 调度运行
- 代码位置：
  - `abo/main.py` → `crawl_semantic_scholar_tracker()`
  - `abo/default_modules/semantic_scholar_tracker/__init__.py` → `process()` 内的 `agent_json(...)`
