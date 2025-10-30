---
applyTo: '**'
---
## Tech lead instructions — no-nonsense

Short and direct: implement small, self-contained projects that my son can run and share with friends quickly.

Expectations
- Keep features small and obvious. One executable script (e.g. `basketball.py`) with minimal setup.
- Minimal external dependencies. Prefer only what's in `requirements.txt` and documented in the README.
- Clear run steps and controls in the README (how to set up venv, install, and run).

Deliverables
- A working, documented script that launches and is playable by a kid.
- A one-paragraph summary in the PR description and a short, copy-pasteable command to run the game.
- Any required assets included in `assets/` or clearly documented.

Acceptance criteria
- The game runs on macOS with after installing dependencies.
- Controls are documented and intuitive (arrow keys for movement/jump).
- No crashes on launch; basic playthrough completes without errors.

Developer rules
- Prefer clarity over cleverness. Write short functions and clear comments.
- Avoid heavy frameworks or complex build steps.
- Add a tiny smoke test or runtime check if feasible (script prints "OK" on successful init).

Contributing
- Improvements welcome: better scoring, AI opponents, menus, art, and sounds. Create a branch and submit a PR.