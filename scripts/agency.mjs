#!/usr/bin/env node
// translation-agency-for-claude-code: the one CLI. Claude Code slash commands
// call this; so can you.
//
//   node scripts/agency.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This is a translation and interpreting agency the way XTRF sells it: clients,
// the linguist panel with its language pairs, NAATI credentials and rates, the
// price list, quotes, projects split into translation and revision jobs,
// interpreting bookings, client invoices, linguist pay runs and a log. It sends
// nothing and connects to nothing: quotes, confirmations and reminders draft to
// drafts/, a person sends them.
//
// The gates, and there are no force flags:
//   * a translation is revised by a second linguist before it is delivered
//     (ISO 17100 clause 5.3.3), and nobody revises their own work
//   * a translator or reviser has their competence on record (ISO 17100
//     clause 3.1.4) and works only in the directions on their panel record
//   * a certified translation goes only to a translator holding a NAATI
//     Certified Translator credential in that direction, current on the due
//     date, and is delivered only while it is still current
//   * an interpreter is booked only with a NAATI interpreting credential for
//     the language, current on the day; court and legal work needs a Certified
//     Interpreter or a specialist (setting court_min_rank)
//   * no interpreter is double booked, and nobody works without a signed
//     confidentiality agreement on file
//   * nothing new is quoted, opened or booked for a client on credit hold
//   * no deleting: projects, jobs and bookings cancel with a reason, invoices void

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, price, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Arguments, errors, small parsers

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'open', 'certified', 'interpreting']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { flags.help = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) { name = a.slice(2, eq); value = a.slice(eq + 1); }
      else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else args.push(a);
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const pct = (v) => (v === null || v === undefined ? '' : `${Number(v).toFixed(1)}%`);
let CUR = 'AUD';
const $ = (c) => money(c, CUR);
const $$ = (c) => price(c, CUR);

