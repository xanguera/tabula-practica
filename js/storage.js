// ---------- Persistência local (perfis, progresso) ----------
import { WORLDS, worldIndex, stagesForWorld, getWorld } from './data.js';

const KEY_PROFILES = 'td_profiles_v1';
const KEY_ACTIVE = 'td_active_profile_v1';
const KEY_PROGRESS_PREFIX = 'td_progress_v1_';

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

export function isWorldUnlocked(profileId, worldId) {
  const idx = worldIndex(worldId);
  if (idx === 0) return true;
  const prevWorld = WORLDS[idx - 1];
  return isWorldFullyStarred(profileId, prevWorld.id);
}

export function isStageUnlocked(profileId, worldId, stageIndex) {
  if (!isWorldUnlocked(profileId, worldId)) return false;
  if (stageIndex === 0) return true;
  const state = getStageState(profileId, worldId, stageIndex - 1);
  return !!(state && state.stars > 0);
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
