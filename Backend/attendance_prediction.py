# attendance_prediction.py

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report
import logging
import warnings
from firebase_integration import get_firestore_client
import pickle
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class AttendancePredictionModel:
    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            random_state=42
        )
        self.label_encoders = {}
        self.is_trained = False
        self.model_path = "attendance_prediction_model.pkl"
        self.encoders_path = "label_encoders.pkl"
        
    def is_college_closed(self, date):
        """Check if college is closed on the given date"""
        # Saturday = 5, Sunday = 6
        return date.weekday() in [5, 6]
        
    def load_attendance_data_from_firebase(self):
        """Load attendance data from Firebase and prepare it for training"""
        try:
            db = get_firestore_client()
            if not db:
                logging.error("Firebase client not available")
                return None
                
            # Get all registered students
            user_ref = db.collection('user_encodings')
            users = user_ref.stream()
            
            students_data = {}
            for user in users:
                user_data = user.to_dict()
                students_data[user.id] = {
                    'name': user.id,
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
                
                # Skip weekend records as college is closed
                if self.is_college_closed(date_obj):
                    logging.info(f"Skipping weekend date: {date_str}")
                    continue
                    
                attendance_data = doc.to_dict()
                present_students = attendance_data.get('students', [])
                present_names = [s.get('name') for s in present_students]
                
                # Create records for all students (present and absent) only for weekdays
                for student_name, student_info in students_data.items():
                    is_present = student_name in present_names
                    
                    record = {
                        'name': student_name,
                        'course': student_info['course'],
                        'semester': student_info['semester'],
                        'roll_number': student_info['roll_number'],
                        'date': date_obj,
                        'day_of_week': date_obj.weekday(),  # 0=Monday, 6=Sunday
                        'day_of_month': date_obj.day,
                        'month': date_obj.month,
                        'is_weekend': False,  # All records are weekdays now
                        'is_present': 1 if is_present else 0
                    }
                    all_records.append(record)
            
            if not all_records:
                logging.warning("No attendance records found")
                return None
                
            df = pd.DataFrame(all_records)
            logging.info(f"Loaded {len(df)} attendance records from Firebase (weekdays only)")
            return df
            
        except Exception as e:
            logging.error(f"Error loading attendance data: {e}")
            return None
    
    def calculate_attendance_features(self, df):
        """Calculate additional features based on historical attendance patterns"""
        try:
            # Sort by student and date
            df = df.sort_values(['name', 'date'])
            
            # Calculate rolling statistics for each student
            features_list = []
            
            for student_name in df['name'].unique():
                student_data = df[df['name'] == student_name].copy()
                student_data = student_data.sort_values('date')
                
                # Calculate rolling features (only considering weekdays)
                student_data['attendance_rate_7days'] = student_data['is_present'].rolling(window=7, min_periods=1).mean()
                student_data['attendance_rate_14days'] = student_data['is_present'].rolling(window=14, min_periods=1).mean()
                student_data['attendance_rate_30days'] = student_data['is_present'].rolling(window=30, min_periods=1).mean()
                
                # Working days since last attendance (excluding weekends)
                last_present_date = None
                days_since_last_attendance = []
                
                for _, row in student_data.iterrows():
                    if last_present_date is None:
                        days_since_last_attendance.append(0)
                    else:
                        # Calculate working days between dates
                        days_diff = self.calculate_working_days(last_present_date, row['date'])
                        days_since_last_attendance.append(days_diff)
                    
                    if row['is_present'] == 1:
                        last_present_date = row['date']
                
                student_data['days_since_last_attendance'] = days_since_last_attendance
                
                # Consecutive absence streak (only weekdays)
                consecutive_absences = []
                current_streak = 0
                
                for _, row in student_data.iterrows():
                    if row['is_present'] == 0:
                        current_streak += 1
                    else:
                        current_streak = 0
                    consecutive_absences.append(current_streak)
                
                student_data['consecutive_absences'] = consecutive_absences
                
                features_list.append(student_data)
            
            enhanced_df = pd.concat(features_list, ignore_index=True)
            return enhanced_df
            
        except Exception as e:
            logging.error(f"Error calculating attendance features: {e}")
            return df
    
    def calculate_working_days(self, start_date, end_date):
        """Calculate number of working days (excluding weekends) between two dates"""
        if start_date >= end_date:
            return 0
        
        working_days = 0
        current_date = start_date + timedelta(days=1)
        
        while current_date <= end_date:
            if not self.is_college_closed(current_date):
                working_days += 1
            current_date += timedelta(days=1)
        
        return working_days
    
    def prepare_features(self, df):
        """Prepare features for machine learning"""
        try:
            # Create feature matrix
            feature_columns = [
                'day_of_week', 'day_of_month', 'month',
                'attendance_rate_7days', 'attendance_rate_14days', 'attendance_rate_30days',
                'days_since_last_attendance', 'consecutive_absences'
            ]
            # Note: Removed 'is_weekend' since we only train on weekdays
            
            # Encode categorical variables
            categorical_columns = ['course', 'semester']
            
            for col in categorical_columns:
                if col not in self.label_encoders:
                    self.label_encoders[col] = LabelEncoder()
                    df[f'{col}_encoded'] = self.label_encoders[col].fit_transform(df[col].astype(str))
                else:
                    # Handle new categories that weren't in training data
                    known_categories = set(self.label_encoders[col].classes_)
                    df[f'{col}_temp'] = df[col].astype(str)
                    
                    # Replace unknown categories with the most frequent one
                    unknown_mask = ~df[f'{col}_temp'].isin(known_categories)
                    if unknown_mask.any():
                        most_frequent = df[f'{col}_temp'].mode().iloc[0] if not df[f'{col}_temp'].mode().empty else list(known_categories)[0]
                        df.loc[unknown_mask, f'{col}_temp'] = most_frequent
                    
                    df[f'{col}_encoded'] = self.label_encoders[col].transform(df[f'{col}_temp'])
                    df.drop(f'{col}_temp', axis=1, inplace=True)
                
                feature_columns.append(f'{col}_encoded')
            
            # Fill NaN values
            for col in feature_columns:
                if col in df.columns:
                    df[col] = df[col].fillna(0)
            
            X = df[feature_columns].values
            y = df['is_present'].values
            
            return X, y, feature_columns
            
        except Exception as e:
            logging.error(f"Error preparing features: {e}")
            return None, None, None
    
    def train_model(self):
        """Train the attendance prediction model"""
        try:
            # Load data from Firebase
            df = self.load_attendance_data_from_firebase()
            if df is None or len(df) < 10:
                logging.error("Insufficient data for training")
                return False
            
            # Calculate additional features
            df = self.calculate_attendance_features(df)
            
            # Prepare features
            X, y, feature_columns = self.prepare_features(df)
            if X is None:
                return False
            
            # Split data
            if len(X) < 20:  # If we have very little data
                # Use all data for training
                X_train, X_test, y_train, y_test = X, X, y, y
                logging.warning("Using all data for training due to small dataset")
            else:
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y, test_size=0.2, random_state=42, stratify=y
                )
            
            # Train model
            self.model.fit(X_train, y_train)
            
            # Evaluate model
            train_score = self.model.score(X_train, y_train)
            test_score = self.model.score(X_test, y_test)
            
            logging.info(f"Model trained successfully!")
            logging.info(f"Training accuracy: {train_score:.3f}")
            logging.info(f"Testing accuracy: {test_score:.3f}")
            
            # Save model and encoders
            self.save_model()
            
            self.is_trained = True
            self.feature_columns = feature_columns
            
            return True
            
        except Exception as e:
            logging.error(f"Error training model: {e}")
            return False
    
    def save_model(self):
        """Save the trained model and encoders"""
        try:
            with open(self.model_path, 'wb') as f:
                pickle.dump(self.model, f)
            
            with open(self.encoders_path, 'wb') as f:
                pickle.dump(self.label_encoders, f)
                
            logging.info("Model and encoders saved successfully")
            
        except Exception as e:
            logging.error(f"Error saving model: {e}")
    
    def load_model(self):
        """Load the saved model and encoders"""
        try:
            if os.path.exists(self.model_path) and os.path.exists(self.encoders_path):
                with open(self.model_path, 'rb') as f:
                    self.model = pickle.load(f)
                
                with open(self.encoders_path, 'rb') as f:
                    self.label_encoders = pickle.load(f)
                
                self.is_trained = True
                logging.info("Model and encoders loaded successfully")
                return True
            else:
                logging.warning("No saved model found")
                return False
                
        except Exception as e:
            logging.error(f"Error loading model: {e}")
            return False
    
    def predict_attendance(self, student_name, target_date, course=None, semester=None):
        """Predict attendance for a specific student on a target date"""
        try:
            # Check if college is closed on target date
            if self.is_college_closed(target_date):
                return {
                    'student_name': student_name,
                    'prediction_date': target_date.strftime('%d-%m-%Y'),
                    'predicted_attendance': 'College Closed',
                    'confidence': 1.0,
                    'reason': 'College is closed on weekends (Saturday and Sunday)',
                    'attendance_probability': 0.0,
                    'absence_probability': 0.0
                }
            
            if not self.is_trained:
                if not self.load_model():
                    logging.error("Model not trained and cannot be loaded")
                    return None
            
            # Get historical data for the student
            df = self.load_attendance_data_from_firebase()
            if df is None:
                logging.error("Cannot load historical data")
                return None
            
            # Filter for the specific student
            student_data = df[df['name'] == student_name].copy()
            if len(student_data) == 0:
                logging.warning(f"No historical data found for student: {student_name}")
                # Return a default prediction based on overall patterns
                return {
                    'student_name': student_name,
                    'prediction_date': target_date.strftime('%d-%m-%Y'),
                    'predicted_attendance': 'Present',  # Default optimistic prediction
                    'confidence': 0.5,
                    'reason': 'No historical data available - using default prediction',
                    'attendance_probability': 0.7,
                    'absence_probability': 0.3
                }
            
            # Get student info
            student_info = student_data.iloc[-1]  # Get latest record for student info
            
            # Calculate features up to the target date
            enhanced_df = self.calculate_attendance_features(df)
            student_enhanced = enhanced_df[enhanced_df['name'] == student_name].copy()
            
            if len(student_enhanced) == 0:
                return None
            
            # Create a record for the target date
            latest_record = student_enhanced.iloc[-1]
            
            target_record = {
                'name': student_name,
                'course': course or latest_record['course'],
                'semester': semester or latest_record['semester'],
                'roll_number': latest_record['roll_number'],
                'date': target_date,
                'day_of_week': target_date.weekday(),
                'day_of_month': target_date.day,
                'month': target_date.month,
                'is_weekend': False,  # Since we already checked above
                'is_present': 0  # Placeholder
            }
            
            # Calculate recent attendance patterns (only weekdays)
            recent_weekdays = student_enhanced[
                (student_enhanced['date'] <= target_date) & 
                (~student_enhanced['date'].apply(self.is_college_closed))
            ].tail(30)
            
            if len(recent_weekdays) > 0:
                target_record['attendance_rate_7days'] = recent_weekdays.tail(7)['is_present'].mean()
                target_record['attendance_rate_14days'] = recent_weekdays.tail(14)['is_present'].mean()
                target_record['attendance_rate_30days'] = recent_weekdays['is_present'].mean()
                
                # Working days since last attendance
                last_present = recent_weekdays[recent_weekdays['is_present'] == 1]
                if len(last_present) > 0:
                    last_present_date = last_present['date'].max()
                    target_record['days_since_last_attendance'] = self.calculate_working_days(
                        last_present_date, target_date
                    )
                else:
                    target_record['days_since_last_attendance'] = 15  # Default high value
                
                # Consecutive absences (only weekdays)
                consecutive = 0
                for _, row in recent_weekdays.iloc[::-1].iterrows():
                    if row['is_present'] == 0:
                        consecutive += 1
                    else:
                        break
                target_record['consecutive_absences'] = consecutive
            else:
                # Default values if no recent data
                target_record.update({
                    'attendance_rate_7days': 0.7,
                    'attendance_rate_14days': 0.7,
                    'attendance_rate_30days': 0.7,
                    'days_since_last_attendance': 1,
                    'consecutive_absences': 0
                })
            
            # Prepare the record for prediction
            target_df = pd.DataFrame([target_record])
            
            # Prepare features
            X, _, _ = self.prepare_features(target_df)
            if X is None:
                return None
            
            # Make prediction
            prediction = self.model.predict(X)[0]
            prediction_proba = self.model.predict_proba(X)[0]
            
            confidence = max(prediction_proba)
            predicted_attendance = 'Present' if prediction == 1 else 'Absent'
            
            # Generate reason based on features
            reason = self._generate_prediction_reason(target_record, prediction, confidence)
            
            return {
                'student_name': student_name,
                'prediction_date': target_date.strftime('%d-%m-%Y'),
                'predicted_attendance': predicted_attendance,
                'confidence': round(confidence, 3),
                'reason': reason,
                'attendance_probability': round(prediction_proba[1], 3),
                'absence_probability': round(prediction_proba[0], 3)
            }
            
        except Exception as e:
            logging.error(f"Error predicting attendance: {e}")
            return None
    
    def _generate_prediction_reason(self, record, prediction, confidence):
        """Generate a human-readable reason for the prediction"""
        reasons = []
        
        # Check recent attendance patterns
        if record['attendance_rate_7days'] > 0.8:
            reasons.append("has high recent attendance rate")
        elif record['attendance_rate_7days'] < 0.3:
            reasons.append("has low recent attendance rate")
        
        # Check day of week patterns
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        if record['day_of_week'] == 0:  # Monday
            reasons.append("Mondays typically have different attendance patterns")
        elif record['day_of_week'] == 4:  # Friday
            reasons.append("Fridays typically have different attendance patterns")
        
        # Check consecutive absences
        if record['consecutive_absences'] > 3:
            reasons.append("has been absent for several consecutive working days")
        elif record['consecutive_absences'] == 0:
            reasons.append("has been attending regularly")
        
        # Check working days since last attendance
        if record['days_since_last_attendance'] > 5:
            reasons.append("hasn't attended for over a week (working days)")
        elif record['days_since_last_attendance'] <= 1:
            reasons.append("attended recently")
        
        if not reasons:
            reasons.append("based on overall attendance patterns")
        
        reason_text = "Student " + ", ".join(reasons[:2])  # Limit to 2 main reasons
        
        if confidence < 0.6:
            reason_text += " (low confidence prediction)"
        elif confidence > 0.8:
            reason_text += " (high confidence prediction)"
        
        return reason_text
    
    def get_model_statistics(self):
        """Get statistics about the trained model"""
        try:
            if not self.is_trained:
                return None
            
            # Load historical data
            df = self.load_attendance_data_from_firebase()
            if df is None:
                return None
            
            total_records = len(df)
            total_students = df['name'].nunique()
            date_range = f"{df['date'].min().strftime('%d-%m-%Y')} to {df['date'].max().strftime('%d-%m-%Y')}"
            overall_attendance_rate = df['is_present'].mean()
            
            # Course and semester distribution
            course_stats = df.groupby('course')['is_present'].agg(['count', 'mean']).round(3)
            semester_stats = df.groupby('semester')['is_present'].agg(['count', 'mean']).round(3)
            
            # Day of week statistics
            day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
            dow_stats = df.groupby('day_of_week')['is_present'].agg(['count', 'mean']).round(3)
            dow_stats.index = [day_names[i] for i in dow_stats.index if i < 5]
            
            return {
                'total_records': total_records,
                'total_students': total_students,
                'date_range': date_range,
                'overall_attendance_rate': round(overall_attendance_rate, 3),
                'course_statistics': course_stats.to_dict(),
                'semester_statistics': semester_stats.to_dict(),
                'day_of_week_statistics': dow_stats.to_dict(),
                'model_type': 'Random Forest Classifier',
                'model_trained': self.is_trained,
                'note': 'Statistics based on weekdays only (weekends excluded)'
            }
            
        except Exception as e:
            logging.error(f"Error getting model statistics: {e}")
            return None