function parseInt0(v, what) {
  if (v === undefined || v === null || v === true || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  if (!Number.isInteger(n) || n < 0) throw new CliError(`Cannot read ${what} "${v}". Use a whole number, for example 1200.`);
  return n;
}

let TODAY = null;
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s === 'today') return TODAY;
  if (s === 'tomorrow') return addDays(TODAY, 1);
  if (s === 'yesterday') return addDays(TODAY, -1);
  const rel = s.match(/^([+-]\d+)d?$/);
  if (rel) return addDays(TODAY, Number(rel[1]));
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // Australia and New Zealand write DD/MM/YYYY
  if (slash) {
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    const [day, month] = [Number(slash[1]), Number(slash[2])];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  throw new CliError(`Cannot read ${what} "${v}". Use YYYY-MM-DD, DD/MM/YYYY, today, tomorrow or +3.`);
}
// "2026-10-20 10:00", "tomorrow 14:00", "+2 9:30"
function parseWhen(v) {
  if (!v || v === true) throw new CliError('Say when: --at="YYYY-MM-DD HH:MM" or --at="tomorrow 14:00".');
  const m = String(v).trim().match(/^(.+?)[ T](\d{1,2}):(\d{2})$/);
  if (!m) throw new CliError(`Cannot read "${v}". Use "YYYY-MM-DD HH:MM" or "tomorrow 14:00".`);
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  if (hh > 23 || mm > 59) throw new CliError(`Cannot read the time in "${v}".`);
  return `${parseDate(m[1])} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}
const dayLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${String(iso).slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
};
const hm = (ts) => String(ts || '').slice(11, 16);

function out(flags, data, render) {
  if (flags.json) console.log(JSON.stringify(data, null, 2));
  else render(data);
}

async function setting(db, key, dflt) {
  const [r] = await db.query('select value from settings where key = $1', [key]);
  return r ? r.value : dflt;
}

async function logActivity(db, subject, text) {
  await db.query('insert into activity (subject, text) values ($1, $2)', [subject, text]);
}

async function nextRef(db, tableName, prefix, width = 4) {
  const [r] = await db.query(`select coalesce(max(nullif(regexp_replace(ref, '\\D', '', 'g'), '')::int), 0) as n from ${tableName} where ref ~ $1`, [`^${prefix}\\d+$`]);
  return `${prefix}${String(Number(r.n) + 1).padStart(width, '0')}`;
}

// ---------------------------------------------------------------------------
// Finding things: refs, partial refs and names, case-insensitive. Ambiguous
// matches list the candidates and exit 1.

function findOne(what, rows, q, label) {
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new CliError(`No ${what} matches "${q}".`);
  throw new CliError(`"${q}" matches ${rows.length} ${what}s. Say which:\n${rows.map((r) => `  ${label(r)}`).join('\n')}`);
}

async function findClient(db, q) {
  if (!q) throw new CliError('Name the client (name or C-ref).');
  const exact = await db.query(`select * from clients where lower(ref) = lower($1) or lower(name) = lower($1)`, [q]);
  if (exact.length === 1) return exact[0];
  const rows = await db.query(`select * from clients where name ilike $1 or ref ilike $1 order by name`, [`%${q}%`]);
  return findOne('client', rows, q, (r) => `${r.ref}  ${r.name}`);
}

async function findLinguist(db, q) {
  if (!q) throw new CliError('Name the linguist (name or L-ref).');
  const exact = await db.query(`select * from linguists where lower(ref) = lower($1) or lower(name) = lower($1)`, [q]);
  if (exact.length === 1) return exact[0];
  const rows = await db.query(`select * from linguists where name ilike $1 or ref ilike $1 order by name`, [`%${q}%`]);
  return findOne('linguist', rows, q, (r) => `${r.ref}  ${r.name}`);
}

async function findLanguage(db, q) {
  if (!q || q === true) throw new CliError('Name the language (code like zh, or name like Mandarin).');
  const rows = await db.query(`select * from languages where lower(code) = lower($1) or lower(name) = lower($1)`, [q]);
  if (rows.length) return rows[0];
  const like = await db.query(`select * from languages where name ilike $1 order by name`, [`%${q}%`]);
  return findOne('language', like, q, (r) => `${r.code}  ${r.name}`);
}

async function findProject(db, q) {
  if (!q) throw new CliError('Name the project (P-ref).');
  const rows = await db.query(`select * from v_projects where lower(ref) = lower($1) or lower(ref) = lower('P-' || $1)`, [q]);
  if (rows.length) return rows[0];
  const like = await db.query(`select * from v_projects where ref ilike $1 or title ilike $1 order by ref`, [`%${q}%`]);
  return findOne('project', like, q, (r) => `${r.ref}  ${r.client}  ${r.title}  ${r.status}`);
}

async function findJob(db, q) {
  if (!q) throw new CliError('Name the job (P-1004-T for the translation, P-1004-R for the revision).');
  const rows = await db.query(`select j.*, p.ref as project, p.title, p.certified, p.source_lang, p.target_lang, p.due_on as project_due, p.status as project_status, p.client_id
                                 from jobs j join projects p on p.id = j.project_id where lower(j.ref) = lower($1)`, [q]);
  if (rows.length) return rows[0];
  const like = await db.query(`select j.*, p.ref as project, p.title, p.certified, p.source_lang, p.target_lang, p.due_on as project_due, p.status as project_status, p.client_id
                                 from jobs j join projects p on p.id = j.project_id where j.ref ilike $1 order by j.ref`, [`%${q}%`]);
  return findOne('job', like, q, (r) => `${r.ref}  ${r.step}  ${r.title}  ${r.status}`);
}

async function findBooking(db, q) {
  if (!q) throw new CliError('Name the booking (B-ref).');
  const rows = await db.query(`select * from v_bookings where lower(ref) = lower($1) or lower(ref) = lower('B-' || $1)`, [q]);
  if (rows.length) return rows[0];
  const like = await db.query(`select * from v_bookings where ref ilike $1 order by starts_at`, [`%${q}%`]);
  return findOne('booking', like, q, (r) => `${r.ref}  ${r.client}  ${r.language}  ${r.starts_at}`);
}

async function findQuote(db, q) {
  const rows = await db.query(`select * from v_quotes where lower(ref) = lower($1) or ref ilike $2 order by ref`, [q || '', `%${q || ''}%`]);
  const exact = rows.filter((r) => r.ref.toLowerCase() === String(q).toLowerCase());
  return exact.length ? exact[0] : findOne('quote', rows, q, (r) => `${r.ref}  ${r.client}  ${r.title}  ${r.status}`);
}

// ---------------------------------------------------------------------------
// Prices and costs

async function tierOf(db, ...langs) {
  const [r] = await db.query(`select max(tier) as tier from languages where code = any($1)`, [langs]);
  return r.tier || 'A';
}

async function clientRate(db, clientId, service, tier) {
  const [r] = await db.query(`select * from price_list where service = $2 and tier = $3 and (client_id = $1 or client_id is null)
                               order by client_id is null limit 1`, [clientId, service, tier]);
  if (!r) throw new CliError(`No ${service} price for tier ${tier} on the price list. Add one with /customise.`);
  return r;
}

async function translationPrice(db, clientId, src, tgt, words, pages, certified) {
  const tier = await tierOf(db, src, tgt);
  const r = await clientRate(db, clientId, certified ? 'certified' : 'translation', tier);
  const units = certified ? pages : words;
  if (!units) throw new CliError(certified ? 'A certified translation is priced by the page: give --pages.' : 'A translation is priced by the word: give --words.');
  return { tier, rate_cents: r.rate_cents, amount_cents: Math.max(units * r.rate_cents, r.min_cents) };
}

async function linguistRate(db, linguistId, service) {
  const [r] = await db.query(`select * from linguist_rates where linguist_id = $1 and service = $2`, [linguistId, service]);
  if (!r) throw new CliError(`This linguist has no ${service} rate on file. Add one with /customise.`);
  return r;
}

async function jobCost(db, job, linguistId) {
  if (job.step === 'revision') return job.words * (await linguistRate(db, linguistId, 'revision')).rate_cents;
  if (job.certified) return job.pages * (await linguistRate(db, linguistId, 'certified')).rate_cents;
  return job.words * (await linguistRate(db, linguistId, 'translation')).rate_cents;
}

const billable = (minutes, min) => Math.max(min, Math.ceil(minutes / 15) * 15);

async function bookingMoney(db, b, minutes, lateCancel) {
  const tier = await tierOf(db, b.lang);
  const cr = await clientRate(db, b.client_id, b.mode, tier);
  const priceMins = lateCancel ? cr.min_minutes : billable(minutes, cr.min_minutes);
  const result = { price_cents: Math.round((priceMins * cr.rate_cents) / 60), billed_minutes: priceMins, cost_cents: null };
  if (b.linguist_id) {
    const lr = await linguistRate(db, b.linguist_id, b.mode);
    const costMins = lateCancel ? lr.min_minutes : billable(minutes, lr.min_minutes);
    result.cost_cents = Math.round((costMins * lr.rate_cents) / 60);
  }
  return result;
}

// ---------------------------------------------------------------------------
// The gates. Every reason, all at once.

async function holdCheck(db, client) {
  if (client.credit_hold) throw new CliError(`${client.name} is on credit hold (${client.hold_reason || 'no reason recorded'}). Nothing new until it is released.`);
}

async function assignRefusals(db, job, l) {
  const why = [];
  if (job.project_status !== 'open') why.push(`${job.project} is ${job.project_status}`);
  if (job.status === 'done' || job.status === 'cancelled') why.push(`${job.ref} is already ${job.status}`);
  if (l.status !== 'active') why.push(`${l.name} is inactive`);
  if (!l.nda_signed_on) why.push(`${l.name} has no signed confidentiality agreement on file (linguist ${l.ref} --nda=DATE)`);
  if (!l.competence) why.push(`${l.name} has no translator competence on record (ISO 17100 clause 3.1.4: linguist ${l.ref} --competence=...)`);
  const [pair] = await db.query(`select 1 from linguist_pairs where linguist_id = $1 and source_lang = $2 and target_lang = $3`, [l.id, job.source_lang, job.target_lang]);
  if (!pair) why.push(`${l.name} does not work ${job.source_lang} > ${job.target_lang}`);
  if (job.step === 'revision') {
    const [t] = await db.query(`select linguist_id from jobs where id = $1`, [job.revises_id]);
    if (t && t.linguist_id === l.id) why.push(`${l.name} translated it, and a revision is by a second linguist (ISO 17100 clause 5.3.3)`);
  } else {
    const [r] = await db.query(`select linguist_id from jobs where revises_id = $1 and status <> 'cancelled'`, [job.id]);
    if (r && r.linguist_id === l.id) why.push(`${l.name} is revising it, and a revision is by a second linguist (ISO 17100 clause 5.3.3)`);
    if (job.certified) {
      const [ct] = await db.query(`select 1 from credentials where linguist_id = $1 and type = 'CT' and source_lang = $2 and target_lang = $3 and expires_on >= $4`,
        [l.id, job.source_lang, job.target_lang, job.project_due]);
      if (!ct) why.push(`a certified translation needs a NAATI Certified Translator ${job.source_lang} > ${job.target_lang} current on ${job.project_due}, and ${l.name} has none`);
    }
  }
  return why;
}

async function interpreterRefusals(db, b, l) {
  const why = [];
  if (!['open', 'assigned'].includes(b.status)) why.push(`${b.ref} is ${b.status}`);
  if (l.status !== 'active') why.push(`${l.name} is inactive`);
  if (!l.nda_signed_on) why.push(`${l.name} has no signed confidentiality agreement on file`);
  const [c] = await db.query(`select max(interp_rank(type)) as rank, string_agg(type, ', ') as types from credentials
                               where linguist_id = $1 and source_lang = $2 and target_lang = 'en' and interp_rank(type) > 0 and expires_on >= $3::date`,
    [l.id, b.lang, String(b.starts_at).slice(0, 10)]);
  const minRank = Number(await setting(db, 'court_min_rank', 3));
  if (!c.rank) why.push(`${l.name} has no NAATI interpreting credential in ${b.language} current on ${String(b.starts_at).slice(0, 10)}`);
  else if (['court', 'legal'].includes(b.setting) && c.rank < minRank) why.push(`${b.setting} work needs a Certified Interpreter or a specialist, and ${l.name} holds ${c.types}`);
  const buffer = Number(await setting(db, 'travel_buffer_minutes', 30));
  const clash = await db.query(`select ref, starts_at from bookings where linguist_id = $1 and id <> $2 and status = 'assigned'
                                  and starts_at < $4::timestamp + make_interval(mins => $5)
                                  and starts_at + make_interval(mins => minutes_booked + $5) > $3::timestamp`,
    [l.id, b.id, b.starts_at, b.ends_at, buffer]);
  for (const x of clash) why.push(`${l.name} is on ${x.ref} at ${hm(x.starts_at)} that day (with ${buffer} minutes between bookings)`);
  return why;
}

// ---------------------------------------------------------------------------
// Reads

async function cmdStats(db, flags) {
  const [s] = await db.query(`
    select (select count(*) from clients where status = 'active') as clients,
           (select count(*) from linguists where status = 'active') as linguists,
           (select count(*) from projects where status = 'open') as projects_open,
           (select count(*) from bookings where status in ('open', 'assigned') and starts_at >= localtimestamp) as bookings_ahead,
           (select count(*) from v_attention) as attention,
           (select count(*) from v_attention where rank = 1) as rank_one,
           (select count(*) from v_projects where status = 'open' and due_on < current_date) as projects_late,
           (select count(*) from v_quotes where status = 'sent') as quotes_out,
           (select count(*) from v_invoices where days_overdue > 0) as invoices_overdue,
           (select coalesce(sum(amount_cents), 0) from v_unbilled) as unbilled_cents,
           (select coalesce(sum(amount_cents), 0) from v_payables) as payables_cents,
           (select count(*) from v_credentials v join linguists l on l.id = v.linguist_id where l.status = 'active' and v.state = 'renew soon') as credentials_renewing`);
  const data = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)]));
  out(flags, data, (d) => { console.log(heading('Numbers')); for (const [k, v] of Object.entries(d)) console.log(`  ${k.padEnd(22)} ${k.endsWith('cents') ? $(v) : v}`); });
}

async function cmdAttention(db, flags) {
  const rows = await db.query(`select rank, reason, label, who, detail, days from v_attention
                                where ($1::int is null or rank <= $1) order by rank, days desc nulls last, label`, [flags.rank ? Number(flags.rank) : null]);
  out(flags, rows, (r) => {
    console.log(heading('Needs a decision, worst first'));
    if (!r.length) return console.log('\n  Nothing. Every job, booking, credential and invoice is where it should be.');
    for (const a of r) console.log(`\n  [${a.rank}] ${a.reason}  ${a.label}  ${a.who || ''}\n      ${a.detail}`);
  });
}

async function cmdToday(db, flags) {
  const date = parseDate(flags.date || 'today');
  const bookings = await db.query(`select ref, to_char(starts_at, 'HH24:MI') as time, minutes_booked, language, mode, setting, client, coalesce(interpreter, 'NOBODY') as interpreter,
                                          address, onsite_contact, status from v_bookings where on_date = $1 and status <> 'cancelled' order by starts_at`, [date]);
  const due = await db.query(`select ref, step, title, client, coalesce(linguist, 'NOBODY') as linguist, status, source_lang || ' > ' || target_lang as pair
                                from v_jobs where due_on = $1 and status in ('unassigned', 'assigned') order by ref`, [date]);
  const deliveries = await db.query(`select ref, title, client, revision_ok, unassigned, in_progress from v_projects where due_on = $1 and status = 'open' order by ref`, [date]);
  out(flags, { date, bookings, jobs_due: due, projects_due: deliveries }, (d) => {
    console.log(heading(`${dayLabel(d.date)}: interpreting`));
    console.log(table(d.bookings, [
      { key: 'time', label: 'Time' }, { key: 'ref', label: 'Booking' }, { key: 'language', label: 'Language', width: 18 }, { key: 'mode', label: 'Mode' },
      { key: 'setting', label: 'Setting' }, { key: 'client', label: 'Client', width: 24 }, { key: 'interpreter', label: 'Interpreter' }]));
    console.log(heading('Jobs due'));
    console.log(table(d.jobs_due, [{ key: 'ref', label: 'Job' }, { key: 'step', label: 'Step' }, { key: 'pair', label: 'Pair' }, { key: 'title', label: 'Project', width: 30 }, { key: 'linguist', label: 'Linguist' }, { key: 'status', label: 'Status' }]));
    console.log(heading('Due to the client'));
    console.log(table(d.projects_due, [{ key: 'ref', label: 'Project' }, { key: 'title', label: 'Title', width: 30 }, { key: 'client', label: 'Client', width: 24 },
      { key: 'revision_ok', label: 'Revised', format: (v) => (v ? 'yes' : 'NO') }, { key: 'unassigned', label: 'Nobody on', align: 'right' }]));
  });
}

async function cmdProjects(db, flags) {
  const rows = await db.query(`select ref, client, title, source_lang || ' > ' || target_lang as pair, certified, words, pages, due_on, days_to_due, status,
                                      translator, reviser, revision_ok, price_cents, margin_cents
                                 from v_projects where ($1 or status = 'open') order by status, due_on`, [!!flags.all]);
  out(flags, rows, (r) => {
    console.log(heading(flags.all ? 'Projects' : 'Open projects'));
    console.log(table(r, [
      { key: 'ref', label: 'Project' }, { key: 'client', label: 'Client', width: 22 }, { key: 'title', label: 'Title', width: 28 }, { key: 'pair', label: 'Pair' },
      { key: 'certified', label: 'Cert', format: (v) => (v ? 'yes' : '') }, { key: 'due_on', label: 'Due', format: (v, x) => `${v}${x.status === 'open' && x.days_to_due < 0 ? ' LATE' : ''}` },
      { key: 'translator', label: 'Translator', format: (v) => v || 'nobody' }, { key: 'reviser', label: 'Reviser', format: (v) => v || 'nobody' },
      { key: 'price_cents', label: 'Price', align: 'right', format: $ }]));
  });
}

async function cmdProject(db, q, flags) {
  const p = await findProject(db, q);
  const jobs = await db.query(`select ref, step, linguist, status, words, pages, due_on, done_on, cost_cents from v_jobs where project_id = $1 order by step desc`, [p.id]);
  const history = await db.query(`select at, text from activity where subject = $1 order by at`, [`project:${p.ref}`]);
  out(flags, { ...p, jobs, history }, (d) => {
    console.log(heading(`${d.ref}  ${d.title}`));
    console.log(`  ${d.client}, ${d.source_lang} > ${d.target_lang}${d.certified ? ', certified' : ''}${d.purpose ? `, for ${d.purpose}` : ''}`);
    console.log(`  ${d.words} words${d.pages ? `, ${d.pages} pages` : ''}. Received ${d.received_on}, due ${d.due_on}${d.delivered_on ? `, delivered ${d.delivered_on}` : ''}. ${d.status}.`);
    console.log(`  Price ${$$(d.price_cents)}, linguist cost ${$$(d.cost_cents)}, leaves ${$$(d.margin_cents)} (${pct((d.margin_cents * 100) / (d.price_cents || 1))}). Revised by a second linguist: ${d.revision_ok ? 'yes' : 'NOT YET'}.`);
    console.log(table(d.jobs, [{ key: 'ref', label: 'Job' }, { key: 'step', label: 'Step' }, { key: 'linguist', label: 'Linguist', format: (v) => v || 'NOBODY' },
      { key: 'status', label: 'Status' }, { key: 'due_on', label: 'Due' }, { key: 'done_on', label: 'Done' }, { key: 'cost_cents', label: 'Cost', align: 'right', format: (v) => (v === null ? '' : $$(v)) }]));
    for (const h of d.history) console.log(`  ${String(h.at instanceof Date ? h.at.toISOString() : h.at).slice(0, 10)}  ${h.text}`);
  });
}

async function cmdQuotes(db, flags) {
  const rows = await db.query(`select ref, client, title, source_lang || ' > ' || target_lang as pair, amount_cents, status, sent_on, days_since_sent, valid_until, decline_reason
                                 from v_quotes where ($1 or status in ('draft', 'sent')) order by status, sent_on nulls first`, [!!flags.all]);
  const [rate] = await db.query(`select count(*) filter (where status = 'accepted') as won, count(*) filter (where status in ('accepted', 'declined', 'expired')) as decided,
                                        coalesce(sum(amount_cents) filter (where status = 'sent'), 0) as out_cents from quotes`);
  const data = { quotes: rows, won: num(rate.won), decided: num(rate.decided), out_cents: num(rate.out_cents) };
  out(flags, data, (d) => {
    console.log(heading('Quotes'));
    console.log(table(d.quotes, [{ key: 'ref', label: 'Quote' }, { key: 'client', label: 'Client', width: 24 }, { key: 'title', label: 'Title', width: 26 }, { key: 'pair', label: 'Pair' },
      { key: 'amount_cents', label: 'Amount', align: 'right', format: $ }, { key: 'status', label: 'Status' }, { key: 'days_since_sent', label: 'Days out', align: 'right', format: (v) => v ?? '' }, { key: 'valid_until', label: 'Valid to' }]));
    console.log(`\n  ${$(d.out_cents)} out on sent quotes. Won ${d.won} of the last ${d.decided} decided.`);
  });
}

async function cmdLinguists(db, flags) {
  const lang = flags.lang ? (await findLanguage(db, flags.lang)).code : null;
  const rows = await db.query(`
    select l.ref, l.name, l.kind, l.status, l.competence, l.nda_signed_on,
           (select string_agg(source_lang || '>' || target_lang, ' ' order by source_lang, target_lang) from linguist_pairs p where p.linguist_id = l.id) as pairs,
           (select string_agg(type || ' ' || source_lang || case when type in ('CT', 'RPT') then '>' || target_lang else '' end || case when expires_on < current_date then ' (EXPIRED)' else '' end, ', ' order by type)
              from credentials c where c.linguist_id = l.id) as credentials,
           (select count(*) from jobs j where j.linguist_id = l.id and j.status = 'assigned') as jobs_open,
           (select count(*) from bookings b where b.linguist_id = l.id and b.status = 'assigned') as bookings_open
      from linguists l
     where ($1::text is null or exists (select 1 from linguist_pairs p where p.linguist_id = l.id and $1 in (p.source_lang, p.target_lang))
                              or exists (select 1 from credentials c where c.linguist_id = l.id and c.source_lang = $1))
       and ($2 or l.status = 'active')
     order by l.name`, [lang, !!flags.all]);
  out(flags, rows, (r) => {
    console.log(heading(lang ? `Panel: ${lang}` : 'Panel'));
    console.log(table(r, [{ key: 'ref', label: 'Ref' }, { key: 'name', label: 'Name' }, { key: 'pairs', label: 'Translates', width: 24 }, { key: 'credentials', label: 'NAATI', width: 36 },
      { key: 'nda_signed_on', label: 'NDA', format: (v) => (v ? 'yes' : 'NO') }, { key: 'jobs_open', label: 'Jobs', align: 'right' }, { key: 'bookings_open', label: 'Bookings', align: 'right' }]));
  });
}

async function cmdLinguist(db, q, flags) {
  const l = await findLinguist(db, q);
  const pairs = await db.query(`select source_lang, target_lang, specialism from linguist_pairs where linguist_id = $1 order by source_lang`, [l.id]);
  const credentials = await db.query(`select type, source_lang, target_lang, number, expires_on, days_left, state from v_credentials where linguist_id = $1 order by expires_on`, [l.id]);
  const rates = await db.query(`select service, rate_cents, min_minutes from linguist_rates where linguist_id = $1 order by service`, [l.id]);
  const jobs = await db.query(`select ref, step, title, status, due_on from v_jobs where linguist_id = $1 and status = 'assigned' order by due_on`, [l.id]);
  const bookings = await db.query(`select ref, starts_at, language, mode, client from v_bookings where linguist_id = $1 and status = 'assigned' order by starts_at`, [l.id]);
  const [owed] = await db.query(`select coalesce(sum(amount_cents), 0) as cents from v_payables where linguist_id = $1`, [l.id]);
  out(flags, { ...l, pairs, credentials, rates, jobs, bookings, owed_cents: num(owed.cents) }, (d) => {
    console.log(heading(`${d.ref}  ${d.name}`));
    console.log(`  ${d.kind}, ${d.status}. ${d.email || ''} ${d.phone || ''}. ${d.suburb || ''}`);
    console.log(`  Competence: ${d.competence || 'NOT RECORDED'}${d.competence_note ? ` (${d.competence_note})` : ''}. Confidentiality agreement: ${d.nda_signed_on || 'NOT ON FILE'}.`);
    console.log(`  Translates: ${d.pairs.map((p) => `${p.source_lang} > ${p.target_lang}${p.specialism ? ` (${p.specialism})` : ''}`).join(', ') || 'nothing'}`);
    console.log(table(d.credentials, [{ key: 'type', label: 'NAATI' }, { key: 'source_lang', label: 'From' }, { key: 'target_lang', label: 'To' }, { key: 'number', label: 'Number' }, { key: 'expires_on', label: 'Expires' }, { key: 'state', label: 'State' }]));
    console.log(`  Rates: ${d.rates.map((r) => `${r.service} ${['translation', 'revision'].includes(r.service) ? `${r.rate_cents}c a word` : r.service === 'certified' ? `${$$(r.rate_cents)} a page` : `${$$(r.rate_cents)} an hour, ${r.min_minutes} min minimum`}`).join('; ')}`);
    console.log(`  Open: ${d.jobs.length} job(s), ${d.bookings.length} booking(s). Owed, not on a pay run: ${$$(d.owed_cents)}.`);
  });
}

async function cmdCredentials(db, flags) {
  const days = flags.days ? Number(flags.days) : Number(await setting(db, 'credential_warn_days', 90));
  const rows = await db.query(`select v.linguist_ref, v.linguist, v.type, v.source_lang, v.target_lang, v.number, v.expires_on, v.days_left, v.state
                                 from v_credentials v join linguists l on l.id = v.linguist_id
                                where l.status = 'active' and ($1 or v.days_left <= $2)
                                  and not exists (select 1 from credentials n where n.linguist_id = v.linguist_id and n.type = v.type and n.source_lang = v.source_lang
                                                     and n.target_lang = v.target_lang and n.expires_on > v.expires_on)
                                order by v.expires_on`, [!!flags.all, days]);
  out(flags, rows, (r) => {
    console.log(heading(flags.all ? 'Every NAATI credential' : `NAATI credentials expired or ending within ${days} days`));
    console.log(table(r, [{ key: 'linguist', label: 'Linguist' }, { key: 'type', label: 'Type' }, { key: 'source_lang', label: 'From' }, { key: 'target_lang', label: 'To' },
      { key: 'expires_on', label: 'Expires' }, { key: 'days_left', label: 'Days', align: 'right' }, { key: 'state', label: 'State' }]));
    console.log('\n  NAATI credentials run three years; the practitioner recertifies through myNAATI. Record the new expiry with credential add.');
  });
}

async function cmdFind(db, args, flags) {
  if (flags.interpreting) {
    const lang = await findLanguage(db, args[0]);
    const at = flags.at ? parseWhen(flags.at) : null;
    const minutes = Number(flags.minutes || 60);
    const minRank = ['court', 'legal'].includes(str(flags.setting)) ? Number(await setting(db, 'court_min_rank', 3)) : 1;
    const rows = await db.query(`
      select l.ref, l.name, l.suburb, max(interp_rank(c.type)) as rank, string_agg(c.type, ', ') as credentials, min(c.expires_on) as expires_on,
             l.nda_signed_on is not null as nda,
             ($2::timestamp is not null and exists (select 1 from bookings b where b.linguist_id = l.id and b.status = 'assigned'
                 and b.starts_at < $2::timestamp + make_interval(mins => $3 + 30) and b.starts_at + make_interval(mins => b.minutes_booked + 30) > $2::timestamp)) as busy
        from linguists l join credentials c on c.linguist_id = l.id
       where l.status = 'active' and c.source_lang = $1 and c.target_lang = 'en' and interp_rank(c.type) > 0
         and c.expires_on >= coalesce($2::timestamp::date, current_date)
       group by l.id having max(interp_rank(c.type)) >= $4 order by busy, rank desc, l.name`, [lang.code, at, minutes, minRank]);
    return out(flags, rows, (r) => {
      console.log(heading(`Interpreters, ${lang.name}${flags.setting ? `, ${flags.setting}` : ''}${at ? `, ${at.slice(0, 16)}` : ''}`));
      if (!r.length) return console.log(`  Nobody on the panel holds a current ${lang.name} interpreting credential${minRank > 1 ? ' at Certified Interpreter or above' : ''}. Say so to the client now, not on the day.`);
      console.log(table(r, [{ key: 'ref', label: 'Ref' }, { key: 'name', label: 'Name' }, { key: 'credentials', label: 'NAATI' }, { key: 'suburb', label: 'Suburb' },
        { key: 'nda', label: 'NDA', format: (v) => (v ? 'yes' : 'NO') }, { key: 'busy', label: 'Free', format: (v) => (v ? 'BOOKED' : 'yes') }]));
    });
  }
  const [a, b] = args;
  const src = await findLanguage(db, a);
  const tgt = await findLanguage(db, b || 'en');
  const certified = !!flags.certified;
  const rows = await db.query(`
    select l.ref, l.name, l.competence, l.nda_signed_on is not null as nda, p.specialism,
           (select max(expires_on) from credentials c where c.linguist_id = l.id and c.type = 'CT' and c.source_lang = $1 and c.target_lang = $2) as ct_expires,
           (select rate_cents from linguist_rates r where r.linguist_id = l.id and r.service = 'translation') as rate_cents,
           (select count(*) from jobs j where j.linguist_id = l.id and j.status = 'assigned') as open_jobs,
           (select coalesce(sum(j.words), 0) from jobs j where j.linguist_id = l.id and j.status = 'assigned') as open_words
      from linguists l join linguist_pairs p on p.linguist_id = l.id and p.source_lang = $1 and p.target_lang = $2
     where l.status = 'active' order by open_words, l.name`, [src.code, tgt.code]);
  for (const r of rows) {
    const ok = [];
    if (!r.competence) ok.push('no competence record');
    if (!r.nda) ok.push('no NDA');
    if (certified && !(r.ct_expires && r.ct_expires >= TODAY)) ok.push('not NAATI certified in this direction');
    r.can_take = ok.length ? `no: ${ok.join(', ')}` : 'yes';
  }
  out(flags, rows, (r) => {
    console.log(heading(`Who can take ${src.code} > ${tgt.code}${certified ? ', certified' : ''}`));
    if (!r.length) return console.log(`  Nobody on the panel works ${src.name} into ${tgt.name}. Add a linguist, or tell the client before you quote a date.`);
    console.log(table(r, [{ key: 'ref', label: 'Ref' }, { key: 'name', label: 'Name' }, { key: 'specialism', label: 'Specialism', format: (v) => v || '' },
      { key: 'ct_expires', label: 'NAATI CT to', format: (v) => v || '' }, { key: 'rate_cents', label: 'c/word', align: 'right' }, { key: 'open_words', label: 'Words on', align: 'right' }, { key: 'can_take', label: 'Can take it' }]));
  });
}

async function cmdBookings(db, flags) {
  const from = flags.date ? parseDate(flags.date) : TODAY;
  const days = flags.days ? Number(flags.days) : (flags.date ? 1 : 14);
  const rows = await db.query(`select ref, on_date, to_char(starts_at, 'HH24:MI') as time, minutes_booked, language, mode, setting, client, interpreter, status, credential_rank
                                 from v_bookings where on_date >= $1 and on_date < $1::date + $2::int and ($3 or status in ('open', 'assigned')) order by starts_at`, [from, days, !!flags.all]);
  out(flags, rows, (r) => {
    console.log(heading(`Interpreting, ${dayLabel(from)} and the next ${days - 1} days`));
    console.log(table(r, [{ key: 'on_date', label: 'Day', format: dayLabel }, { key: 'time', label: 'Time' }, { key: 'ref', label: 'Booking' }, { key: 'language', label: 'Language', width: 18 },
      { key: 'mode', label: 'Mode' }, { key: 'setting', label: 'Setting' }, { key: 'client', label: 'Client', width: 24 }, { key: 'interpreter', label: 'Interpreter', format: (v) => v || 'NOBODY' }]));
  });
}

async function cmdClients(db, flags) {
  const rows = await db.query(`
    select c.ref, c.name, c.kind, c.credit_hold, c.terms_days,
           (select count(*) from projects p where p.client_id = c.id and p.status = 'open') as projects_open,
           (select count(*) from bookings b where b.client_id = c.id and b.status in ('open', 'assigned') and b.starts_at >= localtimestamp) as bookings_ahead,
           (select coalesce(sum(total_cents), 0) from v_invoices i where i.client_id = c.id and i.status = 'issued') as owed_cents,
           (select coalesce(sum(price_cents), 0) from v_margins m where m.client_id = c.id and m.on_date >= current_date - 90) as last_90_cents
      from clients c where c.status = 'active' order by last_90_cents desc, c.name`);
  out(flags, rows, (r) => {
    console.log(heading('Clients'));
    console.log(table(r, [{ key: 'ref', label: 'Ref' }, { key: 'name', label: 'Client', width: 30 }, { key: 'projects_open', label: 'Projects', align: 'right' }, { key: 'bookings_ahead', label: 'Bookings', align: 'right' },
      { key: 'last_90_cents', label: 'Last 90 days', align: 'right', format: $ }, { key: 'owed_cents', label: 'Owed', align: 'right', format: $ }, { key: 'credit_hold', label: 'Hold', format: (v) => (v ? 'ON HOLD' : '') }]));
  });
}

async function cmdClient(db, q, flags) {
  const c = await findClient(db, q);
  const projects = await db.query(`select ref, title, source_lang || ' > ' || target_lang as pair, status, due_on, price_cents from v_projects where client_id = $1 order by received_on desc limit 12`, [c.id]);
  const bookings = await db.query(`select ref, starts_at, language, mode, setting, interpreter, status from v_bookings where client_id = $1 order by starts_at desc limit 12`, [c.id]);
  const invoices = await db.query(`select ref, status, issued_on, due_on, total_cents, days_overdue from v_invoices where client_id = $1 and status in ('draft', 'issued') order by due_on`, [c.id]);
  const prices = await db.query(`select service, tier, rate_cents, min_minutes from price_list where client_id = $1 order by service, tier`, [c.id]);
  const history = await db.query(`select at, text from activity where subject = $1 order by at desc limit 10`, [`client:${c.ref}`]);
  const [m] = await db.query(`select coalesce(sum(price_cents), 0) as price, coalesce(sum(margin_cents), 0) as margin from v_margins where client_id = $1 and on_date >= current_date - 90`, [c.id]);
  out(flags, { ...c, projects, bookings, invoices, prices, history, last_90: { price_cents: num(m.price), margin_cents: num(m.margin) } }, (d) => {
    console.log(heading(`${d.ref}  ${d.name}${d.credit_hold ? '  ON HOLD' : ''}`));
    console.log(`  ${d.contact_name || ''} ${d.email || ''} ${d.phone || ''}. ${d.terms_days} day terms.${d.notes ? `\n  ${d.notes}` : ''}`);
    console.log(`  Last 90 days: ${$(d.last_90.price_cents)} of work, leaving ${$(d.last_90.margin_cents)} after linguist costs.`);
    if (d.prices.length) console.log(`  Their rates: ${d.prices.map((p) => `${p.service} tier ${p.tier} ${['translation'].includes(p.service) ? `${p.rate_cents}c a word` : $$(p.rate_cents)}`).join('; ')}`);
    console.log(table(d.projects, [{ key: 'ref', label: 'Project' }, { key: 'title', label: 'Title', width: 30 }, { key: 'pair', label: 'Pair' }, { key: 'status', label: 'Status' }, { key: 'due_on', label: 'Due' }, { key: 'price_cents', label: 'Price', align: 'right', format: $ }]));
    console.log(table(d.bookings, [{ key: 'ref', label: 'Booking' }, { key: 'starts_at', label: 'When', format: (v) => String(v).slice(0, 16) }, { key: 'language', label: 'Language', width: 18 }, { key: 'setting', label: 'Setting' }, { key: 'interpreter', label: 'Interpreter', format: (v) => v || 'NOBODY' }, { key: 'status', label: 'Status' }]));
    console.log(table(d.invoices, [{ key: 'ref', label: 'Invoice' }, { key: 'status', label: 'Status' }, { key: 'due_on', label: 'Due' }, { key: 'total_cents', label: 'Ex GST', align: 'right', format: $$ }, { key: 'days_overdue', label: 'Overdue', align: 'right' }]));
    for (const h of d.history) console.log(`  ${String(h.at instanceof Date ? h.at.toISOString() : h.at).slice(0, 10)}  ${h.text}`);
  });
}

async function cmdMargins(db, flags) {
  const days = Number(flags.days || 90);
  const target = Number(await setting(db, 'target_margin_pct', 40));
  const byClient = await db.query(`select client, count(*) as items, sum(price_cents) as price_cents, sum(margin_cents) as margin_cents,
                                          round(sum(margin_cents) * 100.0 / nullif(sum(price_cents), 0), 1) as margin_pct
                                     from v_margins where on_date >= current_date - $1::int group by client order by margin_pct`, [days]);
  const byLine = await db.query(`select line, pair, count(*) as items, sum(price_cents) as price_cents, round(sum(margin_cents) * 100.0 / nullif(sum(price_cents), 0), 1) as margin_pct
                                   from v_margins where on_date >= current_date - $1::int group by line, pair order by margin_pct`, [days]);
  const thin = await db.query(`select ref, client, pair, price_cents, margin_cents, margin_pct from v_margins where on_date >= current_date - $1::int and margin_pct < $2 order by margin_pct`, [days, target]);
  out(flags, { days, target_pct: target, by_client: byClient, by_line: byLine, thin }, (d) => {
    console.log(heading(`What the work left after linguist costs, last ${d.days} days (target ${d.target_pct}%)`));
    console.log(table(d.by_client, [{ key: 'client', label: 'Client', width: 30 }, { key: 'items', label: 'Items', align: 'right' }, { key: 'price_cents', label: 'Charged', align: 'right', format: $ }, { key: 'margin_cents', label: 'Left', align: 'right', format: $ }, { key: 'margin_pct', label: 'Margin', align: 'right', format: pct }]));
    console.log(heading('By service and language'));
    console.log(table(d.by_line, [{ key: 'line', label: 'Service' }, { key: 'pair', label: 'Pair or language' }, { key: 'items', label: 'Items', align: 'right' }, { key: 'price_cents', label: 'Charged', align: 'right', format: $ }, { key: 'margin_pct', label: 'Margin', align: 'right', format: pct }]));
    if (d.thin.length) {
      console.log(heading('Under target'));
      console.log(table(d.thin, [{ key: 'ref', label: 'Item' }, { key: 'client', label: 'Client', width: 26 }, { key: 'pair', label: 'Pair' }, { key: 'price_cents', label: 'Charged', align: 'right', format: $$ }, { key: 'margin_pct', label: 'Margin', align: 'right', format: pct }]));
    }
  });
}

async function cmdInvoices(db, flags) {
  const rows = await db.query(`select ref, client, status, issued_on, due_on, total_cents, days_overdue from v_invoices
                                where ($1::boolean is not true or status in ('draft', 'issued')) order by days_overdue desc, ref`, [!!flags.open]);
  const unbilled = await db.query(`select kind, ref, client, done_on, description, amount_cents from v_unbilled order by client, done_on`);
  out(flags, { invoices: rows, unbilled }, (d) => {
    console.log(heading('Invoices'));
    console.log(table(d.invoices, [{ key: 'ref', label: 'Invoice' }, { key: 'client', label: 'Client', width: 28 }, { key: 'status', label: 'Status' }, { key: 'issued_on', label: 'Issued' }, { key: 'due_on', label: 'Due' }, { key: 'total_cents', label: 'Ex GST', align: 'right', format: $$ }, { key: 'days_overdue', label: 'Overdue', align: 'right', format: (v) => (v ? `${v} days` : '') }]));
    console.log(heading('Finished, not invoiced'));
    console.log(table(d.unbilled, [{ key: 'ref', label: 'Item' }, { key: 'client', label: 'Client', width: 28 }, { key: 'done_on', label: 'Done' }, { key: 'description', label: 'What', width: 50 }, { key: 'amount_cents', label: 'Ex GST', align: 'right', format: $$ }]));
  });
}

async function cmdPayables(db, flags) {
  const rows = await db.query(`select linguist, count(*) as items, sum(amount_cents) as amount_cents, min(done_on) as oldest from v_payables group by linguist order by linguist`);
  const runs = await db.query(`select r.ref, l.name as linguist, r.period_to, r.status, r.paid_on, (select sum(amount_cents) from pay_lines pl where pl.pay_run_id = r.id) as amount_cents
                                 from pay_runs r join linguists l on l.id = r.linguist_id where r.status <> 'paid' order by r.ref`);
  out(flags, { owed: rows, unpaid_runs: runs }, (d) => {
    console.log(heading('Owed to linguists, not on a pay run'));
    console.log(table(d.owed, [{ key: 'linguist', label: 'Linguist' }, { key: 'items', label: 'Items', align: 'right' }, { key: 'oldest', label: 'Oldest' }, { key: 'amount_cents', label: 'Amount', align: 'right', format: $$ }]));
    if (d.unpaid_runs.length) {
      console.log(heading('Pay runs not yet paid'));
      console.log(table(d.unpaid_runs, [{ key: 'ref', label: 'Run' }, { key: 'linguist', label: 'Linguist' }, { key: 'status', label: 'Status' }, { key: 'amount_cents', label: 'Amount', align: 'right', format: $$ }]));
    }
  });
}

async function cmdSettings(db, sub, args, flags) {
  if (sub === 'set') {
    const [key, ...v] = args;
    const value = v.join(' ');
    if (!key || !value) throw new CliError('setting set <key> <value>');
    const [exists] = await db.query(`select key from settings where key = $1`, [key]);
    if (!exists) throw new CliError(`No setting "${key}". Run settings for the list.`);
    await db.query(`update settings set value = $2, updated_at = now() where key = $1`, [key, value]);
    await logActivity(db, 'settings', `${key} set to ${value}`);
    return out(flags, { key, value }, (d) => console.log(`${d.key} = ${d.value}`));
  }
  const rows = await db.query(`select key, value, note from settings order by key`);
  out(flags, rows, (r) => { console.log(heading('Settings')); console.log(table(r, [{ key: 'key', label: 'Key' }, { key: 'value', label: 'Value' }, { key: 'note', label: 'What it does', width: 70 }])); });
}

async function cmdHistory(db, q, flags) {
  const rows = await db.query(`select at, subject, text from activity where ($1 = '' or subject ilike $2 or text ilike $2) order by at desc limit 40`, [q || '', `%${q || ''}%`]);
  out(flags, rows, (r) => { for (const a of r) console.log(`  ${String(a.at instanceof Date ? a.at.toISOString() : a.at).slice(0, 16).replace('T', ' ')}  ${a.subject.padEnd(18)} ${a.text}`); });
}

// ---------------------------------------------------------------------------
// Translation: quotes, projects, jobs

async function newProjectRows(db, client, spec) {
  const ref = await nextRef(db, 'projects', 'P-');
  const [p] = await db.query(`insert into projects (ref, client_id, quote_id, title, source_lang, target_lang, certified, purpose, words, pages, price_cents, po_number, received_on, due_on)
                               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning *`,
    [ref, client.id, spec.quote_id || null, spec.title, spec.src, spec.tgt, spec.certified, spec.purpose || null, spec.words, spec.pages, spec.price_cents, spec.po || null, TODAY, spec.due]);
  const tDue = spec.due > TODAY ? addDays(spec.due, -1) : spec.due;
  const [t] = await db.query(`insert into jobs (ref, project_id, step, words, pages, due_on) values ($1, $2, 'translation', $3, $4, $5) returning id`, [`${ref}-T`, p.id, spec.words, spec.pages, tDue]);
  if ((await setting(db, 'revision_required', 'true')) === 'true') {
    await db.query(`insert into jobs (ref, project_id, step, revises_id, words, pages, due_on) values ($1, $2, 'revision', $3, $4, $5, $6)`, [`${ref}-R`, p.id, t.id, spec.words, spec.pages, spec.due]);
  }
  await logActivity(db, `project:${ref}`, `Opened for ${client.name}: ${spec.title}, ${spec.src} > ${spec.tgt}, due ${spec.due}`);
  return p;
}

async function readSpec(db, flags) {
  const src = (await findLanguage(db, flags.from)).code;
  const tgt = (await findLanguage(db, flags.to || 'en')).code;
  if (src === tgt) throw new CliError('Source and target are the same language.');
  const certified = !!flags.certified;
  const words = parseInt0(flags.words, 'words') ?? 0;
  const pages = parseInt0(flags.pages, 'pages') ?? 0;
  return { src, tgt, certified, words, pages, purpose: str(flags.purpose) || null, title: str(flags.title) || `${certified ? 'Certified documents' : 'Translation'} ${src} > ${tgt}`, po: str(flags.po) || null };
}

async function cmdQuoteNew(db, args, flags) {
  const client = await findClient(db, args.join(' '));
  await holdCheck(db, client);
  const spec = await readSpec(db, flags);
  const pr = await translationPrice(db, client.id, spec.src, spec.tgt, spec.words, spec.pages, spec.certified);
  const ref = await nextRef(db, 'quotes', 'Q-');
  const dueDays = parseInt0(flags['due-days'], 'due days') ?? Number(await setting(db, 'default_due_days', 5));
  await db.query(`insert into quotes (ref, client_id, title, source_lang, target_lang, certified, purpose, words, pages, amount_cents, due_days)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [ref, client.id, spec.title, spec.src, spec.tgt, spec.certified, spec.purpose, spec.words, spec.pages, pr.amount_cents, dueDays]);
  await logActivity(db, `client:${client.ref}`, `Quote ${ref} drafted: ${spec.title}, ${$$(pr.amount_cents)}`);
  out(flags, { ref, client: client.name, ...spec, tier: pr.tier, amount_cents: pr.amount_cents, due_days: dueDays }, (d) =>
    console.log(`${d.ref} drafted for ${d.client}: ${d.title}, ${d.certified ? `${d.pages} pages` : `${d.words} words`} at tier ${d.tier}, ${$$(d.amount_cents)} ex GST, ${d.due_days} days. Draft the email with draft quote ${d.ref}, then quote send ${d.ref}.`));
}

