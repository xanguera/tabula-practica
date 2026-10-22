import {
  AVATARS, getAvatar, WORLDS, getWorld, stagesForWorld,
  generateQuestions, calcStars, generateAssessmentQuestions, buildAssessmentReport,
  TABLE_STATUS_LABELS, generateReviewQuestions,
} from './data.js';
import * as store from './storage.js';
import { runStage, renderTypeQuestion } from './exercises.js';
import { createPlacement, nextQuestion, recordAnswer, getResult } from './placement.js';
import { runAssessment } from './assessment.js';
import { runReview } from './review.js';
import { shareReport, formatDuration } from './report.js';
import { celebrate } from './confetti.js';
import { playFanfare, playClick, unlockAudio } from './audio.js';
import * as cloud from './cloud-sync.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// Guarda o último resultado de estágio para passar para o ecrã de resultado
let lastResult = null;
let pendingCreateAvatar = AVATARS[0].id;

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

document.addEventListener('click', () => unlockAudio(), { once: true, capture: true });
document.addEventListener('touchstart', () => unlockAudio(), { once: true, capture: true });

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', boot);

function boot() {
  if (!location.hash) {
    const activeId = store.getActiveProfileId();
    const profile = activeId && store.getProfile(activeId);
    location.hash = profile ? '#/map' : '#/profiles';
  } else {
    render();
  }
  registerServiceWorker();
  startCloudSync();
}

// ---------- Sincronização automática com o Google Drive ----------

function isSafeToReplaceData() {
  const parts = parseRoute();
  if (parts[0] === 'stage') return false;
  if (parts[0] === 'assessment' && parts[1] === 'run') return false;
  if (parts[0] === 'placement' && parts[1] !== 'result') return false;
  if (parts[0] === 'review' && parts[1] === 'run') return false;
  return true;
}

function startCloudSync() {
  // A meio de uma ronda não deixamos a nuvem substituir os dados locais.
  cloud.setApplyGuard(isSafeToReplaceData);

  cloud.subscribe((event) => {
    if (event.type === 'data-replaced') {
      showToast('Dados atualizados a partir do Google ☁️');
      render();
      return;
    }
    // O ecrã da nuvem mostra o estado todo; nos outros só muda o botão da
    // conta no canto, por isso trocamos apenas esse.
    if (parseRoute()[0] === 'cloud') renderCloud();
    else refreshAccountButtons();
  });

  cloud.init();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  return parts;
}

function requireActiveProfile() {
  const id = store.getActiveProfileId();
  const profile = id && store.getProfile(id);
  if (!profile) {
    location.hash = '#/profiles';
    return null;
  }
  return profile;
}

function render() {
  const parts = parseRoute();
  const route = parts[0] || 'profiles';

  if (route === 'profiles') return renderProfileSelect();
  if (route === 'create') return renderCreateProfile();
  if (route === 'map') return renderMap();
  if (route === 'world') return renderStageList(parts[1]);
  if (route === 'stage') return renderGameplay(parts[1], Number(parts[2]));
  if (route === 'result') return renderResult();
  if (route === 'tests') return renderTestsHub();
  if (route === 'placement') {
    if (parts[1] === 'result') return renderPlacementResult(parts[2]);
    return renderPlacementRun();
  }
  if (route === 'assessment') {
    if (parts[1] === 'run') return renderAssessmentRun();
    if (parts[1] === 'report') return renderAssessmentReport(parts[2]);
    return renderAssessmentHub();
  }
  if (route === 'review') {
    if (parts[1] === 'run') return renderReviewRun();
    return renderReviewHub();
  }
  if (route === 'cloud') return renderCloud();

  location.hash = '#/profiles';
}

function clearApp() {
  app.innerHTML = '';
}

function makeEl(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ---------- Botão da conta Google (canto superior direito) ----------

function cloudNeedsAttention() {
  return cloud.getStatus() === 'reconnect' || cloud.hasPendingConflict();
}

/**
 * "G" antes de ligar; a fotografia da conta depois (ou a inicial do nome,
 * se a fotografia não carregar, por exemplo sem internet). Um ponto de
 * aviso quando a ligação precisa de atenção. Leva sempre ao ecrã da nuvem.
 */
function accountButton() {
  const btn = makeEl('button', 'account-btn');
  btn.setAttribute('aria-label', 'Conta Google');
  if (!cloud.isConfigured()) btn.hidden = true;

  const account = cloud.getAccount();
  if (account && account.picture) {
    const img = document.createElement('img');
    img.src = account.picture;
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      btn.textContent = (account.name || '?').charAt(0).toUpperCase();
    });
    btn.appendChild(img);
  } else if (cloud.isEnabled()) {
    btn.textContent = account && account.name ? account.name.charAt(0).toUpperCase() : '☁️';
  } else {
    btn.classList.add('signed-out');
    btn.textContent = 'G';
  }

  if (cloudNeedsAttention()) btn.appendChild(makeEl('span', 'account-alert'));
  btn.addEventListener('click', () => navigate('#/cloud'));
  return btn;
}

function refreshAccountButtons() {
  document.querySelectorAll('.account-btn').forEach((old) => old.replaceWith(accountButton()));
}

function avatarBadge(avatarId, sizeClass) {
  const a = getAvatar(avatarId);
  const badge = makeEl('div', `avatar-badge ${sizeClass || ''}`, a.emoji);
  badge.style.background = a.color + '33';
  return badge;
}

// ---------- Ecrã: seleção de perfil ----------

