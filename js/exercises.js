// ---------- Renderização dos diferentes tipos de exercício ----------
import { generateOptions, STAGE_TYPES } from './data.js';
import { playCorrect, playWrong, playTick } from './audio.js';

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function clear(container) {
  container.innerHTML = '';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ponto de entrada único para correr um estágio.
 * questions: array de {a,b,answer}
 * callbacks: onQuestionResult(result), onStageComplete({correct, total, points})
 */
export function runStage(container, world, stageDef, questions, callbacks) {
  const { onQuestionResult, onStageComplete } = callbacks;

  if (stageDef.type === STAGE_TYPES.MATCHING) {
    runMatching(container, questions, onQuestionResult, onStageComplete);
    return;
  }

  const isTimed = stageDef.type === STAGE_TYPES.TIMED;
  let index = 0;
  let correctCount = 0;
  let totalPoints = 0;

  function next() {
    if (index >= questions.length) {
      onStageComplete({ correct: correctCount, total: questions.length, points: totalPoints });
      return;
    }
    const q = questions[index];
    const useType = isTimed ? index % 2 === 1 : stageDef.type === STAGE_TYPES.SEQ_TYPE;

    const handleResult = (result) => {
      if (result.correct) correctCount++;
      totalPoints += result.points;
      index++;
      onQuestionResult({ index: index - 1, total: questions.length, ...result });
      wait(useType ? 550 : 700).then(next);
    };

    if (useType) {
      renderTypeQuestion(container, q, isTimed, handleResult);
    } else {
      renderChoiceQuestion(container, q, isTimed, handleResult);
    }
  }

  next();
}

// ---------- Escolha múltipla ----------

function renderChoiceQuestion(container, question, timed, onResolve) {
  clear(container);
  const options = generateOptions(question, 4);
  const startTime = performance.now();
  const timeLimit = 6000;
  let resolved = false;
  let timerHandle = null;

  const wrap = el('div');
  if (timed) {
    const track = el('div', 'timer-track');
    const fill = el('div', 'timer-fill');
    track.appendChild(fill);
    wrap.appendChild(track);
    timerHandle = startTimer(fill, timeLimit, () => {
      if (resolved) return;
      resolved = true;
      showAnswerReveal();
      playWrong();
      onResolve({ correct: false, points: 0, timedOut: true });
    });
  }

  const card = el('div', 'question-card');
  card.appendChild(el('div', 'question-text', `${question.a} × ${question.b}`));
  wrap.appendChild(card);

  const grid = el('div', 'options-grid');
  const buttons = options.map((opt) => {
    const btn = el('button', 'option-btn', String(opt));
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      if (timerHandle) timerHandle.stop();
      const elapsed = performance.now() - startTime;
      const isCorrect = opt === question.answer;
      buttons.forEach((b) => (b.classList.add('disabled')));
      btn.classList.add(isCorrect ? 'correct' : 'wrong');
      if (!isCorrect) {
        buttons.forEach((b) => {
          if (Number(b.textContent) === question.answer) b.classList.add('correct');
        });
        playWrong();
      } else {
        playCorrect();
      }
      let points = 0;
      if (isCorrect) {
        points = 10;
        if (timed) {
          const remaining = Math.max(0, 1 - elapsed / timeLimit);
          points += Math.round(remaining * 10);
        }
      }
      onResolve({ correct: isCorrect, points });
    });
    grid.appendChild(btn);
    return btn;
  });
  wrap.appendChild(grid);
  container.appendChild(wrap);

  function showAnswerReveal() {
    buttons.forEach((b) => {
      b.classList.add('disabled');
      if (Number(b.textContent) === question.answer) b.classList.add('correct');
      else b.classList.add('dim');
    });
  }
}

// ---------- Escrever a resposta ----------

