---
description: The linguist panel: who works in what, their NAATI credentials, competence and confidentiality records, and their load. Add a linguist or update their records.
---

1. Read: `node scripts/agency.mjs linguists [--lang=zh] --json`, one person: `linguist NAME --json`.
2. Add: `linguist add "Full Name" --email= [--phone= --suburb= --kind=staff]`, then `linguist set L-... --pair="ko>en" --competence="translation degree" --note="..." --nda=DATE` and `credential add L-... --type=CT --from=ko --to=en --expires=DATE --number=` for each NAATI credential. Interpreting: `--type=CI --lang=ko`.
3. Rates: `linguist set NAME --rate=translation:13` (cents a word) or `--rate=onsite:70` (dollars an hour).
4. Competence is one of the three ISO 17100 routes: a translation degree, another degree plus two years, or five years full-time. Record the evidence in `--note`.
