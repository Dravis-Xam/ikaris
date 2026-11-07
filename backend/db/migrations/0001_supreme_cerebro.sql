ALTER TABLE "order_items" DROP CONSTRAINT "order_items_variant_id_shoe_variants_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_delivery_address_id_addresses_id_fk";
--> statement-breakpoint
ALTER TABLE "returns" DROP CONSTRAINT "returns_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "returns" DROP CONSTRAINT "returns_user_id_users_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_id_user_uq" ON "addresses" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_id_user_uq" ON "orders" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_shoe_id_shoe_variants_id_shoe_id_fk" FOREIGN KEY ("variant_id","shoe_id") REFERENCES "public"."shoe_variants"("id","shoe_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_user_id_addresses_id_user_id_fk" FOREIGN KEY ("delivery_address_id","user_id") REFERENCES "public"."addresses"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_order_id_user_id_orders_id_user_id_fk" FOREIGN KEY ("order_id","user_id") REFERENCES "public"."orders"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_shoe_id_shoes_id_fk" FOREIGN KEY ("shoe_id") REFERENCES "public"."shoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_shoe_id_shoes_id_fk" FOREIGN KEY ("shoe_id") REFERENCES "public"."shoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent_check" CHECK ("categories"."parent_category_id" is null or "categories"."parent_category_id" <> "categories"."id");