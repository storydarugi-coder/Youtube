"use server";

import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { runs, refsTable } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";

export async function createRun(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "").trim();
  const url1 = String(formData.get("url1") ?? "").trim();
  const url2 = String(formData.get("url2") ?? "").trim();
  const url3 = String(formData.get("url3") ?? "").trim();
  const durationMinRaw = String(formData.get("durationMin") ?? "13");
  const durationMin = Number.parseInt(durationMinRaw, 10) || 13;

  const urls = [url1, url2, url3].filter((u) => u.length > 0);
  if (!channelId) throw new Error("채널을 선택해주세요.");
  if (urls.length === 0) throw new Error("URL을 최소 1개 입력해주세요.");

  const runId = nanoid();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(runs).values({
    id: runId,
    channelId,
    status: "pending",
    durationMin,
    createdAt: now,
    updatedAt: now,
  });

  for (const url of urls) {
    await db.insert(refsTable).values({
      id: nanoid(),
      runId,
      url,
      status: "pending",
    });
  }

  await inngest.send({
    name: "run/ingest.requested",
    data: { runId, urls },
  });

  redirect(`/runs/${runId}`);
}
