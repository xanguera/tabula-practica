// ---------- Motor da Revisão Diária ----------
// Um quiz rápido de escolha múltipla, sem consequências para o percurso
// principal (sem estrelas), pensado para ser feito todos os dias e manter
// a tabuada fresca na memória.
import { renderChoiceQuestion } from './exercises.js';
import { classifyAnswer } from './data.js';

export function runReview(container, questions, { onProgress, onComplete }) {
  let index = 0;
  let correct = 0;
  const answers = [];

  function next() {
    if (index >= questions.length) {
      onComplete({ correct, total: questions.length, answers });
      return;
    }
    onProgress({ index, total: questions.length });
    const q = questions[index];
    renderChoiceQuestion(container, q, false, (result) => {
      if (result.correct) correct++;
      answers.push({ a: q.a, b: q.b, tier: classifyAnswer(result.correct, result.elapsedMs) });
      index++;
      setTimeout(next, 600);
    });
  }

  next();
}
