#!/usr/bin/env node
// Validates every file under data/ against its schema, plus a few
// cross-file referential checks that JSON Schema alone can't express
// (issuerId must exist, cardId in bonuses/ must have a matching cards/ file,
// index.json must stay in sync with the actual files on disk).
//
// Run: npm run validate

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA_DIR = path.join(ROOT, "schema");
const DATA_DIR = path.join(ROOT, "data");

let errorCount = 0;
function fail(msg) {
  console.error(`✗ ${msg}`);
  errorCount++;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadSchema(ajv, relPath) {
  const full = path.join(SCHEMA_DIR, relPath);
  const schema = readJson(full);
  ajv.addSchema(schema, schema.$id || relPath);
  return schema;
}

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

// period.schema.json is $ref'd by relative path ("shared/period.schema.json")
// from card.schema.json, so register it under that exact key too.
const periodSchema = readJson(path.join(SCHEMA_DIR, "shared/period.schema.json"));
ajv.addSchema(periodSchema, "shared/period.schema.json");

const issuerSchema = loadSchema(ajv, "issuer.schema.json");
const cardSchema = loadSchema(ajv, "card.schema.json");
const bonusSchema = loadSchema(ajv, "bonus.schema.json");

const validateIssuer = ajv.compile(issuerSchema);
const validateCard = ajv.compile(cardSchema);
const validateBonus = ajv.compile(bonusSchema);

// --- issuers.json ---
const issuersPath = path.join(DATA_DIR, "issuers.json");
const issuers = readJson(issuersPath);
const issuerIds = new Set();
for (const issuer of issuers) {
  if (!validateIssuer(issuer)) {
    fail(`issuers.json: ${issuer.id || "(no id)"}: ${ajv.errorsText(validateIssuer.errors)}`);
  }
  issuerIds.add(issuer.id);
}

// --- data/cards/*.json ---
const cardsDir = path.join(DATA_DIR, "cards");
const cardIds = new Set();
const cardsById = new Map();
for (const file of fs.readdirSync(cardsDir)) {
  if (!file.endsWith(".json")) continue;
  const filePath = path.join(cardsDir, file);
  const card = readJson(filePath);
  const label = `data/cards/${file}`;

  if (!validateCard(card)) {
    fail(`${label}: ${ajv.errorsText(validateCard.errors)}`);
    continue;
  }
  if (card.id !== path.basename(file, ".json")) {
    fail(`${label}: card.id ("${card.id}") does not match filename`);
  }
  if (!issuerIds.has(card.issuerId)) {
    fail(`${label}: issuerId "${card.issuerId}" not found in issuers.json`);
  }
  if (card.imageUrl) {
    const imgPath = path.join(ROOT, card.imageUrl);
    if (!fs.existsSync(imgPath)) {
      fail(`${label}: imageUrl file "${card.imageUrl}" does not exist on disk`);
    }
  }
  cardIds.add(card.id);
  cardsById.set(card.id, card);
}

// --- data/bonuses/*.json ---
const bonusesDir = path.join(DATA_DIR, "bonuses");
for (const file of fs.readdirSync(bonusesDir)) {
  if (!file.endsWith(".json")) continue;
  const filePath = path.join(bonusesDir, file);
  const bonus = readJson(filePath);
  const label = `data/bonuses/${file}`;

  if (!validateBonus(bonus)) {
    fail(`${label}: ${ajv.errorsText(validateBonus.errors)}`);
    continue;
  }
  if (bonus.cardId !== path.basename(file, ".json")) {
    fail(`${label}: cardId ("${bonus.cardId}") does not match filename`);
  }
  if (!cardIds.has(bonus.cardId)) {
    fail(`${label}: cardId "${bonus.cardId}" has no matching file in data/cards/`);
  }
}

// --- index.json in sync with data/cards/*.json ---
// Checks both presence (every card file has an index entry and vice versa)
// and that the denormalized fields index.json carries (name, issuerId,
// status, imageUrl) haven't drifted from the card file, which is the actual source of
// truth. A status flip (e.g. a card going discontinued) is exactly the kind
// of edit that's easy to make in one file and forget in the other.
const indexPath = path.join(DATA_DIR, "index.json");
const index = readJson(indexPath);
const indexIds = new Set(index.cards.map((c) => c.id));
for (const id of cardIds) {
  if (!indexIds.has(id)) fail(`index.json: missing entry for card "${id}"`);
}
for (const entry of index.cards) {
  if (!cardIds.has(entry.id)) {
    fail(`index.json: references card "${entry.id}" with no file in data/cards/`);
    continue;
  }
  const card = cardsById.get(entry.id);
  for (const field of ["name", "issuerId", "status", "imageUrl"]) {
    if (entry[field] !== card[field]) {
      fail(
        `index.json: card "${entry.id}" has ${field}="${entry[field]}" but data/cards/${entry.id}.json has ${field}="${card[field]}"`
      );
    }
  }
}

if (errorCount > 0) {
  console.error(`\n${errorCount} error(s) found.`);
  process.exit(1);
} else {
  console.log(`OK: ${cardIds.size} cards, ${issuerIds.size} issuers validated.`);
}
