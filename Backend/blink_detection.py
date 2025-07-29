# blink_detection.py

# Import required libraries
import cv2
import face_recognition
import dlib
import time
from firebase_integration import update_attendance_in_firebase
from imutils import face_utils
from scipy.spatial import distance as dist
from config import (
    EYE_AR_THRESHOLD, EYE_AR_CONSEC_FRAMES, DISPLAY_TIME, ENABLE_DYNAMIC_CALIBRATION, 
    BASELINE_CALIBRATION_FRAMES, MIN_BLINK_DURATION_FRAMES
)
import tkinter as tk
from threading import Thread
from anti_spoof_detection import AntiSpoofDetector
from config import ANTI_SPOOF_ENABLED
import numpy as np

# Load dlib's face detector and facial landmarks predictor
try:
    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor("shape_predictor_68_face_landmarks.dat")
except Exception as e:
    raise RuntimeError(f"Error initializing dlib detector or predictor: {e}")

# Define indices for the landmarks of the left and right eyes
(lStart, lEnd) = face_utils.FACIAL_LANDMARKS_IDXS["left_eye"]
(rStart, rEnd) = face_utils.FACIAL_LANDMARKS_IDXS["right_eye"]

def calculate_ear(eye):
    """
    Calculates the Eye Aspect Ratio (EAR) for blink detection.
    EAR is a metric to measure eye openness.
    """
    A = dist.euclidean(eye[1], eye[5])  # Distance between vertical landmarks
    B = dist.euclidean(eye[2], eye[4])  # Distance between vertical landmarks
    C = dist.euclidean(eye[0], eye[3])  # Distance between horizontal landmarks
    return (A + B) / (2.0 * C)

def show_attendance_message(user_id, course, semester, roll_number):
    """
    Displays a popup message indicating attendance is marked.
    """
    def close_window():
        root.destroy()

    message = (
        f"Attendance marked for {user_id} of {course} - {semester}\n"
        f"bearing roll number {roll_number}."
    )

    if not tk._default_root:
        root = tk.Tk()
    else:
        root = tk.Toplevel()

    root.title("Attendance")
    root.geometry("400x150")

    label = tk.Label(root, text=message, font=("Arial", 14), wraplength=380, justify="center")
    label.pack(expand=True, padx=20, pady=20)

    root.after(5000, close_window)
    root.mainloop()

def calibrate_baseline_ear(video_cap, num_frames=BASELINE_CALIBRATION_FRAMES):
    """
    Calibrates baseline EAR by averaging EAR values over several frames.
    """
    total_ear = 0
    valid_frames = 0

    for _ in range(num_frames):
        ret, frame = video_cap.read()
        if not ret:
            print("Calibration frame capture failed. Using default EAR threshold.")
            return EYE_AR_THRESHOLD

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detector(gray, 0)
        if faces:
            shape = predictor(gray, faces[0])
            shape = face_utils.shape_to_np(shape)
            leftEye = shape[lStart:lEnd]
            rightEye = shape[rStart:rEnd]
            leftEAR = calculate_ear(leftEye)
            rightEAR = calculate_ear(rightEye)
            total_ear += (leftEAR + rightEAR) / 2.0
            valid_frames += 1

    if valid_frames > 0:
        baseline_ear = total_ear / valid_frames
        print(f"Calibrated baseline EAR: {baseline_ear:.2f}")
        return baseline_ear
    else:
        print("No faces detected during calibration. Using default EAR threshold.")
        return EYE_AR_THRESHOLD

