CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`concept` text NOT NULL,
	`visual_style` text NOT NULL,
	`voice_tone` text NOT NULL,
	`tts_voice_id` text,
	`default_duration_min` integer DEFAULT 13 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `references` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`url` text NOT NULL,
	`video_id` text,
	`title` text,
	`view_count` integer,
	`uploaded_at` text,
	`duration_sec` integer,
	`channel_name` text,
	`subtitles_path` text,
	`comments_path` text,
	`thumbnail_path` text,
	`meta_path` text,
	`status` text NOT NULL,
	`error_message` text,
	`ingested_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`status` text NOT NULL,
	`duration_min` integer NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE no action
);