function renderProfileSelect() {
  clearApp();
  const screen = makeEl('div', 'screen');

  const topbar = makeEl('div', 'topbar');
  topbar.appendChild(makeEl('div'));
  topbar.appendChild(accountButton());
  screen.appendChild(topbar);

  screen.appendChild(makeEl('div', 'mascot', '✖️✨'));
  screen.appendChild(makeEl('h1', 'title-hero', 'Tabuada<br>Divertida'));
  screen.appendChild(makeEl('p', 'subtitle', 'Quem vai jogar hoje?'));

  const grid = makeEl('div', 'profile-grid');
  const profiles = store.getProfiles();

  profiles.forEach((p) => {
    const card = makeEl('div', 'profile-card');
    card.appendChild(avatarBadge(p.avatar));
    card.appendChild(makeEl('div', 'name', escapeHtml(p.name)));
    const pts = store.getTotalPoints(p.id);
    card.appendChild(makeEl('div', 'sub', `⭐ ${pts} pontos`));

    const delBtn = makeEl('div', 'delete-x', '✕');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Apagar o jogador "${p.name}"? Isto apaga também o progresso.`)) {
        store.deleteProfile(p.id);
        renderProfileSelect();
      }
    });
    card.appendChild(delBtn);

    card.addEventListener('click', () => {
      playClick();
      store.setActiveProfileId(p.id);
      navigate('#/map');
    });
    grid.appendChild(card);
  });

  const addCard = makeEl('div', 'profile-card add');
  addCard.appendChild(makeEl('div', 'plus', '+'));
  addCard.appendChild(makeEl('div', 'name', 'Novo Jogador'));
  addCard.addEventListener('click', () => navigate('#/create'));
  grid.appendChild(addCard);

  screen.appendChild(grid);

  // Depois de ligada, a conta vive no botão do canto. Antes disso, este
  // botão grande é o convite para guardar online.
  if (cloud.isConfigured() && !cloud.isEnabled()) {
    const cloudBtn = makeEl('button', 'btn secondary block cloud-entry', '☁️ Guardar dados online');
    cloudBtn.addEventListener('click', () => navigate('#/cloud'));
    screen.appendChild(cloudBtn);
  }

  app.appendChild(screen);
}

// ---------- Ecrã: criar perfil ----------

function renderCreateProfile() {
  clearApp();
  pendingCreateAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)].id;

  const screen = makeEl('div', 'screen');

  const topbar = makeEl('div', 'topbar');
  const back = makeEl('button', 'icon-btn', '←');
  back.addEventListener('click', () => navigate('#/profiles'));
  topbar.appendChild(back);
  topbar.appendChild(makeEl('div'));
  screen.appendChild(topbar);

  screen.appendChild(makeEl('h2', 'title-hero', 'Cria o teu jogador'));
  screen.appendChild(makeEl('p', 'subtitle', 'Escolhe um avatar e escreve o teu nome'));

  const preview = makeEl('div', 'mascot');
  preview.appendChild(avatarBadge(pendingCreateAvatar));
  preview.style.display = 'flex';
  preview.style.justifyContent = 'center';
  preview.querySelector('.avatar-badge').style.width = '84px';
  preview.querySelector('.avatar-badge').style.height = '84px';
  preview.querySelector('.avatar-badge').style.fontSize = '2.8rem';
  screen.appendChild(preview);

  const grid = makeEl('div', 'avatar-grid');
  const optionEls = [];
  AVATARS.forEach((a) => {
    const opt = makeEl('div', 'avatar-option', a.emoji);
    opt.style.background = a.color + '33';
    if (a.id === pendingCreateAvatar) opt.classList.add('selected');
    opt.addEventListener('click', () => {
      pendingCreateAvatar = a.id;
      optionEls.forEach((o) => o.el.classList.toggle('selected', o.id === a.id));
      const badge = preview.querySelector('.avatar-badge');
      badge.textContent = a.emoji;
      badge.style.background = a.color + '33';
      playClick();
    });
    optionEls.push({ id: a.id, el: opt });
    grid.appendChild(opt);
  });
  screen.appendChild(grid);

  const input = makeEl('input', 'name-input');
  input.type = 'text';
  input.maxLength = 18;
  input.placeholder = 'O teu nome';
  input.autocomplete = 'off';
  screen.appendChild(input);

  const btnRow = makeEl('div', 'btn-row');
  const startBtn = makeEl('button', 'btn primary block', 'Vamos começar! 🚀');
  startBtn.addEventListener('click', () => {
    const name = input.value.trim() || 'Jogador';
    store.createProfile(name, pendingCreateAvatar);
    playFanfare();
    navigate('#/map');
  });
  btnRow.appendChild(startBtn);
  screen.appendChild(btnRow);

  app.appendChild(screen);
  setTimeout(() => input.focus({ preventScroll: true }), 50);
}

// ---------- Topbar reutilizável ----------

function buildTopbar(profile, { showBack, onBack, showHome = true, inRound = false } = {}) {
  const topbar = makeEl('div', 'topbar');

  const navGroup = makeEl('div', 'topbar-nav');
  if (showBack) {
    const back = makeEl('button', 'icon-btn', '←');
    back.addEventListener('click', onBack);
    navGroup.appendChild(back);
  }
  if (showHome) {
    const home = makeEl('button', 'icon-btn', '🏠');
    home.addEventListener('click', () => navigate('#/map'));
    navGroup.appendChild(home);
  }
  topbar.appendChild(navGroup);

  // Fora de uma ronda, o jogador leva à escolha de jogador. A meio de uma
  // ronda nem este nem o botão da conta reagem: um toque tirava a criança
  // do jogo.
  const left = makeEl(inRound ? 'div' : 'button', 'player-chip');
  left.appendChild(avatarBadge(profile.avatar));
  left.appendChild(makeEl('div', 'name', escapeHtml(profile.name)));
  if (!inRound) {
    left.setAttribute('aria-label', 'Trocar de jogador');
    left.addEventListener('click', () => navigate('#/profiles'));
  }
  topbar.appendChild(left);

  const right = makeEl('div', 'topbar-right');
  const streak = store.getDisplayStreak(profile.id);
  right.appendChild(makeEl('div', `streak-chip ${streak > 0 ? 'active' : ''}`, `🔥 ${streak}`));
  right.appendChild(makeEl('div', 'points-chip', `⭐ ${store.getTotalPoints(profile.id)}`));
  if (!inRound) right.appendChild(accountButton());
  topbar.appendChild(right);

  return topbar;
}

function addFloatingHome(screen) {
  const home = makeEl('button', 'icon-btn floating-home', '🏠');
  home.addEventListener('click', () => navigate('#/map'));
  screen.appendChild(home);
}

// ---------- Ecrã: mapa de mundos ----------

function renderMap() {
  const profile = requireActiveProfile();
  if (!profile) return;
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, { showHome: false }));

  screen.appendChild(makeEl('h2', 'title-hero', 'O teu percurso'));
  screen.appendChild(makeEl('p', 'subtitle', 'Escolhe uma tabuada e pratica!'));

  // Convite ao teste de colocação: só para quem ainda não começou e nunca
  // o fez, e só até dizer "agora não".
  const isNewPlayer = WORLDS.every((w) => !store.hasAnyStars(profile.id, w.id));
  if (isNewPlayer && !store.getPlacements(profile.id).length && !store.isPlacementCardDismissed(profile.id)) {
    const card = makeEl('div', 'placement-card');
    card.appendChild(makeEl('p', 'placement-text', 'Já sabes alguma tabuada? Descobre onde começar 🎯'));
    const row = makeEl('div', 'btn-row');
    const go = makeEl('button', 'btn primary', 'Fazer o teste');
    go.addEventListener('click', () => {
      playClick();
      navigate('#/placement/run');
    });
    const later = makeEl('button', 'btn secondary', 'Agora não');
    later.addEventListener('click', () => {
      store.dismissPlacementCard(profile.id);
      card.remove();
    });
    row.appendChild(go);
    row.appendChild(later);
    card.appendChild(row);
    screen.appendChild(card);
  }

  const streak = store.getDisplayStreak(profile.id);
  const reviewBtn = makeEl('button', 'btn review-entry block', `🔁 Revisão Diária${streak > 0 ? ` · 🔥${streak}` : ''}`);
  reviewBtn.addEventListener('click', () => {
    playClick();
    navigate('#/review');
  });
  screen.appendChild(reviewBtn);

  const testsBtn = makeEl('button', 'btn assessment-entry block', '📋 Testes');
  testsBtn.addEventListener('click', () => {
    playClick();
    navigate('#/tests');
  });
  screen.appendChild(testsBtn);

  const scroll = makeEl('div', 'map-scroll');
  const path = makeEl('div', 'map-path');

  // Tudo está aberto. Cada tabuada mostra só em que ponto está: feita (✓),
  // já sabida pelo teste de colocação (🎯), a próxima, ou por fazer.
  const BADGES = { done: '✓', known: '🎯' };
  const nextId = store.getNextWorldId(profile.id);

  WORLDS.forEach((world, i) => {
    const state = store.getWorldState(profile.id, world.id);
    const stars = store.getWorldStars(profile.id, world.id);
    const maxStars = stagesForWorld(world).length * 3;

    const wrap = makeEl('div', 'world-node-wrap');
    const node = makeEl('div', `world-node state-${state} ${world.isFinal ? 'final' : ''}`);
    node.appendChild(makeEl('div', '', world.isFinal ? '🏆' : String(world.table)));
    if (!world.isFinal) node.appendChild(makeEl('div', 'table-label', `× ${world.table}`));
    if (BADGES[state]) node.appendChild(makeEl('span', 'world-badge', BADGES[state]));
    node.dataset.id = world.id;
    node.addEventListener('click', () => {
      playClick();
      navigate(`#/world/${world.id}`);
    });
    wrap.appendChild(node);

    const starsRow = makeEl('div', 'world-stars');
    const filledCount = maxStars > 0 ? Math.round((stars / maxStars) * 3) : 0;
    for (let s = 0; s < 3; s++) {
      starsRow.appendChild(makeEl('span', `star ${s < filledCount ? 'on' : ''}`, '★'));
    }
    wrap.appendChild(starsRow);

    path.appendChild(wrap);
    if (i < WORLDS.length - 1) {
      path.appendChild(makeEl('div', 'connector'));
    }
  });

  scroll.appendChild(path);
  screen.appendChild(scroll);
  app.appendChild(screen);

  const targetId = nextId || WORLDS[0].id;
  requestAnimationFrame(() => {
    const targetEl = path.querySelector(`.world-node[data-id="${targetId}"]`);
    if (targetEl) targetEl.scrollIntoView({ block: 'center' });
  });
}

