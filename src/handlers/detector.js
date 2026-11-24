const fs = require('fs');
const Groq = require('groq-sdk');
const exifr = require('exifr');
const sharp = require('sharp');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const HF_API = 'https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector';
const TEXT_MODEL = 'openai/gpt-oss-120b';

// === OPSI 1: Coba HuggingFace ===
async function tryHF(imagePath) {
  if (!process.env.HF_TOKEN) return null;
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    console.log('[Detector] Coba HF...');
    const response = await fetch(HF_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      body: imageBuffer,
      signal: AbortSignal.timeout(8000) // timeout 8 detik
    });
    if (!response.ok) {
      console.warn('[Detector] HF status:', response.status);
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      const artificial = data.find(d => d.label === 'artificial' || d.label === 'fake');
      if (artificial) return { persen: Math.round(artificial.score * 100), sumber: 'huggingface' };
    }
    return null;
  } catch (err) {
    console.warn('[Detector] HF gagal:', err.message);
    return null;
  }
}

// === OPSI 2: Analisis EXIF + Statistik (offline) ===
async function analyzeOffline(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  let persen = 50; // default netral
  const ciri = [];

  // 1. Cek EXIF metadata
  try {
    const exif = await exifr.parse(buffer, ['Make', 'Model', 'ISO', 'FNumber', 'ExposureTime', 'LensModel']);
    console.log('[Detector] EXIF:', exif);

    if (!exif || Object.keys(exif).length === 0) {
      persen += 25;
      ciri.push('tidak ada metadata kamera (gambar AI biasanya tidak punya)');
    } else {
      // Foto asli biasanya punya Make/Model kamera
      if (exif.Make || exif.Model) {
        persen -= 20;
        ciri.push(`ada info kamera (${exif.Make || exif.Model})`);
      }
      if (exif.ISO) {
        persen -= 10;
        ciri.push(`settingan kamera ISO ${exif.ISO}`);
      }
    }
  } catch (err) {
    console.warn('[Detector] EXIF error:', err.message);
  }

  // 2. Cek resolusi (AI sering resolusi "aneh" seperti 1024x1024 persis)
  try {
    const meta = await sharp(buffer).metadata();
    console.log('[Detector] Metadata gambar:', { width: meta.width, height: meta.height, format: meta.format });

    if (meta.width === meta.height && (meta.width === 512 || meta.width === 1024 || meta.width === 768)) {
      persen += 15;
      ciri.push(`resolusi persis ${meta.width}x${meta.height} (khas output AI)`);
    }
    if (meta.width > 4000 || meta.height > 4000) {
      persen -= 10;
      ciri.push('resolusi tinggi (khas foto kamera)');
    }
  } catch (err) {
    console.warn('[Detector] Sharp error:', err.message);
  }

  // 3. Cek kompleksitas (gambar AI kadang "terlalu mulus")
  try {
    const stats = await sharp(buffer).greyscale().stats();
    const stddev = stats.channels[0].stdev;
    console.log('[Detector] Stdev kecerahan:', stddev);
    if (stddev < 30) {
      persen += 10;
      ciri.push('gambar terlalu halus/seragam');
    }
  } catch (err) {
    console.warn('[Detector] Sharp stats error:', err.message);
  }

  persen = Math.max(5, Math.min(95, persen));
  return { persen, sumber: 'analisis offline', ciri };
}

// === Penjelasan via Groq (text-only) ===
async function explain(persen, ciri, sumber) {
  try {
    const ciriText = ciri.length > 0 ? ciri.join(', ') : 'tidak ada ciri khusus';
    const completion = await groq.chat.completions.create({
      model: TEXT_MODEL,
      messages: [{
        role: 'user',
        content: `Skor deteksi AI: ${persen}% (metode: ${sumber}). Ciri terdeteksi: ${ciriText}.

Berikan penjelasan SINGKAT (maks 3 kalimat) bahasa Indonesia hangat untuk ibu-ibu PKK. Pakai kata "Bunda". Sebutkan ciri yang terdeteksi. Kalau skor rendah (kemungkinan asli), ingatkan tetap waspada. Jangan pakai istilah teknis.`
      }],
      max_tokens: 200,
      temperature: 0.7
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    return fallback(persen);
  }
}

function fallback(persen) {
  if (persen > 70) return `Bunda, gambar ini kemungkinan besar dibuat AI (${persen}%). Ciri: mungkin tidak ada info kamera dan tekstur terlalu halus. Jangan disebar dulu ya 💐`;
  if (persen > 40) return `Bunda, gambar ini meragukan (${persen}% AI). Sebaiknya dicek ke sumber aslinya dulu 💐`;
  return `Bunda, gambar ini kemungkinan asli (${persen}% AI). Tapi tetap hati-hati ya 💐`;
}

// === MAIN ===
async function detect(imagePath) {
  // 1. Coba HF dulu (paling akurat kalau bisa diakses)
  const hfResult = await tryHF(imagePath);
  if (hfResult) {
    const penjelasan = await explain(hfResult.persen, [], 'huggingface');
    return { persen_ai: hfResult.persen, penjelasan, metode: 'huggingface' };
  }

  // 2. Fallback: analisis offline
  console.log('[Detector] HF tidak tersedia, pakai analisis offline');
  const offline = await analyzeOffline(imagePath);
  const penjelasan = await explain(offline.persen, offline.ciri, offline.sumber);
  return {
    persen_ai: offline.persen,
    penjelasan,
    metode: 'analisis offline (EXIF + statistik)'
  };
}

module.exports = { detect };