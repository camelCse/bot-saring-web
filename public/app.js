document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);

// === DETEKSI ===
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const preview = document.getElementById('preview');
const btnDetect = document.getElementById('btn-detect');
const hasilDiv = document.getElementById('deteksi-hasil');
let selectedFile = null;

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = '#667eea'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  selectedFile = file;
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  btnDetect.disabled = false;
  hasilDiv.style.display = 'none';
}

btnDetect.addEventListener('click', async () => {
  if (!selectedFile) return;
  btnDetect.disabled = true;
  btnDetect.textContent = 'Menganalisis...';
  const formData = new FormData();
  formData.append('image', selectedFile);
  try {
    const res = await fetch('/api/detect', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    hasilDiv.style.display = 'block';
    document.getElementById('skor-angka').textContent = data.persen_ai + '%';
    document.getElementById('progress-fill').style.width = data.persen_ai + '%';
    document.getElementById('penjelasan').textContent = data.penjelasan;
    document.getElementById('metode').textContent = 'Metode: ' + (data.metode || 'groq');
  } catch (err) {
    alert('Gagal: ' + err.message);
  } finally {
    btnDetect.disabled = false;
    btnDetect.textContent = 'Analisis Gambar';
  }
});

// === CHAT ===
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

function addMessage(text, sender) {
  const div = document.createElement('div');
  div.className = 'message ' + sender;
  div.innerHTML = text.replace(/\n/g, '<br>').replace(/\*(.+?)\*/g, '<b>$1</b>');
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  addMessage(text, 'user');
  const loading = addMessage('⏳ Sedang mengetik...', 'bot');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId })
    });
    const data = await res.json();
    loading.remove();
    if (data.reply === '__START_QUIZ__') {
      addMessage('Oke Bunda! Buka tab <b>🎮 Kuis</b> untuk mulai main 💐', 'bot');
      document.querySelector('[data-tab="kuis"]').click();
    } else {
      addMessage(data.reply, 'bot');
    }
  } catch {
    loading.remove();
    addMessage('Maaf Bun, ada error. Coba lagi 🙏', 'bot');
  }
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendChat(); });

// === KUIS ===
const btnStartKuis = document.getElementById('btn-start-kuis');
const kuisStartArea = document.getElementById('kuis-start-area');
const kuisArea = document.getElementById('kuis-area');
const kuisFinish = document.getElementById('kuis-finish');
const kuisFeedback = document.getElementById('kuis-feedback');

async function kuisAction(action, answer = null) {
  const res = await fetch('/api/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, answer, sessionId })
  });
  return res.json();
}

function renderQuestion(data) {
  kuisArea.style.display = 'block';
  kuisFinish.style.display = 'none';
  kuisFeedback.style.display = 'none';
  document.getElementById('kuis-nomor').textContent = data.nomor;
  document.getElementById('kuis-total').textContent = data.total;
  document.getElementById('kuis-skor').textContent = data.skor;
  document.getElementById('kuis-gambar').src = data.gambar + (data.gambar.includes('?') ? '&' : '?') + 't=' + Date.now();
  document.getElementById('kuis-pertanyaan').textContent = data.pertanyaan;
}

function showFeedback(feedback) {
  kuisFeedback.style.display = 'block';
  kuisFeedback.className = 'feedback ' + (feedback.benar ? 'benar' : 'salah');
  kuisFeedback.innerHTML = (feedback.benar ? '✅ Benar!<br>' : `❌ Salah. Jawaban: <b>${feedback.jawaban_benar}</b><br>`) + feedback.penjelasan;
}

btnStartKuis.addEventListener('click', async () => {
  kuisStartArea.style.display = 'none';
  const data = await kuisAction('start');
  renderQuestion(data);
});

document.querySelectorAll('.btn-kuis').forEach(btn => {
  btn.addEventListener('click', async () => {
    const data = await kuisAction('answer', btn.dataset.answer);
    if (data.error) { alert(data.error); return; }
    showFeedback(data.feedback);
    setTimeout(() => {
      if (data.action === 'finished') {
        kuisArea.style.display = 'none';
        kuisFinish.style.display = 'block';
        document.getElementById('finish-badge').textContent = data.badge.emoji + ' ' + data.badge.nama;
        document.getElementById('finish-skor').textContent = `Skor: ${data.skor}/${data.total} (${data.persen}%)`;
      } else {
        renderQuestion(data);
      }
    }, 2000);
  });
});

document.getElementById('btn-ulang-kuis').addEventListener('click', async () => {
  kuisFinish.style.display = 'none';
  const data = await kuisAction('start');
  renderQuestion(data);
});