// ---------- Ecrã: lista de estágios de um mundo ----------

function renderStageList(worldId) {
  const profile = requireActiveProfile();
  if (!profile) return;
  const world = getWorld(worldId);
  if (!world) { navigate('#/map'); return; }
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/map'),
  }));

  screen.appendChild(makeEl('h2', 'title-hero', world.isFinal ? '🏆 Desafio Final' : `Tabuada do ${world.table}`));
  screen.appendChild(makeEl('p', 'subtitle', world.isFinal ? 'Mistura de todas as tabuadas' : 'Escolhe um exercício'));

  const list = makeEl('div', 'stage-list');
  const stages = stagesForWorld(world);
  stages.forEach((stageDef, index) => {
    const state = store.getStageState(profile.id, world.id, index);
    const done = !!(state && state.stars > 0);
    const card = makeEl('div', `stage-card ${done ? 'done' : ''}`);
    const icon = makeEl('div', 'stage-icon', stageDef.icon);
    if (done) icon.appendChild(makeEl('span', 'stage-done', '✓'));
    card.appendChild(icon);
    const info = makeEl('div', 'stage-info');
    info.appendChild(makeEl('div', 'stage-name', stageDef.name));
    info.appendChild(makeEl('div', 'stage-desc', stageDef.desc));
    card.appendChild(info);

    const starsRow = makeEl('div', 'world-stars');
    const earned = state ? state.stars : 0;
    for (let s = 0; s < 3; s++) {
      starsRow.appendChild(makeEl('span', `star ${s < earned ? 'on' : ''}`, '★'));
    }
    card.appendChild(starsRow);

    card.addEventListener('click', () => {
      playClick();
      navigate(`#/stage/${world.id}/${index}`);
    });
    list.appendChild(card);
  });

  screen.appendChild(list);
  app.appendChild(screen);
}

