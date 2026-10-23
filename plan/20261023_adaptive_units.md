# Adaptive units: "Já sei esta!" challenge and focused questions

## TL;DR

A child who already knows a table still has to play its easy stages, and every stage asks
every fact of the table equally often, including ×1 and ×10. That's boring for a child who
knows them and doesn't focus practice where it helps.

Two changes, both reusing what the placement test built:

1. **"Já sei esta!" challenge** on each table's stage list. Five hard facts of that table,
   typed, no timer shown. Answered right and quickly, the table is marked as known (🎯),
   the same mark the placement test gives, and the child moves on.
2. **Questions that lean towards what the child doesn't know yet.** The game keeps a small
   mastery score per fact, updated from every answer (stages, daily review, both tests,
   the challenge). The shuffled, matching and against-the-clock stages pick facts with
   weights: facts the child misses or answers slowly come up more, facts they answer quickly
   every time come up less.

Stage length and stars stay as they are, so results remain comparable and a struggling
child doesn't get longer rounds.

## Design

### 1. Mastery per fact (new `js/facts.js`, no screen code)

- Key: `"<table>x<multiplier>"`, e.g. `"7x8"`. 7 × 8 and 8 × 7 are kept apart, because
  the game asks them as different facts within different tables.
- Each answer gives a quality from its speed class, using the assessment's weights:
  automatic 1, developing 0.7, slow 0.4, incorrect 0.
- Mastery moves halfway towards each new answer: `m = 0.5 × m + 0.5 × quality`. Two quick
  right answers take a fact from 0 to 0.75; one miss halves it.
- Starting value before any answer, so easy facts start rarer: ×1 and ×10 at 0.8, ×2 and
  ×5 at 0.7, the rest at 0.5.
- Weight for picking: `0.2 + (1 − m)`. A well-known fact is about 6 times less likely than
  a fact the child keeps missing, but never disappears.
- Stored in the progress object as `facts: { "7x8": 0.62, ... }` (two decimals, at most 100
  entries), so it syncs to Drive with no change to the sync code.

**Which answers update it**

| Source | Updates? | Why |
|---|---|---|
| Shuffled and against-the-clock stages | yes | real recall, in random order |
| Sequence stages (1 and 2) | no | counting up the table makes the answer easy to work out |
| Matching stage | no | it reports pairs, not timed answers |
| Daily review | yes | |
| Assessment, placement, challenge | yes | placement and challenge use the typing allowance |

