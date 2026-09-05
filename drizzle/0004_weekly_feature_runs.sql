CREATE TABLE "weekly_feature_runs" (
	"run_key" varchar(80) PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"publish_at" timestamp with time zone NOT NULL,
	"state" varchar(20) DEFAULT 'running' NOT NULL,
	"attempt_label" varchar(20) NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"article_id" integer,
	"selected_topic" varchar(500),
	"evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rsi_decision" varchar(20),
	"image_kind" varchar(20),
	"error_text" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "automation_key" varchar(100);
--> statement-breakpoint
CREATE INDEX "weekly_feature_runs_state_idx" ON "weekly_feature_runs" USING btree ("state");
--> statement-breakpoint
CREATE INDEX "weekly_feature_runs_updated_idx" ON "weekly_feature_runs" USING btree ("updated_at");
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_automation_key_unique" UNIQUE("automation_key");
