// src/modules/profile/MBTIAvatar.tsx
// 16 MBTI personality types → unique pixel art avatars
// Name-based hash determines which MBTI type to assign

export type MBTIType =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

export const MBTI_INFO: Record<MBTIType, { label: string; trait: string; color: string; accent: string }> = {
  INTJ: { label: "策略家", trait: "独立 · 远见 · 果断", color: "#6366F1", accent: "#818CF8" },
  INTP: { label: "逻辑学家", trait: "好奇 · 分析 · 创新", color: "#8B5CF6", accent: "#A78BFA" },
  ENTJ: { label: "指挥官", trait: "果敢 · 领导 · 高效", color: "#DC2626", accent: "#F87171" },
  ENTP: { label: "辩论家", trait: "机敏 · 创意 · 挑战", color: "#F59E0B", accent: "#FBBF24" },
  INFJ: { label: "提倡者", trait: "理想 · 洞察 · 共情", color: "#7C3AED", accent: "#A78BFA" },
  INFP: { label: "调停者", trait: "治愈 · 想象 · 真诚", color: "#EC4899", accent: "#F472B6" },
  ENFJ: { label: "主人公", trait: "感召 · 利他 · 热忱", color: "#059669", accent: "#34D399" },
  ENFP: { label: "竞选者", trait: "热情 · 创造 · 自由", color: "#F97316", accent: "#FB923C" },
  ISTJ: { label: "物流师", trait: "可靠 · 严谨 · 务实", color: "#475569", accent: "#64748B" },
  ISFJ: { label: "守卫者", trait: "温暖 · 忠诚 · 细心", color: "#0891B2", accent: "#22D3EE" },
  ESTJ: { label: "总经理", trait: "组织 · 坚定 · 传统", color: "#B91C1C", accent: "#EF4444" },
  ESFJ: { label: "执政官", trait: "关怀 · 合作 · 社交", color: "#DB2777", accent: "#F472B6" },
  ISTP: { label: "鉴赏家", trait: "灵活 · 冷静 · 实操", color: "#0F766E", accent: "#14B8A6" },
  ISFP: { label: "探险家", trait: "敏感 · 艺术 · 和谐", color: "#D946EF", accent: "#E879F9" },
  ESTP: { label: "企业家", trait: "大胆 · 直接 · 行动", color: "#EA580C", accent: "#FB923C" },
  ESFP: { label: "表演者", trait: "活力 · 即兴 · 快乐", color: "#E11D48", accent: "#FB7185" },
};

/** Hash a name string to get one of 16 MBTI types */
export function nameToMBTI(name: string): MBTIType {
  if (!name || name.trim().length === 0) return "INTP"; // default for researchers
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const types = Object.keys(MBTI_INFO) as MBTIType[];
  return types[Math.abs(hash) % 16];
}

// ── Pixel Art Data ──────────────────────────────────────────────

// Each MBTI type has unique: hair style, accessory, shirt color, special item
// Grid is ~12x12, [x, y, color]

type Pixel = [number, number, string];

// Shared body builder
function body(shirtColor: string, legColor: string = "#1E293B"): Pixel[] {
  return [
    [4,5,shirtColor],[5,5,shirtColor],[6,5,shirtColor],[7,5,shirtColor],
    [3,6,shirtColor],[4,6,shirtColor],[5,6,shirtColor],[6,6,shirtColor],[7,6,shirtColor],[8,6,shirtColor],
    [4,7,shirtColor],[5,7,shirtColor],[6,7,shirtColor],[7,7,shirtColor],
    [4,8,legColor],[5,8,legColor],[6,8,legColor],[7,8,legColor],
    [4,9,legColor],[7,9,legColor],
  ];
}

