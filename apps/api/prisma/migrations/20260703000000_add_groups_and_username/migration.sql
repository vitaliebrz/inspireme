-- Migrare: grupuri de elevi + câmp username pe profiluri

-- ─── USERNAME pe profiluri ───────────────────────────────

ALTER TABLE "profiles_elev" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "profiles_elev_username_key" ON "profiles_elev"("username");

ALTER TABLE "profiles_antreprenor" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "profiles_antreprenor_username_key" ON "profiles_antreprenor"("username");

-- ─── ENUM: GROUP_MESSAGE în NotificationType ─────────────

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GROUP_MESSAGE';

-- ─── TABEL: idea_groups ──────────────────────────────────

CREATE TABLE "idea_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3),

    CONSTRAINT "idea_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idea_groups_created_by_id_idx" ON "idea_groups"("created_by_id");

ALTER TABLE "idea_groups" ADD CONSTRAINT "idea_groups_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── TABEL: idea_group_members ───────────────────────────

CREATE TABLE "idea_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idea_group_members_group_id_user_id_key" ON "idea_group_members"("group_id", "user_id");
CREATE INDEX "idea_group_members_group_id_idx" ON "idea_group_members"("group_id");
CREATE INDEX "idea_group_members_user_id_idx" ON "idea_group_members"("user_id");

ALTER TABLE "idea_group_members" ADD CONSTRAINT "idea_group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "idea_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idea_group_members" ADD CONSTRAINT "idea_group_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── TABEL: group_messages ───────────────────────────────

CREATE TABLE "group_messages" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "file_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "group_messages_group_id_created_at_idx" ON "group_messages"("group_id", "created_at");
CREATE INDEX "group_messages_sender_id_idx" ON "group_messages"("sender_id");

ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "idea_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