async function cmdQuoteSet(db, sub, args, flags) {
  const q = await findQuote(db, args[0]);
  if (sub === 'send') {
    if (q.status !== 'draft') throw new CliError(`${q.ref} is ${q.status}, not a draft.`);
    const valid = addDays(TODAY, Number(await setting(db, 'quote_valid_days', 30)));
    await db.query(`update quotes set status = 'sent', sent_on = $2, valid_until = $3 where id = $1`, [q.id, TODAY, valid]);
    return out(flags, { ref: q.ref, status: 'sent', valid_until: valid }, (d) => console.log(`${d.ref} marked sent, valid to ${d.valid_until}. Nothing was emailed from here.`));
  }
  if (sub === 'decline') {
    if (!['draft', 'sent'].includes(q.status)) throw new CliError(`${q.ref} is already ${q.status}.`);
    await db.query(`update quotes set status = 'declined', decided_on = $2, decline_reason = $3 where id = $1`, [q.id, TODAY, str(flags.why) || null]);
    await logActivity(db, `quote:${q.ref}`, `Declined${flags.why ? `: ${flags.why}` : ''}`);
    return out(flags, { ref: q.ref, status: 'declined' }, (d) => console.log(`${d.ref} declined.`));
  }
  if (sub === 'accept') {
    if (q.status !== 'sent') throw new CliError(`${q.ref} is ${q.status}. Only a sent quote is accepted.`);
    if (q.valid_until < TODAY) throw new CliError(`${q.ref} lapsed on ${q.valid_until}. Quote it again at today's prices.`);
    const [full] = await db.query(`select * from quotes where id = $1`, [q.id]);
    const [client] = await db.query(`select * from clients where id = $1`, [full.client_id]);
    await holdCheck(db, client);
    const due = flags.due ? parseDate(flags.due) : addDays(TODAY, full.due_days);
    await db.exec('BEGIN');
    try {
      await db.query(`update quotes set status = 'accepted', decided_on = $2 where id = $1`, [q.id, TODAY]);
      const p = await newProjectRows(db, client, { quote_id: q.id, title: full.title, src: full.source_lang, tgt: full.target_lang, certified: full.certified, purpose: full.purpose,
        words: full.words, pages: full.pages, price_cents: full.amount_cents, po: str(flags.po) || null, due });
      await db.exec('COMMIT');
      return out(flags, { ref: q.ref, status: 'accepted', project: p.ref, due_on: due }, (d) => console.log(`${d.ref} accepted. Project ${d.project} opened, due ${d.due_on}. Next: find ${full.source_lang} ${full.target_lang}${full.certified ? ' --certified' : ''}.`));
    } catch (e) { await db.exec('ROLLBACK'); throw e; }
  }
  throw new CliError('quote <client> --from= --to= --words= | quote send|accept|decline <Q-ref>');
}

