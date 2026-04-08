import { Sparkles, Target, Gamepad2, ArrowRight } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}

function FeatureCard({ icon, title, description, gradient }: FeatureCardProps) {
  return (
    <div
      style={{
        padding: "28px",
        borderRadius: "var(--radius-xl)",
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        boxShadow: "var(--shadow-soft)",
        transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-8px) scale(1.02)";
        e.currentTarget.style.boxShadow = "var(--shadow-medium)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow = "var(--shadow-soft)";
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "var(--radius-lg)",
          background: gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "20px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}
      >
        {icon}
      </div>
      <h3
        style={{
          fontSize: "1.125rem",
          fontWeight: 700,
          color: "var(--text-main)",
          marginBottom: "10px",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: "0.9375rem",
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </div>
  );
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  const features = [
    {
      icon: <Target style={{ width: "28px", height: "28px", color: "white" }} />,
      title: "自动追踪",
      description: "7个智能爬虫模块自动追踪 ArXiv、小红书、B站等平台，不错过任何有价值的信息",
      gradient: "linear-gradient(135deg, #BCA4E3, #9D7BDB)",
    },
    {
      icon: <Sparkles style={{ width: "28px", height: "28px", color: "white" }} />,
      title: "智能筛选",
      description: "AI 自动评分和摘要，根据你的偏好智能排序，让重要内容优先呈现",
      gradient: "linear-gradient(135deg, #A8E6CF, #7DD3C0)",
    },
    {
      icon: <Gamepad2 style={{ width: "28px", height: "28px", color: "white" }} />,
      title: "游戏化",
      description: "六维能力雷达、像素小人、技能节点，让研究工作充满成就感和乐趣",
      gradient: "linear-gradient(135deg, #FFB7B2, #E89B96)",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100%",
        padding: "48px 32px",
        textAlign: "center",
      }}
    >
      {/* Logo Animation */}
      <div
        style={{
          width: "100px",
          height: "100px",
          borderRadius: "var(--radius-xl)",
          background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "32px",
          boxShadow: "0 12px 48px rgba(188, 164, 227, 0.4)",
          animation: "float 3s ease-in-out infinite",
        }}
      >
        <Sparkles style={{ width: "48px", height: "48px", color: "white" }} />
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: "'M PLUS Rounded 1c', sans-serif",
          fontSize: "clamp(2rem, 5vw, 2.75rem)",
          fontWeight: 800,
          background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          marginBottom: "12px",
        }}
      >
        欢迎使用 ABO
      </h1>

      <p
        style={{
          fontSize: "clamp(1rem, 2vw, 1.125rem)",
          color: "var(--text-secondary)",
          marginBottom: "48px",
          maxWidth: "480px",
          lineHeight: 1.7,
        }}
      >
        你的本地个人情报引擎 + 研究者成长系统
        <br />
        让研究自动化，让成长可视化
      </p>

      {/* Feature Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "24px",
          width: "100%",
          maxWidth: "900px",
          marginBottom: "48px",
        }}
      >
        {features.map((feature, index) => (
          <div
            key={feature.title}
            style={{
              animation: `fadeInUp 0.6s ease ${index * 0.15}s both`,
            }}
          >
            <FeatureCard {...feature} />
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <button
        onClick={onNext}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "16px 40px",
          borderRadius: "var(--radius-full)",
          background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
          border: "none",
          color: "white",
          fontSize: "1.0625rem",
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: "0 8px 32px rgba(188, 164, 227, 0.4)",
          animation: "fadeInUp 0.6s ease 0.5s both",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-3px) scale(1.05)";
          e.currentTarget.style.boxShadow = "0 12px 48px rgba(188, 164, 227, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0) scale(1)";
          e.currentTarget.style.boxShadow = "0 8px 32px rgba(188, 164, 227, 0.4)";
        }}
      >
        开始配置
        <ArrowRight style={{ width: "22px", height: "22px" }} />
      </button>

      {/* Animation Styles */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
