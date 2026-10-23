// ---------- O que a criança já sabe, facto a facto ----------
// Para cada conta ("7x8" = 7 × 8 dentro da tabuada do 8) guardamos um
// número entre 0 e 1: quanto mais perto de 1, mais certa e rápida tem sido
// a resposta. Os estágios usam-no para escolher as perguntas: as contas
// que a criança ainda não sabe aparecem mais vezes, as que já sabe de cor
// aparecem menos — mas nunca desaparecem.
//
// Aqui não há nada de ecrã, para poder ser testado em Node
// (ver scripts/facts-sim.mjs).
import { TIER_WEIGHT } from './data.js';

/** Chave de um facto: multiplicador e tabuada, como o jogo os pergunta. */
export function factKey(multiplier, table) {
  return `${table}x${multiplier}`;
}

/** Antes de qualquer resposta, as contas fáceis já começam mais raras. */
export function startingScore(multiplier) {
  if (multiplier === 1 || multiplier === 10) return 0.8;
  if (multiplier === 2 || multiplier === 5) return 0.7;
  return 0.5;
}

export function scoreOf(scores, multiplier, table) {
  const s = scores[factKey(multiplier, table)];
  return s === undefined ? startingScore(multiplier) : s;
}

/**
 * Atualiza as pontuações com uma lista de respostas
 * [{ a: multiplicador, b: tabuada, tier }]. Cada resposta puxa a
 * pontuação a meio caminho do seu valor. Devolve um objeto novo.
 */
export function updateScores(scores, answers) {
  const next = Object.assign({}, scores);
  answers.forEach(({ a, b, tier }) => {
    const quality = TIER_WEIGHT[tier];
    if (quality === undefined) return;
    const key = factKey(a, b);
    const before = next[key] === undefined ? startingScore(a) : next[key];
    next[key] = Math.round((0.5 * before + 0.5 * quality) * 100) / 100;
  });
  return next;
}

export function weightOf(scores, multiplier, table) {
  return 0.2 + (1 - scoreOf(scores, multiplier, table));
}

/**
 * Escolhe `count` factos, sem repetir, de `candidates` [{ a, b }],
 * com mais probabilidade para os que a criança ainda não sabe.
 */
export function pickWeighted(scores, candidates, count, rng = Math.random) {
  const pool = candidates.slice();
  const picked = [];
  while (picked.length < count && pool.length) {
    const weights = pool.map((c) => weightOf(scores, c.a, c.b));
    let r = rng() * weights.reduce((sum, w) => sum + w, 0);
    let i = 0;
    while (i < pool.length - 1 && r >= weights[i]) {
      r -= weights[i];
      i++;
    }
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}
