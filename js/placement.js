// ---------- Teste de colocação adaptativo ("Onde começo?") ----------
// Descobre em que tabuada a criança deve começar, com poucas perguntas.
// Funciona como uma escada: depois de uma resposta rápida e certa sobe de
// tabuada, depois de um erro desce, até encontrar a fronteira entre o que
// já sabe de cor e o que ainda não sabe.
//
// Aqui não há nada de ecrã: o estado entra, a próxima pergunta (ou o
// resultado) sai. Assim a lógica pode ser testada em Node, com crianças
// simuladas (ver scripts/placement-sim.mjs).
import { classifyAnswer } from './data.js';

export const START_TABLE = 5;
export const MAX_QUESTIONS = 12;
// Antes de 6 perguntas não decidimos pela fronteira: uma resposta só por
// tabuada é pouco. (Parar por dificuldades seguidas pode ser mais cedo.)
export const MIN_QUESTIONS = 6;
export const MAX_DIRECTION_CHANGES = 3;
// Três tabuadas seguidas que não sabe (erradas ou tremidas): paramos, para
// não cansar uma criança que está com dificuldades.
export const MAX_NOT_KNOWN_IN_A_ROW = 3;

// Pergunta de aquecimento: mede quanto tempo a criança demora a escrever
// uma resposta que sabe de certeza. Esse tempo, menos 1,5 s, é descontado
// das respostas seguintes, para quem escreve devagar não ficar colocado
// abaixo do que sabe. Limitado a 3 s, para uma distração no aquecimento
// não fazer passar respostas lentas por rápidas.
const WARMUP = { a: 3, b: 2, answer: 6, table: 2 };
const WARMUP_FREE_MS = 1500;
const MAX_TYPING_ALLOWANCE_MS = 3000;
const EXTRA_DIGIT_MS = 300;

// Depois de passar a tabuada do 10, confirmamos as mais difíceis que
// ainda não foram perguntadas antes de dizer "já sabes todas".
const CONFIRM_ORDER = [8, 7, 6, 9];

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createPlacement(rng = Math.random) {
  return {
    rng,
    phase: 'warmup', // warmup | test | done
    typingAllowanceMs: 0,
    current: START_TABLE,
    retrying: false,        // a segunda pergunta numa tabuada em que a primeira foi certa mas lenta
    confirming: false,      // já passou o 10; a confirmar as difíceis
    mistakeSeen: false,
    notKnownInARow: 0,
    lastDirection: 0,
    directionChanges: 0,
    status: {},             // { [tabuada]: 'pass' | 'fail' | 'shaky' } — conta o último resultado
    usedFacts: {},          // { [tabuada]: [multiplicadores já perguntados] }
    answers: [],            // respostas do teste (sem o aquecimento)
    stopReason: null,
  };
}

/** Próxima pergunta, ou null quando o teste acabou. */
export function nextQuestion(state) {
  if (state.phase === 'done') return null;
  if (state.phase === 'warmup') return Object.assign({ warmup: true }, WARMUP);
  const table = state.current;
  const used = state.usedFacts[table] || [];
  // Primeiro os factos difíceis (6, 7, 8), depois 9, 4, 3; nunca ×1, ×2
  // nem ×10, que não dizem nada sobre saber a tabuada.
  const order = shuffle([6, 7, 8], state.rng).concat(shuffle([9, 4, 3], state.rng), [5, 2]);
  const multiplier = order.find((m) => !used.includes(m));
  return { a: multiplier, b: table, answer: multiplier * table, table };
}

/**
 * Tempo de resposta sem o tempo de escrever: tira a folga de quem escreve
 * devagar e um pouco por cada algarismo a mais. Usado também pelo desafio
 * "Já sei esta!".
 */
export function adjustedTime(typingAllowanceMs, answer, elapsedMs) {
  const extraDigits = String(answer).length - 1;
  return Math.max(0, elapsedMs - typingAllowanceMs - extraDigits * EXTRA_DIGIT_MS);
}

function stop(state, reason) {
  state.phase = 'done';
  state.stopReason = reason;
}

function moveTo(state, table) {
  const target = Math.min(10, Math.max(1, table));
  const direction = Math.sign(target - state.current);
  if (direction !== 0) {
    if (state.lastDirection !== 0 && direction !== state.lastDirection) state.directionChanges++;
    state.lastDirection = direction;
  }
  state.current = target;
}

function hasBoundary(state) {
  for (let k = 1; k < 10; k++) {
    const above = state.status[k + 1];
    if (state.status[k] === 'pass' && (above === 'fail' || above === 'shaky')) return true;
  }
  return false;
}

/** A próxima tabuada difícil ainda por perguntar, ou null. */
function nextToConfirm(state) {
  const t = CONFIRM_ORDER.find((n) => state.status[n] === undefined);
  return t === undefined ? null : t;
}

