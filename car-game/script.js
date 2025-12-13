let canvas;
let ctx;

// Defaults and game variables
const DEFAULT_BASE_SPEED = 5;
const DEFAULT_ENEMY_SPEED = 3;
const DEFAULT_SPAWN_RATE = 0.02;
const HYPER_MULTIPLIER = 3;
const HYPER_DURATION_FRAMES = 300; // 5 seconds at ~60fps
const AI_SPEED_MULTIPLIER = 3.5; // super fast autopilot
const AI_LOOKAHEAD_FRAMES = 90; // longer lookahead for safety
const AI_FIRE_COOLDOWN_FRAMES = 12; // slightly slower auto-fire
const MAIN_MUSIC_GAIN = 0.08;

let gameRunning = true;
let score = 0;
let level = 1;
let highScore = 0;
document.getElementById('highScore').textContent = highScore;
let carsShot = 0;
document.getElementById('carCount').textContent = carsShot;
let money = 0;
let pendingRevive = false;
let moneyRainTriggered = false;
let inComputerWorld = false;

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
let explosions = [];
let aiEnabled = false;
let aiFireCooldown = 0;
let aiSideToggle = false;
let invulnerableFrames = 0;
let spawnLockFrames = 0;
let dinoPopGain = null;
let dinoPopInterval = null;
let dinoMusicActive = false;
let technoGain = null;
let technoInterval = null;
let technoActive = false;
let funGain = null;
let funInterval = null;
let funMusicActive = false;
let finishLineActive = false;
let finishLineY = -50;
let finishReached = false;
const MONEY_KEY = 'carGameMoneyEnc';
const MONEY_PASS = 'finger';
const HIGH_SCORE_KEY = 'carGameHighScoreEnc';
let enemySpeed = DEFAULT_ENEMY_SPEED;
let spawnRate = DEFAULT_SPAWN_RATE;
let frameCount = 0;
let mainMusicMuted = false;

// Big gun mechanic
let killCount = 0;
const KILLS_FOR_BIG_GUN = 15;
const BIG_GUN_MAX_USES = 3;
let hasBigGun = false;
let bigGunActive = false;
let bigGunUsesLeft = 0;
let clearEnemiesTimer = 0;
const CLEAR_ENEMIES_DURATION = 360; // 6 seconds at ~60fps
const MONEY_VALUE = 1;
const MONEY_MAX_BAR = 1000;

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
    constructor(x, y, targetX = null, vx = 0, vy = -8) {
        this.x = x;
        this.y = y;
        this.width = 5;
        this.height = 15;
        this.speed = vy; // vertical component
        this.targetX = targetX;
        this.homingMax = 2.4;
        this.vx = vx;
    }

    update() {
        // Apply slight homing when a target is provided (used by autopilot)
        if (this.targetX !== null) {
            const center = this.x + this.width / 2;
            const dx = this.targetX - center;
            const step = Math.max(-this.homingMax, Math.min(this.homingMax, dx * 0.12));
            this.x += step;
        } else {
            this.x += this.vx;
        }
        this.y += this.speed;
    }

    draw() {
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    isOffScreen() {
        return this.y < 0;
    }
}

