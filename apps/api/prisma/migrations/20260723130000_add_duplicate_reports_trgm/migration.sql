-- Similaritate titlu idei (detecție duplicate la postare + căutare idee originală la raportare)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "ideas_title_trgm_idx" ON "ideas" USING GIN ("title" gin_trgm_ops);

-- Raportare idei duplicate: leagă raportul de ideea considerată originală de reporter.
-- NULL pentru rapoarte obișnuite (MESSAGE/USER sau IDEA fără suspiciune de duplicat).
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "related_idea_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_related_idea_id_fkey'
  ) THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_related_idea_id_fkey"
      FOREIGN KEY ("related_idea_id") REFERENCES "ideas"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "reports_related_idea_id_idx" ON "reports"("related_idea_id");
