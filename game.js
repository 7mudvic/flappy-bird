const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");

const screenStart = document.getElementById("screenStart");
const screenReady = document.getElementById("screenReady");
const screenOver  = document.getElementById("screenOver");

const btnStart = document.getElementById("btnStart");
const btnRetry = document.getElementById("btnRetry");

const finalScoreEl = document.getElementById("finalScore");
const bestScoreEl  = document.getElementById("bestScore");

// منع سحب الصفحة بالجوال
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive:false });

/* =========================
   Resize (فل سكرين مضبوط)
========================= */
function fitCanvas() {
  const vw = window.visualViewport?.width  ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;

  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width  = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);

  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
}
fitCanvas();
window.addEventListener("resize", fitCanvas);
window.visualViewport?.addEventListener("resize", fitCanvas);

/* =========================
   Audio (قريب لفلابي)
   ملاحظة: لازم أول تفاعل من المستخدم
========================= */
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone({freq=440, dur=0.08, type="square", vol=0.12, bendTo=null}) {
  if (!audioCtx) return;

  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();

  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (bendTo) o.frequency.exponentialRampToValueAtTime(bendTo, t0 + dur);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  o.connect(g);
  g.connect(audioCtx.destination);

  o.start(t0);
  o.stop(t0 + dur);
}

function sFlap()  { tone({freq: 620, dur: 0.06, type:"square", vol:0.10, bendTo:520}); }
function sScore() { tone({freq: 980, dur: 0.09, type:"triangle", vol:0.11, bendTo:1200}); }
function sHit()   {
  tone({freq: 220, dur: 0.14, type:"sawtooth", vol:0.10, bendTo:120});
  setTimeout(()=>tone({freq: 120, dur: 0.20, type:"sawtooth", vol:0.08, bendTo:90}), 70);
}
function sStart() { tone({freq: 520, dur: 0.08, type:"square", vol:0.10, bendTo:660}); }

/* =========================
   Game constants
========================= */
const FLOOR_H = 92;
const PIPE_W = 78;
const PIPE_SPACING = 260;
const GAP_START = 190;

let G = 0.55;
let JUMP = -9.6;
let speed = 3.35;
let gap = GAP_START;

let state = "start"; // start | ready | play | over
let pipes = [];
let score = 0;
let best = Number(localStorage.getItem("bestScore") || 0);

/* =========================
   Bird (Pixel-ish)
========================= */
const bird = { x: 0, y: 0, vy: 0, w: 16, h: 12, frame: 0, tick: 0, rot: 0 };

// رسم طائر بكسل (بدون صور)
function drawPixelBird(x, y, frame, rot) {
  // frame: 0/1/2
  const S = 3; // scale
  const pw = bird.w;
  const ph = bird.h;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.translate(-pw*S/2, -ph*S/2);

  ctx.imageSmoothingEnabled = false;

  const body = "#f5d64b";
  const belly = "#ffd96c";
  const outline = "#2b1b10";
  const wing = (frame === 1) ? "#f0b23c" : "#eaa12f";
  const beak = "#f28b2c";
  const white = "#ffffff";
  const eye = "#1a1a1a";

  // helper pixel
  const px = (xx, yy, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(xx*S, yy*S, S, S);
  };

  // جسم (شكل قريب)
  const bodyMap = [
    "....OOOOOOOO....",
    "...OOOOOOOOOO...",
    "..OOOOOOOOOOOO..",
    "..OOOOOOOOBBOO..",
    "..OOOOOOOOOOOO..",
    "...OOOOOOOOOO...",
    "....OOOOOOOO....",
    ".....OOOOOO.....",
    "......OOOO......",
    ".......OO.......",
    "................",
    "................",
  ];

  for (let yy=0; yy<bodyMap.length; yy++){
    for (let xx=0; xx<bodyMap[yy].length; xx++){
      const c = bodyMap[yy][xx];
      if (c === "O") px(xx, yy, body);
      if (c === "B") px(xx, yy, belly);
    }
  }

  // جناح (يتحرك)
  const wingY = frame === 0 ? 5 : frame === 1 ? 3 : 6;
  const wingMap = [
    "..WWWW..",
    ".WWWWWW.",
    "..WWWW..",
  ];
  for (let yy=0; yy<wingMap.length; yy++){
    for (let xx=0; xx<wingMap[yy].length; xx++){
      if (wingMap[yy][xx] === "W") px(3+xx, wingY+yy, wing);
    }
  }

  // عين
  px(11, 3, white); px(12, 3, white);
  px(12, 4, eye);

  // منقار
  px(14, 4, beak);
  px(15, 4, beak);
  px(14, 5, beak);

  // حدود بسيطة (outline)
  // (حد خفيف حول الجسم)
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.strokeRect(2*S, 1*S, (pw-4)*S, (ph-6)*S);
  ctx.globalAlpha = 1;

  ctx.restore();
}

