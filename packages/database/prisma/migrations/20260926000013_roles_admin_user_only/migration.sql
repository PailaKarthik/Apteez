-- Collapse to the two-role model (user + admin). super_admin holders keep
-- their power through the admin role; retired tiers (moderator,
-- content_reviewer, organizer) dissolve to plain membership — their grants
-- are removed, the users themselves are untouched.
INSERT INTO "user_roles" ("userId", "roleId")
SELECT ur."userId", (SELECT "id" FROM "roles" WHERE "name" = 'admin')
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."roleId" AND r."name" = 'super_admin'
ON CONFLICT DO NOTHING;

DELETE FROM "user_roles"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" IN ('moderator', 'content_reviewer', 'organizer', 'super_admin'));

DELETE FROM "role_permissions"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" IN ('moderator', 'content_reviewer', 'organizer', 'super_admin'));

DELETE FROM "roles" WHERE "name" IN ('moderator', 'content_reviewer', 'organizer', 'super_admin');
