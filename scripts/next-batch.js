#!/usr/bin/env node
// Prints the next N unfilled card ids (benefits[] and earningRates[] both
// empty) in stable order, for a daily update agent to pick up.
//
// "Unfilled" is derived from the data itself (no separate progress file to
// drift out of sync): a card counts as done once it has any benefits or
// earningRates. Order is by id (stable, deterministic — same run twice in a
// row without intervening changes yields the same batch).
//
// Discontinued cards often stay unfillable (issuer pulled the product page),
// so an unfilled discontinued card reviewed within the last RECHECK_DAYS is
// deferred instead of re-researched every day. Deferred cards are not counted
// in `remaining`, so the daily job doesn't start claude for them alone.
//
// Usage: node scripts/next-batch.js [count]   (default count: 5)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CARDS_DIR = path.join(ROOT, "data", "cards");
const count = parseInt(process.argv[2], 10) || 5;
const RECHECK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const unfilled = [];
const deferred = [];
for (const file of fs.readdirSync(CARDS_DIR).sort()) {
  if (!file.endsWith(".json")) continue;
  const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), "utf8"));
  const hasBenefits = Array.isArray(card.benefits) && card.benefits.length > 0;
  const hasRates = Array.isArray(card.earningRates) && card.earningRates.length > 0;
  if (hasBenefits || hasRates) continue;
  const reviewed = Date.parse(card.sourceMeta?.lastReviewedDate ?? "");
  if (card.status === "discontinued" && Date.now() - reviewed < RECHECK_DAYS * DAY_MS) {
    deferred.push(card.id);
  } else {
    unfilled.push(card.id);
  }
}

const batch = unfilled.slice(0, count);
console.log(JSON.stringify({ remaining: unfilled.length, batch, deferred }, null, 2));
