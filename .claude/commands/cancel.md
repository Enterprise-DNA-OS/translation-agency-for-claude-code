---
description: Cancel a booking, a project or a job, with the reason. A booking cancelled inside the late window is charged at the minimum and the interpreter is paid theirs.
---

1. Run `node scripts/agency.mjs cancel B-...|P-...|P-...-T --why="..." [--at="YYYY-MM-DD HH:MM"] --json`. Use `--at` for when the client actually called.
2. Say whether it was late and what is charged and paid.
3. A cancelled project still with a linguist: tell them, then `done` (pay for work done) or cancel the job.
