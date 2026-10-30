# My network: All clients by default

- Status: done
- Created: 2026-10-31
- Locked by user: yes, 2026-10-31 ("by default it should show the table and option to select the client from drawer, it should not force me to select the client")

## Goal

`/network` opens on every client's people in one table. The client picker in the Filters drawer narrows it to one client; "All clients" is the default and shows the table, not one Today line per client.

## Requirements

- No `client` in the address means All clients (with one client it is the same people). An account's route (`/network/<accountId>`) still opens that account's client.
- All clients is a real view: the table, tabs and counts, search, Filters (Found by lists and Connected to accounts of every client), Export, the drawer, bulk changes, Today and results summed over the clients.
- A person known to two clients is two rows (each client keeps its own status, labels and notes); in All, each row names its client when there are several clients.
- Add people in All adds to the default client ("My accounts"). Invites use the person's own client.

## Approach

- [ ] Brain: `ALL_CLIENTS = 'all'` accepted as `clientId` by `list`, `counts`, `filterOptions`, `results`, `seen`, `updateMany` and `export` (a scope of the owner's client ids; "new" uses each row's own client's last visit). Rows carry `clientId`. Tests.
- [ ] Body: default All; All renders the people view with a merged client (every account and list) and a summed Today line; the old per-client Today list goes; a client chip on rows in All; Add people and invites use a real client.
- [ ] Definition of done, `MEMORY.md`.

## Edge cases and risks

- One client: All and that client show the same people; the chip is hidden.
- A person in two clients appears twice in All; bulk changes apply to the rows picked.
- The export log needs a client id: All logs against the default client, and the file is named "All-clients-people.csv".
- Old links with `?client=all` keep working; `?client=<id>` still opens one client.

## Outcome

Built on `feat/network-all-clients` (2026-10-31):

- Brain: `ALL_CLIENTS` (`'all'`) is a scope over the owner's clients (`scopeOf`) for `list`, `counts`, `filterOptions`, `results`, `seen`, `updateMany` and `export`; rows carry `clientId`; "new" uses each row's own client's last visit. `add` still needs one real client. Integration test: two clients together, another owner sees none.
- Body: no `client` in the address (and no account route) is All clients (`showsAllClients`); All renders the normal people view with a merged client (`allClientsOf`: every account and list) and a summed Today line (`todayOfAll`); rows name their client with several clients; Add people goes to the default client; an invite uses the person's own client. The old per-client Today list (`AllClients`) is removed.
- Checks: lint, type check, build, unit tests (contracts 229, body 887, spider 1353, brain 1589), people and index integration tests. Not seen in a browser.
