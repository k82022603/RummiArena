import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 타일 색상 토큰
        "tile-red": "#E74C3C",
        "tile-blue": "#3498DB",
        "tile-yellow": "#F1C40F",
        "tile-black": "#2C3E50",
        // 보드 배경
        "board-bg": "#1A3328",
        "board-border": "#2A5A3A",
        // 앱 배경
        "app-bg": "#0D1117",
        "panel-bg": "#161B22",
        "card-bg": "#1C2128",
        // 경계선
        border: "#30363D",
        "border-active": "#F3C623",
        // 텍스트
        "text-primary": "#F0F6FC",
        "text-secondary": "#8B949E",
        // 상태 색상
        success: "#3FB950",
        warning: "#F3C623",
        danger: "#F85149",
        "color-ai": "#9B59B6",
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "-apple-system",
          "Malgun Gothic",
          "sans-serif",
        ],
        mono: ["D2Coding", "Consolas", "monospace"],
      },
      fontSize: {
        "tile-xs": "10px",
        "tile-sm": "12px",
        "tile-base": "14px",
        "tile-lg": "16px",
        "tile-xl": "20px",
        "tile-2xl": "24px",
        "tile-3xl": "30px",
      },
      spacing: {
        // 타일 크기 (랙)
        "tile-w": "42px",
        "tile-h": "58px",
        // 타일 크기 (테이블)
        "tile-table-w": "34px",
        "tile-table-h": "46px",
        // 타일 크기 (미니)
        "tile-mini-w": "10px",
        "tile-mini-h": "16px",
        // 타일 크기 (4분할 뷰)
        "tile-quad-w": "28px",
        "tile-quad-h": "38px",
      },
      animation: {
        "ai-pulse": "aiPulse 1.5s ease-in-out infinite",
        "tile-place": "tilePlace 0.2s ease-out",
        "turn-flash": "turnFlash 0.5s ease-in-out",
      },
      keyframes: {
        aiPulse: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        tilePlace: {
          "0%": { transform: "scale(1.1)", opacity: "0.8" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        turnFlash: {
          "0%, 100%": { borderColor: "#F3C623" },
          "50%": { borderColor: "transparent" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
