"""
Demo data for promotional screenshots.

Persona: 具身智能博士生 + 文艺复兴式多面手
- Core: Embodied Intelligence / Robotics PhD
- Side: 日语, 炒股, 文学, 存在主义, 科普UP主, 电影, 摄影, 吉他, 羽毛球, 徒步
- Aspiration: 数字游民, FIRE 早退休, Vibe Coding
"""
import random
from datetime import date, datetime, timedelta

# ── Helpers ──────────────────────────────────────────────────────

def _today() -> str:
    return date.today().isoformat()


def _days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).isoformat()


def _ts_today(hour: int, minute: int = 0) -> str:
    return f"{_today()}T{hour:02d}:{minute:02d}:00"


def _unix_days_ago(n: int, jitter_hours: int = 0) -> float:
    dt = datetime.now() - timedelta(days=n, hours=random.randint(0, max(0, jitter_hours)))
    return dt.timestamp()


# ── Profile ──────────────────────────────────────────────────────

DEMO_IDENTITY = {
    "codename": "赛博浪人",
    "long_term_goal": "让机器人理解物理世界，像人一样感知、思考、行动",
    "research_field": "Embodied Intelligence / Robotics",
    "affiliation": "",
}

DEMO_MOTTO = {
    "date": _today(),
    "motto": "存在先于本质——但代码先于存在。",
    "description": "精力充沛，研究方向清晰，偶尔陷入关于意义的沉思。",
}


# ── Six Dimensions ───────────────────────────────────────────────

def _dim(score: int, raw: dict) -> dict:
    grades = {80: "A", 60: "B", 40: "C", 20: "D", 0: "E"}
    grade = "E"
    for threshold, g in sorted(grades.items(), reverse=True):
        if score >= threshold:
            grade = g
            break
    return {"score": score, "grade": grade, "raw": raw}


DEMO_STATS = {
    "research":  _dim(72, {"lit_count": 18, "arxiv_stars": 12}),
    "output":    _dim(58, {"meeting_count": 3, "idea_count": 5}),
    "health":    _dim(65, {"note": "羽毛球+徒步, 偶尔熬夜"}),
    "learning":  _dim(81, {"podcast_done": 6, "trend_deep": 5}),
    "san":       _dim(63, {"san_7d_avg": 6.3}),
    "happiness": _dim(74, {"happiness_today": 7.2, "energy_today": 68}),
}


# ── Skills & Achievements ───────────────────────────────────────

DEMO_SKILLS = {
    "research_explorer": {"unlocked_at": "2026-03-15T10:00:00"},
    "paper_diver":       {"unlocked_at": "2026-03-20T14:30:00"},
    "content_creator":   {"unlocked_at": "2026-03-25T09:00:00"},
    "idea_spark":        {"unlocked_at": "2026-04-01T16:00:00"},
    "podcast_listener":  {"unlocked_at": "2026-03-18T20:00:00"},
    "deep_reader":       {"unlocked_at": "2026-04-05T11:00:00"},
    "daily_streaker":    {"unlocked_at": "2026-04-02T08:00:00"},
}

DEMO_ACHIEVEMENTS = [
    {"id": "deep_read",  "name": "深度阅读者",  "unlocked_at": "2026-04-03T10:00:00"},
    {"id": "loop",       "name": "循环不止",    "unlocked_at": "2026-04-08T09:00:00"},
    {"id": "night_owl",  "name": "夜猫子",     "unlocked_at": "2026-03-28T02:30:00"},
]


# ── Todos ────────────────────────────────────────────────────────

def get_demo_todos() -> list:
    return [
        {"id": "t1", "text": "整理 RT-2 论文笔记", "done": True},
        {"id": "t2", "text": "练吉他 30min — Autumn Leaves", "done": True},
        {"id": "t3", "text": "写科普视频脚本：具身智能是什么", "done": False},
        {"id": "t4", "text": "羽毛球约战 @小王", "done": True},
        {"id": "t5", "text": "日语 N2 语法复习 — て形", "done": False},
        {"id": "t6", "text": "提交 ICRA workshop 论文初稿", "done": False},
        {"id": "t7", "text": "看完《银翼杀手2049》影评", "done": True},
    ]


# ── Feed Cards ───────────────────────────────────────────────────

