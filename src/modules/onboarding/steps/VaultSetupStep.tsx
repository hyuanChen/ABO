import { useState, useCallback } from "react";
import { FolderOpen, Check, AlertCircle, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../../../core/api";

interface VaultSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onVaultPathSet: (path: string) => void;
}

type ValidationStatus = "idle" | "validating" | "success" | "error";

interface ValidationResult {
  status: ValidationStatus;
  message: string;
}

export default function VaultSetupStep({ onNext, onBack, onVaultPathSet }: VaultSetupStepProps) {
  const [vaultPath, setVaultPath] = useState<string>("");
  const [validation, setValidation] = useState<ValidationResult>({
    status: "idle",
    message: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const validateVaultPath = useCallback(async (path: string): Promise<boolean> => {
    if (!path) return false;

    setValidation({ status: "validating", message: "正在验证路径..." });

    try {
      const result = await api.post<{ valid: boolean; message?: string }>("/api/config/validate-vault", {
        path,
      });

      if (result.valid) {
        setValidation({ status: "success", message: "路径验证成功" });
        return true;
      } else {
        setValidation({
          status: "error",
          message: result.message || "路径无效，请选择一个有效的文件夹",
        });
        return false;
      }
    } catch (error) {
      setValidation({
        status: "error",
        message: "验证失败，请检查后端服务是否运行",
      });
      return false;
    }
  }, []);

  const selectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择 Obsidian Vault 文件夹",
      });

      if (selected && typeof selected === "string") {
        setVaultPath(selected);
        await validateVaultPath(selected);
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
      setValidation({
        status: "error",
        message: "无法打开文件夹选择器",
      });
    }
  };

  const handleContinue = async () => {
    if (!vaultPath) return;

    // Re-validate before saving
    const isValid = await validateVaultPath(vaultPath);
    if (!isValid) return;

    setIsSaving(true);
    try {
      await api.post("/api/config", { vault_path: vaultPath });
      onVaultPathSet(vaultPath);
      onNext();
    } catch (error) {
      setValidation({
        status: "error",
        message: "保存配置失败，请重试",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = () => {
    switch (validation.status) {
      case "validating":
        return <Loader2 style={{ width: "20px", height: "20px", animation: "spin 1s linear infinite" }} />;
      case "success":
        return <Check style={{ width: "20px", height: "20px", color: "#22c55e" }} />;
      case "error":
        return <AlertCircle style={{ width: "20px", height: "20px", color: "#ef4444" }} />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (validation.status) {
      case "validating":
        return "var(--color-primary)";
      case "success":
        return "#22c55e";
      case "error":
        return "#ef4444";
      default:
        return "var(--text-muted)";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        padding: "48px 32px",
        maxWidth: "640px",
        margin: "0 auto",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: "80px",
          height: "80px",
          borderRadius: "var(--radius-xl)",
          background: "linear-gradient(135deg, #A8D8FF, #7BC8F0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "24px",
          boxShadow: "0 8px 32px rgba(123, 200, 240, 0.4)",
        }}
      >
        <FolderOpen style={{ width: "40px", height: "40px", color: "white" }} />
      </div>

      {/* Title */}
      <h2
        style={{
          fontFamily: "'M PLUS Rounded 1c', sans-serif",
          fontSize: "1.75rem",
          fontWeight: 700,
          color: "var(--text-main)",
          marginBottom: "12px",
          textAlign: "center",
        }}
      >
        配置 Vault 路径
      </h2>

      <p
        style={{
          fontSize: "1rem",
          color: "var(--text-secondary)",
          marginBottom: "32px",
          textAlign: "center",
          lineHeight: 1.6,
        }}
      >
        选择你的 Obsidian Vault 根目录，ABO 将在这里保存所有生成的内容
        <br />
        <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
          默认为 ~/Documents/Obsidian Vault
        </span>
      </p>

      {/* Folder Selection */}
      <div style={{ width: "100%", marginBottom: "24px" }}>
        <button
          onClick={selectFolder}
          style={{
            width: "100%",
            padding: "20px 24px",
            borderRadius: "var(--radius-lg)",
            background: "var(--bg-card)",
            border: `2px dashed ${vaultPath ? "var(--color-primary)" : "var(--border-light)"}`,
            cursor: "pointer",
            transition: "all 0.3s ease",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-primary)";
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (!vaultPath) {
              e.currentTarget.style.borderColor = "var(--border-light)";
            }
            e.currentTarget.style.background = "var(--bg-card)";
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "var(--radius-md)",
              background: vaultPath
                ? "linear-gradient(135deg, #A8E6CF, #7DD3C0)"
                : "var(--bg-hover)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {vaultPath ? (
              <Check style={{ width: "24px", height: "24px", color: "white" }} />
            ) : (
              <FolderOpen style={{ width: "24px", height: "24px", color: "var(--text-muted)" }} />
            )}
          </div>
          <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
            <p
              style={{
                fontSize: "0.9375rem",
                fontWeight: 600,
                color: vaultPath ? "var(--text-main)" : "var(--text-muted)",
                marginBottom: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {vaultPath || "点击选择文件夹"}
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              {vaultPath ? "已选择 Vault 路径" : "选择 Obsidian Vault 根目录"}
            </p>
          </div>
        </button>

        {/* Validation Status */}
        {validation.status !== "idle" && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px 18px",
              borderRadius: "var(--radius-md)",
              background:
                validation.status === "error"
                  ? "rgba(239, 68, 68, 0.08)"
                  : validation.status === "success"
                  ? "rgba(34, 197, 94, 0.08)"
                  : "var(--bg-hover)",
              border: `1px solid ${
                validation.status === "error"
                  ? "rgba(239, 68, 68, 0.2)"
                  : validation.status === "success"
                  ? "rgba(34, 197, 94, 0.2)"
                  : "var(--border-light)"
              }`,
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {getStatusIcon()}
            <span style={{ fontSize: "0.9375rem", color: getStatusColor() }}>
              {validation.message}
            </span>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          width: "100%",
          justifyContent: "center",
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 28px",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-hover)",
            border: "1px solid var(--border-light)",
            color: "var(--text-secondary)",
            fontSize: "0.9375rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-card)";
            e.currentTarget.style.borderColor = "var(--color-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.borderColor = "var(--border-light)";
          }}
        >
          <ArrowLeft style={{ width: "18px", height: "18px" }} />
          返回
        </button>

        <button
          onClick={handleContinue}
          disabled={!vaultPath || validation.status === "error" || isSaving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 32px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            border: "none",
            color: "white",
            fontSize: "0.9375rem",
            fontWeight: 700,
            cursor: !vaultPath || validation.status === "error" || isSaving ? "not-allowed" : "pointer",
            opacity: !vaultPath || validation.status === "error" || isSaving ? 0.6 : 1,
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: "0 4px 16px rgba(188, 164, 227, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (vaultPath && validation.status !== "error" && !isSaving) {
              e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
              e.currentTarget.style.boxShadow = "0 6px 24px rgba(188, 164, 227, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(188, 164, 227, 0.3)";
          }}
        >
          {isSaving ? (
            <>
              <Loader2 style={{ width: "18px", height: "18px", animation: "spin 1s linear infinite" }} />
              保存中...
            </>
          ) : (
            <>
              继续
              <ArrowRight style={{ width: "18px", height: "18px" }} />
            </>
          )}
        </button>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
