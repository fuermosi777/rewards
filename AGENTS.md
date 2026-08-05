# AGENTS.md

Instructions for an agent (or a human following the same process) running a periodic update pass over this repo. Read `README.md` first for the "why" and the file layout; this file is the "how" for making a change.

## What you're maintaining

Two kinds of data, updated on different cadences, in different files — do not conflate them:

| | `data/cards/<id>.json` | `data/bonuses/<id>.json` |
|---|---|---|
| Contains | issuer, name, network, annual fee, status, **recurring benefits** | **current sign-up offer(s)**, offer history |
| Changes | rarely (issuer changed the terms/benefits of the card) | often (offers rotate constantly) |
| Update cadence | as-needed / low frequency | daily or monthly sweep |

`data/issuers.json` changes essentially never — only when a new issuer appears or issuer-level metadata (support phone, Guide to Benefits URL) needs correcting.

**This repo runs a daily automated pass for standing task 2** (filling in `benefits[]`/`earningRates[]`, 5 cards/day) via `scripts/daily-update.sh` on a schedule — see `scripts/README.md` for how it's wired up and how to adjust batch size/cadence. If you're an agent invoked by that job specifically, your actual task prompt is `scripts/daily-update-prompt.md`, not this file directly (though it points back here for the underlying rules).

## Standing task 1: refresh sign-up bonuses (`data/bonuses/*.json`)

Run this on the configured cadence (daily/monthly).

1. For each active card in `data/index.json`, check its current public sign-up offer against the card's known source (`sourceMeta.sourceUrls` in the corresponding `data/cards/<id>.json`, or the issuer's page directly).
2. If the current offer differs from what's in `currentOffers`:
   - Move the old entry into `history[]` with an `observedDate`.
   - Write the new offer into `currentOffers`.
   - Update `sourceMeta.lastReviewedDate` (today), `sourceMeta.sourceUrls`, `sourceMeta.updatedBy: "agent"`.
3. If a card's offer could not be confirmed (page unreachable, ambiguous, paywalled), **leave the existing record untouched** — do not blank it out or guess. Silence is safer than a wrong write here.
4. Validate (`npm run validate`) and open a PR. See "Output: always a PR" below.

## Standing task 2: fill in / verify recurring benefits and earning rates (`data/cards/*.json`)

This is the bigger, slower-moving task — most cards currently have `benefits: []`, `earningRates: []`, and a `_scaffoldHints` key with unverified leads from the bootstrap import. `chase-sapphire-preferred.json` and `american-express-platinum.json` are filled-in reference examples — read one before starting your first card.

**`benefits[]` vs `earningRates[]` — decide which array a perk belongs in first:**
- `earningRates[]`: a permanent, no-enrollment, no-tracking point/cashback multiplier on a spend category (e.g. "3x on dining, forever"). Nothing for a user to redeem or run out of. Uses the `earningRate` shape (`multiplier`/`rewardUnit`/`eligibleCategories`/optional `spendCap`).
- `benefits[]`: anything a user enrolls in, redeems, or should track consumption/expiration of (a $100 credit, a rotating 5% category with `requiresActivation`, lounge access, elite status). Uses the full `benefit` shape with `benefitType`.
- A rotating/limited-time bonus category (needs activation, resets, or has an end date) is a `benefits[]` entry with `benefitType: bonus_category` — NOT an `earningRates[]` entry, even though the detail fields look similar. `earningRates[]` is only for the truly permanent, automatic base structure.

