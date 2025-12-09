const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Defaults and game variables
const DEFAULT_BASE_SPEED = 5;
const DEFAULT_ENEMY_SPEED = 3;
const DEFAULT_SPAWN_RATE = 0.02;
const HYPER_MULTIPLIER = 3;
const HYPER_DURATION_FRAMES = 300; // 5 seconds at ~60fps

let gameRunning = true;
let score = 0;
let level = 1;
let highScore = localStorage.getItem('carGameHighScore') || 0;
document.getElementById('highScore').textContent = highScore;

// Energy / Hyper mode
let energy = 0;
const MAX_ENERGY = 100;
const ENERGY_CHARGE_RATE = 0.15; // per frame (increased for visibility)
let hyperActive = false;
let hyperTimer = 0;
let savedSpawnRate = null;

// Simple star field used during hyper mode
let stars = [];
const STAR_COUNT = 80;
function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 0.6 + 0.2,
            alpha: Math.random() * 0.6 + 0.2
        });
    }
}
initStars();

// Player car
const player = {
    x: canvas.width / 2 - 20,
    y: canvas.height - 80,
    width: 40,
    height: 60,
    baseSpeed: DEFAULT_BASE_SPEED,
    speed: DEFAULT_BASE_SPEED,
    dx: 0,
    hasShield: false,
    shieldTimer: 0
};

// Enemies array
let enemies = [];
let powerups = [];
let enemySpeed = DEFAULT_ENEMY_SPEED;
let spawnRate = DEFAULT_SPAWN_RATE;
let frameCount = 0;

// Input handling
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    if (e.key === ' ') {
        e.preventDefault();
        if (!gameRunning) {
            restartGame();
        }
    }
    // Start braking when Down arrow or 's' pressed
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        player.isBraking = true;
        player.dx = 0;
    }

    // Activate hyper when energy full and Up arrow / W pressed
    if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && energy >= MAX_ENERGY && !hyperActive) {
        e.preventDefault();
        startHyper();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    // Release brake: trigger short speed boost
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (player.isBraking) {
            player.isBraking = false;
            player.boostTimer = 120; // frames of boost (~2 seconds at 60fps)
            player.speed = player.baseSpeed * 2; // temporary speed multiplier
            showPowerUpNotification('⚡ Boost Released!');
        }
    }
});

// Enemy class
class Enemy {
    constructor() {
        this.width = 40;
        this.height = 60;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.speed = enemySpeed;
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Car details
        ctx.fillStyle = '#FFD93D';
        ctx.fillRect(this.x + 5, this.y + 10, 30, 15);
        ctx.fillRect(this.x + 5, this.y + 35, 30, 15);
    }

    isOffScreen() {
        return this.y > canvas.height;
    }
}

// PowerUp class
class PowerUp {
    constructor() {
        this.width = 30;
        this.height = 30;
        this.x = Math.random() * (canvas.width - this.width);
        this.y = -this.height;
        this.speed = 2;
        this.type = Math.random() > 0.5 ? 'shield' : 'speed';
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        if (this.type === 'shield') {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(this.x + 15, this.y + 15, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', this.x + 15, this.y + 22);
        }
    }

    isOffScreen() {
        return this.y > canvas.height;
    }
}

// Update player position
function updatePlayer() {
    // If braking, prevent lateral movement
    if (player.isBraking) {
        player.dx = 0;
    } else {
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) {
            player.dx = -player.speed;
        } else if (keys['ArrowRight'] || keys['d'] || keys['D']) {
            player.dx = player.speed;
        } else {
            player.dx = 0;
        }
    }

    player.x += player.dx;

    // Boundary checking
    if (player.x < 0) {
        player.x = 0;
    }
    if (player.x + player.width > canvas.width) {
        player.x = canvas.width - player.width;
    }

    // Update shield timer
    if (player.hasShield) {
        player.shieldTimer--;
        if (player.shieldTimer <= 0) {
            player.hasShield = false;
        }
    }

