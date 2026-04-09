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
# Categories: intel → entity / concept;  lit → paper / topic
# Fields must match frontend: slug, title, category, tags, content,
#   sources, wiki_type, backlinks, created, updated

DEMO_WIKI_PAGES_INTEL = [
    # ━━━━━━━━ ENTITY (公司 · 产品 · 人物 · 平台) ━━━━━━━━
    {
        "slug": "google-deepmind-robotics",
        "title": "Google DeepMind Robotics",
        "category": "entity",
        "tags": ["DeepMind", "Google", "RT-2", "机器人"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence", "vla-models", "foundation-models-robotics"],
        "created": _days_ago(45),
        "updated": _days_ago(2),
        "sources": ["arxiv-tracker", "url:https://deepmind.google/robotics/"],
        "content": """# Google DeepMind Robotics

Google DeepMind 的机器人研究部门是当前具身智能领域最具影响力的研究机构之一，推动了从 [[vla-models]] 到大规模数据集的多项突破。

## 核心贡献

### RT 系列模型
- **RT-1** (2022): 第一个大规模 Robotics Transformer，在 13 个机器人、超过 13 万条轨迹上训练
- **RT-2** (2023): 将视觉-语言模型扩展为 [[vla-models]]，首次证明网络知识可迁移到机器人控制
- **RT-2-X**: 在 [[open-x-embodiment]] 数据集上训练，泛化能力提升 50%

### SayCan 与语言接地
[[saycan]] 将 LLM 的语义知识与机器人的物理可行性结合，是 [[language-conditioned-manipulation]] 的里程碑。

### ALOHA 系列
与 Stanford 合作推出 [[mobile-aloha]]，并发展出 ALOHA Unleashed，实现复杂双臂操作任务的学习。

## 关键人物

- **Karol Hausman**: 前 DeepMind 研究员，后创办 [[physical-intelligence]]
- **Sergey Levine**: UC Berkeley 教授，与 DeepMind 紧密合作
- **Pete Florence, Andy Zeng**: VLA 和语言接地的核心研究者

## 个人思考

DeepMind Robotics 的路线很清晰：**用互联网规模的数据解决机器人智能**。RT-2 证明了这条路可行，Open X-Embodiment 解决了数据问题。但他们的研究主要在 Google 内部的机器人上验证，开源程度不如 [[physical-intelligence]]。

读博的时候最常追的就是这个组的论文，每篇都是 benchmark。
"""
    },
    {
        "slug": "physical-intelligence",
        "title": "Physical Intelligence (π)",
        "category": "entity",
        "tags": ["PI", "pi0", "创业公司", "基础模型"],
        "wiki_type": "intel",
        "backlinks": ["foundation-models-robotics", "vla-models"],
        "created": _days_ago(30),
        "updated": _days_ago(1),
        "sources": ["url:https://www.pi.website/", "arxiv-tracker"],
        "content": """# Physical Intelligence (π)

Physical Intelligence 是 2024 年成立的明星机器人 AI 创业公司，致力于构建通用机器人基础模型。

## 公司概况

- **成立**: 2024 年初，总部旧金山
- **创始人**: Karol Hausman (CEO, 前 [[google-deepmind-robotics]]) 和 Sergey Levine (首席科学家, UC Berkeley 教授)
- **融资**: 种子轮 $70M → A 轮 $400M (估值 $2.4B) → B 轮 $600M (估值 $5.6B)，总融资超 $11 亿
- **投资方**: Bezos, NVIDIA, Sequoia, OpenAI Startup Fund

## 核心产品：π0 模型

π0 (2024.10, arXiv:2410.24164) 是一个 30 亿参数的 VLA flow model，基于 PaliGemma 构建：

- 在 **10,000+ 小时**真实机器人数据上训练
- 覆盖 **7 种机器人形态**、**68 个任务**
- 能力包括：叠衣服、组装盒子、收拾桌面等复杂操作
- 2025 年 2 月通过 **openpi** 仓库完全开源

### π0.5 (2025.09)

改进版本，通过异构数据源协同训练实现更好的开放世界泛化。

## 为什么重要

PI 是目前最接近「机器人 GPT」的公司。它的路线是：**大规模真实数据 + 通用基础模型 + 开源生态**。与 [[google-deepmind-robotics]] 不同，PI 更激进地推进开源和多机器人泛化。

## 个人笔记

Karol 和 Sergey 从 Google 出来创业这件事本身就是一个信号——他们觉得在大公司里做不够快。PI 的融资速度和估值增长完全是 AI 创业公司的范式。

如果我毕业后不走学术路线，PI 是 dream company 之一。他们的 openpi 仓库是学 VLA 的最好起点。
"""
    },
    {
        "slug": "figure-ai",
        "title": "Figure AI",
        "category": "entity",
        "tags": ["Figure", "人形机器人", "创业公司"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence"],
        "created": _days_ago(40),
        "updated": _days_ago(5),
        "sources": ["url:https://www.figure.ai/"],
        "content": """# Figure AI

Figure AI 是通用人形机器人领域融资最多的创业公司之一，已实现工厂级实际部署。

## 产品线

### Figure 01
初始原型，用于技术验证。

### Figure 02 (2024.08)
- 35 自由度，16-DOF 五指灵巧手
- 负载 25kg，续航数小时
- **实际部署**: 在 BMW Spartanburg 工厂运行 11 个月、每天 10 小时，处理 90,000+ 个零件

### Figure 03 (2025.10)
为量产和家庭环境重新设计。

## 与 OpenAI 的分合

2024 年与 OpenAI 合作开发 AI 模型，但 2025 年 2 月宣布放弃 OpenAI 转向自研模型 "Helix"，声称取得"重大突破"。这个决定很有意思——说明通用大模型在机器人控制上可能不如领域特化模型。

## 融资与估值

- B 轮 $675M (估值 $2.6B, 2024)
- C 轮 >$1B (估值 $39B, 2025.09)
- 总融资约 $19 亿，2026 年考虑 IPO

## 个人看法

Figure 最厉害的地方不是技术最先进，而是**真正在工厂里跑起来了**。BMW 的 11 个月部署是整个人形机器人行业第一个有意义的商业验证。

不过 $39B 的估值... 泡沫味道有点重。
"""
    },
    {
        "slug": "unitree",
        "title": "宇树科技 (Unitree Robotics)",
        "category": "entity",
        "tags": ["宇树", "G1", "H1", "国产机器人", "开源"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence", "dexterous-manipulation"],
        "created": _days_ago(35),
        "updated": _days_ago(3),
        "sources": ["url:https://www.unitree.com/", "bilibili-tracker"],
        "content": """# 宇树科技 (Unitree Robotics)

杭州宇树科技是国内最重要的机器人硬件公司之一，以「低价高性能」策略推动机器人研究的民主化。

## 产品矩阵

### G1 (紧凑人形)
- 身高 127cm，体重 35kg，23 自由度 (EDU 版 43 DOF)
- 3D LiDAR + 深度相机
- **起售价 $13,500**，EDU 版最高 $73,900
- 2025 年已有 30+ 篇论文使用 G1 作为实验平台

### H1 (全尺寸人形)
- 180cm / 47kg / ~$90,000
- 适合工业场景

### H2 & R1
- H2: $29,900，性价比路线
- R1: 即将发布的新一代

## 开源生态

2026 年 3 月开源了 **UnifoLM-VLA-0**，一个 VLA 模型，可以让 G1 通过自然语言指令执行家务任务。SDK、代码全部在 GitHub 开源，有活跃的 Discord 开发者社区。

## 商业化进展

- 2025 年出货 5,500 台人形机器人
- 2026 年目标 20,000 台
- 2026 年 3 月在上交所递交 IPO 申请

## 个人思考

宇树的 G1 可能是当前性价比最高的人形机器人研究平台。$13,500 的起售价让博士生也买得起（虽然还是很贵）。如果实验室要买人形机器人，G1 是第一选择。

在 B 站看到不少国内实验室用 G1 做的 demo，质量越来越高了。
"""
    },
    {
        "slug": "nvidia-isaac",
        "title": "NVIDIA Isaac & GR00T",
        "category": "entity",
        "tags": ["NVIDIA", "Isaac", "GR00T", "仿真", "基础模型"],
        "wiki_type": "intel",
        "backlinks": ["sim-to-real", "world-models", "foundation-models-robotics"],
        "created": _days_ago(25),
        "updated": _days_ago(4),
        "sources": ["url:https://developer.nvidia.com/isaac"],
        "content": """# NVIDIA Isaac & GR00T

NVIDIA 在机器人领域的布局横跨仿真平台和基础模型两个维度。

## Isaac 仿真平台

Isaac Lab 是基于 Omniverse 的 GPU 加速机器人仿真环境，可以并行运行数千个机器人学习实例。对于 [[sim-to-real]] 研究来说，这是最强大的仿真工具之一。

2025 年 NVIDIA 还联合 Google DeepMind 和 Disney Research 推出了 **Newton** 开源物理引擎，专门为机器人开发设计。

## Project GR00T

### GR00T N1 (2025.03)
世界首个开源、可定制的人形机器人基础模型：
- **双系统架构**: 模仿人类认知
  - System 1: 快速反射性动作模型（直觉）
  - System 2: 慢速审慎规划视觉-语言模型（思考）
- 完全开源，GitHub 可用

### GR00T N1.6 (2026)
集成多模态 VLA 策略与 NVIDIA Cosmos Reason [[world-models]]，实现端到端运动操作和推理。Sim-to-real 流程使用 Isaac Lab 全身 RL + COMPASS 合成数据驱动导航。

## 个人笔记

NVIDIA 的策略是做「卖铲子的人」——不做机器人本体，但提供整个 AI 堆栈：仿真 (Isaac) + 基础模型 (GR00T) + 硬件 (GPU)。这个生态位非常聪明。

GR00T N1 的双系统架构设计很有意思，和 Kahneman 的快慢思考理论一脉相承。
"""
    },
    {
        "slug": "mobile-aloha",
        "title": "Mobile ALOHA",
        "category": "entity",
        "tags": ["Stanford", "低成本", "双臂", "开源", "远程操控"],
        "wiki_type": "intel",
        "backlinks": ["google-deepmind-robotics", "imitation-learning"],
        "created": _days_ago(50),
        "updated": _days_ago(8),
        "sources": ["url:https://mobile-aloha.github.io/", "arxiv-tracker"],
        "content": """# Mobile ALOHA

低成本双臂移动操控系统，由 Stanford 开发，证明了「便宜的机器人也能做复杂事」。

## 基本信息

- **开发者**: Stanford 大学，Zipeng Fu、Tony Z. Zhao (Chelsea Finn 指导)
- **论文**: arXiv:2401.02117, 2024.01, CoRL 2024
- **成本**: 整套系统 < $32,000

## 核心设计

在原始 ALOHA 系统（低成本开源双臂）基础上增加移动底盘和全身远程操控接口。关键创新是用极少量示教（每个任务约 50 条轨迹）就能学会复杂任务。

## 关键成果

- **炒虾、清洁溢洒、按电梯、推椅子** 等任务成功率高达 90%
- 硬件、软件、3D 打印教程全部开源
- Google DeepMind 在此基础上开发了 ALOHA Unleashed

## 意义

Mobile ALOHA 是具身智能领域的「Stable Diffusion 时刻」——它证明了不需要百万美元的设备，也能做出有意义的机器人研究。这对资源有限的实验室（比如我们）意义重大。

## 个人想法

如果我要搭建实验平台，Mobile ALOHA 的开源方案是最现实的起点。$32,000 虽然不便宜，但比 [[unitree]] G1 还便宜。而且它的数据收集效率极高——50 条示教就够了。
"""
    },
    {
        "slug": "tesla-optimus",
        "title": "Tesla Optimus",
        "category": "entity",
        "tags": ["Tesla", "Optimus", "人形机器人", "制造业"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence"],
        "created": _days_ago(42),
        "updated": _days_ago(6),
        "sources": ["zhihu-tracker"],
        "content": """# Tesla Optimus

Tesla 的人形机器人项目，目前最有争议的具身智能产品。

## 迭代历程

### Gen 2 (2023.12)
- 减重 10kg，步速提升 30%
- 手部 11 DOF → 后期升级到 22 DOF
- 2024 年中开始在 Fremont 和 Austin 工厂内部部署

### Gen 3 (2026.02 开始生产)
- 手部 50 个执行器（每只手 25 个），是 Gen 2 的 4.5 倍
- 22 DOF + 3 DOF 腕部/前臂

## 现实 vs 宣传

**Musk 的声明**: 2025 年生产 1000+ 台，2026 年外部销售，长期目标单价 < $20,000

**实际情况** (Q4 2025 财报): 承认目前没有机器人在做「有用的工作」，都在用于学习和数据收集。

**已验证能力**: 行走避障、电池分拣、抓取易碎物品（鸡蛋）、实验室环境下叠衣服

## 个人看法

Tesla 的优势在于：(1) 制造业能力，(2) 海量工厂数据。但 Musk 的时间表一如既往地过于乐观。实际部署进度远落后于 [[figure-ai]]。

知乎上关于 Optimus 的讨论两极分化严重。我觉得真相在中间——技术路线没问题，但距离实用还有相当距离。
"""
    },

    # ━━━━━━━━ CONCEPT (趋势 · 技术 · 事件) ━━━━━━━━
    {
        "slug": "embodied-intelligence",
        "title": "具身智能 (Embodied Intelligence)",
        "category": "concept",
        "tags": ["具身智能", "机器人", "AI", "核心概念"],
        "wiki_type": "intel",
        "backlinks": [],
        "created": _days_ago(60),
        "updated": _days_ago(1),
        "sources": ["arxiv-tracker", "semantic-scholar-tracker"],
        "content": """# 具身智能 (Embodied Intelligence)

具身智能是指将人工智能与物理实体（机器人）相结合，使其能够在真实物理环境中感知、推理和行动的研究方向。这是我的博士研究核心领域。

## 核心理念

- **感知-思考-行动**循环：与环境的持续交互是智能的基础
- **具身认知** (Embodied Cognition)：身体不仅是执行器，更是认知的载体
- **从模拟到现实** ([[sim-to-real]])：在仿真中学习，迁移到真实世界

## 技术路线图 (2024-2026)

### 1. 基础模型路线
- [[vla-models]] (Vision-Language-Action): RT-2、OpenVLA、π0
- 核心思路：用互联网规模数据预训练，迁移到机器人控制
- 代表：[[google-deepmind-robotics]]、[[physical-intelligence]]

### 2. 扩散策略路线
- [[diffusion-policy]]: 用生成模型处理多模态动作分布
- 更适合接触密集任务（fine-grained manipulation）
- 代表：Columbia/MIT

### 3. 世界模型路线
- [[world-models]]: 在想象中规划，减少真实交互需求
- DreamerV3、UniSim、NVIDIA Cosmos
- 代表：[[nvidia-isaac]]

### 4. 语言接地路线
- [[language-conditioned-manipulation]]: 用自然语言指定机器人任务
- SayCan → Code as Policies → VoxPoser → 端到端 VLA
- 正在被统一到基础模型范式中

## 当前挑战

1. **数据稀缺**: 真实机器人数据获取成本极高
2. **Sim-to-Real Gap**: 仿真和现实之间的差距仍然显著
3. **长时域推理**: 长序列任务的规划和推理能力不足
4. **安全性**: VLM 的幻觉问题在物理世界中代价更高
5. **泛化**: 跨场景、跨物体、跨机器人形态的泛化

## 行业格局

| 玩家 | 路线 | 特点 |
|------|------|------|
| [[google-deepmind-robotics]] | VLA + 数据 | 研究最前沿，部分开源 |
| [[physical-intelligence]] | 通用基础模型 | 完全开源，融资最多 |
| [[figure-ai]] | 人形 + 工厂部署 | 唯一有商业部署的 |
| [[unitree]] | 低成本硬件 + 开源 | 最便宜的研究平台 |
| [[nvidia-isaac]] | 仿真 + 基础模型 | 「卖铲子」策略 |
| [[tesla-optimus]] | 制造 + 数据飞轮 | 最有争议 |

## 个人研究定位

我的博士研究聚焦在 **VLA 模型 + Sim-to-Real** 的交叉点：如何让在仿真中训练的视觉-语言-动作模型在真实机器人上可靠运行。具体来说：

1. 改进 domain randomization 策略
2. 利用 [[world-models]] 做数据增强
3. 在 [[unitree]] G1 上验证

> 让机器人理解物理世界，像人一样感知、思考、行动——这就是我读博的原因。
"""
    },
    {
        "slug": "vla-models",
        "title": "Vision-Language-Action 模型",
        "category": "concept",
        "tags": ["VLA", "RT-2", "OpenVLA", "pi0", "基础模型"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence", "google-deepmind-robotics", "physical-intelligence"],
        "created": _days_ago(40),
        "updated": _days_ago(2),
        "sources": ["arxiv-tracker"],
        "content": """# Vision-Language-Action 模型 (VLA)

VLA 是当前具身智能最重要的范式之一：将视觉-语言预训练模型扩展为能直接输出机器人动作的端到端模型。

## 核心思想

把机器人动作编码为 token（和文字 token 一样），让一个统一的 Transformer 同时处理「看」「说」「做」。

```
输入: 图像 + 语言指令 ("pick up the red cup")
↓ Vision-Language-Action Transformer
输出: 动作 token → 解码为关节角度/末端执行器位姿
```

## 关键模型时间线

| 模型 | 团队 | 日期 | 参数量 | 核心贡献 |
|------|------|------|--------|----------|
| RT-1 | Google | 2022 | - | 第一个大规模 Robotics Transformer |
| RT-2 | [[google-deepmind-robotics]] | 2023.07 | 55B | 首个 VLA，证明网络知识可迁移 |
| PaLM-E | Google/TU Berlin | 2023.03 | 562B | 最大多模态具身模型 |
| Octo | UC Berkeley | 2024 | 27-93M | 开源 transformer + diffusion policy |
| OpenVLA | Stanford | 2024.06 | 7B | 开源 VLA，7x 更小但超越 RT-2-X |
| π0 | [[physical-intelligence]] | 2024.10 | 3B | 首个通用型：叠衣服/组装/清洁 |
| π0.5 | [[physical-intelligence]] | 2025.09 | - | 更好的开放世界泛化 |

## 与 Diffusion Policy 的互补

VLA 擅长 **high-level reasoning**（理解语言、泛化到新物体），Diffusion Policy 擅长 **fine-grained control**（接触密集任务、多模态动作分布）。未来方向可能是两者结合：VLA 做高层规划，Diffusion 做底层执行。

## 开放挑战

1. **实时性**: 55B 参数模型的推理速度太慢
2. **安全性**: VLM 的幻觉在物理世界中可能导致碰撞
3. **数据效率**: 需要大量机器人交互数据
4. **可解释性**: 端到端模型是黑箱

## 个人笔记

VLA 是我博士研究的核心方向。我的直觉是：**7B 左右的开源模型 + 高质量领域数据** 会是最实用的路线，而不是追求 55B 的庞然大物。OpenVLA 已经证明了这一点。
"""
    },
    {
        "slug": "sim-to-real",
        "title": "Sim-to-Real 迁移",
        "category": "concept",
        "tags": ["Sim-to-Real", "仿真", "Domain Randomization", "迁移学习"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence", "nvidia-isaac"],
        "created": _days_ago(55),
        "updated": _days_ago(3),
        "sources": ["semantic-scholar-tracker", "arxiv-tracker"],
        "content": """# Sim-to-Real 迁移

在仿真中训练，在真实世界中部署——这是解决机器人数据稀缺问题的核心范式，也是我博士研究的重点方向之一。

## 核心挑战：Reality Gap

仿真和现实之间的差距来自三个方面：
1. **视觉差异**: 光照、纹理、材质渲染不真实
2. **物理差异**: 摩擦、接触动力学、柔性物体模拟不准确
3. **传感器差异**: 相机噪声、深度传感器失真

## 主流方法

### Domain Randomization (DR)
训练时随机化仿真参数（质量、摩擦、光照、纹理），让策略对各种变化鲁棒。

**经典成果**:
- OpenAI 魔方求解 (2019)
- 冠军级无人机竞速 (2023)
- 四足机器人运动控制

### System Identification
测量真实世界物理参数，校准仿真器使其匹配。DROPO (2023) 自动化了 DR 范围估计。

### 视觉基础模型
用 CLIP / DINOv2 等提取域无关特征，天然具备跨域泛化能力。

### Real-to-Sim-to-Real
先用真实数据校准仿真 → 在校准后的仿真中训练 → 迁移回真实世界。

## 2025 最新进展

- 扩散模型做图像翻译，将仿真图像转为逼真图像，自动驾驶部署性能提升 40%+
- 基础模型实现 few-shot 适应，大幅减少真实数据需求
- [[nvidia-isaac]] 的 Newton 物理引擎改善了接触动力学仿真精度

## 仍未解决的问题

- 柔性物体（绳子、布料）的仿真仍然很差
- 触觉/接触动力学的精确建模
- 长时间任务的迁移退化
- 安全性保证

## 我的研究方向

我聚焦在 **progressive domain randomization**：不是一开始就最大化随机化范围，而是随着策略变强逐步扩大。初步实验显示这比 uniform DR 收敛更快、成功率更高。
"""
    },
    {
        "slug": "world-models",
        "title": "世界模型 (World Models)",
        "category": "concept",
        "tags": ["World Models", "DreamerV3", "UniSim", "Genie", "想象力"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence", "nvidia-isaac"],
        "created": _days_ago(20),
        "updated": _days_ago(4),
        "sources": ["arxiv-tracker"],
        "content": """# 世界模型 (World Models)

世界模型学习环境动力学的内部表示，让智能体能在「想象」中规划行动，而非依赖昂贵的真实交互。

## 核心理念

> 你可以在脑海中想象把杯子推到桌边会发生什么——这就是世界模型在做的事情。

## 关键模型

### DreamerV3 (Hafner et al., 2023, Nature 2025)
- 单一算法掌握 150+ 种任务
- 使用 RSSM (Recurrent State-Space Model) + 分类潜变量
- Actor 和 Critic 完全在想象中训练
- **意义**: 证明了通用世界模型的可行性

### UniSim (Google DeepMind / UC Berkeley, ICLR 2024 Outstanding Paper)
- 学习交互式真实世界模拟器
- 同时支持高层指令 ("打开抽屉") 和低层控制
- 可用于训练视觉-语言规划器和 RL 策略

### Genie 系列 (Google DeepMind)
- Genie 1 (2024.02): 从图像生成可玩 2D 世界
- Genie 2 (2024.12): 单图生成可控 3D 环境
- Genie 3 (2025.08): 实时 24fps、分钟级一致性、720p

### NVIDIA Cosmos (2025)
开源世界基础模型，具有 3D 一致性和物理对齐。与 [[nvidia-isaac]] 的 GR00T N1.6 集成。

## 与机器人学的关系

世界模型可以：
1. 在想象中做数据增强，解决真实数据稀缺
2. 做 model-based planning，提高样本效率
3. 辅助 [[sim-to-real]]，生成更真实的仿真环境

## 个人思考

世界模型可能是具身智能的「最终形态」——不是学一个反射式的 policy，而是真正理解物理世界的因果结构。但目前的模型还很粗糙，生成的「想象」和真实世界差距还很大。

DreamerV3 登上 Nature 是一个信号——这个方向在学术上已经被认可了。
"""
    },
    {
        "slug": "dexterous-manipulation",
        "title": "灵巧操控 (Dexterous Manipulation)",
        "category": "concept",
        "tags": ["灵巧操控", "灵巧手", "抓取", "DexGraspNet"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence", "tactile-sensing"],
        "created": _days_ago(30),
        "updated": _days_ago(5),
        "sources": ["arxiv-tracker", "semantic-scholar-tracker"],
        "content": """# 灵巧操控 (Dexterous Manipulation)

让机器人像人手一样灵巧地操控物体——这是具身智能中最难的子问题之一。

## 核心挑战

- **高维动作空间**: 五指手 20+ 自由度
- **复杂接触动力学**: 手指与物体的接触模式极其复杂
- **部分可观测**: 手内物体状态难以完全观测
- **Sim-to-Real Gap**: 精细接触在仿真中很难准确模拟

## 近期突破

### DexGraspNet (PKU, ICRA 2023)
大规模灵巧抓取数据集：132 万个抓取姿态、5,355 个物体。DexGraspNet 2.0 (CoRL 2024) 在杂乱场景中实现 90.7% 真实世界成功率。

### DexGrasp Anything (CVPR 2025)
将物理约束集成到扩散抓取生成中，几乎在所有开放灵巧抓取 benchmark 上达到 SOTA。走向「任意物体」的通用抓取。

### AnyGrasp (IEEE T-RO 2023)
鲁棒的 7-DOF 密集抓取感知系统，对深度传感噪声有很强的鲁棒性。

### RotateIt (UC Berkeley/Meta, CoRL 2023)
用指尖做物体旋转，融合视觉和 [[tactile-sensing]]，sim 训练零样本部署到真实。

## 与触觉的协同

灵巧操控几乎必然需要 [[tactile-sensing]] 的支持。视觉告诉你「在哪里抓」，触觉告诉你「抓得对不对」。Digit 360 等新一代传感器正在弥补这个缺口。

## 个人关注

灵巧操控是我论文可能涉及的方向之一。当前的挑战是：如何在不完美的仿真中训练出能在真实灵巧手上工作的策略。这和 [[sim-to-real]] 的研究高度相关。
"""
    },
    {
        "slug": "tactile-sensing",
        "title": "触觉感知 (Tactile Sensing)",
        "category": "concept",
        "tags": ["触觉", "GelSight", "DIGIT", "传感器"],
        "wiki_type": "intel",
        "backlinks": ["dexterous-manipulation", "embodied-intelligence"],
        "created": _days_ago(25),
        "updated": _days_ago(6),
        "sources": ["arxiv-tracker"],
        "content": """# 触觉感知 (Tactile Sensing)

视觉无法感知接触力、滑动、纹理和物体柔度。触觉传感是实现精细 [[dexterous-manipulation]] 的关键。

## 关键传感器

### GelSight
光学触觉传感器，通过弹性体表面 + LED + 相机捕获微米级 3D 接触几何。GelSight Mini 零售价约 $500。

### DIGIT (Meta AI)
紧凑低成本 ($350) 光学触觉传感器，为机器人手指设计。开源硬件/软件，推动了触觉研究的民主化。

### Digit 360 (GelSight + Meta AI, 2024.10)
指尖形传感器，18+ 种感知模态（力、振动、温度、接近等），达到人类级触觉精度。覆盖整个指尖表面。

## 触觉基础模型

### Sparsh (Meta FAIR, 2024)
自监督触觉编码器，在 46 万+ 触觉图像上训练。比任务特化模型提升 95.1%。

### Sparsh-X (2025)
融合图像、音频、运动和压力为统一潜表示。

## 2024-2025: 触觉的「ImageNet 时刻」

便宜的传感器 + 基础模型 = 触觉研究的临界质量。这个领域正在经历类似计算机视觉 2012 年的突破。

## 个人笔记

如果要给 [[unitree]] G1 加触觉，Digit 是最现实的选择。$350 一个，可以在手指上安装多个。但目前 G1 的手部精度本身就有限，触觉数据的利用率是个问题。
"""
    },
    {
        "slug": "foundation-models-robotics",
        "title": "机器人基础模型",
        "category": "concept",
        "tags": ["基础模型", "Scaling Law", "通用机器人"],
        "wiki_type": "intel",
        "backlinks": ["embodied-intelligence", "vla-models"],
        "created": _days_ago(35),
        "updated": _days_ago(3),
        "sources": ["arxiv-tracker", "semantic-scholar-tracker"],
        "content": """# 机器人基础模型 (Foundation Models for Robotics)

将大语言模型的成功范式——大数据、大模型、通用能力——复制到机器人领域。

## 核心趋势

机器人学正在从「一个任务训练一个模型」转向「一个模型解决所有任务」，类似 NLP 从规则/统计到 GPT 的范式转移。

## 关键路线

### 1. VLA 路线 ([[vla-models]])
直接端到端：图像 + 语言 → 动作
代表：RT-2, OpenVLA, π0

### 2. LLM as Planner
LLM 做高层规划，底层技能库执行
代表：[[saycan]], Code as Policies

### 3. 世界模型路线 ([[world-models]])
学习环境动力学，在想象中规划
代表：DreamerV3, UniSim

### 4. 多模态感知路线
融合视觉、语言、触觉、本体感觉
代表：PaLM-E, Sparsh

## 重要综述

Firoozi et al., "Foundation Models in Robotics: Applications, Challenges, and the Future" (IJRR, 2025.04)

## 开放挑战

1. **数据**: 机器人数据比互联网文本少几个数量级。[[open-x-embodiment]] 是解决方案之一
2. **安全**: VLM 幻觉在物理世界中后果严重
3. **实时性**: 大模型推理太慢，控制回路要求毫秒级
4. **跨形态**: 在手臂上训练的策略能用在人形机器人上吗？
5. **评估**: 缺乏统一的 benchmark

## 个人笔记

这个领域现在很热（太热了？），但我觉得真正的挑战不在模型架构，而在**数据**和**部署**。谁能高效地收集高质量机器人数据，谁就能赢。[[mobile-aloha]] 的路线（低成本硬件 + 远程操控）可能比堆算力更务实。
"""
    },
    {
        "slug": "vibe-coding",
        "title": "Vibe Coding",
        "category": "concept",
        "tags": ["Vibe Coding", "AI 编程", "Claude", "副业"],
        "wiki_type": "intel",
        "backlinks": ["digital-nomad"],
        "created": _days_ago(15),
        "updated": _days_ago(1),
        "sources": ["xiaohongshu-tracker", "zhihu-tracker"],
        "content": """# Vibe Coding

用 AI 辅助编程，边听音乐边写代码，享受心流的编程方式。Andrej Karpathy 在 2025 年初提出这个概念。

## 我的理解

Vibe Coding 不只是「用 AI 写代码」，而是一种新的人机协作模式：

1. **你负责思考和设计**（架构、需求、审美）
2. **AI 负责实现**（写代码、调试、重构）
3. **你负责审核和迭代**

本质上是把编程从「手工活」变成了「导演活」。

## 我的实践

这个 ABO 项目本身就是 Vibe Coding 的产物。整个系统——前端 React + 后端 FastAPI + Tauri 桌面应用——都是通过 Claude Code 协作完成的。

### 工具链
- **Claude Code**: 主力 AI 编程助手
- **Cursor**: 日常代码编辑
- **GitHub Copilot**: 补全和小修改

### 心得
- 把需求拆成小任务，一次只做一件事
- 先写清楚 spec，再让 AI 实现
- 审代码比写代码重要
- 保持良好的 git 习惯，随时可以回滚

## 与 [[digital-nomad]] 的关系

Vibe Coding 大幅降低了独立开发的门槛。一个人 + AI 就能做出以前需要小团队的产品。这对数字游民生活方式是利好——你可以在咖啡馆里做出一个完整的产品。

## 个人思考

作为一个读博的人，Vibe Coding 让我看到了另一种可能：不一定要进大厂，也不一定要留学术界。用 AI 做独立开发，配合 [[digital-nomad]] 的生活方式，也许是一条新路。

当然，前提是你得有足够好的品味和判断力——AI 可以写代码，但不能替你做产品决策。
"""
    },
    {
        "slug": "digital-nomad",
        "title": "数字游民与 FIRE",
        "category": "concept",
        "tags": ["数字游民", "FIRE", "远程工作", "自由", "生活方式"],
        "wiki_type": "intel",
        "backlinks": ["vibe-coding"],
        "created": _days_ago(20),
        "updated": _days_ago(2),
        "sources": ["xiaohongshu-tracker", "zhihu-tracker"],
        "content": """# 数字游民与 FIRE

数字游民 (Digital Nomad) + 财务自由/提前退休 (FIRE: Financial Independence, Retire Early) 是我的长期生活方式目标。

## 为什么想做数字游民

1. **自由度**: 不被地理位置束缚，想去哪里就去哪里
2. **成本套利**: 在低成本地区生活，赚发达地区的钱
3. **体验**: 不同文化、食物、风景——徒步、摄影都需要这些
4. **专注**: 远离办公室政治，专注于有意义的工作

## FIRE 路线思考

作为一个还在读博的人，FIRE 似乎遥不可及。但是：

### 收入来源规划
1. **独立开发** ([[vibe-coding]] 加持)
2. **技术内容创作** (B 站科普 UP 主)
3. **投资** (指数基金为主，日本股市也在关注)
4. **兼职咨询** (具身智能方向)

### 支出控制
- 目标：月支出 < ¥8,000 (东南亚/日本乡下)
- 住宿：长租公寓 / Coliving
- 交通：公共交通 + 步行
- 饮食：自己做饭为主

## 心理建设

> 「存在先于本质」—— [[existentialism]]

不需要先找到人生意义才开始活。先活着，意义自然会显现。读博不是目的，是手段。重要的是：我想过什么样的生活？

## 相关资源

- 小红书上的数字游民社区
- FIRE 相关的播客（「文化有限」有几期很好）
- 日本的 co-working / co-living 空间
"""
    },
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#                         LIT WIKI (文献库)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEMO_WIKI_PAGES_LIT = [
    # ━━━━━━━━ PAPER (单篇论文) ━━━━━━━━
    {
        "slug": "rt-2",
        "title": "RT-2: Vision-Language-Action Models",
        "category": "paper",
        "tags": ["RT-2", "VLA", "Google DeepMind", "CoRL 2023"],
        "wiki_type": "lit",
        "backlinks": ["vla-models", "embodied-intelligence", "open-x-embodiment"],
        "created": _days_ago(60),
        "updated": _days_ago(2),
        "sources": ["url:https://arxiv.org/abs/2307.15818"],
        "content": """# RT-2: Vision-Language-Action Models

**作者**: Anthony Brohan + 53 位共同作者 (Google DeepMind)
**发表**: 2023.07, CoRL 2023 | arXiv:2307.15818

## 核心贡献

将视觉-语言模型 (VLM) 扩展为视觉-语言-动作模型 (VLA)，首次证明**网络规模的预训练知识可以迁移到机器人控制**。

## 技术细节

### 动作 Token 化
将机器人动作（末端执行器位置、旋转、夹爪状态）编码为离散 token 序列，如 `1 128 91 241 5 101 127 217`。这样动作就可以和自然语言在同一个 Transformer 中处理。

### 模型架构
基于 PaLM-E (12B) 和 PaLI-X (55B) 微调。输入：图像 + 语言指令。输出：动作 token。

### 与 RT-1 的关系
RT-1 (2022) 仅在机器人数据上训练。RT-2 通过 VLM 预训练获得了 RT-1 不具备的泛化能力和涌现推理能力。

## 关键实验

- 6,000+ 次真实机器人评估
- 能操控训练中从未见过的物体（如恐龙玩具）
- 能执行多步推理（"拿起不属于这里的东西"）
- 能理解数学符号和关系（"移动到 2+3 对应的位置"）

## RT-2-X

在 [[open-x-embodiment]] 数据集上训练的扩展版本，泛化能力提升 50%。但被后来的 OpenVLA (7B) 以更小的模型超越了 16.5%。

## 个人思考

RT-2 是我进入具身智能领域的「入门论文」。它让我确信：具身智能的突破不在于更好的控制算法，而在于更好的**表示学习**。就像 NLP 从规则到统计到深度学习的范式转移，机器人学也在经历同样的转变。

> 论文里最触动我的一句话：「We hypothesize that vision-language pre-training on Internet-scale data provides the visual-semantic grounding necessary for robotic control.」
"""
    },
    {
        "slug": "diffusion-policy",
        "title": "Diffusion Policy: 扩散模型驱动的机器人策略",
        "category": "paper",
        "tags": ["Diffusion Policy", "扩散模型", "动作生成", "RSS 2023"],
        "wiki_type": "lit",
        "backlinks": ["vla-models", "embodied-intelligence", "imitation-learning"],
        "created": _days_ago(50),
        "updated": _days_ago(3),
        "sources": ["url:https://arxiv.org/abs/2303.04137"],
        "content": """# Diffusion Policy

**作者**: Cheng Chi, Siyuan Feng, Yilun Du, Zhenjia Xu 等
**机构**: Columbia University / Toyota Research Institute / MIT
**发表**: RSS 2023 (arXiv:2303.04137), IJRR 2024

## 核心思想

将扩散去噪过程用于机器人动作序列的生成——把「生成图像」变成「生成动作」。不是预测单个动作，而是从噪声中迭代去噪出一条完整的动作轨迹。

## 为什么这很重要

传统行为克隆 (BC) 用 MSE 回归预测动作，会遇到**多模态问题**：同一个观测可能对应多种合理动作（比如绕过障碍物可以走左边也可以走右边），但 MSE 会预测一个平均值（直接撞上去）。

Diffusion Policy 天然支持多模态分布，因为扩散模型本身就是生成模型。

## 技术贡献

1. **Receding-horizon 动作预测**: 预测未来一段动作，执行一部分，重新规划
2. **两种架构**: CNN-based 和 Transformer-based
3. **DDPM/DDIM** 去噪

## 关键结果

- 在 12 个任务 / 4 个 benchmark 上超越 SOTA **平均 46.9%**
- 真实机器人演示：T-block 推动、堆叠、双臂操作
- 训练稳定性优于 GAN-based 和 VAE-based 方法

## 后续发展

- **3D Diffusion Policy (DP3)**: 扩展到 3D 点云观测
- **Diffusion Meets DAgger (DMD, RSS 2024)**: 用扩散模型合成分布外状态的纠正数据，8 条 demo 达到 80% 成功率
- 已成为机器人学习的**主流 action generation backbone**

## 与 VLA 的关系

| 维度 | VLA (RT-2) | Diffusion Policy |
|------|-----------|-----------------|
| 动作表示 | 离散 token | 连续轨迹 |
| 预训练 | 需要 VLM | 不需要语言预训练 |
| 多模态 | 弱 | 强 |
| 泛化 | 跨任务 | 同任务内 |
| 适用场景 | High-level reasoning | Fine-grained manipulation |

## 个人笔记

这篇论文的 insight 很优雅：**机器人的动作空间和图像空间本质上都是连续高维空间**，扩散模型在两者上都有效。我在实验中用过 DP 做接触操作，确实比 vanilla BC 好很多。

一个有趣的发现：action chunking (预测一段而非一步) 对性能的影响可能比扩散本身还大。
"""
    },
    {
        "slug": "palm-e",
        "title": "PaLM-E: 具身多模态语言模型",
        "category": "paper",
        "tags": ["PaLM-E", "多模态", "Google", "ICML 2023"],
        "wiki_type": "lit",
        "backlinks": ["foundation-models-robotics", "vla-models"],
        "created": _days_ago(55),
        "updated": _days_ago(10),
        "sources": ["url:https://arxiv.org/abs/2303.03378"],
        "content": """# PaLM-E: An Embodied Multimodal Language Model

**作者**: Danny Driess, Fei Xia, Brian Ichter 等
**机构**: Google / TU Berlin
**发表**: 2023.03, ICML 2023 | arXiv:2303.03378

## 核心贡献

562B 参数的多模态语言模型，直接将连续传感器信号（图像、机器人状态、场景嵌入）整合到语言模型中。

## 技术方法

训练编码器将视觉/机器人模态投射到与文本 token 相同的嵌入空间。PaLM-E-562B = PaLM + ViT-22B。

## 关键发现

1. **正迁移**: 跨语言、视觉、机器人三个域的联合训练提升了所有任务的性能
2. **涌现能力**: 多图推理等能力在没有显式训练的情况下出现
3. 在 OK-VQA 上达到 SOTA，同时保持通用语言能力

## 个人评价

PaLM-E 的 562B 规模在实用性上有限，但它的核心 insight——**多模态联合训练产生正迁移**——对后续的 VLA 研究影响深远。RT-2 和 π0 都继承了这个思路。
"""
    },
    {
        "slug": "voxposer",
        "title": "VoxPoser: 用 LLM 合成 3D 价值图",
        "category": "paper",
        "tags": ["VoxPoser", "LLM", "零样本", "Stanford", "CoRL 2023"],
        "wiki_type": "lit",
        "backlinks": ["language-conditioned-manipulation"],
        "created": _days_ago(45),
        "updated": _days_ago(7),
        "sources": ["url:https://arxiv.org/abs/2307.05973"],
        "content": """# VoxPoser: Composable 3D Value Maps for Robot Manipulation

**作者**: Wenlong Huang, Chen Wang, Ruohan Zhang, Yunzhu Li, Jiajun Wu, Li Fei-Fei
**机构**: Stanford University
**发表**: 2023.07, CoRL 2023 | arXiv:2307.05973

## 核心思想

利用 LLM 的代码生成能力，合成 3D 体素价值图（吸引力 + 排斥力），然后用 MPC 规划器生成闭环轨迹。**完全零样本，无需任务特定训练数据。**

## 工作流程

```
语言指令 ("open the bottle")
    ↓
LLM 生成 Python 代码
    ↓
调用 VLM 定位物体
    ↓
合成 3D affordance/constraint 体素图
    ↓
MPC 运动规划
    ↓
闭环执行 (鲁棒应对扰动)
```

## 关键结果

- Franka Panda 真实机器人上 70-90% 成功率
- 开瓶、扫地、开抽屉等任务
- 对外部扰动具有鲁棒性

## 个人思考

VoxPoser 代表了一种和 VLA 完全不同的范式：**不是端到端学习，而是利用 LLM 的推理能力做组合式规划**。好处是可解释、零样本；坏处是依赖 LLM 的代码生成质量，容易出错。

VLA 路线和 VoxPoser 路线最终可能会融合——用 VLA 做端到端控制，用 LLM 做复杂推理和规划。
"""
    },
    {
        "slug": "open-x-embodiment",
        "title": "Open X-Embodiment: 跨机器人数据集",
        "category": "paper",
        "tags": ["Open X-Embodiment", "数据集", "RT-X", "跨机器人"],
        "wiki_type": "lit",
        "backlinks": ["foundation-models-robotics", "google-deepmind-robotics", "rt-2"],
        "created": _days_ago(50),
        "updated": _days_ago(4),
        "sources": ["url:https://arxiv.org/abs/2310.08864"],
        "content": """# Open X-Embodiment

**机构**: Google DeepMind + 21 家机构 (34 个实验室)
**发表**: 2023.10 | arXiv:2310.08864

## 概述

最大的开源真实机器人数据集：
- **100 万+** 真实机器人轨迹
- **22 种** 机器人形态 (单臂/双臂/四足)
- **527 种** 技能
- **60 个** 已有数据集的整合

## 核心发现

RT-2-X（在 OXE 上训练的 RT-2）比仅在 Google 机器人数据上训练的 RT-2 **泛化能力提升 50%**。

这证明了一个类似 NLP Scaling Law 的规律：**更多机器人、更多数据 = 更好的泛化**。

## 标准化贡献

使用 RLDS 格式标准化数据，已成为机器人学习数据共享的事实标准。

## 意义

OXE 对机器人学的意义，类似于 ImageNet 对计算机视觉的意义——它提供了一个统一的大规模数据基础，让不同实验室的工作可以相互增强。

## 个人笔记

我把 OXE 作为预训练数据源之一。数据质量参差不齐是个问题——60 个数据集来自不同实验室，标注标准不统一。但对于预训练来说，「量大」比「质高」更重要。
"""
    },
    {
        "slug": "saycan",
        "title": "SayCan: 语言接地机器人控制",
        "category": "paper",
        "tags": ["SayCan", "语言接地", "affordance", "Google", "CoRL 2022"],
        "wiki_type": "lit",
        "backlinks": ["language-conditioned-manipulation", "google-deepmind-robotics"],
        "created": _days_ago(70),
        "updated": _days_ago(15),
        "sources": ["url:https://arxiv.org/abs/2204.01691"],
        "content": """# SayCan: Do As I Can, Not As I Say

**作者**: Michael Ahn, Anthony Brohan, Brian Ichter, Andy Zeng, Chelsea Finn, Karol Hausman, Sergey Levine + 38 位
**机构**: Google Robotics / Everyday Robots
**发表**: 2022.04, CoRL 2022 | arXiv:2204.01691

## 核心问题

LLM 知道**该做什么** (Say)，但不知道**能做什么** (Can)。如何让语言模型理解机器人的物理局限？

## 方法

```
P(action | instruction) = P_LLM(useful | instruction, action) × P_affordance(feasible | state, action)
```

LLM 评估每个候选技能的「有用性」，affordance 模型评估「可行性」，两者相乘选出最佳动作。

## 关键结果

- PaLM-SayCan: **84%** 技能序列正确率, **74%** 执行成功率
- 比 FLAN 减少 50% 错误
- 在 101 个厨房任务上评估

## 历史地位

SayCan 是 [[language-conditioned-manipulation]] 的奠基之作，也是 RT-2、PaLM-E 等后续工作的概念前身。它提出的「语言 × 可行性」框架至今仍在使用。

## 局限

需要预定义的技能库和为每个技能训练 affordance 函数，扩展性有限。后来的 VLA 模型通过端到端学习绕过了这个限制。
"""
    },
    {
        "slug": "pi0-paper",
        "title": "π0: A Vision-Language-Action Flow Model",
        "category": "paper",
        "tags": ["pi0", "Physical Intelligence", "flow model", "通用机器人"],
        "wiki_type": "lit",
        "backlinks": ["physical-intelligence", "vla-models", "foundation-models-robotics"],
        "created": _days_ago(25),
        "updated": _days_ago(1),
        "sources": ["url:https://arxiv.org/abs/2410.24164"],
        "content": """# π0: A Vision-Language-Action Flow Model

**机构**: [[physical-intelligence]]
**发表**: 2024.10 | arXiv:2410.24164

## 核心贡献

第一个真正意义上的「通用机器人基础模型」：一个模型在多种机器人上执行叠衣服、组装盒子、收拾桌面等复杂任务。

## 技术特点

- **3B 参数** VLA flow model，基于 PaliGemma
- 在 **10,000+ 小时**真实数据上训练
- 覆盖 **7 种机器人形态**、**68 个任务**
- Flow matching (比 diffusion 更高效的生成方法)

## 与其他 VLA 的区别

| | RT-2 | OpenVLA | π0 |
|---|---|---|---|
| 参数量 | 55B | 7B | 3B |
| 训练数据 | Google 内部 | OXE | 自有 10K+ 小时 |
| 任务复杂度 | 单步拾放 | 单步拾放 | 多步长时域 |
| 开源 | 否 | 是 | 是 (openpi) |

## 意义

π0 证明了机器人基础模型不需要巨大的参数量——3B 参数就够了，关键是**高质量的数据**。这和 OpenVLA 的发现一致：数据 > 模型大小。

## π0.5 (2025.09)

改进版本，通过异构数据协同训练实现更好的开放世界泛化。

## 个人笔记

π0 是我目前最关注的模型。openpi 仓库是我学习 VLA 的主要代码参考。3B 参数意味着一张 A100 就能跑，这对实验室来说太友好了。
"""
    },
    {
        "slug": "robocasa",
        "title": "RoboCasa: 大规模家庭机器人仿真",
        "category": "paper",
        "tags": ["RoboCasa", "仿真", "benchmark", "UT Austin"],
        "wiki_type": "lit",
        "backlinks": ["sim-to-real"],
        "created": _days_ago(20),
        "updated": _days_ago(5),
        "sources": ["url:https://arxiv.org/abs/2406.02523", "url:https://robocasa.ai/"],
        "content": """# RoboCasa

**机构**: UT Austin (Yuke Zhu 组)
**发表**: 2024 | arXiv:2406.02523

## 概述

大规模家庭机器人仿真框架，解决真实数据采集的瓶颈问题。

## RoboCasa365 (2025-2026)

最新版本，大幅扩展：
- **365 个**日常任务
- **2,500 个**厨房环境
- **600+ 小时**人类示教 + **1,600+ 小时**合成示教
- 支持 Diffusion Policy、π0、GR00T N1 等主流方法的 benchmark

## 核心价值

仿真数据 + 少量真实数据协同训练的策略，在真实机器人上的表现显著优于纯仿真训练。验证了 [[sim-to-real]] 的实用性。

## 个人笔记

RoboCasa 是我做 [[sim-to-real]] 实验的候选仿真环境之一。它的优势是任务多样性和资产丰富度。但目前只有厨房场景，如果要做更通用的操控任务，可能还需要其他仿真环境补充。
"""
    },

    # ━━━━━━━━ TOPIC (方法 · 领域 · 主题) ━━━━━━━━
    {
        "slug": "imitation-learning",
        "title": "模仿学习 (Imitation Learning)",
        "category": "topic",
        "tags": ["模仿学习", "BC", "DAgger", "学习方法"],
        "wiki_type": "lit",
        "backlinks": ["diffusion-policy", "foundation-models-robotics"],
        "created": _days_ago(55),
        "updated": _days_ago(3),
        "sources": ["semantic-scholar-tracker", "arxiv-tracker"],
        "content": """# 模仿学习 (Imitation Learning)

从专家示教中学习策略，是当前机器人学习最主流的范式。

## 核心方法

### Behavioral Cloning (BC)
最简单的模仿学习：监督学习，观测 → 动作。优点是简单高效；缺点是**分布偏移** (distribution shift)——机器人偏离示教状态后不知道怎么恢复。

### DAgger (Dataset Aggregation)
迭代式收集专家纠正，解决分布偏移。但需要在线专家，成本高。

### Diffusion Policy
本质是一种 BC 方法，但通过扩散模型建模完整动作分布，克服了 BC 的模式崩塌问题。是当前最 SOTA 的 IL 方法。详见 [[diffusion-policy]]。

## 2024-2025 前沿

- **Diffusion Meets DAgger (DMD, RSS 2024)**: 用扩散模型合成纠正数据，不需要真人专家。8 条 demo → 80% 成功率 (vs BC 的 20%)
- **Instant Policy (ICLR 2025)**: 单条 demo 即时推理，无需梯度更新
- **Latent Diffusion Planning**: 在学习的潜空间中做扩散规划

## 与强化学习的关系

IL: 「模仿专家」→ 安全、高效，但上限是专家水平
RL: 「自主探索」→ 可超越人类，但样本效率低、存在安全问题

当前趋势是**IL 做初始化，RL 做 fine-tuning**。

## 个人笔记

我的实验主要用 IL (Diffusion Policy)。纯 RL 在真实机器人上太危险了——探索阶段的随机动作可能损坏机器人或伤人。
"""
    },
    {
        "slug": "language-conditioned-manipulation",
        "title": "语言条件操控",
        "category": "topic",
        "tags": ["语言接地", "LLM", "机器人控制", "多模态"],
        "wiki_type": "lit",
        "backlinks": ["embodied-intelligence", "vla-models"],
        "created": _days_ago(45),
        "updated": _days_ago(5),
        "sources": ["arxiv-tracker"],
        "content": """# 语言条件操控 (Language-Conditioned Manipulation)

用自然语言指定机器人任务——从「把程序写死」到「说一句话就行」。

## 发展路线

### 第一阶段：模块化 (2022)
**[[saycan]]**: LLM scoring × affordance → 技能选择
**Code as Policies**: LLM 直接生成控制代码

### 第二阶段：组合式 (2023)
**[[voxposer]]**: LLM 生成代码 → 合成 3D 价值图 → MPC 规划
**CLIPort**: CLIP 语义 + TransporterNet 空间精度

### 第三阶段：端到端 (2023-2025)
**RT-2, OpenVLA, π0**: VLA 模型直接从语言+图像输出动作
不再需要技能库、affordance 函数或中间表示

## 当前格局

端到端 VLA 正在成为主流，但组合式方法在可解释性和复杂推理方面仍有优势。

## 个人思考

语言是一种非常自然的任务指定方式，但它也有局限：有些操控细节很难用语言描述（比如「用多大的力？」「手指弯曲到什么角度？」）。未来可能需要语言 + 视觉示教 + 触觉反馈的多模态指令。
"""
    },
    {
        "slug": "robot-learning-survey",
        "title": "机器人学习综述",
        "category": "topic",
        "tags": ["综述", "机器人学习", "研究方向"],
        "wiki_type": "lit",
        "backlinks": ["foundation-models-robotics"],
        "created": _days_ago(40),
        "updated": _days_ago(6),
        "sources": ["semantic-scholar-tracker"],
        "content": """# 机器人学习综述

机器人学习的全景地图——方便定位自己的研究在什么位置。

## 学习范式

| 范式 | 代表方法 | 优势 | 劣势 |
|------|----------|------|------|
| 模仿学习 | BC, DAgger, [[diffusion-policy]] | 安全、高效 | 受限于示教质量 |
| 强化学习 | PPO, SAC, DreamerV3 | 可超越人类 | 样本低效、不安全 |
| 自监督 | Contrastive, MAE | 不需标签 | 难以直接用于控制 |
| 基础模型 | [[vla-models]], π0 | 泛化能力强 | 需要大量算力和数据 |

## 感知表示

| 表示 | 方法 | 应用 |
|------|------|------|
| RGB | CNN, ViT | 基础视觉 |
| 点云 | PointNet++, 3D DP | 3D 操控 |
| 触觉 | GelSight, DIGIT | 精细操控 |
| 多模态 | PaLM-E, Sparsh-X | 通用感知 |

## 我的研究定位

```
具身智能
└── 机器人学习
    ├── 模仿学习 ← 主要方法
    │   └── Diffusion Policy ← 具体技术
    ├── VLA 模型 ← 核心方向
    │   └── Sim-to-Real VLA ← 我的 focus
    └── 仿真到现实 ← 关键挑战
        └── Progressive DR ← 我的贡献
```
"""
    },
    {
        "slug": "existentialism",
        "title": "存在主义与读博",
        "category": "topic",
        "tags": ["存在主义", "加缪", "萨特", "哲学", "读博"],
        "wiki_type": "lit",
        "backlinks": ["the-outsider", "myth-of-sisyphus", "digital-nomad"],
        "created": _days_ago(80),
        "updated": _days_ago(2),
        "sources": [],
        "content": """# 存在主义与读博

这不是一篇学术笔记，而是我的个人思考——关于「存在」「意义」和「读博」之间的关系。

## 三位老师

### 加缪：荒诞的反抗
核心问题：世界没有意义，那为什么还要活着？
答案：**正因为**没有意义，所以要活得更加热烈。推石头本身就是反抗。
→ 读博版本：论文被拒就是巨石滚落，然后你再推一次。详见 [[myth-of-sisyphus]]。

### 萨特：存在先于本质
你不是「被定义」为一个博士生——你通过自己的选择和行动**成为**一个博士生。
→ 读博版本：不是因为读博有意义才读，而是你的行动赋予了它意义。

### 克尔凯郭尔：焦虑即自由
焦虑不是bug，是feature。它意味着你面前有选择，而选择意味着自由。
→ 读博版本：不知道毕业后做什么？好的，这意味着你可以做任何事。

## 日常实践

1. **写日记**: 记录思考，对抗遗忘
2. **弹吉他**: 用身体对抗虚无（村上春树式的）
3. **徒步**: 在自然中找到存在的实感
4. **摄影**: 用相机捕捉「当下」
5. **读文学**: [[the-outsider]]、[[norwegian-wood]]——在别人的故事里找到共鸣

## 一个悖论

研究具身智能的我，经常陷入关于「意识」和「意义」的思考。我在教机器人理解物理世界——但我自己理解这个世界了吗？

也许这就是加缪说的荒诞：我们追求意义的能力，和世界本身的无意义，之间的永恒张力。

> 存在先于本质——但代码先于存在。
"""
    },
    {
        "slug": "the-outsider",
        "title": "局外人 — 加缪",
        "category": "topic",
        "tags": ["加缪", "存在主义", "法国文学", "读书笔记"],
        "wiki_type": "lit",
        "backlinks": ["existentialism"],
        "created": _days_ago(90),
        "updated": _days_ago(4),
        "sources": [],
        "content": """# 局外人 (L'Étranger)

**作者**: 阿尔贝·加缪 | **年份**: 1942 | **原文语言**: 法语

## 读书笔记

莫尔索的「冷漠」不是无情，而是对虚伪社会仪式的拒绝。他被判死刑不是因为杀了人，而是因为「在母亲的葬礼上没有哭」。

这个荒诞的审判过程，恰恰揭示了社会对「情感表演」的病态要求。

## 核心段落

> 我知道这个世界我无处容身，只是，你凭什么审判我的灵魂？

## 与 [[existentialism]] 的关系

这部小说是加缪荒诞哲学的文学化表达。莫尔索活在当下、拒绝虚伪、接受荒诞——这正是加缪所倡导的生活态度。

## 个人共鸣

作为一个经常思考「读博有什么意义」的人，莫尔索的态度给了我另一种视角：意义不需要被寻找，活着本身就是意义。

在学术圈里，有太多虚伪的「葬礼」——无意义的会议、形式化的报告、为了引用数而写的论文。莫尔索会怎么做？他大概会直接走出会议室，去海边晒太阳。

## 阅读版本

读了两遍：柳鸣九的中译本和英译本。有机会想读法语原版，等日语学完之后。

## 相关

- [[myth-of-sisyphus]] — 加缪的哲学随笔，和局外人互为表里
- [[existentialism]] — 更广泛的思考
"""
    },
    {
        "slug": "norwegian-wood",
        "title": "挪威的森林 — 村上春树",
        "category": "topic",
        "tags": ["村上春树", "日本文学", "青春", "音乐", "读书笔记"],
        "wiki_type": "lit",
        "backlinks": ["existentialism"],
        "created": _days_ago(85),
        "updated": _days_ago(5),
        "sources": ["xiaoyuzhou-tracker"],
        "content": """# 挪威的森林 (ノルウェイの森)

**作者**: 村上春树 | **年份**: 1987 | **原文语言**: 日语

## 阅读感想

在学日语的过程中重读了原版。村上的文字有一种独特的节奏感——简洁、克制，但在不经意处击中你。

日语原文里有一种中译本无法传达的东西：语尾的微妙变化、敬语和平语的切换、省略带来的余韵。学日语到 N2 之后再读，感受完全不一样。

## 音乐意象

Beatles 的 Norwegian Wood 贯穿全书。作为一个弹吉他的人，我特别能感受到音乐在村上世界里的分量。

村上小说里的音乐不只是背景——它是一种情感语言，比文字更直接。渡边在酒吧里听 Norwegian Wood 的那个场景，旋律本身就是一种叙事。

## 与存在主义的连接

村上不是存在主义作家，但他笔下的人物都在处理同样的问题：**如何在失去之后继续活着？**

直子选择了死亡，绿子选择了生活。渡边在两者之间摇摆——这不就是加缪说的「荒诞的处境」吗？

## 相关播客

听了「文化有限」播客关于村上春树的一期，主播提到一个有趣的观点：村上的跑步哲学和写作哲学是一回事——都是通过重复性的身体行为来对抗虚无。

## 一句话

> 死并非生的对立面，而作为生的一部分永存。
"""
    },
    {
        "slug": "myth-of-sisyphus",
        "title": "西西弗斯神话 — 加缪",
        "category": "topic",
        "tags": ["加缪", "荒诞", "哲学", "读书笔记"],
        "wiki_type": "lit",
        "backlinks": ["existentialism", "the-outsider"],
        "created": _days_ago(75),
        "updated": _days_ago(8),
        "sources": [],
        "content": """# 西西弗斯神话 (Le Mythe de Sisyphe)

**作者**: 阿尔贝·加缪 | **年份**: 1942

## 核心论点

> 真正严肃的哲学问题只有一个：自杀。

加缪不是在鼓励自杀，而是在追问：在一个无意义的世界里，我们为什么要继续活着？

## 答案：荒诞的反抗

明知巨石会滚落，仍然选择推上去。这不是乐观主义，而是一种倔强的尊严。

> 应当想象西西弗斯是幸福的。

## 与读博的类比

| 西西弗斯 | 博士生 |
|----------|--------|
| 推巨石上山 | 写论文投稿 |
| 巨石滚落 | 论文被拒 |
| 再推一次 | 修改重投 |
| 推石头本身是意义 | 研究过程本身是意义 |

## 与 [[the-outsider]] 的关系

西西弗斯神话是加缪的哲学表述，局外人是他的文学表述。两者互为表里：莫尔索用行动实践了西西弗斯的精神。

## 对我的影响

这本书改变了我对「失败」的看法。以前论文被拒会消沉很久，现在会想：这就是巨石滚落了，那我再推一次就好。

关键不在于石头最终会不会留在山顶（答案是不会），而在于**你推石头时的姿态**。

## 相关

- [[existentialism]] — 我的整体思考框架
- [[the-outsider]] — 加缪的文学作品
"""
    },
]


# ── Wiki Helper Functions ────────────────────────────────────────

def get_demo_wiki_pages(wiki_type: str) -> list[dict]:
    if wiki_type == "intel":
        return DEMO_WIKI_PAGES_INTEL
    return DEMO_WIKI_PAGES_LIT


def get_demo_wiki_graph(wiki_type: str) -> dict:
    import re
    pages = get_demo_wiki_pages(wiki_type)
    nodes = [{"id": p["slug"], "label": p["title"], "category": p["category"], "tags": p["tags"]} for p in pages]

    edges = []
    for p in pages:
        content = p["content"]
        links = re.findall(r'\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]', content)
        for link in links:
            slug = link.strip().lower().replace(" ", "-")
            if any(n["id"] == slug for n in nodes):
                edges.append({"source": p["slug"], "target": slug})

    return {"nodes": nodes, "edges": edges}


def get_demo_wiki_stats(wiki_type: str) -> dict:
    pages = get_demo_wiki_pages(wiki_type)
    by_category: dict[str, int] = {}
    for p in pages:
        cat = p["category"]
        by_category[cat] = by_category.get(cat, 0) + 1

    return {
        "wiki_type": wiki_type,
        "total": len(pages),
        "by_category": by_category,
    }
