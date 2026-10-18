---
description: Bring the business across from XTRF (every XTRF view exports to CSV): clients, vendors with their language combinations, and projects. Test run first.
---

1. Read `docs/replace-xtrf.md` for what to export, what maps and what starts fresh.
2. Look at each file's header row first. The importer matches common XTRF column names; if a file uses others, rename the header in a copy (never the operator's original) and say what you renamed.
3. Test run: `node scripts/agency.mjs import xtrf --clients=clients.csv --vendors=vendors.csv --projects=projects.csv --dry-run --json`. Read every skipped row out loud: each is a question about the old data (a language not in the table, a client name that does not match).
4. Run it for real, then again: the second pass must create nothing new.
5. Then for every linguist: competence, confidentiality agreement and NAATI credentials (`/panel`), before anyone is given work. Then `attention`.
