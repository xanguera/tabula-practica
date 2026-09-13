// ---------- Dados do jogo: mundos, tipos de exercício, avatares ----------

export const AVATARS = [
  { id: 'unicorn', emoji: '🦄', color: '#ff8fd6' },
  { id: 'dragon', emoji: '🐲', color: '#3ddc84' },
  { id: 'fox', emoji: '🦊', color: '#ff914d' },
  { id: 'cat', emoji: '🐱', color: '#ffd65c' },
  { id: 'dog', emoji: '🐶', color: '#c9a06a' },
  { id: 'panda', emoji: '🐼', color: '#d9d9d9' },
  { id: 'lion', emoji: '🦁', color: '#ffb84d' },
  { id: 'koala', emoji: '🐨', color: '#a8a8a8' },
  { id: 'frog', emoji: '🐸', color: '#3ddc84' },
  { id: 'penguin', emoji: '🐧', color: '#4fc3ff' },
  { id: 'dino', emoji: '🦖', color: '#5adba0' },
  { id: 'monkey', emoji: '🐵', color: '#c98a4b' },
  { id: 'shark', emoji: '🦈', color: '#4fc3ff' },
  { id: 'butterfly', emoji: '🦋', color: '#c58fff' },
  { id: 'robot', emoji: '🤖', color: '#7b4fff' },
  { id: 'astronaut', emoji: '👩‍🚀', color: '#ff5c8d' },
];

export function getAvatar(id) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}

// Tabelas a praticar (nunca acima de 10x10)
export const TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const STAGE_TYPES = {
  SEQ_CHOICE: 'seq_choice',
  SEQ_TYPE: 'seq_type',
  RANDOM_CHOICE: 'random_choice',
  MATCHING: 'matching',
  TIMED: 'timed',
};

export const STAGE_DEFS = [
  {
    type: STAGE_TYPES.SEQ_CHOICE,
    name: 'Sequência',
    desc: 'Escolhe a resposta certa',
    icon: '🔢',
  },
  {
    type: STAGE_TYPES.SEQ_TYPE,
    name: 'Escreve o número',
    desc: 'Escreve a resposta',
    icon: '⌨️',
  },
  {
    type: STAGE_TYPES.RANDOM_CHOICE,
    name: 'Baralhado',
    desc: 'Perguntas à sorte, escolhe a resposta',
    icon: '🎲',
  },
  {
    type: STAGE_TYPES.MATCHING,
    name: 'Liga os pares',
    desc: 'Junta a conta ao resultado',
    icon: '🔗',
  },
  {
    type: STAGE_TYPES.TIMED,
    name: 'Contra o tempo',
    desc: 'Responde depressa!',
    icon: '⏱️',
  },
];

export const FINAL_WORLD_ID = 'final';

export const WORLDS = [
  ...TABLES.map((table) => ({
    id: String(table),
    table,
    title: `Tabuada do ${table}`,
    isFinal: false,
  })),
  {
    id: FINAL_WORLD_ID,
    table: null,
    title: 'Desafio Final',
    isFinal: true,
  },
];

export function worldIndex(worldId) {
  return WORLDS.findIndex((w) => w.id === worldId);
}

export function getWorld(worldId) {
  return WORLDS.find((w) => w.id === worldId);
}

export function stagesForWorld(world) {
  if (world.isFinal) {
    return [
      { type: STAGE_TYPES.RANDOM_CHOICE, name: 'Mistura de Tabuadas', desc: 'Todas as tabuadas, escolhe a resposta', icon: '🎲' },
      { type: STAGE_TYPES.MATCHING, name: 'Liga Tudo', desc: 'Pares de todas as tabuadas', icon: '🔗' },
      { type: STAGE_TYPES.TIMED, name: 'Super Desafio', desc: 'Contra o tempo, todas as tabuadas', icon: '🏆' },
    ];
  }
  return STAGE_DEFS;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Gera a lista de perguntas para um estágio.
 * Cada pergunta: { a, b, answer }
 */
export function generateQuestions(world, stageDef, count = 8) {
  const isFinal = world.isFinal;
  const table = world.table;

  const makePair = (a, b) => ({ a, b, answer: a * b });

  switch (stageDef.type) {
    case STAGE_TYPES.SEQ_CHOICE:
    case STAGE_TYPES.SEQ_TYPE: {
      // sequência ascendente: 1xtable, 2xtable, ... até 10xtable (amostra `count`)
      const seq = [];
      for (let n = 1; n <= 10; n++) seq.push(makePair(n, table));
      return seq.slice(0, count);
    }
    case STAGE_TYPES.RANDOM_CHOICE:
    case STAGE_TYPES.TIMED: {
      const list = [];
      if (isFinal) {
        for (let i = 0; i < count; i++) {
          const t = TABLES[randInt(0, TABLES.length - 1)];
          const n = randInt(1, 10);
          list.push(makePair(n, t));
        }
      } else {
        const seq = shuffle([...Array(10)].map((_, i) => i + 1));
        for (let i = 0; i < count; i++) list.push(makePair(seq[i % seq.length], table));
      }
      return list;
    }
    case STAGE_TYPES.MATCHING: {
      const pairCount = Math.min(count, 6);
      const list = [];
      if (isFinal) {
        const usedTables = shuffle(TABLES).slice(0, pairCount);
        usedTables.forEach((t) => list.push(makePair(randInt(1, 10), t)));
      } else {
        const seq = shuffle([...Array(10)].map((_, i) => i + 1)).slice(0, pairCount);
        seq.forEach((n) => list.push(makePair(n, table)));
      }
      return list;
    }
    default:
      return [];
  }
}

/** Gera opções erradas plausíveis para escolha múltipla */
export function generateOptions(question, optionCount = 4) {
  const correct = question.answer;
  const distractors = new Set();
  const candidates = [
    correct + question.a,
    correct - question.a,
    correct + question.b,
    correct - question.b,
    (question.a + 1) * question.b,
    (question.a - 1) * question.b,
    question.a * (question.b + 1),
    question.a * (question.b - 1),
    correct + 1,
    correct - 1,
    correct + 10,
    correct - 10,
  ].filter((n) => n > 0 && n !== correct && n <= 121);

  const shuffledCandidates = shuffle(candidates);
  for (const c of shuffledCandidates) {
    if (distractors.size >= optionCount - 1) break;
    distractors.add(c);
  }
  // fallback caso não haja suficientes candidatos
  let guard = 0;
  while (distractors.size < optionCount - 1 && guard < 50) {
    const n = randInt(Math.max(1, correct - 12), correct + 12);
    if (n !== correct && n > 0) distractors.add(n);
    guard++;
  }

  const options = shuffle([correct, ...distractors]);
  return options;
}

export const STARS_THRESHOLDS = [0.6, 0.8, 1.0];

export function calcStars(correct, total) {
  if (total === 0) return 0;
  const ratio = correct / total;
  if (ratio >= STARS_THRESHOLDS[2]) return 3;
  if (ratio >= STARS_THRESHOLDS[1]) return 2;
  if (ratio >= STARS_THRESHOLDS[0]) return 1;
  return 0;
}
