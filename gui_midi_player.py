#!/usr/bin/env python3
"""Simple GUI to play/stop the bass MIDI and adjust tempo.

This uses tkinter for a minimal GUI and pygame.midi for playback. Playback
runs in a background thread so the UI remains responsive. Tempo changes
apply immediately to the upcoming beat intervals.

Usage:
    python3 gui_midi_player.py

Controls:
- Play: start playback
- Stop: stop playback
- Tempo slider: adjust tempo (BPM) while playing
- Save MIDI: write `stonini.mid` to disk
"""
import threading
import time
import tkinter as tk
from tkinter import ttk, messagebox
from typing import List

import pygame
import pygame.midi

from create_and_play_midi import build_bass_pattern, write_midi, build_arrangement, write_full_midi


class MidiPlayerThread(threading.Thread):
    def __init__(self, events: List[dict], lyrics: List[tuple], tempo_getter, stop_event: threading.Event):
        super().__init__(daemon=True)
        self.events = sorted(events, key=lambda e: e['start_beat'])
        self.lyrics = lyrics or []
        self.tempo_getter = tempo_getter
        self.stop_event = stop_event
        self.out = None

    def run(self):
        # Use pygame.mixer with simple synthesized tones (sine + harmonics)
        # Build a timeline that includes notes, chords, percussion and vocals.
        try:
            import cmath as _cmath
            from array import array
            import random

            sample_rate = 44100
            pygame.mixer.init(frequency=sample_rate, size=-16, channels=1)

            def make_sound_for_note(note, duration_seconds, volume=0.6, timbre='lead'):
                freq = 440.0 * (2 ** ((note - 69) / 12.0))
                length = int(sample_rate * max(0.05, duration_seconds))
                buf = array('h')
                attack = int(0.01 * sample_rate)
                release = int(0.02 * sample_rate)
                sustain_level = 0.85
                for i in range(length):
                    t = i / sample_rate
                    if timbre == 'bass':
                        sample = float(_cmath.sin(2.0 * _cmath.pi * freq * t).real)
                    else:
                        s1 = float(_cmath.sin(2.0 * _cmath.pi * freq * t).real)
                        s2 = 0.5 * float(_cmath.sin(2.0 * _cmath.pi * (freq * 2) * t).real)
                        s3 = 0.25 * float(_cmath.sin(2.0 * _cmath.pi * (freq * 3) * t).real)
                        sample = (s1 + s2 + s3)
                    if i < attack and attack > 0:
                        env = (i / attack)
                    elif i > length - release and release > 0:
                        env = ((length - i) / release)
                    else:
                        env = sustain_level
                    val = int((sample / (1.0 + 0.5 + 0.25)) * env * volume * 32767)
                    buf.append(max(-32768, min(32767, val)))
                return pygame.mixer.Sound(buffer=buf)

            def make_perc(kind='hat'):
                length = int(sample_rate * 0.08)
                buf = array('h')
                for i in range(length):
                    n = int((random.random() * 2 - 1) * 32767 * (1 - i / length))
                    buf.append(n)
                return pygame.mixer.Sound(buffer=buf)

            def make_vocal(syll, duration_seconds, volume=0.7):
                length = int(sample_rate * max(0.05, duration_seconds))
                buf = array('h')
                # approximate formant centers for vowels
                formants = [800, 1150, 2900]
                s_low = syll.lower()
                if 'a' in s_low:
                    formants = [800, 1150, 2900]
                elif 'e' in s_low:
                    formants = [400, 2000, 2600]
                elif 'i' in s_low:
                    formants = [240, 2400, 3200]
                elif 'o' in s_low:
                    formants = [500, 700, 2400]
                elif 'u' in s_low:
                    formants = [300, 870, 2240]
                attack = int(0.01 * sample_rate)
                release = int(0.02 * sample_rate)
                for i in range(length):
                    t = i / sample_rate
                    s = 0.0
                    for f in formants:
                        s += float(_cmath.sin(2.0 * _cmath.pi * f * t).real) * 0.3
                    if i < attack:
                        env = i / attack
                    elif i > length - release:
                        env = (length - i) / release
                    else:
                        env = 0.9
                    val = int(s * env * volume * 3276)
                    buf.append(max(-32768, min(32767, val)))
                return pygame.mixer.Sound(buffer=buf)

            # Build timeline
            timeline = []
            for e in self.events:
                if 'chord' in e:
                    timeline.append(('chord_on', e['start_beat'], e))
                    timeline.append(('chord_off', e['start_beat'] + e['duration_beats'], e))
                elif e.get('kind') == 'perc' or e.get('channel') == 9:
                    timeline.append(('perc_on', e['start_beat'], e))
                    timeline.append(('perc_off', e['start_beat'] + e['duration_beats'], e))
                else:
                    timeline.append(('note_on', e['start_beat'], e))
                    timeline.append(('note_off', e['start_beat'] + e['duration_beats'], e))
            for start, syl in self.lyrics:
                timeline.append(('vocal', start, syl))

            timeline.sort(key=lambda x: x[1])
            if not timeline:
                return

            tempo = self.tempo_getter()
            beat_seconds = 60.0 / float(max(1, tempo))

            unique_notes = {e['note'] for e in self.events if isinstance(e, dict) and 'note' in e}
            sound_cache = {}
            for note in unique_notes:
                timbre = 'bass' if note < 60 else 'lead'
                sound_cache[(note, timbre)] = make_sound_for_note(note, beat_seconds, timbre=timbre)

            perc_sounds = {'kick': make_perc('kick'), 'snare': make_perc('snare'), 'hat': make_perc('hat')}
            vocal_cache = {}

            last_beat = timeline[0][1]
            active_notes = []
            active_chords = []
            for kind, beat, payload in timeline:
                if self.stop_event.is_set():
                    break
                beat_delta = beat - last_beat
                slept = 0.0
                wait_seconds = beat_delta * (60.0 / float(max(1, self.tempo_getter())))
                chunk = 0.01
                while slept < wait_seconds and not self.stop_event.is_set():
                    to_sleep = min(chunk, wait_seconds - slept)
                    time.sleep(to_sleep)
                    slept += to_sleep
                if self.stop_event.is_set():
                    break
                if kind == 'note_on':
                    e = payload
                    timbre = 'bass' if e['note'] < 60 else 'lead'
                    snd = sound_cache.get((e['note'], timbre))
                    if snd:
                        ch = snd.play()
                        active_notes.append((e['note'], ch))
                elif kind == 'note_off':
                    e = payload
                    for note_playing, ch in list(active_notes):
                        if note_playing == e['note']:
                            try:
                                ch.stop()
                            except Exception:
                                pass
                            try:
                                active_notes.remove((note_playing, ch))
                            except ValueError:
                                pass
                elif kind == 'chord_on':
                    e = payload
                    chord_chs = []
                    for n in e['chord']:
                        snd = sound_cache.get((n, 'lead')) or make_sound_for_note(n, beat_seconds, timbre='lead')
                        ch = snd.play()
                        chord_chs.append((n, ch))
                    active_chords.append((e, chord_chs))
                elif kind == 'chord_off':
                    e = payload
                    for ev, chord_chs in list(active_chords):
                        if ev is e:
                            for n, ch in chord_chs:
                                try:
                                    ch.stop()
                                except Exception:
                                    pass
                            try:
                                active_chords.remove((ev, chord_chs))
                            except ValueError:
                                pass
                elif kind == 'perc_on':
                    e = payload
                    note = e['note']
                    if note == 36:
                        snd = perc_sounds['kick']
                    elif note == 38:
                        snd = perc_sounds['snare']
                    else:
                        snd = perc_sounds['hat']
                    snd.play()
                elif kind == 'vocal':
                    syl = payload
                    if syl not in vocal_cache:
                        vocal_cache[syl] = make_vocal(syl, beat_seconds, volume=0.7)
                    vocal_cache[syl].play()
                last_beat = beat

        except Exception as exc:
            print('Playback error (mixer):', exc)
        finally:
            try:
                pygame.mixer.quit()
            except Exception:
                pass


