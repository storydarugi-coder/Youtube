import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createChannel } from "./actions";

export default async function ChannelsPage() {
  noStore();
  const list = await db.select().from(channels).orderBy(desc(channels.createdAt));

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">채널</h1>
          <p className="text-sm text-neutral-400 mt-1">
            영상 자동화의 기본 단위. 한 번 등록하면 그 스타일로 영상이 생성됨.
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← 홈
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>새 채널 등록</CardTitle>
          <CardDescription>
            모든 항목 필수. 비주얼 스타일은 영어 키워드로 작성하면 이미지 생성에 그대로 쓰임.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createChannel} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">채널 이름</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="예: 야담"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultDurationMin">기본 영상 길이(분)</Label>
                <Input
                  id="defaultDurationMin"
                  name="defaultDurationMin"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={13}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="concept">콘셉트</Label>
              <Textarea
                id="concept"
                name="concept"
                required
                placeholder="예: 조선시대 야사·전설을 현대 어조로 재해석"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="visualStyle">비주얼 스타일 (영어)</Label>
              <Input
                id="visualStyle"
                name="visualStyle"
                required
                placeholder="예: cinematic historical illustration, muted warm tones"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voiceTone">내레이션 톤</Label>
              <Input
                id="voiceTone"
                name="voiceTone"
                required
                placeholder="예: 차분하지만 호기심을 자극, 성우 같은 어조"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ttsVoiceId">
                ElevenLabs Voice ID{" "}
                <span className="text-xs text-neutral-500">(선택)</span>
              </Label>
              <Input
                id="ttsVoiceId"
                name="ttsVoiceId"
                placeholder="비우면 ELEVENLABS_DEFAULT_VOICE_ID 사용"
              />
            </div>
            <Button type="submit">채널 만들기</Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">등록된 채널 ({list.length})</h2>
        {list.length === 0 ? (
          <p className="text-sm text-neutral-500">아직 채널이 없습니다. 위 폼으로 첫 채널을 만드세요.</p>
        ) : (
          <div className="grid gap-3">
            {list.map((c) => (
              <Card key={c.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <Badge variant="secondary">
                      {c.defaultDurationMin}분
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{c.concept}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-neutral-500 space-y-1">
                  <div><span className="text-neutral-400">스타일:</span> {c.visualStyle}</div>
                  <div><span className="text-neutral-400">톤:</span> {c.voiceTone}</div>
                  {c.ttsVoiceId && (
                    <div><span className="text-neutral-400">Voice ID:</span> <code>{c.ttsVoiceId}</code></div>
                  )}
                  <div><span className="text-neutral-400">생성:</span> {new Date(c.createdAt * 1000).toLocaleString("ko-KR")}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
