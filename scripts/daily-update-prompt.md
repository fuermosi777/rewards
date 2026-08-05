You are running the daily benefit-fill-in pass for this repo. Read AGENTS.md first if you haven't already internalized it — it has the full rules (never guess, always cite a source, skip cards you can't verify, PR not direct commit).

Today's batch: run `node scripts/next-batch.js 5` to get the next 5 unfilled cards (empty `benefits[]` and `earningRates[]`).

For each card in the batch:
1. Read its `data/cards/<id>.json` — note its `name`, `issuerId` (look up the issuer in `data/issuers.json` for the real bank name), and any `_scaffoldHints`.
2. Research its real, current benefits and earning rate structure using WebSearch/WebFetch against the issuer's official page and reputable card-detail sources, per AGENTS.md's sourcing guidance.
3. Fill in `benefits[]` and `earningRates[]` following `schema/card.schema.json` — same shape and level of detail as the existing `chase-sapphire-preferred.json` and `american-express-platinum.json` records (read one as a reference if you haven't).
4. Delete `_scaffoldHints` once done.
5. Update `sourceMeta` (`lastReviewedDate` = today, `sourceUrls`, `updatedBy: "agent"`).
6. If a card can't be verified (dead link, ambiguous, discontinued with no benefit info available) — skip it, leave it unfilled, and note why in the PR description. Do not guess. Do not leave the card half-filled with unverified data.

After the batch:
1. Run `npm run validate` — fix any failures before proceeding.
2. Create a new branch named `daily-update-YYYY-MM-DD` (today's date).
3. Commit with a message summarizing which cards were filled and which were skipped (and why).
4. Push the branch and open a PR against `main` using `gh pr create`. Do NOT merge it yourself — a human reviews and merges.
5. Report back: which cards were filled, which were skipped and why, and the PR URL.

Hard rules (from AGENTS.md, repeated here since this runs unattended):
- Never guess an issuer, card name, or benefit term.
- Never treat `_scaffoldHints` contents as verified data — they're leads only.
- Never write directly to `main`.
- Never add user-specific data to this repo.
- Never delete a discontinued card's record.