async function cmdProjectNew(db, args, flags) {
  const client = await findClient(db, args.join(' '));
  await holdCheck(db, client);
  const spec = await readSpec(db, flags);
  const pr = await translationPrice(db, client.id, spec.src, spec.tgt, spec.words, spec.pages, spec.certified);
  const due = flags.due ? parseDate(flags.due) : addDays(TODAY, Number(await setting(db, 'default_due_days', 5)));
  if (due < TODAY) throw new CliError(`The due date ${due} is in the past.`);
  const p = await newProjectRows(db, client, { ...spec, price_cents: pr.amount_cents, due });
  out(flags, { ref: p.ref, client: client.name, price_cents: p.price_cents, due_on: due }, (d) => console.log(`Project ${d.ref} opened for ${d.client}, ${$$(d.price_cents)} ex GST, due ${d.due_on}.`));
}

async function cmdAssign(db, args, flags) {
  const [jobQ, ...who] = args;
  const job = await findJob(db, jobQ);
  const l = await findLinguist(db, who.join(' '));
  const why = await assignRefusals(db, job, l);
  if (why.length) throw new CliError(`Cannot give ${job.ref} to ${l.name}:\n${why.map((w) => `  - ${w}`).join('\n')}`);
  const cost = await jobCost(db, job, l.id);
  await db.query(`update jobs set linguist_id = $2, status = 'assigned', assigned_on = $3, cost_cents = $4 where id = $1`, [job.id, l.id, TODAY, cost]);
  await logActivity(db, `project:${job.project}`, `${job.step} given to ${l.name}, due ${job.due_on}, ${$$(cost)}`);
  out(flags, { job: job.ref, linguist: l.name, cost_cents: cost, due_on: job.due_on }, (d) => console.log(`${d.job} given to ${d.linguist}, due ${d.due_on}, cost ${$$(d.cost_cents)}. The job offer: draft offer ${d.job}.`));
}

