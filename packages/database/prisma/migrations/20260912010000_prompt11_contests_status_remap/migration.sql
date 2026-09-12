-- Follow-up to prompt11: remap legacy contest states now that the new enum
-- values exist. This must run after the enum additions in
-- 20260912000000_prompt11_contests, so the two UPDATEs are legal.
UPDATE "contests" SET "status" = 'PUBLISHED' WHERE "status" = 'SCHEDULED';
UPDATE "contests" SET "status" = 'ENDED' WHERE "status" = 'COMPLETED';