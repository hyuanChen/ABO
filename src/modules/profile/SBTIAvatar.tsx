// src/modules/profile/SBTIAvatar.tsx
// 27 SBTI personality types → pixelated character avatars.
// Source images live in public/id/; preprocessed to 64×64 PNGs in public/id/pixel/
// by scripts/sbti_pixelate.py. Display uses `image-rendering: pixelated` so the
// chunky pixels are preserved when upscaled.

export type SBTIType =
  | "CTRL" | "ATM-er" | "Dior-s" | "BOSS" | "THAN-K" | "OH-NO"
  | "GOGO" | "SEXY" | "LOVE-R" | "MUM" | "FAKE" | "OJBK"
  | "MALO" | "JOKE-R" | "WOC!" | "THIN-K" | "SHIT" | "ZZZZ"
  | "POOR" | "MONK" | "IMSB" | "SOLO" | "FUCK" | "DEAD"
  | "IMFW" | "HHHH" | "DRUNK";

export interface SBTIInfo {
  code: string;
  cn: string;
  intro: string;
  trait: string;
  color: string;
  accent: string;
}

export const SBTI_INFO: Record<SBTIType, SBTIInfo> = {
  "CTRL":   { code: "CTRL",   cn: "拿捏者",   intro: "怎么样，被我拿捏了吧？",             trait: "掌控 · 精准 · 备份盘",      color: "#10B981", accent: "#34D399" },
  "ATM-er": { code: "ATM-er", cn: "送钱者",   intro: "你以为我很有钱吗？",                 trait: "可靠 · 付出 · 心软",        color: "#059669", accent: "#34D399" },
  "Dior-s": { code: "Dior-s", cn: "屌丝",     intro: "等着我屌丝逆袭。",                   trait: "躺平 · 自在 · 人桶合一",    color: "#92400E", accent: "#D97706" },
  "BOSS":   { code: "BOSS",   cn: "领导者",   intro: "方向盘给我，我来开。",               trait: "高效 · 秩序 · 自带气场",    color: "#DC2626", accent: "#F59E0B" },
  "THAN-K": { code: "THAN-K", cn: "感恩者",   intro: "我感谢苍天！我感谢大地！",           trait: "温润 · 正能 · 感恩满溢",    color: "#D97706", accent: "#FBBF24" },
  "OH-NO":  { code: "OH-NO",  cn: "哦不人",   intro: "哦不！我怎么会是这个人格？！",       trait: "谨慎 · 预防 · 边界分明",    color: "#7C3AED", accent: "#A78BFA" },
  "GOGO":   { code: "GOGO",   cn: "行者",     intro: "gogogo~出发咯",                       trait: "行动 · 所见即得 · 闭环",    color: "#F97316", accent: "#FB923C" },
  "SEXY":   { code: "SEXY",   cn: "尤物",     intro: "您就是天生的尤物！",                 trait: "魅力 · 存在感 · 自发光",    color: "#EC4899", accent: "#F472B6" },
  "LOVE-R": { code: "LOVE-R", cn: "多情者",   intro: "爱意太满，现实显得有点贫瘠。",       trait: "多情 · 吟游 · 彩虹滤镜",    color: "#E11D48", accent: "#F43F5E" },
  "MUM":    { code: "MUM",    cn: "妈妈",     intro: "或许...我可以叫你妈妈吗....?",       trait: "共情 · 温柔 · 无限给予",    color: "#0891B2", accent: "#22D3EE" },
  "FAKE":   { code: "FAKE",   cn: "伪人",     intro: "已经，没有人类了。",                 trait: "多面 · 伪装 · 精准切换",    color: "#475569", accent: "#64748B" },
  "OJBK":   { code: "OJBK",   cn: "无所谓人", intro: "我说随便，是真的随便。",             trait: "淡然 · 随意 · 无欲无求",    color: "#6B7280", accent: "#9CA3AF" },
  "MALO":   { code: "MALO",   cn: "吗喽",     intro: "人生是个副本，而我只是一只吗喽。",   trait: "童心 · 顽皮 · 反进化",      color: "#92400E", accent: "#A16207" },
  "JOKE-R": { code: "JOKE-R", cn: "小丑",     intro: "原来我们都是小丑。",                 trait: "娱乐 · 气氛组 · 笑中带泪",  color: "#DB2777", accent: "#F472B6" },
  "WOC!":   { code: "WOC!",   cn: "握草人",   intro: "卧槽，我怎么是这个人格？",           trait: "吐槽 · 后台冷静 · 握草",    color: "#16A34A", accent: "#4ADE80" },
  "THIN-K": { code: "THIN-K", cn: "思考者",   intro: "已深度思考100s。",                    trait: "分析 · 审判 · 独处归档",    color: "#4338CA", accent: "#818CF8" },
  "SHIT":   { code: "SHIT",   cn: "愤世者",   intro: "这个世界，构石一坨。",               trait: "吐槽 · 务实 · 嘴硬心善",    color: "#78350F", accent: "#92400E" },
  "ZZZZ":   { code: "ZZZZ",   cn: "装死者",   intro: "我没死，我只是在睡觉。",             trait: "装死 · 截止驱动 · 低功耗",  color: "#65A30D", accent: "#84CC16" },
  "POOR":   { code: "POOR",   cn: "贫困者",   intro: "我穷，但我很专。",                   trait: "专注 · 降噪 · 激光型",      color: "#14532D", accent: "#16A34A" },
  "MONK":   { code: "MONK",   cn: "僧人",     intro: "没有那种世俗的欲望。",               trait: "清修 · 独立 · 须弥山",      color: "#EA580C", accent: "#FB923C" },
  "IMSB":   { code: "IMSB",   cn: "傻者",     intro: "认真的么？我真的是傻逼么？",         trait: "内耗 · 冲动 · 戏精大脑",    color: "#A16207", accent: "#CA8A04" },
  "SOLO":   { code: "SOLO",   cn: "孤儿",     intro: "我哭了，我怎么会是孤儿？",           trait: "独立 · 设界 · 刺猬软心",    color: "#334155", accent: "#64748B" },
  "FUCK":   { code: "FUCK",   cn: "草者",     intro: "操！这是什么人格？",                 trait: "野生 · 本能 · 生命力",      color: "#15803D", accent: "#22C55E" },
  "DEAD":   { code: "DEAD",   cn: "死者",     intro: "我，还活着吗？",                     trait: "通关 · 无欲 · 沉默抗议",    color: "#1E293B", accent: "#475569" },
  "IMFW":   { code: "IMFW",   cn: "废物",     intro: "我真的...是废物吗？",                trait: "敏感 · 依恋 · 玻璃心",      color: "#6D28D9", accent: "#A78BFA" },
  "HHHH":   { code: "HHHH",   cn: "傻乐者",   intro: "哈哈哈哈哈哈。",                     trait: "奇葩 · 乐天 · 笑出眼泪",    color: "#F59E0B", accent: "#FCD34D" },
  "DRUNK":  { code: "DRUNK",  cn: "酒鬼",     intro: "烈酒烧喉，不得不醉。",               trait: "醉态 · 诗人 · 宿醉现场",    color: "#B91C1C", accent: "#DC2626" },
};

