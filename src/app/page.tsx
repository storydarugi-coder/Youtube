export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-6xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          내 오토워커
        </h1>
        <p className="mt-4 text-lg text-neutral-400">
          유튜브 롱폼 영상 자동 제작 도구
        </p>

        <div className="mt-12 inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-6 py-2 text-sm text-emerald-400">
          M1 — 기본 뼈대 구축 완료
        </div>

        <p className="mt-8 max-w-md text-sm leading-relaxed text-neutral-500">
          레퍼런스 영상 3편 → 대본·스토리보드·썸네일·업로드 정보까지 자동
          생성하는 채널 운영 자동화 도구.
        </p>
      </div>
    </main>
  );
}
