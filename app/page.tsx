import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center space-y-8 max-w-xl">
        <div>
          <h1 className="text-6xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            내 오토워커
          </h1>
          <p className="mt-4 text-lg text-neutral-400">
            유튜브 롱폼 영상 자동 제작 도구
          </p>
        </div>

        <div className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-6 py-2 text-sm text-emerald-400">
          M2 — 레퍼런스 인제스트 단계 진행 중
        </div>

        <p className="text-sm leading-relaxed text-neutral-500">
          레퍼런스 영상 1~3편을 등록하면 자막·댓글·썸네일·메타를 자동 수집합니다.
          채널을 먼저 만들고 새 런을 시작하세요.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link href="/channels">
            <Button variant="default">채널 관리</Button>
          </Link>
          <Link href="/runs/new">
            <Button variant="secondary">새 런 시작</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
