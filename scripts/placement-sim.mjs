// Corre o teste de colocação com crianças simuladas e verifica que as
// coloca onde devem. Uso: node scripts/placement-sim.mjs
// Sai com código 1 se algum caso falhar.
import { createPlacement, nextQuestion, recordAnswer, getResult } from '../js/placement.js';

const RUNS = 1000;

// Uma criança simulada responde a uma pergunta: { correct, elapsedMs, given }.
// `knows(table)` diz se sabe a tabuada de cor; `typingMs` é o tempo extra
// que leva a escrever; `slipRate` é a probabilidade de um erro por descuido.
function child({ knows, typingMs = 800, slipRate = 0 }) {
  return (q, rng) => {
    if (q.warmup) return { correct: true, elapsedMs: 900 + typingMs, given: q.answer };
    const slip = rng() < slipRate;
    if (knows(q.table) && !slip) {
      return { correct: true, elapsedMs: 1200 + typingMs + rng() * 600, given: q.answer };
    }
    // Não sabe: erra ou acerta a pensar muito.
    if (rng() < 0.6) return { correct: false, elapsedMs: 5000 + typingMs, given: q.answer + 1 };
    return { correct: true, elapsedMs: 8000 + typingMs, given: q.answer };
  };
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function runOnce(answerFn, seed) {
  const rng = seeded(seed);
  const state = createPlacement(rng);
  let q;
  while ((q = nextQuestion(state))) recordAnswer(state, q, answerFn(q, rng));
  return { result: getResult(state), questions: state.answers.length, reason: state.stopReason };
}

function simulate(name, answerFn, check) {
  const starts = {};
  let maxQuestions = 0;
  let totalQuestions = 0;
  let ok = 0;
  for (let i = 0; i < RUNS; i++) {
    const run = runOnce(answerFn, 1000 + i);
    const key = run.result.allKnown ? 'all' : run.result.startTable;
    starts[key] = (starts[key] || 0) + 1;
    maxQuestions = Math.max(maxQuestions, run.questions);
    totalQuestions += run.questions;
    if (check(run)) ok++;
  }
  const passRate = ok / RUNS;
  return { name, starts, maxQuestions, avgQuestions: +(totalQuestions / RUNS).toFixed(1), passRate };
}

const upTo = (n) => (t) => t <= n;

const cases = [
  {
    sim: simulate('knows 1-6', child({ knows: upTo(6) }),
      (r) => r.result.startTable === 7 && r.questions <= 12),
    minPassRate: 1,
  },
  {
    sim: simulate('knows everything', child({ knows: () => true }),
      (r) => r.result.allKnown),
    minPassRate: 1,
  },
  {
    sim: simulate('knows nothing', child({ knows: () => false }),
      (r) => r.result.startTable === 1 && r.questions <= 6),
    minPassRate: 1,
  },
  {
    sim: simulate('knows 1-6, slow typist (+2.5 s)', child({ knows: upTo(6), typingMs: 3300 }),
      (r) => r.result.startTable === 7),
    minPassRate: 1,
  },
  {
    sim: simulate('knows 1-3', child({ knows: upTo(3) }),
      (r) => r.result.startTable === 4 && r.questions <= 12),
    minPassRate: 1,
  },
  {
    sim: simulate('knows 1-8', child({ knows: upTo(8) }),
      (r) => r.result.startTable === 9 && r.questions <= 12),
    minPassRate: 1,
  },
  {
    // A tabuada do 10 é fácil: saber o 10 não pode empurrar para cima.
    sim: simulate('knows 1-6 and 10', child({ knows: (t) => t <= 6 || t === 10 }),
      (r) => r.result.startTable === 7 && r.questions <= 12),
    minPassRate: 1,
  },
  {
    // Com descuidos não há resposta certa única: só queremos que fique
    // perto, e mostramos a distribuição.
    sim: simulate('knows 1-6, 1 slip in 10', child({ knows: upTo(6), slipRate: 0.1 }),
      (r) => r.result.startTable === 6 || r.result.startTable === 7),
    minPassRate: 0.75,
  },
];

let failed = false;
for (const { sim, minPassRate } of cases) {
  const good = sim.passRate >= minPassRate;
  if (!good) failed = true;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${sim.name.padEnd(34)} ok ${(sim.passRate * 100).toFixed(1)}%  questions avg ${sim.avgQuestions} max ${sim.maxQuestions}  starts ${JSON.stringify(sim.starts)}`);
}
process.exit(failed ? 1 : 0);
