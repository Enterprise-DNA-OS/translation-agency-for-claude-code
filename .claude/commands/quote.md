---
description: Quote a translation: the client, the languages, the word count or pages, certified or not. Priced from the client's own rate, then the standard list. Drafts the quote email; never sends.
---

1. Get from the operator: the client, from and into which language, word count (or pages for certified documents such as birth certificates and police checks), what it is for, and how many days they need.
2. Run `node scripts/agency.mjs quote "CLIENT" --from=zh --to=en --words=2400 [--certified --pages=3] [--title="..."] [--purpose="..."] [--due-days=5] --json`.
3. Say back the quote number, the price ex GST and the tier. If the client is on hold it is refused: say why.
4. `node scripts/agency.mjs draft quote Q-...` writes the email to `drafts/`; `npm run docs -- quote` renders the branded quote. A person sends it, then `quote send Q-...`.
5. When they say yes: `quote accept Q-... [--po=] [--due=]` opens the project with its translation and revision jobs. A lapsed quote is quoted again, not accepted.
