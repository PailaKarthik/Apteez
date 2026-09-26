-- Events keep exactly three visibilities: PUBLIC, PRIVATE, UNIVERSITY.
-- Legacy COMMUNITY rows become PUBLIC (same open-access semantics), then the
-- enum value is dropped by recreating the type (DROP VALUE cannot run inside
-- Prisma's migration transaction).
UPDATE "events" SET "visibility" = 'PUBLIC' WHERE "visibility" = 'COMMUNITY';

ALTER TABLE "events" ALTER COLUMN "visibility" DROP DEFAULT;
ALTER TYPE "EventVisibility" RENAME TO "EventVisibility_old";
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNIVERSITY');
ALTER TABLE "events" ALTER COLUMN "visibility" TYPE "EventVisibility" USING "visibility"::text::"EventVisibility";
ALTER TABLE "events" ALTER COLUMN "visibility" SET DEFAULT 'PUBLIC';
DROP TYPE "EventVisibility_old";
