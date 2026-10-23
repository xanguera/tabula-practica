// Verifica a escolha de perguntas por pontuação de cada facto.
// Uso: node scripts/facts-sim.mjs — sai com código 1 se algo falhar.
import { updateScores, pickWeighted, scoreOf } from '../js/facts.js';

let failed = false;
function check(name, ok, detail) {
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const table7 = Array.from({ length: 10 }, (_, i) => ({ a: i + 1, b: 7 }));
const PICKS = 10000;

// Uma conta respondida depressa três vezes contra uma errada três vezes.
let scores = {};
for (let i = 0; i < 3; i++) {
  scores = updateScores(scores, [{ a: 3, b: 7, tier: 'automatic' }, { a: 8, b: 7, tier: 'incorrect' }]);
}
const counts = {};
for (let i = 0; i < PICKS; i++) {
  pickWeighted(scores, table7, 1).forEach((f) => { counts[f.a] = (counts[f.a] || 0) + 1; });
}
const ratio = counts[8] / counts[3];
check('missed 7×8 picked far more than fast 7×3', ratio >= 3,
  `7×8 ${counts[8]}, 7×3 ${counts[3]}, ratio ${ratio.toFixed(1)}; scores 7x3=${scoreOf(scores, 3, 7)} 7x8=${scoreOf(scores, 8, 7)}`);

// 8 de 10 sem repetir.
let ok = true;
for (let i = 0; i < 2000; i++) {
  const picked = pickWeighted(scores, table7, 8);
  if (picked.length !== 8 || new Set(picked.map((f) => f.a)).size !== 8) ok = false;
}
check('8-from-10 pick returns 8 distinct facts', ok);

// Para um jogador novo, ×1 e ×10 aparecem menos do que ×7.
const fresh = {};
for (let i = 0; i < PICKS; i++) {
  pickWeighted({}, table7, 1).forEach((f) => { fresh[f.a] = (fresh[f.a] || 0) + 1; });
}
check('new player: ×1 and ×10 rarer than ×7', fresh[1] < fresh[7] && fresh[10] < fresh[7],
  `×1 ${fresh[1]}, ×10 ${fresh[10]}, ×7 ${fresh[7]}`);

// Pedir mais do que há devolve todos.
check('asking 12 from 10 returns 10', pickWeighted({}, table7, 12).length === 10);

process.exit(failed ? 1 : 0);
