-- Demo data: Yarra Language Services, a fictional translation and interpreting
-- agency in Melbourne with twelve linguists on its panel, eight clients, two
-- months of projects and bookings behind and two weeks ahead.
--
-- Every date is relative to current_date, so the demo tells the same story
-- whatever day it runs. Ids derive from md5 of a natural key and every insert
-- is ON CONFLICT DO NOTHING, so loading it twice is harmless.
--
-- Deliberately wrong, so /attention has something to say: a Somali medical
-- booking tomorrow with no interpreter, a court booking given to a provisional
-- interpreter, a certified translation for a visa given to a translator whose
-- NAATI certification lapsed ten days ago, a Japanese price list two days late,
-- a Korean contract translated with nobody revising it, a phone job finished
-- with no timesheet, a Korean credential ending in 25 days, a Spanish
-- translator working with no confidentiality agreement, a quote nobody has
-- chased, a wine client's rate that leaves 20%, unbilled work, two overdue
-- invoices, and an old project delivered with no second-linguist revision.

insert into settings (key, value, note) values
  ('business_name', 'Yarra Language Services', 'On every document and view'),
  ('currency', 'AUD', 'All money is ex GST'),
  ('gst_pct', '10', 'Added on tax invoices'),
  ('revision_required', 'true', 'ISO 17100: every translation is revised by a second linguist before delivery'),
  ('court_min_rank', '3', 'Court and legal bookings need a Certified Interpreter (rank 3) or a specialist (rank 4)'),
  ('credential_warn_days', '90', 'Warn this many days before a NAATI credential ends'),
  ('uncovered_hours', '48', 'An interpreting booking this close with nobody on it goes to the top'),
  ('late_cancel_hours', '24', 'Cancelled closer than this to the start is charged at the minimum and the interpreter is paid'),
  ('quote_valid_days', '30', 'How long a quote holds'),
  ('quote_chase_days', '3', 'A sent quote with no answer after this many days gets chased'),
  ('unbilled_days', '7', 'Finished work older than this and not invoiced is flagged'),
  ('target_margin_pct', '40', 'What a project should leave after linguist costs'),
  ('default_due_days', '5', 'Working days a translation gets when nobody says otherwise')
on conflict (key) do nothing;

insert into languages (code, name, tier) values
  ('en', 'English', 'A'), ('zh', 'Chinese (Mandarin, Simplified)', 'A'), ('ar', 'Arabic', 'A'),
  ('vi', 'Vietnamese', 'A'), ('es', 'Spanish', 'A'), ('ja', 'Japanese', 'A'),
  ('ko', 'Korean', 'B'), ('fa', 'Persian (Farsi)', 'B'), ('pa', 'Punjabi', 'B'),
  ('so', 'Somali', 'C'), ('ti', 'Tigrinya', 'C')
on conflict do nothing;

-- Clients
insert into clients (id, ref, name, kind, abn, contact_name, email, phone, terms_days, credit_hold, hold_reason, notes) values
  (md5('c:C-0001')::uuid, 'C-0001', 'Eastern Health Network', 'account', '41 223 908 114', 'Priya Natarajan', 'interpreters@easternhealth.example', '03 9000 1101', 30, false, null, 'Language services desk books by email. Onsite rate negotiated to $105 an hour.'),
  (md5('c:C-0002')::uuid, 'C-0002', 'Collins Street Legal', 'account', '67 401 338 902', 'James Whitford', 'jwhitford@collinslegal.example', '03 9000 2202', 14, false, null, 'Litigation team. Court work needs certified interpreters.'),
  (md5('c:C-0003')::uuid, 'C-0003', 'Kestrel Migration', 'account', '19 884 120 557', 'Anh Tran', 'anh@kestrelmigration.example', '03 9000 3303', 14, false, null, 'Registered migration agent. Certified translations for visa applications.'),
  (md5('c:C-0004')::uuid, 'C-0004', 'Fernhill Wines', 'account', '52 330 774 016', 'Sophie Laurent', 'sophie@fernhillwines.example', '03 9000 4404', 14, false, null, 'Export marketing for China and Japan. Translation rate agreed at 20c a word in 2024.'),
  (md5('c:C-0005')::uuid, 'C-0005', 'Westgate Community Legal Centre', 'account', '88 102 664 390', 'Fatima Osman', 'intake@westgateclc.example', '03 9000 5505', 30, false, null, null),
  (md5('c:C-0006')::uuid, 'C-0006', 'Riverbend City Council', 'account', '30 551 889 201', 'Mark Delaney', 'communications@riverbend.example', '03 9000 6606', 30, false, null, 'Purchase order on every job.'),
  (md5('c:C-0007')::uuid, 'C-0007', 'Mei Lin Chen', 'private', null, 'Mei Lin Chen', 'meilin.chen@example.com', '0400 000 707', 0, false, null, 'Private client, pays on collection.'),
  (md5('c:C-0008')::uuid, 'C-0008', 'Northline Logistics', 'account', '74 663 019 845', 'Gary Pike', 'accounts@northline.example', '03 9000 8808', 14, true, 'INV-2990 five weeks overdue', null)
