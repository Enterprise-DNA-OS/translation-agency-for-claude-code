#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.
//
// The seed is relative to current_date, so every assertion here holds whatever
// day you run it. New refs are read back from the CLI, never computed here.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'agency-smoke-'));
const scratch = mkdtempSync(path.join(tmpdir(), 'agency-smoke-files-'));
const env = { ...process.env, DATA_DIR: dataDir, OUTPUT_DIR: scratch };
delete env.DATABASE_URL; // the smoke test always runs embedded

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json && !expectFail ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status === 1 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const A = (...a) => ['agency.mjs', ...a];

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });
  run('help', A('help'), { json: false });

  // ---- the numbers -------------------------------------------------------------

  const stats = run('stats', A('stats'));
  assert(stats.clients === 8 && stats.linguists === 12, `eight clients, twelve linguists (${stats.clients}, ${stats.linguists})`);
  assert(stats.attention === 18 && stats.rank_one === 4, `eighteen items, four at rank 1 (${stats.attention}, ${stats.rank_one})`);
  assert(stats.invoices_overdue === 2 && stats.projects_late === 1 && stats.credentials_renewing === 1, 'two overdue invoices, one late project, one credential to renew');

  const attention = run('attention', A('attention'));
  assert(attention[0].rank === 1, 'rank 1 leads');
  const reasons = attention.map((a) => a.reason);
  for (const r of ['BOOKING UNCOVERED', 'INTERPRETER NOT CREDENTIALED', 'CERTIFIED, TRANSLATOR NOT CERTIFIED', 'PAST DUE', 'DUE SOON, NOT READY', 'JOB LATE', 'NO REVISER',
    'NO TIMESHEET', 'CREDENTIAL EXPIRING', 'NO CONFIDENTIALITY AGREEMENT', 'QUOTE NO REPLY', 'QUOTE LAPSED', 'UNBILLED', 'INVOICE OVERDUE', 'THIN MARGIN', 'ON HOLD WITH WORK']) {
    assert(reasons.includes(r), `attention names ${r}`);
  }
  assert(attention.find((a) => a.reason === 'THIN MARGIN').label === 'P-1001', 'the wine client\'s brochure is the thin one');

  const tomorrow = run('today --date=tomorrow', A('today', '--date=tomorrow'));
  assert(tomorrow.bookings.length === 1 && tomorrow.bookings[0].interpreter === 'NOBODY', 'tomorrow has one booking with nobody on it');
  run('today', A('today'));
  assert(run('projects', A('projects')).length === 6, 'six open projects');
  assert(run('projects --all', A('projects', '--all')).length === 11, 'eleven projects');
  const p1004 = run('project P-1004', A('project', 'P-1004'));
  assert(p1004.certified && !p1004.revision_ok && p1004.jobs.length === 2, 'P-1004 is certified, not revised, two jobs');
  const quotes = run('quotes', A('quotes'));
  assert(quotes.quotes.length === 4 && quotes.won === 1 && quotes.decided === 2, `four live quotes, won one of two (${quotes.quotes.length})`);
  assert(run('linguists', A('linguists')).length === 12, 'twelve on the panel');
  assert(run('linguists --lang=zh', A('linguists', '--lang=zh')).length === 2, 'two in Chinese');
  const wei = run('linguist Wei', A('linguist', 'Wei'));
  assert(wei.credentials.length === 3 && wei.pairs.length === 2, 'Wei has three credentials and two directions');
  run('linguist ambiguous lists and exits 1', A('linguist', 'a'), { expectFail: true });
  const creds = run('credentials', A('credentials'));
  assert(creds.length === 2 && creds[0].state === 'expired' && creds[1].days_left === 25, 'one expired, one ending in 25 days');
  run('credentials --all', A('credentials', '--all'));
  const fa = run('find fa en --certified', A('find', 'fa', 'en', '--certified'));
  assert(fa.length === 1 && fa[0].can_take.startsWith('no'), 'nobody can take Persian certified work');
  const zh = run('find zh en --certified', A('find', 'zh', 'en', '--certified'));
  assert(zh.length === 2 && zh.every((r) => r.can_take === 'yes'), 'two can take Chinese certified work');
  assert(run('find vi --interpreting --setting=court', A('find', 'vi', '--interpreting', '--setting=court')).length === 0, 'no Vietnamese court interpreter');
  assert(run('find so --interpreting', A('find', 'so', '--interpreting')).length === 1, 'one Somali interpreter');
  assert(run('bookings', A('bookings')).length === 5, 'five bookings ahead');
  run('clients', A('clients'));
  const kes = run('client Kestrel', A('client', 'Kestrel'));
  assert(kes.projects.length === 3, 'Kestrel has three projects');
  const margins = run('margins', A('margins'));
  assert(margins.thin[0].ref === 'P-1001' && n(margins.thin[0].margin_pct) === 20, 'P-1001 leaves 20%');
  const inv = run('invoices', A('invoices', '--open'));
  assert(inv.invoices.length === 4 && inv.unbilled.length === 4, `four open invoices, four unbilled items (${inv.invoices.length}, ${inv.unbilled.length})`);
  assert(run('payables', A('payables')).owed.length === 6, 'six linguists owed');
  run('settings', A('settings'));

  const comp = run('compliance', A('compliance'));
  const st = Object.fromEntries(comp.map((c) => [c.rule, c.status]));
  assert(st.revision === 'BREACH' && comp.find((c) => c.rule === 'revision').breaches[0].record === 'P-0990', 'the old driver handbook went out unrevised');
  assert(st['certified-translator'] === 'BREACH' && st['interpreter-credential'] === 'BREACH' && st['credential-currency'] === 'BREACH' && st.confidentiality === 'BREACH', 'four more breaches');
  assert(st['translator-competence'] === 'PASS', 'competence is on record for everyone working');

  // ---- the gates ---------------------------------------------------------------

  run('quote for a client on hold: refused', A('quote', 'Northline', '--from=en', '--to=pa', '--words=500'), { expectFail: true });
  run('project for a client on hold: refused', A('project', 'new', 'Northline', '--from=en', '--to=pa', '--words=500'), { expectFail: true });
  run('booking for a client on hold: refused', A('book', 'Northline', '--lang=pa', '--mode=phone', '--at=tomorrow 10:00'), { expectFail: true });
  const self = run('the translator revising their own work: refused', A('assign', 'P-1007-R', 'Hana'), { expectFail: true });
  assert(/second linguist/.test(self.stderr), 'names ISO 17100 revision');
  run('a linguist outside their pair: refused', A('assign', 'P-1007-R', 'Wei'), { expectFail: true });
  run('deliver before revision: refused', A('deliver', 'P-1007'), { expectFail: true });
  run('revision before the translation is done: refused', A('done', 'P-1008-R'), { expectFail: true });
  const court = run('a provisional interpreter in court: refused', A('interpreter', 'B-5003', 'Lina'), { expectFail: true });
  assert(/Certified Interpreter/.test(court.stderr), 'names the court rule');
  run('an Arabic interpreter on a Vietnamese booking: refused', A('interpreter', 'B-5003', 'Omar'), { expectFail: true });
  run('a timesheet before the booking: refused', A('timesheet', 'B-5009', '--minutes=60'), { expectFail: true });
  run('accepting a lapsed quote: refused', A('quote', 'accept', 'Q-2002'), { expectFail: true });
  run('cancel with no reason: refused', A('cancel', 'B-5008'), { expectFail: true });

  // A new Korean reviser: every missing record named at once, then fixed.
  const park = run('linguist add Min-jun Park', A('linguist', 'add', 'Min-jun Park', '--email=minjun.park@example.com'));
  const bare = run('the new reviser before their records: refused', A('assign', 'P-1007-R', park.ref), { expectFail: true });
  assert(/confidentiality/.test(bare.stderr) && /competence/.test(bare.stderr) && /does not work ko > en/.test(bare.stderr), 'every missing record named at once');
  run('record pair, competence and agreement', A('linguist', 'set', park.ref, '--pair=ko>en', '--competence=translation degree', '--nda=today'));
  const rev = run('assign P-1007-R to Min-jun', A('assign', 'P-1007-R', park.ref));
  assert(rev.cost_cents === 8000, `2,000 words at 4c is $80 (${rev.cost_cents})`);
  run('Min-jun finishes the revision', A('done', 'P-1007-R'));
  const del = run('deliver P-1007', A('deliver', 'P-1007'));
  assert(del.delivered_on, 'delivered');

  // Spanish bank statements: the agreement comes back, translation then revision, delivered.
  run('Daniel\'s agreement is back', A('linguist', 'set', 'Daniel', '--nda=today'));
  assert(run('compliance confidentiality', A('compliance', 'confidentiality'))[0].status === 'PASS', 'confidentiality passes');
  run('Daniel finishes, 1,520 words', A('done', 'P-1008-T', '--words=1520'));
  run('Sofia finishes the revision', A('done', 'P-1008-R'));
  run('deliver P-1008', A('deliver', 'P-1008'));

  // Certified Persian: Reza's renewed credential, then the gate opens.
  run('open a certified Persian project', A('project', 'new', 'Kestrel', '--from=fa', '--to=en', '--certified', '--pages=2', '--due=+4', '--title=Marriage certificate'), { json: false });
  const newP = run('project list after', A('projects')).find((p) => p.title === 'Marriage certificate');
  assert(newP && newP.certified, 'the project opened');
  run('Reza on a certified job with a lapsed credential: refused', A('assign', `${newP.ref}-T`, 'Reza'), { expectFail: true });
  run('Reza recertified', A('credential', 'add', 'Reza', '--type=CT', '--from=fa', '--to=en', '--expires=+1095', '--number=CPN5R6S7T'));
  const ok = run('Reza on the certified job', A('assign', `${newP.ref}-T`, 'Reza'));
  assert(ok.cost_cents === 7600, `two pages at $38 (${ok.cost_cents})`);
  assert(run('compliance certified-translator', A('compliance', 'certified-translator'))[0].status === 'PASS', 'certified-translator passes after renewal');
  assert(!run('attention after renewal', A('attention')).some((a) => a.reason === 'CERTIFIED, TRANSLATOR NOT CERTIFIED'), 'the rank 1 item is gone');

  // ---- interpreting --------------------------------------------------------------

  const amina = run('Amina on the Somali booking', A('interpreter', 'B-5004', 'Amina'));
  assert(amina.interpreter === 'Amina Warsame', 'covered');
  const second = run('a second Somali booking half an hour later', A('book', 'Eastern Health', '--lang=so', '--mode=onsite', '--setting=medical', '--at=tomorrow 14:30', '--minutes=60', '--address=Eastern Health Maternity'));
  const clash = run('Amina double booked: refused', A('interpreter', second.ref, 'Amina'), { expectFail: true });
  assert(/is on B-5004/.test(clash.stderr), 'names the clash');
  const cancelCourt = run('cancel the court booking with two days notice', A('cancel', 'B-5003', '--why=No Certified Interpreter available; the court is booking through its own list'));
  assert(cancelCourt.late === false && cancelCourt.price_cents === null, 'no charge with two days notice');
  const ts = run('timesheet the phone job, 40 minutes', A('timesheet', 'B-5005', '--minutes=40'));
  assert(ts.billed_minutes === 45 && ts.price_cents === 6375 && ts.cost_cents === 3600, `45 minutes billed, $63.75 and $36 (${JSON.stringify(ts)})`);
  const tonight = run('a video booking late tonight', A('book', 'Eastern Health', '--lang=zh', '--mode=video', '--setting=medical', '--at=today 23:30', '--minutes=60'));
  run('Wei on it', A('interpreter', tonight.ref, 'Wei'));
  run('a cancellation time in the future: refused', A('cancel', tonight.ref, '--why=x', '--at=+1 06:00'), { expectFail: true });
  const late = run('cancelled by phone at midnight, under 24 hours before', A('cancel', tonight.ref, '--why=Patient rescheduled', '--at=today 00:00'));
  assert(late.late && late.price_cents === 10000 && late.cost_cents === 5500, `charged the video minimum (${JSON.stringify(late)})`);

  // ---- quotes ------------------------------------------------------------------

  const q = run('quote Fernhill 1,000 words en > ja', A('quote', 'Fernhill', '--from=en', '--to=ja', '--words=1000', '--title=Tasting notes'));
  assert(q.amount_cents === 20000, `Fernhill's own rate, 20c a word (${q.amount_cents})`);
  run('send it', A('quote', 'send', q.ref));
  const acc = run('accept it', A('quote', 'accept', q.ref, '--po=FW-118'));
  assert(acc.project, 'a project opened from the quote');
  assert(run('the new project', A('project', acc.project)).jobs.length === 2, 'with a translation and a revision');
  run('decline Q-2002', A('quote', 'decline', 'Q-2002', '--why=Went in-house'));

  // ---- money -------------------------------------------------------------------

  const dry = run('bill --dry-run', A('bill', '--dry-run'));
  assert(dry.invoices.length === 5, `five clients to bill (${dry.invoices.length})`);
  assert(run('bill after the test run', A('bill', '--dry-run')).invoices.length === 5, 'the test run saved nothing');
  const bill = run('bill', A('bill'));
  assert(bill.invoices.length === 5, 'five draft invoices');
  assert(run('bill again', A('bill')).invoices.length === 0, 'nothing billed twice');
  const eastern = bill.invoices.find((i) => i.client === 'Eastern Health Network');
  assert(eastern.lines === 3 && eastern.total_cents === 52000, `Eastern: two Arabic sessions and a late video cancellation, $520 (${JSON.stringify(eastern)})`);
  run('issue it', A('invoice', 'issue', eastern.ref));
  run('paid', A('invoice', 'paid', eastern.ref));
  run('paid twice: refused', A('invoice', 'paid', eastern.ref), { expectFail: true });
  run('INV-2990 paid', A('invoice', 'paid', 'INV-2990'));
  run('release Northline', A('release', 'Northline'));
  const nl = run('project for Northline now', A('project', 'new', 'Northline', '--from=en', '--to=pa', '--words=600', '--due=+6'));
  assert(nl.price_cents === 19200, `600 words at tier B, 32c (${nl.price_cents})`);
  run('hold Northline again', A('hold', 'Northline', '--why=testing the hold'));

  const pay = run('pay-run', A('pay-run'));
  assert(pay.pay_runs.length >= 8, `a pay run per linguist owed (${pay.pay_runs.length})`);
  assert(run('pay-run again', A('pay-run')).pay_runs.length === 0, 'nobody paid twice');
  run('pay a run before approval: refused', A('pay-run', 'paid', pay.pay_runs[0].ref), { expectFail: true });
  run('approve', A('pay-run', 'approve', pay.pay_runs[0].ref));
  run('paid', A('pay-run', 'paid', pay.pay_runs[0].ref));

  // ---- paper ---------------------------------------------------------------------

  for (const [what, ref] of [['overdue', 'INV-3000'], ['quote', 'Q-2001'], ['confirm', 'B-5004'], ['offer', 'P-1006-T'], ['recert', 'Hana']]) {
    const d = run(`draft ${what} ${ref}`, A('draft', what, ref));
    assert(d.draft && d.to, `draft ${what} has a recipient`);
  }
  run('draft overdue on a paid invoice: refused', A('draft', 'overdue', 'INV-3001'), { expectFail: true });
  run('log', A('log', 'Kestrel', 'Anh wants the Persian certificate by Friday'));
  assert(run('history', A('history', 'Persian')).length >= 1, 'the note is in the history');
  run('setting set', A('setting', 'set', 'target_margin_pct', '35'));
  assert(!run('margins at 35', A('margins')).thin.some((t) => t.ref.startsWith('B-')), 'at 35% the interpreting is no longer thin');

  // ---- import and export -----------------------------------------------------------

  const clients = path.join(scratch, 'clients.csv');
  const vendors = path.join(scratch, 'vendors.csv');
  const projects = path.join(scratch, 'projects.csv');
  writeFileSync(clients, '﻿ID,Name,Email,Phone,Payment Terms\r\n1001,Kestrel Migration,accounts@kestrelmigration.example,,14 days\r\n1002,Harbour Bridge Law,reception@harbourbridgelaw.example,02 9000 1000,30\r\n1003,,nobody@example.com,,\r\n');
  writeFileSync(vendors, 'Name,Email,Language Combinations\r\nThanh Le,thanh.le@example.com,"Vietnamese > English; English > Vietnamese"\r\nAna Souza,ana@example.com,Portuguese > English\r\n');
  writeFileSync(projects, `Project ID,Name,Client,Source Language,Target Languages,Deadline,Status,Total Agreed\r\nX-881,Affidavit,Harbour Bridge Law,Chinese (Simplified),English,${new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)},Open,450.00\r\nX-870,Contract pack,Harbour Bridge Law,English,"Chinese (Simplified), Arabic",2026-01-15,Closed,1200.00\r\nX-871,Brochure,Nobody Pty Ltd,English,Arabic,2026-01-15,Closed,300\r\n`);
  const test = run('import xtrf --dry-run', A('import', 'xtrf', `--clients=${clients}`, `--vendors=${vendors}`, `--projects=${projects}`, '--dry-run'));
  assert(test.dry_run && test.created.clients === 1 && test.updated.clients === 1 && test.created.linguists === 2 && test.created.pairs === 2 && test.created.projects === 3, `test run counts (${JSON.stringify(test)})`);
  assert(test.skipped.length === 3, `three rows skipped and named (${JSON.stringify(test.skipped)})`);
  assert(run('nothing saved by the test run', A('clients')).length === 8, 'still eight clients');
  run('import xtrf', A('import', 'xtrf', `--clients=${clients}`, `--vendors=${vendors}`, `--projects=${projects}`));
  const again = run('import xtrf again', A('import', 'xtrf', `--clients=${clients}`, `--vendors=${vendors}`, `--projects=${projects}`));
  assert(again.created.clients === 0 && again.created.linguists === 0 && again.created.projects === 0, 'the second pass creates nothing');
  assert(run('compliance revision after import', A('compliance', 'revision'))[0].breaches.length === 1, 'imported history is not counted as unrevised');

  const ex = run('export', A('export', `--out=${path.join(scratch, 'export')}`));
  assert(ex.counts.projects >= 15 && existsSync(path.join(scratch, 'export', 'credentials.csv')), 'export writes every table');

  run('view', ['view.mjs'], { json: false });
  run('docs', ['docs.mjs'], { json: false });
  assert(readdirSync(path.join(scratch, 'docs-out', 'certification')).length === 2, 'a certification statement per certified delivery');
  assert(readdirSync(path.join(scratch, 'views')).length === 3, 'three views');

  console.log(`\nPASS  ${step} steps`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