def get_demo_cards() -> list[dict]:
    """Return demo cards with dynamic timestamps."""
    cards = [
        # ── arxiv-tracker ────────────────────────────────────────
        {"id": "demo-arxiv-001", "module_id": "arxiv-tracker",
         "title": "RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control",
         "summary": "提出视觉-语言-动作模型，将互联网预训练知识迁移到机器人操控中，在真实机器人上实现复杂指令跟随。",
         "tags": ["Embodied AI", "VLA", "Robot Manipulation"], "score": 0.94,
         "source_url": "https://arxiv.org/abs/2307.15818", "days_ago": 0, "feedback": "star"},
        {"id": "demo-arxiv-002", "module_id": "arxiv-tracker",
         "title": "Embodied Chain-of-Thought Reasoning for Robotic Manipulation",
         "summary": "将思维链推理引入具身智能，让机器人在操作前进行分步规划推理，显著提升复杂任务成功率。",
         "tags": ["具身智能", "Chain-of-Thought", "Manipulation"], "score": 0.91,
         "source_url": "https://arxiv.org/abs/2410.00001", "days_ago": 0, "feedback": "save"},
        {"id": "demo-arxiv-003", "module_id": "arxiv-tracker",
         "title": "Diffusion Policy: Visuomotor Policy Learning via Action Diffusion",
         "summary": "将扩散模型应用于机器人策略学习，生成连续动作序列，在接触密集任务上超越现有方法。",
         "tags": ["Diffusion Policy", "Visuomotor", "Robot Learning"], "score": 0.89,
         "source_url": "https://arxiv.org/abs/2303.04137", "days_ago": 1, "feedback": "like"},
        {"id": "demo-arxiv-004", "module_id": "arxiv-tracker",
         "title": "Open X-Embodiment: Robotic Learning Datasets and RT-X Models",
         "summary": "来自 33 个机器人实验室的联合数据集，训练出可跨平台迁移的通用操作模型 RT-X。",
         "tags": ["Open X-Embodiment", "RT-X", "大规模数据"], "score": 0.92,
         "source_url": "https://arxiv.org/abs/2310.08864", "days_ago": 1},
        {"id": "demo-arxiv-005", "module_id": "arxiv-tracker",
         "title": "VoxPoser: Composable 3D Value Maps for Robotic Manipulation",
         "summary": "利用 LLM 和视觉基础模型在 3D 空间中合成价值图，实现零样本机器人操控。",
         "tags": ["VoxPoser", "3D Value Maps", "Zero-shot"], "score": 0.86,
         "source_url": "https://arxiv.org/abs/2307.05973", "days_ago": 2},
        {"id": "demo-arxiv-006", "module_id": "arxiv-tracker",
         "title": "Learning Dexterous Manipulation from Human Demonstration Videos",
         "summary": "从人类演示视频中学习灵巧操作技能，无需遥操作数据，在多种抓取任务上验证。",
         "tags": ["Dexterous", "Video Learning", "Human Demo"], "score": 0.84,
         "source_url": "https://arxiv.org/abs/2410.00002", "days_ago": 2},
        {"id": "demo-arxiv-007", "module_id": "arxiv-tracker",
         "title": "Foundation Models for Sim-to-Real Transfer in Robotics",
         "summary": "综述基础模型在仿真到真实迁移中的应用，提出域随机化与视觉基础模型结合的新范式。",
         "tags": ["Sim-to-Real", "Foundation Models", "Domain Adaptation"], "score": 0.82,
         "source_url": "https://arxiv.org/abs/2410.00003", "days_ago": 3},
        {"id": "demo-arxiv-008", "module_id": "arxiv-tracker",
         "title": "Language-Conditioned Robotic Manipulation with Multi-Modal Prompts",
         "summary": "支持自然语言、图像和视频作为多模态提示输入的机器人操控框架。",
         "tags": ["Multi-Modal", "Language-Conditioned", "Robotics"], "score": 0.80,
         "source_url": "https://arxiv.org/abs/2410.00004", "days_ago": 3},
        {"id": "demo-arxiv-009", "module_id": "arxiv-tracker",
         "title": "Scaling Robot Learning with Semantically Imagined Experience",
         "summary": "用生成模型「想象」语义丰富的训练场景，以极低成本扩展机器人训练数据。",
         "tags": ["Data Augmentation", "Generative", "Robot Learning"], "score": 0.78,
         "source_url": "https://arxiv.org/abs/2410.00005", "days_ago": 4},
        {"id": "demo-arxiv-010", "module_id": "arxiv-tracker",
         "title": "RoboAgent: Generalizable Robot Policy from Internet Videos",
         "summary": "从互联网视频中训练通用机器人策略，实现跨任务跨场景的泛化能力。",
         "tags": ["RoboAgent", "Internet Video", "Generalization"], "score": 0.83,
         "source_url": "https://arxiv.org/abs/2410.00006", "days_ago": 5},

        # ── semantic-scholar-tracker ─────────────────────────────
        {"id": "demo-ss-001", "module_id": "semantic-scholar-tracker",
         "title": "A Survey of Embodied AI: From Simulators to Foundation Models",
         "summary": "全面综述具身智能的演进：从仿真平台到视觉-语言-动作基础模型，梳理核心挑战与未来方向。",
         "tags": ["Embodied AI", "Survey", "Foundation Models"], "score": 0.93,
         "source_url": "https://www.semanticscholar.org/paper/ea001", "days_ago": 1, "feedback": "save"},
        {"id": "demo-ss-002", "module_id": "semantic-scholar-tracker",
         "title": "Bridging Language and Action: LLM-based Robot Planning",
         "summary": "综述大语言模型在机器人任务规划中的应用，包括代码生成、子目标分解和常识推理。",
         "tags": ["LLM Planning", "Robot", "Task Decomposition"], "score": 0.88,
         "source_url": "https://www.semanticscholar.org/paper/ea002", "days_ago": 2},
        {"id": "demo-ss-003", "module_id": "semantic-scholar-tracker",
         "title": "Tactile Sensing for Dexterous In-Hand Manipulation",
         "summary": "触觉传感在灵巧手内操作中的最新进展，涵盖传感器设计、信号处理和策略学习。",
         "tags": ["Tactile", "Dexterous Manipulation", "Sensing"], "score": 0.81,
         "source_url": "https://www.semanticscholar.org/paper/ea003", "days_ago": 3},
        {"id": "demo-ss-004", "module_id": "semantic-scholar-tracker",
         "title": "Towards General-Purpose Robots via Foundation Models",
         "summary": "探讨如何通过视觉-语言基础模型构建通用机器人，分析当前瓶颈和可行路径。",
         "tags": ["General-Purpose", "Foundation Models", "Robotics"], "score": 0.90,
         "source_url": "https://www.semanticscholar.org/paper/ea004", "days_ago": 4},
        {"id": "demo-ss-005", "module_id": "semantic-scholar-tracker",
         "title": "World Models for Autonomous Driving: A Comprehensive Review",
         "summary": "自动驾驶世界模型综述，对比 GAIA-1、DriveDreamer 和 UniSim 等方法。",
         "tags": ["World Models", "Autonomous Driving", "Simulation"], "score": 0.76,
         "source_url": "https://www.semanticscholar.org/paper/ea005", "days_ago": 5},
        {"id": "demo-ss-006", "module_id": "semantic-scholar-tracker",
         "title": "Human-Robot Interaction: A Survey of LLM Integration",
         "summary": "LLM 在人机交互中的集成方式综述，涵盖对话、手势理解和意图推断。",
         "tags": ["HRI", "LLM", "Interaction"], "score": 0.79,
         "source_url": "https://www.semanticscholar.org/paper/ea006", "days_ago": 5},

        # ── xiaohongshu-tracker ──────────────────────────────────
        {"id": "demo-xhs-001", "module_id": "xiaohongshu-tracker",
         "title": "数字游民一年后的真实感受：自由的代价",
         "summary": "在清迈生活一年的数字游民分享：时区差、孤独感、签证焦虑，以及那些意想不到的收获。",
         "tags": ["数字游民", "远程工作", "生活方式"], "score": 0.85,
         "source_url": "https://www.xiaohongshu.com/explore/xhs001", "days_ago": 0, "feedback": "like"},
        {"id": "demo-xhs-002", "module_id": "xiaohongshu-tracker",
         "title": "读博第四年，我终于学会了和焦虑共处",
         "summary": "从 deadline 恐慌到接受不确定性，一个工科博士的心路历程。附正念冥想和运动处方。",
         "tags": ["读博", "焦虑", "心理健康"], "score": 0.88,
         "source_url": "https://www.xiaohongshu.com/explore/xhs002", "days_ago": 1, "feedback": "save"},
        {"id": "demo-xhs-003", "module_id": "xiaohongshu-tracker",
         "title": "日本京都 | 胶片摄影散步记录",
         "summary": "带着 Contax T2 在东山漫步，岚山竹林、哲学之道的光影记录。附胶片选择指南。",
         "tags": ["摄影", "京都", "胶片"], "score": 0.78,
         "source_url": "https://www.xiaohongshu.com/explore/xhs003", "days_ago": 2},
        {"id": "demo-xhs-004", "module_id": "xiaohongshu-tracker",
         "title": "FIRE 运动实践：博士在读也能开始理财",
         "summary": "每月存下奖学金的 40%，用指数基金定投和可转债打底。3 年攒下第一桶金的真实记录。",
         "tags": ["FIRE", "理财", "博士生活"], "score": 0.82,
         "source_url": "https://www.xiaohongshu.com/explore/xhs004", "days_ago": 2, "feedback": "like"},
        {"id": "demo-xhs-005", "module_id": "xiaohongshu-tracker",
         "title": "徒步武功山 | 云海日出太震撼了",
         "summary": "两天一夜武功山穿越攻略：路线、装备、露营点，以及那个让我流泪的日出。",
         "tags": ["徒步", "武功山", "户外"], "score": 0.75,
         "source_url": "https://www.xiaohongshu.com/explore/xhs005", "days_ago": 3},
        {"id": "demo-xhs-006", "module_id": "xiaohongshu-tracker",
         "title": "一个人的吉他练习日常 | 指弹入门第 6 个月",
         "summary": "从零开始学指弹的半年记录。今天终于能完整弹下 Autumn Leaves 了！附练习方法。",
         "tags": ["吉他", "指弹", "音乐"], "score": 0.72,
         "source_url": "https://www.xiaohongshu.com/explore/xhs006", "days_ago": 4},
        {"id": "demo-xhs-007", "module_id": "xiaohongshu-tracker",
         "title": "Obsidian + Zotero：我的论文管理工作流",
         "summary": "用 Obsidian 做读书笔记、Zotero 管参考文献，dataview 自动生成文献综述大纲。",
         "tags": ["Obsidian", "Zotero", "知识管理"], "score": 0.87,
         "source_url": "https://www.xiaohongshu.com/explore/xhs007", "days_ago": 4},
        {"id": "demo-xhs-008", "module_id": "xiaohongshu-tracker",
         "title": "日语 N2 备考 | 在读博期间考过的经验分享",
         "summary": "每天 30 分钟碎片时间备考日语的方法：通勤听力、午休阅读、睡前语法。",
         "tags": ["日语", "N2", "语言学习"], "score": 0.76,
         "source_url": "https://www.xiaohongshu.com/explore/xhs008", "days_ago": 5},

        # ── bilibili-tracker ─────────────────────────────────────
        {"id": "demo-bili-001", "module_id": "bilibili-tracker",
         "title": "【科普】具身智能：让 AI 拥有身体是什么体验",
         "summary": "从 Boston Dynamics 到 Figure 01，用通俗语言讲解具身智能的前世今生和未来展望。",
         "tags": ["科普", "具身智能", "机器人"], "score": 0.92,
         "source_url": "https://www.bilibili.com/video/BV1ea001", "days_ago": 1, "feedback": "like"},
        {"id": "demo-bili-002", "module_id": "bilibili-tracker",
         "title": "Vibe Coding：用自然语言写代码的时代来了",
         "summary": "实测 Claude Code + Cursor，30 分钟做出一个完整的个人网站。编程范式正在改变。",
         "tags": ["Vibe Coding", "AI编程", "Claude"], "score": 0.88,
         "source_url": "https://www.bilibili.com/video/BV1ea002", "days_ago": 1},
        {"id": "demo-bili-003", "module_id": "bilibili-tracker",
         "title": "吉他指弹教学：Autumn Leaves 完整版",
         "summary": "从分解和弦到完整演奏，一步步教你弹爵士经典 Autumn Leaves。附曲谱和伴奏。",
         "tags": ["吉他", "指弹教学", "爵士"], "score": 0.70,
         "source_url": "https://www.bilibili.com/video/BV1ea003", "days_ago": 3},
        {"id": "demo-bili-004", "module_id": "bilibili-tracker",
         "title": "量化投资入门：用 Python 分析 A 股数据",
         "summary": "从 tushare 获取数据到策略回测，手把手教你写第一个量化交易策略。",
         "tags": ["量化投资", "Python", "A股"], "score": 0.79,
         "source_url": "https://www.bilibili.com/video/BV1ea004", "days_ago": 3},
        {"id": "demo-bili-005", "module_id": "bilibili-tracker",
         "title": "加缪《局外人》深度解读：荒诞与反抗",
         "summary": "从莫尔索的冷漠说起，解读加缪的荒诞哲学如何回应「人生有什么意义」这个终极问题。",
         "tags": ["加缪", "存在主义", "文学"], "score": 0.83,
         "source_url": "https://www.bilibili.com/video/BV1ea005", "days_ago": 4, "feedback": "save"},
        {"id": "demo-bili-006", "module_id": "bilibili-tracker",
         "title": "读博生存指南：如何不疯掉地写完毕业论文",
         "summary": "来自过来人的 10 条建议，从选题到答辩，帮你活着毕业。",
         "tags": ["读博", "毕业论文", "生存指南"], "score": 0.85,
         "source_url": "https://www.bilibili.com/video/BV1ea006", "days_ago": 5},
        {"id": "demo-bili-007", "module_id": "bilibili-tracker",
         "title": "【4K】冰岛徒步 | 兰道曼纳劳卡高地纪录片",
         "summary": "穿越彩色火山地貌、冰川和温泉，冰岛高地 Laugavegur 步道全记录。",
         "tags": ["徒步", "冰岛", "纪录片"], "score": 0.74,
         "source_url": "https://www.bilibili.com/video/BV1ea007", "days_ago": 6},
        {"id": "demo-bili-008", "module_id": "bilibili-tracker",
         "title": "日语听力练习 | NHK 新闻每日一听",
         "summary": "精选 NHK 新闻片段，配合逐句翻译和语法解析，适合 N3-N2 水平。",
         "tags": ["日语", "听力", "NHK"], "score": 0.68,
         "source_url": "https://www.bilibili.com/video/BV1ea008", "days_ago": 6},

        # ── zhihu-tracker ────────────────────────────────────────
        {"id": "demo-zhihu-001", "module_id": "zhihu-tracker",
         "title": "具身智能的未来 5 年会怎样发展？",
         "summary": "知乎高赞回答：从数据、模型、硬件三个维度分析具身智能的突破点和投资方向。",
         "tags": ["具身智能", "行业分析", "未来趋势"], "score": 0.93,
         "source_url": "https://www.zhihu.com/question/ea001", "days_ago": 0, "feedback": "save"},
        {"id": "demo-zhihu-002", "module_id": "zhihu-tracker",
         "title": "读博期间如何保持心理健康？",
         "summary": "导师 PUA、论文被拒、同伴压力……过来人分享走出学术抑郁的真实经验。",
         "tags": ["读博", "心理健康", "学术压力"], "score": 0.86,
         "source_url": "https://www.zhihu.com/question/ea002", "days_ago": 1},
        {"id": "demo-zhihu-003", "module_id": "zhihu-tracker",
         "title": "FIRE 运动在中国可行吗？多少钱才能退休？",
         "summary": "从 4% 法则到中国国情调整，计算不同城市实现 FIRE 所需的最低资产。",
         "tags": ["FIRE", "理财", "早退休"], "score": 0.80,
         "source_url": "https://www.zhihu.com/question/ea003", "days_ago": 2, "feedback": "like"},
        {"id": "demo-zhihu-004", "module_id": "zhihu-tracker",
         "title": "人生的意义到底是什么？——一个理工科博士的思考",
         "summary": "从热力学第二定律到加缪的西西弗斯，一个物理博士试图用科学和哲学回答这个永恒问题。",
         "tags": ["存在主义", "哲学", "意义"], "score": 0.89,
         "source_url": "https://www.zhihu.com/question/ea004", "days_ago": 3, "feedback": "save"},
        {"id": "demo-zhihu-005", "module_id": "zhihu-tracker",
         "title": "Vibe Coding 会取代传统编程吗？",
         "summary": "对比手写代码与 AI 辅助编程的效率和质量差异，讨论程序员的未来角色。",
         "tags": ["Vibe Coding", "AI编程", "未来"], "score": 0.81,
         "source_url": "https://www.zhihu.com/question/ea005", "days_ago": 4},
        {"id": "demo-zhihu-006", "module_id": "zhihu-tracker",
         "title": "摄影到底是记录还是创造？",
         "summary": "从纪实摄影到街拍美学，探讨按下快门那一刻的主观性和客观性。",
         "tags": ["摄影", "美学", "创造"], "score": 0.72,
         "source_url": "https://www.zhihu.com/question/ea006", "days_ago": 5},
        {"id": "demo-zhihu-007", "module_id": "zhihu-tracker",
         "title": "作为科研人如何看待数字游民生活方式？",
         "summary": "几位已经实现远程科研的学者分享经验：哪些研究方向适合，工具链和日程管理。",
         "tags": ["数字游民", "远程科研", "生活方式"], "score": 0.78,
         "source_url": "https://www.zhihu.com/question/ea007", "days_ago": 6},
        {"id": "demo-zhihu-008", "module_id": "zhihu-tracker",
         "title": "加缪、萨特、存在主义：对当代青年的意义",
         "summary": "当代人的精神困境与存在主义哲学的对话，为什么「荒诞的反抗」比「虚无的摆烂」更有力量。",
         "tags": ["存在主义", "加缪", "萨特"], "score": 0.84,
         "source_url": "https://www.zhihu.com/question/ea008", "days_ago": 6},

        # ── xiaoyuzhou-tracker ───────────────────────────────────
        {"id": "demo-xyz-001", "module_id": "xiaoyuzhou-tracker",
         "title": "随机波动 | AI 时代，人还需要身体吗？",
         "summary": "从现象学和具身认知出发，讨论身体经验对智能的不可替代性。嘉宾是一位具身智能研究者。",
         "tags": ["具身认知", "AI", "哲学"], "score": 0.90,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea001", "days_ago": 1, "feedback": "save"},
        {"id": "demo-xyz-002", "module_id": "xiaoyuzhou-tracker",
         "title": "不合时宜 | 数字游民：逃离还是奔赴？",
         "summary": "采访三位不同阶段的数字游民，讨论自由的真实成本和精神回报。",
         "tags": ["数字游民", "自由", "生活方式"], "score": 0.82,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea002", "days_ago": 2},
        {"id": "demo-xyz-003", "module_id": "xiaoyuzhou-tracker",
         "title": "科技早知道 | 具身智能赛道全解析",
         "summary": "从 Figure AI 到特斯拉 Optimus，解析具身智能赛道的商业化前景和技术瓶颈。",
         "tags": ["具身智能", "创业", "行业分析"], "score": 0.87,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea003", "days_ago": 3},
        {"id": "demo-xyz-004", "module_id": "xiaoyuzhou-tracker",
         "title": "文化有限 | 读村上春树的日子",
         "summary": "聊聊村上春树的小说世界、爵士乐品味和跑步哲学。为什么他能一直写下去？",
         "tags": ["村上春树", "文学", "日本文化"], "score": 0.75,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea004", "days_ago": 4},
        {"id": "demo-xyz-005", "module_id": "xiaoyuzhou-tracker",
         "title": "声东击西 | 为什么我们越来越难感到幸福",
         "summary": "从多巴胺陷阱到积极心理学，讨论现代人的幸福悖论和可能的解法。",
         "tags": ["幸福", "心理学", "思考"], "score": 0.83,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea005", "days_ago": 5},
        {"id": "demo-xyz-006", "module_id": "xiaoyuzhou-tracker",
         "title": "日谈公园 | 一个博士的财务自由之路",
         "summary": "从月薪 3000 的博士生到 30 岁实现 coastFIRE，他怎么做到的？",
         "tags": ["FIRE", "博士", "理财"], "score": 0.77,
         "source_url": "https://www.xiaoyuzhoufm.com/episode/ea006", "days_ago": 6},

        # ── folder-monitor ───────────────────────────────────────
        {"id": "demo-fm-001", "module_id": "folder-monitor",
         "title": "[PDF] RT-2_paper_annotated.pdf",
         "summary": "检测到下载目录新增带批注的 RT-2 论文 PDF，23 页，3.8MB。",
         "tags": ["文件监控", "PDF", "论文"], "score": 0.95,
         "source_url": "", "days_ago": 0},
        {"id": "demo-fm-002", "module_id": "folder-monitor",
         "title": "[PDF] 日语N2语法总结.pdf",
         "summary": "检测到 Zotero 同步目录新增日语语法总结文档，42 页，1.2MB。",
         "tags": ["文件监控", "日语", "PDF"], "score": 0.62,
         "source_url": "", "days_ago": 2},
        {"id": "demo-fm-003", "module_id": "folder-monitor",
         "title": "[MD] 2026-04-reading-journal.md",
         "summary": "Obsidian Vault 中的阅读日记被修改，新增关于《局外人》的读书笔记。",
         "tags": ["文件监控", "日记", "Obsidian"], "score": 0.55,
         "source_url": "", "days_ago": 3},
        {"id": "demo-fm-004", "module_id": "folder-monitor",
         "title": "[RAW] 京都_樱花_001.CR3",
         "summary": "检测到摄影目录新增 Canon RAW 文件，京都樱花系列第 1 张。",
         "tags": ["文件监控", "摄影", "RAW"], "score": 0.42,
         "source_url": "", "days_ago": 5},
    ]

    # Build final card dicts with dynamic timestamps
    result = []
    for c in cards:
        result.append({
            "id": c["id"],
            "module_id": c["module_id"],
            "title": c["title"],
            "summary": c["summary"],
            "tags": c["tags"],
            "score": c["score"],
            "source_url": c.get("source_url", ""),
            "obsidian_path": f"Demo/{c['id']}.md",
            "created_at": _unix_days_ago(c.get("days_ago", 0), jitter_hours=8),
            "read": c.get("feedback") is not None,
            "feedback": c.get("feedback"),
            "metadata": {"demo": True},
        })
    return result


# ── Keyword Preferences ─────────────────────────────────────────

DEMO_KEYWORD_PREFS = {
    "Embodied Intelligence": {"score": 0.95, "count": 28, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker", "zhihu-tracker"]},
    "具身智能":              {"score": 0.93, "count": 25, "source_modules": ["zhihu-tracker", "bilibili-tracker", "xiaoyuzhou-tracker"]},
    "Robot Manipulation":    {"score": 0.88, "count": 19, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "Sim-to-Real":           {"score": 0.82, "count": 12, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "Foundation Models":     {"score": 0.85, "count": 16, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "Diffusion Policy":      {"score": 0.80, "count": 10, "source_modules": ["arxiv-tracker"]},
    "Vibe Coding":           {"score": 0.77, "count": 9,  "source_modules": ["bilibili-tracker", "zhihu-tracker"]},
    "数字游民":              {"score": 0.75, "count": 11, "source_modules": ["xiaohongshu-tracker", "zhihu-tracker", "xiaoyuzhou-tracker"]},
    "FIRE":                  {"score": 0.72, "count": 8,  "source_modules": ["xiaohongshu-tracker", "zhihu-tracker", "xiaoyuzhou-tracker"]},
    "读博":                  {"score": 0.73, "count": 14, "source_modules": ["xiaohongshu-tracker", "zhihu-tracker", "bilibili-tracker"]},
    "存在主义":              {"score": 0.70, "count": 7,  "source_modules": ["zhihu-tracker", "bilibili-tracker"]},
    "日语":                  {"score": 0.68, "count": 9,  "source_modules": ["xiaohongshu-tracker", "bilibili-tracker"]},
    "摄影":                  {"score": 0.65, "count": 6,  "source_modules": ["xiaohongshu-tracker"]},
    "吉他":                  {"score": 0.62, "count": 5,  "source_modules": ["xiaohongshu-tracker", "bilibili-tracker"]},
    "科普":                  {"score": 0.71, "count": 8,  "source_modules": ["bilibili-tracker"]},
    "Robotics":              {"score": 0.90, "count": 22, "source_modules": ["arxiv-tracker", "semantic-scholar-tracker"]},
    "徒步":                  {"score": 0.60, "count": 5,  "source_modules": ["xiaohongshu-tracker", "bilibili-tracker"]},
    "文学":                  {"score": 0.66, "count": 6,  "source_modules": ["bilibili-tracker", "xiaoyuzhou-tracker"]},
    "量化投资":              {"score": 0.63, "count": 4,  "source_modules": ["bilibili-tracker", "zhihu-tracker"]},
}


# ── Activity Timeline ───────────────────────────────────────────

def get_demo_activities() -> list[dict]:
    """Return today's demo activity timeline."""
    return [
        {"id": "a01", "type": "card_view",  "timestamp": _ts_today(8, 15), "card_title": "RT-2: Vision-Language-Action Models", "module_id": "arxiv-tracker", "metadata": {}},
        {"id": "a02", "type": "card_like",   "timestamp": _ts_today(8, 22), "card_title": "RT-2: Vision-Language-Action Models", "module_id": "arxiv-tracker", "metadata": {"action": "star"}},
        {"id": "a03", "type": "card_save",   "timestamp": _ts_today(8, 45), "card_title": "Embodied Chain-of-Thought Reasoning", "module_id": "arxiv-tracker", "metadata": {}},
        {"id": "a04", "type": "card_view",   "timestamp": _ts_today(9, 10), "card_title": "数字游民一年后的真实感受", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a05", "type": "card_like",   "timestamp": _ts_today(9, 15), "card_title": "数字游民一年后的真实感受", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a06", "type": "chat_start",  "timestamp": _ts_today(9, 30), "card_title": None, "module_id": None, "metadata": {"topic": "讨论 Diffusion Policy 在机械臂上的应用"}},
        {"id": "a07", "type": "chat_message","timestamp": _ts_today(9, 45), "card_title": None, "module_id": None, "metadata": {"topic": "对比 RT-2 和 Diffusion Policy 的优劣"}},
        {"id": "a08", "type": "card_view",   "timestamp": _ts_today(10, 5), "card_title": "读博第四年的焦虑共处", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a09", "type": "card_save",   "timestamp": _ts_today(10, 8), "card_title": "读博第四年的焦虑共处", "module_id": "xiaohongshu-tracker", "metadata": {}},
        {"id": "a10", "type": "module_run",  "timestamp": _ts_today(10, 30), "card_title": None, "module_id": "arxiv-tracker", "metadata": {"status": "success", "cards_count": 10}},
        {"id": "a11", "type": "card_view",   "timestamp": _ts_today(11, 0), "card_title": "具身智能：让 AI 拥有身体", "module_id": "bilibili-tracker", "metadata": {}},
        {"id": "a12", "type": "card_like",   "timestamp": _ts_today(11, 5), "card_title": "具身智能：让 AI 拥有身体", "module_id": "bilibili-tracker", "metadata": {}},
        {"id": "a13", "type": "checkin",     "timestamp": _ts_today(11, 20), "card_title": None, "module_id": None, "metadata": {"san": 65, "happiness": 72}},
        {"id": "a14", "type": "card_view",   "timestamp": _ts_today(13, 0), "card_title": "具身智能的未来5年", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a15", "type": "card_save",   "timestamp": _ts_today(13, 10), "card_title": "具身智能的未来5年", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a16", "type": "card_view",   "timestamp": _ts_today(14, 30), "card_title": "FIRE运动在中国可行吗", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a17", "type": "card_like",   "timestamp": _ts_today(14, 35), "card_title": "FIRE运动在中国可行吗", "module_id": "zhihu-tracker", "metadata": {}},
        {"id": "a18", "type": "card_view",   "timestamp": _ts_today(15, 20), "card_title": "加缪《局外人》深度解读", "module_id": "bilibili-tracker", "metadata": {}},
        {"id": "a19", "type": "card_save",   "timestamp": _ts_today(15, 30), "card_title": "加缪《局外人》深度解读", "module_id": "bilibili-tracker", "metadata": {}},
    ]


# ── SAN / Happiness / Energy History ─────────────────────────────

def get_demo_san_history() -> list[dict]:
    """30-day SAN history — realistic fluctuation for a PhD student."""
    # Pattern: generally 55-75, dips on thesis stress days, peaks on weekends
    base = [
        62, 58, 55, 60, 65, 72, 75,  # week 1: Monday dip, weekend recovery
        68, 63, 52, 48, 58, 70, 73,  # week 2: midweek crisis (rejection?)
        70, 65, 60, 62, 68, 74, 78,  # week 3: stable recovery
        72, 68, 55, 60, 63, 71, 76,  # week 4: another dip then up
        65, 63,                       # current week
    ]
    result = []
    for i, score in enumerate(base):
        d = 29 - i
        result.append({"date": _days_ago(d), "score": score})
    return result


def get_demo_happiness_history() -> list[dict]:
    """30-day happiness history."""
    base = [
        68, 65, 62, 70, 72, 78, 80,  # week 1
        75, 70, 58, 55, 65, 76, 82,  # week 2: follows SAN pattern loosely
        78, 72, 68, 70, 75, 80, 85,  # week 3
        80, 74, 60, 68, 72, 78, 82,  # week 4
        72, 70,                       # current
    ]
    result = []
    for i, score in enumerate(base):
        d = 29 - i
        result.append({"date": _days_ago(d), "score": score})
    return result


def get_demo_energy_history() -> list[dict]:
    """30-day energy history."""
    base = [
        72, 65, 58, 62, 70, 75, 80,
        68, 60, 50, 45, 62, 72, 78,
        75, 70, 65, 68, 72, 78, 82,
        76, 70, 55, 60, 68, 75, 80,
        68, 65,
    ]
    result = []
    for i, val in enumerate(base):
        d = 29 - i
        result.append({"date": _days_ago(d), "energy": val})
    return result


# ── Insights: Overview ───────────────────────────────────────────

def get_demo_overview() -> dict:
    """Dashboard overview data."""
    daily_trend = []
    for i in range(30):
        d = _days_ago(29 - i)
        # Weekday pattern: more cards on Mon-Fri, fewer on weekends
        day_of_week = (date.today() - timedelta(days=29 - i)).weekday()
        base = random.randint(5, 12) if day_of_week < 5 else random.randint(1, 5)
        daily_trend.append({"date": d, "count": base})

    return {
        "totalCards": 247,
        "thisWeek": 38,
        "lastWeek": 42,
        "dailyTrend": daily_trend,
        "byModule": {
            "arxiv-tracker": 85,
            "semantic-scholar-tracker": 52,
            "xiaohongshu-tracker": 38,
            "bilibili-tracker": 30,
            "zhihu-tracker": 24,
            "xiaoyuzhou-tracker": 12,
            "folder-monitor": 6,
        },
        "topTags": [
            ["Embodied AI", 32], ["具身智能", 28], ["Robot Manipulation", 22],
            ["读博", 18], ["Foundation Models", 16], ["Sim-to-Real", 14],
            ["数字游民", 12], ["Vibe Coding", 10], ["存在主义", 9],
            ["FIRE", 8],
        ],
        "readingStreak": 12,
    }


# ── Insights: Today ─────────────────────────────────────────────

def get_demo_today() -> dict:
    """Today snapshot for dashboard."""
    activities = get_demo_activities()

    # Count by type
    views = sum(1 for a in activities if a["type"] == "card_view")
    likes = sum(1 for a in activities if a["type"] == "card_like")
    saves = sum(1 for a in activities if a["type"] == "card_save")
    chats = sum(1 for a in activities if a["type"] in ("chat_start", "chat_message"))
    module_runs = sum(1 for a in activities if a["type"] == "module_run")

    # Hourly heatmap
    hourly = {h: 0 for h in range(24)}
    for a in activities:
        try:
            h = int(a["timestamp"].split("T")[1].split(":")[0])
            hourly[h] = hourly.get(h, 0) + 1
        except (ValueError, IndexError):
            pass

    todos = get_demo_todos()
    done = sum(1 for t in todos if t["done"])

    return {
        "date": _today(),
        "activityCounts": {
            "total": len(activities),
            "views": views,
            "likes": likes,
            "saves": saves,
            "dislikes": 0,
            "chats": chats,
            "module_runs": module_runs,
        },
        "hourlyHeatmap": [{"hour": h, "count": hourly.get(h, 0)} for h in range(24)],
        "todoProgress": {"total": len(todos), "done": done, "rate": round(done / len(todos), 2) if todos else 0},
        "wellness": {"energy": 68, "san": 6.3, "happiness": 7.2},
        "summary": None,
        "topInteractions": [
            {"id": "demo-arxiv-001", "title": "RT-2: Vision-Language-Action Models", "action": "star"},
            {"id": "demo-arxiv-002", "title": "Embodied Chain-of-Thought Reasoning", "action": "save"},
            {"id": "demo-zhihu-001", "title": "具身智能的未来5年", "action": "save"},
            {"id": "demo-bili-005", "title": "加缪《局外人》深度解读", "action": "save"},
            {"id": "demo-xhs-001", "title": "数字游民一年后的真实感受", "action": "like"},
        ],
    }


# ── Insights: Wellness ───────────────────────────────────────────

def get_demo_wellness() -> dict:
    san = get_demo_san_history()
    happiness = get_demo_happiness_history()
    energy = get_demo_energy_history()

    san_map = {e["date"]: e["score"] for e in san}
    hap_map = {e["date"]: e["score"] for e in happiness}
    eng_map = {e["date"]: e["energy"] for e in energy}

    daily = []
    for i in range(30):
        d = _days_ago(29 - i)
        daily.append({
            "date": d,
            "san": san_map.get(d),
            "happiness": hap_map.get(d),
            "energy": eng_map.get(d),
        })

    # This week avg (last 7 days)
    tw_san = [s["score"] for s in san[-7:]]
    tw_hap = [h["score"] for h in happiness[-7:]]
    tw_eng = [e["energy"] for e in energy[-7:]]

    lw_san = [s["score"] for s in san[-14:-7]]
    lw_hap = [h["score"] for h in happiness[-14:-7]]
    lw_eng = [e["energy"] for e in energy[-14:-7]]

    def _avg(lst: list) -> float:
        return round(sum(lst) / len(lst), 1) if lst else 0.0

    return {
        "daily": daily,
        "thisWeekAvg": {"san": _avg(tw_san), "happiness": _avg(tw_hap), "energy": _avg(tw_eng)},
        "lastWeekAvg": {"san": _avg(lw_san), "happiness": _avg(lw_hap), "energy": _avg(lw_eng)},
    }


# ── Insights: Engagement ────────────────────────────────────────

def get_demo_engagement() -> dict:
    daily_trend = []
    for i in range(30):
        d = _days_ago(29 - i)
        viewed = random.randint(6, 18)
        deep = random.randint(2, min(8, viewed))
        rate = round(deep / viewed, 3) if viewed else 0
        daily_trend.append({"date": d, "viewed": viewed, "deepRead": deep, "rate": rate})

    return {
        "overall": {
            "totalViewed": 247,
            "liked": 68,
            "saved": 45,
            "starred": 12,
            "disliked": 8,
            "skipped": 114,
        },
        "dailyTrend": daily_trend,
        "weekComparison": {
            "thisWeek": {"totalViewed": 38, "liked": 12, "saved": 8, "starred": 3, "disliked": 1, "skipped": 14},
            "lastWeek": {"totalViewed": 42, "liked": 14, "saved": 10, "starred": 2, "disliked": 2, "skipped": 14},
            "cardsDelta": -4,
            "engagementRateDelta": -0.012,
        },
    }


# ── Modules Dashboard ───────────────────────────────────────────

def get_demo_modules_dashboard() -> dict:
    """Module status for dashboard — all healthy and active."""
    now = datetime.utcnow()
    modules = [
        {
            "id": "arxiv-tracker", "name": "arXiv 论文追踪",
            "description": "追踪 arXiv 上符合关键词的最新论文",
            "icon": "book-open", "status": "active", "schedule": "0 8 * * *",
            "last_run": (now - timedelta(hours=3)).isoformat(),
            "next_run": (now + timedelta(hours=5)).isoformat(),
            "stats": {"total_cards": 85, "this_week": 10, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["embodied intelligence", "robot manipulation", "sim-to-real", "VLA"]},
            "subscriptions": [],
        },
        {
            "id": "semantic-scholar-tracker", "name": "Semantic Scholar 追踪",
            "description": "追踪 Semantic Scholar 上的最新研究",
            "icon": "graduation-cap", "status": "active", "schedule": "0 10 * * *",
            "last_run": (now - timedelta(hours=1)).isoformat(),
            "next_run": (now + timedelta(hours=7)).isoformat(),
            "stats": {"total_cards": 52, "this_week": 6, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["embodied AI", "foundation models robotics", "tactile manipulation"]},
            "subscriptions": [],
        },
        {
            "id": "xiaohongshu-tracker", "name": "小红书追踪",
            "description": "追踪小红书上的相关内容",
            "icon": "book-heart", "status": "active", "schedule": "0 10 * * *",
            "last_run": (now - timedelta(hours=1)).isoformat(),
            "next_run": (now + timedelta(hours=7)).isoformat(),
            "stats": {"total_cards": 38, "this_week": 8, "success_rate": 95.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["数字游民", "读博", "摄影", "吉他", "FIRE理财"]},
            "subscriptions": [],
        },
        {
            "id": "bilibili-tracker", "name": "哔哩哔哩追踪",
            "description": "追踪 B站 上的相关视频",
            "icon": "tv", "status": "active", "schedule": "0 11 * * *",
            "last_run": (now - timedelta(hours=2)).isoformat(),
            "next_run": (now + timedelta(hours=6)).isoformat(),
            "stats": {"total_cards": 30, "this_week": 8, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["具身智能", "Vibe Coding", "吉他教学", "科普", "存在主义"]},
            "subscriptions": [],
        },
        {
            "id": "xiaoyuzhou-tracker", "name": "小宇宙追踪",
            "description": "追踪小宇宙播客",
            "icon": "podcast", "status": "active", "schedule": "0 10 * * *",
            "last_run": (now - timedelta(hours=1)).isoformat(),
            "next_run": (now + timedelta(hours=7)).isoformat(),
            "stats": {"total_cards": 12, "this_week": 6, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["AI", "数字游民", "哲学", "科技"]},
            "subscriptions": [],
        },
        {
            "id": "zhihu-tracker", "name": "知乎追踪",
            "description": "追踪知乎上的相关内容",
            "icon": "help-circle", "status": "active", "schedule": "0 13 * * *",
            "last_run": (now - timedelta(hours=4)).isoformat(),
            "next_run": (now + timedelta(hours=4)).isoformat(),
            "stats": {"total_cards": 24, "this_week": 8, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": ["具身智能", "读博", "FIRE", "存在主义", "Vibe Coding"]},
            "subscriptions": [],
        },
        {
            "id": "folder-monitor", "name": "文件夹监控",
            "description": "监控指定文件夹的变化",
            "icon": "folder-open", "status": "active", "schedule": "*/5 * * * *",
            "last_run": (now - timedelta(minutes=3)).isoformat(),
            "next_run": (now + timedelta(minutes=2)).isoformat(),
            "stats": {"total_cards": 6, "this_week": 4, "success_rate": 100.0, "last_error": None, "error_count": 0},
            "config": {"keywords": []},
            "subscriptions": [],
        },
    ]

    return {
        "modules": modules,
        "summary": {
            "total": 7,
            "active": 7,
            "paused": 0,
            "error": 0,
            "unconfigured": 0,
            "total_cards_this_week": 50,
        },
        "alerts": [],
    }


# ── Unread Counts ────────────────────────────────────────────────

DEMO_UNREAD_COUNTS = {
    "arxiv-tracker": 4,
    "semantic-scholar-tracker": 2,
    "xiaohongshu-tracker": 3,
    "bilibili-tracker": 3,
    "zhihu-tracker": 2,
    "xiaoyuzhou-tracker": 1,
    "folder-monitor": 1,
}


# ── Game Stats ───────────────────────────────────────────────────

DEMO_GAME_STATS = {
    "happiness": 72,
    "san_7d_avg": 63,
    "energy": 68,
    "todos_completed": 4,
    "achievements": DEMO_ACHIEVEMENTS,
}


# ── Full Profile Response ────────────────────────────────────────

def get_demo_profile() -> dict:
    """Complete profile API response."""
    return {
        "identity": DEMO_IDENTITY,
        "daily_motto": DEMO_MOTTO,
        "stats": DEMO_STATS,
        "skills": DEMO_SKILLS,
        "achievements": DEMO_ACHIEVEMENTS,
        "energy": 68,
        "todos": get_demo_todos(),
    }


# ── Preferences Evolution ───────────────────────────────────────

def get_demo_preferences_evolution() -> dict:
    keywords = []
    for kw, data in sorted(DEMO_KEYWORD_PREFS.items(), key=lambda x: (-x[1]["score"], -x[1]["count"])):
        keywords.append({
            "keyword": kw,
            "score": data["score"],
            "count": data["count"],
        })
    return {"keywords": keywords}


# ── Wiki Demo Data ───────────────────────────────────────────────

DEMO_WIKI_PAGES_INTEL = [
    {
        "slug": "embodied-intelligence",
        "title": "具身智能 (Embodied Intelligence)",
        "category": "核心概念",
        "tags": ["具身智能", "机器人", "AI"],
        "content": (
            "# 具身智能 (Embodied Intelligence)\n\n"
            "具身智能是指将人工智能与物理实体（机器人）相结合，使其能够在真实物理环境中感知、推理和行动的研究方向。\n\n"
            "## 核心理念\n\n"
            "- **感知-思考-行动** 循环：与环境的持续交互是智能的基础\n"
            "- **具身认知**：身体不仅是执行器，更是认知的载体（Embodied Cognition）\n"
            "- **从模拟到现实**（Sim-to-Real）：在仿真中学习，迁移到真实世界\n\n"
            "## 关键技术路线\n\n"
            "1. **VLA 模型**（Vision-Language-Action）：如 [[rt-2]] 和 [[open-x-embodiment]]\n"
            "2. **扩散策略**（[[diffusion-policy]]）：将生成模型用于动作生成\n"
            "3. **世界模型**：学习物理世界的内在模型用于规划\n"
            "4. **触觉感知**：通过触觉传感器增强操控能力\n\n"
            "## 当前挑战\n\n"
            "- 数据获取成本高（真实机器人数据稀缺）\n"
            "- Sim-to-Real gap 仍然显著\n"
            "- 长时间任务的规划和推理能力不足\n"
            "- 安全性和鲁棒性\n\n"
            "## 相关笔记\n\n"
            "- [[rt-2]] | [[diffusion-policy]] | [[open-x-embodiment]] | [[sim-to-real]]\n"
            "- [[voxposer]] | [[tactile-sensing]]\n"
        ),
        "sources": ["arxiv-tracker", "semantic-scholar-tracker"],
        "updated_at": _days_ago(1),
    },
    {
        "slug": "rt-2",
        "title": "RT-2: Vision-Language-Action Models",
        "category": "论文笔记",
        "tags": ["RT-2", "VLA", "Google DeepMind"],
        "content": (
            "# RT-2: Vision-Language-Action Models\n\n"
            "**来源**: Google DeepMind, 2023\n\n"
            "## 核心贡献\n\n"
            "将视觉-语言模型（VLM）扩展为视觉-语言-动作模型（VLA），直接输出机器人动作 token。\n\n"
            "## 关键发现\n\n"
            "1. 互联网规模的视觉-语言预训练知识可以迁移到机器人控制\n"
            "2. 涌现能力：RT-2 可以理解从未在机器人数据中出现的概念\n"
            "3. 在 Google 机器人上验证了复杂指令跟随能力\n\n"
            "## 与 [[embodied-intelligence]] 的关系\n\n"
            "RT-2 证明了 foundation model 路线在具身智能中的可行性，是 VLA 范式的里程碑。\n\n"
            "## 个人思考\n\n"
            "这篇论文让我确信，具身智能的突破不在于更好的控制算法，而在于更好的 **表示学习**。"
            "就像 NLP 领域从规则到统计到神经网络的范式转移，机器人学也在经历类似的转变。\n"
        ),
        "sources": ["https://arxiv.org/abs/2307.15818"],
        "updated_at": _days_ago(2),
    },
    {
        "slug": "diffusion-policy",
        "title": "Diffusion Policy: 扩散模型驱动的机器人策略",
        "category": "论文笔记",
        "tags": ["Diffusion Policy", "动作生成", "接触密集"],
        "content": (
            "# Diffusion Policy\n\n"
            "**来源**: Columbia / MIT, 2023\n\n"
            "## 核心思想\n\n"
            "将扩散去噪过程用于机器人动作序列的生成——把「生成图像」变成「生成动作」。\n\n"
            "## 优势\n\n"
            "- 天然支持多模态动作分布（一个任务可能有多种完成方式）\n"
            "- 在接触密集任务（如叠衣服、倒水）上表现突出\n"
            "- 生成的动作轨迹更平滑、更自然\n\n"
            "## 与 [[rt-2]] 的对比\n\n"
            "| 维度 | RT-2 | Diffusion Policy |\n"
            "|------|------|-------------------|\n"
            "| 动作表示 | 离散 token | 连续轨迹 |\n"
            "| 预训练 | VLM | 无需语言预训练 |\n"
            "| 多模态支持 | 弱 | 强 |\n"
            "| 泛化能力 | 跨任务 | 同任务内 |\n\n"
            "## 我的看法\n\n"
            "Diffusion Policy 更适合 fine-grained manipulation，而 RT-2 更适合 high-level reasoning。"
            "未来的方向可能是两者的结合：用 VLA 做高层规划，用 Diffusion 做底层执行。\n"
        ),
        "sources": ["https://arxiv.org/abs/2303.04137"],
        "updated_at": _days_ago(3),
    },
    {
        "slug": "sim-to-real",
        "title": "Sim-to-Real Transfer",
        "category": "核心概念",
        "tags": ["Sim-to-Real", "Domain Adaptation", "仿真"],
        "content": (
            "# Sim-to-Real Transfer\n\n"
            "## 为什么重要\n\n"
            "真实机器人数据获取成本极高，仿真环境中可以大规模生成训练数据。"
            "但仿真和现实之间存在 **Domain Gap**（外观差异、物理差异、传感器噪声等）。\n\n"
            "## 主流方法\n\n"
            "1. **Domain Randomization**: 在仿真中随机化纹理、物理参数等\n"
            "2. **System Identification**: 精确建模真实环境的物理参数\n"
            "3. **视觉基础模型**: 用 CLIP/DINOv2 等提取域无关特征\n"
            "4. **Real-to-Sim-to-Real**: 先用真实数据校准仿真，再迁移回去\n\n"
            "## 与 [[embodied-intelligence]] 的关系\n\n"
            "Sim-to-Real 是具身智能实现规模化学习的核心瓶颈之一。\n"
            "[[open-x-embodiment]] 试图通过大规模真实数据来绕过这个问题。\n"
        ),
        "sources": ["semantic-scholar-tracker"],
        "updated_at": _days_ago(5),
    },
    {
        "slug": "open-x-embodiment",
        "title": "Open X-Embodiment: 跨机器人数据集",
        "category": "论文笔记",
        "tags": ["Open X-Embodiment", "RT-X", "大规模数据"],
        "content": (
            "# Open X-Embodiment\n\n"
            "**来源**: Google DeepMind + 33 个实验室联合, 2023\n\n"
            "## 关键点\n\n"
            "- 汇集了来自 22 种机器人平台的 100 万+ 轨迹\n"
            "- 训练出 RT-1-X 和 RT-2-X 模型\n"
            "- 证明「更多数据 + 更多机器人 = 更好的泛化」\n\n"
            "## 启发\n\n"
            "就像 ImageNet 对计算机视觉的意义，Open X-Embodiment 可能成为机器人学的「ImageNet 时刻」。"
            "数据的规模和多样性比算法创新更重要。\n\n"
            "## 相关\n\n"
            "- [[rt-2]] (RT-2-X 是基于 RT-2 在该数据集上训练的)\n"
            "- [[embodied-intelligence]]\n"
        ),
        "sources": ["https://arxiv.org/abs/2310.08864"],
        "updated_at": _days_ago(4),
    },
    {
        "slug": "vibe-coding",
        "title": "Vibe Coding：自然语言编程",
        "category": "技术趋势",
        "tags": ["Vibe Coding", "AI编程", "Claude"],
        "content": (
            "# Vibe Coding\n\n"
            "用自然语言描述意图，让 AI 生成代码。不再一行行写代码，而是用对话式交互构建软件。\n\n"
            "## 工具链\n\n"
            "- **Claude Code**: 终端里的全栈 AI 工程师\n"
            "- **Cursor**: AI-first 编辑器\n"
            "- **Bolt/v0**: 从描述到部署的全流程\n\n"
            "## 我的体验\n\n"
            "ABO 这个项目本身就是 Vibe Coding 的产物。从想法到可运行的原型，Claude Code 帮我省去了大量样板代码。"
            "但核心架构和数据流设计仍然需要人来把控。\n\n"
            "## 对研究者的意义\n\n"
            "作为一个做[[embodied-intelligence]]的博士生，编程是工具而非目的。"
            "Vibe Coding 让我可以把更多时间花在 **思考问题** 而不是 **实现细节** 上。"
            "这和 [[digital-nomad]] 理念一脉相承：用技术杠杆放大个人生产力。\n"
        ),
        "sources": ["bilibili-tracker", "zhihu-tracker"],
        "updated_at": _days_ago(2),
    },
    {
        "slug": "digital-nomad",
        "title": "数字游民与远程科研",
        "category": "生活方式",
        "tags": ["数字游民", "远程工作", "FIRE"],
        "content": (
            "# 数字游民与远程科研\n\n"
            "## 为什么想当数字游民\n\n"
            "- 科研本质上是知识工作，不依赖物理位置\n"
            "- 想在不同城市生活，体验不同文化（特别是日本）\n"
            "- FIRE 运动的终极目标：[[fire-movement|用被动收入支撑自由生活]]\n\n"
            "## 可行性分析\n\n"
            "### 适合远程的研究方向\n"
            "- 理论研究、算法设计（纯计算）\n"
            "- 仿真实验（云端 GPU）\n"
            "- 文献综述和写作\n\n"
            "### 不适合远程的\n"
            "- 需要物理机器人的实验 ← 这是我做[[embodied-intelligence]]的痛点\n"
            "- 需要频繁面对面讨论的早期探索阶段\n\n"
            "## 当前计划\n\n"
            "1. 毕业前积累远程合作经验\n"
            "2. 建立副业收入流（科普内容 + [[vibe-coding|技术咨询]]）\n"
            "3. 博后阶段尝试 3-6 个月的远程试运行\n"
        ),
        "sources": ["xiaohongshu-tracker", "zhihu-tracker", "xiaoyuzhou-tracker"],
        "updated_at": _days_ago(3),
    },
    {
        "slug": "existentialism",
        "title": "存在主义与科研生活",
        "category": "思考",
        "tags": ["存在主义", "加缪", "意义"],
        "content": (
            "# 存在主义与科研生活\n\n"
            "## 荒诞与意义\n\n"
            "加缪说：「人必须想象西西弗斯是幸福的。」\n\n"
            "读博就是一种西西弗斯式的存在——论文被拒、实验失败、进度缓慢。"
            "但这种反复中蕴含着某种纯粹的东西：对理解世界的执著。\n\n"
            "## 萨特：存在先于本质\n\n"
            "我们不是先有一个「本质」然后去实现它，而是在行动中创造自己的本质。"
            "选择做[[embodied-intelligence]]的研究、学[[日语]]、弹吉他——每个选择都在定义我是谁。\n\n"
            "## 对数字游民的启示\n\n"
            "[[digital-nomad|数字游民]] 不是逃避，而是一种存在主义式的选择——"
            "通过改变生活的「形式」来寻找生活的「内容」。\n\n"
            "## 摘录\n\n"
            "> 「在隆冬，我终于知道，我身上有一个不可战胜的夏天。」 —— 加缪\n\n"
            "> 「人是被判定为自由的。」 —— 萨特\n"
        ),
        "sources": ["zhihu-tracker", "bilibili-tracker"],
        "updated_at": _days_ago(6),
    },
    {
        "slug": "voxposer",
        "title": "VoxPoser: 3D 价值图操控",
        "category": "论文笔记",
        "tags": ["VoxPoser", "3D", "Zero-shot"],
        "content": (
            "# VoxPoser\n\n"
            "## 核心方法\n\n"
            "利用 LLM 生成代码 → 调用视觉基础模型 → 在 3D 空间中合成价值图和约束图 → 引导机器人动作。\n\n"
            "## 创新点\n\n"
            "- 零样本操控：无需机器人演示数据\n"
            "- 可组合性：不同子任务的价值图可以叠加\n"
            "- LLM 的代码生成能力被巧妙利用\n\n"
            "## 局限\n\n"
            "- 依赖准确的 3D 感知\n"
            "- 复杂任务的价值图合成可能失败\n"
            "- 推理速度较慢\n\n"
            "## 相关\n\n"
            "- [[embodied-intelligence]] | [[rt-2]] | [[sim-to-real]]\n"
        ),
        "sources": ["https://arxiv.org/abs/2307.05973"],
        "updated_at": _days_ago(7),
    },
    {
        "slug": "tactile-sensing",
        "title": "触觉感知在灵巧操作中的应用",
        "category": "技术综述",
        "tags": ["触觉", "灵巧操作", "传感器"],
        "content": (
            "# 触觉感知\n\n"
            "## 为什么视觉不够\n\n"
            "- 遮挡问题：手指抓住物体后视觉信息大幅减少\n"
            "- 接触力感知：视觉无法直接感知力和滑动\n"
            "- 精细操控：如螺丝拧紧、布料折叠\n\n"
            "## 主流触觉传感器\n\n"
            "| 传感器 | 原理 | 分辨率 |\n"
            "|--------|------|--------|\n"
            "| GelSight | 弹性体 + 相机 | 高 |\n"
            "| DIGIT | 紧凑型 GelSight | 中高 |\n"
            "| BioTac | 液压 + 电极 | 中 |\n\n"
            "## 与我的研究的关系\n\n"
            "如果 [[embodied-intelligence]] 要实现真正的灵巧操作，触觉是不可或缺的。"
            "目前的 VLA 模型（如 [[rt-2]]）主要依赖视觉，触觉融合是下一个前沿。\n"
        ),
        "sources": ["semantic-scholar-tracker"],
        "updated_at": _days_ago(8),
    },
]

DEMO_WIKI_PAGES_LIT = [
    {
        "slug": "the-outsider",
        "title": "局外人 — 加缪",
        "category": "文学",
        "tags": ["加缪", "存在主义", "法国文学"],
        "content": (
            "# 局外人 (L'Étranger)\n\n"
            "**作者**: 阿尔贝·加缪 | **年份**: 1942\n\n"
            "## 读书笔记\n\n"
            "莫尔索的「冷漠」不是无情，而是一种对虚伪社会仪式的拒绝。"
            "他被判死刑不是因为杀了人，而是因为「在母亲的葬礼上没有哭」。\n\n"
            "## 与 [[existentialism]] 的关系\n\n"
            "这部小说是加缪荒诞哲学的文学化表达。"
            "莫尔索活在当下、拒绝虚伪、接受荒诞——这正是加缪所倡导的生活态度。\n\n"
            "## 个人共鸣\n\n"
            "作为一个经常思考「读博有什么意义」的人，莫尔索的态度给了我另一种视角："
            "意义不需要被寻找，活着本身就是意义。\n"
        ),
        "sources": [],
        "updated_at": _days_ago(4),
    },
    {
        "slug": "norwegian-wood",
        "title": "挪威的森林 — 村上春树",
        "category": "文学",
        "tags": ["村上春树", "日本文学", "青春"],
        "content": (
            "# 挪威的森林\n\n"
            "**作者**: 村上春树 | **年份**: 1987\n\n"
            "## 阅读感想\n\n"
            "在学日语的过程中重读了原版。村上的文字有一种独特的节奏感——"
            "简洁、克制，但在不经意处击中你。\n\n"
            "## 音乐意象\n\n"
            "Beatles 的 Norwegian Wood 贯穿全书。"
            "作为一个弹吉他的人，我特别能感受到音乐在村上世界里的分量。\n\n"
            "## 相关播客\n\n"
            "听了「文化有限」播客关于村上春树的一期，主播提到一个有趣的观点：\n"
            "村上的跑步哲学和写作哲学是一回事——都是通过重复性的身体行为来对抗虚无。\n"
        ),
        "sources": ["xiaoyuzhou-tracker"],
        "updated_at": _days_ago(5),
    },
    {
        "slug": "myth-of-sisyphus",
        "title": "西西弗斯神话 — 加缪",
        "category": "哲学",
        "tags": ["加缪", "荒诞", "哲学"],
        "content": (
            "# 西西弗斯神话\n\n"
            "**作者**: 阿尔贝·加缪 | **年份**: 1942\n\n"
            "## 核心论点\n\n"
            "「真正严肃的哲学问题只有一个：自杀。」\n\n"
            "加缪不是在鼓励自杀，而是在追问：在一个无意义的世界里，我们为什么要继续活着？\n\n"
            "## 答案\n\n"
            "荒诞的反抗。明知巨石会滚落，仍然选择推上去。\n"
            "这不是乐观主义，而是一种倔强的尊严。\n\n"
            "## 与读博的类比\n\n"
            "见 [[existentialism]]。论文被拒就是巨石滚落，然后你再推一次。\n"
        ),
        "sources": [],
        "updated_at": _days_ago(8),
    },
]


def get_demo_wiki_pages(wiki_type: str) -> list[dict]:
    if wiki_type == "intel":
        return DEMO_WIKI_PAGES_INTEL
    return DEMO_WIKI_PAGES_LIT


def get_demo_wiki_graph(wiki_type: str) -> dict:
    pages = get_demo_wiki_pages(wiki_type)
    nodes = [{"id": p["slug"], "label": p["title"], "category": p["category"], "tags": p["tags"]} for p in pages]

    # Build edges from [[wikilinks]]
    import re
    edges = []
    for p in pages:
        content = p["content"]
        links = re.findall(r'\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]', content)
        for link in links:
            slug = link.strip().lower().replace(" ", "-")
            # Only add edge if target exists
            if any(n["id"] == slug for n in nodes):
                edges.append({"source": p["slug"], "target": slug})

    return {"nodes": nodes, "edges": edges}


def get_demo_wiki_stats(wiki_type: str) -> dict:
    pages = get_demo_wiki_pages(wiki_type)
    categories: dict[str, int] = {}
    tags: dict[str, int] = {}
    for p in pages:
        cat = p["category"]
        categories[cat] = categories.get(cat, 0) + 1
        for t in p["tags"]:
            tags[t] = tags.get(t, 0) + 1

    return {
        "wiki_type": wiki_type,
        "total_pages": len(pages),
        "categories": categories,
        "top_tags": sorted(tags.items(), key=lambda x: -x[1])[:10],
        "recent_updates": [{"slug": p["slug"], "title": p["title"], "updated_at": p["updated_at"]} for p in pages[:5]],
    }
