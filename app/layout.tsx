import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ProjectProvider } from "@/components/providers/ProjectProvider";

export const metadata: Metadata = {
  title: "유튜브 대본 공장 · 24,000자 자동 생성기",
  description:
    "Google Gemini 기반, 컨텍스트 다이어트 8단계 워크플로우로 상위 0.1% 유튜브 대본을 생성합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body>
        <ToastProvider>
          <ProjectProvider>{children}</ProjectProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