    // Update boost timer
    if (player.boostTimer && player.boostTimer > 0) {
        player.boostTimer--;
        if (player.boostTimer <= 0) {
            player.speed = player.baseSpeed;
            player.boostTimer = 0;
        }
    }
}

// Draw player
function drawPlayer() {
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Car details
    ctx.fillStyle = '#FFD93D';
    ctx.fillRect(player.x + 5, player.y + 10, 30, 15);
    ctx.fillRect(player.x + 5, player.y + 35, 30, 15);

    // Headlights
    ctx.fillStyle = '#FFF';
    ctx.fillRect(player.x + 8, player.y + 2, 8, 5);
    ctx.fillRect(player.x + 24, player.y + 2, 8, 5);

    // Draw shield if active
    if (player.hasShield) {
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, player.y + player.height / 2, 35, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw boost flame when boosting
    if (player.boostTimer && player.boostTimer > 0) {
        ctx.fillStyle = 'orange';
        ctx.beginPath();
        ctx.moveTo(player.x + player.width / 2 - 6, player.y + player.height);
        ctx.lineTo(player.x + player.width / 2 + 6, player.y + player.height);
        ctx.lineTo(player.x + player.width / 2, player.y + player.height + 18);
        ctx.closePath();
        ctx.fill();
    }
}

// Spawn enemies and powerups
function spawnEntity() {
    if (Math.random() < spawnRate) {
        enemies.push(new Enemy());
    }
    if (Math.random() < spawnRate * 0.3) {
        powerups.push(new PowerUp());
    }
}

// Check collision with enemies
function checkCollision() {
    for (let enemy of enemies) {
        if (
            player.x < enemy.x + enemy.width &&
            player.x + player.width > enemy.x &&
            player.y < enemy.y + enemy.height &&
            player.y + player.height > enemy.y
        ) {
            return true;
        }
    }
    return false;
}

// Check powerup collection
function checkPowerUpCollision() {
    for (let i = powerups.length - 1; i >= 0; i--) {
        const powerup = powerups[i];
        if (
            player.x < powerup.x + powerup.width &&
            player.x + player.width > powerup.x &&
            player.y < powerup.y + powerup.height &&
            player.y + player.height > powerup.y
        ) {
            if (powerup.type === 'shield') {
                player.hasShield = true;
                player.shieldTimer = 300;
                showPowerUpNotification('🛡️ Shield Activated!');
            } else {
                score += 50;
                // Speed powerup now also charges energy
                energy = Math.min(MAX_ENERGY, energy + 30);
                showPowerUpNotification('⚡ Speed Boost! Energy +30');
                // Update energy UI immediately
                const fillEl = document.getElementById('energyFill');
                if (fillEl) {
                    fillEl.style.width = Math.floor((energy / MAX_ENERGY) * 100) + '%';
                }
            }
            powerups.splice(i, 1);
        }
    }
}

// Show powerup notification
function showPowerUpNotification(text) {
    const el = document.getElementById('powerupInfo');
    document.getElementById('powerupType').textContent = text;
    el.style.display = 'block';
    setTimeout(() => {
        el.style.display = 'none';
    }, 2000);
}

// Hyper mode control
function startHyper() {
    if (hyperActive) return;
    hyperActive = true;
    hyperTimer = HYPER_DURATION_FRAMES;
    savedSpawnRate = spawnRate;
    spawnRate = Math.max(0.001, spawnRate * 0.5); // fewer cars while hyper
    player.baseSpeed = player.baseSpeed * HYPER_MULTIPLIER;
    player.speed = player.baseSpeed;
    energy = 0;
    showPowerUpNotification('🚀 HYPER SPEED!');
}

function endHyper() {
    hyperActive = false;
    hyperTimer = 0;
    if (savedSpawnRate !== null) spawnRate = savedSpawnRate;
    player.baseSpeed = DEFAULT_BASE_SPEED;
    player.speed = player.baseSpeed;
    savedSpawnRate = null;
    initStars();
}

// Update game
function update() {
    if (!gameRunning) return;

    frameCount++;

    updatePlayer();
    spawnEntity();

    // Update and remove off-screen enemies
    enemies = enemies.filter(enemy => {
        enemy.update();
        if (!enemy.isOffScreen()) {
            return true;
        } else {
            score += 10;
            return false;
        }
    });

    // Update and remove off-screen powerups
    powerups = powerups.filter(powerup => {
        powerup.update();
        return !powerup.isOffScreen();
    });

    // Check powerup collection
    checkPowerUpCollision();

    // Charge energy when not hyper
    if (!hyperActive) {
        energy = Math.min(MAX_ENERGY, energy + ENERGY_CHARGE_RATE);
    }
    // Update energy bar UI
    const fillEl = document.getElementById('energyFill');
    if (fillEl) {
        const percentage = Math.floor((energy / MAX_ENERGY) * 100);
        fillEl.style.width = percentage + '%';
    }

    // Manage hyper timer
    if (hyperActive) {
        hyperTimer--;
        if (hyperTimer <= 0) {
            endHyper();
        }
    }

    // Increase difficulty and level
    if (frameCount % 150 === 0) {
        enemySpeed += 0.3;
        spawnRate += 0.001;
        level = Math.floor(frameCount / 150) + 1;
        document.getElementById('level').textContent = level;
    }

    // Check collision with shield
    if (checkCollision()) {
        if (player.hasShield) {
            player.hasShield = false;
            player.shieldTimer = 0;
            showPowerUpNotification('Shield Broken!');
        } else {
            endGame();
        }
    }

    document.getElementById('score').textContent = score;
}

// Draw everything
function draw() {
    // Clear canvas
    if (hyperActive) {
        // Slightly darker background during hyper
        ctx.fillStyle = '#0b2b3a';
    } else {
        ctx.fillStyle = '#87CEEB';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If hyper, draw subtle starfield in background
    if (hyperActive) {
        ctx.save();
        for (let s of stars) {
            s.y += s.speed;
            if (s.y > canvas.height + 2) s.y = -2 - Math.random() * 20;
            ctx.globalAlpha = s.alpha;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(s.x, s.y, s.size, s.size);
        }
        ctx.restore();
    }

    // Draw road lines
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 10]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw game objects
    drawPlayer();
    enemies.forEach(enemy => enemy.draw());
    powerups.forEach(powerup => powerup.draw());
}

// Game loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// End game
function endGame() {
    gameRunning = false;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem('carGameHighScore', highScore);
        document.getElementById('highScore').textContent = highScore;
    }

    document.getElementById('finalScore').textContent = score;
    document.getElementById('levelReached').textContent = level;
    document.getElementById('gameOver').style.display = 'flex';
}

// Restart game
function restartGame() {
    gameRunning = true;
    score = 0;
    level = 1;
    frameCount = 0;
    enemySpeed = DEFAULT_ENEMY_SPEED;
    spawnRate = DEFAULT_SPAWN_RATE;
    enemies = [];
    powerups = [];
    player.x = canvas.width / 2 - 20;
    player.y = canvas.height - 80;
    player.dx = 0;
    player.hasShield = false;
    player.shieldTimer = 0;
    // Reset movement and speed-related states
    player.baseSpeed = DEFAULT_BASE_SPEED;
    player.speed = player.baseSpeed;
    player.boostTimer = 0;
    player.isBraking = false;

    // Reset energy / hyper
    energy = 0;
    hyperActive = false;
    hyperTimer = 0;
    savedSpawnRate = null;
    initStars();
    const fillEl = document.getElementById('energyFill');
    if (fillEl) {
        fillEl.style.width = '0%';
    }

    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('score').textContent = score;
    document.getElementById('level').textContent = level;

}

// Start the game
gameLoop();
