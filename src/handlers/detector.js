const fs = require('fs');
const Groq = require('groq-sdk');
const exifr = require('exifr');
const sharp = require('sharp');
const axios = require('axios');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const HF_API = 'https://api-inference.huggingface.co/models/umm-maybe/AI-image-detector';
const TEXT_MODEL = 'openai/gpt-oss-120b';

// 1. Coba HuggingFace (Maksimal 5 detik agar tidak timeout Vercel)
async function tryHF(imagePath) {
  if (!process.env.HF_TOKEN) {
    console.log('[HF] GAGAL: HF_TOKEN tidak ada');
    return null;
  }
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    
    // Gunakan axios yang lebih stabil di Vercel
    const response = await axios.post(HF_API, imageBuffer, {
      headers: {
        'Authorization': `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/octet-stream'
      },
      timeout: 9000 // Naikkan batas waktu ke 9 detik (maksimal Vercel 10 detik)
    });

    const data = response.data;
    if (Array.isArray(data)) {
      const artificial = data.find(d => d.label === 'artificial' || d.label === 'fake');
      if (artificial) return { persen: Math.round(artificial.score * 100), sumber: 'HuggingFace AI' };
    }
    console.log('[HF] GAGAL: Format response tidak dikenali', data);
    return null;
  } catch (err) {
    console.log('[HF] GAGAL:', err.message);
    return null;
  }
}

// 2. Analisis Offline (Fallback)
async function analyzeOffline(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  let persen = 50; 
  const ciri = [];

  try {
    const exif = await exifr.parse(buffer, ['Make', 'Model', 'ISO']);
    if (!exif || Object.keys(exif).length === 0) {
      persen += 20;
      ciri.push('tidak ada metadata kamera');
    } else {
      if (exif.Make || exif.Model) persen -= 20;
    }
  } catch (err) {}

  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width === meta.height && (meta.width === 512 || meta.width === 1024)) {
      persen += 15;
      ciri.push('resolusi persegi khas AI');
    }
  } catch (err) {}

  persen = Math.max(10, Math.min(95, persen));
  return { persen, sumber: 'Analisis Offline (Ciri Visual)', ciri };
}

// 3. Penjelasan dari Groq (Selalu menghasilkan teks)
async function explain(persen, ciri, sumber) {
  const ciriText = ciri.length > 0 ? ciri.join(', ') : 'tidak ada ciri khusus';
  try {
    const completion = await groq.chat.completions.create({
      model: TEXT_MODEL,
      messages: [{
        role: 'user',
        content: `Sistem mendeteksi gambar ini memiliki skor ${persen}% AI (metode: ${sumber}, ciri: ${ciriText}).
Berikan penjelasan SINGKAT (maks 3 kalimat) bahasa Indonesia hangat untuk ibu-ibu PKK. Pakai kata "Bunda". Sebutkan alasan berdasarkan skor dan ciri tersebut. Jangan pakai istilah teknis.`
      }],
      max_tokens: 200,
      temperature: 0.7
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    if (persen > 70) return `Bunda, gambar ini kemungkinan besar dibuat AI (${persen}%). Ciri: mungkin tekstur terlalu halus atau tidak ada info kamera. Jangan disebar dulu ya 💐`;
    if (persen > 40) return `Bunda, gambar ini meragukan (${persen}% AI). Sebaiknya dicek ke sumber aslinya dulu sebelum bertindak 💐`;
    return `Bunda, gambar ini kemungkinan asli (hanya ${persen}% AI). Tapi tetap hati-hati saat menerima pesan berantai ya 💐`;
  }
}

// 4. Fungsi Utama
async function detect(imagePath) {
  let result = await tryHF(imagePath);
  
  if (!result) {
    console.log('[Detector] Beralih ke analisis offline');
    result = await analyzeOffline(imagePath);
  }

  const penjelasan = await explain(result.persen, result.ciri || [], result.sumber);
  
  return { 
    persen_ai: result.persen, 
    penjelasan: penjelasan, 
    metode: result.sumber 
  };
}

module.exports = { detect };