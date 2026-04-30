# 共享智能分组工作流

这份文档描述 `共享智能分组` 按钮的实际执行链路，以及它如何把本地情报库、关注列表、共享标签库、后续爬取和 Feed 过滤接起来。

另见：

- [共享智能分组标签微调与 AI 整理规范](./shared-smart-group-tag-mapping-playbook.md)

## 目标

用户点击一次 `共享智能分组` 后，系统应完成下面几件事：

1. 扫描本地 Obsidian 情报库里已经保存的小红书和哔哩哔哩内容。
2. 抽取所有可用标签、话题、收藏夹名、专辑名、作者映射信息。
3. 把同一作者在两个平台的标签整理成一套共享组别。
4. 尽量让作者落入可管理的主题组，而不是堆进 `其他` 或 `待补标签`。
5. 把这套共享组别回填到 XHS/B 站配置里，供后续按组爬取和按组推送使用。

## 一键流程

### 1. 扫描本地情报库

入口在 [abo/routes/tools.py](/Users/huanc/Desktop/ABO/abo/routes/tools.py) 的 `_build_shared_creator_grouping_bundle(...)`。

这里会先扫描 vault 中的两类本地数据：

- 小红书收藏作者分析：[abo/tools/xhs_crawler.py](/Users/huanc/Desktop/ABO/abo/tools/xhs_crawler.py)
- 哔哩哔哩收藏作者分析：[abo/tools/bilibili_crawler.py](/Users/huanc/Desktop/ABO/abo/tools/bilibili_crawler.py)

扫描时会读取：

- frontmatter 中的 `tags` / `topics` / `albums` / `收藏夹`
- Markdown 正文里的 `**标签**`、`**话题**`、`**关键词**`
- 小红书正文中的 `#话题#`
- 标题、摘要、专辑名、收藏夹名
- 作者名、作者 ID、UP UID、OID、BVID 等映射信息

### 2. 构建共享标签数据库

vault 会生成一份跨平台原始标签索引：

- `<vault>/.abo/shared-tag-database.json`
- `<vault>/data/shared_tag_index.json`

实现位置：

- [abo/vault/tag_index.py](/Users/huanc/Desktop/ABO/abo/vault/tag_index.py)

这份数据库的作用不是直接给用户看，而是给后续共享分组提供“原始标签词典”和样本上下文。

从现在的实现开始，这一步是 `首次全量、后续增量`：

- 第一次会完整扫描 vault 里的 Markdown。
- 之后会复用 `.abo/shared-tag-database.json` 里的文件级缓存。
- 只有新笔记、被修改的笔记、被删除的笔记会重新处理。
- `data/shared_tag_index.json` 继续保留给 UI 和用户查看的公共标签摘要，不会把内部缓存直接暴露出去。

### 3. 合并作者种子池

共享作者池会把下面几类作者合并到一起：

- 本地 XHS 笔记里映射出的博主
- 本地 B 站收藏/稍后再看/动态里整理出的作者
- B 站真实关注列表
- 历史共享映射里已知 ID/作者名/OID 能对上的作者

作者合并逻辑会尽量复用已有映射，避免同一作者因为名字略有变化被拆成多个条目。

### 4. 补抓已关注作者最近 3 条

现在只对 **B 站真实关注列表** 做最近 3 条补抓，用来补足缺失标签。

小红书不再尝试网页关注列表，因为网页端没有稳定可用的关注列表获取链路。小红书作者只从本地笔记中映射。

实现位置：

- B 站关注补抓：[abo/routes/tools.py](/Users/huanc/Desktop/ABO/abo/routes/tools.py) `_augment_bilibili_seeds_with_followed_recent(...)`
- B 站近期视频抓取 API：[abo/tools/bilibili.py](/Users/huanc/Desktop/ABO/abo/tools/bilibili.py)

如果 B 站 `SESSDATA` 不可用，这一步会自动跳过，系统仍然可以基于本地收藏继续完成共享分组。

### 5. 生成共享组别

共享组别的生成遵循“标签优先，AI 只做补全”的原则。

当前分三层：

1. 规则层
   位置：[abo/routes/tools.py](/Users/huanc/Desktop/ABO/abo/routes/tools.py) `_RULE_BASED_SHARED_GROUPS`
   作用：把稳定主题直接映射到固定共享组，例如 `AI / 大模型`、`研究生 / 博士`、`健康 / 医学科普`、`宠物 / 萌宠`。

2. 已有共享映射层
   作用：优先复用用户之前保存过的 `原始标签 -> 共享组` 规则，减少每次重跑时的标签漂移。

3. AI 补全层
   作用：当规则层和已有映射层还不足以覆盖长尾标签时，AI 会尝试把未命中的标签并到已有组，必要时少量新增共享组。

### 6. 未命中标签二次细化

AI 不是一次性拍板，而是按未命中标签反复补几轮。

实现位置：

- [abo/routes/tools.py](/Users/huanc/Desktop/ABO/abo/routes/tools.py) `_refine_tag_group_labels_iteratively(...)`

这一轮主要处理：

- 语义接近但还没挂组的标签
- 长尾标签的补映射
- 避免出现 `低信息标签`、`其他` 这类占位标签

### 7. 作者级最后兜底

如果某些作者仍然没有稳定标签，系统会再看作者的：

- 标题
- 专辑 / 收藏夹
- 摘要
- 最近内容

然后做最后一轮作者级分配。

实现位置：

- [abo/routes/tools.py](/Users/huanc/Desktop/ABO/abo/routes/tools.py) `_suggest_ai_pending_author_group_assignments(...)`