def process_frame(video_cap, known_face_encodings, known_face_names, known_face_roll_no, known_face_semesters, known_face_courses):
    """
    Optimized main function for blink detection and attendance registration with improved FPS.
    """
    try:
        baseline_ear = calibrate_baseline_ear(video_cap) if ENABLE_DYNAMIC_CALIBRATION else EYE_AR_THRESHOLD
    except Exception as e:
        print(f"Error during baseline EAR calibration: {e}")
        baseline_ear = EYE_AR_THRESHOLD

    threshold = baseline_ear * 0.8
    min_blink_duration = MIN_BLINK_DURATION_FRAMES if ENABLE_DYNAMIC_CALIBRATION else EYE_AR_CONSEC_FRAMES

    user_states = {}
    anti_spoof = AntiSpoofDetector() if ANTI_SPOOF_ENABLED else None

    # Optimized processing variables
    frame_count = 0
    last_fps_time = time.time()
    fps_frames = 0
    current_fps = 0
    
    # OPTIMIZED: More aggressive frame skipping for maximum FPS
    face_detection_counter = 0
    verification_counter = 0
    
    # Face detection stability variables - OPTIMIZED FOR MAXIMUM FPS
    face_stability_buffer = []
    STABILITY_BUFFER_SIZE = 2  # Reduced from 3 to 2 for faster response
    STABLE_FACE_THRESHOLD = 1  # Reduced threshold for faster detection
    
    # OPTIMIZED: Longer cache duration for better FPS
    face_cache = {
        'face_locations': [],
        'face_encodings': [],
        'dlib_faces': [],
        'timestamp': 0,
        'is_valid': False,
        'confidence': 0
    }
    
    # Face display state
    display_state = {
        'has_stable_faces': False,
        'show_no_face_message': False,
        'no_face_start_time': 0,
        'last_face_time': 0
    }
    
    NO_FACE_DELAY = 2.0
    
    # OPTIMIZED: Maximum OpenCV performance settings
    cv2.setNumThreads(8)  # Increased from 4 to 8
    cv2.setUseOptimized(True)
    cv2.useOptimized()
    
    print("Starting maximum FPS optimized frame processing...")
    
    while True:
        # FPS calculation
        fps_frames += 1
        current_time = time.time()
        if current_time - last_fps_time >= 1.0:
            current_fps = fps_frames / (current_time - last_fps_time)
            fps_frames = 0
            last_fps_time = current_time

        ret, frame = video_cap.read()
        if not ret:
            print("Failed to grab frame from camera.")
            break

        frame_count += 1
        frame_height, frame_width = frame.shape[:2]
        font = cv2.FONT_HERSHEY_SIMPLEX
        
        # Display FPS
        cv2.putText(frame, f"FPS: {current_fps:.1f}", (10, 30), font, 0.7, (0, 255, 255), 2)
        
        # OPTIMIZED: More aggressive processing frequency for maximum FPS
        # Adaptive frequency based on current FPS performance
        if current_fps > 30:
            face_detect_freq = 6  # Very infrequent when FPS is good
            verify_freq = 4
        elif current_fps > 20:
            face_detect_freq = 5  # Less frequent for better FPS
            verify_freq = 3
        else:
            face_detect_freq = 4  # Moderate frequency when struggling
            verify_freq = 2
        
        # Face detection with MAXIMUM caching for FPS optimization
        face_detection_counter += 1
        should_detect_faces = face_detection_counter % face_detect_freq == 0
        
        faces_detected_this_frame = False
        
        if should_detect_faces:
            # OPTIMIZED: Even smaller detection frame for maximum speed
            detect_frame = cv2.resize(frame, (320, 240))  # Smaller for max speed
            gray = cv2.cvtColor(detect_frame, cv2.COLOR_BGR2GRAY)
            rgb_frame = cv2.cvtColor(detect_frame, cv2.COLOR_BGR2RGB)

            # OPTIMIZED: Ultra-fast face detection
            dlib_faces_temp = detector(gray, 0)  # No upsampling for speed
            face_locations_temp = face_recognition.face_locations(rgb_frame, model='hog', number_of_times_to_upsample=0)
            
            if face_locations_temp:
                try:
                    # OPTIMIZED: Faster face encodings with minimal jitters
                    face_encodings_temp = face_recognition.face_encodings(rgb_frame, face_locations_temp, num_jitters=0, model='small')
                    
                    if face_encodings_temp:
                        # Scale back to original size
                        scale_x = frame_width / 320
                        scale_y = frame_height / 240
                        face_locations = [(int(top*scale_y), int(right*scale_x), int(bottom*scale_y), int(left*scale_x)) 
                                        for (top, right, bottom, left) in face_locations_temp]
                        dlib_faces = [dlib.rectangle(int(face.left()*scale_x), int(face.top()*scale_y), 
                                                   int(face.right()*scale_x), int(face.bottom()*scale_y)) 
                                    for face in dlib_faces_temp]
                        face_encodings = face_encodings_temp
                        
                        faces_detected_this_frame = True
                        
                        # Update cache with new data
                        face_cache.update({
                            'face_locations': face_locations,
                            'face_encodings': face_encodings,
                            'dlib_faces': dlib_faces,
                            'timestamp': current_time,
                            'is_valid': True,
                            'confidence': min(100, 80 + len(face_locations) * 10)
                        })
                        
                        display_state['last_face_time'] = current_time
                    else:
                        faces_detected_this_frame = False
                except Exception as e:
                    print(f"Error in face encoding: {e}")
                    faces_detected_this_frame = False
            else:
                faces_detected_this_frame = False
        else:
            # OPTIMIZED: Longer cache duration for maximum FPS
            cache_age = current_time - face_cache['timestamp']
            if face_cache['is_valid'] and cache_age < 1.2:  # Increased from 0.7 to 1.2 seconds
                faces_detected_this_frame = True
                # Slower confidence decay for longer cache usage
                face_cache['confidence'] = max(0, face_cache['confidence'] - (cache_age * 20))
            else:
                faces_detected_this_frame = False

        # Update face stability buffer
        face_stability_buffer.append(faces_detected_this_frame)
        if len(face_stability_buffer) > STABILITY_BUFFER_SIZE:
            face_stability_buffer.pop(0)
        
        # Calculate stability metrics
        recent_detections = sum(face_stability_buffer)
        display_state['has_stable_faces'] = recent_detections >= STABLE_FACE_THRESHOLD
        
        # Determine if we should show "no face detected" message
        if not display_state['has_stable_faces']:
            if display_state['show_no_face_message'] == False:
                if display_state['no_face_start_time'] == 0:
                    display_state['no_face_start_time'] = current_time
                elif current_time - display_state['no_face_start_time'] >= NO_FACE_DELAY:
                    display_state['show_no_face_message'] = True
        else:
            display_state['show_no_face_message'] = False
            display_state['no_face_start_time'] = 0

        # Always display main instructions
        main_msg = "Anti-Spoof Enabled - Follow instructions" if ANTI_SPOOF_ENABLED else "Blink to register Attendance"
        text_size = cv2.getTextSize(main_msg, font, 0.8, 2)[0]
        text_x = (frame_width - text_size[0]) // 2
        text_y = 60
        cv2.rectangle(frame, (text_x-10, text_y-text_size[1]-10), 
                    (text_x+text_size[0]+10, text_y+10), (0, 0, 0), -1)
        cv2.putText(frame, main_msg, (text_x, text_y), font, 0.8, (0, 255, 0), 2)

        # Show "no face detected" message only when appropriate
        if display_state['show_no_face_message']:
            no_face_msg = "No face detected"
            text_size = cv2.getTextSize(no_face_msg, font, 0.8, 2)[0]
            text_x = (frame_width - text_size[0]) // 2
            text_y = frame_height - 50
            cv2.rectangle(frame, (text_x-10, text_y-text_size[1]-10), 
                        (text_x+text_size[0]+10, text_y+10), (0, 0, 0), -1)
            cv2.putText(frame, no_face_msg, (text_x, text_y), font, 0.8, (0, 0, 255), 2)

        if not known_face_encodings:
            cv2.putText(frame, "No registered faces", (40, frame_height - 50), font, 0.8, (0, 0, 255), 2)
            cv2.imshow("video_live", frame)
            if cv2.waitKey(1) == ord("0"):
                break
            continue

        # Process faces only when we have stable face detection
        if display_state['has_stable_faces'] and face_cache['is_valid']:
            face_locations = face_cache['face_locations']
            face_encodings = face_cache['face_encodings']
            dlib_faces = face_cache['dlib_faces']
            
            # OPTIMIZED: Less frequent verification for better FPS
            verification_counter += 1
            should_verify = verification_counter % verify_freq == 0
            
            for i, ((top, right, bottom, left), face_encoding) in enumerate(zip(face_locations, face_encodings)):
                # OPTIMIZED: Faster face recognition with higher tolerance
                matches = face_recognition.compare_faces(known_face_encodings, face_encoding, tolerance=0.6)  # Increased tolerance
                face_distances = face_recognition.face_distance(known_face_encodings, face_encoding)

                user_id = "Unknown"
                accuracy = 0.0
                best_match_index = -1

                if matches:
                    best_match_index = face_distances.argmin()
                    if matches[best_match_index]:
                        accuracy = (1 - face_distances[best_match_index]) * 100
                        if accuracy >= 50.0:  # Slightly lowered threshold for faster recognition
                            user_id = known_face_names[best_match_index]

                # Initialize user state
                if user_id not in user_states:
                    user_states[user_id] = {
                        "blink_counter": 0,
                        "last_ear": baseline_ear,
                        "last_attendance_time": 0,
                        "verification_status": "pending",
                        "last_verification": 0,
                        "verification_attempts": 0,
                        "can_blink": False
                    }

                user_data = user_states[user_id]
                
                # Anti-spoofing verification with optimized frequency
                verification_status = "BLINK TO REGISTER"
                box_color = (0, 255, 0)
                can_blink_for_attendance = True
                
                if ANTI_SPOOF_ENABLED and anti_spoof and user_id != "Unknown":
                    # Check verification status
                    if anti_spoof.is_user_verified(user_id):
                        verification_status = "✅ VERIFIED - BLINK NOW!"
                        box_color = (0, 255, 0)
                        can_blink_for_attendance = True
                        user_data["can_blink"] = True
                    else:
                        can_blink_for_attendance = False
                        user_data["can_blink"] = False
                        
                        # OPTIMIZED: Less frequent verification checks for better FPS
                        if should_verify or (current_time - user_data["last_verification"] > 0.5):  # Increased from 300ms to 500ms
                            user_data["last_verification"] = current_time
                            
                            face_region = frame[max(0, top-10):min(frame_height, bottom+10), 
                                              max(0, left-10):min(frame_width, right+10)]
                            face_box = (left, top, right, bottom)
                            
                            try:
                                verified, status_msg, score = anti_spoof.verify_user_liveness(
                                    user_id, frame, face_box, face_region
                                )
                                
                                if verified:
                                    verification_status = "✅ VERIFIED - BLINK NOW!"
                                    box_color = (0, 255, 0)
                                    can_blink_for_attendance = True
                                    user_data["can_blink"] = True
                                    print(f"✅ User {user_id} verified successfully!")
                                else:
                                    # Get current challenge
                                    user_state = anti_spoof.get_user_state(user_id)
                                    if not user_state.get('challenge_active', False):
                                        anti_spoof.start_challenge_for_user(user_id)
                                        user_state = anti_spoof.get_user_state(user_id)
                                    
                                    current_challenge = user_state.get('current_challenge', '')
                                    
                                    if current_challenge == 'TURN_LEFT':
                                        verification_status = "👈 TURN HEAD LEFT"
                                        box_color = (0, 165, 255)
                                    elif current_challenge == 'TURN_RIGHT':
                                        verification_status = "👉 TURN HEAD RIGHT"
                                        box_color = (0, 165, 255)
                                    elif current_challenge == 'MOVE_CLOSER':
                                        verification_status = "🔍 MOVE CLOSER"
                                        box_color = (0, 165, 255)
                                    elif current_challenge == 'NOD_HEAD':
                                        verification_status = "👆👇 NOD HEAD"
                                        box_color = (0, 165, 255)
                                    else:
                                        verification_status = "⏳ INITIALIZING..."
                                        box_color = (255, 255, 0)
                                    
                            except Exception as e:
                                print(f"Error in verification: {e}")
                                verification_status = "❌ VERIFICATION ERROR"
                                box_color = (0, 0, 255)
                        else:
                            # Use cached status for better FPS
                            if user_data["can_blink"]:
                                verification_status = "✅ VERIFIED - BLINK NOW!"
                                box_color = (0, 255, 0)
                                can_blink_for_attendance = True
                            else:
                                # Show last known challenge
                                try:
                                    user_state = anti_spoof.get_user_state(user_id)
                                    current_challenge = user_state.get('current_challenge', '')
                                    if current_challenge == 'TURN_LEFT':
                                        verification_status = "👈 TURN HEAD LEFT"
                                    elif current_challenge == 'TURN_RIGHT':
                                        verification_status = "👉 TURN HEAD RIGHT"
                                    elif current_challenge == 'MOVE_CLOSER':
                                        verification_status = "🔍 MOVE CLOSER"
                                    elif current_challenge == 'NOD_HEAD':
                                        verification_status = "👆👇 NOD HEAD"
                                    else:
                                        verification_status = "⏳ FOLLOW INSTRUCTION"
                                    box_color = (0, 165, 255)
                                except:
                                    verification_status = "⏳ FOLLOW INSTRUCTION"
                                    box_color = (0, 165, 255)

                # Blink detection (only if verified or anti-spoof disabled)
                if can_blink_for_attendance and dlib_faces:
                    # Find matching dlib face
                    dlib_face = None
                    for face in dlib_faces:
                        face_center_x = (face.left() + face.right()) // 2
                        face_center_y = (face.top() + face.bottom()) // 2
                        detection_center_x = (left + right) // 2
                        detection_center_y = (top + bottom) // 2
                        
                        if (abs(face_center_x - detection_center_x) < 30 and 
                            abs(face_center_y - detection_center_y) < 30):
                            dlib_face = face
                            break
                    
                    if dlib_face is not None:
                        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                        shape = predictor(gray, dlib_face)
                        shape = face_utils.shape_to_np(shape)
                        leftEye = shape[lStart:lEnd]
                        rightEye = shape[rStart:rEnd]
                        ear = (calculate_ear(leftEye) + calculate_ear(rightEye)) / 2.0

                        if ear < threshold:
                            user_data["blink_counter"] += 1
                        else:
                            if user_data["blink_counter"] >= min_blink_duration:
                                if current_time - user_data["last_attendance_time"] > DISPLAY_TIME:
                                    if user_id != "Unknown":
                                        print(f"👁️ Blink detected for {user_id}, registering attendance.")
                                        roll_no = known_face_roll_no[best_match_index]
                                        course = known_face_courses[best_match_index]
                                        semester = known_face_semesters[best_match_index]
                                        Thread(target=show_attendance_message, 
                                              args=(user_id, course, semester, roll_no)).start()
                                        update_attendance_in_firebase(roll_no, user_id, course, semester)
                                        user_data["last_attendance_time"] = current_time
                                        
                                        # Reset verification after successful attendance
                                        if ANTI_SPOOF_ENABLED and anti_spoof:
                                            anti_spoof.reset_user_verification(user_id)
                                            user_data["can_blink"] = False
                            user_data["blink_counter"] = 0

                # Draw face rectangle
                cv2.rectangle(frame, (left, top), (right, bottom), box_color, 3)
                
                # Display user name
                name_text = user_id
                text_size = cv2.getTextSize(name_text, font, 0.9, 2)[0]
                cv2.rectangle(frame, (left-2, top-text_size[1]-15), 
                            (left+text_size[0]+4, top-2), (0, 0, 0), -1)
                cv2.putText(frame, name_text, (left, top - 10), font, 0.9, box_color, 2)
                
                # Display accuracy
                accuracy_text = f"Acc: {accuracy:.1f}%"
                text_size = cv2.getTextSize(accuracy_text, font, 0.6, 2)[0]
                cv2.rectangle(frame, (left-2, bottom+2), 
                            (left+text_size[0]+4, bottom+text_size[1]+8), (0, 0, 0), -1)
                cv2.putText(frame, accuracy_text, (left, bottom + 18), font, 0.6, box_color, 2)

                # Display verification status
                if ANTI_SPOOF_ENABLED and user_id != "Unknown":
                    status_y = bottom + 40
                    text_size = cv2.getTextSize(verification_status, font, 0.7, 2)[0]
                    cv2.rectangle(frame, (left-2, status_y-text_size[1]-5), 
                                (left+text_size[0]+4, status_y+8), (0, 0, 0), -1)
                    cv2.putText(frame, verification_status, (left, status_y), font, 0.7, box_color, 2)

        # Show frame
        cv2.imshow("video_live", frame)
        
        # OPTIMIZED: Minimal delay for maximum FPS
        key = cv2.waitKey(1) & 0xFF
        if key == ord("0"):
            break
        
    video_cap.release()
    cv2.destroyAllWindows()