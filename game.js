'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const startScreen = document.getElementById('startScreen');
const readyScreen = document.getElementById('readyScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

const pauseBtn = document.getElementById('pauseBtn');
const homeBtn  = document.getElementById('homeBtn');

const startBtn = document.getElementById('startBtn');
const okBtn = document.getElementById('okBtn');
const shareBtn = document.getElementById('shareBtn');

const finalScoreEl = document.getElementById('finalScore');
const bestScoreEl = document.getElementById('bestScore');
const medalEl = document.getElementById('medal');

/* START extras */
const optionsBtn = document.getElementById('optionsBtn');
const optionsModal = document.getElementById('optionsModal');
const optionsCloseBtn = document.getElementById('optionsCloseBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const privacyBtn = document.getElementById('privacyBtn');

const privacyModal = document.getElementById('privacyModal');
const privacyCloseBtn = document.getElementById('privacyCloseBtn');

const registerOpenBtn = document.getElementById('registerOpenBtn');
const loginOpenBtn = document.getElementById('loginOpenBtn');
const leaderboardOpenBtn = document.getElementById('leaderboardOpenBtn');

const registerModal = document.getElementById('registerModal');
const registerCloseBtn = document.getElementById('registerCloseBtn');
const regUser = document.getElementById('regUser');
const regPass = document.getElementById('regPass');
const registerBtn = document.getElementById('registerBtn');
const registerMsg = document.getElementById('registerMsg');

const loginModal = document.getElementById('loginModal');
const loginCloseBtn = document.getElementById('loginCloseBtn');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const loginBtn = document.getElementById('loginBtn');
const loginMsg = document.getElementById('loginMsg');

const leaderboardModal = document.getElementById('leaderboardModal');
const leaderboardCloseBtn = document.getElementById('leaderboardCloseBtn');
const leaderboardList = document.getElementById('leaderboardList');

const userBadge = document.getElementById('userBadge');

let W = 0, H = 0, DPR = 1;

// منع سحب الصفحة بالجوال (داخل اللعبة)
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
// GAME SETTINGS (أسهل قليل جداً)
// =====================
const GRAVITY = 0.42;
const JUMP_V = -5.7;
const PIPE_W = 78;
const PIPE_SPACING = 280;
const GAP_START = 210;   // أوسع قليل
const FLOOR_H = 110;

let speed = 3.0;         // أبطأ قليل
let gap = GAP_START;

const bird = {
  x: 0, y: 0,
  vy: 0,
  r: 14,
  rot: 0,
};

let pipes = [];
let score = 0;
let bestScore = Number(localStorage.getItem('bestScore') || 0);

let state = 'start'; // start | ready | play | over
let paused = false;

// camera shake (لا تغيير)
let shakeT = 0;
let shakePower = 0;

// =====================
// SOUND TOGGLE
// =====================
let soundOn = true;

// =====================
// AUDIO
// =====================
let audioCtx = null;
let masterGain = null;

function initAudio(){
  if (!soundOn) return;
  if (!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function tone(freq, dur, type='square', vol=0.22){
  if (!soundOn) return;
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

function sStart(){ tone(659, 0.08, 'square', 0.20); tone(880, 0.10, 'square', 0.16); }
function sFlap(){ tone(740, 0.06, 'square', 0.18); }
function sScore(){ tone(988, 0.08, 'square', 0.16); tone(1319, 0.08, 'square', 0.10); }
function sHit(){ tone(220, 0.20, 'sawtooth', 0.22); tone(140, 0.26, 'sawtooth', 0.16); }

// =====================
// AUTH (LocalStorage) + LEADERBOARD (session only)
// =====================
const USERS_KEY = 'fb_users_v1';
const CURRENT_KEY = 'fb_currentUser_v1';

function loadUsers(){
  try{
    const raw = localStorage.getItem(USERS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  }catch{
    return {};
  }
}
function saveUsers(users){
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function setCurrentUser(u){
  if (u) localStorage.setItem(CURRENT_KEY, u);
  else localStorage.removeItem(CURRENT_KEY);
  updateUserBadge();
}
function getCurrentUser(){
  return localStorage.getItem(CURRENT_KEY) || '';
}
function updateUserBadge(){
  const u = getCurrentUser();
  userBadge.textContent = u ? `مسجل باسم: ${u}` : '';
}

/* session leaderboard only (بدون تخزين) */
let leaderboard = []; // {user, score}
function addToLeaderboard(user, sc){
  if (!user) return;
  // خذ أعلى نتيجة لكل يوزر داخل الجلسة
  const idx = leaderboard.findIndex(x => x.user === user);
  if (idx >= 0){
    if (sc > leaderboard[idx].score) leaderboard[idx].score = sc;
  }else{
    leaderboard.push({ user, score: sc });
  }
  leaderboard.sort((a,b)=> b.score - a.score);
  if (leaderboard.length > 20) leaderboard.length = 20;
}
function renderLeaderboard(){
  if (!leaderboard.length){
    leaderboardList.innerHTML = `<div class="lbHint">لا يوجد نتائج بعد.</div>`;
    return;
  }
  leaderboardList.innerHTML = leaderboard.map((it, i) => {
    const rank = i+1;
    return `
      <div class="lbRow">
        <div class="lbRank">#${rank}</div>
        <div class="lbUser">${escapeHtml(it.user)}</div>
        <div class="lbScore">${it.score}</div>
      </div>
    `;
  }).join('');
}
function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

// =====================
// UI helpers
// =====================
function showScreen(which){
  startScreen.classList.remove('show');
  readyScreen.classList.remove('show');
  gameOverScreen.classList.remove('show');

  if (which === 'start') startScreen.classList.add('show');
  if (which === 'ready') readyScreen.classList.add('show');
  if (which === 'over') gameOverScreen.classList.add('show');

  updateHUDVisibility();
}

function updateHUDVisibility(){
  const inPlay = (state === 'play');
  pauseBtn.style.display = inPlay ? 'block' : 'none';
  homeBtn.style.display  = inPlay ? 'block' : 'none';
}

function openModal(el){ el.classList.add('show'); }
function closeModal(el){ el.classList.remove('show'); }
function closeAllModals(){
  closeModal(optionsModal);
  closeModal(privacyModal);
  closeModal(registerModal);
  closeModal(loginModal);
  closeModal(leaderboardModal);
}

// ✅ ميداليات أصعب + ترتيبك
function setMedal(s){
  medalEl.className = 'medal none';
  if (s >= 15) medalEl.className = 'medal white';
  if (s >= 30) medalEl.className = 'medal silver';
  if (s >= 45) medalEl.className = 'medal bronze';
  if (s >= 60) medalEl.className = 'medal gold';
  if (s >= 80) medalEl.className = 'medal platinum';
}

// =====================
// DIGIT FONT
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
  const w = 3 * px;

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

  return w;
}

function drawScoreNumber(numStr, centerX, topY){
  const scale = Math.max(6, Math.floor(W / 70));
  const gapPx = Math.floor(scale * 0.8);

  let totalW = 0;
  for (const ch of numStr){
    totalW += 3*scale + gapPx;
  }
  totalW -= gapPx;

  let x = Math.floor(centerX - totalW/2);
  const y = topY;

  for (const ch of numStr){
    drawDigit(ch, x, y, scale, '#ffffff', '#111111');
    x += 3*scale + gapPx;
  }
}

// =====================
// BACKGROUND (ليل ثابت بدون تدرج)
// =====================
const stars = [];
function initStars(){
  stars.length = 0;
  for (let i=0;i<60;i++){
    stars.push({
      x: Math.random()*W,
      y: Math.random()*Math.min(280, H*0.40),
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

function drawBackground(){
  // لون ثابت (بدون تدرج)
  ctx.fillStyle = "#071321";
  ctx.fillRect(0,0,W,H);

  // stars
  ctx.fillStyle = '#fff';
  for (const s of stars){
    ctx.globalAlpha = s.a;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // clouds
  for (const c of clouds){
    drawCloud(W*c.x, H*c.y, c.s);
  }

  // city silhouette
  const cityY = H - FLOOR_H - 150;
  ctx.fillStyle = "rgba(12, 25, 35, 0.25)";
  for (let i=0;i<18;i++){
    const bw = 34 + (i*13)%64;
    const bh = 50 + (i*29)%110;
    const x = (i*58)%(W+80)-40;
    ctx.fillRect(x, cityY - bh, bw, bh);
  }

  // ground
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
  bird.rot += (targetRot - bird.rot) * 0.15;

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
  speed = 3.0;
  gap = GAP_START;

  spawnPipe(W + 200);
  spawnPipe(W + 200 + PIPE_SPACING);

  shakeT = 0;
  shakePower = 0;
  paused = false;

  pauseBtn.textContent = 'II';
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

/*
  صعوبة: نفس الأسلوب القديم لكن أسهل قليل جداً
  - تزيد ببطء
  - بعد سكور 80 تبدأ تصعب زيادة إضافية تدريجية ناعمة
*/
function updateDifficulty(){
  // مستوى بطيء جداً
  const lvl = Math.floor(score / 10); // كان 6 (أسرع)، صار 10 (أبطأ)
  speed = 3.0 + lvl * 0.12;          // كان 0.25، صار 0.12 (أبطأ بكثير)
  gap = GAP_START - Math.min(lvl * 4, 40); // كان 8 و60، صار 4 و40 (تضييق أبطأ)

  // بعد 80: صعوبة إضافية ناعمة جداً
  if (score >= 80){
    const extra = Math.floor((score - 80) / 12); // كل 12 نقطة يزيد شوي
    speed += extra * 0.06;                       // زيادة بسيطة
    gap -= Math.min(extra * 2, 20);              // تضييق بسيط
  }

  // حدود أمان
  gap = Math.max(150, gap);
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

function toOver(){
  state = 'over';
  showScreen('over');

  if (score > bestScore){
    bestScore = score;
    localStorage.setItem('bestScore', String(bestScore));
  }

  finalScoreEl.textContent = String(score);
  bestScoreEl.textContent = String(bestScore);

  setMedal(score);

  // leaderboard (session only) إذا مسجل
  addToLeaderboard(getCurrentUser(), score);

  // shake + hit sound (بدون تغيير)
  shakeT = 18;
  shakePower = 10;
  sHit();
}

// HUD buttons
pauseBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if (state !== 'play') return;
  paused = !paused;
  pauseBtn.textContent = paused ? '▶' : 'II';
});

homeBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if (state !== 'play') return;
  // رجوع للرئيسية من اللعب فقط
  paused = false;
  reset();
  toStart();
});

// Start / OK / Share
startBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeAllModals();
  reset();
  toReady();
});

okBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeAllModals();
  reset();
  toReady();
});

shareBtn.addEventListener('click', async (e)=>{
  e.preventDefault();
  const text = `سجلت ${score} في اللعبة!`;
  try{
    if (navigator.share) await navigator.share({ text });
  }catch{}
});

// Tap / click
window.addEventListener('pointerdown', (e)=>{
  // إذا فيه مودال مفتوح لا تلعب
  if (optionsModal.classList.contains('show') ||
      privacyModal.classList.contains('show') ||
      registerModal.classList.contains('show') ||
      loginModal.classList.contains('show') ||
      leaderboardModal.classList.contains('show')){
    return;
  }

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

// keyboard
window.addEventListener('keydown', (e)=>{
  if (e.code === 'Space' || e.code === 'ArrowUp'){
    if (state === 'ready'){ toPlay(); flap(); }
    else if (state === 'play' && !paused){ flap(); }
  }
  if (e.code === 'KeyP'){
    if (state === 'play'){
      paused = !paused;
      pauseBtn.textContent = paused ? '▶' : 'II';
    }
  }
});

// =====================
// MODALS EVENTS (فقط الرئيسية للخيارات)
// =====================
optionsBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if (state !== 'start') return; // فقط الرئيسية
  openModal(optionsModal);
});

optionsCloseBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeModal(optionsModal);
});

privacyBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeModal(optionsModal);
  openModal(privacyModal);
});

privacyCloseBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeModal(privacyModal);
});

soundToggleBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  soundOn = !soundOn;
  soundToggleBtn.textContent = soundOn ? '🔊 الصوت: تشغيل' : '🔇 الصوت: إيقاف';
  if (soundOn){
    initAudio();
    sStart();
  }
});

registerOpenBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if (state !== 'start') return;
  registerMsg.textContent = '';
  regUser.value = '';
  regPass.value = '';
  openModal(registerModal);
});

registerCloseBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeModal(registerModal);
});

loginOpenBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if (state !== 'start') return;
  loginMsg.textContent = '';
  loginUser.value = '';
  loginPass.value = '';
  openModal(loginModal);
});

loginCloseBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeModal(loginModal);
});

leaderboardOpenBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if (state !== 'start') return;
  renderLeaderboard();
  openModal(leaderboardModal);
});

leaderboardCloseBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  closeModal(leaderboardModal);
});

// Register logic
function validUsername(u){
  return typeof u === 'string' && u.trim().length >= 3;
}
function validPassword(p){
  return typeof p === 'string' && p.length >= 6;
}

registerBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  const u = (regUser.value || '').trim();
  const p = (regPass.value || '');

  if (!validUsername(u)){
    registerMsg.textContent = 'اسم المستخدم لازم 3 أحرف أو أكثر.';
    return;
  }
  if (!validPassword(p)){
    registerMsg.textContent = 'كلمة المرور لازم 6 أحرف/أرقام أو أكثر.';
    return;
  }

  const users = loadUsers();
  if (users[u]){
    registerMsg.textContent = 'اسم المستخدم مستخدم مسبقًا.';
    return;
  }

  users[u] = { pass: p };
  saveUsers(users);
  setCurrentUser(u);

  registerMsg.textContent = 'تم التسجيل ✅';
  setTimeout(()=> closeModal(registerModal), 500);
});

// Login logic
loginBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  const u = (loginUser.value || '').trim();
  const p = (loginPass.value || '');

  const users = loadUsers();
  if (!users[u] || users[u].pass !== p){
    loginMsg.textContent = 'بيانات الدخول غير صحيحة.';
    return;
  }

  setCurrentUser(u);
  loginMsg.textContent = 'تم الدخول ✅';
  setTimeout(()=> closeModal(loginModal), 500);
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

  if (state === 'play' || state === 'over'){
    drawScoreNumber(String(score), W/2, Math.max(22, H*0.06));
  }

  if (state === 'ready'){
    drawScoreNumber("0", W/2, Math.max(22, H*0.06));
  }

  ctx.restore();

  if (state === 'play' && !paused){
    bird.vy += GRAVITY;
    bird.y += bird.vy;

    updateDifficulty();

    for(const p of pipes){
      p.x -= speed;

      if (!p.passed && p.x + PIPE_W < bird.x - bird.r){
        p.passed = true;
        score++;
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
soundToggleBtn.textContent = soundOn ? '🔊 الصوت: تشغيل' : '🔇 الصوت: إيقاف';
updateUserBadge();
reset();
toStart();
step();