/**
 * Regista a resposta à pergunta atual. `result` vem do teclado:
 * { correct, elapsedMs, given }.
 */
export function recordAnswer(state, question, result) {
  if (state.phase === 'warmup') {
    state.typingAllowanceMs = Math.min(MAX_TYPING_ALLOWANCE_MS, Math.max(0, result.elapsedMs - WARMUP_FREE_MS));
    state.phase = 'test';
    return;
  }

  const table = question.table;
  const adjustedMs = adjustedTime(state.typingAllowanceMs, question.answer, result.elapsedMs);
  const tier = classifyAnswer(result.correct, adjustedMs);
  state.answers.push({
    a: question.a, b: question.b, table, answer: question.answer,
    given: result.given === undefined ? null : result.given,
    correct: result.correct, elapsedMs: result.elapsedMs, adjustedMs, tier,
  });
  (state.usedFacts[table] = state.usedFacts[table] || []).push(question.a);

  // Resultado desta tabuada: certa e rápida passa; errada falha; certa mas
  // lenta merece outra pergunta — só à segunda fica "tremida".
  let outcome;
  if (tier === 'automatic') outcome = 'pass';
  else if (tier === 'incorrect') outcome = 'fail';
  else if (state.retrying) outcome = 'shaky';
  else outcome = 'retry';

  const asked = state.answers.length;
  if (outcome === 'retry') {
    state.retrying = true;
    if (asked >= MAX_QUESTIONS) {
      state.status[table] = 'shaky';
      stop(state, 'max-questions');
    }
    return;
  }
  state.retrying = false;
  state.status[table] = outcome;
  if (outcome !== 'pass') state.mistakeSeen = true;
  state.notKnownInARow = outcome === 'pass' ? 0 : state.notKnownInARow + 1;

  // Para onde vamos a seguir.
  if (outcome === 'pass') {
    if (table === 10 || state.confirming) {
      state.confirming = true;
      const next = nextToConfirm(state);
      if (next === null) {
        stop(state, 'all-known');
        return;
      }
      state.current = next; // as confirmações não contam como mudança de direção
    } else {
      moveTo(state, table + (state.mistakeSeen ? 1 : 2));
    }
  } else {
    state.confirming = false;
    if (table === 1) {
      stop(state, 'bottom');
      return;
    }
    moveTo(state, table - (state.notKnownInARow >= 2 ? 2 : 1));
  }

  if (asked >= MAX_QUESTIONS) stop(state, 'max-questions');
  else if (state.notKnownInARow >= MAX_NOT_KNOWN_IN_A_ROW) stop(state, 'not-known-in-a-row');
  else if (asked < MIN_QUESTIONS) return;
  else if (state.directionChanges >= MAX_DIRECTION_CHANGES) stop(state, 'direction-changes');
  else if (hasBoundary(state)) stop(state, 'boundary');
}

/**
 * Em que tabuada começar.
 * { startTable: 1..10 | null, allKnown, knownTables: [tabuadas abaixo da inicial] }
 */
export function getResult(state) {
  const notKnown = Object.keys(state.status)
    .map(Number)
    .filter((t) => state.status[t] === 'fail' || state.status[t] === 'shaky');
  let startTable;
  if (notKnown.length) {
    startTable = Math.min(...notKnown);
  } else {
    const passed = Object.keys(state.status).map(Number).filter((t) => state.status[t] === 'pass');
    const highest = passed.length ? Math.max(...passed) : 0;
    if (highest >= 10) return { startTable: null, allKnown: true, knownTables: [] };
    startTable = highest + 1;
  }
  // A tabuada do 1 é a porta de entrada: quem falha a do 2 começa no 1.
  if (startTable <= 2) startTable = 1;
  const knownTables = [];
  for (let t = 1; t < startTable; t++) knownTables.push(t);
  return { startTable, allKnown: false, knownTables };
}

// ---------- Desafio "Já sei esta!" ----------
// O mesmo princípio numa só tabuada: cinco contas difíceis. Certas e
// rápidas, a tabuada fica marcada como sabida, como no teste de colocação.

export const CHALLENGE_SIZE = 5;

/** ×6, ×7, ×8, ×9 e um de ×3/×4, por ordem baralhada. */
export function challengeQuestions(table, rng = Math.random) {
  const multipliers = [6, 7, 8, 9, rng() < 0.5 ? 3 : 4];
  return shuffle(multipliers, rng).map((a) => ({ a, b: table, answer: a * table, table }));
}

/** Passa com todas certas, nenhuma lenta, e pelo menos 4 de cor. */
export function isChallengePassed(answers) {
  const automatic = answers.filter((x) => x.tier === 'automatic').length;
  return answers.length === CHALLENGE_SIZE
    && answers.every((x) => x.tier === 'automatic' || x.tier === 'developing')
    && automatic >= CHALLENGE_SIZE - 1;
}
