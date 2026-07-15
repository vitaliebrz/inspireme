-- AlterTable: scor persistat pentru ordonarea globală a feed-ului de idei
ALTER TABLE "ideas" ADD COLUMN "score" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ideas_score_idx" ON "ideas"("score");
