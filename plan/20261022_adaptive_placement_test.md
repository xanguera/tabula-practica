# Adaptive placement test and open levels

## TL;DR

Today a child must finish every table in order: table 2 stays locked until every stage of
table 1 has a star. The only shortcut is the 20-question assessment, whose report offers
to unlock up to the first table that isn't "forte".

We change two things:

1. **All levels open.** Every table and every stage can be played at any time. The map
   shows clearly which tables are done, which the placement test showed the child already
   knows, and which one is next.
2. **A new adaptive placement test** ("Onde começo?"). About 8 to 12 typed questions. It
   gets harder after quick correct answers and easier after mistakes. It records every
   answer time without showing it. At the end it says "Recomendamos começar na tabuada do
   N" and offers to jump there. Jumping marks the tables before N as known and makes N
   the next table on the map.

We keep the existing assessment as a separate test. The two answer different questions:
placement asks "where do I start?" and has to be short; the assessment asks "which facts do
I know, and am I improving?" and has to stay the same every time so scores compare across
weeks. They share the keypad, the timing and the speed classes.

## Background

### What the research says

- Duolingo, Mathseeds and Prodigy all place with a short adaptive test that gets harder
  after right answers and easier after wrong ones, and they all let the learner skip it
  or override the result. Duolingo's "jump here" skips ahead without erasing earlier
  progress. ([Duolingo](https://blog.duolingo.com/partial-credit-improvements-to-duolingos-placement-test/),
  [Mathseeds](https://support.mathseeds.com/step-3-have-your-students-complete-their-placement-test),
  [Prodigy](https://prodigygame.com/main-en/blog/prodigy-placement-test))
- When the only goal is to put a child in a group, an adaptive test can stop as soon as
  the decision is clear. In one child study most children reached a reliable result after
  about 8 or 9 items, with 14 as the cap.
  ([Frontiers 2022](https://www.frontiersin.org/articles/10.3389/feduc.2022.945733/text))
- Hard facts are the bigger ones, especially 6×8, 8×6, 7×8 and 6×7. Easy ones are ×1,
  ×2, ×5 and ×10. Doubles like 7×7 are easier than their size suggests.
  ([ibmathsresources](https://ibmathsresources.com/2013/06/01/which-times-tables-do-students-find-difficult-an-investigation/),
  [Skycak](https://justinmath.com/why-4x8-and-6x8-are-perhaps-surprisingly-some-of-the-hardest-multiplication-facts-for-students-to-remember/))
- Around 3 seconds is the usual cutoff for "automatic" recall at this age. Typed answers
  need an allowance for typing; Reflex measures each child's typing speed and subtracts
  it. ([Rocket Math](https://www.rocketmath.com/2016/12/02/how-fast-should-students-be-with-math-facts/),
  [XtraMath](https://home.xtramath.org/support/what-are-the-timer-options-and-how-do-they-benefit-students),
  [Reflex](https://help.explorelearning.com/en/articles/8880209-can-reflex-be-slowed-down))
- Khan Academy's one-shot course challenge is a warning: a bad run is hard to undo. So the
  child must be able to retake the placement test and to ignore its result.

### What the code does today

- 10 table worlds plus a final mixed world. Table worlds have 5 stages, the final 3.
- A world unlocks when the previous world has a star on every stage; a stage unlocks when
  the previous stage has a star (`isWorldUnlocked`, `isStageUnlocked` in `js/storage.js`).
- The assessment report's "jump" card calls `unlockWorldsUpTo`, which stores
  `placementUnlocks` in the player's progress.
- The map has only three visual states: locked (🔒), unlocked, and star fill. There is no
  "done" state and no "known from the test" state.
- The daily review draws only from unlocked tables.
- The typed keypad (`renderTypeQuestion`) and its timing are reusable as they are.

## Design

### 1. Open levels and world states

Remove all locking. Each table world then shows one of these states on the map:

| State | When | Look |
|---|---|---|
| Done | every stage has at least one star | green ring and a ✓ badge, stars as today |
| Known | the player accepted a placement result covering this table, and hasn't finished it by playing | blue ring and a 🎯 badge, stars empty |
| Next | the first table, in order, that is neither done nor known | bigger, pulsing node; the map scrolls to it |
| Not started / in progress | anything else | plain node; partial stars if some stages have stars |

- A known table can still be played. Once every stage has a star, it becomes done.
- The final world follows the same rules. It is "next" only once all ten tables are done
  or known.
- The stage list shows every stage open, with a ✓ on stages that have a star.
- The "Termina a tabuada anterior primeiro!" message goes away.
- **Daily review** draws from tables that are done, known, or have at least one starred
  stage. With none of those it uses tables 1 and 2. (Today it uses unlocked tables, a
  notion that disappears.)

### 2. The placement test

**Where it's offered**

- A card on the map for a player who has never taken it and has no stars yet: "Já sabes
  alguma tabuada? Descobre onde começar 🎯", with "Fazer o teste" and "Agora não". "Agora
  não" hides the card for good for that player.
- On the "📋 Testes" screen, so it can be retaken any time.

**How it runs** (pure function in a new `js/placement.js`, so it can be tested in Node)

1. *Warm-up:* one easy question (2 × 3), not scored. Its time minus 1.5 s, floored at 0,
   is this child's typing allowance. Every later answer time has the allowance subtracted
   (plus 0.3 s for each digit after the first) before it is classified. This stops slow
   typists from being placed too low.
2. *Questions:* each step asks one fact from the current table. The other factor is
   picked from 3 to 9, hard ones first (6, 7, 8, then 9, 4, 3), never repeating a fact
   in one run.
3. *Classification:* same speed classes as the assessment: correct and at most 3 s is
   automatic, at most 7 s developing, otherwise slow; wrong is incorrect.
4. *Start* at table 5.
5. *Moving:*
   - Automatic: the table **passes**. Move up 2 tables while there has been no mistake
     yet, then up 1.
   - Correct but developing or slow: ask one more fact from the same table. If that one
     is automatic, the table passes. If not, the table is **shaky**; move down 1.
   - Wrong: the table **fails**; move down 1. Two wrong in a row: move down 2.
   - Passing table 10 or failing table 1 pins the result at that end.
6. *Stopping:* the first of
   - a clear boundary: some table k passed, table k+1 failed or is shaky, and at least
     6 questions asked;
   - 3 changes of direction;
   - 12 questions;
   - 3 wrong answers in a row (so a struggling child isn't kept going).
7. *Result:* the start table is the lowest table that failed or is shaky. If none did,
   it is one above the highest table that passed, or "all known" if table 10 passed.
   Tables below the start table count as known.

**What the child sees**

- No timer, no times shown, no right/wrong score at the end, as in the assessment.
- The end screen: "Recomendamos começar na tabuada do N". Buttons "Sim, saltar para lá!"
  and "Não, obrigado". Jumping marks tables 1 to N−1 as known and opens table N.
  "All known" says "Já sabes todas! Experimenta o Desafio Final" with a button to open it,
  and marks nothing.
- A short line of encouragement, and the tables that went well.

**What is stored** (`td_placements_v1_<profileId>`, newest first, capped at 20)

```
{ id, dateISO, startTable, accepted: true|false,
  typingAllowanceMs,
  answers: [{ a, b, table, answer, given, correct, elapsedMs, adjustedMs, tier }] }
```

- Every answer's time is kept, as asked ("track the answer time in the back").
- "Known" tables live in the progress object as `knownTables: { [worldId]: dateISO }`, so
  they sync with the progress and a later placement can replace them.
- The new key is added to the Drive sync list and to the per-player cleanup on delete.

### 3. The assessment

- Stays a fixed 20-question test with history and sharing.
- Its report loses the "jump" card. Placement is the one place that moves a player.
  In its place: "Pratica a tabuada do N" (the weakest table), which opens that world.
- Old `placementUnlocks` data: dropped. With everything open it means nothing, and only
  this family uses the game. The tables it had opened are not converted to "known".

## Steps

- [x] `js/placement.js`: the staircase as a pure function (state in, next question or
      result out), plus fact picking and the typing allowance.
- [x] `scripts/placement-sim.mjs`: simulated children run through it in Node (see
      Verification). No test framework; a plain script that exits non-zero on failure.
- [x] `js/storage.js`: remove `isWorldUnlocked`, `isStageUnlocked`, `unlockWorldsUpTo`;
      add `getWorldState`, `getNextWorld`, `setKnownTables`; placement history read/save;
      cleanup on delete.
- [x] `js/cloud-sync.js`: add `td_placements_v1_` to the synced keys.
- [x] `js/app.js`:
  - map: world states, no locks, scroll to "next", placement card;
  - stage list: all open, ✓ on starred stages;
  - "📋 Testes" screen (`#/tests`) replacing the map's assessment button;
  - routes `#/placement/run` and `#/placement/result/:id`;
  - placement run counts as "in a round" (no account button, no player chip, no cloud
    data replacement mid-test);
  - assessment report: swap the jump card for "Pratica a tabuada do N";
  - daily review: new table pool.
- [x] `css/style.css`: done / known / next node styles, stage ✓.
- [x] `sw.js`: add `js/placement.js` to the cached files and bump the cache version.

## Verification

- **Simulation** (`scripts/placement-sim.mjs`), each case run many times with random fact
  picks:
  - knows tables 1–6 instantly, nothing above → starts at 7, in 12 questions or fewer;
  - knows everything → "all known";
  - knows nothing → starts at 1 and stops by the 3-wrong rule, in 6 questions or fewer;
  - knows 1–6 but types slowly (2.5 s extra per answer) → still starts at 7, thanks to the
    typing allowance;
  - knows 1–6 with one random slip per run → starts at 6 or 7 most of the time (report the
    spread).
- **In the browser** (local server, Chrome):
  - a new player sees the card; "Agora não" hides it for good;
  - run the test, accept: tables below show 🎯, the start table is "next", the map
    scrolls there;
  - every table and stage opens from the map, including the final world;
  - finishing all stages of a 🎯 table turns it into ✓;
  - stored record has every answer time;
  - mid-test, the account button and player chip are inactive;
  - assessment report shows "Pratica a tabuada do N" and no jump card;
  - phone width (375 px): map nodes and badges still fit.
- After pushing: Cloudflare build green, live files updated.

## Decisions (agreed 2026-10-22)

1. **Map buttons.** The two tests sit behind one "📋 Testes" button on the map, which opens a
   small screen with both tests and the assessment history. The daily review keeps its own
   button. New players also get the one-time placement card on the map.
2. **Retaking.** Placement only ever adds known tables, never removes them. Done tables stay
   done.
3. **All known.** The result says "Já sabes todas! Experimenta o Desafio Final" as a
   suggestion, without marking anything.

## Review

All steps done and pushed.

**Changes from the plan, found while testing:**

- *Stop rule for struggling children.* "3 wrong answers in a row" let a child who knows
  nothing run to 10 questions, because slow-but-right answers reset the count. Changed to
  "3 tables in a row not known" (wrong or shaky). The same counter decides the 2-table step
  down.
- *Minimum length.* The 6-question minimum originally applied only to the boundary rule.
  In the browser, the "3 direction changes" rule ended a test after 4 real questions,
  deciding on one answer per table. The minimum now applies to both. Tests now take about
  6 questions plus the warm-up.
- *Bottom of the ladder.* A start at table 2 becomes table 1: table 1 is the gentle entry,
  so a child who fails table 2 starts there.

**Simulation** (`node scripts/placement-sim.mjs`, 1000 runs per case, all pass):

| Child | Lands on | Questions (avg / max) |
|---|---|---|
| knows 1–6 | 7 (100%) | 6.1 / 7 |
| knows everything | all known (100%) | 6 / 6 |
| knows nothing | 1 (100%) | 4.2 / 6 |
| knows 1–6, types 2.5 s slower | 7 (100%) | 6.1 / 7 |
| knows 1–3 | 4 (100%) | 6.2 / 7 |
| knows 1–8 | 9 (100%) | 6.2 / 7 |
| knows 1–6 and 10 | 7 (100%) | 6.1 / 7 |
| knows 1–6, 1 careless slip in 10 | 7 (90%), 6 (8%), lower (1.5%) | 6.1 / 9 |

Careless slips push the result down, never up: the safe direction.

**Browser** (local server, Chrome, keyboard answers driven by script):

- new player: card shows; "Agora não" hides it after leaving and returning;
- placement run answered as "knows 1–6": result "começar na tabuada do 7"; accepting opens
  table 7; map shows 1–6 known (🎯), 7 next, the rest new; card gone;
- stored record holds every answer with what was typed, time, adjusted time and speed class;
- answering everything right: "Já sabes todas!", Desafio Final button, nothing marked known;
- mid-test: no account button, player chip not tappable;
- stage list: all stages open, ✓ on starred ones; a table with every stage starred turns
  done (green);
- Testes screen lists both tests; the assessment's back arrow returns to it;
- assessment report shows "Pratica a tabuada do 7" and no jump card;
- at 375 px wide, map and stage list fit.

**Not tested:** a real child. The speed cutoffs (3 s / 7 s, 1.5 s free typing) are common
conventions, not measured on this child; the stored answer times make it possible to check
them later.
