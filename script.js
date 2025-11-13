// --- DOM Elements ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const stageSelectScreen = document.getElementById('stage-select-screen');
const stageButtonsContainer = document.getElementById('stage-buttons-container');
const gameOverScreen = document.getElementById('game-over-screen');
const winScreen = document.getElementById('win-screen');
const transitionScreen = document.getElementById('transition-screen');
const inGameUI = document.getElementById('in-game-ui');
const restartButton = document.getElementById('restart-button');
const restartButtonWin = document.getElementById('restart-button-win');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('final-score');
const winScoreEl = document.getElementById('win-score');
const stageText = document.getElementById('stage-text');
const transitionText = document.getElementById('transition-text');

// --- Game State ---
let player, enemies = [], enemyBullets = [], playerBullets = [], particles = [], stars = [];
let score = 0, frame = 0, stageFrame = 0, currentStageIndex = 0, scoreAtStageStart = 0;
let highScores = [];
let gameLoopId, spawnManager = { timeoutId: null };
let isGameOver = false, isTransitioning = false;
const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, a: false, s: false, d: false, ' ': false };

// --- Game Configuration ---
const PLAYER_SIZE = 20, PLAYER_SPEED = 5, PLAYER_COLOR = '#00FFFF', PLAYER_BULLET_COLOR = '#00FFFF';
const PARTICLE_COUNT = 30, ENEMY_DESTROY_SCORE = 100, STAR_COUNT = 100;
const STAGES = [
    { duration: 1200, enemyTypes: ['basic'], spawnRate: 1300, name: "Stage 1: First Contact" },
    { duration: 1800, enemyTypes: ['basic', 'spreader'], spawnRate: 1000, name: "Stage 2: Spreading Swarm" },
    { duration: 2400, enemyTypes: ['basic', 'spreader', 'spinner'], spawnRate: 700, name: "Stage 3: Chaos Vortex" },
];
const HIGH_SCORE_KEY = 'geometricBarrageHighScores';

// --- Score Management ---
function loadHighScores() {
    try {
        const storedScores = JSON.parse(localStorage.getItem(HIGH_SCORE_KEY));
        if (Array.isArray(storedScores) && storedScores.length === STAGES.length) {
            highScores = storedScores;
        } else {
            highScores = Array(STAGES.length).fill(0);
        }
    } catch (e) {
        highScores = Array(STAGES.length).fill(0);
    }
}

function saveHighScores() {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(highScores));
}

function updateHighScore(stageIndex, currentStageScore) {
    if (currentStageScore > (highScores[stageIndex] || 0)) {
        highScores[stageIndex] = currentStageScore;
        saveHighScores();
    }
}

// --- Utility & Setup ---
function distance(x1, y1, x2, y2) { const xDist = x2 - x1, yDist = y2 - y1; return Math.sqrt(Math.pow(xDist, 2) + Math.pow(yDist, 2)); }
function setupCanvas() { canvas.width = 600; canvas.height = 800; }

