---
description: Put a client on credit hold, or release them. On hold, nothing new is quoted, opened or booked.
---

1. `node scripts/agency.mjs hold "CLIENT" --why="INV-... 30 days overdue" --json` or `release "CLIENT"`.
2. Say what is still open for them: work already booked carries on unless the operator says otherwise.
