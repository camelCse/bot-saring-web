const fs = require('fs');
const exifr = require('exifr');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const HF_API = 'https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector';

// ==========================================
// 1. GEMINI VISION
// ==========================================
async function detectWithGemini(imagePath) {
  if (!process.env.GEMINI_API_KEY) {
    console.log('[Detector] ❌ GEMINI_API_KEY tidak ditemukan di .env');
    return null;
  }

  try {
    console.log('[Detector] Mencoba Gemini Vision...');
    
    // Menggunakan model paling stabil saat ini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const imageBuffer = fs.readFileSync(imagePath);

    const prompt = `Kamu adalah pendeteksi gambar AI profesional untuk ibu-ibu PKK.
Analisis gambar ini dengan SANGAT TELITI apakah ini buatan AI atau foto asli.

PERIKSA DENGAN CERMAT:
1. Tangan & jari: jumlah, proporsi, bentuk aneh?
2. Wajah: tekstur kulit, mata, gigi, telinga, simetri
3. Teks/tulisan dalam gambar: jelas, konsisten, atau kacau?
4. Latar belakang: blur aneh, objek tidak masuk akal, distorsi?
5. Pencahayaan & bayangan: konsisten atau tidak?
6. Detail kecil: rambut, kancing, perhiasan, aksesoris
7. Artefak visual: pola aneh, tepi tidak tajam

Balas HANYA dalam JSON format ini (tanpa teks lain):
{
  "persen_ai": <angka 0-100>,
  "penjelasan": "<3-4 kalimat SPESIFIK menyebutkan ciri visual KONKRET yang terlihat di gambar ini. Bahasa Indonesia hangat, pakai 'Bunda', tanpa istilah teknis>"
}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: 'image/jpeg', data: imageBuffer.toString('base64') } }
    ]);

    const raw = result.response.text().trim();
    console.log('[Detector] ✅ Gemini Response:', raw.substring(0, 200));

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Format JSON tidak ditemukan');
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      persen_ai: Math.max(0, Math.min(100, Math.round(parsed.persen_ai))),
      penjelasan: parsed.penjelasan,
      metode: 'Gemini Vision AI'
    };
  } catch (err) {
    console.error('[Detector] ❌ Error Gemini:', err.message);
    return null;
  }
}

// ==========================================
// 2. HUGGINGFACE (Backup)
// ==========================================
async function detectWithHF(imagePath) {
  if (!process.env.HF_TOKEN) return null;
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    console.log('[Detector] Mencoba HuggingFace...');
    const response = await fetch(HF_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer,
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
       console.warn('[Detector] ❌ HF Error HTTP:', response.status);
       return null;
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      const artificial = data.find(d => d.label === 'artificial' || d.label === 'fake');
      if (artificial) return Math.round(artificial.score * 100);
    }
    return null;
  } catch (err) {
    console.warn('[Detector] ❌ HF Gagal:', err.message);
    return null;
  }
}

// ==========================================
// 3. OFFLINE (Last resort)
// ==========================================
async function analyzeOffline(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  let persen = 50;
  const ciri = [];
  try {
    const exif = await exifr.parse(buffer, ['Make', 'Model', 'ISO']);
    if (!exif || Object.keys(exif).length === 0) { persen += 20; ciri.push('tidak ada metadata kamera'); }
    else if (exif.Make || exif.Model) { persen -= 25; ciri.push(`ada info kamera ${exif.Make || exif.Model}`); }
  } catch (e) {}
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width === 1024 && meta.height === 1024) { persen += 15; ciri.push('resolusi persis 1024x1024 (khas AI)'); }
  } catch (e) {}
  persen = Math.max(5, Math.min(95, persen));
  return { persen, ciri };
}

// ==========================================
// MAIN
// ==========================================
async function detect(imagePath) {
  const geminiResult = await detectWithGemini(imagePath);
  if (geminiResult) return geminiResult;

  const hfPersen = await detectWithHF(imagePath);
  if (hfPersen !== null) {
    return {
      persen_ai: hfPersen,
      penjelasan: `Bunda, sistem mendeteksi gambar ini ${hfPersen}% kemungkinan dibuat AI. Ciri umum gambar AI: jari tangan tidak natural, teks kacau, atau bayangan aneh. Kalau ragu, jangan disebar dulu ya 💐`,
      metode: 'HuggingFace'
    };
  }

  console.log('[Detector] ⚠️ Semua API gagal, pakai offline');
  const offline = await analyzeOffline(imagePath);
  return {
    persen_ai: offline.persen,
    penjelasan: `Bunda, koneksi ke AI sedang terputus. Hasil sementara menunjukkan ${offline.persen}%. Ciri: ${offline.ciri.join(', ') || 'tidak spesifik'}. Coba lagi nanti ya 💐`,
    metode: 'Analisis offline'
  };
}

module.exports = { detect };