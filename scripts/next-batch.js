#!/usr/bin/env node
// Prints the next N unfilled card ids (benefits[] and earningRates[] both
// empty) in stable order, for a daily update agent to pick up.
//
// "Unfilled" is derived from the data itself (no separate progress file to
// drift out of sync): a card counts as done once it has any benefits or
// earningRates. Order is by id (stable, deterministic — same run twice in a
// row without intervening changes yields the same batch).
//
// Usage: node scripts/next-batch.js [count]   (default count: 5)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CARDS_DIR = path.join(ROOT, "data", "cards");
const count = parseInt(process.argv[2], 10) || 5;

const unfilled = [];
for (const file of fs.readdirSync(CARDS_DIR).sort()) {
  if (!file.endsWith(".json")) continue;
  const card = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), "utf8"));
  const hasBenefits = Array.isArray(card.benefits) && card.benefits.length > 0;
  const hasRates = Array.isArray(card.earningRates) && card.earningRates.length > 0;
  if (!hasBenefits && !hasRates) {
    unfilled.push(card.id);
  }
}

const batch = unfilled.slice(0, count);
console.log(JSON.stringify({ remaining: unfilled.length, batch }, null, 2));