// ---------- Ecrã: jogo (exercício em curso) ----------

function renderGameplay(worldId, stageIndex) {
  const profile = requireActiveProfile();
  if (!profile) return;
  const world = getWorld(worldId);
  if (!world) { navigate('#/map'); return; }
  const stageDef = stagesForWorld(world)[stageIndex];
  if (!stageDef) { navigate(`#/world/${worldId}`); return; }
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate(`#/world/${world.id}`),
    inRound: true,
  }));

  const progressTrack = makeEl('div', 'progress-bar-track');
  const progressFill = makeEl('div', 'progress-bar-fill');
  progressFill.style.width = '0%';
  progressTrack.appendChild(progressFill);
  screen.appendChild(progressTrack);

  const content = makeEl('div', 'exercise-content');
  screen.appendChild(content);
  app.appendChild(screen);

  const questionCount = stageDef.type === 'matching' ? 6 : 8;
  const questions = generateQuestions(world, stageDef, questionCount);

  runStage(content, world, stageDef, questions, {
    onQuestionResult: ({ index, total }) => {
      const pct = Math.min(100, ((index + 1) / total) * 100);
      progressFill.style.width = `${pct}%`;
    },
    onStageComplete: ({ correct, total, points }) => {
      const stars = calcStars(correct, total);
      const { pointsAwarded } = store.saveStageResult(profile.id, world.id, stageIndex, {
        stars, points, correct, total,
      });
      const wasFullyStarred = store.isWorldFullyStarred(profile.id, world.id);
      lastResult = {
        worldId: world.id, stageIndex, stars, points: pointsAwarded, correct, total,
        worldTitle: world.isFinal ? 'Desafio Final' : `Tabuada do ${world.table}`,
        worldJustCompleted: wasFullyStarred,
        gameFullyComplete: store.isGameFullyComplete(profile.id),
      };
      navigate('#/result');
    },
  });
}

// ---------- Ecrã: resultado ----------

function renderResult() {
  const profile = requireActiveProfile();
  if (!profile) return;
  if (!lastResult) { navigate('#/map'); return; }
  clearApp();

  const { stars, points, correct, total, worldId, stageIndex, worldTitle, worldJustCompleted, gameFullyComplete } = lastResult;

  const screen = makeEl('div', 'result-screen');
  addFloatingHome(screen);

  const messages3 = ['Perfeito! 🌟', 'Incrível! 🎉', 'És um génio da matemática!'];
  const messages2 = ['Muito bem! 👏', 'Boa! Quase perfeito!'];
  const messages1 = ['Conseguiste! 💪', 'Continua assim!'];
  const messages0 = ['Vamos tentar outra vez? 🙂', 'Quase lá, tenta de novo!'];

  let message;
  if (stars === 3) message = messages3[Math.floor(Math.random() * messages3.length)];
  else if (stars === 2) message = messages2[Math.floor(Math.random() * messages2.length)];
  else if (stars === 1) message = messages1[Math.floor(Math.random() * messages1.length)];
  else message = messages0[Math.floor(Math.random() * messages0.length)];

  screen.appendChild(makeEl('div', 'mascot', stars > 0 ? '🎉' : '🙂'));
  screen.appendChild(makeEl('h2', 'title-hero', worldTitle));

  const starsRow = makeEl('div', 'result-stars');
  for (let i = 0; i < 3; i++) {
    starsRow.appendChild(makeEl('span', `star ${i < stars ? 'earned' : ''}`, '★'));
  }
  screen.appendChild(starsRow);

  screen.appendChild(makeEl('div', 'result-message', message));
  screen.appendChild(makeEl('div', 'result-sub', `${correct} de ${total} certas`));
  screen.appendChild(makeEl('div', 'result-points', `+${points} pontos`));

  if (gameFullyComplete) {
    screen.appendChild(makeEl('div', 'result-sub', '🏆 Completaste TODA a tabuada! És um campeão! 🏆'));
  } else if (worldJustCompleted) {
    screen.appendChild(makeEl('div', 'result-sub', '🎊 Tabuada completa! 🎊'));
  }

  const btnRow = makeEl('div', 'btn-row');
  btnRow.style.marginTop = '24px';
  btnRow.style.flexDirection = 'column';
  btnRow.style.width = '100%';

  const continueBtn = makeEl('button', 'btn primary block', 'Continuar');
  continueBtn.addEventListener('click', () => {
    lastResult = null;
    navigate(`#/world/${worldId}`);
  });
  btnRow.appendChild(continueBtn);

  if (stars < 3) {
    const retryBtn = makeEl('button', 'btn secondary block', 'Tentar outra vez');
    retryBtn.style.marginTop = '10px';
    retryBtn.addEventListener('click', () => {
      lastResult = null;
      navigate(`#/stage/${worldId}/${stageIndex}`);
    });
    btnRow.appendChild(retryBtn);
  }

  screen.appendChild(btnRow);
  app.appendChild(screen);

  if (stars > 0) {
    playFanfare();
    celebrate(gameFullyComplete ? 'grand' : worldJustCompleted ? 'world' : 'stage');
  }
}

// ---------- Ecrã: hub do teste de avaliação (início + histórico) ----------

