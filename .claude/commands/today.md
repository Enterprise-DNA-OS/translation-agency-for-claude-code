---
description: The day's interpreting bookings with who is on each, the translation jobs due, and the projects due back to clients.
---

1. Run `node scripts/agency.mjs today --json` (or `--date=tomorrow` when planning).
2. Bookings first, in time order: time, language, mode, setting, client, interpreter. Say NOBODY out loud and run `find LANG --interpreting --setting= --at=` for each.
3. Then jobs due to linguists and projects due to clients. A project due today that is not revised cannot go out: say who is revising it and by when.
4. Booking confirmations to the client: `draft confirm B-...`.
