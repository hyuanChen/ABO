interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}

export default function ToggleSwitch({
  enabled,
  onChange,
  size = "md",
  disabled = false,
}: ToggleSwitchProps) {
  const isSm = size === "sm";
  const width = isSm ? 36 : 44;
  const height = isSm ? 20 : 24;
  const knob = isSm ? 16 : 20;
  const offset = isSm ? 14 : 22;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!enabled);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        width,
        height,
        borderRadius: 9999,
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        background: enabled ? "var(--color-success, #10B981)" : "var(--text-muted, #9CA3AF)",
        opacity: disabled ? 0.6 : 1,
        position: "relative",
        transition: "background 0.25s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: (height - knob) / 2,
          left: enabled ? offset : (height - knob) / 2,
          width: knob,
          height: knob,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.25s ease",
        }}
      />
    </button>
  );
}
