const Groq = require('groq-sdk');
const { TEMPLATES } = require('../templates/messages');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CHAT_MODELS = [
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b'
];

const SYSTEM_PROMPT = `Kamu adalah "Bot S.A.R.I.N.G.", asisten literasi digital untuk ibu-ibu PKK Indonesia.

IDENTITAS:
- Kamu BUKAN manusia. Kamu bot. Jangan pernah mengaku sebagai manusia.
- Kamu BUKAN Meta AI/ChatGPT/Gemini. Kamu Bot S.A.R.I.N.G.
- Kalau ditanya "kamu siapa?" → "Saya Bot S.A.R.I.N.G., teman digital Bunda 💐"

GAYA BICARA:
- Hangat seperti teman curhat, bukan robot.
- Sapa dengan "Bun"/"Bunda"/"Bu".
- Bahasa Indonesia sehari-hari, kalimat pendek (maks 12 kata).
- Maksimal 4 kalimat per jawaban.
- Emoji secukupnya (💐 😊 💪 🙏), maks 2 per jawaban.
- JANGAN pakai istilah teknis. deepfake → "video AI palsu"; hoax → "berita bohong".

FILTER KETAT:
1. JANGAN bahas politik/agama/SARA → "Maaf Bun, saya tidak bisa bantu soal itu. Yuk fokus ke literasi digital aja 💐"
2. JANGAN kasih nasihat medis/hukum/keuangan → arahkan ke profesional.
3. JANGAN minta data pribadi (NIK, HP, alamat, password, OTP).
4. JANGAN jawab topik kekerasan/dewasa/negatif.
5. Tidak tahu → "Wah Bunda, saya belum tahu pasti."
6. Pertanyaan di luar topik → jawab singkat, lalu arahkan balik ke literasi digital.

TUJUAN: Bantu ibu-ibu PKK cerdas digital, waspada hoax & video AI.`;

const history = new Map();

const COMMANDS = {
  menu: TEMPLATES.menu,
  bantuan: TEMPLATES.menu,
  help: TEMPLATES.menu,
  halo: TEMPLATES.default,
  hai: TEMPLATES.default,
  hi: TEMPLATES.default,
};

const KATA_KUNCI_SARING = ['cek', 'hoax', 'palsu', 'deepfake', 'drama ai', 'video ai', 'berita bohong'];

async function callGroq(hist) {
  let lastError;
  for (const model of CHAT_MODELS) {
    try {
      console.log(`[Chat] Mencoba model: ${model}`);
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...hist
        ],
        temperature: 0.75,
        max_tokens: 250
      }, { timeout: 8000 });
      
      const answerText = completion.choices[0].message.content;
      
      // PENGAMAN: Jika AI mengembalikan teks kosong
      if (!answerText || answerText.trim() === '') {
        throw new Error('AI mengembalikan teks kosong');
      }
      
      console.log(`[Chat] ✅ Model ${model} berhasil`);
      return answerText.trim();
    } catch (err) {
      console.warn(`[Chat] ❌ Model ${model} gagal: ${err.message}`);
      lastError = err;
    }
  }
  throw new Error(`Semua model gagal. Error: ${lastError?.message || 'unknown'}`);
}

async function reply(sessionId, message) {
  const msg = message.toLowerCase().trim();

  if (COMMANDS[msg]) return COMMANDS[msg];

  if (msg === 'kuis' || msg === 'mulai kuis' || msg === 'main kuis') {
    return '__START_QUIZ__';
  }

  if (KATA_KUNCI_SARING.some(k => msg.includes(k)) && msg.length < 50) {
    return TEMPLATES.saring;
  }

  let hist = history.get(sessionId) || [];
  hist.push({ role: 'user', content: message });
  if (hist.length > 12) hist = hist.slice(-12);

  try {
    const answer = await callGroq(hist);
    hist.push({ role: 'assistant', content: answer });
    history.set(sessionId, hist);
    return answer;
  } catch (err) {
    console.error('[Chat] Semua model gagal:', err.message);
    return `Maaf Bun, saya sedang ada gangguan. Coba tanya lagi sebentar ya 🙏`;
  }
}

module.exports = { reply };