// Simple explosion effect
class Explosion {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = 35;
        this.life = 18; // frames
    }

    update() {
        this.radius = Math.min(this.maxRadius, this.radius + 4);
        this.life -= 1;
    }

    draw() {
        const alpha = Math.max(0, this.life / 18);
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        gradient.addColorStop(0.35, `rgba(255, 215, 0, ${alpha})`);
        gradient.addColorStop(1, `rgba(255, 107, 107, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    isDone() {
        return this.life <= 0;
    }
}

// Input handling
const keys = {};
let mobileLeftPressed = false;
let mobileRightPressed = false;

function setKeyState(e, state) {
    const raw = e.key || '';
    if (!raw) return;
    keys[raw] = state;
    keys[raw.toLowerCase()] = state;
}

function updateMoneyDisplay() {
    const fillEl = document.getElementById('moneyFill');
    const amountEl = document.getElementById('moneyAmount');
    if (fillEl) {
        const pct = Math.min(100, (money / MONEY_MAX_BAR) * 100);
        fillEl.style.width = pct + '%';
    }
    if (amountEl) {
        amountEl.textContent = money;
    }
}

// Simple XOR + base64 obfuscation for money storage
function xorEncode(str, key) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
        out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(out);
}

function xorDecode(enc, key) {
    try {
        const data = atob(enc);
        let out = '';
        for (let i = 0; i < data.length; i++) {
            out += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    } catch (e) {
        return null;
    }
}

function loadMoney() {
    const enc = localStorage.getItem(MONEY_KEY);
    if (!enc) {
        money = 0;
        return;
    }
    const decoded = xorDecode(enc, MONEY_PASS);
    const val = decoded ? parseInt(decoded, 10) : 0;
    money = Number.isFinite(val) ? val : 0;
}

function saveMoney() {
    const enc = xorEncode(String(money), MONEY_PASS);
    localStorage.setItem(MONEY_KEY, enc);
}

function loadHighScore() {
    const enc = localStorage.getItem(HIGH_SCORE_KEY);
    if (enc) {
        const decoded = xorDecode(enc, MONEY_PASS);
        const val = decoded ? parseInt(decoded, 10) : 0;
        highScore = Number.isFinite(val) ? val : 0;
        return;
    }
    const legacy = localStorage.getItem('carGameHighScore');
    const val = legacy ? parseInt(legacy, 10) : 0;
    highScore = Number.isFinite(val) ? val : 0;
    // save back encoded
    const encNew = xorEncode(String(highScore), MONEY_PASS);
    localStorage.setItem(HIGH_SCORE_KEY, encNew);
}

function saveHighScore() {
    const enc = xorEncode(String(highScore), MONEY_PASS);
    localStorage.setItem(HIGH_SCORE_KEY, enc);
}

function openGodMode() {
    const pw = prompt('Enter password for godmode');
    if (pw !== MONEY_PASS) {
        alert('Wrong password');
        return;
    }
    const choice = (prompt('Type "money" to set money or "highscore" to set high score') || '').toLowerCase().trim();
    if (choice === 'money') {
        const amt = parseInt(prompt('Enter money amount'), 10);
        if (Number.isFinite(amt) && amt >= 0) {
            money = amt;
            updateMoneyDisplay();
            saveMoney();
            showPowerUpNotification('Godmode money set');
        } else {
            alert('Invalid amount');
        }
    } else if (choice === 'highscore') {
        const hs = parseInt(prompt('Enter high score'), 10);
        if (Number.isFinite(hs) && hs >= 0) {
            highScore = hs;
            document.getElementById('highScore').textContent = highScore;
            saveHighScore();
            showPowerUpNotification('Godmode high score set');
        } else {
            alert('Invalid amount');
        }
    } else {
        alert('No change made.');
    }
}

function spawnMoneyBurst(count) {
    for (let i = 0; i < count; i++) {
        const p = {
            x: Math.random() * (canvas.width - 30),
            y: -Math.random() * 200 - 30,
            width: 30,
            height: 30,
            speed: 2,
            type: 'money',
            update() { this.y += this.speed; },
            isOffScreen() { return this.y > canvas.height; },
            draw() {
                ctx.fillStyle = '#4CAF50';
                ctx.beginPath();
                ctx.arc(this.x + 15, this.y + 15, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('$', this.x + 15, this.y + 20);
            }
        };
        powerups.push(p);
    }
}

function handleFireAction() {
    if (!gameRunning) {
        restartGame();
        return;
    }
    if (bigGunActive && bigGunUsesLeft > 0) {
        fireBigGun();
    } else {
        shootBullet();
    }
}

function toggleBigGun() {
    if ((hasBigGun && gameRunning) && bigGunUsesLeft > 0) {
        bigGunActive = !bigGunActive;
    }
}

function startBrake() {
    player.isBraking = true;
    player.dx = 0;
}

function releaseBrake() {
    if (player.isBraking) {
        player.isBraking = false;
        player.boostTimer = 120; // frames of boost (~2 seconds at 60fps)
        player.speed = player.baseSpeed * 2; // temporary speed multiplier
        showPowerUpNotification('⚡ Boost Released!');
    }
}

// Combine nearby enemies into an obstacle list for the autopilot to dodge
function aiObstacles() {
    return enemies.map(e => ({ x: e.x, y: e.y, w: e.width, h: e.height, s: e.speed || enemySpeed }));
}

function fireBigGun() {
    if (!hasBigGun || bigGunUsesLeft <= 0 || !gameRunning) return;
    // Count all enemies currently on screen as cleared shots
    carsShot += enemies.length;
    document.getElementById('carCount').textContent = carsShot;
    clearEnemiesTimer = CLEAR_ENEMIES_DURATION;
    enemies = [];
    bigGunUsesLeft--;
    if (bigGunUsesLeft <= 0) {
        hasBigGun = false;
    }
    bigGunActive = false;
}

window.addEventListener('keydown', (e) => {
    setKeyState(e, true);

    // O+L: enable autopilot steering; I+K: disable
    if (keys['o'] && keys['l']) {
        aiEnabled = true;
        showPowerUpNotification('🤖 Autopilot ON');
    }
    if (keys['i'] && keys['k']) {
        aiEnabled = false;
        player.dx = 0;
        player.speed = player.baseSpeed;
        showPowerUpNotification('🛑 Autopilot OFF');
    }

    if (e.key === ' ') {
        e.preventDefault();
        handleFireAction();
    }
    
    // Activate big gun with 'm' or 'M'
    if ((e.key === 'm' || e.key === 'M') && hasBigGun && gameRunning && bigGunUsesLeft > 0) {
        toggleBigGun();
    }
    
    // Start braking when Down arrow or 's' pressed
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        startBrake();
    }

    // Activate hyper when energy full and Up arrow / W pressed
    if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && energy >= MAX_ENERGY && !hyperActive) {
        e.preventDefault();
        startHyper();
    }

    // Godmode money set: Ctrl+Shift+G
    if (e.key.toLowerCase() === 'g' && e.ctrlKey && e.shiftKey) {
        openGodMode();
    }
});

window.addEventListener('keyup', (e) => {
    setKeyState(e, false);
    // Release brake: trigger short speed boost
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        releaseBrake();
    }
});

// Initialize mobile controls when DOM is ready
function initMobileControls(canvasElement) {
    const touchOverlay = document.getElementById('touchOverlay');
    const restartBtn = document.getElementById('restartBtn');
    const reviveBtn = document.getElementById('reviveBtn');
    const finishRestart = document.getElementById('finishRestart');
    const shootBtn = document.getElementById('shootBtn');
    const hyperBtn = document.getElementById('hyperBtn');
    const brakeBtn = document.getElementById('brakeBtn');
    const bigGunBtn = document.getElementById('bigGunBtn');

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

    if (reviveBtn) {
        reviveBtn.addEventListener('click', () => {
            if (!pendingRevive) return;
            if (money >= 10) {
                money -= 10;
                updateMoneyDisplay();
                saveMoney();
                document.getElementById('gameOver').style.display = 'none';
                pendingRevive = false;
                reviveGame();
            } else {
                showPowerUpNotification('Not enough money to revive!');
            }
        });
    }

    const safePrevent = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const addPress = (el, handler) => {
        if (!el) return;
        const wrapped = (e) => {
            safePrevent(e);
            handler();
        };
        el.addEventListener('pointerdown', wrapped);
        el.addEventListener('touchstart', wrapped, { passive: false });
        el.addEventListener('click', wrapped);
    };

    if (shootBtn) {
        addPress(shootBtn, handleFireAction);
    }

    if (hyperBtn) {
        addPress(hyperBtn, () => {
            if (energy >= MAX_ENERGY && !hyperActive) {
                startHyper();
            }
        });
    }

    if (brakeBtn) {
        const handleDown = (e) => { safePrevent(e); startBrake(); };
        const handleUp = (e) => { safePrevent(e); releaseBrake(); };
        brakeBtn.addEventListener('pointerdown', handleDown);
        brakeBtn.addEventListener('pointerup', handleUp);
        brakeBtn.addEventListener('pointerleave', handleUp);
        brakeBtn.addEventListener('touchstart', handleDown, { passive: false });
        brakeBtn.addEventListener('touchend', handleUp, { passive: false });
        brakeBtn.addEventListener('touchcancel', handleUp, { passive: false });
        brakeBtn.addEventListener('click', handleUp);
    }

    if (bigGunBtn) {
        addPress(bigGunBtn, fireBigGun);
    }

    if (finishRestart) {
        finishRestart.addEventListener('click', () => {
            document.getElementById('finishOverlay').style.display = 'none';
            finishReached = false;
            restartGame();
        });
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
        const roll = Math.random();
        if (roll < 0.33) {
            this.type = 'shield';
        } else if (roll < 0.66) {
            this.type = 'speed';
        } else {
            this.type = 'money';
        }
    }

    if (finishRestart) {
        finishRestart.addEventListener('click', () => {});
    }
    if (finishLike) {
        finishLike.addEventListener('click', () => {});
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
        } else if (this.type === 'speed') {
            ctx.fillStyle = '#00FF00';
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('⚡', this.x + 15, this.y + 22);
        } else {
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc(this.x + 15, this.y + 15, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('$', this.x + 15, this.y + 20);
        }
    }

    isOffScreen() {
        return this.y > canvas.height;
    }
}

function aiTargetX() {
    // Evaluate several road positions and choose the safest (furthest from nearby enemies)
    const positions = [0.12, 0.28, 0.44, 0.56, 0.72, 0.88].map(p => (canvas.width * p) - player.width / 2);
    const safetyMarginX = (player.width / 2) + 32;
    const safetyMarginY = 300;
    const obs = aiObstacles();
    const lookahead = AI_LOOKAHEAD_FRAMES;
    // Find nearest enemy ahead to lightly bias toward for shots
    let nearestEnemy = null;
    let nearestDy = Number.POSITIVE_INFINITY;
    for (const e of enemies) {
        const dy = player.y - (e.y + e.height);
        if (dy > 0 && dy < nearestDy) {
            nearestDy = dy;
            nearestEnemy = e;
        }
    }
    // Find nearest shield powerup ahead to attract toward safely
    let nearestShield = null;
    let nearestShieldDy = Number.POSITIVE_INFINITY;
    for (const p of powerups) {
        if (p.type !== 'shield') continue;
        const dy = player.y - (p.y + p.height);
        if (dy > 0 && dy < nearestShieldDy) {
            nearestShieldDy = dy;
            nearestShield = p;
        }
    }

    let bestPos = player.x;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const pos of positions) {
        let score = 0;
        for (const o of obs) {
            const candidateCenter = pos + player.width / 2;
            const obstacleCenter = o.x + o.w / 2;
            const dx = Math.abs(candidateCenter - obstacleCenter);
            const projectedY = o.y + o.h + (o.s || 0) * lookahead;
            const gapY = player.y - projectedY; // >0 means obstacle is ahead of player
            if (gapY > safetyMarginY) continue;
            const horizontalPenalty = Math.max(0, (o.w / 2) + safetyMarginX - dx);
            const verticalWeight = Math.max(80, safetyMarginY - gapY);
            score += horizontalPenalty * verticalWeight;
            // Extra side-clear penalty when we are parallel/overlapping in Y (reduce side swipes)
            if (Math.abs(gapY) < 100 && dx < (o.w / 2 + player.width / 2 + 18)) {
                score += 10000;
            }
            // Corner avoidance: penalize when both horizontal and vertical clearance are tight
            const halfWidthSum = (o.w / 2) + (player.width / 2);
            const sepX = dx - halfWidthSum;
            if (gapY > -60 && gapY < 200 && sepX < 32) {
                score += (32 - Math.max(0, sepX)) * 260;
            }
            // Predictive collision: if projected overlap is likely, heavily penalize
            const projectedOverlap = dx < (halfWidthSum + 26);
            if (projectedOverlap && gapY < 220 && gapY > -40) {
                score += 20000;
            }
        }
        // Light attraction toward nearest enemy only when safely far
        if (nearestEnemy && nearestDy > 200) {
            const enemyCenter = nearestEnemy.x + nearestEnemy.width / 2;
            const candidateCenter = pos + player.width / 2;
            const dxEnemy = Math.abs(candidateCenter - enemyCenter);
            const attraction = Math.max(0, 240 - dxEnemy);
            score -= attraction * 4;
        }
        // Attraction toward nearest shield if one is ahead (priority over enemy)
        if (nearestShield && nearestShieldDy > 0) {
            const shieldCenter = nearestShield.x + nearestShield.width / 2;
            const candidateCenter = pos + player.width / 2;
            const dxShield = Math.abs(candidateCenter - shieldCenter);
            const shieldAttraction = Math.max(0, 280 - dxShield);
            // Stronger pull toward shield, but still subject to safety penalties above
            score -= shieldAttraction * 8;
        }
        if (score < bestScore) {
            bestScore = score;
            bestPos = pos;
        }
    }

    return Math.max(0, Math.min(bestPos, canvas.width - player.width));
}

// Update player position
function updatePlayer() {
    if (aiEnabled) {
        player.isBraking = false;
        let targetX = aiTargetX();
        const obs = aiObstacles();
        // Look ahead and preemptively steer away if an obstacle will align with our lane soon
        const preempt = obs.find(o => {
            const projectedY = o.y + o.h + (o.s || enemySpeed) * AI_LOOKAHEAD_FRAMES;
            const gapFuture = player.y - projectedY;
            const overlapX = !(player.x + player.width < o.x || player.x > o.x + o.w);
            return overlapX && gapFuture > -40 && gapFuture < 260;
        });
        if (preempt) {
            const obstacleCenter = preempt.x + preempt.w / 2;
            const goRight = player.x + player.width / 2 < obstacleCenter;
            targetX = goRight ? canvas.width * 0.85 - player.width / 2 : canvas.width * 0.15 - player.width / 2;
        }
        // Emergency sidestep if obstacle is right ahead in current path
        const imminent = obs.find(o => {
            const overlapX = !(player.x + player.width < o.x || player.x > o.x + o.w);
            const gapY = player.y - (o.y + o.h);
            return overlapX && gapY > -40 && gapY < 110;
        });
        if (imminent) {
            const obstacleCenter = imminent.x + imminent.w / 2;
            const goRight = player.x + player.width / 2 < obstacleCenter;
            targetX = goRight ? canvas.width * 0.85 - player.width / 2 : canvas.width * 0.15 - player.width / 2;
        }

        const delta = targetX - player.x;
        let baseAiSpeed = player.baseSpeed * AI_SPEED_MULTIPLIER;
        const closeAheadCount = obs.filter(o => {
            const gapY = player.y - (o.y + o.h);
            const overlapX = !(player.x + player.width < o.x || player.x > o.x + o.w);
            return overlapX && gapY > -40 && gapY < 200;
        }).length;
        if (closeAheadCount > 1) {
            baseAiSpeed *= 0.85;
        }

        if (Math.abs(delta) > 1.5) {
            player.speed = imminent ? baseAiSpeed * 1.6 : baseAiSpeed;
            player.dx = delta > 0 ? player.speed : -player.speed;
        } else {
            player.dx = 0;
            player.speed = player.baseSpeed;
        }
        // If dangerously close horizontally and vertically, brake hard while steering
        const danger = obs.some(o => {
            const overlapX = !(player.x + player.width < o.x || player.x > o.x + o.w);
            const gapY = player.y - (o.y + o.h);
            return overlapX && gapY > -20 && gapY < 100;
        });
        if (danger) {
            player.speed = Math.max(1, player.baseSpeed * 0.5);
            player.dx = Math.sign(delta) * player.speed;
        }
        player.x += player.dx;
    } else {
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
    }

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
    ctx.fillStyle = '#ffb347'; // brighter car color for visibility
    ctx.fillRect(player.x, player.y, player.width, player.height);
    ctx.strokeStyle = '#d15d00';
    ctx.lineWidth = 2;
    ctx.strokeRect(player.x, player.y, player.width, player.height);

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

function drawDinoScenery() {
    const horizon = canvas.height * 0.65;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#f2d8a7');
    grad.addColorStop(1, '#d5a45a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Mountains
    ctx.fillStyle = '#b57f3b';
    ctx.beginPath();
    ctx.moveTo(-40, horizon + 40);
    ctx.lineTo(80, horizon - 70);
    ctx.lineTo(210, horizon + 40);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(140, horizon + 60);
    ctx.lineTo(280, horizon - 50);
    ctx.lineTo(440, horizon + 60);
    ctx.closePath();
    ctx.fill();
    // Cacti
    ctx.fillStyle = '#2f6b2c';
    [60, 180, 330].forEach(x => {
        ctx.fillRect(x, horizon - 30, 12, 60);
        ctx.fillRect(x - 10, horizon, 10, 25);
        ctx.fillRect(x + 12, horizon - 10, 10, 25);
    });
}

function drawComputerScenery() {
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0b1021');
    grad.addColorStop(1, '#162447');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(0,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Scanlines
    ctx.strokeStyle = 'rgba(0,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let y = 10; y < canvas.height; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Floating nodes
    ctx.fillStyle = '#00e0ff';
    for (let i = 0; i < 20; i++) {
        const nx = (Math.sin((frameCount + i * 10) * 0.05) * 0.4 + 0.5) * canvas.width;
        const ny = (Math.cos((frameCount + i * 8) * 0.04) * 0.4 + 0.5) * canvas.height;
        ctx.beginPath();
        ctx.arc(nx, ny, 4, 0, Math.PI * 2);
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
            return enemy;
        }
    }
    return null;
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
            } else if (powerup.type === 'speed') {
                score += 50;
                // Speed powerup now also charges energy
                energy = Math.min(MAX_ENERGY, energy + 30);
                showPowerUpNotification('⚡ Speed Boost! Energy +30');
                // Update energy UI immediately
                const fillEl = document.getElementById('energyFill');
                if (fillEl) {
                    fillEl.style.width = Math.floor((energy / MAX_ENERGY) * 100) + '%';
                }
            } else if (powerup.type === 'money') {
                money += MONEY_VALUE;
                updateMoneyDisplay();
                saveMoney();
                showPowerUpNotification(`💰 +$${MONEY_VALUE}`);
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
                explosions.push(new Explosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2));
                carsShot++;
                document.getElementById('carCount').textContent = carsShot;
                
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
function shootBullet(targetX = null, originX = null, vx = 0, vy = -8, originY = null) {
    // Fire from center of player car unless an origin override is provided (autopilot uses corners)
    const bulletX = originX !== null ? originX : player.x + player.width / 2 - 2.5;
    const bulletY = originY !== null ? originY : player.y;
    bullets.push(new Bullet(bulletX, bulletY, targetX, vx, vy));
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
    if (aiFireCooldown > 0) aiFireCooldown--;
    if (invulnerableFrames > 0) invulnerableFrames--;
    
    // Update clear enemies timer
    if (clearEnemiesTimer > 0) {
        clearEnemiesTimer--;
    }
    if (spawnLockFrames > 0) {
        spawnLockFrames--;
    }

    updatePlayer();

    // Autopilot firing: shoot when enemies exist or danger is close
    if (aiEnabled && aiFireCooldown <= 0 && enemies.length > 0) {
        const leftX = player.x;
        const rightX = player.x + player.width - 5;
        const topY = player.y;
        const bottomY = player.y + player.height - 5;
        // Fire from the corners: forward (top corners), backward (bottom corners), left/right from top corners
        shootBullet(null, leftX, 0, -8, topY);    // forward from top-left
        shootBullet(null, rightX, 0, -8, topY);   // forward from top-right
        shootBullet(null, leftX, 0, 8, bottomY);  // backward from bottom-left
        shootBullet(null, rightX, 0, 8, bottomY); // backward from bottom-right
        shootBullet(null, leftX, -8, 0, topY);    // left from top-left
        shootBullet(null, rightX, 8, 0, topY);    // right from top-right
        aiFireCooldown = AI_FIRE_COOLDOWN_FRAMES;
    }
    
    // Don't spawn enemies while big gun clear effect is active
    if (clearEnemiesTimer <= 0 && spawnLockFrames <= 0) {
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

    // Update explosions
    explosions = explosions.filter(explosion => {
        explosion.update();
        return !explosion.isDone();
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
        if (level > 25 && !moneyRainTriggered) {
            enemies = [];
            spawnLockFrames = 240; // pause spawns for ~4s during money rain
            spawnMoneyBurst(25);
            moneyRainTriggered = true;
            showPowerUpNotification('💰 Money Rain!');
        }
    }
    const inDinoWorld = level > 10 && level < 33;
    const inComputerWorld = level >= 33 && level < 45;
    const inFunWorld = level >= 45;
    if (inFunWorld) {
        startFunMusic();
        stopDinoMusic();
        stopTechno();
    } else if (inComputerWorld) {
        startTechno();
        stopDinoMusic();
        stopFunMusic();
    } else if (inDinoWorld) {
        startDinoMusic();
        stopTechno();
        stopFunMusic();
    } else {
        stopDinoMusic();
        stopTechno();
        stopFunMusic();
    }

    // Check collision with shield / invulnerability
    const hitEnemy = invulnerableFrames > 0 ? null : checkCollision();
    if (hitEnemy) {
        if (player.hasShield) {
            player.hasShield = false;
            player.shieldTimer = 0;
            invulnerableFrames = 90; // 1.5s of grace after shield breaks
            // Remove the enemy we hit so we don't immediately collide again
            enemies = enemies.filter(e => e !== hitEnemy);
            explosions.push(new Explosion(hitEnemy.x + hitEnemy.width / 2, hitEnemy.y + hitEnemy.height / 2));
            showPowerUpNotification('🛡️ Shield Broken!');
        } else {
            endGame();
        }
    }

    document.getElementById('score').textContent = score;

    if (invulnerableFrames > 0) invulnerableFrames--;

    // Finish line for level 54+
    if (level >= 55 && !finishReached && !finishLineActive) {
        finishLineActive = true;
        finishLineY = -40;
        spawnLockFrames = 180;
        enemies = [];
    }
    if (finishLineActive && !finishReached) {
        finishLineY += 4;
        if (finishLineY >= player.y) {
            finishReached = true;
            finishLineActive = false;
            gameRunning = false;
            stopDinoMusic();
            stopTechno();
            stopFunMusic();
            const finishOverlay = document.getElementById('finishOverlay');
            if (finishOverlay) finishOverlay.style.display = 'flex';
        }
    }
}

// Draw everything
function draw() {
    if (!ctx || !canvas) {
        console.error('Canvas or context not initialized');
        return;
    }
    const inDinoWorld = level > 10 && level < 33;
    const inComputerWorld = level >= 33 && level < 45;
    const inFunWorld = level >= 45;
    
    // Clear canvas with themed backgrounds
    if (inFunWorld) {
        // Bright fun gradient with confetti
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#ff9a9e');
        grad.addColorStop(1, '#fad0c4');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Confetti dots
        for (let i = 0; i < 80; i++) {
            ctx.fillStyle = ['#ff5f6d', '#ffc371', '#4facfe', '#43e97b'][i % 4];
            const x = (i * 53 + frameCount * 2) % canvas.width;
            const y = (i * 37 + frameCount * 3) % canvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (inComputerWorld) {
        drawComputerScenery();
    } else if (inDinoWorld) {
        drawDinoScenery();
    } else {
        if (hyperActive) {
            // Slightly darker background during hyper
            ctx.fillStyle = '#0b2b3a';
        } else {
            ctx.fillStyle = '#1a5f9f';
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // If big gun clear effect is active, show white overlay
    if (clearEnemiesTimer > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (clearEnemiesTimer / CLEAR_ENEMIES_DURATION)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!inDinoWorld && !inComputerWorld && !inFunWorld) {
        // Draw road lines
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 10]);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 0);
        ctx.lineTo(canvas.width / 2, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (inDinoWorld) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 18]);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - 60, 0);
        ctx.lineTo(canvas.width / 2 - 60, canvas.height);
        ctx.moveTo(canvas.width / 2 + 60, 0);
        ctx.lineTo(canvas.width / 2 + 60, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (inComputerWorld) {
        ctx.strokeStyle = 'rgba(0,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 12]);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - 70, 0);
        ctx.lineTo(canvas.width / 2 - 70, canvas.height);
        ctx.moveTo(canvas.width / 2 + 70, 0);
        ctx.lineTo(canvas.width / 2 + 70, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (inFunWorld) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 14]);
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - 80, 0);
        ctx.lineTo(canvas.width / 2 - 80, canvas.height);
        ctx.moveTo(canvas.width / 2 + 80, 0);
        ctx.lineTo(canvas.width / 2 + 80, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

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
    explosions.forEach(explosion => explosion.draw());

    if (finishLineActive && !finishReached) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(0, finishLineY);
        ctx.lineTo(canvas.width, finishLineY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('FINISH', canvas.width / 2, finishLineY - 10);
    }
}

// Game loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// End game
function endGame() {
    if (!gameRunning) return;
    gameRunning = false;
    stopDinoMusic();
    stopTechno();
    stopFunMusic();

    if (score > highScore) {
        highScore = score;
        saveHighScore();
        document.getElementById('highScore').textContent = highScore;
    }

    document.getElementById('finalScore').textContent = score;
    document.getElementById('levelReached').textContent = level;
    const carsShotFinalEl = document.getElementById('carsShotFinal');
    if (carsShotFinalEl) {
        carsShotFinalEl.textContent = carsShot;
    }
    document.getElementById('gameOver').style.display = 'flex';
    const reviveBtn = document.getElementById('reviveBtn');
    if (reviveBtn) {
        reviveBtn.style.display = money >= 10 ? 'inline-block' : 'none';
    }
    pendingRevive = true;
    stopSoundtrack();
}

function reviveGame() {
    pendingRevive = false;
    gameRunning = true;
    clearEnemiesTimer = 0;
    enemies = [];
    bullets = [];
    explosions = [];
    invulnerableFrames = 90;
    player.x = canvas.width / 2 - 20;
    player.y = canvas.height - 80;
    player.dx = 0;
    player.hasShield = true;
    player.shieldTimer = 180; // 3s shield on revive
    player.baseSpeed = DEFAULT_BASE_SPEED;
    player.speed = player.baseSpeed;
    player.boostTimer = 0;
    player.isBraking = false;
    aiEnabled = false;
    aiFireCooldown = 0;
    aiSideToggle = false;
    document.getElementById('gameOver').style.display = 'none';
    // Keep current score/level/money/carsShot
    startSoundtrack();
    // Dino music will resume on next update if in dino world
}

// Restart game
function restartGame() {
    gameRunning = true;
    score = 0;
    level = 1;
    carsShot = 0;
    frameCount = 0;
    enemySpeed = DEFAULT_ENEMY_SPEED;
    spawnRate = DEFAULT_SPAWN_RATE;
    enemies = [];
    powerups = [];
    bullets = [];
    explosions = [];
    killCount = 0;
    hasBigGun = false;
    bigGunActive = false;
    bigGunUsesLeft = 0;
    aiEnabled = false;
    aiFireCooldown = 0;
    invulnerableFrames = 0;
    aiSideToggle = false;
    spawnLockFrames = 0;
    finishLineActive = false;
    finishLineY = -50;
    finishReached = false;
    clearEnemiesTimer = 0;
    moneyRainTriggered = false;
    player.x = canvas.width / 2 - 20;
    player.y = canvas.height - 80;
    player.dx = 0;
    player.hasShield = true;      // start with shield
    player.shieldTimer = 300;     // ~5 seconds at 60fps
    // Reset movement and speed-related states
    player.baseSpeed = DEFAULT_BASE_SPEED;
    player.speed = player.baseSpeed;
    player.boostTimer = 0;
    player.isBraking = false;
    aiEnabled = false;
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
    document.getElementById('carCount').textContent = carsShot;
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
    pendingRevive = false;
    loadMoney();
    updateMoneyDisplay();
    loadHighScore();
    document.getElementById('highScore').textContent = highScore;
    // Initialize player position now that canvas exists
    player.x = Math.floor(canvas.width / 2 - player.width / 2);
    player.y = canvas.height - 80;
    player.hasShield = true;
    player.shieldTimer = 300; // ~5 seconds start shield
    updateMoneyDisplay();
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
    // Safari sometimes starts suspended; resume to enable sound after gesture
    if (audioCtx.state === 'suspended' && audioCtx.resume) {
        audioCtx.resume();
    }
    masterGain = audioCtx.createGain();
    masterGain.gain.value = mainMusicMuted ? 0 : MAIN_MUSIC_GAIN;
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

// Pop loop for dino world
function startDinoMusic() {
    if (dinoMusicActive) return;
    if (!audioCtx || !masterGain) {
        startSoundtrack();
    }
    if (!audioCtx || !masterGain) return;
    dinoMusicActive = true;
    mainMusicMuted = true;
    masterGain.gain.setValueAtTime(0, audioCtx.currentTime);

    dinoPopGain = audioCtx.createGain();
    dinoPopGain.gain.value = 0.08;
    dinoPopGain.connect(audioCtx.destination);

    const chords = [
        [261.63, 329.63, 392.0], // C major
        [293.66, 369.99, 440.0], // D major
        [329.63, 415.3, 493.88], // E major-ish
        [261.63, 329.63, 392.0], // back to C
    ];
    let idx = 0;
    const beatMs = 450; // slower pop pace

    const playBeat = () => {
        const now = audioCtx.currentTime;
        const freqs = chords[idx];
        freqs.forEach((f, i) => {
            const osc = audioCtx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = f;
            const g = audioCtx.createGain();
            const startGain = 0.0 + i * 0.01;
            g.gain.setValueAtTime(startGain, now);
            g.gain.linearRampToValueAtTime(0.12, now + 0.05);
            g.gain.linearRampToValueAtTime(0.0, now + 0.4);
            osc.connect(g);
            g.connect(dinoPopGain);
            osc.start(now);
            osc.stop(now + 0.45);
        });
        idx = (idx + 1) % chords.length;
    };

    playBeat();
    dinoPopInterval = setInterval(playBeat, beatMs);
}

function stopDinoMusic() {
    if (!dinoMusicActive) return;
    dinoMusicActive = false;
    if (dinoPopInterval) {
        clearInterval(dinoPopInterval);
        dinoPopInterval = null;
    }
    if (dinoPopGain && audioCtx) {
        const now = audioCtx.currentTime;
        dinoPopGain.gain.setValueAtTime(dinoPopGain.gain.value, now);
        dinoPopGain.gain.linearRampToValueAtTime(0, now + 0.4);
    }
    setTimeout(() => {
        if (dinoPopGain) {
            dinoPopGain.disconnect();
            dinoPopGain = null;
        }
        if (masterGain && audioCtx) {
            masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
            masterGain.gain.linearRampToValueAtTime(MAIN_MUSIC_GAIN, audioCtx.currentTime + 0.4);
            mainMusicMuted = false;
        }
    }, 500);
}

// Techno loop for computer world
function startTechno() {
    if (technoActive) return;
    if (!audioCtx) startSoundtrack();
    if (!audioCtx) return;
    technoActive = true;
    // Pause other music
    mainMusicMuted = true;
    if (masterGain) masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    stopDinoMusic();
    stopFunMusic();

    technoGain = audioCtx.createGain();
    technoGain.gain.value = 0.08;
    technoGain.connect(audioCtx.destination);

    const steps = [0, 7, 12, 5]; // minor flavor
    let stepIdx = 0;
    const beatMs = 320;

    const playBeat = () => {
        const now = audioCtx.currentTime;
        const baseFreq = 110 * Math.pow(2, steps[stepIdx] / 12);

        const kick = audioCtx.createOscillator();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(80, now);
        kick.frequency.exponentialRampToValueAtTime(40, now + 0.12);
        const kickGain = audioCtx.createGain();
        kickGain.gain.setValueAtTime(0.12, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        kick.connect(kickGain);
        kickGain.connect(technoGain);
        kick.start(now);
        kick.stop(now + 0.15);

        const bass = audioCtx.createOscillator();
        bass.type = 'square';
        bass.frequency.value = baseFreq;
        const bassGain = audioCtx.createGain();
        bassGain.gain.setValueAtTime(0.05, now);
        bassGain.gain.linearRampToValueAtTime(0, now + 0.18);
        bass.connect(bassGain);
        bassGain.connect(technoGain);
        bass.start(now);
        bass.stop(now + 0.2);

        stepIdx = (stepIdx + 1) % steps.length;
    };

    playBeat();
    technoInterval = setInterval(playBeat, beatMs);
}

function stopTechno() {
    if (!technoActive) return;
    technoActive = false;
    if (technoInterval) {
        clearInterval(technoInterval);
        technoInterval = null;
    }
    if (technoGain && audioCtx) {
        const now = audioCtx.currentTime;
        technoGain.gain.setValueAtTime(technoGain.gain.value, now);
        technoGain.gain.linearRampToValueAtTime(0, now + 0.3);
    }
    setTimeout(() => {
        if (technoGain) {
            technoGain.disconnect();
            technoGain = null;
        }
        // Restore main music gain when leaving techno
        if (masterGain && audioCtx) {
            masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
            masterGain.gain.linearRampToValueAtTime(MAIN_MUSIC_GAIN, audioCtx.currentTime + 0.4);
            mainMusicMuted = false;
        }
    }, 400);
}

// Fun poppy loop for fun world
function startFunMusic() {
    if (funMusicActive) return;
    if (!audioCtx) startSoundtrack();
    if (!audioCtx) return;
    funMusicActive = true;
    mainMusicMuted = true;
    if (masterGain) masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
    stopDinoMusic();
    stopTechno();

    funGain = audioCtx.createGain();
    funGain.gain.value = 0.1;
    funGain.connect(audioCtx.destination);

    const freqs = [261.63, 293.66, 329.63, 349.23]; // C D E F loop
    let idx = 0;
    const beatMs = 380;

    const playFunBeat = () => {
        const now = audioCtx.currentTime;
        const f = freqs[idx];
        // Lead pluck
        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.12, now + 0.05);
        g.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.connect(g);
        g.connect(funGain);
        osc.start(now);
        osc.stop(now + 0.35);

        // Claps
        const noise = audioCtx.createBufferSource();
        const bufferSize = audioCtx.sampleRate * 0.1;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noise.buffer = buffer;
        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.08, now);
        noiseGain.gain.linearRampToValueAtTime(0, now + 0.1);
        noise.connect(noiseGain);
        noiseGain.connect(funGain);
        noise.start(now + 0.18);
        noise.stop(now + 0.28);

        idx = (idx + 1) % freqs.length;
    };

    playFunBeat();
    funInterval = setInterval(playFunBeat, beatMs);
}

function stopFunMusic() {
    if (!funMusicActive) return;
    funMusicActive = false;
    if (funInterval) {
        clearInterval(funInterval);
        funInterval = null;
    }
    if (funGain && audioCtx) {
        const now = audioCtx.currentTime;
        funGain.gain.setValueAtTime(funGain.gain.value, now);
        funGain.gain.linearRampToValueAtTime(0, now + 0.3);
    }
    setTimeout(() => {
        if (funGain) {
            funGain.disconnect();
            funGain = null;
        }
        if (masterGain && audioCtx) {
            masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
            masterGain.gain.linearRampToValueAtTime(MAIN_MUSIC_GAIN, audioCtx.currentTime + 0.4);
            mainMusicMuted = false;
        }
    }, 400);
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

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((err) => {
                console.error('SW registration failed', err);
            });
        });
    }
}

// Wait for DOM to be ready before starting
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initGame();
        attachSoundtrackStarter();
        registerServiceWorker();
    });
} else {
    initGame();
    attachSoundtrackStarter();
    registerServiceWorker();
}
