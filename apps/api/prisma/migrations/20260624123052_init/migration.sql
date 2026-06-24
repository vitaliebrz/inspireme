-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ELEV', 'ANTREPRENOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('GRATUIT', 'PRO');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('PUBLICAT', 'CONTACTAT', 'IN_COLABORARE', 'REALIZAT');

-- CreateEnum
CREATE TYPE "IdeaVisibility" AS ENUM ('PUBLIC', 'PRIVAT');

-- CreateEnum
CREATE TYPE "IdeaCategory" AS ENUM ('ECO', 'TECH', 'ARTA', 'EDUCATIE', 'SANATATE', 'SOCIAL', 'FOOD', 'FINANTE');

-- CreateEnum
CREATE TYPE "ConnectionRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'PDF', 'IMAGE');

-- CreateEnum
CREATE TYPE "GiveawayStatus" AS ENUM ('ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReportContentType" AS ENUM ('IDEA', 'MESSAGE', 'USER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'MESSAGE_NEW', 'IDEA_FEEDBACK', 'GIVEAWAY_NEW', 'GIVEAWAY_WON', 'GIVEAWAY_RESULT', 'COLLAB_CONFIRM', 'COLLAB_CONFIRMED', 'IDEA_STATUS_RESET', 'SUBSCRIPTION_EXPIRING', 'ACCOUNT_WARNING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('ACTIV', 'IN_NEGOCIERE', 'FINALIZAT', 'NECONFIRMAT');

-- CreateEnum
CREATE TYPE "EntrepreneurStatus" AS ENUM ('ACTIV', 'INACTIV', 'RETRAS');

-- CreateEnum
CREATE TYPE "ModerationLevel" AS ENUM ('AVERTISMENT', 'ELIMINARE_CONTINUT', 'SUSPENDARE_CONT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'GRATUIT',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspended_at" TIMESTAMP(3),
    "suspend_reason" TEXT,
    "first_login" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),
    "last_activity" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles_elev" (
    "user_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "school" TEXT,
    "class" TEXT,
    "city" TEXT,
    "bio" TEXT,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatar_url" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_elev_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "profiles_antreprenor" (
    "user_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "company" TEXT,
    "position" TEXT,
    "domain" TEXT,
    "website" TEXT,
    "bio_mentor" TEXT,
    "experience_years" INTEGER,
    "avatar_url" TEXT,
    "status" "EntrepreneurStatus" NOT NULL DEFAULT 'ACTIV',
    "status_updated_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_antreprenor_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "IdeaCategory" NOT NULL,
    "problem" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "target_audience" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" "IdeaVisibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "IdeaStatus" NOT NULL DEFAULT 'PUBLICAT',
    "plan_at_post" "Plan" NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_images" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_pdfs" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_pdfs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_requests" (
    "id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "idea_id" TEXT,
    "status" "ConnectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connection_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "elev_id" TEXT NOT NULL,
    "antreprenor_id" TEXT NOT NULL,
    "connection_request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "file_url" TEXT,
    "file_name" TEXT,
    "file_size" INTEGER,
    "read_at" TIMESTAMP(3),
    "is_anonymized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "antreprenor_id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "rating_general" INTEGER NOT NULL,
    "rating_originalitate" INTEGER NOT NULL,
    "rating_viabilitate" INTEGER NOT NULL,
    "rating_prezentare" INTEGER NOT NULL,
    "rating_potential" INTEGER NOT NULL,
    "comment" TEXT,
    "interested_in_collab" BOOLEAN NOT NULL DEFAULT false,
    "is_editable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborations" (
    "id" TEXT NOT NULL,
    "elev_id" TEXT NOT NULL,
    "antreprenor_id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "confirmed_by_elev" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_by_antreprenor" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaways" (
    "id" TEXT NOT NULL,
    "antreprenor_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "investment_description" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "max_participants" INTEGER,
    "winner_id" TEXT,
    "status" "GiveawayStatus" NOT NULL DEFAULT 'ACTIVE',
    "selection_log" JSONB,
    "notify_all" BOOLEAN NOT NULL DEFAULT false,
    "investment_confirmed_at" TIMESTAMP(3),
    "badge_unfulfilled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giveaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giveaway_participants" (
    "id" TEXT NOT NULL,
    "giveaway_id" TEXT NOT NULL,
    "elev_id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giveaway_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'PRO',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "current_period_end" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_users" (
    "id" TEXT NOT NULL,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "content_type" "ReportContentType" NOT NULL,
    "content_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parental_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parental_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_history" (
    "id" TEXT NOT NULL,
    "antreprenor_id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "collaboration_id" TEXT,
    "investment_type" TEXT NOT NULL,
    "amount_description" TEXT,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'ACTIV',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "level" "ModerationLevel" NOT NULL,
    "reason" TEXT NOT NULL,
    "content_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_content" (
    "id" TEXT NOT NULL,
    "idea_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "hidden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookie_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "analytics" BOOLEAN NOT NULL DEFAULT true,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cookie_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'JSON',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "file_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_plan_idx" ON "users"("plan");

-- CreateIndex
CREATE INDEX "users_last_activity_idx" ON "users"("last_activity");

-- CreateIndex
CREATE INDEX "users_is_deleted_idx" ON "users"("is_deleted");

-- CreateIndex
CREATE INDEX "profiles_antreprenor_status_idx" ON "profiles_antreprenor"("status");

-- CreateIndex
CREATE INDEX "ideas_user_id_idx" ON "ideas"("user_id");

-- CreateIndex
CREATE INDEX "ideas_category_idx" ON "ideas"("category");

-- CreateIndex
CREATE INDEX "ideas_status_idx" ON "ideas"("status");

-- CreateIndex
CREATE INDEX "ideas_visibility_idx" ON "ideas"("visibility");

-- CreateIndex
CREATE INDEX "ideas_plan_at_post_created_at_idx" ON "ideas"("plan_at_post", "created_at");

-- CreateIndex
CREATE INDEX "ideas_created_at_idx" ON "ideas"("created_at");

-- CreateIndex
CREATE INDEX "idea_images_idea_id_idx" ON "idea_images"("idea_id");

-- CreateIndex
CREATE INDEX "idea_pdfs_idea_id_idx" ON "idea_pdfs"("idea_id");

-- CreateIndex
CREATE INDEX "connection_requests_from_user_id_idx" ON "connection_requests"("from_user_id");

-- CreateIndex
CREATE INDEX "connection_requests_to_user_id_idx" ON "connection_requests"("to_user_id");

-- CreateIndex
CREATE INDEX "connection_requests_status_idx" ON "connection_requests"("status");

-- CreateIndex
CREATE INDEX "connection_requests_expires_at_idx" ON "connection_requests"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_connection_request_id_key" ON "conversations"("connection_request_id");

-- CreateIndex
CREATE INDEX "conversations_elev_id_idx" ON "conversations"("elev_id");

-- CreateIndex
CREATE INDEX "conversations_antreprenor_id_idx" ON "conversations"("antreprenor_id");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "feedback_idea_id_idx" ON "feedback"("idea_id");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_antreprenor_id_idea_id_key" ON "feedback"("antreprenor_id", "idea_id");

-- CreateIndex
CREATE INDEX "collaborations_elev_id_idx" ON "collaborations"("elev_id");

-- CreateIndex
CREATE INDEX "collaborations_antreprenor_id_idx" ON "collaborations"("antreprenor_id");

-- CreateIndex
CREATE INDEX "collaborations_idea_id_idx" ON "collaborations"("idea_id");

-- CreateIndex
CREATE INDEX "giveaways_antreprenor_id_idx" ON "giveaways"("antreprenor_id");

-- CreateIndex
CREATE INDEX "giveaways_status_idx" ON "giveaways"("status");

-- CreateIndex
CREATE INDEX "giveaways_end_date_idx" ON "giveaways"("end_date");

-- CreateIndex
CREATE INDEX "giveaway_participants_giveaway_id_idx" ON "giveaway_participants"("giveaway_id");

-- CreateIndex
CREATE INDEX "giveaway_participants_elev_id_idx" ON "giveaway_participants"("elev_id");

-- CreateIndex
CREATE UNIQUE INDEX "giveaway_participants_giveaway_id_elev_id_key" ON "giveaway_participants"("giveaway_id", "elev_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "blocked_users_blocker_id_idx" ON "blocked_users"("blocker_id");

-- CreateIndex
CREATE INDEX "blocked_users_blocked_id_idx" ON "blocked_users"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_users_blocker_id_blocked_id_key" ON "blocked_users"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_content_type_content_id_idx" ON "reports"("content_type", "content_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "parental_consents_user_id_key" ON "parental_consents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "parental_consents_token_key" ON "parental_consents"("token");

-- CreateIndex
CREATE INDEX "parental_consents_token_idx" ON "parental_consents"("token");

-- CreateIndex
CREATE INDEX "parental_consents_expires_at_idx" ON "parental_consents"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "investment_history_collaboration_id_key" ON "investment_history"("collaboration_id");

-- CreateIndex
CREATE INDEX "investment_history_antreprenor_id_idx" ON "investment_history"("antreprenor_id");

-- CreateIndex
CREATE INDEX "investment_history_idea_id_idx" ON "investment_history"("idea_id");

-- CreateIndex
CREATE INDEX "investment_history_status_idx" ON "investment_history"("status");

-- CreateIndex
CREATE INDEX "moderation_actions_target_id_idx" ON "moderation_actions"("target_id");

-- CreateIndex
CREATE INDEX "moderation_actions_admin_id_idx" ON "moderation_actions"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_content_idea_id_key" ON "blocked_content"("idea_id");

-- CreateIndex
CREATE UNIQUE INDEX "cookie_consents_user_id_key" ON "cookie_consents"("user_id");

-- CreateIndex
CREATE INDEX "data_export_requests_user_id_idx" ON "data_export_requests"("user_id");

-- CreateIndex
CREATE INDEX "data_export_requests_status_idx" ON "data_export_requests"("status");

-- AddForeignKey
ALTER TABLE "profiles_elev" ADD CONSTRAINT "profiles_elev_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles_antreprenor" ADD CONSTRAINT "profiles_antreprenor_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_images" ADD CONSTRAINT "idea_images_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idea_pdfs" ADD CONSTRAINT "idea_pdfs_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_elev_id_fkey" FOREIGN KEY ("elev_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_antreprenor_id_fkey" FOREIGN KEY ("antreprenor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connection_request_id_fkey" FOREIGN KEY ("connection_request_id") REFERENCES "connection_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_antreprenor_id_fkey" FOREIGN KEY ("antreprenor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborations" ADD CONSTRAINT "collaborations_elev_id_fkey" FOREIGN KEY ("elev_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborations" ADD CONSTRAINT "collaborations_antreprenor_id_fkey" FOREIGN KEY ("antreprenor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborations" ADD CONSTRAINT "collaborations_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaways" ADD CONSTRAINT "giveaways_antreprenor_id_fkey" FOREIGN KEY ("antreprenor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_participants" ADD CONSTRAINT "giveaway_participants_giveaway_id_fkey" FOREIGN KEY ("giveaway_id") REFERENCES "giveaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_participants" ADD CONSTRAINT "giveaway_participants_elev_id_fkey" FOREIGN KEY ("elev_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giveaway_participants" ADD CONSTRAINT "giveaway_participants_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_users" ADD CONSTRAINT "blocked_users_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_report_idea" FOREIGN KEY ("content_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_report_conversation" FOREIGN KEY ("content_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parental_consents" ADD CONSTRAINT "parental_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_history" ADD CONSTRAINT "investment_history_antreprenor_id_fkey" FOREIGN KEY ("antreprenor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_history" ADD CONSTRAINT "investment_history_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_history" ADD CONSTRAINT "investment_history_collaboration_id_fkey" FOREIGN KEY ("collaboration_id") REFERENCES "collaborations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_content" ADD CONSTRAINT "blocked_content_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cookie_consents" ADD CONSTRAINT "cookie_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
