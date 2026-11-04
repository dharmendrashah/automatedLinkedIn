# LinkedIn free account limitations

LinkedIn does not publish most of these limits. Each row is marked as:

- **Published**: LinkedIn states the figure.
- **Estimate**: widely reported by users and third parties, not confirmed by LinkedIn.
- **Not published**: no figure is known.

Check current limits on LinkedIn's help pages before relying on them. Limits change without notice.

| Area | Limitation on a free account | Status | Notes |
| --- | --- | --- | --- |
| Connection requests (daily) | About 20 a day | Estimate | Community figure. Keep to this pace to stay under the weekly cap. |
| Connection requests (weekly) | About 100 a week | Estimate | Rolling window. LinkedIn shows a "weekly limit" notice when you reach it. |
| Connections | Up to 30,000 connections | Published | Same cap for every account type. |
| Connection notes | 200 characters (recorded 2026-10-30 on a free account) | Estimate | The note is optional. Premium is said to take 300. |
| Personalised notes | About 5 a month | Estimate | Requests sent without a note are not counted here. |
| Pending invitations | A cap on unanswered requests (about 3,000 is cited) | Estimate | Withdrawing old requests is the owner's choice; this project never withdraws on its own. |
| Following | About 5,000 people | Estimate | Connections are not counted here. |
| Groups | Joining up to 100 groups | Estimate | |
| Skills on profile | 50 skills | Published | |
| Messages to 1st-degree connections | No published cap | Not published | Bulk or templated sending gets flagged. |
| Messages to people you are not connected to | Usually blocked | Estimate | Needs a connection, a shared group, Open Profile, or InMail. |
| Open Profile messages | Premium only | Published | Premium members can receive messages from anyone. |
| InMail | No credits | Published | Premium plans include a small monthly credit allowance. |
| Who viewed your profile | Short list of recent viewers only | Estimate | Premium shows the full list. |
| Search results | About 1,000 results per search | Estimate | Applies to every account type. |
| Search filters | Basic filters only | Estimate | Some advanced filters need Premium or Sales Navigator. |
| Newsletter | Needs 150 followers to start | Estimate | |
| Post text | Up to 3,000 characters | Published | |
| Post media | Several images, a video (up to 10 minutes), a document | Estimate | Exact media limits change. |
| Post frequency | No published cap | Not published | Repetitive or spammy posting gets reduced reach. |
| Comments | About 1,250 characters each | Estimate | No published cap on the number of comments. |
| Reactions and reposts | No published cap | Not published | |
| Automation | Not allowed by LinkedIn's terms | Published | Accounts can be restricted before any limit is reached. |

## Limits set by this project

These are stricter than the figures above. They live in the code, not in LinkedIn.

- One rule for every account (`packages/contracts/src/limits.ts`, `apps/brain/src/database/limits.ts`): each account gets, per kind of act and per window, a seeded 65 to 80 percent of the maximum below. The factor is drawn once, so every process and retry sees the same number, and it is never shown.
  - Connection requests: 20 a day and 100 a week (`planInvites` in `apps/brain/src/database/inviteRules.ts` takes the account's own numbers).
  - Personalised notes: 5 a month.
  - First messages: 20 a day. Replies: 40 a day (this project's own number).
  - Reactions: 60 a day. Comments: 20 a day.
  - Pending invitations: about 3,000 is cited. A notice shows at 2,400 and new invites for that account pause at 2,850. The count covers only invites made here.
- Posts: at least 1 hour between posts, at most 3 in 24 hours, and identical text refused for 7 days (`postPublication` rules).
- Browsing: a daily time budget per account (Safe 90 minutes, Moderate 120, Aggressive 180), with office hours.
- Messages: the inbox of each signed-in account is read about every 30 minutes, and every 2 hours at night (`accountDaily` job).
- Invites are not withdrawn automatically. The Withdraw block and the manual button stay.
