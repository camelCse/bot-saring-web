const { QUIZ_QUESTIONS } = require('../templates/quizQuestions');

const sessions = new Map();
const JUMLAH_SOAL = 5;

function startQuiz(sessionId) {
  const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, JUMLAH_SOAL);
  const state = { questions: shuffled, current: 0, correct: 0, finished: false };
  sessions.set(sessionId, state);

  const q = shuffled[0];
  return {
    action: 'question',
    nomor: 1,
    total: JUMLAH_SOAL,
    skor: 0,
    gambar: q.gambar,
    pertanyaan: q.pertanyaan
  };
}

function answerQuiz(sessionId, answer) {
  const state = sessions.get(sessionId);
  if (!state) return { error: 'Kuis belum dimulai.' };
  if (state.finished) return { error: 'Kuis sudah selesai.' };

  const q = state.questions[state.current];
  const benar = answer === q.jawaban;
  if (benar) state.correct++;

  const feedback = { benar, jawaban_benar: q.jawaban, penjelasan: q.penjelasan };
  state.current++;

  if (state.current >= state.questions.length) {
    state.finished = true;
    const persen = Math.round((state.correct / state.questions.length) * 100);
    return {
      action: 'finished',
      feedback,
      skor: state.correct,
      total: state.questions.length,
      persen,
      badge: getBadge(state.correct, state.questions.length)
    };
  }

  const next = state.questions[state.current];
  return {
    action: 'question',
    feedback,
    nomor: state.current + 1,
    total: state.questions.length,
    skor: state.correct,
    gambar: next.gambar,
    pertanyaan: next.pertanyaan
  };
}

function getBadge(correct, total) {
  const p = (correct / total) * 100;
  if (p >= 90) return { emoji: '🏆', nama: 'Detektif Deepfake Level 3' };
  if (p >= 60) return { emoji: '🥈', nama: 'Detektif Deepfake Level 2' };
  if (p >= 40) return { emoji: '🥉', nama: 'Detektif Deepfake Level 1' };
  return { emoji: '💪', nama: 'Calon Detektif' };
}

async function handle(sessionId, action, answer) {
  if (action === 'start') return startQuiz(sessionId);
  if (action === 'answer') return answerQuiz(sessionId, answer);
  return { error: 'Action tidak valid' };
}

module.exports = { handle };