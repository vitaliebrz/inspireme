-- Migrare: conversații universale (participantAId/participantBId în loc de elevId/antreprenorId)

-- Pasul 1: Adăugăm coloanele noi cu valoare temporară NULL (NULLABLE pentru a permite migrarea datelor existente)
ALTER TABLE "conversations" ADD COLUMN "participant_a_id" TEXT;
ALTER TABLE "conversations" ADD COLUMN "participant_b_id" TEXT;

-- Pasul 2: Copiem datele existente (elev → participantA, antreprenor → participantB)
UPDATE "conversations" SET
  "participant_a_id" = "elev_id",
  "participant_b_id" = "antreprenor_id";

-- Pasul 3: Facem coloanele NOT NULL acum că au date
ALTER TABLE "conversations" ALTER COLUMN "participant_a_id" SET NOT NULL;
ALTER TABLE "conversations" ALTER COLUMN "participant_b_id" SET NOT NULL;

-- Pasul 4: Ștergem coloanele vechi
ALTER TABLE "conversations" DROP COLUMN "elev_id";
ALTER TABLE "conversations" DROP COLUMN "antreprenor_id";

-- Pasul 5: Actualizăm indexurile
DROP INDEX IF EXISTS "conversations_elev_id_idx";
DROP INDEX IF EXISTS "conversations_antreprenor_id_idx";
CREATE INDEX "conversations_participant_a_id_idx" ON "conversations"("participant_a_id");
CREATE INDEX "conversations_participant_b_id_idx" ON "conversations"("participant_b_id");

-- Pasul 6: Adăugăm foreign keys noi
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_a_id_fkey"
  FOREIGN KEY ("participant_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_b_id_fkey"
  FOREIGN KEY ("participant_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