/* =========================
   Background + Pipes
========================= */
let bgTick = 0;

function drawBackground(W, H) {
  // السماء
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,"#6ec9ff");
  sky.addColorStop(1,"#a9e6ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,W,H);

  // مباني خلفية
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  const baseY = H - FLOOR_H - 120;
  const shift = (bgTick * 0.3) % 60;
  for (let i=0;i<22;i++){
    const bw = 28 + (i*17)%48;
    const bh = 35 + (i*29)%90;
    const x = (i*55 - shift) % (W+80) - 40;
    ctx.fillRect(x, baseY-bh, bw, bh);
  }

  // غيوم
  function cloud(cx,cy,s){
    ctx.fillStyle="rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(cx-30*s, cy, 18*s, 0, Math.PI*2);
    ctx.arc(cx, cy-8*s, 26*s, 0, Math.PI*2);
    ctx.arc(cx+30*s, cy, 20*s, 0, Math.PI*2);
    ctx.fill();
  }
  cloud(W*0.25 - (bgTick*0.25)%W, H*0.24, 1.0);
  cloud(W*0.70 - (bgTick*0.18)%W, H*0.18, 0.9);

  // الأرض
  const groundY = H - FLOOR_H;
  ctx.fillStyle="#d9d39c";
  ctx.fillRect(0, groundY, W, FLOOR_H);

  // عشب
  ctx.fillStyle="#4bb648";
  ctx.fillRect(0, groundY, W, 18);

  // مربعات العشب
  ctx.fillStyle="rgba(0,0,0,0.12)";
  for (let x=0;x<W;x+=18) ctx.fillRect(x, groundY+8, 10, 6);

  // خط
  ctx.strokeStyle="rgba(0,0,0,0.20)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();
}

function pipeGradient(x, w) {
  const g = ctx.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0,"#1f8f3a");
  g.addColorStop(0.35,"#49d06b");
  g.addColorStop(1,"#157a2f");
  return g;
}

function drawPipes(H) {
  function pipeBody(x,y,w,h){
    ctx.fillStyle = pipeGradient(x,w);
    ctx.fillRect(x,y,w,h);

    ctx.fillStyle="rgba(255,255,255,0.10)";
    ctx.fillRect(x+w*0.18,y,w*0.10,h);
    ctx.fillRect(x+w*0.62,y,w*0.08,h);

    ctx.strokeStyle="rgba(0,0,0,0.35)";
    ctx.lineWidth=2;
    ctx.strokeRect(x,y,w,h);
  }

  function pipeCap(x,y,w,h){
    const capW = w+14;
    const capX = x-7;

    ctx.fillStyle = pipeGradient(capX,capW);
    ctx.fillRect(capX,y,capW,h);

    ctx.strokeStyle="rgba(0,0,0,0.35)";
    ctx.lineWidth=2;
    ctx.strokeRect(capX,y,capW,h);

    ctx.fillStyle="rgba(255,255,255,0.12)";
    ctx.fillRect(capX+6,y+4,capW-12,4);
  }

  for (const p of pipes) {
    // top
    pipeBody(p.x, 0, PIPE_W, p.topH);
    pipeCap(p.x, p.topH-18, PIPE_W, 18);

    // bottom
    const bottomY = p.topH + gap;
    const bottomH = (H - FLOOR_H) - bottomY;
    pipeBody(p.x, bottomY, PIPE_W, bottomH);
    pipeCap(p.x, bottomY, PIPE_W, 18);
  }
}

/* =========================
   Pipes logic
========================= */
function rand(min, max){ return Math.random() * (max-min) + min; }

function spawnPipe(x, H){
  const topMin = 70;
  const topMax = H - FLOOR_H - gap - 130;
  const topH = Math.floor(rand(topMin, topMax));
  pipes.push({ x, topH, passed:false });
}

function updateDifficulty(){
  const level = Math.floor(score / 5);
  speed = 3.35 + level * 0.35;
  gap = GAP_START - Math.min(level * 10, 70);
}

