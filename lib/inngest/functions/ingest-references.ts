import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, refsTable } from "@/lib/db/schema";
import { ingestReference } from "@/lib/ingest";
import { inngest } from "../client";

interface IngestRequestedData {
  runId: string;
  urls: string[];
}

export const ingestReferencesFunction = inngest.createFunction(
  {
    id: "ingest-references",
    triggers: [{ event: "run/ingest.requested" }],
  },
  async ({ event, step }) => {
    const { runId, urls } = event.data as IngestRequestedData;
    const now = () => Math.floor(Date.now() / 1000);

    await step.run("set-status-ingesting", async () => {
      await db
        .update(runs)
        .set({ status: "ingesting", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    const results = await Promise.all(
      urls.map((url, idx) =>
        step.run(`ingest-${idx}`, async () => {
          try {
            const data = await ingestReference(url, runId);
            await db
              .update(refsTable)
              .set({
                videoId: data.videoId,
                title: data.title,
                viewCount: data.viewCount,
                uploadedAt: data.uploadedAt,
                durationSec: data.durationSec,
                channelName: data.channelName,
                subtitlesPath: data.subtitlesPath,
                commentsPath: data.commentsPath,
                thumbnailPath: data.thumbnailPath,
                metaPath: data.metaPath,
                status: "done",
                ingestedAt: now(),
              })
              .where(and(eq(refsTable.runId, runId), eq(refsTable.url, url)));
            return { url, ok: true as const, videoId: data.videoId };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await db
              .update(refsTable)
              .set({
                status: "failed",
                errorMessage: message,
                ingestedAt: now(),
              })
              .where(and(eq(refsTable.runId, runId), eq(refsTable.url, url)));
            return { url, ok: false as const, error: message };
          }
        })
      )
    );

    const allOk = results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);

    await step.run("finalize-run-status", async () => {
      const status = allOk ? "ingested" : anyOk ? "ingested" : "failed";
      const errorMessage = allOk
        ? null
        : results
            .filter((r) => !r.ok)
            .map((r) => `${r.url}: ${"error" in r ? r.error : "?"}`)
            .join("; ");
      await db
        .update(runs)
        .set({
          status,
          errorMessage,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("ingest-completed", {
      name: "run/ingest.completed",
      data: {
        runId,
        status: allOk ? "ingested" : anyOk ? "ingested" : "failed",
      },
    });

    return { runId, results };
  }
);
