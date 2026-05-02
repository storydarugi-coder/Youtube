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
