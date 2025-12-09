# Car Game

A small browser car-dodging game built with HTML, CSS, and JavaScript.

How to run

Option A — Quick (open file directly):
- Double-click `index.html` in the `car-game` folder to open in your default browser.

Option B — Recommended (run a local server):
- Open Terminal and run (macOS / Linux / Python 3 installed):

```bash
cd /Users/matteo/Desktop/car-game
python3 -m http.server 8000
```

- Then open `http://localhost:8000` in your browser.

Optional: Use Node (if you have `http-server` installed):

```bash
cd /Users/matteo/Desktop/car-game
npx http-server -p 8000
```

Controls
- Move left/right: Arrow keys or `A` / `D`
- Restart after game over: Space

Notes
- High score is stored locally in your browser (LocalStorage).
- If you have any issues starting the server, tell me what error you see and I will help.