on conflict do nothing;

-- The panel
insert into linguists (id, ref, name, kind, email, phone, abn, gst_registered, competence, competence_note, nda_signed_on, suburb) values
  (md5('l:L-001')::uuid, 'L-001', 'Wei Zhang', 'staff', 'wei@yarralanguage.example', '0400 100 001', null, false, 'translation degree', 'Master of Translating and Interpreting, Monash', current_date - 900, 'Box Hill'),
  (md5('l:L-002')::uuid, 'L-002', 'Hana Kim', 'freelance', 'hana.kim@example.com', '0400 100 002', '11 000 000 002', true, 'translation degree', 'BA Translation, Hankuk University', current_date - 700, 'Carlton'),
  (md5('l:L-003')::uuid, 'L-003', 'Omar Haddad', 'freelance', 'omar.haddad@example.com', '0400 100 003', '11 000 000 003', true, 'other degree plus 2 years', 'BEng, nine years translating', current_date - 800, 'Coburg'),
  (md5('l:L-004')::uuid, 'L-004', 'Lina Nguyen', 'freelance', 'lina.nguyen@example.com', '0400 100 004', '11 000 000 004', false, 'translation degree', 'Diploma of Interpreting plus BA Translation, RMIT', current_date - 600, 'Footscray'),
  (md5('l:L-005')::uuid, 'L-005', 'Daniel Ruiz', 'freelance', 'daniel.ruiz@example.com', '0400 100 005', '11 000 000 005', true, '5 years experience', 'Twelve years freelance, legal and financial', null, 'St Kilda'),
  (md5('l:L-006')::uuid, 'L-006', 'Reza Karimi', 'freelance', 'reza.karimi@example.com', '0400 100 006', '11 000 000 006', false, 'other degree plus 2 years', 'LLB Tehran, six years translating', current_date - 500, 'Dandenong'),
  (md5('l:L-007')::uuid, 'L-007', 'Amina Warsame', 'freelance', 'amina.warsame@example.com', '0400 100 007', '11 000 000 007', false, null, null, current_date - 400, 'Flemington'),
  (md5('l:L-008')::uuid, 'L-008', 'Yuki Tanaka', 'freelance', 'yuki.tanaka@example.com', '0400 100 008', '11 000 000 008', true, '5 years experience', 'Former in-house at a Tokyo agency', current_date - 650, 'Richmond'),
  (md5('l:L-009')::uuid, 'L-009', 'Grace Liu', 'staff', 'grace@yarralanguage.example', '0400 100 009', null, false, 'other degree plus 2 years', 'BCom, five years in-house reviser', current_date - 950, 'Glen Waverley'),
  (md5('l:L-010')::uuid, 'L-010', 'Sofia Marino', 'freelance', 'sofia.marino@example.com', '0400 100 010', '11 000 000 010', true, 'translation degree', 'MA Translation, Universidad de Salamanca', current_date - 300, 'Brunswick'),
  (md5('l:L-011')::uuid, 'L-011', 'Samir Aziz', 'freelance', 'samir.aziz@example.com', '0400 100 011', '11 000 000 011', false, 'translation degree', 'BA Translation, University of Jordan', current_date - 350, 'Broadmeadows'),
  (md5('l:L-012')::uuid, 'L-012', 'Harpreet Singh', 'freelance', 'harpreet.singh@example.com', '0400 100 012', '11 000 000 012', false, '5 years experience', 'Seven years freelance', current_date - 420, 'Tarneit')
on conflict do nothing;

