'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const startScreen = document.getElementById('startScreen');
const readyScreen = document.getElementById('readyScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseScreen = document.getElementById('pauseScreen');
const pauseBtn = document.getElementById('pauseBtn');

const startBtn = document.getElementById('startBtn');
const okBtn = document.getElementById('okBtn');
const shareBtn = document.getElementById('shareBtn');
const resumeBtn = document.getElementById('resumeBtn');

const finalScoreEl = document.getElementById('finalScore');
const bestScoreEl = document.getElementById('bestScore');
const medalEl = document.getElementById('medal');

let W = 0, H = 0, DPR = 1;

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive:false });

function fitCanvas(){
  DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  W = Math.floor(window.innerWidth);
  H = Math.floor(window.innerHeight);

  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(DPR, DPR);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// =====================
// GAME SETTINGS (سلسة ومتوسطة)
// =====================
const GRAVITY = 0.42;
const JUMP_V = -5.7;
const PIPE_W = 78;
const PIPE_SPACING = 280;
const GAP_START = 200;
const FLOOR_H = 110;

let speed = 3.2;
let gap = GAP_START;

const bird = { x:0, y:0, vy:0, r:14, rot:0 };

let pipes = [];
let score = 0;
let bestScore = Number(localStorage.getItem('bestScore') || 0);

let state = 'start'; // start | ready | play | over
let paused = false;

// shake + flash (إضافة)
let shakeT = 0;
let shakePower = 0;
let flashT = 0;

// score spark (إضافة)
let sparkT = 0;

// count-up (إضافة)
let countFrom = 0;
let countTo = 0;
let countT = 0;

// =====================
// AUDIO (أقرب + أنعم)
// =====================
let audioCtx = null;
let masterGain = null;

function initAudio(){
  if (!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function tone(freq, dur, type='square', vol=0.22){
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;

  o.connect(g);
  g.connect(masterGain);

  const t = audioCtx.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  o.start(t);
  o.stop(t + dur);
}

// أصوات أنعم شوي (إضافة تحسين)
function sStart(){ tone(660, 0.08, 'square', 0.18); tone(880, 0.10, 'square', 0.14); }
function sFlap(){ tone(760, 0.05, 'square', 0.16); }
function sScore(){ tone(990, 0.06, 'square', 0.14); tone(1320, 0.06, 'square', 0.10); }
function sHit(){ tone(220, 0.18, 'sawtooth', 0.20); tone(140, 0.24, 'sawtooth', 0.14); }

// =====================
// UI helpers
// =====================
function showScreen(which){
  startScreen.classList.remove('show');
  readyScreen.classList.remove('show');
  gameOverScreen.classList.remove('show');
  pauseScreen.classList.remove('show');

  if (which === 'start') startScreen.classList.add('show');
  if (which === 'ready') readyScreen.classList.add('show');
  if (which === 'over') gameOverScreen.classList.add('show');
  if (which === 'pause') pauseScreen.classList.add('show');
}

// ميداليات أصعب (كما طلبت)
function setMedal(s){
  medalEl.className = 'medal none';
  if (s >= 15) medalEl.className = 'medal white';
  if (s >= 30) medalEl.className = 'medal silver';
  if (s >= 45) medalEl.className = 'medal bronze';
  if (s >= 60) medalEl.className = 'medal gold';
  if (s >= 80) medalEl.className = 'medal platinum';

  // pop animation (إضافة)
  if (!medalEl.classList.contains('none')){
    medalEl.classList.add('pop');
    setTimeout(()=> medalEl.classList.remove('pop'), 260);
  }
}

// =====================
// DIGIT FONT (Pixel-like)
// =====================
const DIG = {
  '0': ["111","101","101","101","111"],
  '1': ["010","110","010","010","111"],
  '2': ["111","001","111","100","111"],
  '3': ["111","001","111","001","111"],
  '4': ["101","101","111","001","001"],
  '5': ["111","100","111","001","111"],
  '6': ["111","100","111","101","111"],
  '7': ["111","001","001","001","001"],
  '8': ["111","101","111","101","111"],
  '9': ["111","101","111","001","111"]
};

function drawDigit(d, x, y, scale, fill, stroke){
  const map = DIG[d];
  if (!map) return 0;
  const px = scale;

  ctx.fillStyle = stroke;
  for (let r=0;r<5;r++){
    for (let c=0;c<3;c++){
      if (map[r][c] === '1'){
        ctx.fillRect(x + c*px - 2, y + r*px - 2, px + 4, px + 4);
      }
    }
  }

  ctx.fillStyle = fill;
  for (let r=0;r<5;r++){
    for (let c=0;c<3;c++){
      if (map[r][c] === '1'){
        ctx.fillRect(x + c*px, y + r*px, px, px);
      }
    }
  }

  return 3 * px;
}

function drawScoreNumber(numStr, centerX, topY){
  const scale = Math.max(6, Math.floor(W / 70));
  const gap2 = Math.floor(scale * 0.8);

  let totalW = 0;
  for (const ch of numStr) totalW += 3*scale + gap2;
  totalW -= gap2;

  let x = Math.floor(centerX - totalW/2);
  const y = topY;

  for (const ch of numStr){
    drawDigit(ch, x, y, scale, '#ffffff', '#111111');
    x += 3*scale + gap2;
  }

  // spark (إضافة)
  if (sparkT > 0){
    const a = Math.min(1, sparkT/10);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerX + totalW/2 + 8, y + 6, 6, 6);
    ctx.fillRect(centerX + totalW/2 + 18, y + 16, 4, 4);
    ctx.globalAlpha = 1;
  }
}

// =====================
// BACKGROUND (ثابت)
// =====================
const stars = [];
function initStars(){
  stars.length = 0;
  for (let i=0;i<60;i++){
    stars.push({
      x: Math.random()*W,
      y: Math.random()*Math.min(260, H*0.35),
      r: Math.random()<0.8 ? 1 : 2,
      a: 0.6 + Math.random()*0.4
    });
  }
}
initStars();

const clouds = [
  {x:0.18, y:0.18, s:1.00},
  {x:0.68, y:0.22, s:0.85},
  {x:0.40, y:0.30, s:0.70}
];

function drawCloud(cx, cy, s){
  ctx.fillStyle="rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(cx-34*s, cy, 18*s, 0, Math.PI*2);
  ctx.arc(cx, cy-10*s, 26*s, 0, Math.PI*2);
  ctx.arc(cx+34*s, cy, 20*s, 0, Math.PI*2);
  ctx.fill();
}

// day/night cycle بسيط جدًا (إضافة بدون تخريب)
// كل 10 نقاط يغمّق/يفتح شوي
function drawBackground(){
  const phase = Math.floor(score / 10) % 2; // 0/1
  const mix = phase ? 0.18 : 0.0;          // درجة بسيطة فقط

  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, mix ? "#061320" : "#0a1a2a");
  g.addColorStop(0.55, mix ? "#0b2f46" : "#0f3d5a");
  g.addColorStop(1, "#77c7e9");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle = '#fff';
  for (const s of stars){
    ctx.globalAlpha = s.a;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  for (const c of clouds){
    drawCloud(W*c.x, H*c.y, c.s);
  }

  const cityY = H - FLOOR_H - 150;
  ctx.fillStyle = "rgba(12, 25, 35, 0.25)";
  for (let i=0;i<18;i++){
    const bw = 34 + (i*13)%64;
    const bh = 50 + (i*29)%110;
    const x = (i*58)%(W+80)-40;
    ctx.fillRect(x, cityY - bh, bw, bh);
  }

  const groundY = H - FLOOR_H;
  ctx.fillStyle="#d8d19a";
  ctx.fillRect(0, groundY, W, FLOOR_H);

  ctx.fillStyle="#4bb648";
  ctx.fillRect(0, groundY, W, 20);

  ctx.fillStyle="rgba(0,0,0,0.12)";
  for(let x=0;x<W;x+=18){
    ctx.fillRect(x, groundY+9, 10, 7);
  }

  ctx.strokeStyle="rgba(0,0,0,0.25)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();
}

// =====================
// PIPES
// =====================
function pipeBody(x,y,w,h){
  const g = ctx.createLinearGradient(x,0,x+w,0);
  g.addColorStop(0,"#1f8f3a");
  g.addColorStop(0.35,"#49d06b");
  g.addColorStop(1,"#157a2f");
  ctx.fillStyle=g;
  ctx.fillRect(x,y,w,h);

  ctx.fillStyle="rgba(255,255,255,0.10)";
  ctx.fillRect(x+w*0.20,y,w*0.12,h);
  ctx.fillRect(x+w*0.64,y,w*0.08,h);

  ctx.strokeStyle="rgba(0,0,0,0.35)";
  ctx.lineWidth=2;
  ctx.strokeRect(x,y,w,h);
}

function pipeCap(x,y,w,h){
  const capW = w+16;
  const capX = x-8;
  const g = ctx.createLinearGradient(capX,0,capX+capW,0);
  g.addColorStop(0,"#1b8234");
  g.addColorStop(0.35,"#55e07a");
  g.addColorStop(1,"#136b2a");

  ctx.fillStyle=g;
  ctx.fillRect(capX,y,capW,h);

  ctx.strokeStyle="rgba(0,0,0,0.35)";
  ctx.lineWidth=2;
  ctx.strokeRect(capX,y,capW,h);

  ctx.fillStyle="rgba(255,255,255,0.12)";
  ctx.fillRect(capX+7,y+4,capW-14,4);
}

function drawPipes(){
  for(const p of pipes){
    pipeBody(p.x, 0, PIPE_W, p.topH);
    pipeCap(p.x, p.topH-18, PIPE_W, 18);

    const bottomY = p.topH + gap;
    const bottomH = (H - FLOOR_H) - bottomY;
    pipeBody(p.x, bottomY, PIPE_W, bottomH);
    pipeCap(p.x, bottomY, PIPE_W, 18);
  }
}

// =====================
// BIRD
// =====================
function drawBird(){
  const targetRot = Math.max(-0.45, Math.min(1.2, bird.vy * 0.06));
  bird.rot += (targetRot - bird.rot) * 0.13;

  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.rot);

  const s = 3;
  function px(x,y,w,h, color){
    ctx.fillStyle=color;
    ctx.fillRect(x*s, y*s, w*s, h*s);
  }

  px(-7, -5, 14, 10, '#111');
  px(-6, -4, 12, 8, '#ff4a1a');
  px(-6, -2, 12, 6, '#ff6a1a');
  px(-6, 1, 10, 3, '#ffd27a');
  px(-3, 0, 4, 3, '#ffb24a');
  px(6, -1, 3, 2, '#ffcc3a');
  px(6, 1, 3, 1, '#ff9a00');
  px(1, -2, 3, 3, '#fff');
  px(2, -1, 1, 1, '#111');

  ctx.restore();
}

// =====================
// GAME LOGIC
// =====================
function rand(min, max){ return Math.random() * (max-min) + min; }

function spawnPipe(x){
  const topMin = 70;
  const topMax = H - FLOOR_H - gap - 140;
  const topH = Math.floor(rand(topMin, topMax));
  pipes.push({ x, topH, passed:false });
}

function reset(){
  bird.x = Math.round(W * 0.30);
  bird.y = Math.round(H * 0.44);
  bird.vy = 0;
  bird.rot = 0;

  pipes = [];
  score = 0;
  speed = 3.2;
  gap = GAP_START;

  spawnPipe(W + 200);
  spawnPipe(W + 200 + PIPE_SPACING);

  shakeT = 0;
  shakePower = 0;
  flashT = 0;
  sparkT = 0;

  paused = false;
  pauseBtn.textContent = 'II';

  // reset count-up
  countFrom = 0; countTo = 0; countT = 0;
}

function rectsOverlap(ax,ay,aw,ah,bx,by,bw,bh){
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

function hitTest(){
  const r = bird.r;
  const bx = bird.x - r;
  const by = bird.y - r;
  const bs = r*2;

  if (by <= 0) return true;
  if (by + bs >= H - FLOOR_H) return true;

  for(const p of pipes){
    if (rectsOverlap(bx,by,bs,bs, p.x,0, PIPE_W,p.topH)) return true;

    const bottomY = p.topH + gap;
    const bottomH = (H - FLOOR_H) - bottomY;
    if (rectsOverlap(bx,by,bs,bs, p.x,bottomY, PIPE_W,bottomH)) return true;
  }
  return false;
}

function updateDifficulty(){
  const lvl = Math.floor(score / 6);
  speed = 3.2 + lvl * 0.25;
  gap = GAP_START - Math.min(lvl * 8, 60);
}

// =====================
// CONTROLS
// =====================
function flap(){
  if (state !== 'play') return;
  initAudio();
  bird.vy = JUMP_V;
  sFlap();
}

function toStart(){
  state = 'start';
  showScreen('start');
}

function toReady(){
  state = 'ready';
  showScreen('ready');
}

function toPlay(){
  state = 'play';
  showScreen(null);
  initAudio();
  sStart();
}

function toPause(){
  if (state !== 'play') return;
  paused = true;
  showScreen('pause');
  pauseBtn.textContent = '▶';
}

function toResume(){
  if (state !== 'play') return;
  paused = false;
  showScreen(null);
  pauseBtn.textContent = 'II';
}

function startCountUp(n){
  countFrom = 0;
  countTo = n;
  countT = 0;
  finalScoreEl.textContent = "0";
}

function tickCountUp(){
  if (countFrom >= countTo) return;
  // سرعة عد مناسبة
  countT++;
  const step = Math.max(1, Math.floor(countTo / 25));
  countFrom = Math.min(countTo, countFrom + step);
  finalScoreEl.textContent = String(countFrom);
}

function toOver(){
  state = 'over';
  showScreen('over');

  if (score > bestScore){
    bestScore = score;
    localStorage.setItem('bestScore', String(bestScore));
  }

  bestScoreEl.textContent = String(bestScore);

  setMedal(score);

  // Count-up (إضافة)
  startCountUp(score);

  // flash + shake + hit sound (إضافة)
  shakeT = 18;
  shakePower = 10;
  flashT = 10;
  sHit();
}

pauseBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if (state !== 'play') return;
  initAudio();
  if (!paused) toPause();
  else toResume();
});

resumeBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  initAudio();
  toResume();
});

startBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  reset();
  toReady();
});

okBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  reset();
  toReady();
});

shareBtn.addEventListener('click', async (e)=>{
  e.preventDefault();
  const text = `سجلت ${score} في اللعبة!`;

  try{
    // حاول مشاركة صورة
    if (navigator.share && canvas.toBlob){
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.95));
      if (blob){
        const file = new File([blob], 'score.png', { type:'image/png' });
        // بعض الأجهزة لازم canShare
        if (navigator.canShare && navigator.canShare({ files:[file] })){
          await navigator.share({ files:[file], text });
          return;
        }
      }
    }
  }catch{}

  try{
    if (navigator.share) await navigator.share({ text });
  }catch{}
});

window.addEventListener('pointerdown', (e)=>{
  initAudio();

  if (state === 'ready'){
    toPlay();
    flap();
    return;
  }
  if (state === 'play'){
    if (!paused) flap();
    return;
  }
}, { passive:false });

window.addEventListener('keydown', (e)=>{
  if (e.code === 'Space' || e.code === 'ArrowUp'){
    if (state === 'ready'){ toPlay(); flap(); }
    else if (state === 'play' && !paused){ flap(); }
  }
  if (e.code === 'KeyP'){
    if (state === 'play'){
      initAudio();
      if (!paused) toPause();
      else toResume();
    }
  }
});

