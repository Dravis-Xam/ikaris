ALTER TABLE "users" ADD COLUMN "profile_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider" varchar(80) NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_event_id" varchar(160);--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_event_uq" ON "payments" USING btree ("provider","provider_event_id") WHERE "payments"."provider_event_id" is not null;