insert into linguist_pairs (linguist_id, source_lang, target_lang, specialism) values
  (md5('l:L-001')::uuid, 'zh', 'en', 'legal, civil documents'), (md5('l:L-001')::uuid, 'en', 'zh', 'marketing'),
  (md5('l:L-002')::uuid, 'ko', 'en', 'legal'), (md5('l:L-002')::uuid, 'en', 'ko', null),
  (md5('l:L-003')::uuid, 'ar', 'en', 'legal'), (md5('l:L-003')::uuid, 'en', 'ar', 'community'),
  (md5('l:L-004')::uuid, 'vi', 'en', null), (md5('l:L-004')::uuid, 'en', 'vi', 'community'),
  (md5('l:L-005')::uuid, 'es', 'en', 'financial'), (md5('l:L-005')::uuid, 'en', 'es', null),
  (md5('l:L-006')::uuid, 'fa', 'en', 'legal, civil documents'),
  (md5('l:L-008')::uuid, 'en', 'ja', 'marketing'), (md5('l:L-008')::uuid, 'ja', 'en', null),
  (md5('l:L-009')::uuid, 'zh', 'en', null), (md5('l:L-009')::uuid, 'en', 'zh', 'marketing'),
  (md5('l:L-010')::uuid, 'es', 'en', null), (md5('l:L-010')::uuid, 'en', 'es', null),
  (md5('l:L-011')::uuid, 'ar', 'en', null), (md5('l:L-011')::uuid, 'en', 'ar', null),
  (md5('l:L-012')::uuid, 'en', 'pa', null), (md5('l:L-012')::uuid, 'pa', 'en', null)
on conflict do nothing;

insert into credentials (id, linguist_id, type, source_lang, target_lang, number, issued_on, expires_on) values
  (md5('cr:L-001:CT:zh-en')::uuid, md5('l:L-001')::uuid, 'CT',  'zh', 'en', 'CPN0A1B2C', current_date - 495, current_date + 600),
  (md5('cr:L-001:CT:en-zh')::uuid, md5('l:L-001')::uuid, 'CT',  'en', 'zh', 'CPN0A1B2C', current_date - 495, current_date + 600),
  (md5('cr:L-001:CI:zh')::uuid,    md5('l:L-001')::uuid, 'CI',  'zh', 'en', 'CPN0A1B2C', current_date - 695, current_date + 400),
  (md5('cr:L-002:CT:ko-en')::uuid, md5('l:L-002')::uuid, 'CT',  'ko', 'en', 'CPN3D4E5F', current_date - 1070, current_date + 25),
  (md5('cr:L-003:CT:ar-en')::uuid, md5('l:L-003')::uuid, 'CT',  'ar', 'en', 'CPN6G7H8J', current_date - 595, current_date + 500),
  (md5('cr:L-003:CI:ar')::uuid,    md5('l:L-003')::uuid, 'CI',  'ar', 'en', 'CPN6G7H8J', current_date - 795, current_date + 300),
  (md5('cr:L-004:CT:vi-en')::uuid, md5('l:L-004')::uuid, 'CT',  'vi', 'en', 'CPN9K0L1M', current_date - 395, current_date + 700),
  (md5('cr:L-004:CPI:vi')::uuid,   md5('l:L-004')::uuid, 'CPI', 'vi', 'en', 'CPN9K0L1M', current_date - 895, current_date + 200),
  (md5('cr:L-005:CT:es-en')::uuid, md5('l:L-005')::uuid, 'CT',  'es', 'en', 'CPN2N3P4Q', current_date - 295, current_date + 800),
  (md5('cr:L-006:CT:fa-en')::uuid, md5('l:L-006')::uuid, 'CT',  'fa', 'en', 'CPN5R6S7T', current_date - 1105, current_date - 10),
  (md5('cr:L-006:CI:fa')::uuid,    md5('l:L-006')::uuid, 'CI',  'fa', 'en', 'CPN5R6S7T', current_date - 695, current_date + 400),
  (md5('cr:L-007:RPI:so')::uuid,   md5('l:L-007')::uuid, 'RPI', 'so', 'en', 'CPN8U9V0W', current_date - 795, current_date + 300),
  (md5('cr:L-008:CT:en-ja')::uuid, md5('l:L-008')::uuid, 'CT',  'en', 'ja', 'CPN1X2Y3Z', current_date - 195, current_date + 900),
  (md5('cr:L-009:CT:zh-en')::uuid, md5('l:L-009')::uuid, 'CT',  'zh', 'en', 'CPN4A5B6C', current_date - 95, current_date + 1000),
  (md5('cr:L-010:CT:es-en')::uuid, md5('l:L-010')::uuid, 'CT',  'es', 'en', 'CPN7D8E9F', current_date - 795, current_date + 300),
  (md5('cr:L-011:CT:ar-en')::uuid, md5('l:L-011')::uuid, 'CT',  'ar', 'en', 'CPN0G1H2J', current_date - 495, current_date + 600)
