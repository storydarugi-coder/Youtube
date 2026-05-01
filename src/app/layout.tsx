import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "내 오토워커",
  description: "유튜브 롱폼 영상 자동 제작 도구",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
