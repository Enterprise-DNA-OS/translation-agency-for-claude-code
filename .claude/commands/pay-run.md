---
description: Pay the linguists for finished work: one pay run per linguist, with remittance advice. Nobody is paid twice.
---

1. Run `node scripts/agency.mjs payables --json` to see who is owed.
2. `pay-run --dry-run --json`, then `pay-run --json` on a yes.
3. `npm run docs -- remittance` renders each linguist's remittance advice.
4. `pay-run approve PR-...`, pay from the bank, then `pay-run paid PR-...`.
