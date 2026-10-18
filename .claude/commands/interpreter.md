---
description: Put an interpreter on a booking. Refused if their NAATI credential for that language is not current on the day, if court or legal work gets less than a Certified Interpreter, if they are already booked, or if their confidentiality agreement is not on file.
---

1. Run `node scripts/agency.mjs interpreter B-... NAME --json`.
2. Say back who and when, then offer `draft confirm B-...` for the client.
3. Refused: read the reasons and run `find LANG --interpreting --setting= --at=` for someone who fits.
