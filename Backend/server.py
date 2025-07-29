from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import face_recognition
from datetime import datetime, timedelta
from firebase_integration import (
    get_attendance_by_date, get_attendance_by_date_range, get_attendance_by_student, get_attendance_by_student_with_date_range, get_firestore_client, 
    load_known_faces_from_firestore, get_user_by_roll_number, update_user_profile, get_all_courses_and_semesters, get_students_with_attendance_status
)
# Import attendance prediction functions
from attendance_prediction import (
    predict_student_attendance, 
    train_prediction_model, 
    get_prediction_model_stats,
    AttendancePredictionModel
)
import logging

app = Flask(__name__)
CORS(app)  # Allow frontend (React) to communicate with backend (Flask)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 🟢 Route to trigger main.py and register.py from React
@app.route('/run-script', methods=['POST'])
def run_script():
    data = request.get_json()
    script_name = data.get("script")

    try:
        subprocess.run(["python", script_name], check=True)
        return jsonify({"message": f"{script_name} executed successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 🟢 Face Recognition API
@app.route('/recognize', methods=['POST'])
def recognize_face():
    if 'image' not in request.files:
        return jsonify({"message": "No image provided"}), 400
    
    file = request.files['image']
    image = face_recognition.load_image_file(file)
    encodings = face_recognition.face_encodings(image)

    if not encodings:
        return jsonify({"message": "No face detected"}), 400

    known_encodings, known_names, _, _ = load_known_faces_from_firestore()

    matches = face_recognition.compare_faces(known_encodings, encodings[0])
    if True in matches:
        match_index = matches.index(True)
        return jsonify({"name": known_names[match_index], "status": "recognized"})
    else:
        return jsonify({"name": "Unknown", "status": "unrecognized"})

@app.route('/get-attendance-by-date', methods=['GET'])
def attendance_by_date():
    try:
        date_str = request.args.get('date')
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        course = request.args.get('course')
        semester = request.args.get('semester')
        
        # Handle date range or single date
        if start_date_str and end_date_str:
            # Date range mode
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
            attendance_data = get_attendance_by_date_range(start_date, end_date)
        elif date_str:
            # Single date mode
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            attendance_data = get_attendance_by_date(date_obj)
        else:
            # Default to today
            date_obj = datetime.now()
            attendance_data = get_attendance_by_date(date_obj)
        
        # Process data for the response
        processed_data = []
        for record in attendance_data:
            students = record.get('students', [])
            
            # Filter by course and semester if provided
            if course or semester:
                filtered_students = []
                for student in students:
                    if (course and semester and 
                        student.get('course') == course and 
                        student.get('semester') == semester):
                        filtered_students.append(student)
                    elif course and not semester and student.get('course') == course:
                        filtered_students.append(student)
                    elif semester and not course and student.get('semester') == semester:
                        filtered_students.append(student)
                
                if filtered_students:
                    processed_record = record.copy()
                    processed_record['students'] = filtered_students
                    processed_data.append(processed_record)
            else:
                processed_data.append(record)
        
        return jsonify({
            'success': True,
            'attendance': processed_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error retrieving attendance: {str(e)}"
        })

@app.route('/get-attendance-by-student', methods=['GET'])
def attendance_by_student():
    try:
        student_name = request.args.get('student_name')
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        course = request.args.get('course')
        semester = request.args.get('semester')
        
        if not student_name:
            return jsonify({
                'success': False,
                'message': "Student name is required"
            })
        
        # Handle date range filtering
        if start_date_str and end_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
            attendance_data = get_attendance_by_student_with_date_range(student_name, start_date, end_date)
        else:
            # Get all attendance data for student
            attendance_data = get_attendance_by_student(student_name)
        
        # Process data for the response
        processed_data = []
        for record in attendance_data:
            students = record.get('students', [])
            
            # Filter by course and semester if provided
            if course or semester:
                filtered_students = []
                for student in students:
                    if (course and semester and 
                        student.get('course') == course and 
                        student.get('semester') == semester):
                        filtered_students.append(student)
                    elif course and not semester and student.get('course') == course:
                        filtered_students.append(student)
                    elif semester and not course and student.get('semester') == semester:
                        filtered_students.append(student)
                
                if filtered_students:
                    processed_record = record.copy()
                    processed_record['students'] = filtered_students
                    processed_data.append(processed_record)
            else:
                processed_data.append(record)
        
        return jsonify({
            'success': True,
            'attendance': processed_data
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error retrieving attendance: {str(e)}"
        })

@app.route('/get-courses-semesters', methods=['GET'])
def get_courses_semesters():
    try:
        db = get_firestore_client()
        
        # Get unique courses and semesters from user_encodings collection
        user_ref = db.collection('user_encodings')
        users = user_ref.stream()
        
        courses = set()
        semesters = set()
        
        for user in users:
            user_data = user.to_dict()
            if 'course' in user_data:
                courses.add(user_data['course'])
            if 'semester' in user_data:
                semesters.add(user_data['semester'])
        
        # Also check attendance collection for additional courses/semesters
        attendance_ref = db.collection('attendance')
        attendance_docs = attendance_ref.stream()
        
        for doc in attendance_docs:
            data = doc.to_dict()
            students = data.get('students', [])
            for student in students:
                if 'course' in student:
                    courses.add(student['course'])
                if 'semester' in student:
                    semesters.add(student['semester'])
        
        return jsonify({
            'success': True,
            'courses': list(courses),
            'semesters': list(semesters)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error retrieving courses and semesters: {str(e)}"
        })

@app.route('/anti-spoof-status', methods=['GET'])
def get_anti_spoof_status():
    """Get anti-spoofing configuration status"""
    try:
        from config import ANTI_SPOOF_ENABLED
        return jsonify({
            'success': True,
            'anti_spoof_enabled': ANTI_SPOOF_ENABLED,
            'message': 'Anti-spoofing is ' + ('enabled' if ANTI_SPOOF_ENABLED else 'disabled')
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error checking anti-spoof status: {str(e)}"
        })

@app.route('/search-user-by-roll', methods=['GET'])
def search_user_by_roll():
    """Search for a user by roll number"""
    try:
        roll_number = request.args.get('roll_number')
        
        if not roll_number:
            return jsonify({
                'success': False,
                'message': "Roll number is required"
            }), 400
        
        # Search for user
        user_data = get_user_by_roll_number(roll_number)
        
        if user_data:
            # Remove encoding data from response for security
            response_data = {
                'name': user_data.get('name'),
                'course': user_data.get('course'),
                'semester': user_data.get('semester'),
                'roll_number': user_data.get('roll_number')
            }
            
            return jsonify({
                'success': True,
                'user': response_data
            })
        else:
            return jsonify({
                'success': False,
                'message': f"No user found with roll number: {roll_number}"
            }), 404
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error searching for user: {str(e)}"
        }), 500

