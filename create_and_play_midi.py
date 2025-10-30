#!/usr/bin/env python3
"""
Create and play a simple MIDI song with a solid bass track and the lyric
"Stonini Ratadadini" embedded as a meta event.

This script uses `mido` to write a MIDI file and `pygame.midi` to attempt
to play the bass notes directly through the system MIDI synth. If playback
is not possible, the script still writes `stonini.mid` which can be opened
in any DAW or MIDI player.

Usage:
    python3 create_and_play_midi.py --play

Requires:
    pip install -r requirements.txt

This file is intentionally small, self-contained, and easy for a kid to run.
"""
import os
import time
import argparse
from typing import List

import pygame
import pygame.midi


def build_bass_pattern(tempo_bpm: int = 100, measures: int = 16, beats_per_measure: int = 4):
    """Return a list of bass events (note, start_beat, duration_beats, vel).

    We'll create a repetitive simple bassline in a minor-ish pattern.
    """
    # notes in MIDI note numbers (use C3=48 as root so it's laptop-speaker friendly)
    pattern = [48, 52, 55, 48]  # root, fifth-ish, minor 3rd-ish, root (raised an octave)
    events = []
    for m in range(measures):
        for i, n in enumerate(pattern):
            start_beat = m * beats_per_measure + i  # one-note per beat
            events.append({
                "note": n,
                "start_beat": start_beat,
                "duration_beats": 1.0,
                "velocity": 100,
                "channel": 0,
            })
    return events


def write_midi(filename: str, events: List[dict], tempo_bpm: int = 100, ticks_per_beat: int = 480):
    # Import mido lazily so importing this module doesn't fail in environments
    # where mido isn't installed (tests can still import and run parts that
    # don't require writing a MIDI file).
    import mido

    mid = mido.MidiFile(ticks_per_beat=ticks_per_beat)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    # Set tempo and program (instrument) for bass
    tempo_meta = mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(tempo_bpm), time=0)
    track.append(tempo_meta)
    # Program change to a bass sound (program number 32 in General MIDI is Acoustic Bass,
    # but mido program numbers are 0-based, so choose 31 -> good bass patch.
    track.append(mido.Message('program_change', program=31, channel=0, time=0))

    # Add track name
    track.append(mido.MetaMessage('track_name', name='Stonini bass + lyric', time=0))

    # Insert lyric meta event at start (track 0)
    track.append(mido.MetaMessage('lyrics', text='Stonini Ratadadini', time=0))

    # Add a second track for a melodic line (higher register)
    melody = mido.MidiTrack()
    mid.tracks.append(melody)
    # Melody instrument: a brighter lead (program 80 is Lead 1 (square) in GM, 0-based index 79)
    melody.append(mido.Message('program_change', program=79, channel=1, time=0))
    melody.append(mido.MetaMessage('track_name', name='Melody', time=0))

    # Build a simple melody pattern that complements the bass
    melody_pattern = []
    # simple motif around middle C (60) moving between 60-72
    motif = [64, 66, 69, 71, 69, 66, 64, 60]
    measures_for_melody = max(1, int(len(events) / 4))
    for m in range(measures_for_melody):
        for i, n in enumerate(motif):
            start_beat = m * 4 + i * 0.5  # half-beat melody
            melody_pattern.append({
                'note': n,
                'start_beat': start_beat,
                'duration_beats': 0.5,
                'velocity': 90,
                'channel': 1,
            })

    # Convert melody events to midi messages
    melody_sorted = sorted(melody_pattern, key=lambda e: e['start_beat'])
    last_tick_m = 0
    for e in melody_sorted:
        start_tick = int(e['start_beat'] * ticks_per_beat)
        delta = start_tick - last_tick_m
        melody.append(mido.Message('note_on', note=e['note'], velocity=e['velocity'], channel=e['channel'], time=delta))
        off_tick = int(e['duration_beats'] * ticks_per_beat)
        melody.append(mido.Message('note_off', note=e['note'], velocity=0, channel=e['channel'], time=off_tick))
        last_tick_m = start_tick + off_tick

    # Convert beat-based times to ticks and create note on/off events
    events_sorted = sorted(events, key=lambda e: e['start_beat'])
    last_tick = 0
    for e in events_sorted:
        start_tick = int(e['start_beat'] * ticks_per_beat)
        delta = start_tick - last_tick
        # Note on
        track.append(mido.Message('note_on', note=e['note'], velocity=e['velocity'], channel=e['channel'], time=delta))
        # Note off after duration
        off_tick = int(e['duration_beats'] * ticks_per_beat)
        track.append(mido.Message('note_off', note=e['note'], velocity=0, channel=e['channel'], time=off_tick))
        last_tick = start_tick + off_tick

    mid.save(filename)
    return filename


