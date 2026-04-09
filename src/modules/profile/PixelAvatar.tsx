// src/modules/profile/PixelAvatar.tsx
// SVG pixel art character, 8 states driven by san + energy

type AvatarState = "full" | "tired" | "anxious" | "broken" | "inspired" | "focused" | "creative" | "reading";

interface Props {
  san: number;    // 0-10
  energy: number; // 0-100
  size?: number;  // pixel size of each cell, default 4
}

function getState(san: number, energy: number): AvatarState {
  if (san >= 8 && energy >= 80) return "inspired";   // peak state
  if (san >= 7 && energy >= 70) return "full";        // happy
  if (san >= 6 && energy >= 55) return "focused";     // deep work
  if (san >= 5 && energy >= 45) return "creative";    // making stuff
  if (san >= 5 && energy >= 30) return "reading";     // quiet mode
  if (san >= 7 && energy < 40)  return "tired";       // happy but exhausted
  if (san < 5  && energy >= 60) return "anxious";     // stressed
  if (san < 4  && energy < 30)  return "broken";      // need help
  if (san >= 5 && energy >= 50) return "full";
  return "tired";
}

// Skin tone
const S = "#FBBF24";
// Eye color
const E = "#1E293B";
// Shirt color
const B = "#6366F1";
// Leg/shoe color
const L = "#1E293B";

