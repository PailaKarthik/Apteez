-- Google already proved ownership of these addresses (its userinfo reports
-- email_verified), but provisioning never persisted the fact, leaving
-- users.emailVerified NULL for OAuth accounts. Backfill it: only rows with a
-- linked Google identity and a still-NULL stamp are touched.
UPDATE "users" u
SET "emailVerified" = NOW()
WHERE u."emailVerified" IS NULL
  AND EXISTS (
    SELECT 1 FROM "auth_identities" ai
    WHERE ai."userId" = u."id" AND ai."provider" = 'google'
  );
