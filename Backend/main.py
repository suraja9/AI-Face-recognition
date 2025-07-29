# main.py

import cv2
import threading
import time
from blink_detection import process_frame
from firebase_integration import initialize_firebase, load_known_faces_from_firestore

print("Initializing Attendance System...")

# Step 1: Initialize Firebase
print("Connecting to Firebase...")
if not initialize_firebase():
    print("❌ Error: Firebase initialization failed. Exiting.")
    exit()
print("✅ Firebase connected successfully")

# Step 2: Load known face data from Firebase Firestore
print("Loading face data from database...")
known_face_encodings, known_face_names, known_face_roll_no, known_face_courses, known_face_semesters = load_known_faces_from_firestore()
if not known_face_encodings:
    print("⚠️ Warning: No face encodings loaded from Firestore. Ensure the database is populated.")
else:
    print(f"✅ Loaded {len(known_face_encodings)} face encodings from database")

# Step 3: Initialize video capture with optimized settings
print("Initializing camera...")
video_cap = cv2.VideoCapture(0)
if not video_cap.isOpened():
    print("❌ Error: Unable to access the camera. Exiting.")
    exit()

# Optimal camera settings for balanced performance and quality
print("Configuring camera settings...")
video_cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer lag
video_cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
video_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
video_cap.set(cv2.CAP_PROP_FPS, 30)  # Reduced to 30 for better stability
video_cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))

# Advanced camera optimization
try:
    # Disable auto-adjustments for consistent performance
    video_cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
    video_cap.set(cv2.CAP_PROP_EXPOSURE, -6)
    video_cap.set(cv2.CAP_PROP_GAIN, 0)
    video_cap.set(cv2.CAP_PROP_BRIGHTNESS, 130)
    video_cap.set(cv2.CAP_PROP_CONTRAST, 130)
    video_cap.set(cv2.CAP_PROP_SATURATION, 100)
    video_cap.set(cv2.CAP_PROP_AUTO_WB, 0)
    video_cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
    print("✅ Advanced camera settings applied")
except Exception as e:
    print(f"⚠️ Some camera settings may not be supported: {e}")

# Test camera
ret, test_frame = video_cap.read()
if not ret:
    print("❌ Error: Unable to read from camera. Exiting.")
    video_cap.release()
    exit()

print(f"✅ Camera initialized - Resolution: {test_frame.shape[1]}x{test_frame.shape[0]}")

# Global flag for clean shutdown
shutdown_flag = False

def frame_processing():
    """
    Process frames for face recognition and blink detection.
    Runs in a separate thread with error handling.
    """
    global shutdown_flag
    try:
        print("🚀 Starting frame processing...")
        process_frame(video_cap, known_face_encodings, known_face_names, 
                     known_face_roll_no, known_face_courses, known_face_semesters)
    except KeyboardInterrupt:
        print("⏹️ Frame processing interrupted by user")
        shutdown_flag = True
    except Exception as e:
        print(f"❌ Error in frame processing: {e}")
        import traceback
        traceback.print_exc()
        shutdown_flag = True

# Step 4: Start frame processing thread
print("Starting application threads...")
thread = threading.Thread(target=frame_processing, daemon=True)
thread.start()

# Step 5: Main application loop with improved error handling
try:
    print("✅ System ready! Press '0' to exit")
    print("=" * 50)
    
    start_time = time.time()
    while not shutdown_flag:
        # Check if thread is still alive
        if not thread.is_alive():
            print("⚠️ Frame processing thread has stopped")
            break
            
        # Non-blocking key check
        key = cv2.waitKey(1) & 0xFF
        if key == ord('0'):
            print("🛑 Exit command received")
            break
        elif key == ord('r'):
            print("🔄 Reloading face data...")
            # Reload face data if needed
            pass
        elif key == ord('h'):
            print("📋 Help: Press '0' to exit, 'r' to reload, 'h' for help")
            
        # Prevent busy waiting
        time.sleep(0.01)
        
        # Show uptime every 60 seconds
        if int(time.time() - start_time) % 60 == 0 and int(time.time() - start_time) > 0:
            uptime = int(time.time() - start_time)
            if uptime % 60 == 0:  # Only print once per minute
                print(f"⏱️ System uptime: {uptime//60} minutes")

except KeyboardInterrupt:
    print("\n⏹️ Application interrupted by user (Ctrl+C)")
except Exception as e:
    print(f"❌ Unexpected error in main loop: {e}")
    import traceback
    traceback.print_exc()
finally:
    # Cleanup
    print("🧹 Cleaning up resources...")
    shutdown_flag = True
    
    # Give thread time to finish
    if thread.is_alive():
        print("⏳ Waiting for frame processing to complete...")
        thread.join(timeout=3.0)
        if thread.is_alive():
            print("⚠️ Frame processing thread did not exit cleanly")

    # Release resources
    try:
        video_cap.release()
        cv2.destroyAllWindows()
        print("✅ Camera and windows closed")
    except Exception as e:
        print(f"⚠️ Error during cleanup: {e}")

    print("👋 Application exited cleanly")
    print("=" * 50)