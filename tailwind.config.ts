import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 미래지향적 인포테인먼트 대시보드 팔레트
        base: {
          900: "#070a12",
          800: "#0c111d",
          700: "#121a2b",
          600: "#1a2740",
        },
        accent: {
          DEFAULT: "#38bdf8",
          glow: "#22d3ee",
        },
        gold: "#fbbf24",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px -4px rgba(34, 211, 238, 0.35)",
      },
      keyframes: {
        "slide-in": {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
