import type { CSSProperties } from "react";
import brandMarkSrc from "../assets/branding/abo-mark.png";

type BrandMarkProps = {
  size?: CSSProperties["width"];
  isDark?: boolean;
  showcase?: boolean;
};

export default function BrandMark({
  size = 46,
  isDark = false,
  showcase = false,
}: BrandMarkProps) {
  const plateBackground = isDark
    ? "linear-gradient(160deg, rgba(43, 36, 58, 0.96), rgba(31, 26, 43, 0.98))"
    : "linear-gradient(160deg, rgba(255, 251, 245, 0.98), rgba(244, 238, 255, 0.98))";
  const plateBorder = isDark
    ? "1px solid rgba(199, 177, 241, 0.22)"
    : "1px solid rgba(225, 205, 255, 0.62)";
  const plateShadow = showcase
    ? (isDark
      ? "0 12px 30px rgba(7, 6, 14, 0.48), 0 0 34px rgba(157, 123, 219, 0.16)"
      : "0 14px 28px rgba(133, 114, 166, 0.16), 0 0 26px rgba(255, 183, 178, 0.18)")
    : (isDark
      ? "0 10px 26px rgba(7, 6, 14, 0.42)"
      : "0 12px 26px rgba(133, 114, 166, 0.12)");

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--radius-md)",
        background: plateBackground,
        border: plateBorder,
        boxShadow: plateShadow,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...(showcase ? { animation: "breathe 4s ease-in-out infinite" } : {}),
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "10%",
          borderRadius: "calc(var(--radius-md) - 8px)",
          background: isDark
            ? "radial-gradient(circle at 32% 28%, rgba(255, 204, 168, 0.16), transparent 62%), radial-gradient(circle at 72% 74%, rgba(157, 123, 219, 0.18), transparent 58%)"
            : "radial-gradient(circle at 32% 28%, rgba(255, 211, 176, 0.26), transparent 62%), radial-gradient(circle at 72% 74%, rgba(188, 164, 227, 0.22), transparent 58%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isDark
            ? "linear-gradient(140deg, rgba(255,255,255,0.18) 8%, rgba(255,255,255,0.05) 40%, transparent 64%)"
            : "linear-gradient(140deg, rgba(255,255,255,0.64) 8%, rgba(255,255,255,0.18) 40%, transparent 64%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: "8% -12% 54% -18%",
          background: "linear-gradient(160deg, rgba(255,255,255,0.44), transparent 62%)",
          transform: "rotate(-8deg)",
          filter: "blur(4px)",
          opacity: isDark ? 0.24 : 0.72,
        }}
      />

      <img
        src={brandMarkSrc}
        alt=""
        aria-hidden
        style={{
          width: "76%",
          height: "76%",
          objectFit: "contain",
          position: "relative",
          zIndex: 1,
          transform: "translateY(1px)",
          filter: isDark
            ? "drop-shadow(0 10px 18px rgba(12, 9, 20, 0.32))"
            : "drop-shadow(0 8px 14px rgba(157, 123, 219, 0.18))",
        }}
      />
    </div>
  );
}
