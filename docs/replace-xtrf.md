# Moving off XTRF

Switch in a day: export three views, run one import twice (a test run, then the real one), then complete each linguist's record before anyone gets work. XTRF can stay read-only for history until you are sure.

## 1. Export from XTRF

Every XTRF view exports to CSV: open the view, click Export, pick CSV with comma. (XTRF documents this under Data import and export in its knowledge base.) If accented names come out wrong, set the CSV export encoding to UTF-8 under Configuration, General Configuration, Settings, Defaults, Files.

| File | The XTRF view | Columns the importer looks for |
|---|---|---|
| `clients.csv` | Clients | ID, Name, Email, Phone, Contact Person, Tax No, Payment Terms |
| `vendors.csv` | Vendors | Name, Email, Phone, Tax No, Language Combinations (or Source Language and Target Language) |
| `projects.csv` | Projects (open and closed) | Project ID, Name, Client, Source Language, Target Languages, Deadline, Status, Total Agreed, Words |

Add the columns to each view before exporting if they are not shown. Each column also matches common variants (Client Name, Full Name, Language Pairs, Project Name, Due Date, Total). If a file uses other names, rename the header row in a copy and keep the original as it came out.

## 2. Test run, then import

```bash
node scripts/agency.mjs import xtrf --clients=clients.csv --vendors=vendors.csv --projects=projects.csv --dry-run
node scripts/agency.mjs import xtrf --clients=clients.csv --vendors=vendors.csv --projects=projects.csv
```

The import runs as one transaction and names every row it skipped and why: a project whose client is not in the clients file, a language that is not in the languages table yet (add it with `/customise`, then run again). Run it a second time: it must create nothing new. Clients and linguists match on name, projects on their XTRF project ID.

## What maps

- **Clients**: name, email, phone, contact, tax number, payment terms in days.
- **Vendors** become linguists: name, email, phone, tax number, and every language combination as a direction they work in ("Chinese (Simplified) > English; English > Chinese (Simplified)").
- **Projects**: one project per target language, with the agreed total shared across them. Open projects arrive with a translation job and a revision job, ready to assign. Closed projects arrive delivered and are marked as imported, so the revision rule does not count history whose revision record lives in XTRF.

## What does not carry over, on purpose

- **NAATI credentials, competence and confidentiality agreements.** Each linguist is entered from the NAATI record and your own files (`linguist set`, `credential add`), because every gate rests on them. Until they are, nobody can be given work.
- **Rates.** New linguists start on the panel's usual pay rates; the client price list is entered from your rate card. Both are the numbers your margin rests on.
- **Interpreting bookings.** Book the ones ahead of you with `book`; past bookings stay in XTRF.
- **Files, CAT tool links and the client and vendor portals.** The free version holds the records, not the documents. Enterprise DNA connects your file storage and builds the portals into your version.
- **Invoices and payments.** They stay in your accounts system. New invoices are drafted here from finished work.

## After the import

1. `node scripts/agency.mjs linguists`: every linguist, and what is missing on each.
2. `credentials --all`: every NAATI expiry, once entered.
3. `attention` and `compliance`: the first audit of the old data.
