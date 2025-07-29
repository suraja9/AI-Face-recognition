import React, { useState, useEffect, useContext } from 'react';
import { FaArrowLeft, FaBrain, FaCalendarAlt, FaUser, FaChartLine, FaRedo, FaExclamationTriangle } from 'react-icons/fa';
import { ThemeContext } from './ThemeContext';

const AttendancePrediction = ({ onBack }) => {
  const { themeMode } = useContext(ThemeContext);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [predictionDate, setPredictionDate] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modelStats, setModelStats] = useState(null);
  const [error, setError] = useState('');
  const [trainingLoading, setTrainingLoading] = useState(false);

  useEffect(() => {
    fetchStudents();
    fetchModelStats();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await fetch('http://localhost:5000/get-all-students');
      if (response.ok) {
        const data = await response.json();
        setStudents(data.students || []);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      setError('Failed to fetch students list');
    }
  };

  const fetchModelStats = async () => {
    try {
      const response = await fetch('http://localhost:5000/prediction-model-stats');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setModelStats(data.statistics);
        }
      }
    } catch (error) {
      console.error('Error fetching model stats:', error);
    }
  };

  const trainModel = async () => {
    setTrainingLoading(true);
    setError('');
    try {
      const response = await fetch('http://localhost:5000/train-prediction-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      if (data.success) {
        setModelStats(data.statistics);
        alert('Model trained successfully!');
      } else {
        setError(data.message || 'Failed to train model');
      }
    } catch (error) {
      console.error('Error training model:', error);
      setError('Error training model');
    } finally {
      setTrainingLoading(false);
    }
  };

  const predictAttendance = async () => {
    if (!selectedStudent || !predictionDate) {
      setError('Please select a student and date');
      return;
    }

    setLoading(true);
    setError('');
    setPrediction(null);

    try {
      const response = await fetch('http://localhost:5000/predict-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: selectedStudent,
          target_date: predictionDate
        })
      });

      const data = await response.json();
      if (data.success) {
        setPrediction(data.prediction);
      } else {
        setError(data.message || 'Failed to make prediction');
      }
    } catch (error) {
      console.error('Error making prediction:', error);
      setError('Error making prediction');
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    minHeight: '100vh',
    padding: '20px',
    backgroundColor: themeMode === 'dark' ? '#121212' : '#f5f5f5',
    color: themeMode === 'dark' ? '#ffffff' : '#333333'
  };

  const cardStyle = {
    backgroundColor: themeMode === 'dark' ? '#1e1e1e' : '#ffffff',
    border: `1px solid ${themeMode === 'dark' ? '#333' : '#ddd'}`,
    borderRadius: '12px',
    padding: '24px',
    margin: '16px 0',
    boxShadow: themeMode === 'dark' 
      ? '0 4px 12px rgba(0, 0, 0, 0.3)' 
      : '0 4px 12px rgba(0, 0, 0, 0.1)'
  };

  const buttonStyle = {
    backgroundColor: themeMode === 'dark' ? '#2196f3' : '#1976d2',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '16px',
    transition: 'all 0.3s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    margin: '4px'
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: `1px solid ${themeMode === 'dark' ? '#555' : '#ddd'}`,
    backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#ffffff',
    color: themeMode === 'dark' ? '#ffffff' : '#333333',
    fontSize: '16px',
    marginBottom: '16px'
  };

  const getTomorrowDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <div style={containerStyle}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button
            onClick={onBack}
            style={{
              ...buttonStyle,
              backgroundColor: themeMode === 'dark' ? '#666' : '#757575',
              marginRight: '16px'
            }}
          >
            <FaArrowLeft /> Back
          </button>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FaBrain style={{ color: themeMode === 'dark' ? '#90caf9' : '#1976d2' }} />
            Attendance Prediction System
          </h1>
        </div>

        {/* Model Statistics Card */}
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaChartLine /> Model Statistics
          </h2>
          {modelStats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <strong>Total Records:</strong> {modelStats.total_records}
              </div>
              <div>
                <strong>Total Students:</strong> {modelStats.total_students}
              </div>
              <div>
                <strong>Date Range:</strong> {modelStats.date_range}
              </div>
              <div>
                <strong>Overall Attendance Rate:</strong> {(modelStats.overall_attendance_rate * 100).toFixed(1)}%
              </div>
              <div>
                <strong>Model Status:</strong> {modelStats.model_trained ? '✅ Trained' : '❌ Not Trained'}
              </div>
            </div>
          ) : (
            <p>No model statistics available. Please train the model first.</p>
          )}
          
          <button
            onClick={trainModel}
            disabled={trainingLoading}
            style={{
              ...buttonStyle,
              backgroundColor: trainingLoading ? '#666' : '#4caf50',
              marginTop: '16px'
            }}
          >
            <FaRedo /> {trainingLoading ? 'Training Model...' : 'Train/Retrain Model'}
          </button>
        </div>

        {/* Prediction Form */}
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaUser /> Make Prediction
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Select Student:
              </label>
              <select
                value={selectedStudent}
                onChange={(e) => setSelectedStudent(e.target.value)}
                style={inputStyle}
              >
                <option value="">Choose a student...</option>
                {students.map((student, index) => (
                  <option key={index} value={student}>
                    {student}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Prediction Date:
              </label>
              <input
                type="date"
                value={predictionDate}
                onChange={(e) => setPredictionDate(e.target.value)}
                min={getTomorrowDate()}
                style={inputStyle}
              />
            </div>
          </div>

          <button
            onClick={predictAttendance}
            disabled={loading || !selectedStudent || !predictionDate}
            style={{
              ...buttonStyle,
              backgroundColor: loading ? '#666' : '#2196f3',
              marginTop: '16px'
            }}
          >
            <FaBrain /> {loading ? 'Predicting...' : 'Predict Attendance'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div style={{
            ...cardStyle,
            backgroundColor: themeMode === 'dark' ? '#d32f2f' : '#ffebee',
            borderColor: '#d32f2f',
            color: themeMode === 'dark' ? '#ffffff' : '#d32f2f'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaExclamationTriangle />
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Prediction Results */}
        {prediction && (
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaCalendarAlt /> Prediction Results
            </h2>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '20px',
              marginBottom: '20px'
            }}>
              <div style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#f8f9fa',
                textAlign: 'center'
              }}>
                <h3 style={{ margin: '0 0 8px 0' }}>Student</h3>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                  {prediction.student_name}
                </p>
              </div>

              <div style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#f8f9fa',
                textAlign: 'center'
              }}>
                <h3 style={{ margin: '0 0 8px 0' }}>Date</h3>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                  {prediction.prediction_date}
                </p>
              </div>

              <div style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: prediction.predicted_attendance === 'Present' 
                  ? (themeMode === 'dark' ? '#2e7d32' : '#e8f5e8') 
                  : (themeMode === 'dark' ? '#d32f2f' : '#ffebee'),
                textAlign: 'center',
                border: `2px solid ${prediction.predicted_attendance === 'Present' ? '#4caf50' : '#f44336'}`
              }}>
                <h3 style={{ margin: '0 0 8px 0' }}>Prediction</h3>
                <p style={{ 
                  margin: 0, 
                  fontSize: '24px', 
                  fontWeight: 'bold',
                  color: prediction.predicted_attendance === 'Present' ? '#4caf50' : '#f44336'
                }}>
                  {prediction.predicted_attendance}
                </p>
              </div>

              <div style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#f8f9fa',
                textAlign: 'center'
              }}>
                <h3 style={{ margin: '0 0 8px 0' }}>Confidence</h3>
                <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
                  {(prediction.confidence * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            <div style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: themeMode === 'dark' ? '#2a2a2a' : '#f8f9fa'
            }}>
              <h3 style={{ margin: '0 0 12px 0' }}>Prediction Analysis</h3>
              <p style={{ margin: 0, lineHeight: '1.6' }}>{prediction.reason}</p>
              
              <div style={{ 
                marginTop: '16px', 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '12px' 
              }}>
                <div>
                  <strong>Attendance Probability:</strong> {(prediction.attendance_probability * 100).toFixed(1)}%
                </div>
                <div>
                  <strong>Absence Probability:</strong> {(prediction.absence_probability * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Card */}
        {/* <div style={{
          ...cardStyle,
          backgroundColor: themeMode === 'dark' ? '#1a237e' : '#e3f2fd',
          borderColor: '#2196f3'
        }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#2196f3' }}>How It Works</h3>
          <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.6' }}>
            <li>The system analyzes historical attendance patterns using machine learning</li>
            <li>It considers factors like day of week, recent attendance rates, and consecutive absences</li>
            <li>Predictions are made using a Random Forest model trained on your attendance data</li>
            <li>Higher confidence scores indicate more reliable predictions</li>
            <li>Train the model regularly with new data for better accuracy</li>
          </ul>
        </div> */}
      </div>
    </div>
  );
};

export default AttendancePrediction;