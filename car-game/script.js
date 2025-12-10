let canvas;
let ctx;

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
        // If canvas isn't initialized yet, use fallback dimensions — we'll recreate after init
        const w = (canvas && canvas.width) ? canvas.width : 400;
        const h = (canvas && canvas.height) ? canvas.height : 600;
        stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            size: Math.random() * 2 + 0.5,
            speed: Math.random() * 0.6 + 0.2,
            alpha: Math.random() * 0.6 + 0.2
        });
    }
}
// don't init stars here — wait until canvas is available in initGame()

// Player car
const player = {
    x: 0,
    y: 0,
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
let bullets = [];
let enemySpeed = DEFAULT_ENEMY_SPEED;
let spawnRate = DEFAULT_SPAWN_RATE;
let frameCount = 0;

// Big gun mechanic
let killCount = 0;
const KILLS_FOR_BIG_GUN = 15;
const BIG_GUN_MAX_USES = 3;
let hasBigGun = false;
let bigGunActive = false;
let bigGunUsesLeft = 0;
let clearEnemiesTimer = 0;
const CLEAR_ENEMIES_DURATION = 360; // 6 seconds at ~60fps

// Soundtrack (procedural, relaxing, ~60s loop)
let audioCtx = null;
let masterGain = null;
let soundtrackStarted = false;
let soundtrackIntervalId = null;

function stopSoundtrack() {
    if (!soundtrackStarted) return;
    if (soundtrackIntervalId) {
        clearInterval(soundtrackIntervalId);
        soundtrackIntervalId = null;
    }
    if (audioCtx && masterGain) {
        const now = audioCtx.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.linearRampToValueAtTime(0, now + 0.4);
        setTimeout(() => {
            audioCtx.suspend();
            audioCtx = null;
            masterGain = null;
        }, 500);
    } else {
        audioCtx = null;
        masterGain = null;
    }
    soundtrackStarted = false;
}

// Bullet class for gun mechanic
class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 5;
        this.height = 15;
        this.speed = 8;
    }

    update() {
        this.y -= this.speed;
    }

    draw() {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    isOffScreen() {
        return this.y < 0;
    }
}

// Input handling
const keys = {};
let mobileLeftPressed = false;
let mobileRightPressed = false;

window.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    if (e.key === ' ') {
        e.preventDefault();
        if (!gameRunning) {
            restartGame();
        } else if (bigGunActive && bigGunUsesLeft > 0) {
            // Fire big gun - clear all enemies for 6 seconds
            clearEnemiesTimer = CLEAR_ENEMIES_DURATION;
            enemies = [];
            bigGunUsesLeft--;
            if (bigGunUsesLeft <= 0) {
                hasBigGun = false;
            }
            bigGunActive = false;
        } else {
            // Fire bullet when Space is pressed
            shootBullet();
        }
    }
    
    // Activate big gun with 'm' or 'M'
    if ((e.key === 'm' || e.key === 'M') && hasBigGun && gameRunning && bigGunUsesLeft > 0) {
        bigGunActive = !bigGunActive;
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

// Initialize mobile controls when DOM is ready
function initMobileControls(canvasElement) {
    const touchOverlay = document.getElementById('touchOverlay');
    const restartBtn = document.getElementById('restartBtn');

    console.log('Mobile controls init:', { touchOverlay, restartBtn });

    if (touchOverlay) {
        // Handle touch events on overlay
        touchOverlay.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvasElement.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            
            if (x < canvasElement.width / 2) {
                mobileLeftPressed = true;
                console.log('Touch left');
            } else {
                mobileRightPressed = true;
                console.log('Touch right');
            }
        });

        touchOverlay.addEventListener('touchend', (e) => {
            e.preventDefault();
            mobileLeftPressed = false;
            mobileRightPressed = false;
            console.log('Touch ended');
        });

        // Mouse events for desktop testing
        touchOverlay.addEventListener('mousedown', (e) => {
            const rect = canvasElement.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            if (x < canvasElement.width / 2) {
                mobileLeftPressed = true;
                console.log('Mouse left down');
            } else {
                mobileRightPressed = true;
                console.log('Mouse right down');
            }
        });

        touchOverlay.addEventListener('mouseup', (e) => {
            mobileLeftPressed = false;
            mobileRightPressed = false;
            console.log('Mouse up');
        });

        touchOverlay.addEventListener('click', (e) => {
            if (gameRunning) {
                shootBullet();
                console.log('Shoot from click');
            }
        });

        console.log('Touch overlay listeners attached');
    } else {
        console.log('Touch overlay not found');
    }

    // Restart button
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            console.log('Restart button clicked');
            restartGame();
        });
        console.log('Restart button listener attached');
    } else {
        console.log('Restart button not found');
    }
}

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
        if (keys['ArrowLeft'] || keys['a'] || keys['A'] || mobileLeftPressed) {
            player.dx = -player.speed;
        } else if (keys['ArrowRight'] || keys['d'] || keys['D'] || mobileRightPressed) {
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

// Check bullet collision with enemies
function checkBulletCollision() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (
                bullet.x < enemy.x + enemy.width &&
                bullet.x + bullet.width > enemy.x &&
                bullet.y < enemy.y + enemy.height &&
                bullet.y + bullet.height > enemy.y
            ) {
                // Remove bullet and enemy
                bullets.splice(i, 1);
                enemies.splice(j, 1);
                score += 25;
                
                // Increment kill count
                killCount++;
                
                // Award big gun after 15 kills
                if (killCount === KILLS_FOR_BIG_GUN) {
                    hasBigGun = true;
                    bigGunUsesLeft = BIG_GUN_MAX_USES;
                    showPowerUpNotification('🔫 BIG GUN UNLOCKED! Press M to activate, Space to fire!');
                } else {
                    showPowerUpNotification('💥 Direct Hit!');
                }
                break;
            }
        }
    }
}

