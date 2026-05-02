import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runVideo } from "@/lib/video/orchestrate";
import { inngest } from "../client";

interface AudioCompletedData {
  runId: string;
  status: string;
}

export const renderVideoFunction = inngest.createFunction(
  {
    id: "render-video",
    triggers: [{ event: "run/audio.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as AudioCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "audio_generated") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-rendering", async () => {
      await db
        .update(runs)
        .set({ status: "rendering", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let result;
    try {
      result = await runVideo(runId, { step, concurrency: 2 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "render_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw err;
    }

    await step.run("save-paths-and-duration", async () => {
      await db
        .update(runs)
        .set({
          videoPath: result!.videoPath,
          srtPath: result!.srtPath,
          videoMdPath: result!.videoMdPath,
          totalVideoDurationMs: result!.totalDurationMs,
          status: "video_rendered",
          errorMessage:
            result!.failed > 0
              ? `씬 ${result!.failed}개 실패 (placeholder ${result!.placeholders} / 성공 ${result!.succeeded})`
              : null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("video-completed", {
      name: "run/video.completed",
      data: {
        runId,
        status: "video_rendered",
        succeeded: result.succeeded,
        placeholders: result.placeholders,
        failed: result.failed,
        totalDurationMs: result.totalDurationMs,
        videoPath: result.videoPath,
        srtPath: result.srtPath,
      },
    });

    return {
      runId,
      succeeded: result.succeeded,
      placeholders: result.placeholders,
      failed: result.failed,
      totalDurationMs: result.totalDurationMs,
    };
  }
);
