-- Translation Agency for Claude Code: the schema.
--
-- A translation and interpreting agency the way XTRF sells it: clients, the
-- linguist panel with its language pairs, NAATI credentials and rates, the
-- client price list, quotes, translation projects split into translation and
-- revision jobs, interpreting bookings, client invoices, linguist pay runs and
-- a log. Plain SQL. Works on Postgres and PGlite.
--
-- Money is integer cents, ex GST. Interpreting time is minutes. Nothing is
-- deleted: projects, jobs and bookings cancel with a reason, linguists become
-- inactive, invoices void.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Settings: the house rules, in one place the operator changes in plain words.

create table settings (
  key        text primary key,
  value      text not null,
  note       text,
  updated_at timestamptz not null default now()
);

create or replace function setting_num(k text, dflt numeric) returns numeric language sql stable as $$
  select coalesce((select value::numeric from settings where key = k), dflt)
$$;

-- NAATI interpreting credentials, lowest to highest. Court and legal work asks
-- for rank 3 or above (setting court_min_rank).
create or replace function interp_rank(t text) returns int language sql immutable as $$
  select case upper(coalesce(t, '')) when 'RPI' then 1 when 'CPI' then 2 when 'CI' then 3
                                     when 'CSHI' then 4 when 'CSLI' then 4 when 'CCI' then 4 else 0 end
$$;

create or replace function interp_rank_name(r numeric) returns text language sql immutable as $$
  select case r::int when 1 then 'Recognised Practising Interpreter' when 2 then 'Certified Provisional Interpreter'
                     when 3 then 'Certified Interpreter' when 4 then 'a specialist credential' else 'no credential' end
$$;

-- ---------------------------------------------------------------------------
-- Languages. Tier sets the price band: A common, B less common, C rare.

create table languages (
  code text primary key,
  name text not null unique,
  tier text not null default 'A' check (tier in ('A', 'B', 'C'))
);

-- ---------------------------------------------------------------------------
-- Clients