class MidiGUI:
    def __init__(self, root):
        self.root = root
        root.title('Stonini Ratadadini — MIDI Player')

        main = ttk.Frame(root, padding=12)
        main.grid(row=0, column=0, sticky='nsew')

        # Tempo control
        ttk.Label(main, text='Tempo (BPM):').grid(row=0, column=0, sticky='w')
        self.tempo_var = tk.IntVar(value=100)
        self.tempo_slider = ttk.Scale(main, from_=60, to=200, orient='horizontal', command=self._on_tempo_slider)
        self.tempo_slider.set(self.tempo_var.get())
        self.tempo_slider.grid(row=0, column=1, sticky='ew')
        self.tempo_entry = ttk.Entry(main, width=6, textvariable=self.tempo_var)
        self.tempo_entry.grid(row=0, column=2, sticky='e')

        # Buttons
        self.play_button = ttk.Button(main, text='Play', command=self.play)
        self.play_button.grid(row=1, column=0, pady=8)
        self.stop_button = ttk.Button(main, text='Stop', command=self.stop, state='disabled')
        self.stop_button.grid(row=1, column=1, pady=8)
        self.save_button = ttk.Button(main, text='Save MIDI', command=self.save_midi)
        self.save_button.grid(row=1, column=2, pady=8)

        # Status
        self.status = tk.StringVar(value='Ready')
        ttk.Label(main, textvariable=self.status).grid(row=2, column=0, columnspan=3, sticky='w')

        main.columnconfigure(1, weight=1)

        # Playback state
        self.player_thread = None
        self.stop_event = None

    def _on_tempo_slider(self, val):
        try:
            self.tempo_var.set(int(float(val)))
        except Exception:
            pass

    def tempo_getter(self):
        try:
            return int(self.tempo_var.get())
        except Exception:
            return 100

    def play(self):
        if self.player_thread and self.player_thread.is_alive():
            return
        self.status.set('Starting...')
        events, lyrics = build_arrangement(tempo_bpm=self.tempo_getter(), measures=16)
        self.stop_event = threading.Event()
        self.player_thread = MidiPlayerThread(events, lyrics, tempo_getter=self.tempo_getter, stop_event=self.stop_event)
        self.player_thread.start()
        self.play_button.config(state='disabled')
        self.stop_button.config(state='normal')
        self.status.set('Playing')

        # Monitor thread to update UI when finished
        self.root.after(200, self._monitor_thread)

    def _monitor_thread(self):
        if self.player_thread and self.player_thread.is_alive():
            self.root.after(200, self._monitor_thread)
        else:
            self.play_button.config(state='normal')
            self.stop_button.config(state='disabled')
            self.status.set('Ready')

    def stop(self):
        if self.stop_event:
            self.stop_event.set()
        self.status.set('Stopping...')

    def save_midi(self):
        try:
            fname = write_full_midi('stonini.mid', tempo_bpm=self.tempo_getter(), measures=16)
            messagebox.showinfo('Saved', f'Wrote MIDI to {fname}')
        except Exception as exc:
            messagebox.showerror('Error', f'Failed to write MIDI: {exc}')


def main():
    root = tk.Tk()
    app = MidiGUI(root)
    root.mainloop()


if __name__ == '__main__':
    main()
