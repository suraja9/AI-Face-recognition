# config.py - Optimized Configuration

# ===== BLINK DETECTION SETTINGS =====
EYE_AR_THRESHOLD = 0.25  # Eye aspect ratio threshold for blink detection
EYE_AR_CONSEC_FRAMES = 2  # Reduced for faster response
MIN_BLINK_DURATION_FRAMES = 2  # Minimum blink duration
DISPLAY_TIME = 10  # Time in seconds before allowing re-registration

# ===== CALIBRATION SETTINGS =====
ENABLE_DYNAMIC_CALIBRATION = True  # Enable dynamic EAR calibration
BASELINE_CALIBRATION_FRAMES = 20  # Reduced for faster startup

# ===== REGISTRATION PARAMETERS =====
CAPTURE_DELAY = 0.1
MIN_CAPTURE_DELAY = 0.05
ADJUSTMENT_FACTOR = 0.1
IMAGE_COUNT = 200
TEMP_DIR = "temp_images"

# ===== ANTI-SPOOFING SETTINGS =====
ANTI_SPOOF_ENABLED = True  # Enable anti-spoofing detection

# Anti-spoofing verification settings
VERIFICATION_TIMEOUT = 15  # Seconds to complete verification
CHALLENGE_TIMEOUT = 5  # Seconds per individual challenge
MAX_VERIFICATION_ATTEMPTS = 3  # Max attempts before reset

# Challenge difficulty settings
HEAD_TURN_THRESHOLD = 15  # Degrees for head turn detection
NOD_THRESHOLD = 10  # Degrees for head nod detection
MOVEMENT_SENSITIVITY = 0.3  # Movement detection sensitivity
FACE_SIZE_CHANGE_THRESHOLD = 0.2  # For move closer/farther detection

# Legacy anti-spoofing parameters (for backward compatibility)
MOTION_THRESHOLD = 12  # Reduced for easier movement
TEXTURE_QUALITY_THRESHOLD = 0.25  # More lenient
LIVENESS_SCORE_THRESHOLD = 0.4  # More lenient
CONSECUTIVE_REAL_FRAMES = 8  # More frames for stability but less flickering

# Challenge types
CHALLENGE_TYPES = [
    "TURN_LEFT",
    "TURN_RIGHT", 
    "MOVE_CLOSER",
    "NOD_HEAD"
]

# ===== PERFORMANCE SETTINGS =====
# Frame processing frequencies (lower = more frequent)
FACE_DETECTION_FREQUENCY = 5  # Process face detection every N frames
VERIFICATION_FREQUENCY = 3  # Process verification every N frames
DISPLAY_UPDATE_FREQUENCY = 2  # Update display every N frames

# Face recognition settings
FACE_RECOGNITION_TOLERANCE = 0.5  # Lower = stricter matching
FACE_DETECTION_TOLERANCE = 0.5  # Lower value = more strict matching (legacy)
MINIMUM_FACE_ACCURACY = 55.0  # Minimum accuracy percentage for recognition
FACE_RECOGNITION_JITTERS = 1  # Number of jitters for encoding (lower = faster)
MIN_FACE_SIZE = 50  # Minimum face size in pixels

# Camera optimization
CAMERA_BUFFER_SIZE = 1  # Minimal buffer for low latency
TARGET_FPS = 30  # Target camera FPS
PROCESSING_RESOLUTION = (480, 360)  # Resolution for face detection processing
DISPLAY_RESOLUTION = (640, 480)  # Display resolution

# ===== UI SETTINGS =====
FONT_SCALE = 0.7  # Text font scale
TEXT_THICKNESS = 2  # Text thickness
BOX_THICKNESS = 3  # Face box thickness

# Colors (BGR format)
COLOR_VERIFIED = (0, 255, 0)  # Green
COLOR_PENDING = (0, 165, 255)  # Orange
COLOR_FAILED = (0, 0, 255)  # Red
COLOR_UNKNOWN = (128, 128, 128)  # Gray
COLOR_INFO = (255, 255, 0)  # Yellow

# ===== FIREBASE SETTINGS =====
# These should be in a separate secure config or environment variables
FIREBASE_TIMEOUT = 10  # Seconds for Firebase operations
MAX_RETRY_ATTEMPTS = 3  # Max retries for Firebase operations

# ===== LOGGING SETTINGS =====
ENABLE_DEBUG_LOGGING = False  # Enable detailed logging
LOG_PERFORMANCE_METRICS = True  # Log FPS and timing info
LOG_VERIFICATION_ATTEMPTS = True  # Log anti-spoof attempts

# ===== SYSTEM OPTIMIZATION =====
OPENCV_NUM_THREADS = 4  # Number of OpenCV threads
ENABLE_OPENCV_OPTIMIZATIONS = True  # Enable OpenCV optimizations
MEMORY_CLEANUP_INTERVAL = 100  # Cleanup memory every N frames

# ===== ADVANCED SETTINGS =====
# These are for fine-tuning performance vs accuracy

# Face detection optimization
USE_SMALL_FACE_MODEL = True  # Use smaller face recognition model
SKIP_FACE_ENCODING_OPTIMIZATION = False  # Skip some encoding optimizations
FACE_LOCATION_MODEL = 'hog'  # 'hog' for speed, 'cnn' for accuracy

# Anti-spoofing optimization
ANTI_SPOOF_QUALITY_CHECK = True  # Check image quality before verification
ANTI_SPOOF_MULTI_FRAME_CHECK = True  # Use multiple frames for verification
CHALLENGE_RANDOMIZATION = True  # Randomize challenge order

# Performance monitoring
PERFORMANCE_MONITORING = True  # Monitor and adjust performance
AUTO_QUALITY_ADJUSTMENT = True  # Automatically adjust quality based on performance
MIN_ACCEPTABLE_FPS = 15  # Minimum acceptable FPS

# ===== VALIDATION FUNCTIONS =====
def validate_config():
    """Validate configuration settings and adjust if necessary."""
    global FACE_DETECTION_FREQUENCY, VERIFICATION_FREQUENCY
    
    # Ensure frequencies are reasonable
    if FACE_DETECTION_FREQUENCY < 1:
        FACE_DETECTION_FREQUENCY = 1
    if VERIFICATION_FREQUENCY < 1:
        VERIFICATION_FREQUENCY = 1
    
    # Ensure thresholds are in valid ranges
    global EYE_AR_THRESHOLD
    if EYE_AR_THRESHOLD < 0.1 or EYE_AR_THRESHOLD > 0.5:
        EYE_AR_THRESHOLD = 0.25
    
    print("✅ Configuration validated")

def get_performance_settings(current_fps):
    """Dynamically adjust settings based on current FPS."""
    settings = {}
    
    if current_fps < MIN_ACCEPTABLE_FPS:
        # Reduce quality for better performance
        settings['face_detection_freq'] = 8
        settings['verification_freq'] = 6
        settings['processing_resolution'] = (320, 240)
        settings['use_optimization'] = True
    elif current_fps > 25:
        # Increase quality since performance is good
        settings['face_detection_freq'] = 3
        settings['verification_freq'] = 2
        settings['processing_resolution'] = (480, 360)
        settings['use_optimization'] = False
    else:
        # Use default settings
        settings['face_detection_freq'] = FACE_DETECTION_FREQUENCY
        settings['verification_freq'] = VERIFICATION_FREQUENCY
        settings['processing_resolution'] = PROCESSING_RESOLUTION
        settings['use_optimization'] = ENABLE_OPENCV_OPTIMIZATIONS
    
    return settings

# Initialize and validate configuration
validate_config()