on conflict do nothing;

-- Pay rates: translation by the word (14c for tier B and C languages), revision
-- 4c a word, certified documents $38 a page, interpreting by the hour.
insert into linguist_rates (linguist_id, service, rate_cents, min_minutes)
select l.id, r.service,
       case when r.service = 'translation' and l.ref in ('L-002', 'L-006', 'L-012') then 14 else r.rate_cents end,
       r.min_minutes
  from linguists l
 cross join (values ('translation', 12, 0), ('revision', 4, 0), ('certified', 3800, 0),
                    ('onsite', 6500, 120), ('video', 5500, 60), ('phone', 4800, 30)) as r(service, rate_cents, min_minutes)
on conflict do nothing;

-- The standard price list, and two client rates.
insert into price_list (client_id, service, tier, rate_cents, min_minutes, min_cents) values
  (null, 'translation', 'A', 28, 0, 9500),  (null, 'translation', 'B', 32, 0, 11000), (null, 'translation', 'C', 38, 0, 13000),
  (null, 'certified', 'A', 9000, 0, 9500),  (null, 'certified', 'B', 10000, 0, 11000), (null, 'certified', 'C', 12000, 0, 13000),
  (null, 'onsite', 'A', 11500, 120, 0),     (null, 'onsite', 'B', 12500, 120, 0),     (null, 'onsite', 'C', 14000, 120, 0),
  (null, 'video', 'A', 10000, 60, 0),       (null, 'video', 'B', 11000, 60, 0),       (null, 'video', 'C', 12500, 60, 0),
  (null, 'phone', 'A', 8500, 30, 0),        (null, 'phone', 'B', 9500, 30, 0),        (null, 'phone', 'C', 11000, 30, 0),
  (md5('c:C-0001')::uuid, 'onsite', 'A', 10500, 120, 0),
  (md5('c:C-0004')::uuid, 'translation', 'A', 20, 0, 9500)
on conflict do nothing;

-- Quotes
insert into quotes (id, ref, client_id, title, source_lang, target_lang, certified, purpose, words, pages, amount_cents, due_days, status, sent_on, valid_until, decided_on, decline_reason, created_on) values
  (md5('q:Q-2001')::uuid, 'Q-2001', md5('c:C-0004')::uuid, 'Website, six pages', 'en', 'zh', false, 'marketing', 5200, 0, 104000, 8, 'sent', current_date - 6, current_date + 24, null, null, current_date - 6),
  (md5('q:Q-2002')::uuid, 'Q-2002', md5('c:C-0006')::uuid, 'Annual report summary', 'en', 'ar', false, 'community', 4000, 0, 112000, 10, 'sent', current_date - 40, current_date - 10, null, null, current_date - 40),
  (md5('q:Q-2003')::uuid, 'Q-2003', md5('c:C-0005')::uuid, 'Client fact sheets', 'en', 'fa', false, 'community', 2600, 0, 83200, 7, 'draft', null, null, null, null, current_date - 1),
  (md5('q:Q-2004')::uuid, 'Q-2004', md5('c:C-0002')::uuid, 'Supply contract', 'ko', 'en', false, 'legal', 2000, 0, 64000, 6, 'accepted', current_date - 7, current_date + 23, current_date - 6, null, current_date - 7),
  (md5('q:Q-2005')::uuid, 'Q-2005', md5('c:C-0003')::uuid, 'Diploma and transcript', 'zh', 'en', true, 'Home Affairs visa', 600, 2, 18000, 3, 'sent', current_date - 1, current_date + 29, null, null, current_date - 1),
  (md5('q:Q-1990')::uuid, 'Q-1990', md5('c:C-0004')::uuid, 'Trade show banners', 'en', 'ja', false, 'marketing', 400, 0, 9500, 3, 'declined', current_date - 30, current_date, current_date - 27, 'Went with the distributor''s translator', current_date - 30)
