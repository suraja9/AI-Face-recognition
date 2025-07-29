# firebase_integration.py

# Import necessary modules for Firebase, logging, and data processing
import firebase_admin
from firebase_admin import credentials, firestore
import numpy as np
import logging
import warnings
import os
from datetime import datetime, timedelta

# Configure logging to display information and errors in a structured format
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv("LOG_FORMAT", "%(asctime)s - %(levelname)s - %(message)s")
logging.basicConfig(level=LOG_LEVEL, format=LOG_FORMAT)

# Define the path to the Firebase configuration file (JSON credentials file)
FIREBASE_CRED_PATH = os.path.join(os.getcwd(), "firebase_config", "chutiya-81b83-firebase-adminsdk-fbsvc-79892ea369.json")


def initialize_firebase():
    """
    Initialize Firebase Admin SDK. 
    Ensures the app is initialized only once to avoid redundancy.
    
    Returns:
        bool: True if initialized successfully, otherwise False.
    """
    if firebase_admin._apps:  # This condition checks if Firebase has already been initialized to prevent re-initialization.
        logging.info("Firebase is already initialized.")
        return True

    try:
        # Load Firebase credentials and initialize the app
        cred = credentials.Certificate(FIREBASE_CRED_PATH)
        firebase_admin.initialize_app(cred)
        logging.info("Firebase initialized successfully.")
        return True
    except Exception as e:
        # Log any errors that occur during initialization
        logging.error(f"Error initializing Firebase: {e}")
        return False

def get_firestore_client():
    """
    Retrieve the Firestore client for database operations.
    
    Returns:
        firestore.Client: Firestore client instance if successful, None otherwise.
    """
    if not firebase_admin._apps:  # Ensure Firebase is initialized
        if not initialize_firebase():
            logging.error("Firebase initialization failed; cannot access Firestore.")
            return None
    try:
        # Return the Firestore client instance
        return firestore.client()
    except Exception as e:
        logging.error(f"Error accessing Firestore: {e}")
        return None

def save_face_encoding_to_firestore(user_id, face_encoding, course, semester, roll_number):
    """
    Save the user's face encoding along with metadata to Firestore.
    
    Args:
        user_id (str): Unique identifier for the user (e.g., name or ID).
        face_encoding (numpy.ndarray): The face encoding as a numpy array.
        class_name (str): The class the user belongs to.
        roll_number (str): The user's roll number.
    """
    db = get_firestore_client()
    if not db:  # Ensure the Firestore client is available
        logging.error("Firestore client not available.")
        return

    try:
        # Reference the document for the user in the 'user_encodings' collection
        user_ref = db.collection('user_encodings').document(user_id)
        metadata = {
            'encoding': face_encoding.tolist(), # Convert numpy array to a serializable list
            'course': course,
            'semester': semester,
            'roll_number': roll_number
        }

        try:
            # Save or merge the metadata into Firestore
            user_ref.set(metadata, merge=True)
            logging.info(f"Face encoding for {user_id} saved successfully in Firestore.")
        except Exception as e:
            logging.error(f"Failed to save data to Firestore for {user_id}: {e}")
    except Exception as e:
        logging.error(f"Error in Firestore operations: {e}")

def load_known_faces_from_firestore():
    """
    Load all known face encodings and their associated metadata from Firestore.
    
    Returns:
        tuple: Four lists containing known face encodings, user IDs (names), 
               roll numbers, and class names.
    """
    db = get_firestore_client()
    if not db:  # Ensure the Firestore client is available
        logging.error("Firestore client not available.")
        return [], [], [], []

    known_face_encodings = []
    known_face_names = []
    known_face_roll_no = []
    known_face_courses = []
    known_face_semesters = []

    try:
        # Fetch all documents in the 'user_encodings' collection with pagination for large datasets
        collection_ref = db.collection('user_encodings')
        query = collection_ref.limit(100)  # Limit to 100 documents per page
        docs = query.stream()

        for doc in docs:
            data = doc.to_dict()  # Convert the document data to a dictionary
            # Ensure required keys are present
            if all(key in data for key in ['encoding', 'course', 'semester', 'roll_number']):
                known_face_encodings.append(np.array(data['encoding']))  # Convert list back to numpy array
                known_face_names.append(doc.id)  # Use the document ID as the user name
                known_face_courses.append(data['course'])
                known_face_semesters.append(data['semester'])
                known_face_roll_no.append(data['roll_number'])
            else:
                logging.warning(f"Document {doc.id} is missing required keys. Skipping.")

        logging.info(f"Loaded {len(known_face_encodings)} face encodings from Firestore.")
    except Exception as e:
        logging.error(f"Error loading face encodings from Firestore: {e}")

    return known_face_encodings, known_face_names, known_face_roll_no, known_face_semesters, known_face_courses

