# MIDI creator/player: Stonini Ratadadini

This small script creates a MIDI file named `stonini.mid` containing a simple
solid bass track and a lyric meta event with the text "Stonini Ratadadini".

Quick start (macOS, bash):

1. Create and activate a Python venv (recommended):

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Create the MIDI file and attempt playback via the system MIDI synth:

```bash
python3 create_and_play_midi.py --play
```

If your system has no MIDI output device accessible to `pygame.midi`, the
script will still write `stonini.mid` which you can open in any MIDI player
or DAW.

Notes
- The bassline is a simple repeating line so it's easy to hear the low-end.
- The lyric is embedded as a MIDI lyric meta event which DAWs and players
  can display when they support lyric tracks.
