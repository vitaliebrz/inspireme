-- Report.contentId e polimorf (idee / conversație / user). FK-ul către un singur
-- tabel (ideas) făcea imposibile rapoartele pentru mesaje/utilizatori.
-- Eliminăm ambele constrângeri FK de pe content_id.
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "fk_report_idea";
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "fk_report_conversation";
