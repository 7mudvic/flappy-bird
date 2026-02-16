const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const over = document.getElementById("over");
const retryBtn = document.getElementById("retryBtn");
const scoreEl = document.getElementById("score");
const finalScoreEl = document.getElementById("finalScore");
const soundBtn = document.getElementById("soundBtn");

// منع سحب الصفحة بالجوال
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

// =====================
// SOUND (works on iPhone)
// =====================
let audioCtx = null;
let soundEnabled = true;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// لازم ننادي resume داخل "Gesture" (لمسة/ضغط) عشان iOS يسمح بالصوت
async function unlockAudio() {
  if (!soundEnabled) return;
  try {
    const ac = getAudioCtx();
    if (ac.state === "suspended") await ac.resume();
  } catch (_) {}
}

function beep(freq, dur, type = "square", vol = 0.18) {
  if (!soundEnabled) return;
  const ac = getAudioCtx();
  if (ac.state !== "running") return;

  const o = ac.createOscillator();
  const g = ac.createGain();

  o.type = type;
  o.frequency.value = freq;

  o.connect(g);
  g.connect(ac.destination);

  const t = ac.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.start(t);
  o.stop(t + dur);
}

function sStart() { beep(520, 0.10, "square", 0.16); beep(660, 0.12, "square", 0.14); }
function sFlap()  { beep(740, 0.08, "square", 0.16); }
function sScore() { beep(980, 0.10, "square", 0.14); }
function sHit()   { beep(220, 0.22, "sawtooth", 0.18); beep(140, 0.28, "sawtooth", 0.14); }

// زر كتم/تشغيل
soundBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
  if (soundEnabled) {
    await unlockAudio();
    // نغمة صغيرة للتأكيد
    beep(880, 0.08, "square", 0.12);
  }
}, { passive: false });

// =====================
// Canvas fit (fullscreen)
// =====================
function fitCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}
fitCanvas();
window.addEventListener("resize", fitCanvas);

// ===== إعدادات اللعبة =====
const G = 0.55;
const JUMP = -9.6;
const PIPE_W = 78;
const PIPE_SPACING = 265;
const GAP_START = 190;
const FLOOR_H = 95;

let speed = 3.35;
let gap = GAP_START;

// الطائر
const bird = { x: 0, y: 0, vy: 0, r: 18, wing: 0 };

let pipes = [];
let score = 0;
let running = false;
let dead = false;

function rand(min, max) { return Math.random() * (max - min) + min; }

function reset() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  bird.x = Math.round(W * 0.28);
  bird.y = Math.round(H * 0.45);
  bird.vy = 0;
  bird.wing = 0;

  pipes = [];
  score = 0;
  running = false;
  dead = false;
  speed = 3.35;
  gap = GAP_START;

  spawnPipe(W + 160);
  spawnPipe(W + 160 + PIPE_SPACING);

  scoreEl.textContent = "0";
  finalScoreEl.textContent = "0";

  over.style.display = "none";
  overlay.style.display = "flex";
}

async function startGame() {
  overlay.style.display = "none";
  over.style.display = "none";
  running = true;
  dead = false;

  await unlockAudio();   // ✅ فتح الصوت بعد لمسة
  sStart();
}

function endGame() {
  dead = true;
  running = false;
  finalScoreEl.textContent = String(score);
  over.style.display = "flex";
  sHit();
}

// أزرار
startBtn.addEventListener("click", async (e) => { e.preventDefault(); reset(); await startGame(); }, { passive:false });
retryBtn.addEventListener("click", async (e) => { e.preventDefault(); reset(); await startGame(); }, { passive:false });

// لمس على شاشة البداية يبدأ
overlay.addEventListener("pointerdown", async (e) => { e.preventDefault(); reset(); await startGame(); }, { passive:false });

async function flap() {
  if (!running || dead) return;
  await unlockAudio();   // ✅ مهم للآيفون (كل قفزة إذا كان الصوت مقفول)
  bird.vy = JUMP;
  sFlap();
}

// لمس/ضغط للقفز أثناء اللعب
window.addEventListener("pointerdown", (e) => {
  // إذا overlay/over مقفلة = داخل اللعب
  if (overlay.style.display === "none" && over.style.display === "none") {
    e.preventDefault();
    flap();
  }
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") flap();
});

// ===== Pipes =====
function spawnPipe(x) {
  const H = window.innerHeight;
  const topMin = 70;
  const topMax = H - FLOOR_H - gap - 130;
  const topH = Math.floor(rand(topMin, topMax));
  pipes.push({ x, topH, passed: false });
}

function updateDifficulty() {
  const level = Math.floor(score / 5);
  speed = 3.35 + level * 0.35;
  gap = GAP_START - Math.min(level * 10, 70);
}