async function cmdDone(db, args, flags) {
  const job = await findJob(db, args[0]);
  if (job.status !== 'assigned') throw new CliError(`${job.ref} is ${job.status}. Only an assigned job is finished.`);
  const on = parseDate(flags.on || 'today');
  if (on > TODAY) throw new CliError('A job cannot be finished in the future.');
  if (job.step === 'revision') {
    const [t] = await db.query(`select ref, status from jobs where id = $1`, [job.revises_id]);
    if (t && t.status !== 'done') throw new CliError(`${job.ref} revises ${t.ref}, which is ${t.status}. The translation finishes first.`);
  }
  const words = parseInt0(flags.words, 'words');
  let cost = job.cost_cents;
  if (words !== null && words !== job.words) {
    await db.query(`update jobs set words = $2 where id = $1`, [job.id, words]);
    cost = await jobCost(db, { ...job, words }, job.linguist_id);
  }
  await db.query(`update jobs set status = 'done', done_on = $2, cost_cents = $3 where id = $1`, [job.id, on, cost]);
  await logActivity(db, `project:${job.project}`, `${job.step} done ${on}`);
  const [p] = await db.query(`select revision_ok from v_projects where id = $1`, [job.project_id]);
  out(flags, { job: job.ref, done_on: on, cost_cents: cost, project_ready: p.revision_ok }, (d) =>
    console.log(`${d.job} done ${d.done_on}.${d.project_ready ? ` ${job.project} is revised and ready: deliver ${job.project}.` : ''}`));
}

async function cmdDeliver(db, args, flags) {
  const p = await findProject(db, args[0]);
  if (p.status !== 'open') throw new CliError(`${p.ref} is ${p.status}.`);
  const on = parseDate(flags.on || 'today');
  if (on > TODAY) throw new CliError('Delivery cannot be in the future.');
  const why = [];
  const pending = await db.query(`select ref, step, status from jobs where project_id = $1 and status in ('unassigned', 'assigned') order by ref`, [p.id]);
  for (const j of pending) why.push(`${j.ref} (${j.step}) is ${j.status}`);
  if ((await setting(db, 'revision_required', 'true')) === 'true' && !p.revision_ok) why.push('it has not been revised by a second linguist (ISO 17100 clause 5.3.3)');
  if (p.certified) {
    const bad = await db.query(`select l.name from jobs j join linguists l on l.id = j.linguist_id where j.project_id = $1 and j.step = 'translation' and j.status = 'done'
                                   and not exists (select 1 from credentials c where c.linguist_id = j.linguist_id and c.type = 'CT' and c.source_lang = $2 and c.target_lang = $3 and c.expires_on >= $4)`,
      [p.id, p.source_lang, p.target_lang, on]);
    for (const b of bad) why.push(`${b.name} has no NAATI Certified Translator ${p.source_lang} > ${p.target_lang} current on ${on}, so the certification statement cannot be signed`);
  }
  if (why.length) throw new CliError(`Cannot deliver ${p.ref}:\n${why.map((w) => `  - ${w}`).join('\n')}`);
  await db.query(`update projects set status = 'delivered', delivered_on = $2 where id = $1`, [p.id, on]);
  await logActivity(db, `project:${p.ref}`, `Delivered ${on}`);
  out(flags, { project: p.ref, delivered_on: on, certified: p.certified }, (d) => console.log(`${d.project} delivered ${d.delivered_on}.${d.certified ? ' The certification statement: npm run docs -- certification.' : ''} It goes on the next bill.`));
}

// ---------------------------------------------------------------------------
// Interpreting

async function cmdBook(db, args, flags) {
  const client = await findClient(db, args.join(' '));
  await holdCheck(db, client);
  const lang = await findLanguage(db, flags.lang);
  if (lang.code === 'en') throw new CliError('Name the language other than English.');
  const mode = str(flags.mode || 'onsite').toLowerCase();
  if (!['onsite', 'video', 'phone'].includes(mode)) throw new CliError('--mode is onsite, video or phone.');
  const settingName = str(flags.setting || 'community').toLowerCase();
  if (!['medical', 'legal', 'court', 'community', 'business'].includes(settingName)) throw new CliError('--setting is medical, legal, court, community or business.');
  const at = parseWhen(flags.at);
  if (at.slice(0, 10) < TODAY) throw new CliError('That time has passed.');
  const minutes = parseInt0(flags.minutes, 'minutes') ?? 60;
  if (mode === 'onsite' && !flags.address) throw new CliError('An onsite booking needs --address.');
  const ref = await nextRef(db, 'bookings', 'B-');
  await db.query(`insert into bookings (ref, client_id, lang, mode, setting, starts_at, minutes_booked, address, onsite_contact, client_name, po_number)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [ref, client.id, lang.code, mode, settingName, at, minutes, str(flags.address) || null, str(flags.contact) || null, str(flags.for) || null, str(flags.po) || null]);
  await logActivity(db, `client:${client.ref}`, `Booking ${ref}: ${lang.name} ${mode} ${settingName}, ${at.slice(0, 16)}`);
  out(flags, { ref, client: client.name, language: lang.name, mode, setting: settingName, starts_at: at, minutes }, (d) =>
    console.log(`${d.ref} booked for ${d.client}: ${d.language}, ${d.mode}, ${d.setting}, ${d.starts_at.slice(0, 16)} for ${d.minutes} minutes. Next: find ${lang.code} --interpreting --setting=${d.setting} --at="${d.starts_at.slice(0, 16)}".`));
}

async function cmdInterpreter(db, args, flags) {
  const [bq, ...who] = args;
  const b = await findBooking(db, bq);
  const l = await findLinguist(db, who.join(' '));
  const why = await interpreterRefusals(db, b, l);
  if (why.length) throw new CliError(`Cannot put ${l.name} on ${b.ref}:\n${why.map((w) => `  - ${w}`).join('\n')}`);
  await db.query(`update bookings set linguist_id = $2, status = 'assigned' where id = $1`, [b.id, l.id]);
  await logActivity(db, `client:${b.client_ref}`, `${l.name} on ${b.ref}`);
  out(flags, { booking: b.ref, interpreter: l.name, starts_at: b.starts_at }, (d) => console.log(`${d.interpreter} on ${d.booking}, ${String(d.starts_at).slice(0, 16)}. The confirmation: draft confirm ${d.booking}.`));
}

async function cmdTimesheet(db, args, flags) {
  const b = await findBooking(db, args[0]);
  if (b.status !== 'assigned') throw new CliError(`${b.ref} is ${b.status}. A timesheet goes on a booking with an interpreter.`);
  const minutes = parseInt0(flags.minutes, 'minutes');
  if (!minutes) throw new CliError('Give the minutes worked off the timesheet: --minutes=95.');
  if (String(b.starts_at).slice(0, 10) > TODAY) throw new CliError(`${b.ref} is on ${String(b.starts_at).slice(0, 10)}. It has not happened yet.`);
  const [full] = await db.query(`select * from bookings where id = $1`, [b.id]);
  const m = await bookingMoney(db, full, minutes, false);
  await db.query(`update bookings set status = 'done', minutes_actual = $2, price_cents = $3, cost_cents = $4 where id = $1`, [b.id, minutes, m.price_cents, m.cost_cents]);
  await logActivity(db, `client:${b.client_ref}`, `${b.ref} timesheet: ${minutes} minutes, billed ${m.billed_minutes}`);
  out(flags, { booking: b.ref, minutes, billed_minutes: m.billed_minutes, price_cents: m.price_cents, cost_cents: m.cost_cents }, (d) =>
    console.log(`${d.booking}: ${d.minutes} minutes worked, ${d.billed_minutes} billed. ${$$(d.price_cents)} to the client, ${$$(d.cost_cents)} to the interpreter.`));
}

async function cmdCancel(db, args, flags) {
  const q = args[0] || '';
  const why = str(flags.why);
  if (!why) throw new CliError('Say why: --why="...". Nothing is deleted; it is cancelled with the reason.');
  if (/^b-/i.test(q)) {
    const b = await findBooking(db, q);
    if (!['open', 'assigned'].includes(b.status)) throw new CliError(`${b.ref} is ${b.status}.`);
    const at = flags.at ? parseWhen(flags.at) : (await db.query(`select to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS') as t`))[0].t;
    const [{ now }] = await db.query(`select to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS') as now`);
    if (at > now) throw new CliError('The cancellation time cannot be in the future. Leave --at off for now.');
    const hours = (new Date(`${String(b.starts_at).replace(' ', 'T')}Z`) - new Date(`${at.replace(' ', 'T')}Z`)) / 3600000;
    const late = hours < Number(await setting(db, 'late_cancel_hours', 24));
    const [full] = await db.query(`select * from bookings where id = $1`, [b.id]);
    const m = late ? await bookingMoney(db, full, 0, true) : { price_cents: null, cost_cents: null };
    await db.query(`update bookings set status = 'cancelled', cancelled_at = $2, cancel_reason = $3, late_cancel = $4, price_cents = $5, cost_cents = $6 where id = $1`,
      [b.id, at, why, late, m.price_cents, m.cost_cents]);
    await logActivity(db, `client:${b.client_ref}`, `${b.ref} cancelled${late ? ' late' : ''}: ${why}`);
    return out(flags, { booking: b.ref, late, price_cents: m.price_cents, cost_cents: m.cost_cents, hours_notice: Math.round(hours * 10) / 10 }, (d) =>
      console.log(`${d.booking} cancelled with ${d.hours_notice} hours notice.${d.late ? ` Late: ${$$(d.price_cents)} to the client${d.cost_cents ? `, ${$$(d.cost_cents)} to the interpreter` : ''}.` : ' No charge.'}`));
  }
  if (/^p-\d+-[tr]$/i.test(q)) {
    const j = await findJob(db, q);
    if (!['unassigned', 'assigned'].includes(j.status)) throw new CliError(`${j.ref} is ${j.status}.`);
    await db.query(`update jobs set status = 'cancelled', cancel_reason = $2, cost_cents = null where id = $1`, [j.id, why]);
    await logActivity(db, `project:${j.project}`, `${j.ref} cancelled: ${why}`);
    return out(flags, { job: j.ref, status: 'cancelled' }, (d) => console.log(`${d.job} cancelled. Add another with /customise if the step is still needed.`));
  }
  const p = await findProject(db, q);
  if (p.status !== 'open') throw new CliError(`${p.ref} is ${p.status}.`);
  await db.query(`update projects set status = 'cancelled', cancel_reason = $2 where id = $1`, [p.id, why]);
  await db.query(`update jobs set status = 'cancelled', cancel_reason = $2 where project_id = $1 and status = 'unassigned'`, [p.id, why]);
  const working = await db.query(`select j.ref, l.name from jobs j join linguists l on l.id = j.linguist_id where j.project_id = $1 and j.status = 'assigned'`, [p.id]);
  await logActivity(db, `project:${p.ref}`, `Cancelled: ${why}`);
  out(flags, { project: p.ref, still_assigned: working }, (d) => console.log(`${d.project} cancelled.${d.still_assigned.length ? ` Still with linguists: ${d.still_assigned.map((w) => `${w.ref} ${w.name}`).join(', ')}. Tell them, then done (pay for work done) or cancel each job.` : ''}`));
}

// ---------------------------------------------------------------------------
// Money

