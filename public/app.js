document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

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

// === CHAT ===
const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
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

// === KUIS (LOGIKA FRONTEND DENGAN GAMBAR STABIL) ===
const QUIZ_DATA = [
  { 
    gambar: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/President_Barack_Obama.jpg/500px-President_Barack_Obama.jpg', 
    pertanyaan: 'Foto Barack Obama ini asli atau AI?', 
    jawaban: 'asli', 
    penjelasan: 'Foto asli. Detail wajah, tekstur kulit, dan pencahayaan sangat natural.' 
  },
  { 
    gambar: 'https://images.unsplash.com/photo-1575936123452-b67c3203c357?q=80&w=500&auto=format&fit=crop', 
    pertanyaan: 'Foto kamera ini asli atau AI?', 
    jawaban: 'asli', 
    penjelasan: 'Foto asli. Teks pada lensa dan pantulan cahaya konsisten.' 
  },
  { 
    gambar: 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?q=80&w=500&auto=format&fit=crop', 
    pertanyaan: 'Foto kucing ini asli atau AI?', 
    jawaban: 'asli', 
    penjelasan: 'Foto asli. Detail bulu dan mata kucing terlihat sangat alami.' 
  },
  { 
    gambar: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?q=80&w=500&auto=format&fit=crop', 
    pertanyaan: 'Foto anjing ini asli atau AI?', 
    jawaban: 'asli', 
    penjelasan: 'Foto asli. Ekspresi dan detail mata anjing natural.' 
  },
  { 
    gambar: 'https://images.unsplash.com/photo-1506744626753-1fa44f4b2b6a?q=80&w=500&auto=format&fit=crop', 
    pertanyaan: 'Foto pemandangan ini asli atau AI?', 
    jawaban: 'asli', 
    penjelasan: 'Foto asli. Detail alam, kabut, dan pencahayaan konsisten.' 
  }
];

let kuisState = {
  questions: [],
  current: 0,
  correct: 0,
  finished: false
};

const btnStartKuis = document.getElementById('btn-start-kuis');
const kuisStartArea = document.getElementById('kuis-start-area');
const kuisArea = document.getElementById('kuis-area');
const kuisFinish = document.getElementById('kuis-finish');
const kuisFeedback = document.getElementById('kuis-feedback');
const kuisGambar = document.getElementById('kuis-gambar');

// JIKA GAMBAR GAGAL DIMUAT (ERROR 404/BLOKIR), TAMPILKAN GAMBAR CADANGAN
kuisGambar.onerror = function() {
  this.src = 'https://placehold.co/500x400/e2e8f0/475569?text=Gambar+Tidak+Dapat+Dimuat';
};

function mulaiKuis() {
  // Acak soal
  kuisState.questions = [...QUIZ_DATA].sort(() => Math.random() - 0.5);
  kuisState.current = 0;
  kuisState.correct = 0;
  kuisState.finished = false;
  
  kuisStartArea.style.display = 'none';
  kuisFinish.style.display = 'none';
  kuisArea.style.display = 'block';
  
  renderQuestion();
}

function renderQuestion() {
  kuisFeedback.style.display = 'none';
  const q = kuisState.questions[kuisState.current];
  
  document.getElementById('kuis-nomor').textContent = kuisState.current + 1;
  document.getElementById('kuis-total').textContent = kuisState.questions.length;
  document.getElementById('kuis-skor').textContent = kuisState.correct;
  
  // SET GAMBAR
  kuisGambar.src = q.gambar;
  document.getElementById('kuis-pertanyaan').textContent = q.pertanyaan;
}

function jawabKuis(jawabanUser) {
  const q = kuisState.questions[kuisState.current];
  const benar = jawabanUser === q.jawaban;
  
  if (benar) kuisState.correct++;
  
  // Tampilkan feedback
  kuisFeedback.style.display = 'block';
  kuisFeedback.className = 'feedback ' + (benar ? 'benar' : 'salah');
  kuisFeedback.innerHTML = (benar ? '✅ Benar!<br>' : `❌ Salah. Jawaban: <b>${q.jawaban}</b><br>`) + q.penjelasan;
  
  kuisState.current++;
  
  setTimeout(() => {
    if (kuisState.current >= kuisState.questions.length) {
      // KUIS SELESAI
      kuisState.finished = true;
      kuisArea.style.display = 'none';
      kuisFinish.style.display = 'flex'; // Gunakan flex agar rapi di tengah
      
      const persen = Math.round((kuisState.correct / kuisState.questions.length) * 100);
      let badgeEmoji = '💪', badgeNama = 'Calon Detektif';
      if (persen >= 90) { badgeEmoji = '🏆'; badgeNama = 'Detektif Level 3'; }
      else if (persen >= 60) { badgeEmoji = '🥈'; badgeNama = 'Detektif Level 2'; }
      else if (persen >= 40) { badgeEmoji = '🥉'; badgeNama = 'Detektif Level 1'; }
      
      document.getElementById('finish-badge').textContent = `${badgeEmoji} ${badgeNama}`;
      document.getElementById('finish-skor').textContent = `Skor: ${kuisState.correct}/${kuisState.questions.length} (${persen}%)`;
    } else {
      // LANJUT SOAL BERIKUTNYA
      renderQuestion();
    }
  }, 2000);
}

btnStartKuis.addEventListener('click', () => {
  btnStartKuis.disabled = true;
  btnStartKuis.textContent = 'Memuat Soal...';
  setTimeout(() => {
    btnStartKuis.disabled = false;
    btnStartKuis.textContent = '🎮 Mulai Kuis';
    mulaiKuis();
  }, 500);
});

document.querySelectorAll('.btn-kuis').forEach(btn => {
  btn.addEventListener('click', () => {
    jawabKuis(btn.dataset.answer);
  });
});

document.getElementById('btn-ulang-kuis').addEventListener('click', () => {
  mulaiKuis();
});