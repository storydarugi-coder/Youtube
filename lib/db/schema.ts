import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  concept: text("concept").notNull(),
  visualStyle: text("visual_style").notNull(),
  voiceTone: text("voice_tone").notNull(),
  ttsVoiceId: text("tts_voice_id"),
  defaultDurationMin: integer("default_duration_min").notNull().default(13),
  createdAt: integer("created_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  channelId: text("channel_id")
    .notNull()
    .references(() => channels.id),
  status: text("status").notNull(),
  durationMin: integer("duration_min").notNull(),
  styleGuidePath: text("style_guide_path"),
  candidatesPath: text("candidates_path"),
  selectionsPath: text("selections_path"),
  factcheckPath: text("factcheck_path"),
  researchPath: text("research_path"),
  scriptPath: text("script_path"),
  scriptMdPath: text("script_md_path"),
  storyboardPath: text("storyboard_path"),
  storyboardMdPath: text("storyboard_md_path"),
  metaPath: text("meta_path"),
  metaMdPath: text("meta_md_path"),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const RUN_STATUS = {
  pending: "pending",
  ingesting: "ingesting",
  ingested: "ingested",
  analyzing: "analyzing",
  analyzed: "analyzed",
  analyze_failed: "analyze_failed",
  generating_candidates: "generating_candidates",
  awaiting_selection: "awaiting_selection",
  selected: "selected",
  selection_timeout: "selection_timeout",
  generate_failed: "generate_failed",
  factchecking: "factchecking",
  factchecked: "factchecked",
  factcheck_failed: "factcheck_failed",
  researching: "researching",
  researched: "researched",
  research_failed: "research_failed",
  writing: "writing",
  scripted: "scripted",
  write_failed: "write_failed",
  storyboarding: "storyboarding",
  storyboarded: "storyboarded",
  storyboard_failed: "storyboard_failed",
  finalizing: "finalizing",
  finalized: "finalized",
  finalize_failed: "finalize_failed",
  failed: "failed",
  done: "done",
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const refsTable = sqliteTable("references", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  url: text("url").notNull(),
  videoId: text("video_id"),
  title: text("title"),
  viewCount: integer("view_count"),
  uploadedAt: text("uploaded_at"),
  durationSec: integer("duration_sec"),
  channelName: text("channel_name"),
  subtitlesPath: text("subtitles_path"),
  commentsPath: text("comments_path"),
  thumbnailPath: text("thumbnail_path"),
  metaPath: text("meta_path"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  ingestedAt: integer("ingested_at"),
});

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Reference = typeof refsTable.$inferSelect;
export type NewReference = typeof refsTable.$inferInsert;
