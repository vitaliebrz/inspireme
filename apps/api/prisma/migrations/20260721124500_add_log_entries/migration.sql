-- Loguri persistente pentru istoric/debugging în producție (scrise/citite prin SQL raw)
CREATE TABLE IF NOT EXISTS "log_entries" (
  "id"            BIGSERIAL PRIMARY KEY,
  "level"         INTEGER NOT NULL,
  "time"          TIMESTAMP(3) NOT NULL,
  "msg"           TEXT,
  "req_id"        TEXT,
  "method"        TEXT,
  "path"          TEXT,
  "status_code"   INTEGER,
  "user_id"       TEXT,
  "ip"            TEXT,
  "user_agent"    TEXT,
  "code"          TEXT,
  "err_type"      TEXT,
  "err_message"   TEXT,
  "err_stack"     TEXT,
  "response_time" INTEGER,
  "env"           TEXT,
  "raw"           JSONB
);

CREATE INDEX IF NOT EXISTS "log_entries_time_idx" ON "log_entries" ("time");
CREATE INDEX IF NOT EXISTS "log_entries_level_time_idx" ON "log_entries" ("level", "time");
CREATE INDEX IF NOT EXISTS "log_entries_req_id_idx" ON "log_entries" ("req_id");
CREATE INDEX IF NOT EXISTS "log_entries_user_id_time_idx" ON "log_entries" ("user_id", "time");
CREATE INDEX IF NOT EXISTS "log_entries_status_code_idx" ON "log_entries" ("status_code");