def check_duplicate_entry(name, course, semester, roll_number):
    """
    Check for duplicate entries with the same name, class, and roll number in Firestore.
    
    Args:
        name (str): Name of the user.
        class_name (str): Class the user belongs to.
        roll_number (str): User's roll number.
    
    Returns:
        bool: True if a duplicate entry exists, False otherwise.
    """
    db = get_firestore_client()
    if not db:  # Ensure the Firestore client is available
        logging.error("Firestore client not available.")
        return False

    try:
        # Suppress warnings related to positional arguments
        # This is necessary as Firestore queries may trigger warnings when used with positional arguments.
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)

            # Query Firestore for documents matching the class and roll number
            query = (
                db.collection('user_encodings')
                .where("course", "==", course)
                .where("semester", "==", semester)
                .where("roll_number", "==", roll_number)
            )
            docs = query.stream()

            for doc in docs:
                if doc.id == name:  # Check if the document ID matches the user name
                    logging.warning(f"Duplicate entry found: Name: {name}, Course: {course}, Semester: {semester}, Roll No: {roll_number}")
                    return True

        logging.info("No duplicate entry found.")
        return False
    except Exception as e:
        logging.error(f"Error checking for duplicate entry: {e}")
        return False

# Dictionary to keep track of today's attendance to avoid duplicates (in-memory cache)
attendance_today = {}

def update_attendance_in_firebase(roll_no, name, course, semester):
    """
    Updates attendance for a student in Firebase Firestore.
    Avoids duplicate entries for the same student on the same day.
    """
    today = datetime.now().strftime("%d-%m-%Y")  # Current date in DD-MM-YYYY format
    
    # Skip if attendance is already marked for this student today (using in-memory cache)
    if attendance_today.get(name) == today:
        logging.info(f"Attendance already marked for {name} today.")
        return False
    
    db = get_firestore_client()
    if not db:
        logging.error("Firestore client not available.")
        return False
    
    try:
        # Check if attendance is already recorded in Firestore
        attendance_ref = db.collection('attendance').document(today)
        attendance_doc = attendance_ref.get()
        
        if attendance_doc.exists:
            # Get the current list of attendees for today
            attendance_data = attendance_doc.to_dict()
            student_records = attendance_data.get('students', [])
            
            # Check if this student is already marked for today
            for record in student_records:
                if record.get('name') == name:
                    logging.info(f"Attendance already recorded in Firestore for {name} on {today}")
                    # Update in-memory cache
                    attendance_today[name] = today
                    return False
            
            # Student not found in today's records, add them
            student_records.append({
                'roll_no': roll_no,
                'name': name,
                'course': course,
                'semester': semester,
                'timestamp': datetime.now().strftime("%H:%M:%S")
            })
            
            # Update Firestore document
            attendance_ref.update({
                'students': student_records
            })
        else:
            # No attendance document for today, create a new one
            attendance_ref.set({
                'date': today,
                'students': [{
                    'roll_no': roll_no,
                    'name': name,
                    'course': course,
                    'semester': semester,
                    'timestamp': datetime.now().strftime("%H:%M:%S")
                }]
            })
        
        # Update in-memory cache
        attendance_today[name] = today
        logging.info(f"Attendance marked for {name} (Roll No: {roll_no}) on {today}")
        return True
        
    except Exception as e:
        logging.error(f"Error updating attendance in Firebase: {e}")
        return False

