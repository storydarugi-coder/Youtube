import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runAudio } from "@/lib/audio/orchestrate";
import { inngest } from "../client";

interface ImagesCompletedData {
  runId: string;
  status: string;
}

export const generateAudioFunction = inngest.createFunction(
  {
    id: "generate-audio",
    triggers: [{ event: "run/images.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as ImagesCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "images_generated") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-tts-generating", async () => {
      await db
        .update(runs)
        .set({ status: "tts_generating", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let result;
    try {
      result = await runAudio(runId, { step, concurrency: 4 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "audio_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw err;
    }

    await step.run("save-paths-and-cost", async () => {
      await db
        .update(runs)
        .set({
          audioPath: result!.audioPath,
          audioMdPath: result!.audioMdPath,
          totalAudioCostUsd: result!.totalCostUsd,
          totalAudioDurationMs: result!.totalDurationMs,
          status: "audio_generated",
          errorMessage:
            result!.failed > 0
              ? `TTS ${result!.failed}개 실패 (${result!.succeeded}개 성공)`
              : null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("audio-completed", {
      name: "run/audio.completed",
      data: {
        runId,
        status: "audio_generated",
        succeeded: result.succeeded,
        failed: result.failed,
        totalCostUsd: result.totalCostUsd,
        totalDurationMs: result.totalDurationMs,
        audioPath: result.audioPath,
      },
    });

    return {
      runId,
      succeeded: result.succeeded,
      failed: result.failed,
      totalCostUsd: result.totalCostUsd,
      totalDurationMs: result.totalDurationMs,
    };
  }
);
