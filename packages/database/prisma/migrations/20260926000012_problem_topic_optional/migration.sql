-- Topic becomes optional on problems: admin creation no longer forces a
-- topic, and deleting a topic unlinks (SET NULL) instead of being blocked.
ALTER TABLE "problems" DROP CONSTRAINT "problems_topicId_fkey";
ALTER TABLE "problems" ALTER COLUMN "topicId" DROP NOT NULL;
ALTER TABLE "problems" ADD CONSTRAINT "problems_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
