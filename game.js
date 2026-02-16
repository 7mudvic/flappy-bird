const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const startOverlay = document.getElementById("startOverlay");
const tapOverlay = document.getElementById("tapOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");

const startBtn = document.getElementById("startBtn");
const okBtn = document.getElementById("okBtn");
const shareBtn = document.getElementById("shareBtn");

const finalScoreEl = document.getElementById("finalScore");
const bestScoreEl = document.getElementById("bestScore");
const medalSlot = document.getElementById("medalSlot");

let bestScore = Number(localStorage.getItem("bestScore") || "0");

/* ===== Medal Logic (صعبة شوي مثل طلبك) ===== */
function getMedalClass(s){
  // صعبة شوي (مو سهلة)
  if (s >= 100) return "platinum";
  if (s >= 70)  return "gold";
  if (s >= 45)  return "bronze";
  if (s >= 25)  return "silver";
  if (s >= 10)  return "white";
  return "";
}
function renderMedal(s){
  medalSlot.innerHTML = "";
  const cls = getMedalClass(s);
  if (!cls) return;
  const d = document.createElement("div");
  d.className = `medal ${cls}`;
  medalSlot.appendChild(d);
}

/* ===== Game State ===== */
const W = canvas.width;
const H = canvas.height;

let running = false;     // أثناء اللعب
let canTapStart = false; // شاشة TAP تنتظر أول لمسة
let dead = false;

let score = 0;

const gravity = 0.42;
const flap = -7.6; // نقزة متوسطة (إذا تبغا أقل/أكثر قلّي)
let bird = {
  x: 110,
  y: 260,
  vy: 0,
  r: 16
};

const pipeGap = 150;
const pipeW = 64;
const pipeSpeed = 2.2;

let pipes = [];
let frame = 0;

/* ===== Assets (رسومات بسيطة) ===== */
// طير بيكسل SVG (بدون مربع أسود)
const birdImg = new Image();
birdImg.src =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='28' viewBox='0 0 40 28'%3E%3Crect width='40' height='28' fill='none'/%3E%3Cpath d='M4 14h6V8h12V4h10v4h4v6h-4v4h-8v4H10v-4H4z' fill='%23ff7a00'/%3E%3Cpath d='M10 10h10v10H10z' fill='%23ff3b2f'/%3E%3Crect x='20' y='10' width='6' height='6' fill='%23ffffff'/%3E%3Crect x='23' y='12' width='2' height='2' fill='%23000'/%3E%3Cpath d='M30 14h10v4H30z' fill='%23ffd400'/%3E%3C/svg%3E";

/* ===== Background: Night + stars + clouds + buildings (ثابت) ===== */
function drawBackground(){
  // sky gradient (ليل)
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, "#081523");
  g.addColorStop(1, "#12314a");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  // stars ثابتة
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  const stars = [
    [40,80],[90,140],[160,60],[220,120],[300,90],[330,160],[260,200],[60,220]
  ];
  for (const [x,y] of stars){
    ctx.fillRect(x,y,2,2);
  }

  // clouds ثابتة
  drawCloud(70, 150, 1.1);
  drawCloud(260, 190, 1.0);
  drawCloud(170, 260, 0.9);

  // buildings ثابتة
  ctx.fillStyle = "rgba(30,70,90,0.45)";
  const baseY = 440;
  const b = [
    [0,120],[26,90],[55,150],[90,110],[120,160],[160,100],[200,160],[235,120],[270,170],[305,115],[335,150]
  ];
  for (const [x,h] of b){
    ctx.fillRect(x, baseY - h, 22, h);
  }

  // ground
  ctx.fillStyle = "#59b14f";
  ctx.fillRect(0, 580, W, 60);

  // ground stripe
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  for(let i=0;i<W;i+=18){
    ctx.fillRect(i, 600, 9, 12);
  }
}