on conflict do nothing;

-- Projects
insert into projects (id, ref, client_id, quote_id, title, source_lang, target_lang, certified, purpose, words, pages, price_cents, po_number, received_on, due_on, delivered_on, status, notes) values
  (md5('p:P-0990')::uuid, 'P-0990', md5('c:C-0008')::uuid, null, 'Driver handbook', 'en', 'pa', false, 'workplace', 2000, 0, 64000, 'NL-4471', current_date - 60, current_date - 53, current_date - 52, 'delivered', 'Delivered the day after translation, before revision was a step here.'),
  (md5('p:P-1001')::uuid, 'P-1001', md5('c:C-0004')::uuid, null, 'Cellar door brochure', 'en', 'zh', false, 'marketing', 2400, 0, 48000, null, current_date - 30, current_date - 24, current_date - 24, 'delivered', null),
  (md5('p:P-1002')::uuid, 'P-1002', md5('c:C-0002')::uuid, null, 'Witness statement', 'ar', 'en', false, 'legal', 3100, 0, 86800, 'CSL-M2291', current_date - 18, current_date - 12, current_date - 12, 'delivered', null),
  (md5('p:P-1003')::uuid, 'P-1003', md5('c:C-0003')::uuid, null, 'Birth and marriage certificates', 'zh', 'en', true, 'Home Affairs visa', 450, 3, 27000, null, current_date - 12, current_date - 9, current_date - 9, 'delivered', null),
  (md5('p:P-1004')::uuid, 'P-1004', md5('c:C-0003')::uuid, null, 'Police certificate and degree', 'fa', 'en', true, 'Home Affairs visa', 1100, 4, 40000, null, current_date - 3, current_date + 2, null, 'open', null),
  (md5('p:P-1005')::uuid, 'P-1005', md5('c:C-0006')::uuid, null, 'Kerbside collection changes flyer', 'en', 'vi', false, 'community', 900, 0, 25200, 'RCC-30118', current_date - 1, current_date + 6, null, 'open', null),
  (md5('p:P-1006')::uuid, 'P-1006', md5('c:C-0004')::uuid, null, 'Export price list', 'en', 'ja', false, 'marketing', 1200, 0, 33600, null, current_date - 9, current_date - 2, null, 'open', null),
  (md5('p:P-1007')::uuid, 'P-1007', md5('c:C-0002')::uuid, md5('q:Q-2004')::uuid, 'Supply contract', 'ko', 'en', false, 'legal', 2000, 0, 64000, 'CSL-M2304', current_date - 6, current_date + 4, null, 'open', null),
  (md5('p:P-1008')::uuid, 'P-1008', md5('c:C-0003')::uuid, null, 'Bank statements', 'es', 'en', false, 'Home Affairs visa', 1500, 0, 42000, null, current_date - 2, current_date + 5, null, 'open', null),
  (md5('p:P-1009')::uuid, 'P-1009', md5('c:C-0007')::uuid, null, 'Driver licence', 'zh', 'en', true, 'VicRoads licence conversion', 250, 1, 9500, null, current_date - 4, current_date - 2, current_date - 2, 'delivered', null),
  (md5('p:P-1010')::uuid, 'P-1010', md5('c:C-0008')::uuid, null, 'Site safety induction', 'en', 'pa', false, 'workplace', 1800, 0, 57600, 'NL-4502', current_date - 2, current_date + 8, null, 'open', null)
on conflict do nothing;