// =====================
// MAIN LOOP
// =====================
function step(){
  ctx.save();

  // shake
  if (shakeT > 0){
    const dx = (Math.random()*2 - 1) * shakePower;
    const dy = (Math.random()*2 - 1) * shakePower;
    ctx.translate(dx, dy);
    shakeT--;
    shakePower *= 0.92;
  }

  drawBackground();
  drawPipes();
  drawBird();

  // score
  if (state === 'play' || state === 'over'){
    drawScoreNumber(String(score), W/2, Math.max(22, H*0.06));
  }
  if (state === 'ready'){
    drawScoreNumber("0", W/2, Math.max(22, H*0.06));
  }

  // flash overlay (إضافة)
  if (flashT > 0){
    const a = Math.min(0.35, flashT/12);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha = 1;
    flashT--;
  }

  ctx.restore();

  // count-up in Game Over (إضافة)
  if (state === 'over'){
    tickCountUp();
  }

  // spark fade
  if (sparkT > 0) sparkT--;

  // update
  if (state === 'play' && !paused){
    bird.vy += GRAVITY;
    bird.y += bird.vy;

    updateDifficulty();

    for(const p of pipes){
      p.x -= speed;

      if (!p.passed && p.x + PIPE_W < bird.x - bird.r){
        p.passed = true;
        score++;
        sparkT = 10;   // spark on score (إضافة)
        sScore();
      }
    }

    if (pipes.length && pipes[0].x + PIPE_W < -30) pipes.shift();

    const last = pipes[pipes.length-1];
    if (last && last.x < W + 220) spawnPipe(last.x + PIPE_SPACING);

    if (hitTest()){
      toOver();
    }
  }

  requestAnimationFrame(step);
}

// start
bestScoreEl.textContent = String(bestScore);
reset();
toStart();
step();
