// Pure scoring function. answers: { [questionId]: 'A' | 'B' | 'C' | 'D' }. Each question counts once.
export function computeResult(questions, answers = {}) {
  const ids = new Set();
  let correct = 0, incorrect = 0, unanswered = 0;
  const detail = [];
  for (const q of questions) {
    if (ids.has(q.id)) continue;           // ignore accidental duplicates
    ids.add(q.id);
    const a = answers[q.id];
    let state = 'unanswered';
    if (!a) unanswered++;
    else if (a === q.correct_option) { correct++; state = 'correct'; }
    else { incorrect++; state = 'incorrect'; }
    detail.push({ id: q.id, answer: a || null, correct_option: q.correct_option, state });
  }
  const total = ids.size, attempted = correct + incorrect;
  return {
    total, correct, incorrect, unanswered, attempted,
    score: total ? Math.round((correct / total) * 1000) / 10 : 0,          // % of all questions
    accuracy: attempted ? Math.round((correct / attempted) * 1000) / 10 : 0, // % of attempted
    detail,
  };
}

export function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