def get_attendance_by_date(date=None):
    """
    Get attendance records for a specific date.
    
    Args:
        date: datetime object representing the date to fetch attendance for.
              If None, today's date is used.
    
    Returns:
        List of attendance records for the specified date.
    """
    try:
        db = get_firestore_client()
        if not db:
            logging.error("Firestore client not available.")
            return []
            
        attendance_ref = db.collection('attendance')
        
        if date is None:
            date = datetime.now()
        
        # Format date as string (DD-MM-YYYY) to match our storage format
        date_str = date.strftime('%d-%m-%Y')
        
        # Get the document for the specific date
        doc = attendance_ref.document(date_str).get()
        
        # Check if document exists
        if doc.exists:
            data = doc.to_dict()
            # Add the document ID (date) as a field in the result
            data['id'] = doc.id
            return [data]  # Return as a list for consistency
        else:
            logging.info(f"No attendance record found for date: {date_str}")
            return []
    
    except Exception as e:
        logging.error(f"Error getting attendance by date: {e}")
        return []

def get_attendance_by_student(student_name):
    """
    Get all attendance records for a specific student.
    
    Args:
        student_name: Name of the student to fetch attendance for.
    
    Returns:
        List of attendance records for the specified student.
    """
    try:
        db = get_firestore_client()
        if not db:
            logging.error("Firestore client not available.")
            return []
            
        attendance_ref = db.collection('attendance')
        
        # Get all documents in the attendance collection
        docs = attendance_ref.stream()
        
        # Filter documents that contain the student
        attendance_list = []
        for doc in docs:
            data = doc.to_dict()
            student_records = data.get('students', [])
            
            # Check if any student in the record matches the name
            matching_students = [s for s in student_records if s.get('name', '').lower() == student_name.lower()]
            
            if matching_students:
                # Add the document ID (date) as a field in the result
                record = {
                    'date': doc.id,
                    'students': matching_students
                }
                attendance_list.append(record)
        
        return attendance_list
    
    except Exception as e:
        logging.error(f"Error getting attendance by student: {e}")
        return []
    
def get_user_by_roll_number(roll_number):
    """
    Get user profile information by roll number.
    
    Args:
        roll_number (str): Roll number to search for
    
    Returns:
        dict: User profile data if found, None otherwise
    """
    db = get_firestore_client()
    if not db:
        logging.error("Firestore client not available.")
        return None

    try:
        # Query the user_encodings collection for the roll number
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            
            query = db.collection('user_encodings').where("roll_number", "==", roll_number)
            docs = list(query.stream())
            
            if not docs:
                logging.info(f"No user found with roll number: {roll_number}")
                return None
            
            if len(docs) > 1:
                logging.warning(f"Multiple users found with roll number: {roll_number}")
            
            # Return the first match
            doc = docs[0]
            user_data = doc.to_dict()
            user_data['name'] = doc.id  # Add the document ID as name
            
            return user_data
            
    except Exception as e:
        logging.error(f"Error searching for user by roll number: {e}")
        return None

def update_user_profile(name, course=None, semester=None, roll_number=None):
    """
    Update user profile information in Firestore.
    
    Args:
        name (str): User's name (document ID)
        course (str, optional): New course
        semester (str, optional): New semester
        roll_number (str, optional): New roll number
    
    Returns:
        bool: True if update successful, False otherwise
    """
    db = get_firestore_client()
    if not db:
        logging.error("Firestore client not available.")
        return False

    try:
        # Check if the user exists
        user_ref = db.collection('user_encodings').document(name)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            logging.error(f"User {name} not found in database.")
            return False
        
        # Prepare update data
        update_data = {}
        if course is not None:
            update_data['course'] = course
        if semester is not None:
            update_data['semester'] = semester
        if roll_number is not None:
            # Check if the new roll number already exists for another user
            if check_roll_number_exists(roll_number, exclude_name=name):
                logging.error(f"Roll number {roll_number} already exists for another user.")
                return False
            update_data['roll_number'] = roll_number
        
        if not update_data:
            logging.warning("No data provided for update.")
            return False
        
        # Update the document
        user_ref.update(update_data)
        logging.info(f"Profile updated successfully for {name}")
        return True
        
    except Exception as e:
        logging.error(f"Error updating user profile: {e}")
        return False