-- Jobs: a translation and a revision per project. Costs are set on assignment.
insert into jobs (id, ref, project_id, step, revises_id, linguist_id, words, pages, due_on, assigned_on, done_on, cost_cents, status) values
  (md5('j:P-0990-T')::uuid, 'P-0990-T', md5('p:P-0990')::uuid, 'translation', null, md5('l:L-012')::uuid, 2000, 0, current_date - 53, current_date - 59, current_date - 53, 28000, 'done'),
  (md5('j:P-1001-T')::uuid, 'P-1001-T', md5('p:P-1001')::uuid, 'translation', null, md5('l:L-001')::uuid, 2400, 0, current_date - 26, current_date - 29, current_date - 26, 28800, 'done'),
  (md5('j:P-1001-R')::uuid, 'P-1001-R', md5('p:P-1001')::uuid, 'revision', md5('j:P-1001-T')::uuid, md5('l:L-009')::uuid, 2400, 0, current_date - 24, current_date - 29, current_date - 25, 9600, 'done'),
  (md5('j:P-1002-T')::uuid, 'P-1002-T', md5('p:P-1002')::uuid, 'translation', null, md5('l:L-003')::uuid, 3100, 0, current_date - 14, current_date - 18, current_date - 14, 37200, 'done'),
  (md5('j:P-1002-R')::uuid, 'P-1002-R', md5('p:P-1002')::uuid, 'revision', md5('j:P-1002-T')::uuid, md5('l:L-011')::uuid, 3100, 0, current_date - 12, current_date - 18, current_date - 13, 12400, 'done'),
  (md5('j:P-1003-T')::uuid, 'P-1003-T', md5('p:P-1003')::uuid, 'translation', null, md5('l:L-001')::uuid, 450, 3, current_date - 10, current_date - 12, current_date - 10, 11400, 'done'),
  (md5('j:P-1003-R')::uuid, 'P-1003-R', md5('p:P-1003')::uuid, 'revision', md5('j:P-1003-T')::uuid, md5('l:L-009')::uuid, 450, 3, current_date - 9, current_date - 12, current_date - 9, 1800, 'done'),
  (md5('j:P-1004-T')::uuid, 'P-1004-T', md5('p:P-1004')::uuid, 'translation', null, md5('l:L-006')::uuid, 1100, 4, current_date + 1, current_date - 3, null, 15200, 'assigned'),
  (md5('j:P-1004-R')::uuid, 'P-1004-R', md5('p:P-1004')::uuid, 'revision', md5('j:P-1004-T')::uuid, null, 1100, 4, current_date + 2, null, null, null, 'unassigned'),
  (md5('j:P-1005-T')::uuid, 'P-1005-T', md5('p:P-1005')::uuid, 'translation', null, null, 900, 0, current_date + 5, null, null, null, 'unassigned'),
  (md5('j:P-1005-R')::uuid, 'P-1005-R', md5('p:P-1005')::uuid, 'revision', md5('j:P-1005-T')::uuid, null, 900, 0, current_date + 6, null, null, null, 'unassigned'),
  (md5('j:P-1006-T')::uuid, 'P-1006-T', md5('p:P-1006')::uuid, 'translation', null, md5('l:L-008')::uuid, 1200, 0, current_date - 3, current_date - 8, null, 14400, 'assigned'),
  (md5('j:P-1006-R')::uuid, 'P-1006-R', md5('p:P-1006')::uuid, 'revision', md5('j:P-1006-T')::uuid, null, 1200, 0, current_date - 2, null, null, null, 'unassigned'),
  (md5('j:P-1007-T')::uuid, 'P-1007-T', md5('p:P-1007')::uuid, 'translation', null, md5('l:L-002')::uuid, 2000, 0, current_date + 3, current_date - 6, current_date - 1, 28000, 'done'),
  (md5('j:P-1007-R')::uuid, 'P-1007-R', md5('p:P-1007')::uuid, 'revision', md5('j:P-1007-T')::uuid, null, 2000, 0, current_date + 4, null, null, null, 'unassigned'),
  (md5('j:P-1008-T')::uuid, 'P-1008-T', md5('p:P-1008')::uuid, 'translation', null, md5('l:L-005')::uuid, 1500, 0, current_date + 4, current_date - 2, null, 18000, 'assigned'),
  (md5('j:P-1008-R')::uuid, 'P-1008-R', md5('p:P-1008')::uuid, 'revision', md5('j:P-1008-T')::uuid, md5('l:L-010')::uuid, 1500, 0, current_date + 5, current_date - 2, null, 6000, 'assigned'),
  (md5('j:P-1009-T')::uuid, 'P-1009-T', md5('p:P-1009')::uuid, 'translation', null, md5('l:L-001')::uuid, 250, 1, current_date - 3, current_date - 4, current_date - 3, 3800, 'done'),
  (md5('j:P-1009-R')::uuid, 'P-1009-R', md5('p:P-1009')::uuid, 'revision', md5('j:P-1009-T')::uuid, md5('l:L-009')::uuid, 250, 1, current_date - 2, current_date - 4, current_date - 2, 1000, 'done'),
  (md5('j:P-1010-T')::uuid, 'P-1010-T', md5('p:P-1010')::uuid, 'translation', null, null, 1800, 0, current_date + 7, null, null, null, 'unassigned'),
  (md5('j:P-1010-R')::uuid, 'P-1010-R', md5('p:P-1010')::uuid, 'revision', md5('j:P-1010-T')::uuid, null, 1800, 0, current_date + 8, null, null, null, 'unassigned')