@app.route('/update-user-profile', methods=['PUT'])
def update_user_profile_route():
    """Update user profile information"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': "No data provided"
            }), 400
        
        name = data.get('name')
        course = data.get('course')
        semester = data.get('semester')
        roll_number = data.get('roll_number')
        
        if not name:
            return jsonify({
                'success': False,
                'message': "User name is required"
            }), 400
        
        # Update the profile
        success = update_user_profile(name, course, semester, roll_number)
        
        if success:
            return jsonify({
                'success': True,
                'message': "Profile updated successfully"
            })
        else:
            return jsonify({
                'success': False,
                'message': "Failed to update profile. Please check if the roll number already exists."
            }), 400
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error updating profile: {str(e)}"
        }), 500

@app.route('/get-courses-semesters-options', methods=['GET'])
def get_courses_semesters_options():
    """Get all available courses and semesters for dropdown options"""
    try:
        options = get_all_courses_and_semesters()
        
        return jsonify({
            'success': True,
            'courses': options['courses'],
            'semesters': options['semesters']
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error retrieving options: {str(e)}"
        }), 500

@app.route('/get-students-with-attendance', methods=['GET'])
def get_students_with_attendance():
    """Get all students with their attendance status for a specific date"""
    try:
        date_str = request.args.get('date')
        course = request.args.get('course')
        semester = request.args.get('semester')
        
        # Parse date or use today
        if date_str:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
        else:
            date_obj = datetime.now()
        
        # Get students with attendance status
        students_data = get_students_with_attendance_status(date_obj, course, semester)
        
        return jsonify({
            'success': True,
            'students': students_data,
            'date': date_obj.strftime('%d-%m-%Y')
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error retrieving students with attendance: {str(e)}"
        }), 500

@app.route('/get-student-attendance-with-status', methods=['GET'])
def get_student_attendance_with_status():
    """Get student attendance with Present/Absent status across date range"""
    try:
        student_name = request.args.get('student_name')
        roll_number = request.args.get('roll_number')
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        course = request.args.get('course')
        semester = request.args.get('semester')
        
        if not student_name and not roll_number:
            return jsonify({
                'success': False,
                'message': "Student name or roll number is required"
            }), 400
        
        # If roll number is provided, get the student name first
        if roll_number and not student_name:
            user_data = get_user_by_roll_number(roll_number)
            if not user_data or not user_data.get('name'):
                return jsonify({
                    'success': False,
                    'message': f"No student found with roll number: {roll_number}"
                }), 404
            student_name = user_data.get('name')
        
        # Parse dates
        date_str = request.args.get('date')  # Add this line
        if start_date_str and end_date_str:
            start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
            end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        elif date_str:
            # Single date mode
            start_date = datetime.strptime(date_str, '%Y-%m-%d')
            end_date = start_date
        else:
            # Default to last 30 days if no date range provided
            end_date = datetime.now()
            start_date = end_date - timedelta(days=30)
        
        all_records = []
        current_date = start_date
        
        while current_date <= end_date:
            # Get all students with attendance status for each date
            students_data = get_students_with_attendance_status(current_date, course, semester)
            
            # Filter for the specific student
            for student in students_data:
                if student_name and student['name'].lower() == student_name.lower():
                    student['date'] = current_date.strftime('%d-%m-%Y')
                    all_records.append(student)
                    break
            
            current_date += timedelta(days=1)
        
        return jsonify({
            'success': True,
            'attendance': all_records
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error retrieving student attendance: {str(e)}"
        }), 500

# 🔵 ATTENDANCE PREDICTION API ENDPOINTS

@app.route('/predict-attendance', methods=['POST'])
def predict_attendance():
    """Predict attendance for a specific student on a target date"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': "No data provided"
            }), 400
        
        student_name = data.get('student_name')
        roll_number = data.get('roll_number')
        target_date = data.get('target_date')  # Expected format: YYYY-MM-DD
        course = data.get('course')
        semester = data.get('semester')
        
        # Validate required fields
        if not target_date:
            return jsonify({
                'success': False,
                'message': "Target date is required (format: YYYY-MM-DD)"
            }), 400
        
        if not student_name and not roll_number:
            return jsonify({
                'success': False,
                'message': "Either student name or roll number is required"
            }), 400
        
        # If roll number is provided, get the student name
        if roll_number and not student_name:
            user_data = get_user_by_roll_number(roll_number)
            if not user_data or not user_data.get('name'):
                return jsonify({
                    'success': False,
                    'message': f"No student found with roll number: {roll_number}"
                }), 404
            student_name = user_data.get('name')
            course = course or user_data.get('course')
            semester = semester or user_data.get('semester')
        
        # Validate date format
        try:
            datetime.strptime(target_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({
                'success': False,
                'message': "Invalid date format. Use YYYY-MM-DD"
            }), 400
        
        # Make prediction
        result = predict_student_attendance(student_name, target_date, course, semester)
        
        if result['success']:
            return jsonify({
                'success': True,
                'prediction': result['prediction']
            })
        else:
            return jsonify({
                'success': False,
                'message': result['message']
            }), 500
    
    except Exception as e:
        logging.error(f"Error in predict_attendance endpoint: {e}")
        return jsonify({
            'success': False,
            'message': f"Error making prediction: {str(e)}"
        }), 500

@app.route('/predict-attendance-batch', methods=['POST'])
def predict_attendance_batch():
    """Predict attendance for multiple students on a target date"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': "No data provided"
            }), 400
        
        students = data.get('students', [])  # List of student names or roll numbers
        target_date = data.get('target_date')  # Expected format: YYYY-MM-DD
        course = data.get('course')
        semester = data.get('semester')
        
        # Validate required fields
        if not target_date:
            return jsonify({
                'success': False,
                'message': "Target date is required (format: YYYY-MM-DD)"
            }), 400
        
        if not students:
            return jsonify({
                'success': False,
                'message': "At least one student is required"
            }), 400
        
        # Validate date format
        try:
            datetime.strptime(target_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({
                'success': False,
                'message': "Invalid date format. Use YYYY-MM-DD"
            }), 400
        
        predictions = []
        errors = []
        
        for student_identifier in students:
            try:
                student_name = student_identifier
                student_course = course
                student_semester = semester
                
                # If it looks like a roll number, resolve to student name
                if isinstance(student_identifier, str) and student_identifier.isdigit():
                    user_data = get_user_by_roll_number(student_identifier)
                    if user_data and user_data.get('name'):
                        student_name = user_data.get('name')
                        student_course = student_course or user_data.get('course')
                        student_semester = student_semester or user_data.get('semester')
                    else:
                        errors.append(f"No student found with roll number: {student_identifier}")
                        continue
                
                # Make prediction
                result = predict_student_attendance(student_name, target_date, student_course, student_semester)
                
                if result['success']:
                    predictions.append(result['prediction'])
                else:
                    errors.append(f"Failed to predict for {student_name}: {result['message']}")
            
            except Exception as e:
                errors.append(f"Error predicting for {student_identifier}: {str(e)}")
        
        return jsonify({
            'success': len(predictions) > 0,
            'predictions': predictions,
            'errors': errors,
            'total_requested': len(students),
            'successful_predictions': len(predictions)
        })
    
    except Exception as e:
        logging.error(f"Error in predict_attendance_batch endpoint: {e}")
        return jsonify({
            'success': False,
            'message': f"Error making batch predictions: {str(e)}"
        }), 500

@app.route('/train-prediction-model', methods=['POST'])
def train_model():
    """Train the attendance prediction model"""
    try:
        # Train the model
        result = train_prediction_model()
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message'],
                'statistics': result.get('statistics')
            })
        else:
            return jsonify({
                'success': False,
                'message': result['message']
            }), 500
    
    except Exception as e:
        logging.error(f"Error in train_model endpoint: {e}")
        return jsonify({
            'success': False,
            'message': f"Error training model: {str(e)}"
        }), 500

@app.route('/prediction-model-stats', methods=['GET'])
def get_model_stats():
    """Get statistics about the trained prediction model"""
    try:
        result = get_prediction_model_stats()
        
        if result['success']:
            return jsonify({
                'success': True,
                'statistics': result['statistics']
            })
        else:
            return jsonify({
                'success': False,
                'message': result['message']
            }), 404
    
    except Exception as e:
        logging.error(f"Error in get_model_stats endpoint: {e}")
        return jsonify({
            'success': False,
            'message': f"Error retrieving model statistics: {str(e)}"
        }), 500

@app.route('/predict-attendance-for-date-range', methods=['POST'])
def predict_attendance_for_date_range():
    """Predict attendance for a student across multiple dates"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': "No data provided"
            }), 400
        
        student_name = data.get('student_name')
        roll_number = data.get('roll_number')
        start_date = data.get('start_date')  # Expected format: YYYY-MM-DD
        end_date = data.get('end_date')      # Expected format: YYYY-MM-DD
        course = data.get('course')
        semester = data.get('semester')
        
        # Validate required fields
        if not start_date or not end_date:
            return jsonify({
                'success': False,
                'message': "Both start_date and end_date are required (format: YYYY-MM-DD)"
            }), 400
        
        if not student_name and not roll_number:
            return jsonify({
                'success': False,
                'message': "Either student name or roll number is required"
            }), 400
        
        # If roll number is provided, get the student name
        if roll_number and not student_name:
            user_data = get_user_by_roll_number(roll_number)
            if not user_data or not user_data.get('name'):
                return jsonify({
                    'success': False,
                    'message': f"No student found with roll number: {roll_number}"
                }), 404
            student_name = user_data.get('name')
            course = course or user_data.get('course')
            semester = semester or user_data.get('semester')
        
        # Validate date formats and range
        try:
            start_date_obj = datetime.strptime(start_date, '%Y-%m-%d')
            end_date_obj = datetime.strptime(end_date, '%Y-%m-%d')
            
            if start_date_obj > end_date_obj:
                return jsonify({
                    'success': False,
                    'message': "Start date must be before or equal to end date"
                }), 400
            
            # Limit the range to prevent excessive requests
            date_diff = (end_date_obj - start_date_obj).days
            if date_diff > 365:  # Limit to 1 year
                return jsonify({
                    'success': False,
                    'message': "Date range cannot exceed 365 days"
                }), 400
                
        except ValueError:
            return jsonify({
                'success': False,
                'message': "Invalid date format. Use YYYY-MM-DD"
            }), 400
        
        predictions = []
        errors = []
        current_date = start_date_obj
        
        while current_date <= end_date_obj:
            try:
                # Make prediction for each date
                target_date_str = current_date.strftime('%Y-%m-%d')
                result = predict_student_attendance(student_name, target_date_str, course, semester)
                
                if result['success']:
                    predictions.append(result['prediction'])
                else:
                    errors.append(f"Failed to predict for {target_date_str}: {result['message']}")
            
            except Exception as e:
                errors.append(f"Error predicting for {current_date.strftime('%Y-%m-%d')}: {str(e)}")
            
            current_date += timedelta(days=1)
        
        return jsonify({
            'success': len(predictions) > 0,
            'predictions': predictions,
            'errors': errors,
            'date_range': f"{start_date} to {end_date}",
            'total_dates': date_diff + 1,
            'successful_predictions': len(predictions)
        })
    
    except Exception as e:
        logging.error(f"Error in predict_attendance_for_date_range endpoint: {e}")
        return jsonify({
            'success': False,
            'message': f"Error making date range predictions: {str(e)}"
        }), 500

