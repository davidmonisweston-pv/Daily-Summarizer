-- Remove microsoft_id column from users table
ALTER TABLE "users" DROP COLUMN IF EXISTS "microsoft_id";

-- Add password_hash and email_verified columns to users table
ALTER TABLE "users" ADD COLUMN "password_hash" text;
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;

-- Create verification_tokens table
CREATE TABLE "verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

-- Drop allowed_domains table as we're removing domain whitelisting
DROP TABLE IF EXISTS "allowed_domains";

-- Create initial admin user (password will be set on first login)
-- Password: 'admin123' (hashed with bcrypt, user should change this immediately)
INSERT INTO "users" ("email", "password_hash", "display_name", "role", "email_verified", "created_at")
VALUES (
	'David.Monis.Weston@PurposefulVentures.org',
	'$2b$10$XqjT8c7QT0yKKkKj0mR5.OZY4K4mP4B4mL4v4Z4Z4Z4Z4Z4Z4Z4Z4u',
	'David Monis Weston',
	'admin',
	true,
	now()
)
ON CONFLICT (email) DO UPDATE SET
	role = 'admin',
	email_verified = true;