function renderAssessmentHub() {
  const profile = requireActiveProfile();
  if (!profile) return;
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/tests'),
  }));

  screen.appendChild(makeEl('div', 'mascot', '🧪'));
  screen.appendChild(makeEl('h2', 'title-hero', 'Teste de Avaliação'));
  screen.appendChild(makeEl('p', 'subtitle', 'Descobre em que tabuadas já és um crack e onde vale a pena praticar mais. Responde com calma, no teu ritmo — não há relógio à vista!'));

  const startBtn = makeEl('button', 'btn primary block', 'Começar Teste 🚀');
  startBtn.style.marginTop = '18px';
  startBtn.addEventListener('click', () => {
    playClick();
    navigate('#/assessment/run');
  });
  screen.appendChild(startBtn);

  const history = store.getAssessments(profile.id);

  screen.appendChild(makeEl('h3', 'section-title', 'Histórico'));

  if (history.length === 0) {
    screen.appendChild(makeEl('p', 'subtitle', 'Ainda não fizeste nenhum teste. Experimenta agora!'));
  } else {
    const list = makeEl('div', 'history-list');
    history.forEach((record) => {
      const item = makeEl('div', 'history-card');
      const dateStr = new Date(record.dateISO).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
      item.appendChild(makeEl('div', 'history-emoji', record.level.emoji));
      const info = makeEl('div', 'history-info');
      info.appendChild(makeEl('div', 'history-date', dateStr));
      info.appendChild(makeEl('div', 'history-level', record.level.label));
      item.appendChild(info);
      item.appendChild(makeEl('div', 'history-score', String(record.score)));
      item.addEventListener('click', () => {
        playClick();
        navigate(`#/assessment/report/${record.id}`);
      });
      list.appendChild(item);
    });
    screen.appendChild(list);
  }

  app.appendChild(screen);
}

// ---------- Ecrã: Testes (colocação e avaliação) ----------

function renderTestsHub() {
  const profile = requireActiveProfile();
  if (!profile) return;
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/map'),
  }));

  screen.appendChild(makeEl('div', 'mascot', '📋'));
  screen.appendChild(makeEl('h2', 'title-hero', 'Testes'));

  const list = makeEl('div', 'stage-list');
  const tests = [
    {
      icon: '🎯',
      name: 'Onde começo?',
      desc: 'Poucas perguntas para descobrir em que tabuada começar.',
      hash: '#/placement/run',
    },
    {
      icon: '🧪',
      name: 'Teste de Avaliação',
      desc: 'Vê em que tabuadas já és um crack e acompanha o progresso.',
      hash: '#/assessment',
    },
  ];
  tests.forEach((t) => {
    const card = makeEl('div', 'stage-card');
    card.appendChild(makeEl('div', 'stage-icon', t.icon));
    const info = makeEl('div', 'stage-info');
    info.appendChild(makeEl('div', 'stage-name', t.name));
    info.appendChild(makeEl('div', 'stage-desc', t.desc));
    card.appendChild(info);
    card.addEventListener('click', () => {
      playClick();
      navigate(t.hash);
    });
    list.appendChild(card);
  });
  screen.appendChild(list);

  app.appendChild(screen);
}

// ---------- Ecrã: teste de colocação em curso ----------
// Perguntas uma a uma, sem relógio à vista. O tempo de cada resposta é
// medido e guardado em segundo plano (ver placement.js).

function renderPlacementRun() {
  const profile = requireActiveProfile();
  if (!profile) return;
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/tests'),
    inRound: true,
  }));

  screen.appendChild(makeEl('h2', 'title-hero', '🎯 Onde começo?'));
  const hint = makeEl('p', 'question-hint center-text', '');
  screen.appendChild(hint);
  const content = makeEl('div', 'exercise-content');
  screen.appendChild(content);
  app.appendChild(screen);

  const state = createPlacement();

  function ask() {
    // Se a criança saiu do teste a meio, não continuamos a desenhar.
    if (!app.contains(content)) return;
    const q = nextQuestion(state);
    if (!q) {
      finish();
      return;
    }
    hint.textContent = q.warmup
      ? 'Primeiro, uma fácil para aquecer!'
      : 'Sem pressa, escreve a resposta que achares certa.';
    renderTypeQuestion(content, q, false, (result) => {
      recordAnswer(state, q, result);
      setTimeout(ask, 500);
    });
  }

  function finish() {
    const result = getResult(state);
    const record = {
      id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      dateISO: new Date().toISOString(),
      startTable: result.startTable,
      allKnown: result.allKnown,
      knownTables: result.knownTables,
      accepted: null,
      typingAllowanceMs: state.typingAllowanceMs,
      stopReason: state.stopReason,
      answers: state.answers,
    };
    store.savePlacement(profile.id, record);
    navigate(`#/placement/result/${record.id}`);
  }

  ask();
}

// ---------- Ecrã: resultado do teste de colocação ----------