// ===== رسم الخلفية =====
function drawBackground() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#6ec9ff");
  sky.addColorStop(1, "#a9e6ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // مباني خفيفة
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  const baseY = H - FLOOR_H - 120;
  for (let i = 0; i < 18; i++) {
    const bw = 30 + (i * 13) % 50;
    const bh = 40 + (i * 23) % 80;
    const x = (i * 55) % (W + 60) - 30;
    ctx.fillRect(x, baseY - bh, bw, bh);
  }

  // سحب
  function cloud(cx, cy, s) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx - 30 * s, cy, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx, cy - 8 * s, 26 * s, 0, Math.PI * 2);
    ctx.arc(cx + 30 * s, cy, 20 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  cloud(W * 0.25, H * 0.25, 1.0);
  cloud(W * 0.70, H * 0.18, 0.9);

  // أرض
  const groundY = H - FLOOR_H;
  ctx.fillStyle = "#d9d39c";
  ctx.fillRect(0, groundY, W, FLOOR_H);
  ctx.fillStyle = "#4bb648";
  ctx.fillRect(0, groundY, W, 18);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let x = 0; x < W; x += 18) ctx.fillRect(x, groundY + 8, 10, 6);

  ctx.strokeStyle = "rgba(0,0,0,0.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();
}

// ===== رسم المواسير =====
function drawPipes() {
  const H = window.innerHeight;

  function pipeBody(x, y, w, h) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#1f8f3a");
    g.addColorStop(0.35, "#49d06b");
    g.addColorStop(1, "#157a2f");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(x + w * 0.18, y, w * 0.10, h);
    ctx.fillRect(x + w * 0.62, y, w * 0.08, h);

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function pipeCap(x, y, w, h) {
    const capW = w + 14;
    const capX = x - 7;
    const g = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    g.addColorStop(0, "#1b8234");
    g.addColorStop(0.35, "#55e07a");
    g.addColorStop(1, "#136b2a");
    ctx.fillStyle = g;
    ctx.fillRect(capX, y, capW, h);

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(capX, y, capW, h);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(capX + 6, y + 4, capW - 12, 4);
  }

  for (const p of pipes) {
    pipeBody(p.x, 0, PIPE_W, p.topH);
    pipeCap(p.x, p.topH - 18, PIPE_W, 18);

    const bottomY = p.topH + gap;
    const bottomH = (H - FLOOR_H) - bottomY;
    pipeBody(p.x, bottomY, PIPE_W, bottomH);
    pipeCap(p.x, bottomY, PIPE_W, 18);
  }
}

// ===== رسم الطائر =====
function drawBird() {
  bird.wing += 0.18;
  const flapY = Math.sin(bird.wing) * 6;

  const x = bird.x;
  const y = bird.y;

  // جسم
  ctx.fillStyle = "#ffd34d";
  ctx.beginPath();
  ctx.arc(x, y, bird.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // جناح
  ctx.fillStyle = "#ffb703";
  ctx.beginPath();
  ctx.ellipse(x - 6, y + 3, 12, 8, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 12, y + 3);
  ctx.quadraticCurveTo(x - 6, y + 3 + flapY, x + 2, y + 6);
  ctx.stroke();

  // عين
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 6, y - 4, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // منقار
  ctx.fillStyle = "#ff7b00";
  ctx.beginPath();
  ctx.moveTo(x + 16, y);
  ctx.lineTo(x + 26, y + 4);
  ctx.lineTo(x + 16, y + 8);
  ctx.closePath();
  ctx.fill();
}

// ===== زر Play داخل اللعبة (قبل البدء) =====
function drawPlayButton() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  const box = 92;
  const x = (W - box) / 2;
  const y = H * 0.55 - box / 2;

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x, y, box, box);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, box, box);

  ctx.fillStyle = "#ffb03b";
  ctx.beginPath();
  ctx.moveTo(x + box * 0.40, y + box * 0.30);
  ctx.lineTo(x + box * 0.40, y + box * 0.70);
  ctx.lineTo(x + box * 0.72, y + box * 0.50);
  ctx.closePath();
  ctx.fill();
}

// ===== تصادم =====
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function hit() {
  const H = window.innerHeight;
  const r = bird.r;

  const bx = bird.x - r;
  const by = bird.y - r;
  const bs = r * 2;

  if (by <= 0) return true;
  if (by + bs >= H - FLOOR_H) return true;

  for (const p of pipes) {
    if (rectsOverlap(bx, by, bs, bs, p.x, 0, PIPE_W, p.topH)) return true;

    const bottomY = p.topH + gap;
    const bottomH = (H - FLOOR_H) - bottomY;
    if (rectsOverlap(bx, by, bs, bs, p.x, bottomY, PIPE_W, bottomH)) return true;
  }
  return false;
}

// ===== Loop =====
function update() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  drawBackground();
  drawPipes();
  drawBird();

  if (!running && !dead) {
    drawPlayButton();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("اضغط للبدء", W / 2, H * 0.72);
    requestAnimationFrame(update);
    return;
  }

  if (!running) { requestAnimationFrame(update); return; }

  // physics
  bird.vy += G;
  bird.y += bird.vy;

  updateDifficulty();

  // pipes + score
  for (const p of pipes) {
    p.x -= speed;

    if (!p.passed && p.x + PIPE_W < bird.x - bird.r) {
      p.passed = true;
      score++;
      scoreEl.textContent = String(score);
      sScore();
    }
  }

  if (pipes.length && pipes[0].x + PIPE_W < -20) pipes.shift();

  const last = pipes[pipes.length - 1];
  if (last && last.x < W + 200) spawnPipe(last.x + PIPE_SPACING);

  if (hit()) endGame();

  requestAnimationFrame(update);
}

// تشغيل
reset();
update();
