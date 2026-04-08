import { useState } from "react";
import {
  Sparkles,
  Check,
  ArrowRight,
  MousePointer,
  User,
  Star,
  MessageSquare,
  Zap,
} from "lucide-react";

interface TutorialStepProps {
  onComplete: () => void;
}

interface TutorialItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  highlight: string;
  tips: string[];
}

export default function TutorialStep({ onComplete }: TutorialStepProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const tutorials: TutorialItem[] = [
    {
      id: "feed",
      title: "情报 Feed",
      description: "Feed 是 ABO 的核心，展示所有模块抓取的内容",
      icon: <MousePointer style={{ width: "24px", height: "24px", color: "white" }} />,
      highlight: "卡片操作",
      tips: [
        "点击卡片标题可跳转到原文",
        "点击 ☆ 收藏卡片，方便日后回顾",
        "点击 👁 标记已读，保持 Feed 整洁",
        "使用快捷键 J/K 快速浏览卡片",
      ],
    },
    {
      id: "profile",
      title: "角色主页",
      description: "查看你的研究者成长数据和六维能力雷达",
      icon: <User style={{ width: "24px", height: "24px", color: "white" }} />,
      highlight: "成长系统",
      tips: [
        "六维雷达图展示你的研究能力分布",
        "完成任务获得 XP，提升等级",
        "像素小人会随着你的成长而变化",
        "每日签到获得能量和 SAN 值",
      ],
    },
    {
      id: "modules",
      title: "模块管理",
      description: "管理所有爬虫模块，配置关键词和 Cookie",
      icon: <Zap style={{ width: "24px", height: "24px", color: "white" }} />,
      highlight: "运行模块",
      tips: [
        "手动运行模块获取最新内容",
        "在设置中配置各模块的关键词",
        "需要 Cookie 的模块会有特殊标记",
        "模块运行状态会实时显示",
      ],
    },
    {
      id: "interaction",
      title: "互动反馈",
      description: "通过反馈让 ABO 更了解你的偏好",
      icon: <MessageSquare style={{ width: "24px", height: "24px", color: "white" }} />,
      highlight: "偏好学习",
      tips: [
        "标记感兴趣的内容，提升相关推荐",
        "标记不感兴趣的内容，减少类似推送",
        "ABO 会学习你的阅读习惯",
        "关键词偏好会自动调整排序",
      ],
    },
  ];

  const currentTutorial = tutorials[currentStep];

  const handleNext = () => {
    // Mark current step as completed
    if (!completedSteps.includes(currentTutorial.id)) {
      setCompletedSteps([...completedSteps, currentTutorial.id]);
    }

    if (currentStep < tutorials.length - 1) {
      // Go to next step
      setCurrentStep(currentStep + 1);
    } else {
      // Last step - complete the tutorial
      onComplete();
    }
  };

  const handleStepClick = (index: number) => {
    // Allow clicking to any step, including the last one
    setCurrentStep(index);
  };

  const handleSkip = () => {
    onComplete();
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
        maxWidth: "680px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "var(--radius-xl)",
            background: "linear-gradient(135deg, #FFB7B2, #E89B96)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: "0 8px 32px rgba(255, 183, 178, 0.4)",
          }}
        >
          <Sparkles style={{ width: "36px", height: "36px", color: "white" }} />
        </div>

        <h2
          style={{
            fontFamily: "'M PLUS Rounded 1c', sans-serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--text-main)",
            marginBottom: "8px",
          }}
        >
          功能引导
        </h2>

        <p
          style={{
            fontSize: "0.9375rem",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          了解 ABO 的核心功能，开始你的研究之旅
        </p>
      </div>

      {/* Progress Dots */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "32px" }}>
        {tutorials.map((tutorial, index) => (
          <button
            key={tutorial.id}
            onClick={() => handleStepClick(index)}
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background:
                index === currentStep
                  ? "var(--color-primary)"
                  : completedSteps.includes(tutorial.id)
                  ? "#22c55e"
                  : "var(--border-light)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.3s ease",
              transform: index === currentStep ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* Tutorial Card */}
      <div
        style={{
          width: "100%",
          padding: "32px",
          borderRadius: "var(--radius-xl)",
          background: "var(--bg-card)",
          border: "1px solid var(--border-light)",
          boxShadow: "var(--shadow-soft)",
          marginBottom: "32px",
          animation: "fadeIn 0.4s ease",
        }}
      >
        {/* Step Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {currentTutorial.icon}
          </div>
          <div>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--color-primary)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              步骤 {currentStep + 1} / {tutorials.length}
            </span>
            <h3
              style={{
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "var(--text-main)",
                marginTop: "4px",
              }}
            >
              {currentTutorial.title}
            </h3>
          </div>
        </div>

        {/* Description */}
        <p
          style={{
            fontSize: "1rem",
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            marginBottom: "24px",
            padding: "16px 20px",
            background: "var(--bg-hover)",
            borderRadius: "var(--radius-lg)",
            borderLeft: "4px solid var(--color-primary)",
          }}
        >
          {currentTutorial.description}
        </p>

        {/* Highlight Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 16px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, rgba(188, 164, 227, 0.15), rgba(255, 183, 178, 0.1))",
            marginBottom: "20px",
          }}
        >
          <Star style={{ width: "16px", height: "16px", color: "var(--color-primary)" }} />
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--color-primary)",
            }}
          >
            重点：{currentTutorial.highlight}
          </span>
        </div>

        {/* Tips List */}
        <div>
          <h4
            style={{
              fontSize: "0.9375rem",
              fontWeight: 600,
              color: "var(--text-main)",
              marginBottom: "14px",
            }}
          >
            使用技巧
          </h4>
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {currentTutorial.tips.map((tip, index) => (
              <li
                key={index}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--color-primary)",
                    marginTop: "8px",
                    flexShrink: 0,
                  }}
                />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          width: "100%",
          justifyContent: "center",
        }}
      >
        <button
          onClick={handleSkip}
          style={{
            padding: "14px 28px",
            borderRadius: "var(--radius-full)",
            background: "transparent",
            border: "1px solid var(--border-light)",
            color: "var(--text-muted)",
            fontSize: "0.9375rem",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.borderColor = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border-light)";
          }}
        >
          跳过引导
        </button>

        <button
          onClick={handleNext}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 36px",
            borderRadius: "var(--radius-full)",
            background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))",
            border: "none",
            color: "white",
            fontSize: "0.9375rem",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            boxShadow: "0 4px 16px rgba(188, 164, 227, 0.3)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(188, 164, 227, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(188, 164, 227, 0.3)";
          }}
        >
          {currentStep === tutorials.length - 1 ? (
            <>
              <Check style={{ width: "20px", height: "20px" }} />
              完成
            </>
          ) : (
            <>
              下一步
              <ArrowRight style={{ width: "20px", height: "20px" }} />
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
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