/** Map SBTI type → filename stem in public/id/pixel/ (handles "!" stripping). */
const FILE_STEM: Record<SBTIType, string> = {
  "CTRL": "CTRL", "ATM-er": "ATM-er", "Dior-s": "Dior-s", "BOSS": "BOSS",
  "THAN-K": "THAN-K", "OH-NO": "OH-NO", "GOGO": "GOGO", "SEXY": "SEXY",
  "LOVE-R": "LOVE-R", "MUM": "MUM", "FAKE": "FAKE", "OJBK": "OJBK",
  "MALO": "MALO", "JOKE-R": "JOKE-R", "WOC!": "WOC", "THIN-K": "THIN-K",
  "SHIT": "SHIT", "ZZZZ": "ZZZZ", "POOR": "POOR", "MONK": "MONK",
  "IMSB": "IMSB", "SOLO": "SOLO", "FUCK": "FUCK", "DEAD": "DEAD",
  "IMFW": "IMFW", "HHHH": "HHHH", "DRUNK": "DRUNK",
};

/** Hash a codename to one of 27 SBTI types. */
export function nameToSBTI(name: string): SBTIType {
  if (!name || name.trim().length === 0) return "THIN-K";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const types = Object.keys(SBTI_INFO) as SBTIType[];
  return types[Math.abs(hash) % types.length];
}

// ── Component ──────────────────────────────────────────────

interface SBTIAvatarProps {
  sbtiType: SBTIType;
  /** Pixel size multiplier, mirroring MBTIAvatar/PixelAvatar. Each "cell" = size px. */
  size?: number;
  showLabel?: boolean;
}

export default function SBTIAvatar({ sbtiType, size = 6, showLabel = false }: SBTIAvatarProps) {
  const info = SBTI_INFO[sbtiType];
  const stem = FILE_STEM[sbtiType];
  // Source is 256×256; rendered as a square matching MBTI/Pixel footprint.
  const box = size * 14;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
      <img
        src={`/id/pixel/${stem}.png`}
        alt={`SBTI ${info.code} ${info.cn}`}
        width={box}
        height={box}
        style={{
          width: `${box}px`,
          height: `${box}px`,
          imageRendering: "auto",
          display: "block",
        }}
      />
      {showLabel && (
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "0.75rem", fontWeight: 800,
            color: info.color, letterSpacing: "0.05em",
            fontFamily: "monospace",
          }}>
            {info.code}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 600 }}>
            {info.cn}
          </div>
        </div>
      )}
    </div>
  );
}
