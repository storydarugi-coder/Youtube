import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runImages } from "@/lib/images/orchestrate";
import { inngest } from "../client";

interface FinalizeCompletedData {
  runId: string;
  status: string;
}

export const generateImagesFunction = inngest.createFunction(
  {
    id: "generate-images",
    triggers: [{ event: "run/finalize.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as FinalizeCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "finalized") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-generating-images", async () => {
      await db
        .update(runs)
        .set({ status: "generating_images", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let result;
    try {
      result = await runImages(runId, { step, concurrency: 4 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "images_failed",
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
          imagesPath: result!.imagesPath,
          imagesMdPath: result!.imagesMdPath,
          totalImageCostUsd: result!.totalCostUsd,
          status: "images_generated",
          errorMessage:
            result!.failed > 0
              ? `이미지 ${result!.failed}개 실패 (${result!.succeeded}개 성공)`
              : null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("images-completed", {
      name: "run/images.completed",
      data: {
        runId,
        status: "images_generated",
        succeeded: result.succeeded,
        failed: result.failed,
        totalCostUsd: result.totalCostUsd,
        imagesPath: result.imagesPath,
      },
    });

    return {
      runId,
      succeeded: result.succeeded,
      failed: result.failed,
      totalCostUsd: result.totalCostUsd,
    };
  }
);
