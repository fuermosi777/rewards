# rewards

An open-ended, git-versioned database of US credit card issuers, cards, ongoing (recurring) benefits, and sign-up bonuses — meant to be pulled as static JSON by a personal-finance app, and kept up to date by a periodic agent + human-reviewed PRs.

If you're an agent picking up an update task in this repo (crawling issuer sites, filling in benefits), read **[AGENTS.md](AGENTS.md)** — it has the exact workflow, output format, and guardrails for making changes here.

If you're building the app that *consumes* this data, read **[CONSUMING.md](CONSUMING.md)** — it covers how to fetch, cache, and interpret the JSON without a server in front of it.

## Why this exists

Card benefit tracking apps need a source of truth for "what does this card actually offer." Issuer marketing pages are inconsistent, benefit terms hide in PDFs, and sign-up bonuses change far more often than benefit terms do. This repo keeps those two concerns in separate files with separate update cadences, so a daily bonus-refresh never creates noise in the much more stable benefits data — and every change is a reviewable git diff.

## Layout

```
schema/
  issuer.schema.json       # bank/issuer metadata
  card.schema.json         # card identity + ongoing benefits (low churn)
  bonus.schema.json        # sign-up offers (high churn), keyed by cardId
  shared/period.schema.json  # generic recurrence descriptor, reused everywhere

data/
  issuers.json             # flat list of issuers
  index.json                # {id, name, issuerId, status} for every card — the cheap manifest an app fetches first
  cards/<card-id>.json      # one file per card, benefits[] lives here
  bonuses/<card-id>.json    # one file per card, sign-up offers live here

scripts/validate.js         # schema + cross-reference validation (npm run validate)
.github/workflows/validate.yml   # runs validate.js on every push/PR
```

`data/cards/<id>.json` and `data/bonuses/<id>.json` share the same `<id>` (matches the filename and the `id`/`cardId` field inside). An app fetches `index.json` to know what card ids exist, then fetches individual card/bonus files as needed.

## Current state

Bootstrapped from [andenacitelli/credit-card-bonuses-api](https://github.com/andenacitelli/credit-card-bonuses-api) to get real issuer and card identity data (168 cards, 16 issuers) without hand-typing every name. Card cover images (`imageUrl`) and card catalog cross-references are integrated directly from [MaxRewards](https://maxrewards.com/credit-cards) (`https://d1f8ie53h08h9n.cloudfront.net/<slug>/lg.webp`) as an authoritative reference source for clean 3D flat transparent card cover PNG assets across 183 cards and 24 issuers.

Four cards were added by hand outside the bootstrap import, since they're newer/fintech-issued cards the bootstrap source didn't have: `coastal-community-bank-robinhood-gold-card`, `coastal-community-bank-robinhood-platinum-card`, `synchrony-venmo-credit-card`, `goldman-sachs-apple-card`. Apple Card's `issuerId` is `goldman-sachs` because Goldman is still the operating issuer during its announced (Jan 2026) ~24-month transition to Chase — see the `_note` on that issuer in `issuers.json`, and update it once the transition completes. The **X1 Card was deliberately not added** — third-party sources conflict on whether it's still open to new applicants, and that should be confirmed against an official source before it's added rather than guessed.

Some cards from the bootstrap source had no resolvable real issuer (source labeled them only as `"FIRST"` with no bank name — e.g. LATAM Airlines, Cardless Qatar, Avianca LifeMiles, ANA Card USA) and were **skipped entirely** rather than guessed. If you can identify their actual issuing bank from an authoritative source, add them properly instead of reviving the placeholder.

Cards with a `_scaffoldHints` key still carry unverified, unstructured leads from the bootstrap source (e.g. `{"description": "Hotel Credit", "value": 50, "weight": 0.9}`) in the card's own file. Treat that key as "not yet reviewed" — never treat its contents as ground truth, and delete the key once the card's real `benefits[]` has been filled in and verified. Not every lead pans out: e.g. Amex Platinum's bootstrap hints included a "Saks Credit," which turned out to be discontinued as of July 2026 and was correctly left out — verify each lead against a current source rather than assuming the hint is still accurate.

## Schema design, in brief

- **Cards vs. bonuses are separate files.** Benefit terms rarely change; sign-up offers change constantly. Splitting them means `git log data/cards/` stays a meaningful history of actual policy changes, not noise.
- **One `RenewalPeriod` shape covers every reset cadence** — monthly, quarterly, rotating-category (with explicit `fixedDates`, since issuers often announce these late/irregularly), and multi-year perks like a Global Entry credit every 4 years or a free-night award every membership year. See `schema/shared/period.schema.json`.
- **One `benefit` shape covers every benefit type.** `benefitType` (statement_credit / bonus_category / lounge_access / free_night_award / trusted_traveler_credit / insurance / ...) selects which `*Detail` sub-object is required, via JSON Schema `if/then`. This means one array and one data shape in the consuming app, instead of parallel arrays per benefit kind.
- **`benefits[]` and `earningRates[]` are deliberately separate arrays**, even though both can be expressed as a category + multiplier/credit. `benefits[]` is for things a user enrolls in, redeems, or should be reminded to use (a $100 credit, a rotating 5% category, lounge access). `earningRates[]` is the card's permanent, no-touch base earning structure (e.g. "3x on dining, forever") — nothing to track usage of, but exactly the data an app needs to recommend "use this card for this purchase."
- **`issuers.json` is flat and separate** from cards, so bank-level metadata (support phone, Guide to Benefits PDF link) isn't duplicated per card and can be corrected in one place.
- **Every record carries `sourceMeta`** (`lastReviewedDate`, `sourceUrls`, `updatedBy: agent|human`) so data provenance and staleness are always inspectable, not just assumed.
- **User benefit-usage tracking (what the user has actually redeemed) intentionally lives nowhere in this repo.** This is a read-only reference database; the app owns that state.

Full field-level details are in the schema files themselves — they're written to be read directly (descriptions on every field), not just validated against.

## Validating

```bash
npm install
npm run validate
```

Checks: every file against its JSON Schema, `card.issuerId` resolves in `issuers.json`, `bonus.cardId` resolves to a file in `data/cards/`, filenames match internal ids, and `index.json` stays in sync with the files on disk — both which cards exist and that `name`/`issuerId`/`status` haven't drifted from the card file (e.g. a card flipped to `discontinued` in its own file but not in `index.json`). CI runs this on every push and PR — a PR that fails validation should not be merged.

## Contributing / updating data

1. Never hand-edit `_scaffoldHints` data into `benefits[]` without verifying it against an actual source (issuer site, terms & conditions, Guide to Benefits PDF). It's a lead, not a fact.
2. If an issuer or card can't be identified from an authoritative source, skip it — don't guess a name or issuer to fill the gap.
3. Every added/changed benefit or bonus should update `sourceMeta.lastReviewedDate`, `sourceMeta.sourceUrls`, and set `updatedBy` correctly.
4. Run `npm run validate` before opening a PR.
5. Agent-driven updates go through a PR for human review before merging — see AGENTS.md for the full workflow.