function renderPlacementResult(id) {
  const profile = requireActiveProfile();
  if (!profile) return;
  const record = store.getPlacement(profile.id, id);
  if (!record) { navigate('#/tests'); return; }
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/map'),
  }));

  const btnRow = makeEl('div', 'btn-row');
  btnRow.style.flexDirection = 'column';
  btnRow.style.width = '100%';
  btnRow.style.marginTop = '20px';

  if (record.allKnown) {
    screen.appendChild(makeEl('div', 'mascot', '🏆'));
    screen.appendChild(makeEl('h2', 'title-hero', 'Já sabes todas!'));
    screen.appendChild(makeEl('p', 'subtitle', 'Experimenta o Desafio Final, que mistura todas as tabuadas.'));
    const finalBtn = makeEl('button', 'btn primary block', 'Ir para o Desafio Final 🚀');
    finalBtn.addEventListener('click', () => {
      playClick();
      navigate('#/world/final');
    });
    btnRow.appendChild(finalBtn);
  } else {
    const n = record.startTable;
    screen.appendChild(makeEl('div', 'mascot', '🎯'));
    screen.appendChild(makeEl('h2', 'title-hero', `Recomendamos começar na tabuada do ${n}`));
    screen.appendChild(makeEl('p', 'subtitle', n > 1
      ? `Muito bem! As tabuadas do 1 ao ${n - 1} já estão no papo.`
      : 'Vamos aprender juntos, desde o início!'));

    if (record.accepted === null) {
      const yesBtn = makeEl('button', 'btn primary block', n > 1 ? 'Sim, saltar para lá! 🚀' : 'Começar na tabuada do 1 🚀');
      yesBtn.addEventListener('click', () => {
        store.markTablesKnown(profile.id, record.knownTables);
        store.setPlacementAccepted(profile.id, record.id, true);
        playFanfare();
        navigate(`#/world/${n}`);
      });
      btnRow.appendChild(yesBtn);

      const noBtn = makeEl('button', 'btn secondary block', 'Não, obrigado');
      noBtn.style.marginTop = '10px';
      noBtn.addEventListener('click', () => {
        store.setPlacementAccepted(profile.id, record.id, false);
        navigate('#/map');
      });
      btnRow.appendChild(noBtn);
    } else {
      const goBtn = makeEl('button', 'btn primary block', `Ir para a tabuada do ${n}`);
      goBtn.addEventListener('click', () => {
        playClick();
        navigate(`#/world/${n}`);
      });
      btnRow.appendChild(goBtn);
    }
  }

  const mapBtn = makeEl('button', 'btn secondary block', 'Voltar ao mapa');
  mapBtn.style.marginTop = '10px';
  mapBtn.addEventListener('click', () => navigate('#/map'));
  if (record.allKnown || record.accepted !== null) btnRow.appendChild(mapBtn);

  screen.appendChild(btnRow);
  app.appendChild(screen);
}

// ---------- Ecrã: teste de avaliação em curso ----------

function renderAssessmentRun() {
  const profile = requireActiveProfile();
  if (!profile) return;
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/assessment'),
    inRound: true,
  }));

  const progressTrack = makeEl('div', 'progress-bar-track');
  const progressFill = makeEl('div', 'progress-bar-fill');
  progressFill.style.width = '0%';
  progressTrack.appendChild(progressFill);
  screen.appendChild(progressTrack);
  screen.appendChild(makeEl('p', 'question-hint center-text', 'Sem pressa, escreve a resposta que achares certa.'));

  const content = makeEl('div', 'exercise-content');
  screen.appendChild(content);
  app.appendChild(screen);

  const questions = generateAssessmentQuestions();

  runAssessment(content, questions, {
    onProgress: ({ index, total }) => {
      const pct = (index / total) * 100;
      progressFill.style.width = `${pct}%`;
    },
    onComplete: ({ answers, totalTimeMs }) => {
      const report = buildAssessmentReport(answers);
      const record = {
        id: 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        dateISO: new Date().toISOString(),
        totalTimeMs,
        ...report,
      };
      store.saveAssessment(profile.id, record);
      navigate(`#/assessment/report/${record.id}`);
    },
  });
}

// ---------- Ecrã: relatório de um teste ----------

function renderAssessmentReport(id) {
  const profile = requireActiveProfile();
  if (!profile) return;
  const record = store.getAssessment(profile.id, id);
  if (!record) { navigate('#/assessment'); return; }
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/assessment'),
  }));

  const dateStr = new Date(record.dateISO).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });

  screen.appendChild(makeEl('div', 'mascot', record.level.emoji));
  screen.appendChild(makeEl('h2', 'title-hero', 'O teu Relatório'));
  screen.appendChild(makeEl('p', 'subtitle', dateStr));

  const scoreBlock = makeEl('div', 'report-score-block');
  scoreBlock.appendChild(makeEl('div', 'report-score-number', String(record.score)));
  scoreBlock.appendChild(makeEl('div', 'report-score-label', 'PONTOS'));
  screen.appendChild(scoreBlock);

  screen.appendChild(makeEl('div', 'report-level', `${record.level.emoji} ${record.level.label}`));
  screen.appendChild(makeEl('div', 'result-sub', `${record.correctCount} de ${record.total} respostas certas · ${formatDuration(record.totalTimeMs)}`));

  const grid = makeEl('div', 'report-table-grid');
  record.tableStats.forEach((t) => {
    const cell = makeEl('div', `report-table-cell status-${t.status}`);
    cell.appendChild(makeEl('div', 'report-table-num', `× ${t.table}`));
    cell.appendChild(makeEl('div', 'report-table-status', TABLE_STATUS_LABELS[t.status]));
    grid.appendChild(cell);
  });
  screen.appendChild(grid);

  if (record.strong.length) {
    screen.appendChild(makeEl('div', 'report-note strong', `✅ Pontos fortes: tabuada do ${record.strong.join(', ')}`));
  }
  if (record.weak.length) {
    screen.appendChild(makeEl('div', 'report-note weak', `📌 A praticar: tabuada do ${record.weak.join(', ')}`));
  }

  // A tabuada mais fraca fica a um toque. Quem decide onde começar é o
  // teste de colocação; este relatório só aponta o que praticar.
  if (record.weak.length) {
    const weakest = String(record.weak[0]);
    const practiceBtn = makeEl('button', 'btn primary block', `Pratica a tabuada do ${weakest} 💪`);
    practiceBtn.style.marginTop = '14px';
    practiceBtn.addEventListener('click', () => {
      playClick();
      navigate(`#/world/${weakest}`);
    });
    screen.appendChild(practiceBtn);
  }

  const btnRow = makeEl('div', 'btn-row');
  btnRow.style.marginTop = '20px';
  btnRow.style.flexDirection = 'column';
  btnRow.style.width = '100%';

  const shareBtn = makeEl('button', 'btn primary block', 'Partilhar relatório 📤');
  shareBtn.addEventListener('click', async () => {
    const { method } = await shareReport(profile, record);
    if (method === 'download+clipboard' || method === 'download') showToast('Relatório guardado! 📥');
    if (method === 'clipboard') showToast('Relatório copiado! 📋');
  });
  btnRow.appendChild(shareBtn);

  const backBtn = makeEl('button', 'btn secondary block', 'Voltar');
  backBtn.style.marginTop = '10px';
  backBtn.addEventListener('click', () => navigate('#/assessment'));
  btnRow.appendChild(backBtn);

  screen.appendChild(btnRow);
  app.appendChild(screen);
}

