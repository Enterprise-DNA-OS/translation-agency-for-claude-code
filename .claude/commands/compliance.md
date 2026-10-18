---
description: Check the records against the rules a translation and interpreting agency works under (docs/compliance.md) and report every breach with its source.
---

1. Run `node scripts/agency.mjs compliance --json` (or one rule: `compliance revision`).
2. Report as a table: rule, PASS or BREACH, each breach (record, who, detail), the source. Breaches first.
3. For each breach, the fix the operator can approve: the reviser to assign, the credential to record, the agreement to chase, the booking to move.
4. If a rule in `docs/compliance.md` is out of date, say so and stop. Do not guess at law or standards. The operator confirms, then you update the doc and the check together.

Nothing here is legal advice.