Multiple-choice answers start reporting their time (they don't today), so they get a speed
class too.

### 2. Weighted questions

- Shuffled and against-the-clock stages of a table: 8 facts picked by weight, without
  repeats, from the table's 10.
- Matching stage of a table: 6 facts picked the same way.
- Final world: shuffled and against-the-clock stages pick 8 facts by weight from all 100;
  matching keeps one fact per table (6 different tables) with the multiplier picked by
  weight.
- Sequence stages unchanged.

### 3. "Já sei esta!" challenge

- **Where:** a card at the top of a table's stage list, while the table is neither done nor
  known: "⚡ Já sei esta!" — "5 perguntas difíceis. Acerta todas depressa e a tabuada fica
  marcada como sabida." Not on the final world.
- **Questions:** that table × 6, 7, 8, 9 and one of 3 or 4, in random order. Typed, no
  timer, the right answer shown after a miss (as in the tests). Counts as "in a round":
  account button and player chip inactive.
- **Typing allowance:** the one from the player's latest placement test, if any; otherwise
  none. Same per-digit rule as placement.
- **Pass:** all 5 right, none slow, and at least 4 automatic.
- **Pass result:** "🎉 Já sabes a tabuada do N!", the table is marked known (🎯), buttons
  "Próxima tabuada" (the map's next table) and "Voltar".
- **Fail result:** "Quase! Ainda vale a pena praticar", the facts that were wrong or slow,
  and "Praticar esta tabuada" back to the stage list. It can be retried any time.
- Known, not done: a challenge doesn't fake stars. The table shows 🎯 with its real stars,
  exactly like a table placed by the placement test.

## Steps

- [x] `js/facts.js`: mastery update, starting values, weighted pick without repeats.
- [x] `scripts/facts-sim.mjs`: checks the weighting in Node (see Verification).
- [x] `js/placement.js`: export the typing-allowance adjustment so the challenge reuses it.
- [x] `js/exercises.js`: multiple-choice answers report `elapsedMs`; stage results pass the
      question back so the app knows which fact was answered.
- [x] `js/data.js`: `generateQuestions` takes the fact scores and picks by weight for the
      shuffled, timed and matching stages.
- [x] `js/storage.js`: `getFactScores`, `recordFactAnswers` (one write per round, not per
      answer).
- [x] `js/app.js`: record answers from stages, review, assessment, placement; pass scores to
      `generateQuestions`; challenge card, run and result screens (`#/challenge/:worldId`);
      challenge counts as in a round.
- [x] `css/style.css`: challenge card.
- [x] `sw.js`: cache `js/facts.js`, bump the cache version.

## Verification

- **Node** (`scripts/facts-sim.mjs`):
  - a fact answered quickly 3 times ends up picked much less often than one missed 3 times
    (over 10,000 picks, ratio at least 3);
  - an 8-from-10 pick never repeats a fact and always returns 8;
  - easy facts (×1, ×10) are picked less often than ×7 for a new player;
  - the placement simulation still passes.
- **Browser** (local server, Chrome, scripted answers):
  - after missing 7 × 8 and answering 7 × 2 quickly a few times in a shuffled stage, the
    next shuffled stage includes 7 × 8; `facts` in storage has the expected values;
  - challenge passed with quick right answers: table becomes 🎯, the map's next table moves
    on; challenge failed with one miss: "Quase!" with that fact listed, nothing marked;
  - the challenge card is gone on a done or known table, and absent on the final world;
  - mid-challenge, account button and player chip are inactive;
  - 375 px wide: the stage list with the card fits.
- After pushing: Cloudflare build green, live files updated.

## Review

All steps done and pushed. Also updated the README, which still described levels unlocking
one by one and the Drive backup as "not switched on yet".

**Changes from the plan:**

- *How the stages get their questions.* Instead of the data module importing the scoring
  (which would make the two modules import each other), `generateQuestions` takes a
  "pick these facts" function. The app passes the weighted pick; without one, the pick is
  random as before.
- *"Próxima" after a passed challenge.* It first pointed at the map's next table, which can
  be far behind (passing 7 offered table 1). It now points at the first table after the
  one just passed that isn't done or known, falling back to the map's next table.
- *Final world, shuffled stages.* Previously could repeat a fact within a round; the weighted
  pick never repeats.

**Node** (`node scripts/facts-sim.mjs`, all pass; placement simulation still passes):

- after 3 quick answers to 7 × 3 and 3 misses of 8 × 7, 8 × 7 is picked 4.2 times as often;
- 8-from-10 picks always give 8 different facts;
- new player: ×1 and ×10 picked about half as often as ×7.

**Browser** (local server, Chrome, scripted answers):

- a shuffled stage of table 7 with every 8 × 7 missed: stored scores 7x8 = 0.25, others
  0.75–0.9; afterwards 8 × 7 appears in 96% of shuffled rounds (1 × 7 in 66%) and in 84% of
  matching rounds (1 × 7 in 46%);
- challenge on table 7, all right and quick: "Já sabes a tabuada do 7!", table becomes 🎯,
  card gone from its stage list;
- challenge on table 6 with 8 × 6 wrong: "Quase!", lists 8 × 6, nothing marked, 6x8 score
  0.25;
- challenge on table 8 passed: "Próxima: tabuada do 9";
- card absent on the final world; mid-challenge, no account button, player chip inactive;
- 375 px wide: stage list with the card fits.

**Not tested:** a real child's sense of whether rounds now feel less repetitive.
