import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** 全屏页面容器 - 确保100%填满 */
export function PageContainer({ children, className = "" }: PageContainerProps) {
  return (
    <div
      className={`w-full h-full overflow-hidden flex flex-col ${className}`}
      style={{
        background: "var(--bg-app)",
      }}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/** 统一页面标题栏 */
export function PageHeader({ title, subtitle, icon: Icon, actions, className = "" }: PageHeaderProps) {
  return (
    <header
      className={`shrink-0 w-full ${className}`}
      style={{
        padding: "clamp(16px, 2.5vw, 24px) clamp(20px, 3vw, 32px)",
        background: "var(--bg-panel)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "clamp(12px, 2vw, 16px)" }}>
        {Icon && (
          <div
            style={{
              width: "clamp(44px, 5vw, 52px)",
              height: "clamp(44px, 5vw, 52px)",
              borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(188, 164, 227, 0.3)",
              flexShrink: 0,
            }}
          >
            <Icon style={{ width: "24px", height: "24px", color: "white" }} />
          </div>
        )}
        <div>
          <h1
            style={{
              fontFamily: "'M PLUS Rounded 1c', sans-serif",
              fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)",
              fontWeight: 700,
              color: "var(--text-main)",
              lineHeight: 1.3,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: "clamp(0.8125rem, 1.2vw, 0.9375rem)",
                color: "var(--text-muted)",
                marginTop: "4px",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div style={{ display: "flex", gap: "12px", flexShrink: 0 }}>{actions}</div>}
    </header>
  );
}

interface PageContentProps {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
  centered?: boolean;
}

/** 统一内容区域 - 可滚动 */
export function PageContent({ children, className = "", maxWidth = "1400px", centered = true }: PageContentProps) {
  return (
    <div
      className={`flex-1 overflow-y-auto overflow-x-hidden ${className}`}
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: centered ? maxWidth : "100%",
          margin: centered ? "0 auto" : undefined,
          padding: "clamp(16px, 2.5vw, 32px)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  noPadding?: boolean;
  style?: React.CSSProperties;
}

/** 统一卡片组件 */
export function Card({ children, className = "", title, icon, actions, noPadding = false, style }: CardProps) {
  return (
    <div
      className={`${className}`}
      style={{
        background: "var(--bg-card)",
        backdropFilter: "blur(16px)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-light)",
        boxShadow: "var(--shadow-soft)",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "clamp(16px, 2vw, 20px) clamp(20px, 2.5vw, 24px)",
            borderBottom: "1px solid var(--border-light)",
            background: "var(--bg-hover)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {icon}
            {title && (
              <h2
                style={{
                  fontFamily: "'M PLUS Rounded 1c', sans-serif",
                  fontSize: "clamp(0.9375rem, 1.5vw, 1.125rem)",
                  fontWeight: 700,
                  color: "var(--text-main)",
                }}
              >
                {title}
              </h2>
            )}
          </div>
          {actions}
        </div>
      )}
      <div style={{ padding: noPadding ? 0 : "clamp(16px, 2vw, 24px)" }}>{children}</div>
    </div>
  );
}

interface GridProps {
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
  gap?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}

/** 统一网格布局 */
export function Grid({ children, className = "", columns = 2, gap = "md", style }: GridProps) {
  const gapSize = gap === "sm" ? "12px" : gap === "md" ? "20px" : "28px";

  return (
    <div
      className={`${className}`}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: gapSize,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 两列布局 - 左窄右宽 */
export function TwoColumnLayout({
  left,
  right,
  leftWidth = "320px",
  gap = "24px",
}: {
  left: ReactNode;
  right: ReactNode;
  leftWidth?: string;
  gap?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${leftWidth} 1fr`,
        gap,
        height: "100%",
      }}
    >
      <div style={{ overflow: "auto", height: "100%" }}>{left}</div>
      <div style={{ overflow: "auto", height: "100%" }}>{right}</div>
    </div>
  );
}

/** 全屏居中的空状态 */
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "20px",
        padding: "40px",
        color: "var(--text-muted)",
      }}
    >
      {Icon && (
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(255, 183, 178, 0.1))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border-light)",
          }}
        >
          <Icon style={{ width: "36px", height: "36px", opacity: 0.5 }} />
        </div>
      )}
      <div style={{ textAlign: "center" }}>
        <h3
          style={{
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            marginBottom: "8px",
          }}
        >
          {title}
        </h3>
        {description && <p style={{ fontSize: "0.9375rem", opacity: 0.8 }}>{description}</p>}
      </div>
    </div>
  );
}

/** 加载状态 */
export function LoadingState({ message = "加载中..." }: { message?: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        color: "var(--text-muted)",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          border: "3px solid var(--border-light)",
          borderTopColor: "var(--color-primary)",
          animation: "spin 1s linear infinite",
        }}
      />
      <p style={{ fontSize: "0.9375rem" }}>{message}</p>
    </div>
  );
}
