// ---------- Persistência local (perfis, progresso) ----------
import { WORLDS, stagesForWorld, getWorld } from './data.js';

const KEY_PROFILES = 'td_profiles_v1';
const KEY_ACTIVE = 'td_active_profile_v1';
const KEY_PROGRESS_PREFIX = 'td_progress_v1_';
const KEY_ASSESSMENTS_PREFIX = 'td_assessments_v1_';
const KEY_REVIEW_PREFIX = 'td_review_v1_';
const KEY_PLACEMENTS_PREFIX = 'td_placements_v1_';
const MAX_ASSESSMENT_HISTORY = 50;
const MAX_PLACEMENT_HISTORY = 20;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // localStorage indisponível (modo privado, quota) — falha em silêncio
  }
  notifyChange();
}

// Quem quiser saber que os dados deste telemóvel mudaram (a sincronização
// com o Drive, por exemplo) regista-se aqui.
const changeListeners = [];

export function onLocalChange(cb) {
  changeListeners.push(cb);
}

function notifyChange() {
  changeListeners.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      // um ouvinte com erro não pode impedir o jogo de guardar
    }
  });
}

export function getProfiles() {
  return read(KEY_PROFILES, []);
}

export function createProfile(name, avatarId) {
  const profiles = getProfiles();
  const profile = {
    id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim().slice(0, 18) || 'Jogador',
    avatar: avatarId,
    createdAt: Date.now(),
  };
  profiles.push(profile);
  write(KEY_PROFILES, profiles);
  setActiveProfileId(profile.id);
  return profile;
}

export function deleteProfile(id) {
  const profiles = getProfiles().filter((p) => p.id !== id);
  write(KEY_PROFILES, profiles);
  localStorage.removeItem(KEY_PROGRESS_PREFIX + id);
  localStorage.removeItem(KEY_ASSESSMENTS_PREFIX + id);
  localStorage.removeItem(KEY_REVIEW_PREFIX + id);
  localStorage.removeItem(KEY_PLACEMENTS_PREFIX + id);
  notifyChange();
  if (getActiveProfileId() === id) {
    setActiveProfileId(profiles.length ? profiles[0].id : null);
  }
}

export function getProfile(id) {
  return getProfiles().find((p) => p.id === id) || null;
}

export function setActiveProfileId(id) {
  if (id) localStorage.setItem(KEY_ACTIVE, id);
  else localStorage.removeItem(KEY_ACTIVE);
  notifyChange();
}

export function getActiveProfileId() {
  return localStorage.getItem(KEY_ACTIVE);
}

function defaultProgress() {
  return { totalPoints: 0, worlds: {} };
}

export function getProgress(profileId) {
  return read(KEY_PROGRESS_PREFIX + profileId, defaultProgress());
}

function saveProgress(profileId, progress) {
  write(KEY_PROGRESS_PREFIX + profileId, progress);
}

function ensureWorld(progress, worldId) {
  if (!progress.worlds[worldId]) progress.worlds[worldId] = { stages: {} };
  return progress.worlds[worldId];
}

/**
 * Regista o resultado de um estágio. Guarda a melhor pontuação/estrelas.
 * Retorna { pointsAwarded, isNewBest, progress }
 */
export function saveStageResult(profileId, worldId, stageIndex, { stars, points, correct, total }) {
  const progress = getProgress(profileId);
  const world = ensureWorld(progress, worldId);
  const prev = world.stages[stageIndex];
  const isNewBest = !prev || stars > prev.stars;

  const pointsAwarded = points;
  progress.totalPoints = (progress.totalPoints || 0) + pointsAwarded;

  world.stages[stageIndex] = {
    stars: Math.max(stars, prev ? prev.stars : 0),
    bestPoints: Math.max(points, prev ? prev.bestPoints : 0),
    correct,
    total,
    completed: stars > 0 || (prev ? prev.completed : false),
    attempts: (prev ? prev.attempts : 0) + 1,
  };

  saveProgress(profileId, progress);
  return { pointsAwarded, isNewBest, progress };
}

export function getStageState(profileId, worldId, stageIndex) {
  const progress = getProgress(profileId);
  const world = progress.worlds[worldId];
  return (world && world.stages[stageIndex]) || null;
}

export function getWorldStars(profileId, worldId) {
  const progress = getProgress(profileId);
  const world = progress.worlds[worldId];
  const stages = stagesForWorld(getWorld(worldId));
  let stars = 0;
  for (let i = 0; i < stages.length; i++) {
    stars += (world && world.stages[i] && world.stages[i].stars) || 0;
  }
  return stars;
}

export function isWorldFullyStarred(profileId, worldId) {
  const stages = stagesForWorld(getWorld(worldId));
  const progress = getProgress(profileId);
  const world = progress.worlds[worldId];
  if (!world) return false;
  return stages.every((_, i) => world.stages[i] && world.stages[i].stars > 0);
}

// ---------- Estado de cada tabuada no mapa ----------
// Todas as tabuadas e todos os estágios estão abertos: a criança pratica o
// que quiser. O mapa só mostra em que ponto está cada uma.

export function hasAnyStars(profileId, worldId) {
  return getWorldStars(profileId, worldId) > 0;
}

/** Tabuadas que o teste de colocação mostrou que a criança já sabe. */
export function isWorldKnown(profileId, worldId) {
  const known = getProgress(profileId).knownTables;
  return !!(known && known[worldId]);
}

