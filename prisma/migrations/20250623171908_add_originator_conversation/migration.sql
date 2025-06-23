/*
  Warnings:

  - A unique constraint covering the columns `[originatorConversationID]` on the table `MPesaBalance` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MPesaBalance_originatorConversationID_key" ON "MPesaBalance"("originatorConversationID");
