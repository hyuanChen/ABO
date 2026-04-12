// src/modules/profile/AvatarDisplay.tsx
// Resolves which avatar (SBTI / MBTI / Pixel) to show based on store settings:
//   - sbtiHoverEnabled off (default) → always SBTI, no hover switching
//   - sbtiHoverEnabled on → hover switches SBTI → MBTI (or PixelAvatar if
//     pixelAvatarOnHover is also on)
// SBTI type comes from the manual sbtiOverride if set, otherwise from the
// codename hash.

import { useState } from "react";
import { useStore } from "../../core/store";
import SBTIAvatar, { nameToSBTI, SBTI_INFO, SBTIType } from "./SBTIAvatar";
import MBTIAvatar, { nameToMBTI, MBTI_INFO } from "./MBTIAvatar";
import PixelAvatar from "./PixelAvatar";

interface Props {
  codename: string;
  san: number;
  energy: number;
  size?: number;
  /** Also render a small text label (code + cn/label) under the avatar */
  showLabel?: boolean;
}

export default function AvatarDisplay({ codename, san, energy, size = 6, showLabel = false }: Props) {
  const [hovering, setHovering] = useState(false);
  const pixelAvatarOnHover = useStore((s) => s.pixelAvatarOnHover);
  const sbtiHoverEnabled = useStore((s) => s.sbtiHoverEnabled);
  const sbtiOverride = useStore((s) => s.sbtiOverride);

  const sbti: SBTIType = (sbtiOverride as SBTIType | null) ?? nameToSBTI(codename);
  const mbti = nameToMBTI(codename);

  // Hover only switches modes if the user opted in via settings.
  const mode: "sbti" | "mbti" | "pixel" =
    !sbtiHoverEnabled || !hovering
      ? "sbti"
      : pixelAvatarOnHover
      ? "pixel"
      : "mbti";

  const boxW = size * 15;
  const boxH = size * 15;

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      tabIndex={sbtiHoverEnabled ? 0 : -1}
      role={sbtiHoverEnabled ? "button" : undefined}
      aria-label={sbtiHoverEnabled ? "角色头像 — 悬停切换风格" : `SBTI 角色头像 — ${SBTI_INFO[sbti].code}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: showLabel ? "6px" : 0,
        cursor: sbtiHoverEnabled ? "pointer" : "default",
        outline: "none",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: sbtiHoverEnabled && hovering ? "scale(1.05)" : "scale(1)",
      }}
    >
      {/* Fixed-size crossfade stack */}
      <div style={{ position: "relative", width: boxW, height: boxH }}>
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: mode === "sbti" ? 1 : 0,
            transition: "opacity 0.28s ease",
            pointerEvents: mode === "sbti" ? "auto" : "none",
          }}
        >
          <SBTIAvatar sbtiType={sbti} size={size} />
        </div>
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: mode === "mbti" ? 1 : 0,
            transition: "opacity 0.28s ease",
            pointerEvents: mode === "mbti" ? "auto" : "none",
          }}
        >
          <MBTIAvatar mbtiType={mbti} size={size} />
        </div>
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: mode === "pixel" ? 1 : 0,
            transition: "opacity 0.28s ease",
            pointerEvents: mode === "pixel" ? "auto" : "none",
          }}
        >
          <PixelAvatar san={san} energy={energy} size={size} />
        </div>
      </div>

      {showLabel && (() => {
        if (mode === "pixel") {
          return (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 700, fontFamily: "monospace" }}>
                STATE
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 600 }}>
                san {san} · {energy}%
              </div>
            </div>
          );
        }
        const isSbti = mode === "sbti";
        const color = isSbti ? SBTI_INFO[sbti].color : MBTI_INFO[mbti].color;
        const code = isSbti ? SBTI_INFO[sbti].code : mbti;
        const name = isSbti ? SBTI_INFO[sbti].cn : MBTI_INFO[mbti].label;
        return (
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: "0.75rem", fontWeight: 800,
              color, letterSpacing: "0.05em",
              fontFamily: "monospace",
            }}>
              {code}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 600 }}>
              {name}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
