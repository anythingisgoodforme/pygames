# Car Game

A fun browser-based car dodging and shooting game built with HTML, CSS, and JavaScript. Similar to Asteroids but with cars!

## Play Online

🎮 **Play the game on GitHub Pages:** https://anythingisgoodforme.github.io/pygames/car-game/

## Features

- Dodge incoming cars or shoot them down for points
- Hyper speed mode with energy management
- Shield power-ups for protection
- Progressive difficulty with increasing levels
- High score tracking

## How to Run Locally

### Option A — Quick (open file directly):
- Double-click `index.html` in the `car-game` folder to open in your default browser.

### Option B — Recommended (run a local server):
- Open Terminal and run (macOS / Linux / Python 3 installed):

```bash
cd car-game
python3 -m http.server 8000
```

- Then open `http://localhost:8000` in your browser.

### Optional: Use Node (if you have `http-server` installed):

```bash
cd car-game
npx http-server -p 8000
```

## Controls

- **Move left/right:** Arrow keys or `A` / `D`
- **Shoot:** Space bar
- **Brake/Boost:** Down arrow or `S` (releases with boost)
- **Hyper mode:** Up arrow or `W` (when energy is full)
- **Restart:** Space (when game over)

## Game Mechanics

- **Dodging:** Avoid incoming cars to survive (10 points each)
- **Shooting:** Destroy cars with bullets for more points (25 points each)
- **Energy:** Builds up as you survive, activates hyper speed for temporary boost
- **Shields:** Collect golden shields to protect yourself from one collision
- **Difficulty:** Game gets progressively harder with each level

## Notes

- High score is stored locally in your browser (LocalStorage)
- Game is fully playable without any server or build process needed
- Responsive and works on desktop browsers
