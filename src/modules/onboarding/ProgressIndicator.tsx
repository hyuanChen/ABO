interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

interface Step {
  id: number;
  title: string;
}

const steps: Step[] = [
  { id: 0, title: "欢迎" },
  { id: 1, title: "Vault配置" },
  { id: 2, title: "快速配置" },
  { id: 3, title: "功能引导" },
];

export default function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div
      style={{
        padding: "24px 32px",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border-light)",
      }}
    >
      {/* Progress Bar */}
      <div
        style={{
          height: "6px",
          borderRadius: "var(--radius-full)",
          background: "var(--bg-hover)",
          overflow: "hidden",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))",
            transition: "width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: "0 2px 8px rgba(188, 164, 227, 0.4)",
          }}
        />
      </div>

      {/* Step Indicators */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isPending = index > currentStep;

          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                opacity: isPending ? 0.5 : 1,
                transition: "opacity 0.3s ease",
              }}
            >
              {/* Step Number */}
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  background: isCompleted
                    ? "#22c55e"
                    : isCurrent
                    ? "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))"
                    : "var(--bg-hover)",
                  color: isCompleted || isCurrent ? "white" : "var(--text-muted)",
                  boxShadow: isCurrent
                    ? "0 4px 12px rgba(188, 164, 227, 0.4)"
                    : "none",
                  transform: isCurrent ? "scale(1.1)" : "scale(1)",
                }}
              >
                {isCompleted ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>

              {/* Step Title */}
              <span
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? "var(--text-main)" : "var(--text-secondary)",
                  transition: "all 0.3s ease",
                }}
              >
                {step.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
