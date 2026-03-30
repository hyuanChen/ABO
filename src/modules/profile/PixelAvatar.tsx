// src/modules/profile/PixelAvatar.tsx
// SVG pixel art character, 4 states driven by san + energy

type AvatarState = "full" | "tired" | "anxious" | "broken";

interface Props {
  san: number;    // 0-10
  energy: number; // 0-100
  size?: number;  // pixel size of each cell, default 4
}

function getState(san: number, energy: number): AvatarState {
  if (san >= 7 && energy >= 70) return "full";
  if (san >= 7 && energy < 40)  return "tired";
  if (san < 5  && energy >= 60) return "anxious";
  if (san < 5  && energy < 40)  return "broken";
  if (san >= 5 && energy >= 50) return "full";
  return "tired";
}

// Each pixel: [x, y, color] — (0,0) = top-left
const PIXELS: Record<AvatarState, [number, number, string][]> = {
  full: [
    // head
    [4,0,"#FBBF24"],[5,0,"#FBBF24"],[6,0,"#FBBF24"],[7,0,"#FBBF24"],
    [3,1,"#FBBF24"],[4,1,"#FBBF24"],[5,1,"#FBBF24"],[6,1,"#FBBF24"],[7,1,"#FBBF24"],[8,1,"#FBBF24"],
    [3,2,"#FBBF24"],[4,2,"#1E293B"],[5,2,"#FBBF24"],[6,2,"#FBBF24"],[7,2,"#1E293B"],[8,2,"#FBBF24"],
    [3,3,"#FBBF24"],[4,3,"#FBBF24"],[5,3,"#FBBF24"],[6,3,"#FBBF24"],[7,3,"#FBBF24"],[8,3,"#FBBF24"],
    [4,4,"#FBBF24"],[5,4,"#1E293B"],[6,4,"#1E293B"],[7,4,"#FBBF24"],
    // body upright
    [4,5,"#6366F1"],[5,5,"#6366F1"],[6,5,"#6366F1"],[7,5,"#6366F1"],
    [3,6,"#6366F1"],[4,6,"#6366F1"],[5,6,"#6366F1"],[6,6,"#6366F1"],[7,6,"#6366F1"],[8,6,"#6366F1"],
    [4,7,"#6366F1"],[5,7,"#6366F1"],[6,7,"#6366F1"],[7,7,"#6366F1"],
    // legs
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    // star above head
    [5,-2,"#FCD34D"],[6,-2,"#FCD34D"],
    [4,-1,"#FCD34D"],[5,-1,"#FCD34D"],[6,-1,"#FCD34D"],[7,-1,"#FCD34D"],
  ],
  tired: [
    // head with half-closed eyes
    [4,0,"#FBBF24"],[5,0,"#FBBF24"],[6,0,"#FBBF24"],[7,0,"#FBBF24"],
    [3,1,"#FBBF24"],[4,1,"#FBBF24"],[5,1,"#FBBF24"],[6,1,"#FBBF24"],[7,1,"#FBBF24"],[8,1,"#FBBF24"],
    [3,2,"#FBBF24"],[4,2,"#FBBF24"],[5,2,"#1E293B"],[6,2,"#1E293B"],[7,2,"#FBBF24"],[8,2,"#FBBF24"],
    [3,3,"#FBBF24"],[4,3,"#FBBF24"],[5,3,"#FBBF24"],[6,3,"#FBBF24"],[7,3,"#FBBF24"],[8,3,"#FBBF24"],
    [4,4,"#FBBF24"],[5,4,"#FBBF24"],[6,4,"#FBBF24"],[7,4,"#FBBF24"],
    // body slumped
    [4,5,"#6366F1"],[5,5,"#6366F1"],[6,5,"#6366F1"],[7,5,"#6366F1"],
    [3,6,"#6366F1"],[4,6,"#6366F1"],[5,6,"#6366F1"],[6,6,"#6366F1"],[7,6,"#6366F1"],[8,6,"#6366F1"],
    [4,7,"#6366F1"],[5,7,"#6366F1"],[6,7,"#6366F1"],[7,7,"#6366F1"],
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    // zzz above head
    [7,-2,"#94A3B8"],[8,-2,"#94A3B8"],
    [6,-1,"#94A3B8"],[9,-1,"#94A3B8"],
  ],
  anxious: [
    // head with worried eyes
    [4,0,"#FBBF24"],[5,0,"#FBBF24"],[6,0,"#FBBF24"],[7,0,"#FBBF24"],
    [3,1,"#FBBF24"],[4,1,"#FBBF24"],[5,1,"#FBBF24"],[6,1,"#FBBF24"],[7,1,"#FBBF24"],[8,1,"#FBBF24"],
    [3,2,"#FBBF24"],[4,2,"#1E293B"],[5,2,"#FBBF24"],[6,2,"#FBBF24"],[7,2,"#1E293B"],[8,2,"#FBBF24"],
    [3,3,"#FBBF24"],[5,3,"#1E293B"],[6,3,"#1E293B"],[8,3,"#FBBF24"],
    [4,4,"#FBBF24"],[5,4,"#FBBF24"],[6,4,"#FBBF24"],[7,4,"#FBBF24"],
    // body
    [4,5,"#6366F1"],[5,5,"#6366F1"],[6,5,"#6366F1"],[7,5,"#6366F1"],
    [3,6,"#6366F1"],[4,6,"#6366F1"],[5,6,"#6366F1"],[6,6,"#6366F1"],[7,6,"#6366F1"],[8,6,"#6366F1"],
    [4,7,"#6366F1"],[5,7,"#6366F1"],[6,7,"#6366F1"],[7,7,"#6366F1"],
    [4,8,"#1E293B"],[5,8,"#1E293B"],[6,8,"#1E293B"],[7,8,"#1E293B"],
    [4,9,"#1E293B"],[7,9,"#1E293B"],
    // ? above head
    [5,-2,"#F59E0B"],[6,-2,"#F59E0B"],
    [6,-1,"#F59E0B"],
    [5,0,"#F59E0B"],
  ],
  broken: [
    // character collapsed on floor
    [4,6,"#FBBF24"],[5,6,"#FBBF24"],[6,6,"#FBBF24"],[7,6,"#FBBF24"],
    [3,7,"#FBBF24"],[4,7,"#FBBF24"],[5,7,"#FBBF24"],[6,7,"#FBBF24"],[7,7,"#FBBF24"],[8,7,"#FBBF24"],
    [3,8,"#FBBF24"],[4,8,"#F59E0B"],[5,8,"#FBBF24"],[6,8,"#FBBF24"],[7,8,"#F59E0B"],[8,8,"#FBBF24"],
    [3,9,"#6366F1"],[4,9,"#6366F1"],[5,9,"#6366F1"],[6,9,"#6366F1"],[7,9,"#6366F1"],[8,9,"#6366F1"],
    [2,10,"#1E293B"],[3,10,"#1E293B"],[4,10,"#1E293B"],
    [7,10,"#1E293B"],[8,10,"#1E293B"],[9,10,"#1E293B"],
  ],
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

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={state === "anxious" ? "animate-wiggle" : ""}
      style={{ imageRendering: "pixelated" }}
      aria-label={`像素小人：${state}`}
    >
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
