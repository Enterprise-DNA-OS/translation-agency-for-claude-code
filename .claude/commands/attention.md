---
description: Everything that wants a decision this morning, worst first. A booking with no interpreter, an interpreter without the credential, a certified translation without a certified translator and anything past due come first; then deadlines, paper and money.
---

1. Run `node scripts/agency.mjs attention --json`.
2. Present it worst first, grouped by reason, in the operator's words. Lead with every rank 1 item and say plainly it is today's first call: a booking inside 48 hours with nobody on it, an interpreter whose credential does not cover the booking, a certified translation whose translator is not certified in that direction on the due date, a project past its date.
3. For each group, the one action that clears it: `find LANG --interpreting` then `interpreter B-... NAME`; `find FROM TO --certified` then `assign P-...-T NAME`; `assign P-...-R NAME` for NO REVISER; `timesheet B-... --minutes=`; `draft recert NAME`; `linguist set NAME --nda=DATE`; `draft quote Q-...`; `bill`; `draft overdue INV-...`.
4. THIN MARGIN gets one line of why from `margins --json`: which rate, what it leaves.
5. If the list is empty, say so in one line and stop.
