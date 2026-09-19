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

// ---------- Teste de Avaliação ----------
// Metodologia inspirada na Medição Baseada no Currículo (CBM) e nos modelos
// de "automaticidade" usados para avaliar fluência em factos matemáticos:
// cada resposta é classificada pela precisão E pelo tempo de resposta,
// não só pela precisão. Perguntas de todas as tabuadas são misturadas
// (prática intercalada), o que avalia melhor a memorização real do que
// perguntar tabuada a tabuada em sequência.

export const QUESTIONS_PER_TABLE_IN_ASSESSMENT = 2;

// Limiares de tempo de resposta (ms) para classificar o "à-vontade" da criança
export const FLUENCY_THRESHOLDS = {
  automatic: 3000,
  developing: 7000,
};

export const TIER_WEIGHT = {
  automatic: 1,
  developing: 0.7,
  slow: 0.4,
  incorrect: 0,
};

export const TIER_LABELS = {
  automatic: 'Sabe de cor',
  developing: 'Sabe, mas pensa',
  slow: 'Demorou muito',
  incorrect: 'Errou',
};

export function classifyAnswer(correct, elapsedMs) {
  if (!correct) return 'incorrect';
  if (elapsedMs <= FLUENCY_THRESHOLDS.automatic) return 'automatic';
  if (elapsedMs <= FLUENCY_THRESHOLDS.developing) return 'developing';
  return 'slow';
}

export const ASSESSMENT_LEVELS = [
  { min: 90, label: 'Mestre da Tabuada', emoji: '🏆' },
  { min: 75, label: 'Confiante', emoji: '💪' },
  { min: 55, label: 'Em Progresso', emoji: '🌱' },
  { min: 35, label: 'A Aprender', emoji: '📘' },
  { min: 0, label: 'A Começar', emoji: '🐣' },
];

export function getLevelForScore(score) {
  return ASSESSMENT_LEVELS.find((l) => score >= l.min) || ASSESSMENT_LEVELS[ASSESSMENT_LEVELS.length - 1];
}

export const TABLE_STATUS_LABELS = {
  forte: 'Forte',
  media: 'Razoável',
  fraca: 'A praticar',
};

/**
 * Gera as perguntas do teste de avaliação: 2 perguntas por tabuada (1 a 10),
 * com multiplicandos aleatórios, todas misturadas (prática intercalada).
 * Cada pergunta guarda também `table` para depois agrupar os resultados.
 */
export function generateAssessmentQuestions() {
  const list = [];
  TABLES.forEach((table) => {
    const ns = shuffle([...Array(10)].map((_, i) => i + 1)).slice(0, QUESTIONS_PER_TABLE_IN_ASSESSMENT);
    ns.forEach((n) => list.push({ a: n, b: table, answer: n * table, table }));
  });
  return shuffle(list);
}

/**
 * A partir das respostas dadas (com correct/elapsedMs/tier já calculados),
 * constrói o relatório: pontuação geral, nível, e desempenho por tabuada.
 */
export function buildAssessmentReport(answers) {
  const total = answers.length;
  const correctCount = answers.filter((a) => a.correct).length;
  const weightSum = answers.reduce((s, a) => s + TIER_WEIGHT[a.tier], 0);
  const score = total > 0 ? Math.round((weightSum / total) * 100) : 0;
  const level = getLevelForScore(score);

  const byTable = {};
  TABLES.forEach((t) => { byTable[t] = { total: 0, correct: 0, weightSum: 0, totalTimeMs: 0 }; });
  answers.forEach((a) => {
    const bucket = byTable[a.table];
    if (!bucket) return;
    bucket.total++;
    if (a.correct) bucket.correct++;
    bucket.weightSum += TIER_WEIGHT[a.tier];
    bucket.totalTimeMs += a.elapsedMs;
  });

  const tableStats = TABLES.filter((t) => byTable[t].total > 0).map((t) => {
    const b = byTable[t];
    const ratio = b.weightSum / b.total;
    let status;
    if (ratio >= 0.85) status = 'forte';
    else if (ratio >= 0.5) status = 'media';
    else status = 'fraca';
    return {
      table: t,
      correct: b.correct,
      total: b.total,
      avgTimeMs: Math.round(b.totalTimeMs / b.total),
      ratio,
      status,
    };
  });

  const strong = [...tableStats].filter((t) => t.status === 'forte')
    .sort((a, b) => b.ratio - a.ratio).slice(0, 4).map((t) => t.table);
  const weak = [...tableStats].filter((t) => t.status !== 'forte')
    .sort((a, b) => a.ratio - b.ratio).slice(0, 4).map((t) => t.table);

  return { total, correctCount, score, level, tableStats, strong, weak };
}

/**
 * A partir de um relatório, sugere em que tabuada a criança deveria
 * continuar a praticar: a primeira (mais baixa) que ainda não está
 * "forte" — como um teste de nivelamento, para não deixar buracos.
 * Se estiver tudo forte, sugere o Desafio Final.
 */
export function suggestPlacementWorld(report) {
  if (!report || !report.tableStats || report.tableStats.length === 0) return null;
  const gap = report.tableStats.find((t) => t.status !== 'forte');
  if (gap) return String(gap.table);
  return FINAL_WORLD_ID;
}

/**
 * Gera perguntas para a Revisão Diária: mistura de tabuadas já
 * desbloqueadas, com preferência (60%) pelas tabuadas indicadas como
 * mais fracas (por exemplo, vindas do último teste de avaliação).
 */
export function generateReviewQuestions(availableTables, priorityTables = [], count = 10) {
  const pool = availableTables && availableTables.length ? availableTables : [1];
  const priority = priorityTables.filter((t) => pool.includes(t));
  const list = [];
  for (let i = 0; i < count; i++) {
    const usePriority = priority.length > 0 && Math.random() < 0.6;
    const table = usePriority ? priority[randInt(0, priority.length - 1)] : pool[randInt(0, pool.length - 1)];
    const n = randInt(1, 10);
    list.push({ a: n, b: table, answer: n * table, table });
  }
  return list;
}