另外还加了一层纯代码兜底：

- 修复短词误判，比如 `知识` 不能再把 `健康知识科普` 吸到 `知识管理 / Obsidian`
- 对标题、专辑、摘要做规则匹配，减少无标签作者继续掉进 `待补标签`

相关实现：

- [abo/creator_smart_groups.py](/Users/huanc/Desktop/ABO/abo/creator_smart_groups.py)
- [abo/routes/tools.py](/Users/huanc/Desktop/ABO/abo/routes/tools.py) `_assign_entry_groups_by_tags(...)`

### 8. 落盘共享产物

最后会把共享分组结果写回 vault：

- `<vault>/data/shared_tag_index.json`
- `<vault>/data/shared_smart_groups.json`
- `<vault>/data/shared_creator_profiles.json`

其中：

- `shared_tag_index.json` 保存原始标签数据库
- `shared_smart_groups.json` 保存共享组别和 `signal_group_labels`
- `shared_creator_profiles.json` 保存跨平台作者档案和作者到组别的最终映射

补充说明：

- `signal_group_labels` 现在允许 `一个原始标签 -> 一个共享组`，也允许 `一个原始标签 -> 多个共享组`
- 多组映射主要用于桥接标签，例如 `联系导师 -> 申博 / 留学 + 研究生 / 博士`
- 具体微调准则、未确认标签处理方式、AI 整理约束见配套规范文档

## 和 XHS / B 站爬取的接线

### 小红书

XHS 模块会读取 `creator_groups`，只抓选中的共享组作者。

实现位置：

- [abo/default_modules/xiaohongshu/__init__.py](/Users/huanc/Desktop/ABO/abo/default_modules/xiaohongshu/__init__.py)

### 哔哩哔哩

B 站模块会读取 `followed_up_groups`，只抓选中的共享组 UP。

实现位置：

- [abo/default_modules/bilibili/__init__.py](/Users/huanc/Desktop/ABO/abo/default_modules/bilibili/__init__.py)

现在 B 站不再保留单独的 `收藏夹UP` 池。收藏映射出来的作者会直接并入共享智能分组，不再走单独一套“反推博主”工作流。

## 和 Feed / 情报过滤的接线

Feed 层会读取共享组信息，把卡片映射到统一类型标签上。

实现位置：

- [src/modules/feed/intelligence.ts](/Users/huanc/Desktop/ABO/src/modules/feed/intelligence.ts)
- [src/modules/feed/ModuleDetail.tsx](/Users/huanc/Desktop/ABO/src/modules/feed/ModuleDetail.tsx)

结果是：

- 可以按共享组筛选 XHS 作者
- 可以按共享组筛选 B 站 UP
- 可以在情报页统一看某一类作者对应的内容

## 卡片格式要求

共享智能分组不应该改变平台卡片样式本身，它只负责给作者和内容挂共享标签。

要求保持：

- 小红书内容继续走小红书卡片结构
- 哔哩哔哩内容继续走 B 站卡片结构
- 共享组只作为额外的筛选维度，不重写平台内容格式

这意味着后续“按某一组重新爬取”时，输出仍然是平台原生卡片，只是来源作者集合换成了共享组成员。

## 当前稳定性策略

为了让这套功能能长期稳定迭代，代码里现在有三条约束：

1. 共享组名会做归一化
   例如 `读研 / 读博` 会归一成 `研究生 / 博士`，`留学 / 博士申请` 会归一成 `申博 / 留学`。

2. 占位标签会被拒绝
   例如 `低信息标签`、`待细化`、`其他` 不再作为最终共享组名保留。

3. 短词模糊匹配被收紧
   例如 `知识` 不能再错误匹配到 `健康知识科普`。

## 建议的产品交互

`共享智能分组` 按钮建议固定执行下面 7 步：

1. 扫本地 XHS + B 站数据
2. 只对 B 站真实关注作者补抓最近 3 条
3. 更新原始标签库
4. 聚类生成共享智能分组
5. 把各平台作者挂到共享组
6. 保存结果到 vault 和模块配置
7. 提供 UI 手动增删改

UI 上建议同步展示：

- 本次扫描作者数
- 共享组总数
- 仍待补标签的作者数
- 标签索引路径
- 共享组文件路径
- 作者档案文件路径

## 目前代码入口

如果后续继续优化，优先看这几个文件：

- 核心编排：[abo/routes/tools.py](/Users/huanc/Desktop/ABO/abo/routes/tools.py)
- 标签匹配与共享组选项：[abo/creator_smart_groups.py](/Users/huanc/Desktop/ABO/abo/creator_smart_groups.py)
- Vault 标签数据库：[abo/vault/tag_index.py](/Users/huanc/Desktop/ABO/abo/vault/tag_index.py)
- 小红书作者分析：[abo/tools/xhs_crawler.py](/Users/huanc/Desktop/ABO/abo/tools/xhs_crawler.py)
- B 站最近视频补抓：[abo/tools/bilibili.py](/Users/huanc/Desktop/ABO/abo/tools/bilibili.py)

## 验收标准

这条工作流最终是否达标，建议按下面几项看：

1. `待补标签` 是否接近 0，至少不能成为大桶。
2. 是否不存在明显误分，例如医学内容被归到 `Obsidian`。
3. 同一主题在 XHS / B 站是否复用同一共享组名。
4. 共享组能否直接驱动“按组爬取”和“按组过滤情报”。
5. 结果文件是否稳定写入 vault，并能在下次增量运行时复用。
