document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);

function showToast(message, type = 'error') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3500); 
}

// === DETEKSI ===
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const preview = document.getElementById('preview');
const btnDetect = document.getElementById('btn-detect');
const btnHelperText = document.getElementById('btn-helper-text');
const hasilDiv = document.getElementById('deteksi-hasil');
const skeletonDiv = document.getElementById('deteksi-skeleton');
const btnReset = document.getElementById('btn-reset-deteksi');
const deteksiSubtitle = document.getElementById('deteksi-subtitle');
let selectedFile = null;

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = '#4c5fd5'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#94a3b8'; });
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.style.borderColor = '#94a3b8';
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  selectedFile = file;
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  btnDetect.disabled = false;
  btnHelperText.style.display = 'none';
  hasilDiv.style.display = 'none';
  skeletonDiv.style.display = 'none';
}

// LOGIKA TOMBOL COBA FOTO LAIN
btnReset.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  preview.style.display = 'none';
  hasilDiv.style.display = 'none';
  btnDetect.disabled = true;
  btnHelperText.style.display = 'block';
  deteksiSubtitle.textContent = "Upload gambar yang Bunda curigai. Sistem akan memberi skor dan penjelasan.";
});

btnDetect.addEventListener('click', async () => {
  if (!selectedFile) return;
  
  btnDetect.disabled = true;
  btnDetect.textContent = 'Memproses...';
  skeletonDiv.style.display = 'block';
  hasilDiv.style.display = 'none';

  await new Promise(r => setTimeout(r, 1500));

  const formData = new FormData();
  formData.append('image', selectedFile);
  
  try {
    const res = await fetch('/api/detect', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    
    skeletonDiv.style.display = 'none';
    hasilDiv.style.display = 'block';
    
    document.getElementById('skor-angka').textContent = data.persen_ai + '%';
    document.getElementById('progress-fill').style.width = data.persen_ai + '%';
    document.getElementById('penjelasan').textContent = data.penjelasan;
    document.getElementById('metode').textContent = 'Metode: ' + (data.metode || 'groq');

    // --- LOGIKA EMPATI (COPYWRITING) ---
    const skorLabel = document.getElementById('skor-label-teks');
    if (data.persen_ai > 65) {
      skorLabel.textContent = "Indikasi Buatan AI";
      skorLabel.style.color = "#e53e3e";
      deteksiSubtitle.textContent = "Gambar ini perlu diverifikasi ulang. Jangan disebar dulu ya Bun.";
    } else if (data.persen_ai > 40) {
      skorLabel.textContent = "Hasil Meragukan";
      skorLabel.style.color = "#d69e2e";
      deteksiSubtitle.textContent = "Belum bisa dipastikan. Coba cek sumber aslinya dulu ya.";
    } else {
      skorLabel.textContent = "Kemungkinan Asli";
      skorLabel.style.color = "#38a169";
      deteksiSubtitle.textContent = "Sepertinya ini foto asli, tapi tetap waspada ya Bun.";
    }

  } catch (err) {
    skeletonDiv.style.display = 'none';
    showToast('Gagal: ' + err.message, 'error');
  } finally {
    btnDetect.disabled = false;
    btnDetect.textContent = '🔍 Analisis Gambar';
  }
});

// === CHAT === (SAMA SEPERTI SEBELUMNYA)
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
  
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'message bot';
  loadingDiv.innerHTML = '<div class="skeleton-box sk-chat-bubble"></div>';
  chatMessages.appendChild(loadingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  await new Promise(r => setTimeout(r, 1500));

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId })
    });
    const data = await res.json();
    loadingDiv.remove();
    
    if (data.reply === '__START_QUIZ__') {
      addMessage('Oke Bunda! Buka tab <b>🎮 Kuis</b> untuk mulai main 💐', 'bot');
      document.querySelector('[data-tab="kuis"]').click();
    } else {
      addMessage(data.reply, 'bot');
    }
  } catch {
    loadingDiv.remove();
    showToast('Maaf Bun, ada error jaringan. Coba lagi 🙏', 'error');
  }
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendChat(); });

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => { chatInput.value = btn.dataset.msg; sendChat(); });
});

// === KUIS === (SAMA SEPERTI SEBELUMNYA)
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
  document.getElementById('kuis-gambar').src = data.gambar;
  document.getElementById('kuis-pertanyaan').textContent = data.pertanyaan;
}

function showFeedback(feedback) {
  kuisFeedback.style.display = 'block';
  kuisFeedback.className = 'feedback ' + (feedback.benar ? 'benar' : 'salah');
  kuisFeedback.innerHTML = (feedback.benar ? '✅ Benar!<br>' : `❌ Salah. Jawaban: <b>${feedback.jawaban_benar}</b><br>`) + feedback.penjelasan;
}

btnStartKuis.addEventListener('click', async () => {
  btnStartKuis.disabled = true;
  btnStartKuis.textContent = 'Memuat Soal...';
  await new Promise(r => setTimeout(r, 1000));
  const data = await kuisAction('start');
  renderQuestion(data);
  btnStartKuis.disabled = false;
  btnStartKuis.textContent = '🎮 Mulai Kuis';
});

document.querySelectorAll('.btn-kuis').forEach(btn => {
  btn.addEventListener('click', async () => {
    const data = await kuisAction('answer', btn.dataset.answer);
    if (data.error) { showToast(data.error, 'error'); return; }
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