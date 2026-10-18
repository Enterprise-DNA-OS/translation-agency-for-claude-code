---
description: Mark a translation or revision job finished. A revision cannot finish before its translation.
---

1. Run `node scripts/agency.mjs done P-...-T [--words=FINAL_COUNT] --json`. Give `--words` when the final count differs from the quote: the linguist's cost follows it.
2. When the revision finishes, the project is ready: say `deliver P-...`.
