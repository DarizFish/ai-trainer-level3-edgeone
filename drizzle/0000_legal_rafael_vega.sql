CREATE TABLE "code_drafts" (
	"email" text NOT NULL,
	"task_code" text NOT NULL,
	"cells_json" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_drafts_email_task_code_pk" PRIMARY KEY("email","task_code")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"email" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_email_item_type_item_id_pk" PRIMARY KEY("email","item_type","item_id")
);
--> statement-breakpoint
CREATE TABLE "practical_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"task_code" text NOT NULL,
	"score" double precision NOT NULL,
	"max_score" double precision NOT NULL,
	"rubric_json" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"content_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theory_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"mode" text NOT NULL,
	"score" double precision NOT NULL,
	"max_score" double precision NOT NULL,
	"passed" boolean NOT NULL,
	"answers_json" text NOT NULL,
	"content_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theory_progress" (
	"email" text NOT NULL,
	"question_id" text NOT NULL,
	"answer_json" text NOT NULL,
	"correct" boolean NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"content_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "theory_progress_email_question_id_pk" PRIMARY KEY("email","question_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"email" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"password_hash" text,
	"password_salt" text,
	"password_iterations" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "code_drafts" ADD CONSTRAINT "code_drafts_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practical_attempts" ADD CONSTRAINT "practical_attempts_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_attempts" ADD CONSTRAINT "theory_attempts_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theory_progress" ADD CONSTRAINT "theory_progress_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_drafts_owner_revision_idx" ON "code_drafts" USING btree ("email","task_code","revision");--> statement-breakpoint
CREATE INDEX "practical_attempts_email_idx" ON "practical_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_email_idx" ON "sessions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "theory_attempts_email_idx" ON "theory_attempts" USING btree ("email");