on conflict do nothing;

-- Interpreting bookings
insert into bookings (id, ref, client_id, lang, mode, setting, starts_at, minutes_booked, address, onsite_contact, client_name, po_number, linguist_id, status, minutes_actual, cancelled_at, cancel_reason, late_cancel, price_cents, cost_cents) values
  (md5('b:B-5010')::uuid, 'B-5010', md5('c:C-0006')::uuid, 'vi', 'onsite', 'community', (current_date - 46) + time '18:00', 120, 'Riverbend Civic Centre, 1 Market St, Riverbend', 'Mark Delaney', 'Community forum', 'RCC-29870', md5('l:L-004')::uuid, 'done', 150, null, null, false, 28750, 16250),
  (md5('b:B-5007')::uuid, 'B-5007', md5('c:C-0001')::uuid, 'ar', 'onsite', 'medical', (current_date - 10) + time '13:30', 60, 'Eastern Health, Ward 4B, 12 Arnold St, Box Hill', 'Nurse unit manager', 'Mr H.', null, md5('l:L-003')::uuid, 'cancelled', null, (current_date - 10) + time '07:30', 'Patient discharged early', true, 21000, 13000),
  (md5('b:B-5001')::uuid, 'B-5001', md5('c:C-0001')::uuid, 'vi', 'onsite', 'medical', (current_date - 7) + time '09:00', 90, 'Eastern Health Outpatients, 8 Arnold St, Box Hill', 'Outpatients desk', 'Mrs T.', null, md5('l:L-004')::uuid, 'done', 95, null, null, false, 21000, 13000),
  (md5('b:B-5002')::uuid, 'B-5002', md5('c:C-0001')::uuid, 'ar', 'onsite', 'medical', (current_date - 3) + time '10:30', 60, 'Eastern Health Outpatients, 8 Arnold St, Box Hill', 'Outpatients desk', 'Mr A.', null, md5('l:L-003')::uuid, 'done', 70, null, null, false, 21000, 13000),
  (md5('b:B-5005')::uuid, 'B-5005', md5('c:C-0006')::uuid, 'zh', 'phone', 'community', (current_date - 1) + time '15:00', 30, null, 'Rates team', 'Ratepayer enquiry', 'RCC-30102', md5('l:L-001')::uuid, 'assigned', null, null, null, false, null, null),
  (md5('b:B-5004')::uuid, 'B-5004', md5('c:C-0001')::uuid, 'so', 'onsite', 'medical', (current_date + 1) + time '14:00', 60, 'Eastern Health Maternity, 5 Arnold St, Box Hill', 'Midwife on duty', 'Ms W.', null, null, 'open', null, null, null, false, null, null),
  (md5('b:B-5003')::uuid, 'B-5003', md5('c:C-0002')::uuid, 'vi', 'onsite', 'court', (current_date + 2) + time '10:00', 180, 'County Court, 250 William St, Melbourne, Court 4.3', 'James Whitford', 'Witness, Nguyen v Pacific Freight', 'CSL-M2291', md5('l:L-004')::uuid, 'assigned', null, null, null, false, null, null),
  (md5('b:B-5009')::uuid, 'B-5009', md5('c:C-0001')::uuid, 'zh', 'video', 'medical', (current_date + 3) + time '09:00', 60, 'Video link from the clinic', 'Dr Okafor', 'Mr L.', null, md5('l:L-001')::uuid, 'assigned', null, null, null, false, null, null),
  (md5('b:B-5006')::uuid, 'B-5006', md5('c:C-0005')::uuid, 'fa', 'video', 'legal', (current_date + 5) + time '11:00', 60, 'Video link', 'Fatima Osman', 'Tenancy client', null, md5('l:L-006')::uuid, 'assigned', null, null, null, false, null, null),
  (md5('b:B-5008')::uuid, 'B-5008', md5('c:C-0005')::uuid, 'ti', 'onsite', 'community', (current_date + 9) + time '10:00', 90, 'Westgate CLC, 40 Paisley St, Footscray', 'Fatima Osman', 'Tenancy client', null, null, 'open', null, null, null, false, null, null)
