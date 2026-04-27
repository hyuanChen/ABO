import {
  ArrowRight,
  BookHeart,
  Bot,
  Compass,
  Database,
  Inbox,
  Sparkles,
} from "lucide-react";
import { corePromises, sidebarSections } from "../onboardingContent";

interface WelcomeStepProps {
  onNext: () => void;
}

const firstRunChecklist = [
  "选好情报库和文献库",
  "一键连接小红书 / B 站 Cookie",
  "设置论文、AI 和每日推送偏好",
  "看懂左侧导航该从哪里开始",
];

const heroStats = [
  { label: "主入口", value: "8", hint: "角色主页到手记" },
  { label: "主动工具", value: "5", hint: "先试跑再定时" },
  { label: "配置时间", value: "10s", hint: "基础跑通" },
];

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  const primaryNavigation = sidebarSections[0].items.slice(0, 4);

  return (
    <div
      className="onboarding-welcome-grid"
      style={{
        minHeight: "100%",
        padding: "clamp(32px, 5vw, 64px)",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.08fr) minmax(320px, 0.92fr)",
        gap: "clamp(28px, 5vw, 56px)",
        alignItems: "center",
        maxWidth: "1180px",
        margin: "0 auto",
      }}
    >
      <section>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "999px",
            background: "rgba(188, 164, 227, 0.14)",
            color: "var(--color-primary-dark)",
            fontSize: "0.8125rem",
            fontWeight: 800,
            marginBottom: "22px",
          }}
        >
          <Compass style={{ width: "16px", height: "16px" }} />
          第一次启动 · 研究工作台初始化
        </div>

        <h1
          style={{
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "clamp(2.2rem, 5.4vw, 4.6rem)",
            fontWeight: 900,
            lineHeight: 1.02,
            letterSpacing: "-0.04em",
            color: "var(--text-main)",
            marginBottom: "22px",
          }}
        >
          把散落的收藏、论文，整理成自己的大脑操作台。
        </h1>

        <p
          style={{
            fontSize: "clamp(1rem, 1.7vw, 1.125rem)",
            color: "var(--text-secondary)",
            lineHeight: 1.8,
            maxWidth: "680px",
            marginBottom: "30px",
          }}
        >
          ABO 不是单个爬虫按钮。它的主线是“注意力 {"->"} 知识 {"->"} 入库 {"->"} Wiki / 助手推进 {"->"} 手记复盘”。
          这份向导会先帮你完成必要配置，再用真实侧边栏教你每天该怎么用。
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "12px",
            marginBottom: "30px",
            maxWidth: "620px",
          }}
        >
          {heroStats.map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: "16px",
                borderRadius: "18px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-light)",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <div style={{ fontSize: "1.55rem", fontWeight: 900, color: "var(--text-main)", lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "6px", fontWeight: 700 }}>
                {stat.label} · {stat.hint}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onNext}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            padding: "15px 28px",
            borderRadius: "999px",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            border: "none",
            color: "white",
            fontSize: "1rem",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 14px 34px rgba(188, 164, 227, 0.38)",
            transition: "transform 180ms ease, box-shadow 180ms ease",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.transform = "translateY(-2px)";
            event.currentTarget.style.boxShadow = "0 18px 42px rgba(188, 164, 227, 0.46)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.transform = "translateY(0)";
            event.currentTarget.style.boxShadow = "0 14px 34px rgba(188, 164, 227, 0.38)";
          }}
        >
          开始 10 秒钟配置
          <ArrowRight style={{ width: "20px", height: "20px" }} />
        </button>
      </section>

      <aside
        style={{
          position: "relative",
          padding: "22px",
          borderRadius: "32px",
          background: "linear-gradient(145deg, var(--bg-card), rgba(188, 164, 227, 0.08))",
          border: "1px solid rgba(188, 164, 227, 0.24)",
          boxShadow: "0 28px 80px rgba(72, 62, 110, 0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "180px",
            height: "180px",
            borderRadius: "50%",
            right: "-56px",
            top: "-70px",
            background: "radial-gradient(circle, rgba(168, 230, 207, 0.48), transparent 64%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px", position: "relative" }}>
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              boxShadow: "0 10px 26px rgba(188, 164, 227, 0.34)",
            }}
          >
            <Sparkles style={{ width: "24px", height: "24px" }} />
          </div>
          <div>
            <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "var(--text-main)" }}>你会得到什么</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>按这个流程走完即可开始使用</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", position: "relative" }}>
          {corePromises.map((promise, index) => {
            const icons = [
              <Inbox key="inbox" style={{ width: "18px", height: "18px" }} />,
              <Database key="db" style={{ width: "18px", height: "18px" }} />,
              <Bot key="bot" style={{ width: "18px", height: "18px" }} />,
            ];
            return (
              <div
                key={promise.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "38px 1fr",
                  gap: "12px",
                  padding: "14px",
                  borderRadius: "18px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "13px",
                    background: index === 1 ? "rgba(168, 230, 207, 0.24)" : index === 2 ? "rgba(255, 183, 178, 0.22)" : "rgba(188, 164, 227, 0.2)",
                    color: index === 1 ? "#4f9b80" : index === 2 ? "#c56f69" : "var(--color-primary-dark)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {icons[index]}
                </div>
                <div>
                  <div style={{ fontSize: "0.93rem", fontWeight: 850, color: "var(--text-main)", marginBottom: "4px" }}>
                    {promise.title}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {promise.summary}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "16px",
            padding: "14px",
            borderRadius: "20px",
            background: "var(--bg-hover)",
            border: "1px dashed var(--border-light)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <BookHeart style={{ width: "16px", height: "16px", color: "var(--color-primary)" }} />
            <span style={{ fontSize: "0.82rem", fontWeight: 850, color: "var(--text-main)" }}>向导会覆盖</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
            {firstRunChecklist.map((item) => (
              <div
                key={item}
                style={{
                  fontSize: "0.76rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.45,
                  padding: "8px 10px",
                  borderRadius: "12px",
                  background: "var(--bg-card)",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "0.76rem", fontWeight: 850, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
            先认识这几个入口
          </div>
          {primaryNavigation.map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--text-main)" }}>{item.label}</span>
              <span style={{ flex: 1, fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.summary}
              </span>
            </div>
          ))}
        </div>
      </aside>

      <style>{`
        @media (max-width: 920px) {
          .onboarding-welcome-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
