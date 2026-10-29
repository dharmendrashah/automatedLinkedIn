-- Accounts whose profile was read before the profile import set their name and picture: fill only what is still empty.
UPDATE "LinkedInAccount" AS account
SET
  "displayName" = COALESCE(account."displayName", profile."data"->>'name'),
  "imageUrl" = COALESCE(account."imageUrl", profile."data"->>'imageUrl')
FROM "LinkedInAccountProfile" AS profile
WHERE profile."accountId" = account."id"
  AND (account."displayName" IS NULL OR account."imageUrl" IS NULL);