// Each pixel: [x, y, color] — (0,0) = top-left
const PIXELS: Record<AvatarState, [number, number, string][]> = {
  // ── Inspired: floating with sparkles ✨ ──────────────────────
  inspired: [
    // sparkles above
    [3,-3,"#FCD34D"],[8,-3,"#FCD34D"],
    [5,-2,"#FCD34D"],[6,-2,"#FCD34D"],
    [2,-1,"#FCD34D"],[4,-1,"#FCD34D"],[7,-1,"#FCD34D"],[9,-1,"#FCD34D"],
    // head
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    [3,2,S],[4,2,"#FBBF24"],[5,2,E],[6,2,S],[7,2,E],[8,2,S], // bright eyes (stars)
    [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
    [4,4,S],[5,4,"#F472B6"],[6,4,"#F472B6"],[7,4,S], // smile
    // body upright
    [4,5,B],[5,5,B],[6,5,B],[7,5,B],
    [3,6,B],[4,6,B],[5,6,B],[6,6,B],[7,6,B],[8,6,B],
    [4,7,B],[5,7,B],[6,7,B],[7,7,B],
    // legs (floating, slight gap)
    [4,9,L],[5,9,L],[6,9,L],[7,9,L],
  ],

  // ── Full: happy with star ⭐ ─────────────────────────────────
  full: [
    // head
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    [3,2,S],[4,2,E],[5,2,S],[6,2,S],[7,2,E],[8,2,S],
    [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
    [4,4,S],[5,4,E],[6,4,E],[7,4,S],
    // body upright
    [4,5,B],[5,5,B],[6,5,B],[7,5,B],
    [3,6,B],[4,6,B],[5,6,B],[6,6,B],[7,6,B],[8,6,B],
    [4,7,B],[5,7,B],[6,7,B],[7,7,B],
    // legs
    [4,8,L],[5,8,L],[6,8,L],[7,8,L],
    [4,9,L],[7,9,L],
    // star above head
    [5,-2,"#FCD34D"],[6,-2,"#FCD34D"],
    [4,-1,"#FCD34D"],[5,-1,"#FCD34D"],[6,-1,"#FCD34D"],[7,-1,"#FCD34D"],
  ],

  // ── Focused: headphones on, concentrating 🎧 ─────────────────
  focused: [
    // headphones
    [2,0,"#64748B"],[3,0,"#64748B"],[8,0,"#64748B"],[9,0,"#64748B"],
    [2,1,"#64748B"],[9,1,"#64748B"],
    // head
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    [3,2,S],[4,2,E],[5,2,S],[6,2,S],[7,2,E],[8,2,S],
    [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
    [4,4,S],[5,4,S],[6,4,S],[7,4,S], // neutral mouth
    // body
    [4,5,B],[5,5,B],[6,5,B],[7,5,B],
    [3,6,B],[4,6,B],[5,6,B],[6,6,B],[7,6,B],[8,6,B],
    [4,7,B],[5,7,B],[6,7,B],[7,7,B],
    // legs
    [4,8,L],[5,8,L],[6,8,L],[7,8,L],
    [4,9,L],[7,9,L],
    // focus indicator - small dots
    [10,2,"#818CF8"],[10,3,"#818CF8"],[10,4,"#818CF8"],
  ],

  // ── Creative: playing guitar 🎸 ──────────────────────────────
  creative: [
    // head
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    [3,2,S],[4,2,E],[5,2,S],[6,2,S],[7,2,E],[8,2,S],
    [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
    [4,4,S],[5,4,"#F472B6"],[6,4,"#F472B6"],[7,4,S], // smile
    // body with guitar
    [4,5,B],[5,5,B],[6,5,B],[7,5,B],
    [3,6,B],[4,6,B],[5,6,B],[6,6,B],[7,6,B],[8,6,B],
    [4,7,B],[5,7,B],[6,7,B],[7,7,B],
    // guitar body (amber/brown)
    [9,4,"#D97706"],[10,4,"#D97706"],
    [9,5,"#D97706"],[10,5,"#D97706"],[11,5,"#D97706"],
    [9,6,"#D97706"],[10,6,"#92400E"],[11,6,"#D97706"],
    [9,7,"#D97706"],[10,7,"#D97706"],[11,7,"#D97706"],
    // guitar neck
    [9,3,"#92400E"],[9,2,"#92400E"],[9,1,"#92400E"],
    // legs
    [4,8,L],[5,8,L],[6,8,L],[7,8,L],
    [4,9,L],[7,9,L],
    // music notes
    [11,1,"#A78BFA"],[12,0,"#A78BFA"],
    [12,3,"#C084FC"],
  ],

  // ── Reading: with book, glasses 📖 ───────────────────────────
  reading: [
    // head with glasses
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    // glasses frame
    [3,2,"#64748B"],[4,2,E],[5,2,"#64748B"],[6,2,"#64748B"],[7,2,E],[8,2,"#64748B"],
    [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
    [4,4,S],[5,4,S],[6,4,S],[7,4,S],
    // body leaning forward
    [4,5,B],[5,5,B],[6,5,B],[7,5,B],
    [3,6,B],[4,6,B],[5,6,B],[6,6,B],[7,6,B],[8,6,B],
    [4,7,B],[5,7,B],[6,7,B],[7,7,B],
    // legs
    [4,8,L],[5,8,L],[6,8,L],[7,8,L],
    [4,9,L],[7,9,L],
    // book in front
    [9,5,"#F59E0B"],[10,5,"#F59E0B"],[11,5,"#F59E0B"],
    [9,6,"#FCD34D"],[10,6,"#FCD34D"],[11,6,"#FCD34D"],
    [9,7,"#F59E0B"],[10,7,"#F59E0B"],[11,7,"#F59E0B"],
  ],

  // ── Tired: sleepy with zzz 💤 ────────────────────────────────
  tired: [
    // head with half-closed eyes
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    [3,2,S],[4,2,S],[5,2,E],[6,2,E],[7,2,S],[8,2,S],
    [3,3,S],[4,3,S],[5,3,S],[6,3,S],[7,3,S],[8,3,S],
    [4,4,S],[5,4,S],[6,4,S],[7,4,S],
    // body slumped
    [4,5,B],[5,5,B],[6,5,B],[7,5,B],
    [3,6,B],[4,6,B],[5,6,B],[6,6,B],[7,6,B],[8,6,B],
    [4,7,B],[5,7,B],[6,7,B],[7,7,B],
    [4,8,L],[5,8,L],[6,8,L],[7,8,L],
    [4,9,L],[7,9,L],
    // zzz above head
    [7,-2,"#94A3B8"],[8,-2,"#94A3B8"],
    [6,-1,"#94A3B8"],[9,-1,"#94A3B8"],
  ],

  // ── Anxious: worried with ? ❓ ───────────────────────────────
  anxious: [
    // head with worried eyes
    [4,0,S],[5,0,S],[6,0,S],[7,0,S],
    [3,1,S],[4,1,S],[5,1,S],[6,1,S],[7,1,S],[8,1,S],
    [3,2,S],[4,2,E],[5,2,S],[6,2,S],[7,2,E],[8,2,S],
    [3,3,S],[5,3,E],[6,3,E],[8,3,S],
    [4,4,S],[5,4,S],[6,4,S],[7,4,S],
    // body
    [4,5,B],[5,5,B],[6,5,B],[7,5,B],
    [3,6,B],[4,6,B],[5,6,B],[6,6,B],[7,6,B],[8,6,B],
    [4,7,B],[5,7,B],[6,7,B],[7,7,B],
    [4,8,L],[5,8,L],[6,8,L],[7,8,L],
    [4,9,L],[7,9,L],
    // ? above head
    [5,-2,"#F59E0B"],[6,-2,"#F59E0B"],
    [6,-1,"#F59E0B"],
    [5,0,"#F59E0B"],
  ],

  // ── Broken: collapsed on floor ❌ ────────────────────────────
  broken: [
    // character collapsed on floor
    [4,6,S],[5,6,S],[6,6,S],[7,6,S],
    [3,7,S],[4,7,S],[5,7,S],[6,7,S],[7,7,S],[8,7,S],
    [3,8,S],[4,8,"#F59E0B"],[5,8,S],[6,8,S],[7,8,"#F59E0B"],[8,8,S],
    [3,9,B],[4,9,B],[5,9,B],[6,9,B],[7,9,B],[8,9,B],
    [2,10,L],[3,10,L],[4,10,L],
    [7,10,L],[8,10,L],[9,10,L],
  ],
};

// State labels for accessibility and tooltips
const STATE_LABELS: Record<AvatarState, string> = {
  inspired: "灵感迸发",
  full: "精力充沛",
  focused: "专注工作",
  creative: "创作模式",
  reading: "安静阅读",
  tired: "有点疲惫",
  anxious: "焦虑不安",
  broken: "需要休息",
};

export default function PixelAvatar({ san, energy, size = 4 }: Props) {
  const state = getState(san, energy);
  const pixels = PIXELS[state];

  const xs = pixels.map(([x]) => x);
  const ys = pixels.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const W = (maxX - minX + 1) * size;
  const H = (maxY - minY + 1) * size;

  const shouldAnimate = state === "anxious" || state === "inspired";

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={shouldAnimate ? (state === "anxious" ? "animate-wiggle" : "animate-float") : ""}
      style={{ imageRendering: "pixelated" }}
      aria-label={`像素小人：${STATE_LABELS[state]}`}
    >
      <title>{STATE_LABELS[state]}</title>
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
  );
}

export { getState, STATE_LABELS };
export type { AvatarState };
