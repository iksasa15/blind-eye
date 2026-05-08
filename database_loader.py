import face_recognition
import os
import pickle

def encode_known_faces(faces_folder="faces"):
    known_encodings = []
    known_metadata = []

    print("Encoding faces... please wait.")
    for filename in os.listdir(faces_folder):
        if filename.endswith((".jpg", ".png")):
            # Load the image file
            img = face_recognition.load_image_file(f"{faces_folder}/{filename}")
            # Get the face encoding (the 128-point map)
            encodings = face_recognition.face_encodings(img)
            
            if len(encodings) > 0:
                known_encodings.append(encodings[0])
                
                # Split "John_Father.jpg" into ["John", "Father"]
                name_parts = filename.split(".")[0].split("_")
                known_metadata.append({
                    "name": name_parts[0], 
                    "relation": name_parts[1]
                })
    
    return known_encodings, known_metadata