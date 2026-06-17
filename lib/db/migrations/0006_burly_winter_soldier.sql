CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"engines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"samples" integer DEFAULT 3 NOT NULL,
	"channels" jsonb DEFAULT '{"email":false}'::jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_skip_reason" text,
	"last_skip_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_subject_uniq" UNIQUE("subject_id")
);
--> statement-breakpoint
ALTER TABLE "audit_runs" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;