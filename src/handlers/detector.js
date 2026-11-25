const fs = require('fs');
const exifr = require('exifr');
const sharp = require('sharp');

// Daftar model cadangan (dari yang paling pintar ke paling ringan)
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite'
];

// Fungsi untuk delay (jeda)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGeminiWithRetry(model, payload, apiKey, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errMsg = data.error?.message || "Error tidak diketahui";
        // Jika error karena sibuk (503/429), tunggu lalu coba lagi
        if ((response.status === 503 || response.status === 429) && attempt < maxRetries) {
          console.log(`[Gemini] ${model} sibuk, coba lagi dalam ${attempt * 2} detik...`);
          await sleep(attempt * 2000);
          continue;
        }
        return { error: errMsg };
      }

      const raw = data.candidates[0].content.parts[0].text.trim();
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { error: "Format JSON tidak ditemukan" };
      
      return { parsed: JSON.parse(jsonMatch[0]) };
      
    } catch (err) {
      if (attempt < maxRetries) {
        await sleep(attempt * 2000);
        continue;
      }
      return { error: err.message };
    }
  }
}

async function detectWithGemini(imagePath) {
  if (!process.env.GEMINI_API_KEY) {
    return { error: "❌ GEMINI_API_KEY KOSONG." };
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  
  const prompt = `Kamu adalah pendeteksi gambar AI profesional untuk ibu-ibu PKK.
Analisis gambar ini dengan SANGAT TELITI apakah ini buatan AI atau foto asli.
PERIKSA: Tangan/jari, Wajah (kulit, mata, gigi), Teks/tulisan, Latar belakang, dan Pencahayaan.
Balas HANYA dalam JSON format ini (tanpa teks lain):
{
  "persen_ai": <angka 0-100>,
  "penjelasan": "<3-4 kalimat SPESIFIK menyebutkan ciri visual KONKRET. Bahasa Indonesia hangat, pakai 'Bunda'>"
}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64 } }] }]
  };

  let lastError = "";

  // COBA SEMUA MODEL SATU PER SATU
  for (const model of GEMINI_MODELS) {
    console.log(`[Gemini] Mencoba model: ${model}`);
    const result = await callGeminiWithRetry(model, payload, process.env.GEMINI_API_KEY);
    
    if (result.parsed) {
      console.log(`[Gemini] ✅ Berhasil dengan ${model}`);
      return {
        persen_ai: Math.max(0, Math.min(100, Math.round(result.parsed.persen_ai))),
        penjelasan: result.parsed.penjelasan,
        metode: `Gemini Vision (${model})`
      };
    }
    
    lastError = result.error;
    console.log(`[Gemini] ❌ ${model} gagal: ${result.error}`);
  }

  return { error: `Semua model Gemini sibuk. ${lastError}` };
}

// ==========================================
// 2. HUGGINGFACE (Backup)
// ==========================================
async function detectWithHF(imagePath) {
  if (!process.env.HF_TOKEN) return null;
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const response = await fetch('https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/octet-stream' },
      body: imageBuffer,
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (Array.isArray(data)) {
      const artificial = data.find(d => d.label === 'artificial' || d.label === 'fake');
      if (artificial) return Math.round(artificial.score * 100);
    }
    return null;
  } catch (err) { return null; }
}

// ==========================================
// 3. OFFLINE (Fallback)
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
  if (geminiResult && !geminiResult.error) return geminiResult;

  const hfPersen = await detectWithHF(imagePath);
  if (hfPersen !== null) {
    return { persen_ai: hfPersen, penjelasan: `Bunda, sistem mendeteksi gambar ini ${hfPersen}% kemungkinan dibuat AI.`, metode: 'HuggingFace' };
  }

  const offline = await analyzeOffline(imagePath);
  return {
    persen_ai: offline.persen,
    penjelasan: `[MODE OFFLINE] Ciri: ${offline.ciri.join(', ')}. Info: AI utama sedang sibuk. Silakan coba lagi dalam 1-2 menit.`,
    metode: 'Analisis offline'
  };
}

module.exports = { detect };