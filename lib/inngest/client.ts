import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "my-autoworker" });

export interface IngestRequestedEvent {
  name: "run/ingest.requested";
  data: {
    runId: string;
    urls: string[];
  };
}

export interface IngestCompletedEvent {
  name: "run/ingest.completed";
  data: {
    runId: string;
    status: "ingested" | "failed";
  };
}
