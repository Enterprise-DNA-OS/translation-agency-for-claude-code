---
description: Invoices open and overdue, finished work not yet invoiced, and marking invoices paid or void.
---

1. Run `node scripts/agency.mjs invoices --open --json`.
2. Overdue first, then the unbilled list.
3. `invoice paid INV-... [--on=]`, `invoice void INV-... --why=`, `draft overdue INV-...` for a reminder.
