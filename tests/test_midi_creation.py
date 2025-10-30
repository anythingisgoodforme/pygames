import os
import sys
from pathlib import Path

# Ensure project root is importable when pytest runs from within tests/
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from create_and_play_midi import write_midi, build_bass_pattern


def test_write_midi_creates_file(tmp_path):
    midi_file = tmp_path / 'stonini_test.mid'
    events = build_bass_pattern(measures=2)
    write_midi(str(midi_file), events, tempo_bpm=90)
    assert midi_file.exists()
    # basic sanity: file is not empty
    assert midi_file.stat().st_size > 100
