import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface AppErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
  onReset?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "页面渲染失败",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AppErrorBoundary caught an error", error, errorInfo);
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: "" });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "var(--bg-app)",
        }}
      >
        <div
          style={{
            width: "min(560px, 100%)",
            padding: "28px",
            borderRadius: "24px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            boxShadow: "var(--shadow-medium)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255, 183, 178, 0.18)",
              color: "#D48984",
            }}
          >
            <AlertTriangle style={{ width: "24px", height: "24px" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text-main)" }}>这个页面加载失败了</h2>
            <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>
              已拦截本次渲染异常，应用不会再直接白屏。你可以先回到概览页，或者重新打开当前页面。
            </p>
            {this.state.message && (
              <code
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  wordBreak: "break-word",
                }}
              >
                {this.state.message}
              </code>
            )}
          </div>

          <button
            onClick={this.handleReset}
            style={{
              width: "fit-content",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "999px",
              border: "none",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <RotateCcw style={{ width: "16px", height: "16px" }} />
            重新加载当前页面
          </button>
        </div>
      </div>
    );
  }
}
