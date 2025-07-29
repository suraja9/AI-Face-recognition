# anti_spoof_detection.py

import cv2
import numpy as np
import time
import random
from config import (
    CHALLENGE_TIMEOUT, MOTION_THRESHOLD, TEXTURE_QUALITY_THRESHOLD,
    LIVENESS_SCORE_THRESHOLD, CONSECUTIVE_REAL_FRAMES, CHALLENGE_TYPES
)

class AntiSpoofDetector:
    def __init__(self):
        self.user_challenges = {}  # Store challenges per user
        
    def get_user_state(self, user_id):
        """Get or create user-specific challenge state"""
        if user_id not in self.user_challenges:
            self.user_challenges[user_id] = {
                'challenge_active': False,
                'challenge_start_time': 0,
                'current_challenge': None,
                'previous_positions': [],
                'real_frame_count': 0,
                'verified': False,
                'last_verification_time': 0,
                'baseline_position': None,
                'movement_detected': False
            }
        return self.user_challenges[user_id]
        
    def start_challenge_for_user(self, user_id):
        """Start anti-spoofing challenge for specific user"""
        state = self.get_user_state(user_id)
        
        # Don't restart if recently verified (within 30 seconds)
        if state['verified'] and (time.time() - state['last_verification_time']) < 30:
            return None
            
        state['challenge_active'] = True
        state['challenge_start_time'] = time.time()
        state['current_challenge'] = random.choice(CHALLENGE_TYPES)
        state['previous_positions'] = []
        state['real_frame_count'] = 0
        state['verified'] = False
        state['baseline_position'] = None
        state['movement_detected'] = False
        
        return self.get_challenge_text(state['current_challenge'])
        
    def get_challenge_text(self, challenge_type):
        """Convert challenge type to display text"""
        text_map = {
            'TURN_LEFT': 'Turn your head LEFT',
            'TURN_RIGHT': 'Turn your head RIGHT',
            'MOVE_CLOSER': 'Move CLOSER to camera',
            'NOD_HEAD': 'NOD your head up/down'
        }
        return text_map.get(challenge_type, 'Follow the instruction')
        
    def detect_photo_spoof(self, face_region):
        """Fast photo spoofing detection"""
        if face_region.size == 0:
            return 0.0
            
        # Convert to grayscale
        gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY) if len(face_region.shape) == 3 else face_region
        
        # 1. Texture analysis - photos lack fine texture details
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        texture_score = min(1.0, laplacian_var / 200.0)  # More lenient texture detection
        
        # 2. Edge analysis - printed photos have sharper, artificial edges
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / edges.size
        edge_score = 1.0 - min(1.0, edge_density * 8)  # More lenient edge detection
        
        # 3. Histogram analysis - photos often have different distribution
        hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
        hist_entropy = -np.sum((hist / hist.sum()) * np.log2((hist / hist.sum()) + 1e-7))
        entropy_score = min(1.0, hist_entropy / 8.0)  # Normalize entropy
        
        # Combine scores with weights
        combined_score = (texture_score * 0.5 + edge_score * 0.3 + entropy_score * 0.2)
        return combined_score
        
    def analyze_movement(self, user_id, face_box):
        """Analyze head movement for liveness detection"""
        state = self.get_user_state(user_id)
        
        # Calculate face center and size
        center_x = (face_box[0] + face_box[2]) // 2
        center_y = (face_box[1] + face_box[3]) // 2
        face_size = (face_box[2] - face_box[0]) * (face_box[3] - face_box[1])
        
        current_pos = {'x': center_x, 'y': center_y, 'size': face_size, 'time': time.time()}
        
        # Set baseline on first detection
        if state['baseline_position'] is None:
            state['baseline_position'] = current_pos
            state['previous_positions'] = [current_pos]
            return False
            
        # Store position history (keep last 10 positions)
        state['previous_positions'].append(current_pos)
        if len(state['previous_positions']) > 10:
            state['previous_positions'].pop(0)
            
        if len(state['previous_positions']) < 3:
            return False
            
        # Calculate movement based on challenge type
        baseline = state['baseline_position']
        movement_detected = False
        
        if state['current_challenge'] == 'TURN_LEFT':
            if center_x < baseline['x'] - MOTION_THRESHOLD:
                movement_detected = True
        elif state['current_challenge'] == 'TURN_RIGHT':
            if center_x > baseline['x'] + MOTION_THRESHOLD:
                movement_detected = True
        elif state['current_challenge'] == 'MOVE_CLOSER':
            if face_size > baseline['size'] * 1.10:  # 10% larger - easier to trigger
                movement_detected = True
        elif state['current_challenge'] == 'NOD_HEAD':
            # Check for up-down movement
            recent_y_positions = [pos['y'] for pos in state['previous_positions'][-5:]]
            if len(recent_y_positions) >= 3:
                y_variation = max(recent_y_positions) - min(recent_y_positions)
                if y_variation > MOTION_THRESHOLD:
                    movement_detected = True
                    
        state['movement_detected'] = movement_detected
        return movement_detected
        
    def verify_user_liveness(self, user_id, frame, face_box, face_region):
        """Main verification function for specific user"""
        state = self.get_user_state(user_id)
        
        # Check if challenge is active
        if not state['challenge_active']:
            return False, "No active challenge", 0.0
            
        # Check timeout
        if time.time() - state['challenge_start_time'] > CHALLENGE_TIMEOUT:
            state['challenge_active'] = False
            return False, "Challenge timeout - try again", 0.0
            
        # 1. Photo spoofing detection
        texture_score = self.detect_photo_spoof(face_region)
        
        # 2. Movement analysis
        movement_valid = self.analyze_movement(user_id, face_box)
        
        # 3. Calculate liveness score
        movement_score = 1.0 if movement_valid else 0.0
        combined_score = (texture_score * 0.6 + movement_score * 0.4)
        
        # 4. Count consecutive "real" frames
        if combined_score >= LIVENESS_SCORE_THRESHOLD:
            state['real_frame_count'] += 1
        else:
            state['real_frame_count'] = max(0, state['real_frame_count'] - 1)
            
        # 5. Verify if enough consecutive real frames
        if state['real_frame_count'] >= CONSECUTIVE_REAL_FRAMES and movement_valid:
            state['verified'] = True
            state['challenge_active'] = False
            state['last_verification_time'] = time.time()
            print(f"✅ User {user_id} passed liveness verification!")
            return True, "Verification successful!", combined_score
            
        # Progress feedback
        progress = min(100, (state['real_frame_count'] / CONSECUTIVE_REAL_FRAMES) * 100)
        challenge_text = self.get_challenge_text(state['current_challenge'])
        status = f"{challenge_text} ({progress:.0f}%)"
        
        return False, status, combined_score
        
    def is_user_verified(self, user_id):
        """Check if user is currently verified"""
        if user_id not in self.user_challenges:
            return False
            
        state = self.user_challenges[user_id]
        # Verification expires after 60 seconds
        if state['verified'] and (time.time() - state['last_verification_time']) < 60:
            return True
            
        # Reset expired verification
        if state['verified']:
            state['verified'] = False
            
        return False
        
    def get_user_challenge_status(self, user_id):
        """Get display status for user"""
        if user_id not in self.user_challenges:
            return "Ready for verification"
            
        state = self.user_challenges[user_id]
        
        if state['verified']:
            return "✅ Verified - You can blink now"
        elif state['challenge_active']:
            remaining = max(0, CHALLENGE_TIMEOUT - (time.time() - state['challenge_start_time']))
            challenge_text = self.get_challenge_text(state['current_challenge'])
            progress = min(100, (state['real_frame_count'] / CONSECUTIVE_REAL_FRAMES) * 100)
            return f"{challenge_text} ({progress:.0f}% - {remaining:.1f}s)"
        else:
            return "Starting verification..."
            
    def reset_user_verification(self, user_id):
        """Reset verification for user after attendance marked"""
        if user_id in self.user_challenges:
            self.user_challenges[user_id]['verified'] = False
            self.user_challenges[user_id]['challenge_active'] = False