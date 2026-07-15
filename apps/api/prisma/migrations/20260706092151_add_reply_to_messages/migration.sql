-- AlterTable
ALTER TABLE "group_messages" ADD COLUMN     "reply_to_id" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "reply_to_id" TEXT;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "group_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
