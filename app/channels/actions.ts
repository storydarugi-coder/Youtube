"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { channels } from "@/lib/db/schema";

export async function createChannel(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const concept = String(formData.get("concept") ?? "").trim();
  const visualStyle = String(formData.get("visualStyle") ?? "").trim();
  const voiceTone = String(formData.get("voiceTone") ?? "").trim();
  const defaultDurationMinRaw = String(
    formData.get("defaultDurationMin") ?? "13"
  );
  const defaultDurationMin = Number.parseInt(defaultDurationMinRaw, 10) || 13;

  if (!name || !concept || !visualStyle || !voiceTone) {
    throw new Error("필수 항목을 모두 입력해주세요.");
  }

  await db.insert(channels).values({
    id: nanoid(),
    name,
    concept,
    visualStyle,
    voiceTone,
    defaultDurationMin,
    createdAt: Math.floor(Date.now() / 1000),
  });

  revalidatePath("/channels");
}