def check_roll_number_exists(roll_number, exclude_name=None):
    """
    Check if a roll number already exists in the database.
    
    Args:
        roll_number (str): Roll number to check
        exclude_name (str, optional): Name to exclude from the check
    
    Returns:
        bool: True if roll number exists, False otherwise
    """
    db = get_firestore_client()
    if not db:
        logging.error("Firestore client not available.")
        return False

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            
            query = db.collection('user_encodings').where("roll_number", "==", roll_number)
            docs = list(query.stream())
            
            for doc in docs:
                if exclude_name and doc.id == exclude_name:
                    continue
                return True
            
            return False
            
    except Exception as e:
        logging.error(f"Error checking roll number existence: {e}")
        return False

def get_all_courses_and_semesters():
    """
    Get all unique courses and semesters from the database.
    
    Returns:
        dict: Dictionary with 'courses' and 'semesters' lists
    """
    db = get_firestore_client()
    if not db:
        logging.error("Firestore client not available.")
        return {'courses': [], 'semesters': []}

    try:
        courses = set()
        semesters = set()
        
        # Get from user_encodings collection
        user_ref = db.collection('user_encodings')
        users = user_ref.stream()
        
        for user in users:
            user_data = user.to_dict()
            if 'course' in user_data and user_data['course']:
                courses.add(user_data['course'])
            if 'semester' in user_data and user_data['semester']:
                semesters.add(user_data['semester'])
        
        return {
            'courses': sorted(list(courses)),
            'semesters': sorted(list(semesters))
        }
        
    except Exception as e:
        logging.error(f"Error getting courses and semesters: {e}")
        return {'courses': [], 'semesters': []}
    
def get_students_with_attendance_status(date=None, course=None, semester=None):
    """
    Get all students with their attendance status (Present/Absent) for a specific date.
    
    Args:
        date: datetime object representing the date to check attendance for.
              If None, today's date is used.
        course: Filter by specific course (optional)
        semester: Filter by specific semester (optional)
    
    Returns:
        List of student records with attendance status
    """
    db = get_firestore_client()
    if not db:
        logging.error("Firestore client not available.")
        return []

    try:
        if date is None:
            date = datetime.now()
        
        date_str = date.strftime('%d-%m-%Y')
        
        # Get all registered students from user_encodings
        user_ref = db.collection('user_encodings')
        users = user_ref.stream()
        
        all_students = []
        for user in users:
            user_data = user.to_dict()
            student_record = {
                'name': user.id,
                'course': user_data.get('course', ''),
                'semester': user_data.get('semester', ''),
                'roll_number': user_data.get('roll_number', ''),
                'attendance_status': 'Absent',  # Default to Absent
                'date': date_str
            }
            all_students.append(student_record)
        
        # Get attendance records for the specific date
        attendance_ref = db.collection('attendance').document(date_str)
        attendance_doc = attendance_ref.get()
        
        if attendance_doc.exists:
            attendance_data = attendance_doc.to_dict()
            present_students = attendance_data.get('students', [])
            
            # Update attendance status for present students
            for student in all_students:
                for present_student in present_students:
                    if student['name'] == present_student.get('name'):
                        student['attendance_status'] = 'Present'
                        student['timestamp'] = present_student.get('timestamp', '')
                        break
        
        # Apply filters if provided
        filtered_students = []
        for student in all_students:
            if course and student.get('course') != course:
                continue
            if semester and student.get('semester') != semester:
                continue
            filtered_students.append(student)
        
        return filtered_students
        
    except Exception as e:
        logging.error(f"Error getting students with attendance status: {e}")
        return []
    
def get_attendance_by_date_range(start_date, end_date):
    """
    Get attendance records for a date range.
    
    Args:
        start_date: datetime object representing the start date
        end_date: datetime object representing the end date
    
    Returns:
        List of attendance records for the specified date range.
    """
    try:
        db = get_firestore_client()
        if not db:
            logging.error("Firestore client not available.")
            return []
            
        attendance_ref = db.collection('attendance')
        attendance_list = []
        
        # Generate all dates in the range
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime('%d-%m-%Y')
            
            # Get the document for the specific date
            doc = attendance_ref.document(date_str).get()
            
            if doc.exists:
                data = doc.to_dict()
                data['id'] = doc.id
                attendance_list.append(data)
            
            # Move to next day
            current_date = current_date + timedelta(days=1)
        
        return attendance_list
    
    except Exception as e:
        logging.error(f"Error getting attendance by date range: {e}")
        return []

