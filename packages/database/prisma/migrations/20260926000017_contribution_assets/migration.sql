-- Contribution question images: frozen storage-key snapshot, mirroring the
-- nullable examTags pattern. Older rows stay NULL and keep working.
ALTER TABLE "contributions" ADD COLUMN "assets" JSONB;