@app.route('/get-all-students-predictions', methods=['POST'])
def get_all_students_predictions():
    """Get attendance predictions for all students on a specific date"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': "No data provided"
            }), 400
        
        target_date = data.get('target_date')  # Expected format: YYYY-MM-DD
        course = data.get('course')
        semester = data.get('semester')
        
        # Validate required fields
        if not target_date:
            return jsonify({
                'success': False,
                'message': "Target date is required (format: YYYY-MM-DD)"
            }), 400
        
        # Validate date format
        try:
            datetime.strptime(target_date, '%Y-%m-%d')
        except ValueError:
            return jsonify({
                'success': False,
                'message': "Invalid date format. Use YYYY-MM-DD"
            }), 400
        
        # Get all registered students
        db = get_firestore_client()
        if not db:
            return jsonify({
                'success': False,
                'message': "Database connection failed"
            }), 500
        
        user_ref = db.collection('user_encodings')
        users = user_ref.stream()
        
        predictions = []
        errors = []
        
        for user in users:
            try:
                user_data = user.to_dict()
                student_name = user.id
                student_course = user_data.get('course', '')
                student_semester = user_data.get('semester', '')
                
                # Apply course/semester filter if provided
                if course and student_course != course:
                    continue
                if semester and student_semester != semester:
                    continue
                
                # Make prediction
                result = predict_student_attendance(student_name, target_date, student_course, student_semester)
                
                if result['success']:
                    # Add additional student info to the prediction
                    prediction_data = result['prediction'].copy()
                    prediction_data['course'] = student_course
                    prediction_data['semester'] = student_semester
                    prediction_data['roll_number'] = user_data.get('roll_number', '')
                    predictions.append(prediction_data)
                else:
                    errors.append(f"Failed to predict for {student_name}: {result['message']}")
            
            except Exception as e:
                errors.append(f"Error predicting for student {user.id}: {str(e)}")
        
        # Sort predictions by confidence (highest first)
        predictions.sort(key=lambda x: x.get('confidence', 0), reverse=True)
        
        return jsonify({
            'success': len(predictions) > 0,
            'predictions': predictions,
            'errors': errors,
            'target_date': target_date,
            'total_students_processed': len(predictions) + len(errors),
            'successful_predictions': len(predictions)
        })
    
    except Exception as e:
        logging.error(f"Error in get_all_students_predictions endpoint: {e}")
        return jsonify({
            'success': False,
            'message': f"Error getting predictions for all students: {str(e)}"
        }), 500
        
# Add this endpoint to your server.py file

@app.route('/get-all-students', methods=['GET'])
def get_all_students():
    """Get list of all registered students"""
    try:
        db = get_firestore_client()
        if not db:
            return jsonify({
                'success': False,
                'message': "Database connection failed"
            }), 500
        
        # Get all students from user_encodings collection
        user_ref = db.collection('user_encodings')
        users = user_ref.stream()
        
        students = []
        for user in users:
            user_data = user.to_dict()
            student_info = {
                'name': user.id,  # Document ID is the student name
                'roll_number': user_data.get('roll_number', ''),
                'course': user_data.get('course', ''),
                'semester': user_data.get('semester', '')
            }
            students.append(student_info)
        
        # Sort students by name
        students.sort(key=lambda x: x['name'].lower())
        
        # Extract just the names for the dropdown
        student_names = [student['name'] for student in students]
        
        return jsonify({
            'success': True,
            'students': student_names,
            'student_details': students  # Include full details if needed
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f"Error retrieving students: {str(e)}"
        }), 500        

if __name__ == '__main__':
    app.run(debug=True, port=5000)