def build_arrangement(tempo_bpm: int = 100, measures: int = 16, beats_per_measure: int = 4):
    """Return a combined arrangement (events list) and lyrics mapping.

    The returned events is a list of dicts with keys:
      - note (int) or chord (list[int]) for chord events
      - start_beat (float)
      - duration_beats (float)
      - velocity (int)
      - channel (int)
      - kind: optional, e.g., 'perc' for percussion, 'vocal' for lyric playback

    Also returns lyrics as a list of (start_beat, syllable) tuples.
    """
    bass = build_bass_pattern(tempo_bpm=tempo_bpm, measures=measures, beats_per_measure=beats_per_measure)

    # Melody pattern (as in write_midi)
    motif = [64, 66, 69, 71, 69, 66, 64, 60]
    melody_events = []
    for m in range(measures):
        for i, n in enumerate(motif):
            start_beat = m * beats_per_measure + i * 0.5
            melody_events.append({
                'note': n,
                'start_beat': start_beat,
                'duration_beats': 0.5,
                'velocity': 90,
                'channel': 1,
            })

    # Chords: one chord per measure (simple triads above the bass root)
    chord_events = []
    for m in range(measures):
        root = 48  # C3
        chord = [root + 0, root + 4, root + 7]
        start_beat = m * beats_per_measure
        chord_events.append({
            'chord': chord,
            'start_beat': start_beat,
            'duration_beats': beats_per_measure,
            'velocity': 70,
            'channel': 2,
        })

    # Percussion: kick on beat 1, snare on beat 3, hi-hat eighths
    perc_events = []
    for m in range(measures):
        base = m * beats_per_measure
        # kick (MIDI perc 36) on beat 0
        perc_events.append({'note': 36, 'start_beat': base + 0.0, 'duration_beats': 0.25, 'velocity': 110, 'channel': 9, 'kind': 'perc'})
        # snare (38) on beat 2
        perc_events.append({'note': 38, 'start_beat': base + 2.0, 'duration_beats': 0.25, 'velocity': 100, 'channel': 9, 'kind': 'perc'})
        # hi-hat (42) on every eighth
        for i in range(8):
            perc_events.append({'note': 42, 'start_beat': base + i * 0.5, 'duration_beats': 0.125, 'velocity': 70, 'channel': 9, 'kind': 'perc'})

    # Lyrics syllables timed roughly to the melody motif
    lyrics_text = 'Stonini Ratadadini'
    syllables = ['Sto', 'ni', 'ni', 'Ra', 'ta', 'da', 'di', 'ni']
    lyrics = []
    # place the syllables starting at beat 0 with half-beat spacing for the motif
    for m in range(measures):
        for i, s in enumerate(syllables):
            start_beat = m * beats_per_measure + i * 0.5
            lyrics.append((start_beat, s))

    # Combine all events
    all_events = []
    all_events.extend(bass)
    all_events.extend(melody_events)
    all_events.extend(chord_events)
    all_events.extend(perc_events)

    # sort by start_beat
    all_events = sorted(all_events, key=lambda e: e['start_beat'])
    return all_events, lyrics