function renderTypeQuestion(container, question, timed, onResolve) {
  clear(container);
  const startTime = performance.now();
  const timeLimit = 9000;
  let resolved = false;
  let timerHandle = null;
  let typed = '';

  const wrap = el('div');
  if (timed) {
    const track = el('div', 'timer-track');
    const fill = el('div', 'timer-fill');
    track.appendChild(fill);
    wrap.appendChild(track);
    timerHandle = startTimer(fill, timeLimit, () => {
      if (resolved) return;
      resolved = true;
      finish(false);
    });
  }

  const card = el('div', 'question-card');
  card.appendChild(el('div', 'question-text', `${question.a} × ${question.b}`));
  wrap.appendChild(card);

  const display = el('div', 'answer-display', '?');
  wrap.appendChild(display);

  const keypad = el('div', 'keypad');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'];
  keys.forEach((k) => {
    const btn = el('button', 'key-btn', k);
    btn.type = 'button';
    if (k === '⌫') btn.classList.add('action');
    if (k === 'OK') btn.classList.add('confirm');
    btn.addEventListener('click', () => {
      if (resolved) return;
      if (k === '⌫') {
        typed = typed.slice(0, -1);
      } else if (k === 'OK') {
        if (typed.length === 0) return;
        resolved = true;
        if (timerHandle) timerHandle.stop();
        finish(Number(typed) === question.answer);
        return;
      } else {
        if (typed.length < 3) typed += k;
      }
      display.textContent = typed.length ? typed : '?';
    });
    keypad.appendChild(btn);
  });
  wrap.appendChild(keypad);
  container.appendChild(wrap);

  function onKeydown(e) {
    if (resolved) return;
    if (/^[0-9]$/.test(e.key)) {
      if (typed.length < 3) typed += e.key;
      display.textContent = typed;
    } else if (e.key === 'Backspace') {
      typed = typed.slice(0, -1);
      display.textContent = typed.length ? typed : '?';
    } else if (e.key === 'Enter') {
      if (typed.length === 0) return;
      resolved = true;
      if (timerHandle) timerHandle.stop();
      document.removeEventListener('keydown', onKeydown);
      finish(Number(typed) === question.answer);
    }
  }
  document.addEventListener('keydown', onKeydown);

  function finish(isCorrect) {
    document.removeEventListener('keydown', onKeydown);
    display.textContent = typed.length ? typed : String(question.answer);
    display.classList.add(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) {
      const reveal = el('div', 'question-hint', `A resposta certa era ${question.answer}`);
      wrap.appendChild(reveal);
      playWrong();
    } else {
      playCorrect();
    }
    let points = 0;
    if (isCorrect) {
      points = 10;
      if (timed) {
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, 1 - elapsed / timeLimit);
        points += Math.round(remaining * 10);
      }
    }
    onResolve({ correct: isCorrect, points });
  }
}

// ---------- Temporizador partilhado ----------

function startTimer(fillEl, duration, onTimeout) {
  const start = performance.now();
  let raf = null;
  let stopped = false;

  function tick(now) {
    if (stopped) return;
    const elapsed = now - start;
    const remaining = Math.max(0, 1 - elapsed / duration);
    fillEl.style.width = `${remaining * 100}%`;
    if (remaining < 0.25) fillEl.classList.add('danger');
    const remainingSec = Math.ceil((duration - elapsed) / 1000);
    if (remainingSec <= 3 && remainingSec > 0 && !fillEl.dataset['tick' + remainingSec]) {
      fillEl.dataset['tick' + remainingSec] = '1';
      playTick();
    }
    if (elapsed >= duration) {
      stopped = true;
      onTimeout();
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

// ---------- Ligar os pares ----------

function runMatching(container, questions, onQuestionResult, onStageComplete) {
  clear(container);

  const leftItems = questions.map((q, i) => ({ id: 'l' + i, pairId: i, label: `${q.a} × ${q.b}`, value: q.answer }));
  const rightItems = questions.map((q, i) => ({ id: 'r' + i, pairId: i, label: String(q.answer), value: q.answer }));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffledRight = shuffle(rightItems);

  const wrap = el('div');
  const hint = el('div', 'question-hint', 'Toca numa conta e depois no resultado certo');
  hint.style.marginBottom = '12px';
  hint.style.textAlign = 'center';
  wrap.appendChild(hint);

  const grid = el('div', 'match-grid');
  wrap.appendChild(grid);
  container.appendChild(wrap);

  const cardEls = new Map();
  let selectedLeft = null;
  let matchedCount = 0;
  let attempts = 0;
  const totalPairs = questions.length;

  function renderCard(item, side) {
    const card = el('div', 'match-card', item.label);
    card.dataset.id = item.id;
    card.dataset.side = side;
    card.addEventListener('click', () => handleClick(item, side, card));
    cardEls.set(item.id, card);
    return card;
  }

  const combined = shuffle([
    ...leftItems.map((i) => ({ item: i, side: 'left' })),
    ...shuffledRight.map((i) => ({ item: i, side: 'right' })),
  ]);
  combined.forEach(({ item, side }) => grid.appendChild(renderCard(item, side)));

  function handleClick(item, side, card) {
    if (card.classList.contains('matched')) return;

    if (side === 'left') {
      if (selectedLeft) selectedLeft.card.classList.remove('selected');
      selectedLeft = { item, card };
      card.classList.add('selected');
      return;
    }

    // clique num item da direita
    if (!selectedLeft) return;
    attempts++;
    const isMatch = selectedLeft.item.pairId === item.pairId;
    if (isMatch) {
      selectedLeft.card.classList.remove('selected');
      selectedLeft.card.classList.add('matched');
      card.classList.add('matched');
      matchedCount++;
      playCorrect();
      onQuestionResult({ index: matchedCount - 1, total: totalPairs, correct: true, points: 15 });
      selectedLeft = null;
      if (matchedCount === totalPairs) {
        const total = attempts;
        const points = matchedCount * 15;
        wait(500).then(() => onStageComplete({ correct: matchedCount, total, points }));
      }
    } else {
      card.classList.add('wrong');
      selectedLeft.card.classList.add('wrong');
      playWrong();
      const lCard = selectedLeft.card;
      setTimeout(() => {
        card.classList.remove('wrong');
        lCard.classList.remove('wrong', 'selected');
      }, 400);
      selectedLeft = null;
    }
  }
}