// ---------- Ecrã: Revisão Diária (início) ----------

function renderReviewHub() {
  const profile = requireActiveProfile();
  if (!profile) return;
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/map'),
  }));

  screen.appendChild(makeEl('div', 'mascot', '🔁'));
  screen.appendChild(makeEl('h2', 'title-hero', 'Revisão Diária'));

  const doneToday = store.isReviewDoneToday(profile.id);
  screen.appendChild(makeEl('p', 'subtitle', doneToday
    ? 'Já fizeste a revisão de hoje! Podes repetir só por diversão.'
    : 'Dez perguntas rápidas para manter a tabuada fresquinha na cabeça, todos os dias!'));

  const streak = store.getDisplayStreak(profile.id);
  const streakBlock = makeEl('div', 'streak-block');
  streakBlock.appendChild(makeEl('div', 'streak-flame', streak > 0 ? '🔥' : '🧊'));
  streakBlock.appendChild(makeEl('div', 'streak-count', String(streak)));
  streakBlock.appendChild(makeEl('div', 'streak-label', streak === 1 ? 'dia seguido' : 'dias seguidos'));
  screen.appendChild(streakBlock);

  const startBtn = makeEl('button', 'btn primary block', doneToday ? 'Praticar outra vez 🔁' : 'Começar Revisão 🚀');
  startBtn.style.marginTop = '18px';
  startBtn.addEventListener('click', () => {
    playClick();
    navigate('#/review/run');
  });
  screen.appendChild(startBtn);

  app.appendChild(screen);
}

// ---------- Ecrã: Revisão Diária (a decorrer) ----------

function renderReviewRun() {
  const profile = requireActiveProfile();
  if (!profile) return;
  clearApp();

  const screen = makeEl('div', 'screen');
  screen.appendChild(buildTopbar(profile, {
    showBack: true,
    onBack: () => navigate('#/review'),
    inRound: true,
  }));

  const progressTrack = makeEl('div', 'progress-bar-track');
  const progressFill = makeEl('div', 'progress-bar-fill');
  progressFill.style.width = '0%';
  progressTrack.appendChild(progressFill);
  screen.appendChild(progressTrack);

  const content = makeEl('div', 'exercise-content');
  screen.appendChild(content);
  app.appendChild(screen);

  // Revê o que já foi praticado ou já se sabe; quem ainda não começou
  // revê as duas primeiras tabuadas.
  const practisedTables = WORLDS
    .filter((w) => !w.isFinal && ['done', 'known', 'started'].includes(store.getWorldState(profile.id, w.id)))
    .map((w) => w.table);
  const reviewTables = practisedTables.length ? practisedTables : [1, 2];
  const assessments = store.getAssessments(profile.id);
  const priorityTables = assessments.length ? assessments[0].weak : [];
  const questions = generateReviewQuestions(reviewTables, priorityTables, 10);

  runReview(content, questions, {
    onProgress: ({ index, total }) => {
      progressFill.style.width = `${(index / total) * 100}%`;
    },
    onComplete: ({ correct, total }) => {
      const points = correct * 5;
      store.addBonusPoints(profile.id, points);
      const streakState = store.recordReviewCompletion(profile.id);
      renderReviewResult(profile, {
        correct, total, points,
        streak: streakState.currentStreak,
        isMilestone: [3, 7, 14, 30, 60, 100].includes(streakState.currentStreak),
      });
    },
  });
}

// ---------- Ecrã: Revisão Diária (resultado) ----------

function renderReviewResult(profile, { correct, total, points, streak, isMilestone }) {
  clearApp();

  const screen = makeEl('div', 'result-screen');
  addFloatingHome(screen);

  screen.appendChild(makeEl('div', 'mascot', isMilestone ? '🏅' : '🔁'));
  screen.appendChild(makeEl('h2', 'title-hero', 'Revisão Completa!'));
  screen.appendChild(makeEl('div', 'result-sub', `${correct} de ${total} certas`));
  screen.appendChild(makeEl('div', 'result-points', `+${points} pontos`));

  const streakBlock = makeEl('div', 'streak-block');
  streakBlock.appendChild(makeEl('div', 'streak-flame', '🔥'));
  streakBlock.appendChild(makeEl('div', 'streak-count', String(streak)));
  streakBlock.appendChild(makeEl('div', 'streak-label', streak === 1 ? 'dia seguido' : 'dias seguidos'));
  screen.appendChild(streakBlock);

  if (isMilestone) {
    screen.appendChild(makeEl('div', 'result-message', `🎉 ${streak} dias seguidos! Continua assim!`));
  }

  const btnRow = makeEl('div', 'btn-row');
  btnRow.style.marginTop = '20px';
  btnRow.style.flexDirection = 'column';
  btnRow.style.width = '100%';

  const doneBtn = makeEl('button', 'btn primary block', 'Voltar ao Mapa');
  doneBtn.addEventListener('click', () => navigate('#/map'));
  btnRow.appendChild(doneBtn);

  screen.appendChild(btnRow);
  app.appendChild(screen);

  playFanfare();
  celebrate(isMilestone ? 'world' : 'stage');
}

// ---------- Ecrã: Guardar dados online (Google Drive) ----------