def write_full_midi(filename: str, tempo_bpm: int = 100, measures: int = 16, ticks_per_beat: int = 480):
    """Write a multi-track MIDI file with bass, melody, chords, percussion and lyrics."""
    import mido

    mid = mido.MidiFile(ticks_per_beat=ticks_per_beat)

    # Bass track
    bass_track = mido.MidiTrack()
    mid.tracks.append(bass_track)
    bass_track.append(mido.MetaMessage('track_name', name='Bass', time=0))
    bass_track.append(mido.Message('program_change', program=31, channel=0, time=0))
    bass_track.append(mido.MetaMessage('lyrics', text='Stonini Ratadadini', time=0))

    # Melody track
    melody_track = mido.MidiTrack()
    mid.tracks.append(melody_track)
    melody_track.append(mido.MetaMessage('track_name', name='Melody', time=0))
    melody_track.append(mido.Message('program_change', program=79, channel=1, time=0))

    # Chord track
    chord_track = mido.MidiTrack()
    mid.tracks.append(chord_track)
    chord_track.append(mido.MetaMessage('track_name', name='Chords', time=0))
    chord_track.append(mido.Message('program_change', program=48, channel=2, time=0))

    # Percussion track (channel 9)
    perc_track = mido.MidiTrack()
    mid.tracks.append(perc_track)
    perc_track.append(mido.MetaMessage('track_name', name='Percussion', time=0))

    events, lyrics = build_arrangement(tempo_bpm=tempo_bpm, measures=measures)

    # set tempo on first track
    bass_track.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(tempo_bpm), time=0))

    # helper to add events to tracks
    def add_note_message(track, start_tick, duration_tick, note, velocity, channel):
        track.append(mido.Message('note_on', note=note, velocity=velocity, channel=channel, time=start_tick))
        track.append(mido.Message('note_off', note=note, velocity=0, channel=channel, time=duration_tick))

    # We'll write each track by scanning events and assigning them
    # For simplicity produce per-track sorted lists
    track_events = {0: [], 1: [], 2: [], 9: []}
    for e in events:
        ch = e.get('channel', 0)
        if 'chord' in e:
            track_events.setdefault(ch, []).append(e)
        else:
            track_events.setdefault(ch, []).append(e)

    # write bass (channel 0)
    last_tick = 0
    for e in sorted(track_events.get(0, []), key=lambda x: x['start_beat']):
        start_tick = int(e['start_beat'] * ticks_per_beat)
        delta = start_tick - last_tick
        bass_track.append(mido.Message('note_on', note=e['note'], velocity=e['velocity'], channel=0, time=delta))
        off = int(e['duration_beats'] * ticks_per_beat)
        bass_track.append(mido.Message('note_off', note=e['note'], velocity=0, channel=0, time=off))
        last_tick = start_tick + off

    # melody
    last_tick = 0
    for e in sorted(track_events.get(1, []), key=lambda x: x['start_beat']):
        start_tick = int(e['start_beat'] * ticks_per_beat)
        delta = start_tick - last_tick
        melody_track.append(mido.Message('note_on', note=e['note'], velocity=e['velocity'], channel=1, time=delta))
        off = int(e['duration_beats'] * ticks_per_beat)
        melody_track.append(mido.Message('note_off', note=e['note'], velocity=0, channel=1, time=off))
        last_tick = start_tick + off

    # chords
    last_tick = 0
    for e in sorted(track_events.get(2, []), key=lambda x: x['start_beat']):
        start_tick = int(e['start_beat'] * ticks_per_beat)
        delta = start_tick - last_tick
        # add all chord notes with delta on first
        for i, n in enumerate(e['chord']):
            chord_tick = delta if i == 0 else 0
            chord_track.append(mido.Message('note_on', note=n, velocity=e['velocity'], channel=2, time=chord_tick))
        off = int(e['duration_beats'] * ticks_per_beat)
        for n in e['chord']:
            chord_track.append(mido.Message('note_off', note=n, velocity=0, channel=2, time=off))
        last_tick = start_tick + off

    # percussion
    last_tick = 0
    for e in sorted(track_events.get(9, []), key=lambda x: x['start_beat']):
        start_tick = int(e['start_beat'] * ticks_per_beat)
        delta = start_tick - last_tick
        perc_track.append(mido.Message('note_on', note=e['note'], velocity=e['velocity'], channel=9, time=delta))
        off = int(e['duration_beats'] * ticks_per_beat)
        perc_track.append(mido.Message('note_off', note=e['note'], velocity=0, channel=9, time=off))
        last_tick = start_tick + off

    # Lyrics as meta-events on the bass track at each lyric time
    for start, syl in lyrics:
        tick = int(start * ticks_per_beat)
        bass_track.append(mido.MetaMessage('lyrics', text=syl, time=tick))

    mid.save(filename)
    return filename


def play_events_via_pygame(events: List[dict], tempo_bpm: int = 100):
    """Attempt to play the provided events using pygame.midi output device.

    This function schedules note_on and note_off using time.sleep and will
    print a message if midi playback isn't available.
    """
    try:
        pygame.init()
        pygame.midi.init()
    except Exception as exc:
        print("pygame/pygame.midi could not initialise:", exc)
        return False

    try:
        default_id = pygame.midi.get_default_output_id()
        if default_id == -1:
            print("No default MIDI output device found.")
            return False
        out = pygame.midi.Output(default_id)
    except Exception as exc:
        print("Failed to open MIDI output:", exc)
        return False

    sec_per_beat = 60.0 / tempo_bpm
    # create timeline of events
    timeline = []
    for e in events:
        start_t = e['start_beat'] * sec_per_beat
        end_t = start_t + e['duration_beats'] * sec_per_beat
        timeline.append(('on', start_t, e))
        timeline.append(('off', end_t, e))

    timeline.sort(key=lambda x: x[1])
    start_time = time.time()
    try:
        for kind, ttime, e in timeline:
            now = time.time() - start_time
            wait = ttime - now
            if wait > 0:
                time.sleep(wait)
            if kind == 'on':
                out.note_on(e['note'], e['velocity'], e.get('channel', 0))
            else:
                out.note_off(e['note'], 0, e.get('channel', 0))
    finally:
        out.close()
        pygame.midi.quit()
        pygame.quit()

    return True


def main(play: bool):
    filename = 'stonini.mid'
    tempo = 100
    measures = 16
    events = build_bass_pattern(tempo_bpm=tempo, measures=measures)
    write_midi(filename, events, tempo_bpm=tempo)
    print(f'Wrote MIDI file: {filename}')

    if play:
        ok = play_events_via_pygame(events, tempo_bpm=tempo)
        if ok:
            print('Playback finished via pygame.midi')
        else:
            print('Could not play via pygame.midi. You can open stonini.mid in a DAW or MIDI player.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Create and optionally play a MIDI with a bassline and embedded lyric')
    parser.add_argument('--play', action='store_true', help='Attempt to play the song via pygame.midi')
    args = parser.parse_args()
    main(play=args.play)