create table clients (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique,
  name         text not null,
  kind         text not null default 'account' check (kind in ('account', 'private')),
  abn          text,
  contact_name text,
  email        text,
  phone        text,
  terms_days   int not null default 14 check (terms_days >= 0),
  credit_hold  boolean not null default false,
  hold_reason  text,
  status       text not null default 'active' check (status in ('active', 'former')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger clients_touch before update on clients for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- The linguist panel

create table linguists (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,
  name           text not null,
  kind           text not null default 'freelance' check (kind in ('freelance', 'staff')),
  email          text,
  phone          text,
  abn            text,
  gst_registered boolean not null default false,
  -- ISO 17100 clause 3.1.4: how the translator's competence was established.
  competence     text check (competence in ('translation degree', 'other degree plus 2 years', '5 years experience')),
  competence_note text,
  nda_signed_on  date,
  suburb         text,
  status         text not null default 'active' check (status in ('active', 'inactive')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger linguists_touch before update on linguists for each row execute function touch_updated_at();

-- What each linguist works in, one row per direction (zh to en is not en to zh).
create table linguist_pairs (
  linguist_id uuid not null references linguists(id),
  source_lang text not null references languages(code),
  target_lang text not null references languages(code),
  specialism  text,
  primary key (linguist_id, source_lang, target_lang)
);

-- NAATI credentials. Translator credentials are one direction; interpreter
-- credentials are a language and English both ways (stored as lang -> en).
--   CT  Certified Translator          RPT Recognised Practising Translator
--   CI  Certified Interpreter         CPI Certified Provisional Interpreter
--   RPI Recognised Practising Interpreter
--   CSHI / CSLI / CCI  specialist health, specialist legal, conference
create table credentials (
  id          uuid primary key default gen_random_uuid(),
  linguist_id uuid not null references linguists(id),
  body        text not null default 'NAATI',
  type        text not null check (type in ('CT', 'RPT', 'CI', 'CPI', 'RPI', 'CSHI', 'CSLI', 'CCI')),
  source_lang text not null references languages(code),
  target_lang text not null references languages(code),
  number      text,
  issued_on   date,
  expires_on  date not null,
  created_at  timestamptz not null default now()
);
create index credentials_linguist on credentials (linguist_id);

-- What the agency pays each linguist.
create table linguist_rates (
  linguist_id uuid not null references linguists(id),
  service     text not null check (service in ('translation', 'revision', 'certified', 'onsite', 'video', 'phone')),
  rate_cents  int not null check (rate_cents >= 0),   -- a word, a page, or an hour
  min_minutes int not null default 0,
  primary key (linguist_id, service)
);

-- What the agency charges. client_id null is the standard list; a client row wins.
create table price_list (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references clients(id),
  service     text not null check (service in ('translation', 'certified', 'onsite', 'video', 'phone')),
  tier        text not null check (tier in ('A', 'B', 'C')),
  rate_cents  int not null check (rate_cents >= 0),   -- a word, a page, or an hour
  min_minutes int not null default 0,
  min_cents   int not null default 0,                  -- smallest translation charge
  unique (client_id, service, tier)
);

-- ---------------------------------------------------------------------------
-- Translation: quotes, projects and the jobs inside them

create table quotes (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null unique,
  client_id   uuid not null references clients(id),
  title       text not null,
  source_lang text not null references languages(code),
  target_lang text not null references languages(code),
  certified   boolean not null default false,
  purpose     text,
  words       int not null default 0 check (words >= 0),
  pages       int not null default 0 check (pages >= 0),
  amount_cents int not null check (amount_cents >= 0),
  due_days    int not null default 5,
  status      text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired')),
  sent_on     date,
  valid_until date,
  decided_on  date,
  decline_reason text,
  created_on  date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger quotes_touch before update on quotes for each row execute function touch_updated_at();

create table projects (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique,
  client_id    uuid not null references clients(id),
  quote_id     uuid references quotes(id),
  title        text not null,
  source_lang  text not null references languages(code),
  target_lang  text not null references languages(code),
  certified    boolean not null default false,
  purpose      text,
  words        int not null default 0 check (words >= 0),
  pages        int not null default 0 check (pages >= 0),
  price_cents  int not null check (price_cents >= 0),
  po_number    text,
  received_on  date not null default current_date,
  due_on       date not null,
  delivered_on date,
  status       text not null default 'open' check (status in ('open', 'delivered', 'cancelled')),
  cancel_reason text,
  imported_from text,              -- 'xtrf' for history brought across: it predates the revision record here
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger projects_touch before update on projects for each row execute function touch_updated_at();

-- One translation job and one revision job per project by default (ISO 17100
-- clause 5.3.3: revision by a second person). A revision job points at the
-- translation it revises.
create table jobs (
  id           uuid primary key default gen_random_uuid(),
  ref          text not null unique,
  project_id   uuid not null references projects(id),
  step         text not null check (step in ('translation', 'revision')),
  revises_id   uuid references jobs(id),
  linguist_id  uuid references linguists(id),
  words        int not null default 0,
  pages        int not null default 0,
  due_on       date not null,
  assigned_on  date,
  done_on      date,
  cost_cents   int,
  status       text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'done', 'cancelled')),
  cancel_reason text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger jobs_touch before update on jobs for each row execute function touch_updated_at();
create index jobs_project on jobs (project_id);

-- ---------------------------------------------------------------------------
-- Interpreting

create table bookings (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,
  client_id      uuid not null references clients(id),
  lang           text not null references languages(code),
  mode           text not null check (mode in ('onsite', 'video', 'phone')),
  setting        text not null default 'community' check (setting in ('medical', 'legal', 'court', 'community', 'business')),
  starts_at      timestamp not null,
  minutes_booked int not null check (minutes_booked > 0),
  address        text,
  onsite_contact text,
  client_name    text,             -- the person being interpreted for, as the client gave it
  po_number      text,
  linguist_id    uuid references linguists(id),
  status         text not null default 'open' check (status in ('open', 'assigned', 'done', 'cancelled')),
  minutes_actual int,
  cancelled_at   timestamp,
  cancel_reason  text,
  late_cancel    boolean not null default false,
  price_cents    int,
  cost_cents     int,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger bookings_touch before update on bookings for each row execute function touch_updated_at();
create index bookings_starts on bookings (starts_at);

-- ---------------------------------------------------------------------------
-- Money: client invoices and linguist pay runs

create table invoices (
  id         uuid primary key default gen_random_uuid(),
  ref        text not null unique,
  client_id  uuid not null references clients(id),
  status     text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  issued_on  date,
  due_on     date,
  paid_on    date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger invoices_touch before update on invoices for each row execute function touch_updated_at();

create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id),
  project_id   uuid references projects(id),
  booking_id   uuid references bookings(id),
  description  text not null,
  amount_cents int not null
);
-- A project or booking is billed once (a void invoice releases it: see v_unbilled).
create index invoice_lines_project on invoice_lines (project_id);
create index invoice_lines_booking on invoice_lines (booking_id);

create table pay_runs (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null unique,
  linguist_id uuid not null references linguists(id),
  period_to   date not null,
  status      text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  paid_on     date,
  created_at  timestamptz not null default now()
);

create table pay_lines (
  id          uuid primary key default gen_random_uuid(),
  pay_run_id  uuid not null references pay_runs(id),
  job_id      uuid unique references jobs(id),
  booking_id  uuid unique references bookings(id),
  description text not null,
  amount_cents int not null
);

create table activity (
  id      uuid primary key default gen_random_uuid(),
  at      timestamptz not null default now(),
  subject text not null,
  text    text not null
);

-- ---------------------------------------------------------------------------
-- Views

-- Every credential with its state on a given day (today here).
create or replace view v_credentials as
select c.id, c.linguist_id, l.ref as linguist_ref, l.name as linguist, c.body, c.type,
       c.source_lang, c.target_lang, c.number, c.issued_on, c.expires_on,
       (c.expires_on - current_date) as days_left,
       case when c.expires_on < current_date then 'expired'
            when c.expires_on - current_date <= setting_num('credential_warn_days', 90) then 'renew soon'
            else 'current' end as state
  from credentials c join linguists l on l.id = c.linguist_id;

create or replace view v_jobs as
select j.id, j.ref, j.step, j.status, j.due_on, j.done_on, j.assigned_on, j.words, j.pages, j.cost_cents,
       p.id as project_id, p.ref as project, p.title, p.certified, p.source_lang, p.target_lang,
       c.name as client, l.id as linguist_id, l.name as linguist,
       (current_date - j.due_on) as days_late
  from jobs j join projects p on p.id = j.project_id join clients c on c.id = p.client_id
  left join linguists l on l.id = j.linguist_id;

-- A project with its revision state and money. revision_ok means every live
-- translation job has a finished revision by somebody else.
create or replace view v_projects as
select p.id, p.ref, p.title, p.status, p.certified, p.purpose, p.source_lang, p.target_lang, p.words, p.pages,
       p.received_on, p.due_on, p.delivered_on, p.po_number,
       c.id as client_id, c.ref as client_ref, c.name as client,
       (p.due_on - current_date) as days_to_due,
       p.price_cents,
       coalesce((select sum(j.cost_cents) from jobs j where j.project_id = p.id and j.status <> 'cancelled'), 0) as cost_cents,
       p.price_cents - coalesce((select sum(j.cost_cents) from jobs j where j.project_id = p.id and j.status <> 'cancelled'), 0) as margin_cents,
       (select count(*) from jobs j where j.project_id = p.id and j.status = 'unassigned') as unassigned,
       (select count(*) from jobs j where j.project_id = p.id and j.status = 'assigned') as in_progress,
       (select string_agg(l.name, ', ' order by l.name) from jobs j join linguists l on l.id = j.linguist_id
         where j.project_id = p.id and j.step = 'translation' and j.status <> 'cancelled') as translator,
       (select string_agg(l.name, ', ' order by l.name) from jobs j join linguists l on l.id = j.linguist_id
         where j.project_id = p.id and j.step = 'revision' and j.status <> 'cancelled') as reviser,
       not exists (
         select 1 from jobs t where t.project_id = p.id and t.step = 'translation' and t.status <> 'cancelled'
            and not exists (select 1 from jobs r where r.revises_id = t.id and r.status = 'done'
                               and r.linguist_id is distinct from t.linguist_id)
       ) as revision_ok
  from projects p join clients c on c.id = p.client_id;

create or replace view v_bookings as
select b.id, b.ref, b.status, b.lang, la.name as language, b.mode, b.setting, b.starts_at,
       b.starts_at + make_interval(mins => b.minutes_booked) as ends_at, b.minutes_booked, b.minutes_actual,
       b.starts_at::date as on_date, b.address, b.onsite_contact, b.client_name, b.po_number,
       c.id as client_id, c.ref as client_ref, c.name as client,
       l.id as linguist_id, l.name as interpreter,
       (select max(interp_rank(cr.type)) from credentials cr
         where cr.linguist_id = b.linguist_id and cr.source_lang = b.lang and cr.target_lang = 'en'
           and interp_rank(cr.type) > 0 and cr.expires_on >= b.starts_at::date) as credential_rank,
       b.late_cancel, b.price_cents, b.cost_cents,
       round(extract(epoch from (b.starts_at - localtimestamp)) / 3600.0, 1) as hours_to_start
  from bookings b join clients c on c.id = b.client_id join languages la on la.code = b.lang
  left join linguists l on l.id = b.linguist_id;

create or replace view v_quotes as
select q.id, q.ref, q.title, q.status, q.source_lang, q.target_lang, q.certified, q.words, q.pages,
       q.amount_cents, q.sent_on, q.valid_until, q.decided_on, q.decline_reason,
       c.id as client_id, c.name as client, c.email,
       (current_date - q.sent_on) as days_since_sent,
       (q.valid_until - current_date) as days_left
  from quotes q join clients c on c.id = q.client_id;

create or replace view v_invoices as
select i.id, i.ref, i.status, i.issued_on, i.due_on, i.paid_on,
       c.id as client_id, c.ref as client_ref, c.name as client, c.email, c.contact_name,
       coalesce((select sum(amount_cents) from invoice_lines l where l.invoice_id = i.id), 0) as total_cents,
       case when i.status = 'issued' and i.due_on < current_date then current_date - i.due_on else 0 end as days_overdue
  from invoices i join clients c on c.id = i.client_id;

-- Finished work not on a live invoice: delivered projects, completed bookings,
-- and bookings cancelled late (charged at the minimum).
create or replace view v_unbilled as
select 'project' as kind, p.id as item_id, p.ref, p.client_id, c.name as client, p.delivered_on as done_on,
       p.title || ' (' || p.source_lang || ' > ' || p.target_lang || case when p.certified then ', certified' else '' end || ')' as description,
       p.price_cents as amount_cents
  from projects p join clients c on c.id = p.client_id
 where p.status = 'delivered'
   and not exists (select 1 from invoice_lines il join invoices i on i.id = il.invoice_id where il.project_id = p.id and i.status <> 'void')
union all
select 'booking', b.id, b.ref, b.client_id, c.name, case when b.status = 'cancelled' then b.cancelled_at::date else b.starts_at::date end,
       'Interpreting, ' || la.name || ', ' || b.mode || ', ' || to_char(b.starts_at, 'DD Mon HH24:MI')
         || case when b.status = 'cancelled' then ', late cancellation' else '' end,
       b.price_cents
  from bookings b join clients c on c.id = b.client_id join languages la on la.code = b.lang
 where (b.status = 'done' or (b.status = 'cancelled' and b.late_cancel)) and b.price_cents is not null
   and not exists (select 1 from invoice_lines il join invoices i on i.id = il.invoice_id where il.booking_id = b.id and i.status <> 'void');

-- What the agency owes linguists and has not put on a pay run.
create or replace view v_payables as
select 'job' as kind, j.id as item_id, j.ref, j.linguist_id, l.name as linguist, j.done_on,
       j.step || ', ' || p.ref || ' ' || p.title as description, j.cost_cents as amount_cents
  from jobs j join projects p on p.id = j.project_id join linguists l on l.id = j.linguist_id
 where j.status = 'done' and j.cost_cents is not null
   and not exists (select 1 from pay_lines pl where pl.job_id = j.id)
union all
select 'booking', b.id, b.ref, b.linguist_id, l.name, case when b.status = 'cancelled' then b.cancelled_at::date else b.starts_at::date end,
       'Interpreting ' || b.ref || ', ' || c.name || case when b.status = 'cancelled' then ', late cancellation' else '' end,
       b.cost_cents
  from bookings b join linguists l on l.id = b.linguist_id join clients c on c.id = b.client_id
 where (b.status = 'done' or (b.status = 'cancelled' and b.late_cancel)) and b.cost_cents is not null
   and not exists (select 1 from pay_lines pl where pl.booking_id = b.id);

-- Margin by finished item, for /margins.
create or replace view v_margins as
select 'translation' as line, p.client_id, p.client, p.source_lang || ' > ' || p.target_lang as pair, p.ref,
       coalesce(p.delivered_on, p.due_on) as on_date, p.price_cents, p.cost_cents, p.margin_cents,
       round(p.margin_cents * 100.0 / nullif(p.price_cents, 0), 1) as margin_pct
  from v_projects p where p.status = 'delivered'
union all
select 'interpreting', b.client_id, b.client, b.lang || ' ' || b.mode, b.ref, b.on_date, b.price_cents, coalesce(b.cost_cents, 0),
       b.price_cents - coalesce(b.cost_cents, 0),
       round((b.price_cents - coalesce(b.cost_cents, 0)) * 100.0 / nullif(b.price_cents, 0), 1)
  from v_bookings b where (b.status = 'done' or (b.status = 'cancelled' and b.late_cancel)) and b.price_cents is not null;

-- Everything that wants a decision, worst first.
--   1  work about to fail a client or a rule
--   2  work that will fail soon
--   3  paper and people
--   4  money
create or replace view v_attention as
-- interpreting inside 48 hours with nobody on it
select 1 as rank, 'BOOKING UNCOVERED' as reason, b.ref as label, b.client as who,
       b.language || ', ' || b.mode || ', ' || b.setting || ', ' || to_char(b.starts_at, 'Dy DD Mon HH24:MI') as detail,
       -b.hours_to_start::int as days
  from v_bookings b
 where b.status = 'open' and b.starts_at > localtimestamp and b.hours_to_start <= setting_num('uncovered_hours', 48)
union all
-- an interpreter booked whose credential does not cover the booking on the day
select 1, 'INTERPRETER NOT CREDENTIALED', b.ref, b.client,
       coalesce(b.interpreter, '') || ' has ' || case when b.credential_rank is null then 'no current ' || b.language || ' interpreting credential'
            else 'only ' || interp_rank_name(b.credential_rank) || ' in ' || b.language || '; ' || b.setting || ' work needs ' || interp_rank_name(setting_num('court_min_rank', 3)) || ' or above' end
         || ' on ' || to_char(b.starts_at, 'DD Mon'),
       null
  from v_bookings b
 where b.status = 'assigned' and b.starts_at >= current_date
   and (b.credential_rank is null or (b.setting in ('court', 'legal') and b.credential_rank < setting_num('court_min_rank', 3)))
union all
-- a certified translation whose translator's NAATI certification will not be current on the due date
select 1, 'CERTIFIED, TRANSLATOR NOT CERTIFIED', p.ref, p.client,
       coalesce(p.translator, 'no translator') || ': no current NAATI Certified Translator credential ' || p.source_lang || ' > ' || p.target_lang || ' on ' || p.due_on,
       null
  from v_projects p
 where p.status = 'open' and p.certified and p.translator is not null
   and exists (select 1 from jobs j where j.project_id = p.id and j.step = 'translation' and j.status <> 'cancelled' and j.linguist_id is not null
                  and not exists (select 1 from credentials c where c.linguist_id = j.linguist_id and c.type = 'CT'
                                     and c.source_lang = p.source_lang and c.target_lang = p.target_lang and c.expires_on >= p.due_on))
union all
select 1, 'PAST DUE', p.ref, p.client, p.title || ', due ' || p.due_on || ', ' || (current_date - p.due_on) || ' days late', current_date - p.due_on
  from v_projects p where p.status = 'open' and p.due_on < current_date
union all
-- due within two days with somebody missing or a step unfinished
select 2, 'DUE SOON, NOT READY', p.ref, p.client,
       p.title || ', due ' || p.due_on || ': ' || p.unassigned || ' job(s) with nobody on them, ' || p.in_progress || ' in progress',
       p.days_to_due
  from v_projects p
 where p.status = 'open' and p.due_on between current_date and current_date + 2 and (p.unassigned > 0 or p.in_progress > 0)
union all
select 2, 'JOB LATE', j.ref, j.client, j.step || ' by ' || coalesce(j.linguist, 'nobody') || ', due ' || j.due_on, j.days_late
  from v_jobs j where j.status = 'assigned' and j.due_on < current_date
union all
-- translated, nobody revising it
select 2, 'NO REVISER', j.ref, j.client, 'translation done ' || j.done_on || ' by ' || j.linguist || ', its revision has nobody on it', current_date - j.done_on
  from v_jobs j
 where j.step = 'translation' and j.status = 'done'
   and exists (select 1 from jobs r where r.revises_id = j.id and r.status = 'unassigned')
union all
-- an interpreting booking that finished with no timesheet
select 3, 'NO TIMESHEET', b.ref, b.client, coalesce(b.interpreter, '') || ', ' || to_char(b.starts_at, 'Dy DD Mon HH24:MI') || ': finished, no hours recorded',
       (current_date - b.on_date)
  from v_bookings b where b.status = 'assigned' and b.ends_at < localtimestamp
union all
select 3, 'CREDENTIAL EXPIRING', v.linguist_ref, v.linguist,
       v.body || ' ' || v.type || ' ' || v.source_lang || ' > ' || v.target_lang || ' ends ' || v.expires_on || ' (' || v.days_left || ' days)',
       v.days_left
  from v_credentials v join linguists l on l.id = v.linguist_id
 where l.status = 'active' and v.state = 'renew soon'
   and not exists (select 1 from credentials n where n.linguist_id = v.linguist_id and n.type = v.type
                      and n.source_lang = v.source_lang and n.target_lang = v.target_lang and n.expires_on > v.expires_on)
union all
select 3, 'NO CONFIDENTIALITY AGREEMENT', l.ref, l.name, 'has live work and no signed confidentiality agreement on file', null
  from linguists l
 where l.nda_signed_on is null
   and (exists (select 1 from jobs j where j.linguist_id = l.id and j.status = 'assigned')
        or exists (select 1 from bookings b where b.linguist_id = l.id and b.status = 'assigned'))
union all
select 4, 'QUOTE NO REPLY', q.ref, q.client, q.title || ', ' || to_char(q.amount_cents / 100.0, 'FM$999,990') || ', sent ' || q.days_since_sent || ' days ago, valid to ' || q.valid_until,
       q.days_since_sent
  from v_quotes q
 where q.status = 'sent' and q.days_since_sent >= setting_num('quote_chase_days', 3) and q.valid_until >= current_date
union all
select 4, 'QUOTE LAPSED', q.ref, q.client, q.title || ', lapsed ' || q.valid_until || ' with no answer', -q.days_left
  from v_quotes q where q.status = 'sent' and q.valid_until < current_date
union all
select 4, 'UNBILLED', u.ref, u.client, u.description || ', finished ' || u.done_on || ', ' || to_char(u.amount_cents / 100.0, 'FM$999,990.00'),
       current_date - u.done_on
  from v_unbilled u where u.done_on <= current_date - setting_num('unbilled_days', 7)::int
union all
select 4, 'INVOICE OVERDUE', i.ref, i.client, to_char(i.total_cents / 100.0, 'FM$999,990.00') || ' ex GST, due ' || i.due_on, i.days_overdue
  from v_invoices i where i.days_overdue > 0
union all
select 4, 'THIN MARGIN', p.ref, p.client,
       p.title || ': ' || round(p.margin_cents * 100.0 / nullif(p.price_cents, 0), 1) || '% after linguist costs, target ' || setting_num('target_margin_pct', 40) || '%',
       null
  from v_projects p
 where p.status in ('open', 'delivered') and p.unassigned = 0 and p.price_cents > 0
   and p.margin_cents * 100.0 / p.price_cents < setting_num('target_margin_pct', 40)
   and coalesce(p.delivered_on, current_date) >= current_date - 30
union all
select 4, 'ON HOLD WITH WORK', c.ref, c.name, coalesce(c.hold_reason, 'credit hold') || '; has open projects or bookings', null
  from clients c
 where c.credit_hold
   and (exists (select 1 from projects p where p.client_id = c.id and p.status = 'open')
        or exists (select 1 from bookings b where b.client_id = c.id and b.status in ('open', 'assigned')));

-- Row level security on, no policies: on Supabase nothing is readable through
-- the public API until you write a policy. The CLI connects as the owner.
alter table settings enable row level security;
alter table languages enable row level security;
alter table clients enable row level security;
alter table linguists enable row level security;
alter table linguist_pairs enable row level security;
alter table credentials enable row level security;
alter table linguist_rates enable row level security;
alter table price_list enable row level security;
alter table quotes enable row level security;
alter table projects enable row level security;
alter table jobs enable row level security;
alter table bookings enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table pay_runs enable row level security;
alter table pay_lines enable row level security;
alter table activity enable row level security;
