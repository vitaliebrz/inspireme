-- Vizualizări idei per-eveniment, pentru analitică pe zile (scrise/citite prin SQL raw)
CREATE TABLE IF NOT EXISTS "idea_views" (
  "id"         BIGSERIAL PRIMARY KEY,
  "idea_id"    TEXT NOT NULL,
  "viewer_id"  TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idea_views_idea_created_idx" ON "idea_views" ("idea_id", "created_at");