async function cmdBill(db, flags) {
  const to = parseDate(flags.to || 'today');
  const dry = !!flags['dry-run'];
  const items = await db.query(`select * from v_unbilled where done_on <= $1 order by client, done_on`, [to]);
  const byClient = new Map();
  for (const it of items) { if (!byClient.has(it.client_id)) byClient.set(it.client_id, []); byClient.get(it.client_id).push(it); }
  const made = [];
  await db.exec('BEGIN');
  try {
    for (const [clientId, rows] of byClient) {
      const ref = await nextRef(db, 'invoices', 'INV-');
      const [inv] = await db.query(`insert into invoices (ref, client_id) values ($1, $2) returning id`, [ref, clientId]);
      for (const r of rows) {
        const po = r.kind === 'project' ? (await db.query(`select po_number from projects where id = $1`, [r.item_id]))[0].po_number : (await db.query(`select po_number from bookings where id = $1`, [r.item_id]))[0].po_number;
        await db.query(`insert into invoice_lines (invoice_id, project_id, booking_id, description, amount_cents) values ($1, $2, $3, $4, $5)`,
          [inv.id, r.kind === 'project' ? r.item_id : null, r.kind === 'booking' ? r.item_id : null, `${r.ref} ${r.description}${po ? `, PO ${po}` : ''}`, r.amount_cents]);
      }
      made.push({ ref, client: rows[0].client, lines: rows.length, total_cents: rows.reduce((a, r) => a + num(r.amount_cents), 0) });
    }
    await db.exec(dry ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  out(flags, { dry_run: dry, to, invoices: made }, (d) => {
    console.log(heading(d.dry_run ? `Test run: invoices for work finished to ${d.to}, nothing saved` : `Draft invoices for work finished to ${d.to}`));
    if (!d.invoices.length) return console.log('  Nothing finished and unbilled.');
    console.log(table(d.invoices, [{ key: 'ref', label: 'Invoice' }, { key: 'client', label: 'Client', width: 30 }, { key: 'lines', label: 'Lines', align: 'right' }, { key: 'total_cents', label: 'Ex GST', align: 'right', format: $$ }]));
    if (!d.dry_run) console.log('\n  Drafts. Check them (npm run docs -- invoice), then invoice issue <ref>.');
  });
}

async function cmdInvoice(db, sub, args, flags) {
  const [inv] = await db.query(`select * from v_invoices where lower(ref) = lower($1)`, [args[0] || '']);
  if (!inv) throw new CliError(`No invoice ${args[0] || ''}.`);
  const on = parseDate(flags.on || 'today');
  if (sub === 'issue') {
    if (inv.status !== 'draft') throw new CliError(`${inv.ref} is ${inv.status}.`);
    const [c] = await db.query(`select terms_days from clients where id = $1`, [inv.client_id]);
    const due = addDays(on, c.terms_days);
    await db.query(`update invoices set status = 'issued', issued_on = $2, due_on = $3 where id = $1`, [inv.id, on, due]);
    return out(flags, { ref: inv.ref, status: 'issued', due_on: due }, (d) => console.log(`${d.ref} issued, due ${d.due_on}. Send it from your accounting system or email; nothing was sent from here.`));
  }
  if (sub === 'paid') {
    if (inv.status !== 'issued') throw new CliError(`${inv.ref} is ${inv.status}.`);
    await db.query(`update invoices set status = 'paid', paid_on = $2 where id = $1`, [inv.id, on]);
    await logActivity(db, `client:${inv.client_ref}`, `${inv.ref} paid ${on}`);
    return out(flags, { ref: inv.ref, status: 'paid' }, (d) => console.log(`${d.ref} paid.`));
  }
  if (sub === 'void') {
    if (!['draft', 'issued'].includes(inv.status)) throw new CliError(`${inv.ref} is ${inv.status}.`);
    await db.query(`update invoices set status = 'void' where id = $1`, [inv.id]);
    await logActivity(db, `client:${inv.client_ref}`, `${inv.ref} voided${flags.why ? `: ${flags.why}` : ''}`);
    return out(flags, { ref: inv.ref, status: 'void' }, (d) => console.log(`${d.ref} void. Its work is back on the unbilled list.`));
  }
  throw new CliError('invoice issue|paid|void <INV-ref> [--on=DATE]');
}

async function cmdPayRun(db, args, flags) {
  if (['approve', 'paid'].includes((args[0] || '').toLowerCase())) {
    const [r] = await db.query(`select * from pay_runs where lower(ref) = lower($1)`, [args[1] || '']);
    if (!r) throw new CliError(`No pay run ${args[1] || ''}.`);
    const next = args[0].toLowerCase() === 'approve' ? 'approved' : 'paid';
    if (next === 'approved' && r.status !== 'draft') throw new CliError(`${r.ref} is ${r.status}.`);
    if (next === 'paid' && r.status !== 'approved') throw new CliError(`${r.ref} is ${r.status}. Approve it first.`);
    await db.query(`update pay_runs set status = $2, paid_on = case when $2 = 'paid' then $3::date else paid_on end where id = $1`, [r.id, next, TODAY]);
    return out(flags, { ref: r.ref, status: next }, (d) => console.log(`${d.ref} ${d.status}.`));
  }
  const to = parseDate(flags.to || 'today');
  const dry = !!flags['dry-run'];
  const items = await db.query(`select * from v_payables where done_on <= $1 order by linguist, done_on`, [to]);
  const byL = new Map();
  for (const it of items) { if (!byL.has(it.linguist_id)) byL.set(it.linguist_id, []); byL.get(it.linguist_id).push(it); }
  const made = [];
  await db.exec('BEGIN');
  try {
    for (const [lid, rows] of byL) {
      const ref = await nextRef(db, 'pay_runs', 'PR-');
      const [r] = await db.query(`insert into pay_runs (ref, linguist_id, period_to) values ($1, $2, $3) returning id`, [ref, lid, to]);
      for (const it of rows) {
        await db.query(`insert into pay_lines (pay_run_id, job_id, booking_id, description, amount_cents) values ($1, $2, $3, $4, $5)`,
          [r.id, it.kind === 'job' ? it.item_id : null, it.kind === 'booking' ? it.item_id : null, it.description, it.amount_cents]);
      }
      made.push({ ref, linguist: rows[0].linguist, lines: rows.length, amount_cents: rows.reduce((a, x) => a + num(x.amount_cents), 0) });
    }
    await db.exec(dry ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  out(flags, { dry_run: dry, to, pay_runs: made }, (d) => {
    console.log(heading(d.dry_run ? `Test run: linguist pay to ${d.to}, nothing saved` : `Linguist pay runs to ${d.to}`));
    if (!d.pay_runs.length) return console.log('  Nobody is owed for finished work.');
    console.log(table(d.pay_runs, [{ key: 'ref', label: 'Run' }, { key: 'linguist', label: 'Linguist' }, { key: 'lines', label: 'Lines', align: 'right' }, { key: 'amount_cents', label: 'Amount', align: 'right', format: $$ }]));
    if (!d.dry_run) console.log('\n  Drafts. Remittance advice: npm run docs -- remittance. Approve with pay-run approve <ref>, pay from the bank, then pay-run paid <ref>.');
  });
}

async function cmdHold(db, args, flags, on) {
  const c = await findClient(db, args.join(' '));
  if (on) {
    const why = str(flags.why);
    if (!why) throw new CliError('Say why: --why="INV-... overdue".');
    await db.query(`update clients set credit_hold = true, hold_reason = $2 where id = $1`, [c.id, why]);
  } else await db.query(`update clients set credit_hold = false, hold_reason = null where id = $1`, [c.id]);
  await logActivity(db, `client:${c.ref}`, on ? `Credit hold: ${flags.why}` : 'Credit hold released');
  out(flags, { client: c.name, credit_hold: on }, (d) => console.log(`${d.client} ${d.credit_hold ? 'on hold: nothing new is quoted, opened or booked' : 'released'}.`));
}

// ---------------------------------------------------------------------------
// The panel: credentials and linguist records

async function cmdCredentialAdd(db, args, flags) {
  const l = await findLinguist(db, args.join(' '));
  const type = str(flags.type).toUpperCase();
  if (!['CT', 'RPT', 'CI', 'CPI', 'RPI', 'CSHI', 'CSLI', 'CCI'].includes(type)) throw new CliError('--type is CT, RPT, CI, CPI, RPI, CSHI, CSLI or CCI.');
  const interp = !['CT', 'RPT'].includes(type);
  const src = (await findLanguage(db, interp ? flags.lang : flags.from)).code;
  const tgt = interp ? 'en' : (await findLanguage(db, flags.to || 'en')).code;
  const expires = parseDate(flags.expires, 'expiry');
  if (!expires) throw new CliError('Give the expiry off the NAATI record: --expires=YYYY-MM-DD.');
  await db.query(`insert into credentials (linguist_id, type, source_lang, target_lang, number, issued_on, expires_on) values ($1, $2, $3, $4, $5, $6, $7)`,
    [l.id, type, src, tgt, str(flags.number) || null, parseDate(flags.issued) || TODAY, expires]);
  await logActivity(db, `linguist:${l.ref}`, `NAATI ${type} ${src}${interp ? '' : ` > ${tgt}`} recorded to ${expires}`);
  out(flags, { linguist: l.name, type, source_lang: src, target_lang: tgt, expires_on: expires }, (d) => console.log(`${d.linguist}: NAATI ${d.type} ${d.source_lang}${interp ? '' : ` > ${d.target_lang}`} to ${d.expires_on}.`));
}

async function cmdLinguistAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('linguist add "Full Name" [--email= --phone= --kind=freelance|staff --suburb=]');
  const [exist] = await db.query(`select ref from linguists where lower(name) = lower($1)`, [name]);
  if (exist) throw new CliError(`${name} is already on the panel as ${exist.ref}.`);
  const kind = str(flags.kind || 'freelance');
  if (!['freelance', 'staff'].includes(kind)) throw new CliError('--kind is freelance or staff.');
  const ref = await nextRef(db, 'linguists', 'L-', 3);
  const [l] = await db.query(`insert into linguists (ref, name, kind, email, phone, suburb) values ($1, $2, $3, $4, $5, $6) returning id`, [ref, name, kind, str(flags.email) || null, str(flags.phone) || null, str(flags.suburb) || null]);
  // Starts on the panel's usual pay rates; change one with linguist set --rate=service:amount.
  await db.query(`insert into linguist_rates (linguist_id, service, rate_cents, min_minutes)
                  select $1, service, mode() within group (order by rate_cents), mode() within group (order by min_minutes) from linguist_rates group by service`, [l.id]);
  await logActivity(db, `linguist:${ref}`, `Added to the panel`);
  out(flags, { ref, name }, (d) => console.log(`${d.name} added as ${d.ref} on the panel's usual rates. Before any work: linguist set ${d.ref} --pair="xx>en" --competence="..." --nda=DATE, and credential add for each NAATI credential.`));
}

async function cmdLinguistSet(db, args, flags) {
  const l = await findLinguist(db, args.join(' '));
  const sets = [];
  const vals = [l.id];
  if (flags.nda) { vals.push(parseDate(flags.nda)); sets.push(`nda_signed_on = $${vals.length}`); }
  if (flags.competence) {
    const c = str(flags.competence);
    if (!['translation degree', 'other degree plus 2 years', '5 years experience'].includes(c)) throw new CliError('--competence is "translation degree", "other degree plus 2 years" or "5 years experience" (ISO 17100 clause 3.1.4).');
    vals.push(c); sets.push(`competence = $${vals.length}`);
    if (flags.note) { vals.push(str(flags.note)); sets.push(`competence_note = $${vals.length}`); }
  }
  if (flags.status) {
    if (!['active', 'inactive'].includes(str(flags.status))) throw new CliError('--status is active or inactive.');
    vals.push(str(flags.status)); sets.push(`status = $${vals.length}`);
  }
  if (flags.rate) {
    const [service, amount] = str(flags.rate).split(/[:=]/);
    if (!['translation', 'revision', 'certified', 'onsite', 'video', 'phone'].includes(service) || !amount) throw new CliError('--rate=translation:12 (cents a word), certified:38 (dollars a page) or onsite:65 (dollars an hour).');
    const cents = ['translation', 'revision'].includes(service) ? Math.round(Number(amount)) : Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 0) throw new CliError(`Cannot read the rate "${amount}".`);
    await db.query(`insert into linguist_rates (linguist_id, service, rate_cents) values ($1, $2, $3) on conflict (linguist_id, service) do update set rate_cents = excluded.rate_cents`, [l.id, service, cents]);
    await logActivity(db, `linguist:${l.ref}`, `${service} rate set to ${amount}`);
  }
  if (flags.pair) {
    const [a, b] = str(flags.pair).split(/[>\s,]+/);
    const src = (await findLanguage(db, a)).code;
    const tgt = (await findLanguage(db, b)).code;
    await db.query(`insert into linguist_pairs (linguist_id, source_lang, target_lang) values ($1, $2, $3) on conflict do nothing`, [l.id, src, tgt]);
    await logActivity(db, `linguist:${l.ref}`, `Works ${src} > ${tgt}`);
  }
  if (sets.length) await db.query(`update linguists set ${sets.join(', ')} where id = $1`, vals);
  if (!sets.length && !flags.pair && !flags.rate) throw new CliError('linguist set <name> [--nda=DATE] [--competence="..." --note=] [--status=] [--pair="zh>en"] [--rate=service:amount]');
  if (sets.length) await logActivity(db, `linguist:${l.ref}`, `Updated: ${Object.keys(flags).filter((k) => ['nda', 'competence', 'status'].includes(k)).join(', ')}`);
  const [after] = await db.query(`select ref, name, nda_signed_on, competence, status from linguists where id = $1`, [l.id]);
  out(flags, after, (d) => console.log(`${d.name}: NDA ${d.nda_signed_on || 'not on file'}, competence ${d.competence || 'not recorded'}, ${d.status}.`));
}

// ---------------------------------------------------------------------------
// Compliance: the rule book in docs/compliance.md, run against the records.

const RULES = {
  revision: {
    title: 'Every translation revised by a second linguist before delivery',
    source: 'ISO 17100:2015 Translation services, clause 5.3.3 (revision)',
    sql: `select p.ref as record, p.client as who, 'delivered ' || p.delivered_on || ' with no finished revision by a second linguist' as detail
            from v_projects p join projects pr on pr.id = p.id
           where p.status = 'delivered' and not p.revision_ok and pr.imported_from is null and p.delivered_on >= current_date - 365
           order by p.delivered_on desc`,
  },
  'translator-competence': {
    title: 'Every translator and reviser has their competence on record',
    source: 'ISO 17100:2015, clause 3.1.4 (translator competences: a translation qualification, another degree plus two years, or five years full-time)',
    sql: `select distinct l.ref as record, l.name as who, 'has translation or revision work and no competence recorded' as detail
            from linguists l join jobs j on j.linguist_id = l.id
           where l.competence is null and (j.status = 'assigned' or j.done_on >= current_date - 365)`,
  },
  'certified-translator': {
    title: 'Certified translations only by a NAATI Certified Translator in that direction',
    source: 'NAATI certification system; Department of Home Affairs, translating documents for visa applications',
    sql: `select p.ref as record, p.client as who, l.name || ' has no NAATI Certified Translator ' || p.source_lang || ' > ' || p.target_lang || ' current on ' || coalesce(p.delivered_on, p.due_on) as detail
            from v_projects p join jobs j on j.project_id = p.id and j.step = 'translation' and j.status in ('assigned', 'done') join linguists l on l.id = j.linguist_id
           where p.certified and p.status in ('open', 'delivered') and coalesce(p.delivered_on, p.due_on) >= current_date - 365
             and not exists (select 1 from credentials c where c.linguist_id = j.linguist_id and c.type = 'CT' and c.source_lang = p.source_lang
                                and c.target_lang = p.target_lang and c.expires_on >= coalesce(p.delivered_on, p.due_on))`,
  },
  'interpreter-credential': {
    title: 'Interpreters hold a current NAATI credential for the language; court and legal work a Certified Interpreter or above',
    source: 'NAATI certification system; Recommended National Standards for Working with Interpreters in Courts and Tribunals (JCCD, second edition 2022)',
    sql: `select b.ref as record, b.client as who,
                 coalesce(b.interpreter, '') || case when b.credential_rank is null then ': no current ' || b.language || ' interpreting credential'
                   else ': ' || interp_rank_name(b.credential_rank) || ' on a ' || b.setting || ' booking' end || ', ' || to_char(b.starts_at, 'DD Mon') as detail
            from v_bookings b
           where b.status in ('assigned', 'done') and b.on_date >= current_date - 90
             and (b.credential_rank is null or (b.setting in ('court', 'legal') and b.credential_rank < setting_num('court_min_rank', 3)))`,
  },
  'credential-currency': {
    title: 'No active linguist works on a lapsed NAATI credential',
    source: 'NAATI recertification: every credential runs three years and lapses unless renewed',
    sql: `select v.linguist_ref as record, v.linguist as who, 'NAATI ' || v.type || ' ' || v.source_lang || ' > ' || v.target_lang || ' expired ' || v.expires_on as detail
            from v_credentials v join linguists l on l.id = v.linguist_id
           where l.status = 'active' and v.state = 'expired'
             and not exists (select 1 from credentials n where n.linguist_id = v.linguist_id and n.type = v.type and n.source_lang = v.source_lang
                                and n.target_lang = v.target_lang and n.expires_on >= current_date)`,
  },
  confidentiality: {
    title: 'Nobody handles client documents or sessions without a signed confidentiality agreement',
    source: 'Privacy Act 1988 (Cth), APP 11 (security of personal information); Privacy Act 2020 (NZ), IPP 5; AUSIT Code of Ethics, confidentiality',
    sql: `select l.ref as record, l.name as who, 'has live work and no signed confidentiality agreement' as detail
            from linguists l
           where l.nda_signed_on is null
             and (exists (select 1 from jobs j where j.linguist_id = l.id and j.status = 'assigned')
                  or exists (select 1 from bookings b where b.linguist_id = l.id and b.status = 'assigned'))`,
  },
};

async function cmdCompliance(db, args, flags) {
  const keys = args[0] ? [args[0]] : Object.keys(RULES);
  const results = [];
  for (const k of keys) {
    const rule = RULES[k];
    if (!rule) throw new CliError(`No rule "${k}". Rules: ${Object.keys(RULES).join(', ')}`);
    const rows = await db.query(rule.sql);
    results.push({ rule: k, title: rule.title, source: rule.source, status: rows.length ? 'BREACH' : 'PASS', breaches: rows });
  }
  out(flags, results, (r) => {
    console.log(heading('Compliance'));
    for (const x of r) {
      console.log(`\n  ${x.status.padEnd(6)} ${x.rule}: ${x.title}\n         Source: ${x.source}`);
      for (const b of x.breaches) console.log(`         - ${b.record}  ${b.who}  ${b.detail}`);
    }
    console.log('\n  The rule book and its sources: docs/compliance.md. Not legal advice; change the rules to match your contracts and your clients.');
  });
}

// ---------------------------------------------------------------------------
// Log and drafts. Drafts land in drafts/; a person sends them.

async function cmdLog(db, args, flags) {
  const [subjectQ, ...words] = args;
  const text = str(flags.text) || words.join(' ');
  if (!subjectQ || !text) throw new CliError('log <client, linguist, project or booking> "what happened"');
  let subject;
  if (/^p-\d+$/i.test(subjectQ)) subject = `project:${(await findProject(db, subjectQ)).ref}`;
  else if (/^b-/i.test(subjectQ)) subject = `client:${(await findBooking(db, subjectQ)).client_ref}`;
  else if (/^l-/i.test(subjectQ)) subject = `linguist:${(await findLinguist(db, subjectQ)).ref}`;
  else {
    const c = (await db.query(`select ref from clients where name ilike $1 or ref ilike $1`, [`%${subjectQ}%`]));
    const l = (await db.query(`select ref from linguists where name ilike $1`, [`%${subjectQ}%`]));
    if (c.length === 1 && !l.length) subject = `client:${c[0].ref}`;
    else if (l.length === 1 && !c.length) subject = `linguist:${l[0].ref}`;
    else subject = `client:${(await findClient(db, subjectQ)).ref}`;
  }
  await logActivity(db, subject, text);
  out(flags, { subject, text }, (d) => console.log(`Logged on ${d.subject}.`));
}

function writeDraft(name, body) {
  const dir = path.join(REPO_ROOT, 'drafts');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.md`);
  writeFileSync(file, body);
  return path.relative(REPO_ROOT, file);
}

const first = (name) => (name || '').split(' ')[0] || 'there';

async function cmdDraft(db, args, flags) {
  const [kind, q] = args;
  const biz = await setting(db, 'business_name', 'Your Business');
  const gst = Number(await setting(db, 'gst_pct', 10));
  let file;
  let to;
  if (kind === 'overdue') {
    const [i] = await db.query(`select * from v_invoices where lower(ref) = lower($1)`, [q || '']);
    if (!i) throw new CliError(`No invoice ${q || ''}.`);
    if (i.days_overdue <= 0) throw new CliError(`${i.ref} is not overdue.`);
    to = i.email;
    const incl = Math.round(Number(i.total_cents) * (1 + gst / 100));
    file = writeDraft(`overdue-${i.ref}`, `To: ${i.email}\nSubject: ${i.ref} from ${biz}, ${$$(incl)} due ${i.due_on}\n\nHi ${first(i.contact_name)},\n\nInvoice ${i.ref} for ${$$(incl)} including GST was due on ${i.due_on} and is now ${i.days_overdue} days past its terms. Could you arrange payment this week, or let me know if anything on it needs looking at?\n\nThanks,\n${biz}\n`);
  } else if (kind === 'quote') {
    const qt = await findQuote(db, q);
    const [c] = await db.query(`select * from clients where id = $1`, [qt.client_id]);
    const [l1] = await db.query(`select name from languages where code = $1`, [qt.source_lang]);
    const [l2] = await db.query(`select name from languages where code = $1`, [qt.target_lang]);
    const [full] = await db.query(`select due_days from quotes where id = $1`, [qt.id]);
    to = c.email;
    const chase = qt.status === 'sent';
    const incl = Math.round(Number(qt.amount_cents) * (1 + gst / 100));
    const scope = qt.certified ? `${qt.pages} page${qt.pages === 1 ? '' : 's'}, certified by a NAATI Certified Translator` : `${Number(qt.words).toLocaleString('en-AU')} words`;
    file = writeDraft(`quote-${qt.ref}`, chase
      ? `To: ${c.email}\nSubject: Re: ${qt.ref} ${qt.title}\n\nHi ${first(c.contact_name)},\n\nFollowing up on our quote for ${qt.title}, ${l1.name} into ${l2.name}: ${$$(qt.amount_cents)} ex GST (${$$(incl)} including GST), ${full.due_days} days from your go-ahead. It holds until ${qt.valid_until}. If the files have changed, send them over and I will update it.\n\nThanks,\n${biz}\n`
      : `To: ${c.email}\nSubject: Quote ${qt.ref}: ${qt.title}\n\nHi ${first(c.contact_name)},\n\nThanks for sending this through. Our quote:\n\n- ${qt.title}, ${l1.name} into ${l2.name}, ${scope}\n- Translated, then revised by a second qualified linguist before it comes back to you\n- ${$$(qt.amount_cents)} ex GST, ${$$(incl)} including GST\n- Ready ${full.due_days} days from your go-ahead\n\nReply to go ahead and we will start today.\n\nThanks,\n${biz}\n`);
  } else if (kind === 'confirm') {
    const b = await findBooking(db, q);
    const [c] = await db.query(`select * from clients where id = $1`, [b.client_id]);
    to = c.email;
    file = writeDraft(`confirm-${b.ref}`, `To: ${c.email}\nSubject: Confirmed: ${b.language} interpreter, ${dayLabel(b.on_date)} ${hm(b.starts_at)} (${b.ref})\n\nHi ${first(c.contact_name)},\n\nConfirming your booking:\n\n- ${b.language} interpreter, ${b.mode}, ${b.minutes_booked} minutes\n- ${dayLabel(b.on_date)} ${String(b.on_date).slice(0, 4)}, ${hm(b.starts_at)}\n${b.address ? `- ${b.address}${b.onsite_contact ? `, ask for ${b.onsite_contact}` : ''}\n` : ''}- Interpreter: ${b.interpreter || 'to be confirmed'}\n${b.po_number ? `- Your PO: ${b.po_number}\n` : ''}\nCancellations with less than ${await setting(db, 'late_cancel_hours', 24)} hours notice are charged at the minimum.\n\nThanks,\n${biz}\n`);
  } else if (kind === 'offer') {
    const j = await findJob(db, q);
    if (!j.linguist_id) throw new CliError(`${j.ref} has nobody on it. Assign it first.`);
    const [l] = await db.query(`select * from linguists where id = $1`, [j.linguist_id]);
    to = l.email;
    file = writeDraft(`offer-${j.ref}`, `To: ${l.email}\nSubject: ${j.ref}: ${j.step} ${j.source_lang} > ${j.target_lang}, due ${j.due_on}\n\nHi ${first(l.name)},\n\nConfirming ${j.ref} is yours:\n\n- ${j.title}, ${j.step}, ${j.source_lang} > ${j.target_lang}\n- ${j.certified && j.step === 'translation' ? `${j.pages} pages, certified: sign the certification statement with your NAATI number` : `${Number(j.words).toLocaleString('en-AU')} words`}\n- Due ${j.due_on}\n- ${$$(j.cost_cents)} ex GST, paid on the next pay run after it is done\n\nThe documents are confidential under your agreement with us. Reply if the date does not work.\n\nThanks,\n${biz}\n`);
  } else if (kind === 'recert') {
    const l = await findLinguist(db, q);
    const [c] = await db.query(`select * from v_credentials where linguist_id = $1 and state <> 'current' order by expires_on limit 1`, [l.id]);
    if (!c) throw new CliError(`${l.name} has no credential expired or ending within the warning window.`);
    to = l.email;
    file = writeDraft(`recert-${l.ref}`, `To: ${l.email}\nSubject: Your NAATI ${c.type} ${c.source_lang} > ${c.target_lang} ${c.state === 'expired' ? 'expired' : 'ends'} ${c.expires_on}\n\nHi ${first(l.name)},\n\nOur records show your NAATI ${c.type} credential (${c.source_lang} > ${c.target_lang}, ${c.number || 'number not on file'}) ${c.state === 'expired' ? 'expired' : 'ends'} on ${c.expires_on}. ${c.state === 'expired' ? 'Until we have the renewed credential we cannot send you certified work in that direction.' : 'Once you have recertified through myNAATI, send us the new expiry and we will update your record.'}\n\nThanks,\n${biz}\n`);
  } else throw new CliError('draft overdue <INV> | quote <Q> | confirm <B> | offer <job> | recert <linguist>');
  out(flags, { draft: file, to }, (d) => console.log(`Drafted ${d.draft} (to ${d.to || 'no email on file'}). Nothing was sent.`));
}

// ---------------------------------------------------------------------------
// Import from XTRF (every view exports to CSV) and export everything.

async function langCode(db, v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const base = s.replace(/\s*\(.*\)\s*$/, '').trim();
  const rows = await db.query(`select code from languages where lower(code) = lower($1) or lower(code) = lower(split_part($1, '-', 1)) or lower(name) = lower($2) or name ilike $3 order by code`, [s, s, `${base}%`]);
  return rows.length === 1 ? rows[0].code : null;
}

async function cmdImport(db, args, flags) {
  if ((args[0] || '').toLowerCase() !== 'xtrf') throw new CliError('import xtrf --clients=FILE [--vendors=FILE --projects=FILE] [--dry-run]');
  const dry = !!flags['dry-run'];
  const read = (f) => parseCsv(readFileSync(path.resolve(String(f)), 'utf8'));
  const created = { clients: 0, linguists: 0, pairs: 0, projects: 0 };
  const updated = { clients: 0, linguists: 0 };
  const skipped = [];
  await db.exec('BEGIN');
  try {
    if (flags.clients) {
      for (const [i, r] of read(flags.clients).entries()) {
        const name = pick(r, 'Name', 'Client Name', 'Full Name', 'Client', 'Customer', 'Company');
        if (!name) { skipped.push({ file: 'clients', row: i + 2, why: 'no client name' }); continue; }
        const vals = [pick(r, 'Email', 'E-mail', 'Email Address') || null, pick(r, 'Phone', 'Phone Number', 'Mobile') || null, pick(r, 'Contact Person', 'Contact', 'Primary Contact') || null,
          pick(r, 'Tax No', 'Tax Number', 'ABN', 'NZBN', 'VAT ID') || null, Number(String(pick(r, 'Payment Terms', 'Payment Terms (Days)', 'Terms')).replace(/\D/g, '')) || 14];
        const [exist] = await db.query(`select id from clients where lower(name) = lower($1)`, [name]);
        if (exist) {
          await db.query(`update clients set email = coalesce($2, email), phone = coalesce($3, phone), contact_name = coalesce($4, contact_name), abn = coalesce($5, abn), terms_days = $6 where id = $1`, [exist.id, ...vals]);
          updated.clients++;
        } else {
          await db.query(`insert into clients (ref, name, email, phone, contact_name, abn, terms_days, notes) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [await nextRef(db, 'clients', 'C-'), name, ...vals, `Imported from XTRF${pick(r, 'ID', 'Client ID') ? ` client ${pick(r, 'ID', 'Client ID')}` : ''}`]);
          created.clients++;
        }
      }
    }
    if (flags.vendors) {
      for (const [i, r] of read(flags.vendors).entries()) {
        const name = pick(r, 'Name', 'Full Name', 'Vendor', 'Vendor Name', 'Provider');
        if (!name) { skipped.push({ file: 'vendors', row: i + 2, why: 'no vendor name' }); continue; }
        const email = pick(r, 'Email', 'E-mail', 'Email Address') || null;
        const [exist] = await db.query(`select id from linguists where lower(name) = lower($1)`, [name]);
        let lid;
        if (exist) {
          await db.query(`update linguists set email = coalesce($2, email), phone = coalesce($3, phone) where id = $1`, [exist.id, email, pick(r, 'Phone', 'Mobile') || null]);
          updated.linguists++;
          lid = exist.id;
        } else {
          const [l] = await db.query(`insert into linguists (ref, name, email, phone, abn, notes) values ($1, $2, $3, $4, $5, $6) returning id`,
            [await nextRef(db, 'linguists', 'L-', 3), name, email, pick(r, 'Phone', 'Mobile') || null, pick(r, 'Tax No', 'ABN', 'Tax Number') || null, 'Imported from XTRF. Record competence, NDA and NAATI credentials before assigning work.']);
          created.linguists++;
          lid = l.id;
        }
        // "Chinese (Simplified) > English; English > Chinese (Simplified)" or a Source / Target column pair
        const combos = pick(r, 'Language Combinations', 'Language Pairs', 'Languages');
        const pairs = combos ? combos.split(/[;|\n]+/).map((x) => x.split(/\s*(?:>|->|→| to )\s*/)) : [[pick(r, 'Source Language'), pick(r, 'Target Language')]];
        for (const [a, b] of pairs) {
          if (!a || !b) continue;
          const [src, tgt] = [await langCode(db, a), await langCode(db, b)];
          if (!src || !tgt) { skipped.push({ file: 'vendors', row: i + 2, why: `language pair "${a} > ${b}" not in the languages table (add it, then re-run)` }); continue; }
          const res = await db.query(`insert into linguist_pairs (linguist_id, source_lang, target_lang) values ($1, $2, $3) on conflict do nothing returning linguist_id`, [lid, src, tgt]);
          created.pairs += res.length;
        }
      }
    }
    if (flags.projects) {
      for (const [i, r] of read(flags.projects).entries()) {
        const clientName = pick(r, 'Client', 'Client Name', 'Customer');
        const [c] = clientName ? await db.query(`select * from clients where lower(name) = lower($1)`, [clientName]) : [];
        if (!c) { skipped.push({ file: 'projects', row: i + 2, why: `client "${clientName}" not found (import clients first)` }); continue; }
        const src = await langCode(db, pick(r, 'Source Language', 'Source'));
        const targets = String(pick(r, 'Target Languages', 'Target Language', 'Target')).split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
        const total = Math.round(Number(String(pick(r, 'Total Agreed', 'Total', 'Total Agreed Value', 'Value')).replace(/[^0-9.]/g, '') || 0) * 100);
        const statusRaw = pick(r, 'Status', 'Project Status').toLowerCase();
        const status = /closed|complete|delivered|invoiced/.test(statusRaw) ? 'delivered' : /cancel/.test(statusRaw) ? 'cancelled' : 'open';
        const deadline = parseDate(pick(r, 'Deadline', 'Due Date', 'Client Deadline').slice(0, 10)) || TODAY;
        const xtrfId = pick(r, 'Project ID', 'ID', 'Number', 'Project Number');
        const name = pick(r, 'Name', 'Project Name', 'Title') || `XTRF ${xtrfId}`;
        if (!src || !targets.length) { skipped.push({ file: 'projects', row: i + 2, why: 'source or target language not recognised' }); continue; }
        for (const [k, t] of targets.entries()) {
          const tgt = await langCode(db, t);
          if (!tgt) { skipped.push({ file: 'projects', row: i + 2, why: `target "${t}" not in the languages table` }); continue; }
          const note = `XTRF ${xtrfId}${targets.length > 1 ? ` (${k + 1} of ${targets.length})` : ''}`;
          const [exist] = await db.query(`select id from projects where notes = $1`, [note]);
          if (exist) continue;
          const share = Math.round(total / targets.length);
          if (status === 'open') {
            const p = await newProjectRows(db, c, { title: name, src, tgt, certified: false, words: Number(String(pick(r, 'Words', 'Total Words', 'Word Count')).replace(/\D/g, '')) || 0, pages: 0, price_cents: share, due: deadline });
            await db.query(`update projects set notes = $2, imported_from = 'xtrf' where id = $1`, [p.id, note]);
          } else {
            await db.query(`insert into projects (ref, client_id, title, source_lang, target_lang, price_cents, received_on, due_on, delivered_on, status, imported_from, notes)
                            values ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, 'xtrf', $10)`,
              [await nextRef(db, 'projects', 'P-'), c.id, name, src, tgt, share, deadline, status === 'delivered' ? deadline : null, status, note]);
          }
          created.projects++;
        }
      }
    }
    await db.exec(dry ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  out(flags, { dry_run: dry, created, updated, skipped }, (d) => {
    console.log(heading(d.dry_run ? 'Test run, nothing saved' : 'Imported from XTRF'));
    console.log(`  created: ${Object.entries(d.created).map(([k, v]) => `${v} ${k}`).join(', ')}; updated: ${d.updated.clients} clients, ${d.updated.linguists} linguists`);
    for (const s of d.skipped) console.log(`  skipped ${s.file} row ${s.row}: ${s.why}`);
    if (!d.dry_run) console.log('\n  Imported history is marked as such: it predates the revision record here. Record each linguist\'s competence, NDA and NAATI credentials before giving them work.');
  });
}