// Draw powerup notification
function showPowerUpNotification(text) {
    const el = document.getElementById('powerupInfo');
    document.getElementById('powerupType').textContent = text;
    el.style.display = 'block';
    setTimeout(() => {
        el.style.display = 'none';
    }, 2000);
}

// Shoot bullet
function shootBullet() {
    // Fire from center of player car
    const bulletX = player.x + player.width / 2 - 2.5;
    const bulletY = player.y;
    bullets.push(new Bullet(bulletX, bulletY));
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
    
    // Update clear enemies timer
    if (clearEnemiesTimer > 0) {
        clearEnemiesTimer--;
    }

    updatePlayer();
    
    // Don't spawn enemies while big gun clear effect is active
    if (clearEnemiesTimer <= 0) {
        spawnEntity();
    }

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

    // Update and remove off-screen bullets
    bullets = bullets.filter(bullet => {
        bullet.update();
        return !bullet.isOffScreen();
    });

    // Check powerup collection
    checkPowerUpCollision();

    // Check bullet collisions with enemies
    checkBulletCollision();

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
    if (!ctx || !canvas) {
        console.error('Canvas or context not initialized');
        return;
    }
    
    // Clear canvas with blue road
    if (hyperActive) {
        // Slightly darker background during hyper
        ctx.fillStyle = '#0b2b3a';
    } else {
        ctx.fillStyle = '#1a5f9f';
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If big gun clear effect is active, show white overlay
    if (clearEnemiesTimer > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (clearEnemiesTimer / CLEAR_ENEMIES_DURATION)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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

    // Draw big gun status
    if (hasBigGun) {
        ctx.fillStyle = bigGunActive ? '#FF6B6B' : '#FFD700';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`🔫 BIG GUN ${bigGunActive ? 'ACTIVE' : 'READY'}`, 10, canvas.height - 10);
    }

    // Draw game objects
    drawPlayer();
    enemies.forEach(enemy => enemy.draw());
    powerups.forEach(powerup => powerup.draw());
    bullets.forEach(bullet => bullet.draw());
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
    stopSoundtrack();
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
    bullets = [];
    killCount = 0;
    hasBigGun = false;
    bigGunActive = false;
    bigGunUsesLeft = 0;
    clearEnemiesTimer = 0;
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
    startSoundtrack();
}

// Initialize game when DOM is ready
function initGame() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Failed to get canvas 2D context!');
        return;
    }
    // Initialize player position now that canvas exists
    player.x = Math.floor(canvas.width / 2 - player.width / 2);
    player.y = canvas.height - 80;
    // Initialize starfield with correct canvas dimensions
    initStars();
    console.log('Game initialized successfully', { canvas: canvas.width + 'x' + canvas.height, ctx });
    initMobileControls(canvas);
    gameLoop();
}

// Soundtrack helpers
function startSoundtrack() {
    if (soundtrackStarted) return;
    soundtrackStarted = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.08;
    masterGain.connect(audioCtx.destination);

    // 15-chord progression @4s each => ~60s loop
    const chords = [
        [220, 277, 330],  // Amaj-ish
        [196, 247, 294],  // Gmaj-ish
        [174, 233, 294],  // Fmaj-ish
        [196, 247, 330],  // Gmaj/E
        [220, 262, 330],  // Aadd9
        [185, 233, 294],  // F#/F#
        [196, 247, 311],  // Gadd11
        [165, 220, 277],  // D/A
        [196, 247, 330],  // Gmaj/E
        [174, 220, 294],  // Fmaj/A
        [208, 262, 330],  // Abadd9
        [196, 247, 311],  // Gadd11
        [174, 233, 294],  // Fmaj
        [196, 247, 294],  // Gmaj
        [220, 277, 330],  // Amaj resolve
    ];
    let chordIndex = 0;
    const chordDuration = 4; // seconds per chord, 4 chords -> ~16s phrase looping

    const scheduleChord = () => {
        const now = audioCtx.currentTime;
        const freqs = chords[chordIndex];
        freqs.forEach(freq => {
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900, now);
            filter.Q.value = 0.6;

            const gain = audioCtx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.09, now + 0.4);
            gain.gain.linearRampToValueAtTime(0.05, now + chordDuration - 0.6);
            gain.gain.linearRampToValueAtTime(0, now + chordDuration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);

            osc.start(now);
            osc.stop(now + chordDuration + 0.1);
        });

        chordIndex = (chordIndex + 1) % chords.length;
    };

    // Schedule first chord immediately and then loop every chordDuration seconds
    scheduleChord();
    soundtrackIntervalId = setInterval(scheduleChord, chordDuration * 1000);
}

function attachSoundtrackStarter() {
    const starter = () => {
        startSoundtrack();
        document.removeEventListener('keydown', starter, true);
        document.removeEventListener('pointerdown', starter, true);
    };
    document.addEventListener('keydown', starter, true);
    document.addEventListener('pointerdown', starter, true);
}

// Wait for DOM to be ready before starting
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initGame();
        attachSoundtrackStarter();
    });
} else {
    initGame();
    attachSoundtrackStarter();
}