on conflict do nothing;

-- Invoices
insert into invoices (id, ref, client_id, status, issued_on, due_on, paid_on) values
  (md5('i:INV-2990')::uuid, 'INV-2990', md5('c:C-0008')::uuid, 'issued', current_date - 50, current_date - 36, null),
  (md5('i:INV-3000')::uuid, 'INV-3000', md5('c:C-0006')::uuid, 'issued', current_date - 45, current_date - 15, null),
  (md5('i:INV-3001')::uuid, 'INV-3001', md5('c:C-0004')::uuid, 'paid',   current_date - 23, current_date - 9, current_date - 5),
  (md5('i:INV-3002')::uuid, 'INV-3002', md5('c:C-0002')::uuid, 'issued', current_date - 11, current_date + 3, null),
  (md5('i:INV-3003')::uuid, 'INV-3003', md5('c:C-0001')::uuid, 'issued', current_date - 6, current_date + 24, null)
on conflict do nothing;

insert into invoice_lines (id, invoice_id, project_id, booking_id, description, amount_cents) values
  (md5('il:INV-2990:P-0990')::uuid, md5('i:INV-2990')::uuid, md5('p:P-0990')::uuid, null, 'P-0990 Driver handbook (en > pa), 2,000 words, PO NL-4471', 64000),
  (md5('il:INV-3000:B-5010')::uuid, md5('i:INV-3000')::uuid, null, md5('b:B-5010')::uuid, 'B-5010 Interpreting, Vietnamese, onsite, 150 minutes, PO RCC-29870', 28750),
  (md5('il:INV-3001:P-1001')::uuid, md5('i:INV-3001')::uuid, md5('p:P-1001')::uuid, null, 'P-1001 Cellar door brochure (en > zh), 2,400 words', 48000),
  (md5('il:INV-3002:P-1002')::uuid, md5('i:INV-3002')::uuid, md5('p:P-1002')::uuid, null, 'P-1002 Witness statement (ar > en), 3,100 words, PO CSL-M2291', 86800),
  (md5('il:INV-3003:B-5001')::uuid, md5('i:INV-3003')::uuid, null, md5('b:B-5001')::uuid, 'B-5001 Interpreting, Vietnamese, onsite, 95 minutes (2 hour minimum)', 21000)
on conflict do nothing;

-- One linguist pay run already paid
insert into pay_runs (id, ref, linguist_id, period_to, status, paid_on) values
  (md5('pr:PR-0001')::uuid, 'PR-0001', md5('l:L-001')::uuid, current_date - 20, 'paid', current_date - 15),
  (md5('pr:PR-0002')::uuid, 'PR-0002', md5('l:L-012')::uuid, current_date - 45, 'paid', current_date - 40),
  (md5('pr:PR-0003')::uuid, 'PR-0003', md5('l:L-004')::uuid, current_date - 40, 'paid', current_date - 35)
on conflict do nothing;

insert into pay_lines (id, pay_run_id, job_id, booking_id, description, amount_cents) values
  (md5('pl:PR-0001:P-1001-T')::uuid, md5('pr:PR-0001')::uuid, md5('j:P-1001-T')::uuid, null, 'translation, P-1001 Cellar door brochure', 28800),
  (md5('pl:PR-0002:P-0990-T')::uuid, md5('pr:PR-0002')::uuid, md5('j:P-0990-T')::uuid, null, 'translation, P-0990 Driver handbook', 28000),
  (md5('pl:PR-0003:B-5010')::uuid, md5('pr:PR-0003')::uuid, null, md5('b:B-5010')::uuid, 'Interpreting B-5010, Riverbend City Council', 16250)
on conflict do nothing;

insert into activity (id, at, subject, text) values
  (md5('a:1')::uuid, now() - interval '36 days', 'client:C-0008', 'Gary says INV-2990 is with their accounts payable, paying end of month.'),
  (md5('a:2')::uuid, now() - interval '20 days', 'client:C-0008', 'No payment. Put on credit hold until INV-2990 is paid.'),
  (md5('a:3')::uuid, now() - interval '5 days', 'linguist:L-005', 'Sent Daniel the confidentiality agreement again. Not back yet.'),
  (md5('a:4')::uuid, now() - interval '2 days', 'project:P-1006', 'Yuki says the price list has 40 product names that need the client''s approved Japanese names.')
on conflict do nothing;