def predict_student_attendance(student_name, target_date_str, course=None, semester=None):
    """Convenience function to predict attendance for a student"""
    try:
        # Parse target date
        target_date = datetime.strptime(target_date_str, '%Y-%m-%d')
        
        # Create model instance
        model = AttendancePredictionModel()
        
        # Try to load existing model, if not available, train new one
        if not model.load_model():
            logging.info("No existing model found. Training new model...")
            if not model.train_model():
                return {
                    'success': False,
                    'message': 'Failed to train prediction model'
                }
        
        # Make prediction
        prediction = model.predict_attendance(student_name, target_date, course, semester)
        
        if prediction:
            return {
                'success': True,
                'prediction': prediction
            }
        else:
            return {
                'success': False,
                'message': 'Failed to make prediction'
            }
            
    except Exception as e:
        logging.error(f"Error in predict_student_attendance: {e}")
        return {
            'success': False,
            'message': f'Error: {str(e)}'
        }

def train_prediction_model():
    """Train the attendance prediction model"""
    try:
        model = AttendancePredictionModel()
        success = model.train_model()
        
        if success:
            stats = model.get_model_statistics()
            return {
                'success': True,
                'message': 'Model trained successfully (weekdays only)',
                'statistics': stats
            }
        else:
            return {
                'success': False,
                'message': 'Failed to train model'
            }
            
    except Exception as e:
        logging.error(f"Error training model: {e}")
        return {
            'success': False,
            'message': f'Error: {str(e)}'
        }

def get_prediction_model_stats():
    """Get statistics about the prediction model"""
    try:
        model = AttendancePredictionModel()
        
        if model.load_model():
            stats = model.get_model_statistics()
            return {
                'success': True,
                'statistics': stats
            }
        else:
            return {
                'success': False,
                'message': 'No trained model found'
            }
            
    except Exception as e:
        logging.error(f"Error getting model stats: {e}")
        return {
            'success': False,
            'message': f'Error: {str(e)}'
        }