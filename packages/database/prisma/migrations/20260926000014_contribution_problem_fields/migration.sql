-- Contributions carry everything needed to mint a problem: section,
-- rating, exam folders and source. All nullable so existing rows survive.
ALTER TABLE "contributions" ADD COLUMN "categoryId" UUID;
ALTER TABLE "contributions" ADD COLUMN "rating" INTEGER;
ALTER TABLE "contributions" ADD COLUMN "examTags" JSONB;
ALTER TABLE "contributions" ADD COLUMN "source" TEXT;
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
