# Basketball — Simple Pygame Demo

A tiny basketball demo built with Pygame. Use this README to run and play the `basketball.py` script included in this repository.

Gameplay
- Use the cursor (arrow) keys to control the player and ball:
  - Left / Right arrows: move player horizontally
  - Up arrow: jump
  - Down arrow: (optional) duck or drop/aim (behavior depends on `basketball.py` implementation)
- Objective: score points by getting the ball through the hoop. This demo focuses on simple physics and controls rather than polished visuals.

Run
1. Create and activate a Python virtual environment (recommended):

```bash
python3 -m venv venv
source venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the game:

```bash
python3 basketball.py
```

Notes
- The exact controls and behavior depend on the current implementation of `basketball.py`. If a control behaves differently, check the file for specific key mappings.
- If Pygame isn't installed, add it to `requirements.txt` or install with `pip install pygame`.

Troubleshooting
- If the window doesn't open, ensure you have a valid display environment (on macOS, run locally, not via headless CI).
- If audio is silent, check system audio settings and that sound files (if any) are present in `assets/`.



Enjoy the game!
