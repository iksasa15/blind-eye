import cv2
import pyttsx3
from pynput import keyboard
import database_loader  # This imports your other file!
import numpy as np

# --- SETUP ---
engine = pyttsx3.init()
camera = cv2.VideoCapture(0)

# Load the faces using your loader script
known_encodings, known_metadata = database_loader.encode_known_faces()

new_voice_path = "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\TTS_MS_AR-EG_HODA_11.0"

try:
    engine.setProperty('voice', new_voice_path)
    print("System: Switched to Hoda successfully!")
except:
    print("System: Could not find Hoda in the registry.")

engine.setProperty('rate', 150) # Arabic sounds better a bit slower

def identify_visitor():
    print("\n[DING-DONG] Analyzing visitor...")
    ret, frame = camera.read()
    if not ret: return

    # Speed boost
    small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
    rgb_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

    import face_recognition
    face_encodings = face_recognition.face_encodings(rgb_frame)

    if not face_encodings:
        msg = "هناك شخص عند الباب، لكن لا يمكنني رؤية وجهه بوضوح."
    else:
        msg = "هناك شخص غريب عند الباب" # Default if no match at all
        for face_encoding in face_encodings:
            # 1. Get the raw distance (lower is better)
            face_distances = face_recognition.face_distance(known_encodings, face_encoding)
            
            # 2. Find the best match
            best_match_index = np.argmin(face_distances)
            distance = face_distances[best_match_index]
            person = known_metadata[best_match_index]

            # 3. Categorize based on distance
            if distance <= 0.45:
                # Very high confidence
                msg = f"هذه {person['name']}, {person['relation']} عند الباب."
            elif 0.45 < distance <= 0.6:
                # Moderate confidence (Similar)
                msg = f"هناك شخص يشبه {person['name']}, your {person['relation']}, لكني غير متأكد"
            else:
                # No similarity found
                msg = "هناك شخص غريب عند الباب"
            break # Stop after the first face detected

    print(f"Announcement: {msg}")
    engine.say(msg)
    engine.runAndWait()

# --- KEYBOARD CONTROLS ---
def on_press(key):
    try:
        if key == keyboard.Key.space:
            identify_visitor()
            
        if key == keyboard.Key.esc:
            print("\n[STOPPING] Cleaning up and exiting...")
            engine.stop() # This kills any remaining speech tasks
            return False  # This kills the keyboard listener
    except AttributeError:
        pass

print("\n--- SYSTEM READY ---")
print("1. Stand in front of the webcam.")
print("2. Press SPACEBAR to simulate the doorbell.")
print("3. Press ESC to quit.")

with keyboard.Listener(on_press=on_press) as listener:
    listener.join()

camera.release() 