1. Pick a card. If it has `_scaffoldHints`, read `raw` as a *lead list only* — a hint that a "Hotel Credit" or "Companion Pass" benefit probably exists, nothing more. Its `value`/`weight` numbers are not reliable and must not be copied into the real record. Some leads won't pan out at all (e.g. a benefit that existed when the bootstrap source was scraped but has since been discontinued) — verify against a current source, don't assume the hint is still accurate.
2. Find the authoritative source:
   - The issuer's own product page (marketing summary — usually incomplete for insurance-type benefits).
   - The **Guide to Benefits** PDF, when `issuers.json[].benefitsGuideUrl` is set or discoverable — this is usually the actual authoritative text for things like purchase protection, trip delay insurance, rental car coverage.
   - Reputable card-specific breakdowns (e.g. issuer press releases, the card's official terms & conditions page) as corroboration, not as the sole source.
3. For each real benefit found, add an entry to `benefits[]` following `schema/card.schema.json`:
   - Pick the right `benefitType` — this determines which `*Detail` object is required (see schema file's inline `description` fields; they're written to be read).
   - Set `renewalPeriod` using `unit`/`count`/`anchor` from `schema/shared/period.schema.json`. Work out the right shape by matching the real-world cadence:
     - Simple monthly/quarterly/annual credit → `anchor: "calendar"`.
     - Perk tied to when the card was opened (e.g. an anniversary free-night award) → `anchor: "card_anniversary"`.
     - Issuer-defined membership year (some Amex benefits) → `anchor: "membership_year"`.
     - Rotating categories or irregularly-announced windows → `anchor: "fixed_dates"` + populate `fixedDates` with the actual announced dates. Do not assume these align to calendar quarters.
     - Multi-year perks (Global Entry every 4 years, etc.) → same shape, just `unit: "year", count: 4` (or whatever the real interval is).
   - Set `sourceUrl` and `lastVerified` on the benefit itself.
   - Set card-level `sourceMeta.lastReviewedDate`, `sourceMeta.sourceUrls`, `sourceMeta.updatedBy: "agent"`.
4. For each permanent category multiplier found, add an entry to `earningRates[]`. Use consistent, reusable category slugs across cards (e.g. `dining`, `gas_stations`, `online_groceries`) rather than inventing a new slug per card — the point is cross-card comparability for "which card should I use here" recommendations.
4. Once `benefits[]` is populated and verified for a card, **delete its `_scaffoldHints` key**. A card.json with `_scaffoldHints` still present is a signal to everyone else that it's unreviewed.
5. If you cannot verify a lead against a real source, leave it out rather than including an unverified guess. An empty `benefits[]` is honest; a wrong one is actively harmful (a user might rely on it and miss a real benefit, or plan around one that doesn't exist).

## Standing task 3: card lifecycle (new cards, discontinued cards)

- New card announced/spotted → add to `data/issuers.json` (if new issuer) → add `data/cards/<id>.json` → add `data/bonuses/<id>.json` → add to `data/index.json`. Use id format `<issuer-id>-<card-name-slug>` (see existing files for the convention), lowercase-dash only.
- Card discontinued → do **not** delete the file (existing cardholders may still hold it and need benefit data). Set `status: "discontinued"` and `discontinuedDate` on the card record instead.
- Never invent an issuer name to force a card in. If the real issuing bank can't be identified from an authoritative source, skip the card — see README's note on cards skipped from the bootstrap import for the precedent.

## Output: always a PR, never a direct commit to main

Every agent-driven change — bonus refresh or benefit fill-in — goes out as a pull request, not a direct commit to the main branch. A human reviews the diff (especially source URLs and the actual benefit terms) before merging. This project would rather move slower than silently ship a misread benefit term into what people use to track real money.

PR description should include, per changed card: what changed, and the source URL(s) used to confirm it.

## Before opening a PR

```bash
npm install   # first time only
npm run validate
```

This checks schema conformance, that `issuerId` / `cardId` references resolve, that filenames match internal ids, and that `index.json` stays in sync with `data/cards/`. Fix any failures — don't open a PR that fails validation.

## Hard rules (do not violate)

1. Never guess an issuer, card name, or benefit term to fill a gap. Skip it and leave a trail (an issue, or just leave the field/card absent) instead.
2. Never treat `_scaffoldHints` contents as verified data.
3. Never write directly to `main` — always PR.
4. Never add user-specific data (usage tracking, personal account info) to this repo — it's a read-only reference database; per-user state belongs in the consuming app.
5. Never delete a discontinued card's record — mark it discontinued instead.
