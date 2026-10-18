---
description: NAATI credentials expired or ending soon, so nobody is booked on a lapsed one.
---

1. Run `node scripts/agency.mjs credentials --json` (`--days=180`, `--all`).
2. Table: linguist, type, direction, expiry, days left. Expired ones first.
3. For each: `draft recert NAME` to remind them. When the renewal comes through: `credential add NAME --type= ... --expires=`.
