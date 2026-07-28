CREATE TABLE "auth_throttle" (
	"bucket" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_throttle_window_start_idx" ON "auth_throttle" USING btree ("window_start");