---
description: Quotes out, how long each has waited, which have lapsed, and how many are being won.
---

1. Run `node scripts/agency.mjs quotes --json` (`--all` for decided ones too).
2. Table: quote, client, title, amount, days out, valid to. Then the total out and the win rate.
3. Anything sent three or more days ago with no answer: offer `draft quote Q-...` to chase it. Lapsed ones: requote or `quote decline Q-... --why=`.
