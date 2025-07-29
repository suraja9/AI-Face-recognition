# face_recognition_utils.py

import cv2
import face_recognition
import numpy as np

def calculate_accuracy(face_distance, threshold=0.6):
    """
    Calculate the match accuracy as a percentage based on face distance.
    A lower face distance indicates a closer match.

    Args:
        face_distance (float): The distance between the known and detected face encodings.
        threshold (float): The distance threshold for a positive match.

    Returns:
        float: The match accuracy as a percentage.
    """
    if face_distance < 0:
        raise ValueError("face_distance cannot be negative.")
    if face_distance > threshold:
        return 0.0  # No accuracy if the face distance exceeds the threshold
    # Ensuring that face_distance is not negative for accuracy calculation
    accuracy = max(0.0, (1 - face_distance / threshold) * 100)
    return round(accuracy, 2)

def preprocess_image(frame):
    """
    Preprocess the frame to improve face recognition accuracy under low lighting conditions.

    Steps:
    1. Convert the image to grayscale for histogram equalization.
    2. Apply histogram equalization to enhance contrast.
    3. Convert back to BGR after equalization.
    4. Apply gamma correction to adjust brightness.

    Args:
        frame (ndarray): The input image/frame in BGR format.

    Returns:
        ndarray: The preprocessed image/frame.
    """
    # Convert to grayscale to apply histogram equalization
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    # Apply histogram equalization to improve contrast
    equalized_gray = cv2.equalizeHist(gray)
    # Convert back to BGR after histogram equalization
    frame = cv2.cvtColor(equalized_gray, cv2.COLOR_GRAY2BGR)

    # Apply Gamma Correction for brightness adjustment
    gamma = 1.2  # Reduced gamma for better distant face visibility
    look_up_table = np.array([((i / 255.0) ** (1.0 / gamma)) * 255 for i in np.arange(0, 256)]).astype("uint8")
    frame = cv2.LUT(frame, look_up_table)

    return frame

def recognize_faces(known_face_encodings, known_face_names, known_face_courses, known_face_semesters, frame, accuracy_threshold=55.0):
    """
    Recognizes faces in the given frame using preloaded encodings for known faces.

    Args:
        known_face_encodings (list of list): Encodings for known faces grouped by person.
        known_face_names (list): Names corresponding to the known encodings.
        known_face_courses (list): Courses corresponding to the known faces.
        known_face_semesters (list): Semesters corresponding to the known faces.
        frame (ndarray): The input video frame in BGR format.
        accuracy_threshold (float): The minimum accuracy required for recognizing a face.

    Returns:
        list: A list of tuples containing the recognized name, accuracy, and face bounding box.
    """
    # Apply preprocessing for low-light conditions
    frame = preprocess_image(frame)
    
    # Convert the frame to RGB for compatibility with face_recognition
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_frame, model='hog')
    face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

    results = []
    for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
        min_distance = float('inf')
        best_name = "Unknown"
        best_course = "Unknown"
        best_semester = "Unknown"
        accuracy = 0.0

        for i, encodings in enumerate(known_face_encodings):
            if len(encodings) == 0:
                continue
            distances = face_recognition.face_distance(encodings, face_encoding)
            median_distance = np.median(distances)

            if median_distance < min_distance:
                min_distance = median_distance
                best_name = known_face_names[i]
                best_course = known_face_courses[i]
                best_semester = known_face_semesters[i]
                accuracy = calculate_accuracy(min_distance)

        if accuracy < accuracy_threshold:
            best_name = "Unknown"
            best_course = "Unknown"
            best_semester = "Unknown"

        # Display the recognized name, course, and semester on the frame
        cv2.putText(frame, f"{best_name} ({best_course} - {best_semester})", (left, top - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        results.append((best_name, accuracy, (left, top, right, bottom)))

    return results

def compute_average_encoding(face_encodings):
    """
    Compute the average encoding from a list of face encodings.

    Args:
        face_encodings (list of ndarray): A list of face encoding arrays.

    Returns:
        ndarray: The average encoding as a NumPy array.

    Raises:
        ValueError: If the input list is empty.
    """
    if not face_encodings:
        raise ValueError("No face encodings provided for averaging.")
    
    # Check for high variance in the provided face encodings
    variances = np.var(face_encodings, axis=0)
    if np.any(variances > 0.1):
        print("Warning: High variance detected in face encodings, data may be inconsistent.")
    
    return np.mean(face_encodings, axis=0)  # Compute and return the average encoding

def detect_screen_artifacts(frame):
    """
    Detect screen artifacts that indicate spoofing via phone/laptop screen.
    Returns score between 0-1 (1 = likely real, 0 = likely spoofed)
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Check for pixel grid patterns (common in screens)
    fft = np.fft.fft2(gray)
    fft_shift = np.fft.fftshift(fft)
    magnitude_spectrum = np.abs(fft_shift)
    
    # Look for regular patterns in frequency domain
    peak_count = np.sum(magnitude_spectrum > np.percentile(magnitude_spectrum, 99.5))
    grid_score = 1.0 - min(1.0, peak_count / 50.0)  # Normalize
    
    # Check color temperature (screens often have blue tint)
    b, g, r = cv2.split(frame)
    avg_b, avg_g, avg_r = np.mean(b), np.mean(g), np.mean(r)
    
    # Natural faces have balanced colors, screens often have blue bias
    color_balance = 1.0 - min(1.0, abs(avg_b - avg_r) / 50.0)
    
    # Combine scores
    final_score = (grid_score * 0.6 + color_balance * 0.4)
    return final_score