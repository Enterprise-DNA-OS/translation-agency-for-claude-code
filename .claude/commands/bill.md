---
description: Draft invoices for finished work: delivered projects, completed bookings and late cancellations, one invoice a client, with their PO on each line.
---

1. Run `node scripts/agency.mjs bill --dry-run --json` first and show the invoices it would make.
2. On a yes: `bill [--to=DATE] --json`. Nothing is billed twice.
3. Check them: `npm run docs -- invoice`. Then `invoice issue INV-...` for each. Sending happens from the accounts system or email, by a person.
