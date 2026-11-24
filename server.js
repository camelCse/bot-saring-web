require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const detector = require('./src/handlers/detector');
const chatbot = require('./src/handlers/chatbot');
const quiz = require('./src/handlers/quiz');
const { checkRate, checkDetectorCooldown } = require('./src/lib/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// Validasi ukuran & tipe file
const upload = multer({
  dest: '/tmp/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Hanya file gambar yang diperbolehkan'));
    }
    cb(null, true);
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Helper: dapatkan IP
const getIP = (req) => req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';

// === API: Detektor AI ===
app.post('/api/detect', upload.single('image'), async (req, res) => {
  const ip = getIP(req);
  try {
    // Rate limit
    const rate = checkRate(ip);
    if (!rate.allowed) {
      return res.status(429).json({ error: `Terlalu banyak permintaan. Coba lagi dalam ${rate.retryAfter} detik.` });
    }
    // Cooldown khusus detektor
    const cd = checkDetectorCooldown(ip);
    if (!cd.allowed) {
      return res.status(429).json({ error: `Mohon tunggu ${cd.retryAfter} detik sebelum upload gambar lagi ya Bun 🙏` });
    }
    if (!req.file) return res.status(400).json({ error: 'Tidak ada gambar' });

    const result = await detector.detect(req.file.path);
    fs.unlink(req.file.path, () => {});
    res.json(result);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('Detector error:', err);
    res.status(500).json({ error: 'Gagal mendeteksi: ' + err.message });
  }
});

// === API: Chat ===
app.post('/api/chat', async (req, res) => {
  const ip = getIP(req);
  try {
    const rate = checkRate(ip, 20); // chat lebih ketat: 20/menit
    if (!rate.allowed) {
      return res.status(429).json({ error: `Sabar ya Bun, coba lagi ${rate.retryAfter} detik lagi 🙏` });
    }
    const { message, sessionId } = req.body;
    if (!message || message.length > 500) {
      return res.status(400).json({ error: 'Pesan kosong atau terlalu panjang (maks 500 karakter)' });
    }
    const reply = await chatbot.reply(sessionId || 'default', message);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Maaf Bun, ada gangguan. Coba lagi ya 🙏' });
  }
});

// === API: Quiz ===
app.post('/api/quiz', async (req, res) => {
  const ip = getIP(req);
  try {
    const rate = checkRate(ip, 60); // quiz lebih longgar
    if (!rate.allowed) {
      return res.status(429).json({ error: 'Sabar ya Bun, coba lagi sebentar 🙏' });
    }
    const { action, sessionId, answer } = req.body;
    const result = await quiz.handle(sessionId || 'default', action, answer);
    res.json(result);
  } catch (err) {
    console.error('Quiz error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler global (termasuk error multer)
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Gambar terlalu besar. Maksimal 5 MB ya Bun 💐' });
  }
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n✅ Bot S.A.R.I.N.G. berjalan di http://localhost:${PORT}\n`);
});