def get_attendance_statistics_by_student(student_name):
    """
    Get detailed attendance statistics for a specific student.
    
    Args:
        student_name: Name of the student
    
    Returns:
        dict: Dictionary containing attendance statistics
    """
    try:
        db = get_firestore_client()
        if not db:
            logging.error("Firestore client not available.")
            return None
            
        # Get all attendance records for the student
        attendance_ref = db.collection('attendance')
        docs = attendance_ref.stream()
        
        total_days = 0
        present_days = 0
        attendance_dates = []
        
        for doc in docs:
            data = doc.to_dict()
            students = data.get('students', [])
            
            # Check if student was present on this date
            for student in students:
                if student.get('name', '').lower() == student_name.lower():
                    present_days += 1
                    attendance_dates.append(doc.id)
                    break
            
            total_days += 1
        
        if total_days == 0:
            return None
            
        attendance_rate = present_days / total_days
        
        return {
            'student_name': student_name,
            'total_days': total_days,
            'present_days': present_days,
            'absent_days': total_days - present_days,
            'attendance_rate': round(attendance_rate, 3),
            'attendance_dates': sorted(attendance_dates)
        }
        
    except Exception as e:
        logging.error(f"Error getting attendance statistics: {e}")
        return None

def get_attendance_by_student_with_date_range(student_name, start_date, end_date):
    """
    Get attendance records for a specific student within a date range.
    
    Args:
        student_name: Name of the student to fetch attendance for
        start_date: datetime object representing the start date
        end_date: datetime object representing the end date
    
    Returns:
        List of attendance records for the specified student within the date range.
    """
    try:
        db = get_firestore_client()
        if not db:
            logging.error("Firestore client not available.")
            return []
            
        attendance_ref = db.collection('attendance')
        attendance_list = []
        
        # Generate all dates in the range
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime('%d-%m-%Y')
            
            # Get the document for the specific date
            doc = attendance_ref.document(date_str).get()
            
            if doc.exists:
                data = doc.to_dict()
                students = data.get('students', [])
                
                # Check if any student in the record matches the name
                matching_students = [s for s in students if s.get('name', '').lower() == student_name.lower()]
                
                if matching_students:
                    record = {
                        'date': doc.id,
                        'students': matching_students
                    }
                    attendance_list.append(record)
            
            # Move to next day
            current_date = current_date + timedelta(days=1)
        
        return attendance_list
    
    except Exception as e:
        logging.error(f"Error getting attendance by student with date range: {e}")
        return []
    
def get_all_attendance_data_for_ml():
    """
    Get all attendance data formatted for machine learning training.
    
    Returns:
        List of dictionaries containing attendance records with student info
    """
    try:
        db = get_firestore_client()
        if not db:
            logging.error("Firestore client not available.")
            return []
        
        # Get all students first
        user_ref = db.collection('user_encodings')
        users = user_ref.stream()
        
        students_info = {}
        for user in users:
            user_data = user.to_dict()
            students_info[user.id] = {
                'course': user_data.get('course', ''),
                'semester': user_data.get('semester', ''),
                'roll_number': user_data.get('roll_number', '')
            }
        
        # Get all attendance records
        attendance_ref = db.collection('attendance')
        attendance_docs = attendance_ref.stream()
        
        all_records = []
        
        for doc in attendance_docs:
            date_str = doc.id  # Date in DD-MM-YYYY format
            try:
                date_obj = datetime.strptime(date_str, '%d-%m-%Y')
            except:
                continue
                
            attendance_data = doc.to_dict()
            present_students = attendance_data.get('students', [])
            present_names = [s.get('name') for s in present_students if s.get('name')]
            
            # Create records for all students (present and absent)
            for student_name, student_info in students_info.items():
                is_present = student_name in present_names
                
                record = {
                    'name': student_name,
                    'course': student_info['course'],
                    'semester': student_info['semester'],
                    'roll_number': student_info['roll_number'],
                    'date': date_obj,
                    'date_str': date_str,
                    'is_present': 1 if is_present else 0
                }
                all_records.append(record)
        
        logging.info(f"Retrieved {len(all_records)} attendance records for ML training")
        return all_records
        
    except Exception as e:
        logging.error(f"Error getting attendance data for ML: {e}")
        return []