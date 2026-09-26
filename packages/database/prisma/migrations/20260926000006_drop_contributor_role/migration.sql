-- There is no contributor role: every member may submit questions for
-- review, so contributing is a capability of `user`, not a separate role.
-- Removes the role, its membership links and its permission grants.
-- Idempotent: safe to apply on databases that never had the role.
DO $$
DECLARE
  contributor_id UUID;
BEGIN
  SELECT "id" INTO contributor_id FROM "roles" WHERE "name" = 'contributor';
  IF contributor_id IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM "user_roles" WHERE "roleId" = contributor_id;
  DELETE FROM "role_permissions" WHERE "roleId" = contributor_id;
  DELETE FROM "roles" WHERE "id" = contributor_id;
END $$;

-- Grant every member the submit capability (matches seed-data GRANTS;
-- bootstrap re-applies this on every deploy, this backfills existing DBs).
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT (SELECT "id" FROM "roles" WHERE "name" = 'user'),
       (SELECT "id" FROM "permissions" WHERE "action" = 'submit' AND "resource" = 'contributions')
WHERE EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'user')
  AND EXISTS (SELECT 1 FROM "permissions" WHERE "action" = 'submit' AND "resource" = 'contributions')
  AND NOT EXISTS (
    SELECT 1 FROM "role_permissions" rp
    JOIN "roles" r ON r."id" = rp."roleId" AND r."name" = 'user'
    JOIN "permissions" p ON p."id" = rp."permissionId"
      AND p."action" = 'submit' AND p."resource" = 'contributions'
  );
