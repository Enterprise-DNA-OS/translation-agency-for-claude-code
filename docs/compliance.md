# The rule book /compliance checks

Six rules, each with its source, what a breach looks like in the data, and where the CLI already refuses at the gate. `node scripts/agency.mjs compliance` runs them all; add a rule key to run one.

Nothing here is legal advice. It is the rule book the operator has pointed the system at, with sources, and the operator changes it to match their contracts, their clients and their country. When a rule moves, update the rule here and the check in `scripts/agency.mjs` together. The defaults are written for an Australian agency; the New Zealand equivalents are noted where they differ.

Margins, quote follow-ups and the late cancellation window are house rules, not law. They live in `settings` and on the attention list, not here.

## 1. `revision`: every translation is revised by a second linguist before delivery

ISO 17100 requires that every translation is revised by a person other than the translator, comparing source and target, before it goes back to the client. The reviser needs the same competences as a translator. **Source: ISO 17100:2015 Translation services, Requirements for translation services, clause 5.3.3 (revision).** Agencies certified to ISO 17100 are audited on it; many government and legal clients ask for it in their panel contracts.

Breach in the data: a project delivered in the last year with a translation job that has no finished revision job by a different linguist. History brought across from XTRF is marked as imported and not counted, because its revision record lives in the old system. **Gate: `assign` refuses a revision to the person who translated it (and a translation to the person revising it), `done` refuses a revision before its translation is finished, and `deliver` refuses a project until every translation is revised. No force flag.** The setting `revision_required` turns this off for an agency that does not offer revision; the rule then has nothing to check.

## 2. `translator-competence`: every translator and reviser has their competence on record

ISO 17100 accepts three routes to translator competence: a recognised graduate qualification in translation, a graduate qualification in another field plus two years of full-time professional translation, or five years of full-time professional translation. The agency keeps the evidence. **Source: ISO 17100:2015, clause 3.1.4 (professional competences of translators), as amended in 2017.**

Breach in the data: a linguist with translation or revision work in the last year and no `competence` recorded. **Gate: `assign` refuses anyone without it.** Record it with `linguist set NAME --competence="translation degree" --note="Master of Translating and Interpreting, Monash"`.

## 3. `certified-translator`: certified translations only by a NAATI Certified Translator in that direction

Documents translated in Australia for a visa application are translated by a translator accredited by NAATI, with their accreditation details on the translation; Home Affairs asks for the translator's name, contact details and qualifications in the language pair. NAATI credentials are directional: a Certified Translator from Persian into English is not certified from English into Persian. **Source: Department of Home Affairs, documents in languages other than English, as published by the Australian High Commission (newzealand.embassy.gov.au, attaching documents and translations to your application); NAATI certification system (naati.com.au).**

Breach in the data: an open or delivered certified project whose translator holds no Certified Translator credential in that direction current on the due or delivery date. **Gate: `assign` refuses a certified translation to anyone without one current on the due date, and `deliver` refuses it if the credential has lapsed by the day of delivery, because the certification statement cannot be signed.** The attention list puts it at rank 1. `npm run docs -- certification` renders the statement with the NAATI number for the translator to sign and stamp.

New Zealand: Immigration New Zealand needs a certified translation of every document not in English for a residence application, and of police and medical certificates for temporary visas. The translation must not be done by the applicant, their family or their immigration adviser, and it carries the translator's or translation business's stamp or signature. **Source: INZ Operational Manual, A13.5 Translations (immigration.govt.nz); Amendment Circular 2025-17 for visitor visas.** An NZ agency adds an `inz-translator-independence` rule with `/customise`: a field on the project for the applicant's name, checked against the translator.

## 4. `interpreter-credential`: interpreters hold a current NAATI credential for the language; court and legal work a Certified Interpreter or above

An interpreter is booked only with a NAATI interpreting credential in that language. For courts and tribunals, the most highly certified interpreter available is always first preference: the Federal Circuit and Family Court lists Certified Specialist Legal Interpreter, then Certified Interpreter, then Certified Provisional Interpreter, then Recognised Practising Interpreter. **Source: Judicial Council on Cultural Diversity, Recommended National Standards for Working with Interpreters in Courts and Tribunals, second edition (2022); Federal Circuit and Family Court of Australia, Practice Direction: Working with interpreters; NAATI certification system.**

Breach in the data: a booking in the last 90 days or ahead whose interpreter has no current credential for the language on the day, or a court or legal booking whose interpreter ranks below `court_min_rank` (default 3, Certified Interpreter). **Gate: `interpreter` refuses both.** The standards allow a lower credential in a language with few or no certified interpreters; an agency that works in those languages lowers the setting for them with `/customise`, and records the court's agreement on the booking.

## 5. `credential-currency`: no active linguist works on a lapsed NAATI credential

Every NAATI credential runs three years. The practitioner recertifies through myNAATI by showing professional development; from 2 June 2026 work practice is no longer a separate requirement. A credential not renewed lapses. **Source: NAATI, recertification (naati.com.au/certification/recertification).**

Breach in the data: an active linguist with an expired credential and no renewed one on file. The attention list warns `credential_warn_days` (default 90) ahead. `draft recert NAME` writes the reminder; `credential add NAME --type= ... --expires=` records the renewal.

## 6. `confidentiality`: nobody handles client documents or sessions without a signed agreement

Translators and interpreters see medical records, police checks, court evidence and immigration files. An agency holding personal information takes reasonable steps to protect it from misuse and unauthorised disclosure, and that includes the freelancers it hands it to. Confidentiality is also a core principle of the professional code. **Source: Privacy Act 1988 (Cth), Australian Privacy Principle 11 (security of personal information); Privacy Act 2020 (NZ), Information Privacy Principle 5 (storage and security); AUSIT Code of Ethics and Code of Conduct, confidentiality.**

Breach in the data: a linguist with live work and no `nda_signed_on`. **Gate: `assign` and `interpreter` refuse anyone without a signed agreement on file.** Record it with `linguist set NAME --nda=DATE`.

## Paying linguists

A pay run produces remittance advice, not a tax invoice. A GST-registered linguist sends their own tax invoice unless the agency and the linguist have a written recipient-created tax invoice agreement. **Source: A New Tax System (Goods and Services Tax) Act 1999, s 29-70, and the Goods and Services Tax: Recipient Created Tax Invoice Determination 2015.** An agency that issues recipient-created tax invoices adds the agreement date to the linguist with `/customise`, and the remittance template becomes the tax invoice.
