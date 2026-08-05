# CONSUMING.md

How to pull data from this repo into an app. This is for whoever (human or agent) is building the *consuming* side — the personal-finance app that reads this data. If you're updating the data itself (crawling issuer sites, filling in benefits), see [AGENTS.md](AGENTS.md) instead.

## There is no server. It's just files.

This repo has no API server, no auth, no rate limiting of its own — it's static JSON served by GitHub's raw content host. Every file is independently fetchable over plain HTTPS `GET`:

```
https://raw.githubusercontent.com/<owner>/<repo>/main/<path>
```

e.g.:
```
https://raw.githubusercontent.com/fuermosi777/rewards/main/data/index.json
https://raw.githubusercontent.com/fuermosi777/rewards/main/data/issuers.json
https://raw.githubusercontent.com/fuermosi777/rewards/main/data/cards/chase-sapphire-preferred.json
https://raw.githubusercontent.com/fuermosi777/rewards/main/data/bonuses/chase-sapphire-preferred.json
```

Swap `main` for a specific commit SHA or tag if you want to pin to an exact version instead of always tracking the latest commit on `main`.

## The three-step fetch pattern

Don't fetch all ~350 files. Fetch only what you need, when you need it:

1. **Fetch `data/index.json` once** (on app launch, or on your own refresh cadence). It's small — just `{id, name, issuerId, status}` per card — and tells you what card ids exist.
2. **When a user picks/links a specific card**, fetch that one card's `data/cards/<id>.json` (benefits + earning rates) and `data/bonuses/<id>.json` (current sign-up offer) on demand. Don't prefetch all 168 — most users hold a handful of cards.
3. **Fetch `data/issuers.json` once** alongside the index — it's small (16 entries) and every card references an `issuerId` into it.

```
GET data/index.json      →  cache locally, know what card ids exist
GET data/issuers.json    →  cache locally, resolve issuerId → issuer name/metadata
GET data/cards/<id>.json     →  only for cards the user actually has/is browsing
GET data/bonuses/<id>.json   →  same, only on demand
```

## Staying in sync (polling, not push)

There's no webhook or push mechanism — this is a static file host. To detect updates:

- Re-fetch `data/index.json` periodically (e.g. once a day, or on app foreground) and compare its `lastUpdated` field against what you last saw.
- If it changed, or if you want per-card freshness, compare each card's own `sourceMeta.lastReviewedDate` against what you have cached, and re-fetch only the cards that changed.
- There's no "give me only what changed since X" endpoint — this is plain file fetching, so "what changed" is something your app computes client-side by diffing timestamps, not something the repo computes for you.

If update volume grows and this polling model stops being good enough (e.g. you want server-side filtering like "all cards with lounge access," or you don't want to expose the raw GitHub repo structure to your app), that's the point to put a real API server in front of this data — not before.

## Reading the schema correctly

Full field definitions live in `schema/*.json` (they're written with inline `description`s meant to be read directly, not just validated against) — this section is the "what does this mean for my UI" summary.

### `benefits[]` vs `earningRates[]` — different things, different UI

- **`earningRates[]`**: permanent point/cashback multipliers by spend category (e.g. "3x on dining, forever"). No enrollment, no expiration, no usage to track. This is what powers a "which card should I use for this purchase" recommendation — match the user's purchase category against `eligibleCategories` across their cards and suggest the highest `multiplier`.
- **`benefits[]`**: anything the user enrolls in, redeems, or should be reminded to use before it expires (a $100 quarterly credit, a rotating 5% category, lounge access, elite status). This is what a "benefit usage tracker" UI is built around. **Usage state (has the user redeemed this cycle's credit yet?) is NOT in this repo** — that's data your app owns and stores per-user; this repo only tells you the benefit exists and its terms.

### Making sense of a `benefit` entry

- `benefitType` tells you which `*Detail` sub-object is populated (`statementCreditDetail`, `bonusCategoryDetail`, `loungeAccessDetail`, `freeNightAwardDetail`) — check `benefitType` first, then read the matching detail object.
- `isOneTime: true` means it doesn't recur — don't show a countdown/reset date for these (insurance-type benefits, e.g. purchase protection, are usually one-time/always-available rather than cyclical).
- `renewalPeriod` (present when `isOneTime` is false/absent) is how you compute "when does this reset":
  - `anchor: "calendar"` — resets on calendar month/quarter/year boundaries.
  - `anchor: "card_anniversary"` — resets based on when the user opened the card. **Your app needs the user's account-open date to compute this correctly** — this repo has no per-user data, so this is on your side.
  - `anchor: "membership_year"` — issuer-defined year, not necessarily calendar or card-anniversary aligned. Treat like `card_anniversary` unless you have more specific issuer info.
  - `anchor: "fixed_dates"` — irregular, issuer-announced windows (e.g. rotating 5% categories). Use the literal `fixedDates` array; don't try to compute this from `unit`/`count` — those are just descriptive here, the actual dates are the source of truth.
- `statementCreditDetail.splitEligible: true` means the annual total is actually disbursed in smaller chunks (e.g. Amex Uber Cash is $200/year but paid out as $15-20/month) — pair with the smaller `renewalPeriod` cycle, which is what's actually set on the benefit.

### Sign-up bonuses (`data/bonuses/<id>.json`)

- `currentOffers[]` is what's live now; `history[]` is an append-only archive of past observed offers (useful if you want to show "this card's offer has been getting better/worse over time").
- `expirationDate` on an offer, when present, is a known end date for that specific offer — don't assume offers without one are evergreen, they may just not have a published end date yet.

### Card lifecycle

- `status: "discontinued"` cards are kept, not deleted — a user who already holds a discontinued card still needs its benefit data. Don't filter these out of a "cards I hold" view; do filter them out of a "cards you can apply for" view.
- `_scaffoldHints` (present on cards not yet filled in) is unverified bootstrap data, not real benefit data — **never surface its contents in your app UI**. Treat a card with this key as "benefits not yet available in this database" and handle that gracefully (e.g. show the card exists but note benefits aren't tracked yet), rather than erroring or showing garbage data.

## Example: minimal fetch + render flow

```js
const BASE = "https://raw.githubusercontent.com/fuermosi777/rewards/main";

async function getCardIndex() {
  const res = await fetch(`${BASE}/data/index.json`);
  return res.json(); // { version, lastUpdated, cards: [{id, name, issuerId, status}] }
}

async function getCard(id) {
  const [card, bonus] = await Promise.all([
    fetch(`${BASE}/data/cards/${id}.json`).then(r => r.json()),
    fetch(`${BASE}/data/bonuses/${id}.json`).then(r => r.json()),
  ]);
  return { card, bonus };
}

// Recommend a card for a purchase category from the user's held cards:
function bestCardFor(category, heldCards) {
  return heldCards
    .flatMap(c => (c.earningRates || []).map(r => ({ card: c, rate: r })))
    .filter(({ rate }) => rate.eligibleCategories.includes(category))
    .sort((a, b) => b.rate.multiplier - a.rate.multiplier)[0];
}
```
