import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { ingestReferencesFunction } from "@/lib/inngest/functions/ingest-references";
import { analyzeReferencesFunction } from "@/lib/inngest/functions/analyze-references";
import { generateCandidatesFunction } from "@/lib/inngest/functions/generate-candidates";
import { factcheckTopicFunction } from "@/lib/inngest/functions/factcheck-topic";
import { researchTopicFunction } from "@/lib/inngest/functions/research-topic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ingestReferencesFunction,
    analyzeReferencesFunction,
    generateCandidatesFunction,
    factcheckTopicFunction,
    researchTopicFunction,
  ],
});