// Shared head (skin #FBBF24, eyes vary)
function head(eyeColor: string = "#1E293B", mouthPixels: Pixel[] = []): Pixel[] {
  const S = "#FBBF24";
  return [
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    [3,2,S],[4,2,eyeColor],[5,2,S],[6,2,S],[7,2,eyeColor],[8,2,S],
    [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
    ...mouthPixels,
  ];
}

function smile(): Pixel[] {
  return [[4,4,"#FBBF24"],[5,4,"#F472B6"],[6,4,"#F472B6"],[7,4,"#FBBF24"]];
}
function neutral(): Pixel[] {
  return [[4,4,"#FBBF24"],[5,4,"#FBBF24"],[6,4,"#FBBF24"],[7,4,"#FBBF24"]];
}
function thinking(): Pixel[] {
  return [[4,4,"#FBBF24"],[5,4,"#1E293B"],[6,4,"#FBBF24"],[7,4,"#FBBF24"]];
}

const MBTI_PIXELS: Record<MBTIType, Pixel[]> = {
  // INTJ - Strategist: glasses + chess piece above
  INTJ: [
    ...head("#1E293B", neutral()),
    [3,2,"#64748B"],[5,2,"#64748B"],[6,2,"#64748B"],[8,2,"#64748B"], // glasses
    ...body("#4338CA"),
    [5,-2,"#818CF8"],[6,-2,"#818CF8"],[5,-1,"#818CF8"],[6,-1,"#818CF8"], // crown/chess
    [4,-1,"#818CF8"],[7,-1,"#818CF8"],
  ],
  // INTP - Logician: messy hair + lightbulb
  INTP: [
    [3,-1,"#92400E"],[5,-1,"#92400E"],[7,-1,"#92400E"],[8,-1,"#92400E"], // messy hair
    ...head("#1E293B", thinking()),
    ...body("#7C3AED"),
    [9,1,"#FCD34D"],[10,0,"#FCD34D"],[10,1,"#FCD34D"],[10,2,"#FCD34D"],[9,2,"#FCD34D"], // bulb
  ],
  // ENTJ - Commander: military cap + star
  ENTJ: [
    [3,-1,"#475569"],[4,-1,"#475569"],[5,-1,"#475569"],[6,-1,"#475569"],[7,-1,"#475569"],[8,-1,"#475569"],
    [4,-2,"#475569"],[5,-2,"#475569"],[6,-2,"#475569"],[7,-2,"#475569"],
    [5,-2,"#FCD34D"], // star on cap
    ...head("#1E293B", neutral()),
    ...body("#B91C1C"),
  ],
  // ENTP - Debater: spiky hair + speech bubble
  ENTP: [
    [3,-1,"#D97706"],[4,-2,"#D97706"],[5,-1,"#D97706"],[7,-1,"#D97706"],[8,-2,"#D97706"], // spiky
    ...head("#1E293B", smile()),
    ...body("#D97706"),
    [10,1,"#E5E7EB"],[11,1,"#E5E7EB"],[12,1,"#E5E7EB"], // speech bubble
    [10,2,"#E5E7EB"],[11,2,"#1E293B"],[12,2,"#E5E7EB"],
    [10,3,"#E5E7EB"],[11,3,"#E5E7EB"],[12,3,"#E5E7EB"],
    [10,4,"#E5E7EB"],
  ],
  // INFJ - Advocate: halo + crystal
  INFJ: [
    [4,-2,"#C084FC"],[5,-2,"#C084FC"],[6,-2,"#C084FC"],[7,-2,"#C084FC"], // halo
    [3,-1,"#C084FC"],[8,-1,"#C084FC"],
    ...head("#1E293B", neutral()),
    ...body("#6D28D9"),
    [10,4,"#A78BFA"],[10,5,"#C084FC"],[10,6,"#A78BFA"], // crystal
  ],
  // INFP - Mediator: flower crown + heart
  INFP: [
    [3,-1,"#F472B6"],[5,-1,"#FBBF24"],[7,-1,"#F472B6"],[8,-1,"#FBBF24"], // flower crown
    [4,-2,"#A8E6CF"],[6,-2,"#F9A8D4"],
    ...head("#1E293B", smile()),
    ...body("#DB2777"),
    [10,2,"#F472B6"],[11,1,"#F472B6"],[11,3,"#F472B6"],[12,2,"#F472B6"], // heart
  ],
  // ENFJ - Protagonist: cape + raised arm
  ENFJ: [
    ...head("#1E293B", smile()),
    [4,5,"#059669"],[5,5,"#059669"],[6,5,"#059669"],[7,5,"#059669"],
    [3,6,"#059669"],[4,6,"#059669"],[5,6,"#059669"],[6,6,"#059669"],[7,6,"#059669"],[8,6,"#059669"],
    [9,5,"#059669"],[9,4,"#059669"],[9,3,"#FBBF24"], // raised hand
    [4,7,"#059669"],[5,7,"#059669"],[6,7,"#059669"],[7,7,"#059669"],
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    [2,5,"#34D399"],[2,6,"#34D399"],[2,7,"#34D399"],[1,6,"#34D399"], // cape
  ],
  // ENFP - Campaigner: rainbow hair + star wand
  ENFP: [
    [3,-1,"#F472B6"],[4,-1,"#FBBF24"],[5,-1,"#34D399"],[6,-1,"#60A5FA"],[7,-1,"#A78BFA"],[8,-1,"#F472B6"],
    ...head("#1E293B", smile()),
    ...body("#EA580C"),
    [10,3,"#FCD34D"],[9,4,"#92400E"],[9,5,"#92400E"],[9,6,"#92400E"], // wand
    [9,2,"#FCD34D"],[11,2,"#FCD34D"],[10,1,"#FCD34D"],[10,3,"#FCD34D"], // star tip
  ],
  // ISTJ - Logistician: tie + clipboard
  ISTJ: [
    ...head("#1E293B", neutral()),
    [5,4,"#FBBF24"],[6,4,"#FBBF24"],[7,4,"#FBBF24"],[4,4,"#FBBF24"],
    [5,5,"#EF4444"],[6,5,"#EF4444"], // tie
    [4,5,"#475569"],[7,5,"#475569"],
    [3,6,"#475569"],[4,6,"#475569"],[5,6,"#475569"],[6,6,"#475569"],[7,6,"#475569"],[8,6,"#475569"],
    [4,7,"#475569"],[5,7,"#475569"],[6,7,"#475569"],[7,7,"#475569"],
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    [10,4,"#D4A574"],[11,4,"#D4A574"],[10,5,"#FEFCE8"],[11,5,"#FEFCE8"],[10,6,"#FEFCE8"],[11,6,"#FEFCE8"], // clipboard
  ],
  // ISFJ - Defender: nurse cap + shield
  ISFJ: [
    [4,-1,"#E0F2FE"],[5,-1,"#E0F2FE"],[6,-1,"#E0F2FE"],[7,-1,"#E0F2FE"],
    [5,-1,"#EF4444"], // red cross
    ...head("#1E293B", smile()),
    ...body("#0891B2"),
    [10,5,"#60A5FA"],[11,5,"#60A5FA"],[10,6,"#60A5FA"],[11,6,"#3B82F6"],[10,7,"#60A5FA"], // shield
  ],
  // ESTJ - Executive: top hat + gavel
  ESTJ: [
    [4,-3,"#1E293B"],[5,-3,"#1E293B"],[6,-3,"#1E293B"],[7,-3,"#1E293B"],
    [4,-2,"#1E293B"],[5,-2,"#1E293B"],[6,-2,"#1E293B"],[7,-2,"#1E293B"],
    [3,-1,"#1E293B"],[4,-1,"#1E293B"],[5,-1,"#1E293B"],[6,-1,"#1E293B"],[7,-1,"#1E293B"],[8,-1,"#1E293B"],
    ...head("#1E293B", neutral()),
    ...body("#991B1B"),
  ],
  // ESFJ - Consul: apron + cooking spoon
  ESFJ: [
    ...head("#1E293B", smile()),
    [4,5,"#F9A8D4"],[5,5,"#F9A8D4"],[6,5,"#F9A8D4"],[7,5,"#F9A8D4"],
    [3,6,"#F9A8D4"],[4,6,"#FECDD3"],[5,6,"#FECDD3"],[6,6,"#FECDD3"],[7,6,"#FECDD3"],[8,6,"#F9A8D4"],
    [4,7,"#F9A8D4"],[5,7,"#F9A8D4"],[6,7,"#F9A8D4"],[7,7,"#F9A8D4"],
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    [9,3,"#D4A574"],[9,4,"#D4A574"],[9,5,"#D4A574"],[10,3,"#D4A574"],[11,3,"#D4A574"], // spoon
  ],
  // ISTP - Virtuoso: wrench + goggles
  ISTP: [
    [3,1,"#F59E0B"],[8,1,"#F59E0B"], // goggles strap
    [3,2,"#0EA5E9"],[4,2,"#1E293B"],[5,2,"#0EA5E9"],[6,2,"#0EA5E9"],[7,2,"#1E293B"],[8,2,"#0EA5E9"], // goggles
    [4,0,"#FBBF24"],[5,0,"#FBBF24"],[6,0,"#FBBF24"],[7,0,"#FBBF24"],
    [3,1,"#FBBF24"],[4,1,"#FBBF24"],[5,1,"#FBBF24"],[6,1,"#FBBF24"],[7,1,"#FBBF24"],[8,1,"#FBBF24"],
    [3,3,"#FBBF24"],[4,3,"#FBBF24"],[5,3,"#FBBF24"],[6,3,"#FBBF24"],[7,3,"#FBBF24"],[8,3,"#FBBF24"],
    [4,4,"#FBBF24"],[5,4,"#FBBF24"],[6,4,"#FBBF24"],[7,4,"#FBBF24"],
    ...body("#0F766E"),
    [10,5,"#94A3B8"],[10,6,"#94A3B8"],[10,7,"#94A3B8"],[11,6,"#94A3B8"], // wrench
  ],
  // ISFP - Adventurer: beret + paint palette
  ISFP: [
    [3,-1,"#A855F7"],[4,-1,"#A855F7"],[5,-1,"#A855F7"],[6,-1,"#A855F7"],[7,-1,"#A855F7"],[8,-1,"#A855F7"],
    [2,-1,"#A855F7"],[3,-2,"#A855F7"],[4,-2,"#A855F7"],
    ...head("#1E293B", smile()),
    ...body("#9333EA"),
    [10,5,"#D4A574"],[11,5,"#D4A574"],[12,5,"#D4A574"], // palette
    [10,6,"#D4A574"],[11,6,"#D4A574"],[12,6,"#D4A574"],
    [10,5,"#EF4444"],[11,5,"#3B82F6"],[12,5,"#FCD34D"], // paint dots
  ],
  // ESTP - Entrepreneur: sunglasses + lightning bolt
  ESTP: [
    ...(() => {
      const S = "#FBBF24";
      return [
        [4,0,S],[5,0,S],[6,0,S],[7,0,S],
        [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
        [3,2,"#1E293B"],[4,2,"#1E293B"],[5,2,"#1E293B"],[6,2,"#1E293B"],[7,2,"#1E293B"],[8,2,"#1E293B"], // sunglasses
        [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
        [4,4,S],[5,4,"#F472B6"],[6,4,"#F472B6"],[7,4,S],
      ] as Pixel[];
    })(),
    ...body("#C2410C"),
    [10,0,"#FCD34D"],[9,1,"#FCD34D"],[10,2,"#FCD34D"],[9,3,"#FCD34D"], // lightning
  ],
  // ESFP - Entertainer: party hat + music notes
  ESFP: [
    [5,-3,"#F472B6"],[6,-3,"#F472B6"],
    [4,-2,"#FBBF24"],[5,-2,"#34D399"],[6,-2,"#60A5FA"],[7,-2,"#F472B6"],
    [3,-1,"#F472B6"],[4,-1,"#FBBF24"],[5,-1,"#34D399"],[6,-1,"#60A5FA"],[7,-1,"#F472B6"],[8,-1,"#FBBF24"],
    ...head("#1E293B", smile()),
    ...body("#E11D48"),
    [10,1,"#A78BFA"],[11,0,"#A78BFA"],[11,3,"#F472B6"],[12,2,"#F472B6"], // music notes
  ],
};

// ── Component ──────────────────────────────────────────────────

interface MBTIAvatarProps {
  mbtiType: MBTIType;
  size?: number;
  showLabel?: boolean;
}

export default function MBTIAvatar({ mbtiType, size = 4, showLabel = false }: MBTIAvatarProps) {
  const pixels = MBTI_PIXELS[mbtiType];
  const info = MBTI_INFO[mbtiType];

  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const W = (maxX - minX + 1) * size;
  const H = (maxY - minY + 1) * size;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ imageRendering: "pixelated" }}
        aria-label={`MBTI 像素小人：${mbtiType} ${info.label}`}
      >
        <title>{`${mbtiType} — ${info.label}: ${info.trait}`}</title>
        {pixels.map(([x, y, color], i) => (
          <rect
            key={i}
            x={(x - minX) * size}
            y={(y - minY) * size}
            width={size}
            height={size}
            fill={color}
          />
        ))}
      </svg>
      {showLabel && (
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "0.75rem", fontWeight: 800,
            color: info.color, letterSpacing: "0.05em",
            fontFamily: "monospace",
          }}>
            {mbtiType}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 600 }}>
            {info.label}
          </div>
        </div>
      )}
    </div>
  );
}
