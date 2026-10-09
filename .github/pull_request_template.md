## What issue does this solve for the end user?

<!-- Required. Who is affected (for example, someone running outreach campaigns)? What problem or limitation do they have today, and how does this change fix it? If there is no direct end-user impact (refactor, tooling, docs), say who benefits and how. -->

## Summary of changes

<!-- What changed and why, in a few bullet points. -->

-

## Type of change

- [ ] New feature
- [ ] Bug fix
- [ ] Refactor or tooling
- [ ] Docs
- [ ] Database migration
- [ ] Infrastructure, Docker, or CI

## Plan

<!-- Required for new features and behaviour changes. Link the plan file under .plan/ that describes what the feature contains. -->

- Plan file: `.plan/<feature-name>.md`

## How to test

<!-- Steps or commands a reviewer can run. Include screenshots for UI changes. -->

## Checklist

- [ ] Every line and branch I added or changed is covered by tests, and all tests pass
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` passes locally
- [ ] Migrations are additive and I did not edit an existing migration
- [ ] No secrets, tokens, or personal data are included in code, tests, logs, or screenshots
- [ ] The change follows LinkedIn's Terms of Service and the [Code of Conduct](../CODE_OF_CONDUCT.md)
- [ ] I reviewed and understand all code in this PR, including any AI-assisted code
- [ ] I updated `README.md` and `MEMORY.md` where needed
- [ ] The plan file is complete (requirements confirmed, edge cases listed, outcome filled in)