function drawCloud(x,y,scale){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(0,0,18,0,Math.PI*2);
  ctx.arc(20,-6,14,0,Math.PI*2);
  ctx.arc(34,2,16,0,Math.PI*2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ===== Pipes ===== */
function spawnPipe(){
  // gap center random
  const margin = 140;
  const gapY = margin + Math.random() * (H - 240 - margin);
  pipes.push({
    x: W + 40,
    gapY,
    scored: false
  });
}

function drawPipes(){
  for(const p of pipes){
    // pipe color
    ctx.fillStyle = "#2aa65a";
    // top pipe
    const topH = p.gapY - pipeGap/2;
    ctx.fillRect(p.x, 0, pipeW, topH);
    // bottom pipe
    const botY = p.gapY + pipeGap/2;
    ctx.fillRect(p.x, botY, pipeW, H - botY - 60);

    // caps
    ctx.fillStyle = "#1f8f4b";
    ctx.fillRect(p.x - 4, topH - 18, pipeW + 8, 18);
    ctx.fillRect(p.x - 4, botY, pipeW + 8, 18);
  }
}

/* ===== Bird ===== */
function drawBird(){
  ctx.save();
  ctx.translate(bird.x, bird.y);
  // ميلان بسيط
  const ang = Math.max(-0.6, Math.min(0.9, bird.vy/10));
  ctx.rotate(ang);
  ctx.drawImage(birdImg, -20, -14, 40, 28);
  ctx.restore();
}

/* ===== HUD score ===== */
function drawScore(){
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "900 52px Arial";
  ctx.textAlign = "center";
  ctx.fillText(String(score), W/2, 90);
  ctx.restore();
}

/* ===== Collisions ===== */
function hitTestPipe(p){
  const bx = bird.x, by = bird.y, br = bird.r;

  const topH = p.gapY - pipeGap/2;
  const botY = p.gapY + pipeGap/2;

  // bird circle vs rect (pipe)
  // top rect
  if (circleRect(bx,by,br, p.x,0, pipeW, topH)) return true;
  // bottom rect
  if (circleRect(bx,by,br, p.x,botY, pipeW, H - botY - 60)) return true;

  return false;
}

function circleRect(cx,cy,cr, rx,ry,rw,rh){
  const nx = Math.max(rx, Math.min(cx, rx+rw));
  const ny = Math.max(ry, Math.min(cy, ry+rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return (dx*dx + dy*dy) <= cr*cr;
}

/* ===== Game Flow ===== */
function resetToStart(){
  running = false;
  canTapStart = false;
  dead = false;
  score = 0;
  frame = 0;
  pipes = [];

  bird.x = 110;
  bird.y = 260;
  bird.vy = 0;

  bestScore = Number(localStorage.getItem("bestScore") || "0");
  bestScoreEl.textContent = String(bestScore);
  medalSlot.innerHTML = "";

  startOverlay.style.display = "flex";
  tapOverlay.style.display = "none";
  gameOverOverlay.style.display = "none";
}

function showTapScreen(){
  startOverlay.style.display = "none";
  tapOverlay.style.display = "flex";
  gameOverOverlay.style.display = "none";
  canTapStart = true;
}

function startGame(){
  tapOverlay.style.display = "none";
  running = true;
  canTapStart = false;
  dead = false;
  score = 0;
  frame = 0;
  pipes = [];
  bird.y = 260;
  bird.vy = 0;
}

function endGame(){
  running = false;
  dead = true;

  if (score > bestScore){
    bestScore = score;
    localStorage.setItem("bestScore", String(bestScore));
  }

  finalScoreEl.textContent = String(score);
  bestScoreEl.textContent = String(bestScore);
  renderMedal(score);

  gameOverOverlay.style.display = "flex";
}

/* ===== Input ===== */
function flapBird(){
  bird.vy = flap;
}

function onTap(){
  // شاشة البداية -> شاشة TAP
  if (startOverlay.style.display !== "none"){
    showTapScreen();
    return;
  }

  // شاشة TAP -> يبدأ اللعب
  if (canTapStart){
    startGame();
    flapBird();
    return;
  }

  // أثناء اللعب
  if (running){
    flapBird();
    return;
  }
}

startBtn.addEventListener("click", () => showTapScreen());
okBtn.addEventListener("click", () => resetToStart());

shareBtn.addEventListener("click", async () => {
  const url = location.href;
  const text = `I scored ${score} in Flappy Bird!`;
  try{
    if (navigator.share){
      await navigator.share({ title: "Flappy Bird", text, url });
    }else{
      await navigator.clipboard.writeText(url);
      alert("تم نسخ الرابط ✅");
    }
  }catch(e){}
});

window.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  onTap();
}, { passive: false });

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp"){
    onTap();
  }
});

/* ===== Loop ===== */
function update(){
  frame++;

  // physics
  if (running){
    bird.vy += gravity;
    bird.y += bird.vy;

    // ground collision
    if (bird.y + bird.r > 580){
      bird.y = 580 - bird.r;
      endGame();
    }

    // spawn pipes
    if (frame % 90 === 0){
      spawnPipe();
    }

    // move pipes
    for(const p of pipes){
      p.x -= pipeSpeed;

      // scoring
      if (!p.scored && p.x + pipeW < bird.x){
        p.scored = true;
        score++;
      }

      // collision
      if (hitTestPipe(p)){
        endGame();
      }
    }

    // remove offscreen pipes
    pipes = pipes.filter(p => p.x > -pipeW - 20);
  } else {
    // idle bird bobbing (في البداية أو TAP)
    if (!dead){
      bird.y = 260 + Math.sin(frame/18)*6;
    }
  }
}

function draw(){
  drawBackground();
  drawPipes();
  drawBird();

  // score only in-game
  if (running){
    drawScore();
  }
}

function loop(){
  update();
  ctx.clearRect(0,0,W,H);
  draw();
  requestAnimationFrame(loop);
}

/* ===== Start ===== */
resetToStart();
loop();