/* =========================
   Collision
========================= */
function rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh){
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function hit(W, H){
  const bw = bird.w * 3;
  const bh = bird.h * 3;
  const bx = bird.x - bw/2;
  const by = bird.y - bh/2;

  if (by <= 0) return true;
  if (by + bh >= H - FLOOR_H) return true;

  for (const p of pipes){
    if (rectsOverlap(bx,by,bw,bh, p.x,0, PIPE_W,p.topH)) return true;

    const bottomY = p.topH + gap;
    const bottomH = (H - FLOOR_H) - bottomY;
    if (rectsOverlap(bx,by,bw,bh, p.x,bottomY, PIPE_W,bottomH)) return true;
  }
  return false;
}

/* =========================
   State / UI
========================= */
function setScreen(which){
  screenStart.classList.remove("show");
  screenReady.classList.remove("show");
  screenOver.classList.remove("show");

  if (which === "start") screenStart.classList.add("show");
  if (which === "ready") screenReady.classList.add("show");
  if (which === "over")  screenOver.classList.add("show");
}

function resetGame(){
  const W = window.visualViewport?.width  ?? window.innerWidth;
  const H = window.visualViewport?.height ?? window.innerHeight;

  bird.x = Math.round(W * 0.28);
  bird.y = Math.round(H * 0.45);
  bird.vy = 0;
  bird.frame = 0;
  bird.tick = 0;
  bird.rot = 0;

  pipes = [];
  score = 0;
  speed = 3.35;
  gap = GAP_START;

  spawnPipe(W + 200, H);
  spawnPipe(W + 200 + PIPE_SPACING, H);

  scoreEl.textContent = "0";
  scoreEl.classList.remove("on");

  finalScoreEl.textContent = "0";
  bestScoreEl.textContent = String(best);

  state = "start";
  setScreen("start");
}

function startPressed(){
  initAudio();
  sStart();
  state = "ready";
  setScreen("ready");
  // نخلي السكور يطلع بس عند اللعب
}

function beginPlay(){
  // تبدأ اللعب مع أول Tap بعد شاشة ready
  state = "play";
  setScreen(null);
  scoreEl.classList.add("on");
  flap(); // أول قفزة
}

function gameOver(){
  state = "over";
  setScreen("over");

  finalScoreEl.textContent = String(score);

  if (score > best) {
    best = score;
    localStorage.setItem("bestScore", String(best));
  }
  bestScoreEl.textContent = String(best);

  sHit();
}

function flap(){
  if (state !== "play") return;
  initAudio();
  bird.vy = JUMP;
  sFlap();
}

/* =========================
   Input
========================= */
btnStart.addEventListener("click", (e)=>{ e.preventDefault(); startPressed(); }, { passive:false });
btnRetry.addEventListener("click", (e)=>{ e.preventDefault(); resetGame(); startPressed(); }, { passive:false });

function onPointerDown(e){
  e.preventDefault();

  // مهم: أول لمسة تشغل الصوت (سياسات iOS)
  initAudio();

  if (state === "start") {
    startPressed();
    return;
  }
  if (state === "ready") {
    beginPlay();
    return;
  }
  if (state === "play") {
    flap();
    return;
  }
  if (state === "over") {
    resetGame();
    startPressed();
    return;
  }
}
window.addEventListener("pointerdown", onPointerDown, { passive:false });

window.addEventListener("keydown", (e)=>{
  if (e.code === "Space" || e.code === "ArrowUp") {
    // نفس منطق اللمس
    if (state === "start") startPressed();
    else if (state === "ready") beginPlay();
    else if (state === "play") flap();
    else if (state === "over") { resetGame(); startPressed(); }
  }
});

/* =========================
   Loop
========================= */
function update(){
  const W = window.visualViewport?.width  ?? window.innerWidth;
  const H = window.visualViewport?.height ?? window.innerHeight;

  bgTick += 1;

  drawBackground(W,H);
  drawPipes(H);

  // idle animation للطائر
  if (state === "start" || state === "ready") {
    bird.tick++;
    bird.y += Math.sin(bird.tick * 0.06) * 0.35;
    bird.frame = Math.floor((bird.tick / 10) % 3);
    bird.rot = Math.sin(bird.tick * 0.06) * 0.06;
  }

  // لعب
  if (state === "play") {
    bird.tick++;
    bird.frame = Math.floor((bird.tick / 6) % 3);

    bird.vy += G;
    bird.y += bird.vy;

    bird.rot = Math.max(-0.6, Math.min(1.1, bird.vy * 0.06));

    updateDifficulty();

    // تحريك المواسير + السكور
    for (const p of pipes) {
      p.x -= speed;

      if (!p.passed && p.x + PIPE_W < bird.x - 20) {
        p.passed = true;
        score++;
        scoreEl.textContent = String(score);
        sScore();
      }
    }

    // حذف اللي طلع برا
    if (pipes.length && pipes[0].x + PIPE_W < -30) pipes.shift();

    // سباون جديد
    const last = pipes[pipes.length - 1];
    if (last && last.x < W + 200) spawnPipe(last.x + PIPE_SPACING, H);

    if (hit(W,H)) gameOver();
  }

  // رسم الطائر (آخر شيء فوق)
  drawPixelBird(bird.x, bird.y, bird.frame, bird.rot);

  requestAnimationFrame(update);
}

/* تشغيل */
resetGame();
update();