async function cmdExport(db, flags) {
  const dir = path.resolve(REPO_ROOT, str(flags.out) || 'exports');
  mkdirSync(dir, { recursive: true });
  const tables = ['settings', 'languages', 'clients', 'linguists', 'linguist_pairs', 'credentials', 'linguist_rates', 'price_list', 'quotes', 'projects', 'jobs', 'bookings', 'invoices', 'invoice_lines', 'pay_runs', 'pay_lines', 'activity'];
  const esc = (v) => { if (v === null || v === undefined) return ''; const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const counts = {};
  for (const tname of tables) {
    const rows = await db.query(`select * from ${tname}`);
    const cols = rows.length ? Object.keys(rows[0]) : [];
    writeFileSync(path.join(dir, `${tname}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n');
    counts[tname] = rows.length;
  }
  out(flags, { dir: path.relative(REPO_ROOT, dir) || '.', counts }, (d) => console.log(`Exported ${Object.values(d.counts).reduce((a, b) => a + b, 0)} rows across ${tables.length} files to ${d.dir}/.`));
}

// ---------------------------------------------------------------------------

function help() {
  console.log(`translation-agency-for-claude-code

  The day      attention [--rank=N]   today [--date=tomorrow]   stats
  Quotes       quote <client> --from=zh --to=en --words=N | --certified --pages=N [--title= --purpose= --due-days=]
               quote send|accept|decline <Q> [--due= --po= --why=]   quotes [--all]
  Projects     project new <client> --from= --to= --words= [--certified --pages=] [--due=] [--po=]   projects [--all]   project <P>
               find <from> <to> [--certified]   assign <job> <linguist>   done <job> [--words=]   deliver <P>
  Interpreting book <client> --lang= --mode=onsite|video|phone --setting=medical|legal|court|community|business --at="YYYY-MM-DD HH:MM" --minutes= [--address= --contact= --for= --po=]
               find <lang> --interpreting [--setting= --at=]   interpreter <B> <linguist>   timesheet <B> --minutes=   bookings [--date= --days=]
               cancel <B|P|job> --why= [--at=]
  Panel        linguists [--lang=]   linguist <name>   linguist add "Name" [--email=]   linguist set <name> [--nda= --competence= --status= --pair="zh>en" --rate=revision:4]
               credentials [--days=N | --all]   credential add <linguist> --type=CT --from= --to= --expires= | --type=CI --lang= --expires=
  Money        bill [--to=] [--dry-run]   invoices [--open]   invoice issue|paid|void <INV>   margins [--days=90]
               payables   pay-run [--to=] [--dry-run]   pay-run approve|paid <PR>   hold <client> --why=   release <client>
  Clients      clients   client <name>
  Paper        compliance [rule]   log <subject> "text"   history [text]
               draft overdue <INV> | quote <Q> | confirm <B> | offer <job> | recert <linguist>
  Settings     settings   setting set <key> <value>
  Moving       import xtrf --clients= [--vendors= --projects=] [--dry-run]   export [--out=DIR]

Any read command takes --json. Money in ${CUR} ex GST.`);
}

// ---------------------------------------------------------------------------
// Main

const { args: argv, flags } = parseArgv(process.argv.slice(2));
const [cmd, ...rest] = argv;
const sub = (rest[0] || '').toLowerCase();

const db = await getDb();
try {
  [{ d: TODAY }] = await db.query(`select current_date::text as d`);
  CUR = await setting(db, 'currency', 'AUD');
  switch ((cmd || 'help').toLowerCase()) {
    case 'help': help(); break;
    case 'stats': await cmdStats(db, flags); break;
    case 'attention': await cmdAttention(db, flags); break;
    case 'today': await cmdToday(db, flags); break;
    case 'quote':
      if (['send', 'accept', 'decline'].includes(sub)) await cmdQuoteSet(db, sub, rest.slice(1), flags);
      else await cmdQuoteNew(db, rest, flags);
      break;
    case 'quotes': await cmdQuotes(db, flags); break;
    case 'project':
      if (sub === 'new') await cmdProjectNew(db, rest.slice(1), flags);
      else await cmdProject(db, rest.join(' '), flags);
      break;
    case 'projects': await cmdProjects(db, flags); break;
    case 'find': await cmdFind(db, rest, flags); break;
    case 'assign': await cmdAssign(db, rest, flags); break;
    case 'done': await cmdDone(db, rest, flags); break;
    case 'deliver': await cmdDeliver(db, rest, flags); break;
    case 'book': await cmdBook(db, rest, flags); break;
    case 'interpreter': await cmdInterpreter(db, rest, flags); break;
    case 'timesheet': await cmdTimesheet(db, rest, flags); break;
    case 'bookings': await cmdBookings(db, flags); break;
    case 'cancel': await cmdCancel(db, rest, flags); break;
    case 'linguists': await cmdLinguists(db, flags); break;
    case 'linguist':
      if (sub === 'set') await cmdLinguistSet(db, rest.slice(1), flags);
      else if (sub === 'add') await cmdLinguistAdd(db, rest.slice(1), flags);
      else await cmdLinguist(db, rest.join(' '), flags);
      break;
    case 'credentials': await cmdCredentials(db, flags); break;
    case 'credential':
      if (sub === 'add') await cmdCredentialAdd(db, rest.slice(1), flags);
      else throw new CliError('credential add <linguist> --type= ... --expires=');
      break;
    case 'clients': await cmdClients(db, flags); break;
    case 'client': await cmdClient(db, rest.join(' '), flags); break;
    case 'margins': await cmdMargins(db, flags); break;
    case 'bill': await cmdBill(db, flags); break;
    case 'invoices': await cmdInvoices(db, flags); break;
    case 'invoice': await cmdInvoice(db, sub, rest.slice(1), flags); break;
    case 'payables': await cmdPayables(db, flags); break;
    case 'pay-run': await cmdPayRun(db, rest, flags); break;
    case 'hold': await cmdHold(db, rest, flags, true); break;
    case 'release': await cmdHold(db, rest, flags, false); break;
    case 'compliance': await cmdCompliance(db, rest, flags); break;
    case 'log': await cmdLog(db, rest, flags); break;
    case 'settings': case 'setting': await cmdSettings(db, sub, rest.slice(1), flags); break;
    case 'history': await cmdHistory(db, rest.join(' '), flags); break;
    case 'draft': await cmdDraft(db, rest, flags); break;
    case 'import': await cmdImport(db, rest, flags); break;
    case 'export': await cmdExport(db, flags); break;
    default: throw new CliError(`Unknown command "${cmd}". Run with no arguments for the list.`);
  }
} catch (e) {
  if (e instanceof CliError) { console.error(e.message); process.exitCode = e.code; }
  else { console.error(e.stack || e.message); process.exitCode = 2; }
} finally {
  await db.close();
}
