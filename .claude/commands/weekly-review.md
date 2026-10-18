---
description: The Monday review, written from six commands: decisions, the week's bookings and deadlines, the panel, margins, money, and the rule book.
---

1. Run, `--json` each: `node scripts/agency.mjs attention`, `bookings --days=7`, `projects`, `credentials`, `margins --days=30`, `invoices --open`, `quotes`, `compliance`.
2. Write the review in five short sections, prose plus small tables, nothing invented:
   - **Today's decisions.** The attention list, worst first, one action each.
   - **The week.** Bookings with nobody on them, court and legal bookings and who is on each, translations due and who is revising them.
   - **The panel.** Credentials to renew, pairs with only one linguist (a revision needs two), anyone working without an agreement.
   - **Money.** Margin by client, overdue invoices, unbilled work, quotes to chase.
   - **The rule book.** Compliance breaches.
3. End with at most five actions for the week, each one command or one conversation.
4. On paper: `npm run view` renders the week, money and panel pages.
