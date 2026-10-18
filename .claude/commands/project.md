---
description: Open a translation project straight from an email (no quote), or show one project's whole card: jobs, linguists, revision state, price, cost and margin.
---

To open one: `node scripts/agency.mjs project new "CLIENT" --from= --to= --words= [--certified --pages=] [--due=DATE] [--po=] [--title=] [--purpose=] --json`. It opens with a translation job and a revision job. Then run `/find`.

To show one: `node scripts/agency.mjs project P-... --json`. Present the client, pair, words, due date, then the jobs with who is on each. Say whether it has been revised by a second linguist, and what it leaves after linguist costs.