/** A primeira tabuada, por ordem, que não está feita nem já sabida. */
export function getNextWorldId(profileId) {
  const next = WORLDS.find((w) => !isWorldFullyStarred(profileId, w.id) && !isWorldKnown(profileId, w.id));
  return next ? next.id : null;
}

/** 'done' | 'known' | 'next' | 'started' | 'new' */
export function getWorldState(profileId, worldId) {
  if (isWorldFullyStarred(profileId, worldId)) return 'done';
  if (isWorldKnown(profileId, worldId)) return 'known';
  if (getNextWorldId(profileId) === worldId) return 'next';
  return hasAnyStars(profileId, worldId) ? 'started' : 'new';
}

/**
 * Aceitar o resultado do teste de colocação: estas tabuadas passam a contar
 * como sabidas. Só acrescenta — nunca tira nada que já lá estivesse.
 */
export function markTablesKnown(profileId, tables) {
  const progress = getProgress(profileId);
  progress.knownTables = progress.knownTables || {};
  const today = new Date().toISOString();
  tables.forEach((t) => {
    const id = String(t);
    if (!progress.knownTables[id]) progress.knownTables[id] = today;
  });
  saveProgress(profileId, progress);
}

/** O convite ao teste de colocação no mapa aparece uma só vez por jogador. */
export function isPlacementCardDismissed(profileId) {
  return !!getProgress(profileId).placementCardDismissed;
}

export function dismissPlacementCard(profileId) {
  const progress = getProgress(profileId);
  progress.placementCardDismissed = true;
  saveProgress(profileId, progress);
}

export function addBonusPoints(profileId, points) {
  const progress = getProgress(profileId);
  progress.totalPoints = (progress.totalPoints || 0) + points;
  saveProgress(profileId, progress);
  return progress.totalPoints;
}

export function getTotalPoints(profileId) {
  return getProgress(profileId).totalPoints || 0;
}

export function getTotalStars(profileId) {
  return WORLDS.reduce((sum, w) => sum + getWorldStars(profileId, w.id), 0);
}

export function isGameFullyComplete(profileId) {
  return WORLDS.every((w) => isWorldFullyStarred(profileId, w.id));
}

// ---------- Histórico do teste de avaliação ----------

export function getAssessments(profileId) {
  return read(KEY_ASSESSMENTS_PREFIX + profileId, []);
}

export function getAssessment(profileId, id) {
  return getAssessments(profileId).find((a) => a.id === id) || null;
}

export function saveAssessment(profileId, record) {
  const list = getAssessments(profileId);
  list.unshift(record);
  if (list.length > MAX_ASSESSMENT_HISTORY) list.length = MAX_ASSESSMENT_HISTORY;
  write(KEY_ASSESSMENTS_PREFIX + profileId, list);
  return record;
}

// ---------- Histórico do teste de colocação ----------
// Guarda todas as respostas com os tempos, para se poder ver mais tarde
// como a criança respondeu. Na interface nunca se mostram os tempos.

export function getPlacements(profileId) {
  return read(KEY_PLACEMENTS_PREFIX + profileId, []);
}

export function getPlacement(profileId, id) {
  return getPlacements(profileId).find((p) => p.id === id) || null;
}

export function savePlacement(profileId, record) {
  const list = getPlacements(profileId);
  list.unshift(record);
  if (list.length > MAX_PLACEMENT_HISTORY) list.length = MAX_PLACEMENT_HISTORY;
  write(KEY_PLACEMENTS_PREFIX + profileId, list);
  return record;
}

export function setPlacementAccepted(profileId, id, accepted) {
  const list = getPlacements(profileId);
  const record = list.find((p) => p.id === id);
  if (!record) return;
  record.accepted = accepted;
  write(KEY_PLACEMENTS_PREFIX + profileId, list);
}

// ---------- Revisão diária / sequência (streak) ----------

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateKeyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultReviewState() {
  return { lastCompletedDate: null, currentStreak: 0, longestStreak: 0, totalReviews: 0 };
}

export function getReviewState(profileId) {
  return read(KEY_REVIEW_PREFIX + profileId, defaultReviewState());
}

export function isReviewDoneToday(profileId) {
  return getReviewState(profileId).lastCompletedDate === todayKey();
}

/** Sequência a mostrar na interface: quebra visualmente se falhou mais do que um dia. */
export function getDisplayStreak(profileId) {
  const state = getReviewState(profileId);
  const today = todayKey();
  const yesterday = dateKeyOffset(-1);
  if (state.lastCompletedDate === today || state.lastCompletedDate === yesterday) {
    return state.currentStreak;
  }
  return 0;
}

export function recordReviewCompletion(profileId) {
  const state = getReviewState(profileId);
  const today = todayKey();
  const yesterday = dateKeyOffset(-1);
  if (state.lastCompletedDate === today) {
    // já contou hoje, não volta a incrementar
  } else if (state.lastCompletedDate === yesterday) {
    state.currentStreak += 1;
  } else {
    state.currentStreak = 1;
  }
  state.lastCompletedDate = today;
  state.longestStreak = Math.max(state.longestStreak || 0, state.currentStreak);
  state.totalReviews = (state.totalReviews || 0) + 1;
  write(KEY_REVIEW_PREFIX + profileId, state);
  return state;
}
