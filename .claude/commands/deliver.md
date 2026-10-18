---
description: Deliver a project to the client. Refused while any job is open, before a second linguist has revised it, or if a certified translation's translator is not NAATI certified on the day.
---

1. Run `node scripts/agency.mjs deliver P-... --json`.
2. Refused: read each reason and the job that clears it.
3. Certified: `npm run docs -- certification` renders the certification statement for the translator to sign and stamp.
4. Delivered work goes on the next `/bill`.
