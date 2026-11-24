// Rate limiter sederhana per IP
const requests = new Map(); // { ip: { count, resetAt } }

const WINDOW_MS = 60_000;   // 1 menit
const MAX_REQUESTS = 30;    // max 30 req/menit per IP

// Cooldown khusus detektor (mahal — pakai Groq + HF)
const detectorCooldown = new Map(); // { ip: lastTimestamp }
const DETECTOR_COOLDOWN_MS = 20_000; // 20 detik antar upload

function checkRate(ip, limit = MAX_REQUESTS, windowMs = WINDOW_MS) {
  const now = Date.now();
  const entry = requests.get(ip);

  if (!entry || now > entry.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

function checkDetectorCooldown(ip) {
  const now = Date.now();
  const last = detectorCooldown.get(ip);
  if (last && now - last < DETECTOR_COOLDOWN_MS) {
    return { allowed: false, retryAfter: Math.ceil((DETECTOR_COOLDOWN_MS - (now - last)) / 1000) };
  }
  detectorCooldown.set(ip, now);
  return { allowed: true };
}

// Bersihkan entry lama setiap 10 menit agar tidak memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requests.entries()) {
    if (now > entry.resetAt) requests.delete(ip);
  }
  for (const [ip, ts] of detectorCooldown.entries()) {
    if (now - ts > DETECTOR_COOLDOWN_MS) detectorCooldown.delete(ip);
  }
}, 600_000);

module.exports = { checkRate, checkDetectorCooldown };