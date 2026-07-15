-- Add EVENT value to MessageType enum
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'EVENT';

-- Add avatar_url to idea_groups
ALTER TABLE "idea_groups" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
