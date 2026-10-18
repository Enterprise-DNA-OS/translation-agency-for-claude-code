---
description: Who on the panel can take this work: translators by direction (and NAATI certification for certified work), or interpreters by language, setting and time.
---

1. Translation: `node scripts/agency.mjs find FROM TO [--certified] --json`. Interpreting: `node scripts/agency.mjs find LANG --interpreting [--setting=court] [--at="YYYY-MM-DD HH:MM"] --json`.
2. Show who can take it and why the rest cannot (no NAATI certification in that direction, no confidentiality agreement, no competence record, already booked).
3. Recommend one by load and specialism, then the command: `assign P-...-T NAME` or `interpreter B-... NAME`.
4. Nobody? Say so plainly. For a court booking with no Certified Interpreter, the client needs to know today, not on the day.
