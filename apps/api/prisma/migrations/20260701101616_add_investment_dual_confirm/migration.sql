-- AlterTable
ALTER TABLE "giveaways" ADD COLUMN     "investment_confirmed_by_antreprenor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "investment_confirmed_by_elev" BOOLEAN NOT NULL DEFAULT false;