function renderCloud() {
  clearApp();
  const screen = makeEl('div', 'screen');

  const topbar = makeEl('div', 'topbar');
  const back = makeEl('button', 'icon-btn', '←');
  back.addEventListener('click', () => navigate('#/profiles'));
  topbar.appendChild(back);
  screen.appendChild(topbar);

  screen.appendChild(makeEl('div', 'mascot', '☁️'));
  screen.appendChild(makeEl('h2', 'title-hero', 'Guardar Online'));

  if (!cloud.isConfigured()) {
    screen.appendChild(makeEl('p', 'subtitle', 'Esta funcionalidade ainda não foi configurada pelo dono do jogo. Não te preocupes — os dados continuam guardados em segurança neste telemóvel.'));
    app.appendChild(screen);
    return;
  }

  screen.appendChild(makeEl('p', 'subtitle', 'Liga a tua conta Google uma vez e o jogo passa a guardar sozinho os jogadores e o progresso na tua conta. Assim podes continuar noutro telemóvel ou tablet. Os dados vão diretamente daqui para o Google — nunca passam por nenhum servidor nosso.'));

  const btnRow = makeEl('div', 'btn-row');
  btnRow.style.flexDirection = 'column';
  btnRow.style.width = '100%';
  btnRow.style.marginTop = '16px';

  // Primeira ligação com jogo já feito dos dois lados: quem manda é o
  // utilizador, não nós.
  if (cloud.hasPendingConflict()) {
    screen.appendChild(makeEl('p', 'subtitle', 'Já há dados guardados na tua conta Google e também neste telemóvel, e são diferentes. Qual queres manter?'));

    const keepRemote = makeEl('button', 'btn primary block', 'Usar os dados da conta Google ⬇️');
    keepRemote.addEventListener('click', () => resolveCloudConflict('remote', keepRemote));
    btnRow.appendChild(keepRemote);

    const keepLocal = makeEl('button', 'btn secondary block', 'Usar os deste telemóvel ⬆️');
    keepLocal.style.marginTop = '10px';
    keepLocal.addEventListener('click', () => resolveCloudConflict('local', keepLocal));
    btnRow.appendChild(keepLocal);

    screen.appendChild(btnRow);
    app.appendChild(screen);
    return;
  }

  const account = cloud.getAccount();
  if (account && account.name) {
    const who = makeEl('div', 'account-chip');
    who.appendChild(accountButton());
    who.appendChild(makeEl('span', '', `Ligado como <strong>${escapeHtml(account.name)}</strong>`));
    screen.appendChild(who);
  }

  screen.appendChild(makeEl('p', 'subtitle', cloudStatusText()));

  if (!cloud.isEnabled()) {
    const connectBtn = makeEl('button', 'btn primary block', 'Ligar conta Google');
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      try {
        await cloud.connect();
        showToast('Conta ligada! A partir de agora guarda sozinho. ☁️');
      } catch (e) {
        showToast('Não foi possível ligar à conta Google.');
      }
      renderCloud();
    });
    btnRow.appendChild(connectBtn);
  } else {
    if (cloud.getStatus() === 'reconnect') {
      const reconnectBtn = makeEl('button', 'btn primary block', 'Voltar a ligar a conta');
      reconnectBtn.addEventListener('click', async () => {
        reconnectBtn.disabled = true;
        try {
          await cloud.connect();
          showToast('Ligação reposta! ☁️');
        } catch (e) {
          showToast('Não foi possível ligar à conta Google.');
        }
        renderCloud();
      });
      btnRow.appendChild(reconnectBtn);
    } else {
      const syncBtn = makeEl('button', 'btn primary block', 'Sincronizar agora ↻');
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        try {
          const result = await cloud.syncNow(true);
          showToast(result.action === 'none' ? 'Já estava tudo sincronizado. ✅' : 'Sincronizado! ☁️');
        } catch (e) {
          showToast('Não foi possível sincronizar agora.');
        }
        renderCloud();
      });
      btnRow.appendChild(syncBtn);
    }

    const restoreBtn = makeEl('button', 'btn secondary block', 'Restaurar do Google ⬇️');
    restoreBtn.style.marginTop = '10px';
    restoreBtn.addEventListener('click', async () => {
      if (!confirm('Isto substitui os dados guardados neste telemóvel pelos dados da tua conta Google. Continuar?')) return;
      restoreBtn.disabled = true;
      try {
        await cloud.restoreNow();
        showToast('Dados restaurados! A recarregar…');
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        showToast(e.message === 'no-backup-found' ? 'Ainda não há nenhuma cópia guardada.' : 'Não foi possível restaurar.');
        restoreBtn.disabled = false;
      }
    });
    btnRow.appendChild(restoreBtn);

    const disconnectBtn = makeEl('button', 'btn secondary block', 'Desligar conta');
    disconnectBtn.style.marginTop = '10px';
    disconnectBtn.addEventListener('click', () => {
      if (!confirm('O jogo deixa de guardar na tua conta Google. Os dados continuam neste telemóvel. Continuar?')) return;
      cloud.disconnect();
      renderCloud();
    });
    btnRow.appendChild(disconnectBtn);
  }

  screen.appendChild(btnRow);
  app.appendChild(screen);
}

function cloudStatusText() {
  const lastSync = cloud.getLastSyncLabel();
  if (!cloud.isEnabled()) return 'Conta Google ainda não ligada.';
  if (cloud.getStatus() === 'reconnect') return 'O Google pediu para voltares a entrar. Até lá, o jogo continua a guardar tudo neste telemóvel.';
  if (cloud.getStatus() === 'error') return 'A última sincronização falhou (talvez sem internet). Vai tentar outra vez sozinho.';
  if (cloud.getStatus() === 'syncing') return 'A sincronizar…';
  return lastSync ? `Sincronização automática ligada. Última: ${lastSync}` : 'Sincronização automática ligada.';
}

async function resolveCloudConflict(choice, btn) {
  btn.disabled = true;
  try {
    await cloud.resolveConflict(choice);
    if (choice === 'remote') {
      showToast('Dados da conta Google aplicados! A recarregar…');
      setTimeout(() => location.reload(), 800);
      return;
    }
    showToast('Guardado na conta Google. ☁️');
  } catch (e) {
    showToast('Não foi possível concluir.');
  }
  renderCloud();
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
