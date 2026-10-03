CREATE TABLE "api_submissions" (
	"email" text NOT NULL,
	"operation" text NOT NULL,
	"submission_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"response_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_submissions_email_operation_submission_id_pk" PRIMARY KEY("email","operation","submission_id")
);
--> statement-breakpoint
ALTER TABLE "api_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_submissions" ADD CONSTRAINT "api_submissions_email_users_email_fk" FOREIGN KEY ("email") REFERENCES "public"."users"("email") ON DELETE cascade ON UPDATE no action;