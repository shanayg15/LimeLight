CREATE TABLE "site_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"url" text NOT NULL,
	"ai_readiness_score" integer DEFAULT 0 NOT NULL,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"readable" boolean DEFAULT true NOT NULL,
	"topic_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"crawled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;