import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { db } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createRun } from "../actions";

export default async function NewRunPage() {
  noStore();
  const list = await db
    .select()
    .from(channels)
    .orderBy(desc(channels.createdAt));

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">새 런 시작</h1>
          <p className="text-sm text-neutral-400 mt-1">
            레퍼런스 영상 URL 1~3개를 던지면 자막·댓글·썸네일·메타를 자동 수집합니다.
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← 홈
        </Link>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>채널이 없습니다</CardTitle>
            <CardDescription>먼저 채널을 등록해주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/channels">
              <Button>채널 만들러 가기</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>인제스트 요청</CardTitle>
            <CardDescription>
              백그라운드에서 실행됩니다. 페이지가 자동으로 진행 상황 화면으로 이동합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createRun} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="channelId">채널</Label>
                <select
                  id="channelId"
                  name="channelId"
                  required
                  className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
                >
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.concept.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationMin">영상 길이(분)</Label>
                <Input
                  id="durationMin"
                  name="durationMin"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={list[0]?.defaultDurationMin ?? 13}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url1">레퍼런스 URL 1</Label>
                <Input id="url1" name="url1" required placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url2">레퍼런스 URL 2</Label>
                <Input id="url2" name="url2" placeholder="(선택)" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url3">레퍼런스 URL 3</Label>
                <Input id="url3" name="url3" placeholder="(선택)" />
              </div>
              <Button type="submit">인제스트 시작</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
