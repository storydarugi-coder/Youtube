import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { ingestReferencesFunction } from "@/lib/inngest/functions/ingest-references";
import { analyzeReferencesFunction } from "@/lib/inngest/functions/analyze-references";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestReferencesFunction, analyzeReferencesFunction],
});
