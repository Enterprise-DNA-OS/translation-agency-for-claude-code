# Translation Agency for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| "what needs my attention", "what's wrong this morning" | `/attention` |
| "what's on today", "who's interpreting tomorrow" | `/today` |
| "quote this", "how much for 2,000 words of Korean" | `/quote` |
| "which quotes are out", "chase the quotes" | `/quotes` |
| "new job from Kestrel", "pull up P-1004" | `/project` |
| "who can do Persian certified", "who's free for Somali at 2" | `/find` |
| "give the revision to Grace" | `/assign` |
| "Hana's finished", "the revision is back" | `/done` |
| "send it to the client", "deliver P-1007" | `/deliver` |
| "book a Vietnamese interpreter for..." | `/book` |
| "put Amina on B-5004" | `/interpreter` |
| "Wei's timesheet says 40 minutes" | `/timesheet` |
| "what bookings have we got this week" | `/bookings` |
| "the hospital cancelled", "cancel that project" | `/cancel` |
| "add a new Korean translator", "Daniel signed the agreement", "who's on the panel" | `/panel` |
| "whose NAATI is running out" | `/credentials` |
| "pull up Collins Street", "what do they owe" | `/client` |
| "are we making money", "which clients are thin" | `/margins` |
| "do the invoicing", "bill the month" | `/bill` |
| "what's overdue", "mark that paid" | `/invoices` |
| "pay the linguists", "who do we owe" | `/pay-run` |
| "put them on hold", "release the hold" | `/hold` |
| "are we compliant", "check the rules" | `/compliance` |
| "Monday review", "how was the week" | `/weekly-review` |
| "note that Anh said..." | `/log` |
| "write to them", "send Reza a reminder", "confirm the booking" | `/draft` |
| "bring our XTRF data across" | `/import` |
| "export everything" | `/export` |
| "add a field", "change a rate", "add Dari" | `/customise` |
| "a page that shows..." | `/new-view` |

If an ask fits nothing here, run the CLI directly (`node scripts/agency.mjs help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never invent a NAATI number, an expiry, a word count or a timesheet. Read it off the record, the CAT tool analysis or the signed timesheet the operator gives you, say it back, then record it.
- The gates (revision by a second linguist, NAATI certification for certified work, interpreter credential and court rank, double booking, confidentiality agreement, competence record, credit hold) have no force flag. The fix is the record or a different linguist, never a workaround.
- Client documents and session details are confidential. Never paste them into drafts beyond what the message needs.
- Money is ex GST everywhere; GST is added on the tax invoice. Interpreting is billed by the minimum, then 15 minute steps.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off XTRF.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/xtrf
