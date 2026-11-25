const fs = require('fs');
const exifr = require('exifr');
const sharp = require('sharp');

// Prioritas model: LITE dulu (paling cepat & jarang sibuk), baru FLASH
const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash'
];

// ==========================================
// 1. GEMINI VISION (AI Utama)
// ==========================================
async function detectWithGemini(imagePath) {
  if (!process.env.GEMINI_API_KEY) {
    return { error: "❌ GEMINI_API_KEY KOSONG." };
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  
  const prompt = `Kamu adalah pendeteksi gambar AI profesional untuk ibu-ibu PKK.
Analisis gambar ini dengan SANGAT TELITI apakah ini buatan AI atau foto asli.
PERIKSA: Tangan/jari, Wajah (kulit, mata, gigi), Teks, Latar belakang, Pencahayaan.
Balas HANYA dalam JSON format ini:
{"persen_ai": <0-100>, "penjelasan": "<3 kalimat SPESIFIK ciri visual KONKRET, bahasa hangat pakai 'Bunda'>"}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: base64 } }] }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  let lastError = "";

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000) // Maksimal 4 detik
      });

      if (!response.ok) {
        const data = await response.json();
        lastError = data.error?.message || "Error HTTP " + response.status;
        continue;
      }

      const data = await response.json();
      const raw = data.candidates[0].content.parts[0].text.trim();
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        lastError = "Format JSON tidak valid";
        continue;
      }
      
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        persen_ai: Math.max(0, Math.min(100, Math.round(parsed.persen_ai))),
        penjelasan: parsed.penjelasan,
        metode: `Gemini Vision (${model})`
      };
      
    } catch (err) {
      lastError = err.name === 'TimeoutError' ? "Timeout (4 detik)" : err.message;
    }
  }

  return { error: lastError };
}

// ==========================================
// 2. HUGGINGFACE (Backup AI)
// ==========================================
async function detectWithHF(imagePath) {
  if (!process.env.HF_TOKEN) return null;
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const response = await fetch('https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.HF_TOKEN}`, 'Content-Type': 'application/octet-stream' },
      body: imageBuffer,
      signal: AbortSignal.timeout(3000) // Maksimal 3 detik
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
// 3. OFFLINE (Analisis Cepat / Fallback)
// ==========================================
async function analyzeOffline(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  let persen = 50;
  const ciri = [];
  
  try {
    const exif = await exifr.parse(buffer, ['Make', 'Model', 'ISO']);
    if (!exif || Object.keys(exif).length === 0) { 
      persen += 20; 
      ciri.push('tidak ada metadata kamera'); 
    } else if (exif.Make || exif.Model) { 
      persen -= 25; 
      ciri.push(`ada info kamera ${exif.Make || exif.Model}`); 
    }
  } catch (e) {}
  
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width === 1024 && meta.height === 1024) { 
      persen += 15; 
      ciri.push('resolusi persis 1024x1024 (khas AI)'); 
    }
  } catch (e) {}
  
  persen = Math.max(5, Math.min(95, persen));
  return { persen, ciri };
}

// ==========================================
// MAIN (Dengan Copywriting Profesional)
// ==========================================
async function detect(imagePath) {
  // 1. Coba Gemini (AI Utama)
  const geminiResult = await detectWithGemini(imagePath);
  if (geminiResult && !geminiResult.error) return geminiResult;

  // 2. Coba HuggingFace (Backup AI)
  const hfPersen = await detectWithHF(imagePath);
  if (hfPersen !== null) {
    return { 
      persen_ai: hfPersen, 
      penjelasan: `Bunda, sistem mendeteksi gambar ini ${hfPersen}% kemungkinan dibuat AI. Ciri umum gambar AI: jari tidak natural, teks kacau, atau bayangan aneh. Kalau ragu, jangan disebar dulu ya 💐`, 
      metode: 'Analisis Sistem' 
    };
  }

  // 3. Fallback Offline (Analisis Cepat)
  const offline = await analyzeOffline(imagePath);
  
  // Menyembunyikan error teknis, diganti dengan pesan empatik
  return {
    persen_ai: offline.persen,
    penjelasan: `Bunda, ini hasil *Analisis Cepat* kami (${offline.persen}%). Ciri terdeteksi: ${offline.ciri.join(', ')}. \n\nUntuk penjelasan yang lebih tajam, tunggu beberapa saat lalu klik "Coba Foto Lain" ya 💐`,
    metode: 'Analisis Cepat (Offline)'
  };
}

module.exports = { detect };