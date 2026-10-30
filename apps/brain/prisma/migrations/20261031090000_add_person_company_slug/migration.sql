-- The current company of a person's newest profile read (.plan/network-person-drawer.md, phase B). Additive; the index fills it.

ALTER TABLE "Person" ADD COLUMN "companySlug" TEXT;
