import midiutil

def create_stonini_song():
    # Create a MIDI file with 2 tracks (track 0 is reserved for tempo)
    midi = midiutil.MIDIFile(2)
    track = 0
    time = 0
    tempo = 120  # BPM
    midi.addTempo(track, time, tempo)

    # Track 1 for the "voice" melody (using piano sound)
    voice_track = 0
    channel = 0
    volume = 100
    
    # Notes for "sto-ni-ni ra-ta-ta-di-ni"
    # Using mid-range notes for singable melody
    melody_notes = [60, 62, 62, 64, 65, 65, 65, 62, 62]  # C4, D4, D4, E4, F4, F4, F4, D4, D4
    durations = [1, 1, 1, 1, 0.5, 0.5, 0.5, 1, 1]  # Duration in beats
    
    current_time = 0
    for note, duration in zip(melody_notes, durations):
        midi.addNote(voice_track, channel, note, current_time, duration, volume)
        current_time += duration

    # Track 2 for bass accompaniment
    bass_track = 1
    bass_channel = 1
    bass_volume = 80
    
    # Simple bass line
    bass_notes = [48, 48, 53, 53]  # C3, C3, F3, F3
    bass_durations = [2, 2, 2, 2]
    
    current_time = 0
    for note, duration in zip(bass_notes, bass_durations):
        midi.addNote(bass_track, bass_channel, note, current_time, duration, bass_volume)
        current_time += duration

    # Write the MIDI file
    with open("stonini_song.mid", "wb") as output_file:
        midi.writeFile(output_file)

if __name__ == "__main__":
    create_stonini_song()
    print("Song 'stonini_song.mid' has been created!")