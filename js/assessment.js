// ---------- Motor do teste de avaliação ----------
// Corre uma sequência de perguntas "escreve a resposta" sem qualquer
// barra de tempo visível. O tempo de resposta de cada pergunta é medido
// em segundo plano (ver exercises.js) e só é usado depois, no relatório,
// para perceber se a criança sabe o facto de cor ou ainda está a pensar.
import { renderTypeQuestion } from './exercises.js';
import { classifyAnswer } from './data.js';

export function runAssessment(container, questions, { onProgress, onComplete }) {
  let index = 0;
  const answers = [];
  const testStart = performance.now();

  function next() {
    if (index >= questions.length) {
      const totalTimeMs = Math.round(performance.now() - testStart);
      onComplete({ answers, totalTimeMs });
      return;
    }
    const q = questions[index];
    onProgress({ index, total: questions.length });

    renderTypeQuestion(container, q, false, (result) => {
      const tier = classifyAnswer(result.correct, result.elapsedMs);
      answers.push({
        a: q.a, b: q.b, answer: q.answer, table: q.table,
        correct: result.correct, elapsedMs: result.elapsedMs, tier,
      });
      index++;
      setTimeout(next, 500);
    });
  }

  next();
}