// --- Background ---
class Star { constructor() { this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height; this.size = Math.random() * 2; this.speed = Math.random() * 0.5 + 0.2; } draw() { ctx.fillStyle = `rgba(255, 255, 255, ${this.size / 2})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); } update() { this.y += this.speed; if (this.y > canvas.height) { this.y = 0; this.x = Math.random() * canvas.width; } } }
function initStars() { stars = []; for (let i = 0; i < STAR_COUNT; i++) { stars.push(new Star()); } }
function updateAndDrawStars() { stars.forEach(star => { star.update(); star.draw(); }); }

// --- Game Loop ---
function gameLoop() {
    if (isGameOver) { showGameOverScreen(); return; }
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateAndDrawStars();
    
    if (isTransitioning) {
        drawPlayer(); drawEnemies(); drawBullets(enemyBullets); drawBullets(playerBullets); drawParticles();
    } else {
        frame++; score++; stageFrame++;
        updatePlayer(); drawPlayer();
        updateParticles(); drawParticles();
        updateEnemies(); drawEnemies();
        updateBullets(enemyBullets); drawBullets(enemyBullets);
        updateBullets(playerBullets); drawBullets(playerBullets);
        checkCollisions();
    }
    
    scoreEl.textContent = score;
    stageText.textContent = `STAGE: ${currentStageIndex + 1}`;

    if (!isTransitioning && stageFrame >= STAGES[currentStageIndex].duration) {
        endStage();
    }

    gameLoopId = requestAnimationFrame(gameLoop);
}

// --- Player, Enemy, Bullet, Particle Classes (condensed) ---
class Player { constructor(x, y, size, color, speed) { this.x = x; this.y = y; this.size = size; this.color = color; this.speed = speed; this.shootCooldown = 0; this.invincible = true; this.invincibleTimer = 180; } draw() { if (this.invincible && Math.floor(this.invincibleTimer / 10) % 2 === 0) return; ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.moveTo(this.x, this.y - this.size / 2); ctx.lineTo(this.x - this.size / 2, this.y + this.size / 2); ctx.lineTo(this.x + this.size / 2, this.y + this.size / 2); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; } update() { if (keys.ArrowUp || keys.w) this.y -= this.speed; if (keys.ArrowDown || keys.s) this.y += this.speed; if (keys.ArrowLeft || keys.a) this.x -= this.speed; if (keys.ArrowRight || keys.d) this.x += this.speed; const r = this.size / 2; if (this.x - r < 0) this.x = r; if (this.x + r > canvas.width) this.x = canvas.width - r; if (this.y - r < 0) this.y = r; if (this.y + r > canvas.height) this.y = canvas.height - r; if (keys[' '] && this.shootCooldown <= 0) { this.shoot(); this.shootCooldown = 10; } if (this.shootCooldown > 0) this.shootCooldown--; if (this.invincibleTimer > 0) this.invincibleTimer--; else this.invincible = false; } shoot() { playerBullets.push(new Bullet(this.x, this.y - this.size / 2, 5, PLAYER_BULLET_COLOR, { x: 0, y: -8 })); /* SFX: Player shoot */ } }
class Enemy { constructor(x, y, size, color, speed, type, hp) { this.x = x; this.y = y; this.size = size; this.color = color; this.speed = speed; this.type = type; this.hp = hp; this.shootCooldown = Math.random() * 50 + 50; this.angle = 0; } draw() { ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size); ctx.shadowBlur = 0; } update() { this.y += this.speed; if (this.shootCooldown <= 0 && player) { switch (this.type) { case 'spinner': this.shootSpinner(); this.shootCooldown = 20; break; case 'spreader': this.shootSpreader(); this.shootCooldown = 80; break; default: this.shootBasic(); this.shootCooldown = 60; break; } } else { this.shootCooldown--; } } shootBasic() { const angle = Math.atan2(player.y - this.y, player.x - this.x); enemyBullets.push(new Bullet(this.x, this.y, 5, '#FF4136', { x: Math.cos(angle) * 4, y: Math.sin(angle) * 4 })); } shootSpinner() { for (let i = 0; i < 2; i++) { const angle = this.angle + (i * Math.PI); enemyBullets.push(new Bullet(this.x, this.y, 4, '#FF00FF', { x: Math.cos(angle) * 3, y: Math.sin(angle) * 3 })); } this.angle += 0.3; } shootSpreader() { const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x); for (let i = 0; i < 5; i++) { const angle = angleToPlayer - (Math.PI / 4 / 2) + (i * (Math.PI / 4 / 4)); enemyBullets.push(new Bullet(this.x, this.y, 5, '#FFFF00', { x: Math.cos(angle) * 3.5, y: Math.sin(angle) * 3.5 })); } } takeDamage(amount) { this.hp -= amount; } }
class Bullet { constructor(x, y, size, color, velocity) { this.x = x; this.y = y; this.size = size; this.color = color; this.velocity = velocity; } draw() { ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; } update() { this.x += this.velocity.x; this.y += this.velocity.y; } }
class Particle { constructor(x, y, size, color, velocity) { this.x = x; this.y = y; this.size = size; this.color = color; this.velocity = velocity; this.alpha = 1; } draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); } update() { this.x += this.velocity.x; this.y += this.velocity.y; this.alpha -= 0.02; } }
function updatePlayer() { if (!isGameOver) player.update(); }
function drawPlayer() { if (!isGameOver) player.draw(); }
function updateEnemies() { enemies.forEach((e, i) => { e.update(); if (e.y > canvas.height + e.size) setTimeout(() => enemies.splice(i, 1), 0); }); }
function drawEnemies() { enemies.forEach(e => e.draw()); }
function updateBullets(arr) { arr.forEach((b, i) => { b.update(); if (b.x + b.size < 0 || b.x - b.size > canvas.width || b.y + b.size < 0 || b.y - b.size > canvas.height) setTimeout(() => arr.splice(i, 1), 0); }); }
function drawBullets(arr) { arr.forEach(b => b.draw()); }
function createExplosion(x, y, color, count = PARTICLE_COUNT) { for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 5 + 1; particles.push(new Particle(x, y, Math.random() * 3 + 1, color, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })); } }
function updateParticles() { particles.forEach((p, i) => { p.update(); if (p.alpha <= 0) setTimeout(() => particles.splice(i, 1), 0); }); }
function drawParticles() { particles.forEach(p => p.draw()); }

// --- Spawning ---
function spawnEnemy() {
    if (isTransitioning || isGameOver) return;
    const stage = STAGES[currentStageIndex];
    const type = stage.enemyTypes[Math.floor(Math.random() * stage.enemyTypes.length)];
    const size = Math.random() * 10 + 25; const x = Math.random() * (canvas.width - size) + size / 2; const y = -size;
    let color, hp, speed;
    switch (type) {
        case 'spinner': color = '#FF00FF'; hp = 3; speed = 1.5; break;
        case 'spreader': color = '#FFFF00'; hp = 4; speed = 1; break;
        default: color = '#FF4136'; hp = 2; speed = 1.2; break;
    }
    enemies.push(new Enemy(x, y, size, color, speed, type, hp));
    spawnManager.timeoutId = setTimeout(spawnEnemy, stage.spawnRate);
}

// --- Collision Detection ---
function checkCollisions() {
    if (player.invincible) return;
    const checkHit = (thing) => { const dist = distance(player.x, player.y, thing.x, thing.y); if (dist - thing.size / 2 - player.size / 2 < 1) { isGameOver = true; createExplosion(player.x, player.y, player.color); /* SFX: Player explosion */ } };
    enemyBullets.forEach(checkHit);
    enemies.forEach(checkHit);
    playerBullets.forEach((bullet, bulletIndex) => {
        enemies.forEach((enemy, enemyIndex) => {
            const dist = distance(bullet.x, bullet.y, enemy.x, enemy.y);
            if (dist - enemy.size / 2 - bullet.size < 1) {
                createExplosion(bullet.x, bullet.y, bullet.color, 5); /* SFX: Enemy hit */
                setTimeout(() => playerBullets.splice(bulletIndex, 1), 0);
                enemy.takeDamage(1);
                if (enemy.hp <= 0) {
                    score += ENEMY_DESTROY_SCORE * (STAGES[currentStageIndex].enemyTypes.indexOf(enemy.type) + 1);
                    createExplosion(enemy.x, enemy.y, enemy.color); /* SFX: Enemy explosion */
                    setTimeout(() => enemies.splice(enemyIndex, 1), 0);
                }
            }
        });
    });
}

// --- Game Flow & Stage Management ---
function showTransition(text) {
    transitionText.textContent = text;
    transitionScreen.classList.add('active');
    isTransitioning = true;
}

function hideTransition() {
    transitionScreen.classList.remove('active');
    isTransitioning = false;
}

function startStage(index) {
    currentStageIndex = index;
    stageFrame = 0;
    scoreAtStageStart = score;
    player.invincible = true;
    player.invincibleTimer = 180;
    
    showTransition(STAGES[index].name);
    
    setTimeout(() => {
        hideTransition();
        spawnManager.timeoutId = setTimeout(spawnEnemy, STAGES[index].spawnRate);
    }, 2500);
}

function endStage() {
    isTransitioning = true;
    clearTimeout(spawnManager.timeoutId);
    
    const stageScore = score - scoreAtStageStart;
    updateHighScore(currentStageIndex, stageScore);

    if (currentStageIndex + 1 >= STAGES.length) {
        winGame();
    } else {
        showTransition("STAGE CLEAR");
        setTimeout(() => startStage(currentStageIndex + 1), 3000);
    }
}

function winGame() {
    cancelAnimationFrame(gameLoopId);
    clearTimeout(spawnManager.timeoutId);
    winScoreEl.textContent = score;
    inGameUI.classList.add('hidden');
    winScreen.classList.add('active');
}

function startGame(stageIndex) {
    isGameOver = false; score = 0; frame = 0; enemies = []; enemyBullets = []; playerBullets = []; particles = [];
    scoreEl.textContent = 0;
    player = new Player(canvas.width / 2, canvas.height - 50, PLAYER_SIZE, PLAYER_COLOR, PLAYER_SPEED);
    initStars();
    stageSelectScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    winScreen.classList.remove('active');
    inGameUI.classList.remove('hidden');
    
    startStage(stageIndex);
    gameLoop();
}

function showGameOverScreen() {
    cancelAnimationFrame(gameLoopId);
    clearTimeout(spawnManager.timeoutId);

    const stageScore = score - scoreAtStageStart;
    updateHighScore(currentStageIndex, stageScore);

    finalScoreEl.textContent = score;
    inGameUI.classList.add('hidden');
    gameOverScreen.classList.add('active');
}

function showStageSelectScreen() {
    gameOverScreen.classList.remove('active');
    winScreen.classList.remove('active');
    inGameUI.classList.add('hidden');
    
    createStageSelect(); // Refresh scores
    stageSelectScreen.classList.add('active');
    
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateAndDrawStars();
}

// --- Event Listeners & Initialization ---
function createStageSelect() {
    stageButtonsContainer.innerHTML = '';
    STAGES.forEach((stage, index) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('stage-btn-wrapper');

        const button = document.createElement('button');
        button.textContent = stage.name;
        button.classList.add('btn', 'stage-btn');
        button.addEventListener('click', () => startGame(index));
        
        const scoreText = document.createElement('p');
        scoreText.classList.add('high-score-text');
        scoreText.textContent = `High Score: ${highScores[index] || 0}`;

        wrapper.appendChild(button);
        wrapper.appendChild(scoreText);
        stageButtonsContainer.appendChild(wrapper);
    });
}

function setupEventListeners() {
    restartButton.addEventListener('click', showStageSelectScreen);
    restartButtonWin.addEventListener('click', showStageSelectScreen);
    window.addEventListener('keydown', (e) => { if (e.key in keys) keys[e.key] = true; });
    window.addEventListener('keyup', (e) => { if (e.key in keys) keys[e.key] = false; });
}

function init() {
    setupCanvas();
    loadHighScores();
    createStageSelect();
    setupEventListeners();
    showStageSelectScreen();
    initStars();
    updateAndDrawStars();
}

init();

