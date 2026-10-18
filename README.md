<h1 align="center">Translation Agency for Claude Code</h1>

<p align="center">
  <strong>The open-source translation and interpreting agency system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your XTRF data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=xtrf">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/xtrf?utm_source=github&utm_medium=readme&utm_campaign=xtrf">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-xtrf">Instead of XTRF</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Translation Agency for Claude Code does the job you pay XTRF for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the XTRF dashboard cannot.

XTM, which now owns XTRF, publishes no price for it: "Pricing tailored to your project, vendor and financial management requirements" ([xtm.ai/pricing](https://xtm.ai/pricing), checked October 2026). Whatever your quote says, it is a rent on your own clients, linguists and projects, every year.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=xtrf).

This one is for translation and interpreting agencies of five to fifty people: the clients and their rates, the linguist panel with each person's language directions, NAATI credentials, competence record and confidentiality agreement, quotes, projects split into a translation job and a revision job, interpreting bookings, timesheets, late cancellations, client invoices and linguist pay runs. Underneath it is the number the dashboard never leads with: what each client, language and service leaves after paying the linguists. The rules are built in as gates with their sources cited: nobody revises their own translation (ISO 17100), a certified translation goes only to a NAATI Certified Translator in that direction, a court booking gets a Certified Interpreter or above, and nobody works without a confidentiality agreement on file. Accounting stays where it is; one export hands it the invoices.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/translation-agency-for-claude-code.git
cd translation-agency-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo agency has a Somali maternity booking tomorrow with nobody on it, a Vietnamese court booking given to a provisional interpreter, police certificates for a visa given to a translator whose NAATI certification lapsed ten days ago, a Japanese price list two days late, a Korean contract translated with nobody revising it, a phone job finished with no timesheet, a Spanish translator working with no confidentiality agreement, a quote nobody chased, and a wine exporter's rate that leaves 20% after paying the translator and reviser. The answer shows you exactly how this system thinks.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first. An uncovered booking or an uncertified certified translation outranks everything |
| `/today` | The day's bookings and who is on each, jobs due, projects due back |
| `/quote` `/quotes` | Price a translation from the client's rate, draft the email, chase what is out |
| `/project` | Open a project (translation plus revision), or show one project's card |
| `/find` | Who can take this: by direction and NAATI certification, or by language, setting and time |
| `/assign` `/done` `/deliver` | Give out jobs, finish them, deliver, with the revision and certification gates |
| `/book` `/interpreter` `/timesheet` | Interpreting: book, put a credentialed interpreter on, record the minutes |
| `/bookings` `/cancel` | What is ahead; cancel with the reason, late ones charged at the minimum |
| `/panel` `/credentials` | The linguists, their directions, NAATI credentials, competence and agreements; renewals due |
| `/client` | A client's whole card |
| `/margins` | What each client, language and service leaves after paying the linguists |
| `/bill` `/invoices` `/hold` | Draft invoices from finished work, what is owed, credit holds |
| `/pay-run` | Pay the linguists for finished work, with remittance advice |
| `/compliance` | The rule book run against the records, sources cited |
| `/weekly-review` | The Monday review written from eight commands |
| `/log` `/draft` | Notes on the record; quotes, confirmations, job offers, reminders to `drafts/`, never sent |
| `/import` `/export` | Bring the business across from XTRF, test run first; everything out as CSV |
| `/customise` | Change a field, a rate, a rule, in plain language |
| `/new-view` | A new read-only dashboard page, described in plain language |

`npm run view` renders three branded dashboards (the week, money, the panel). `npm run docs` renders the paperwork: quotes, the certification statement for each certified translation with the translator's NAATI number, tax invoices, and remittance advice for each linguist pay run.

## Instead of XTRF

Export the Clients, Vendors and Projects views from XTRF as CSV (every XTRF view has an Export button), then:

```bash
node scripts/agency.mjs import xtrf --clients=clients.csv --vendors=vendors.csv --projects=projects.csv --dry-run
node scripts/agency.mjs import xtrf --clients=clients.csv --vendors=vendors.csv --projects=projects.csv
```

The importer matches common column-name variants, reads each vendor's language combinations as the directions they work in, splits a project with several target languages into one per language, runs as one transaction, is idempotent (re-running updates instead of duplicating), and names every row it skips. NAATI credentials, competence and confidentiality agreements are entered from the source records, on purpose: every gate rests on them. [docs/replace-xtrf.md](docs/replace-xtrf.md) covers exactly what carries over and what starts fresh.

### Ten questions your agency dashboard cannot answer

Each is one plain-language ask away in Claude Code, because the record is a database you own:

1. Which interpreting bookings in the next 48 hours have nobody on them?
2. Which court and legal bookings have an interpreter below Certified Interpreter?
3. Which certified translations sit with a translator whose NAATI certification will have lapsed by the due date?
4. Which translations are finished and waiting with nobody revising them?
5. Which NAATI credentials run out in the next 90 days, and whose work is booked on them?
6. What does each client leave after paying the linguists, and which client rate is under our target?
7. Which language pairs have only one linguist, so a revision has nobody to do it?
8. Who on the panel can take Persian certified work today?
9. Which finished projects, sessions and late cancellations have not been invoiced?
10. What do we owe each linguist, and for which jobs?

## Your first hour: ten things to ask for

1. "Walk me through everything on the attention list and what clears each one."
2. "Who can cover the Somali booking at Eastern Health tomorrow at 2?"
3. "Reza has renewed: NAATI CT Persian into English, CPN5R6S7T, to October 2029."
4. "Quote Kestrel Migration for three Chinese certificates, certified, for a partner visa."
5. "Book a Vietnamese interpreter for Collins Street Legal, County Court, Thursday 10am, three hours."
6. "Hana finished the Korean contract. Who can revise it?"
7. "What did Fernhill Wines leave us after paying the translators this quarter?"
8. "Draft the invoices for everything finished up to Friday."
9. "Raise Fernhill's rate to 26 cents a word from next month." (a one-line `/customise`)
10. "Add a page that shows each interpreter's sessions and hours by week."

## Architecture

```
translation-agency-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Translation Agency for Claude Code for your business, migrates your XTRF data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=xtrf)
- Read more: [enterprisedna.co/omni/instead-of/xtrf](https://enterprisedna.co/omni/instead-of/xtrf?utm_source=github&utm_medium=readme&utm_campaign=xtrf)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
