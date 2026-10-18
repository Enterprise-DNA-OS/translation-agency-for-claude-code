---
description: Give a translation or revision job to a linguist. Refused, with every reason at once, if they do not work that direction, translated what they would revise, have no competence or confidentiality record, or lack NAATI certification for certified work.
---

1. Run `node scripts/agency.mjs assign P-...-T NAME --json` (translation) or `assign P-...-R NAME` (revision).
2. Say back who, the due date and the cost.
3. Refused: read every reason. The fix is the record (`linguist set`, `credential add`) or a different linguist (`find`). There is no override.
4. The job offer: `draft offer P-...-T`.
