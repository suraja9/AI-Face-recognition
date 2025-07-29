import React, { useState, useContext } from "react";
import { FaUserCheck, FaUserPlus, FaChartBar, FaChartLine, FaUserEdit, FaBrain } from "react-icons/fa"; // Added FaBrain for prediction
import { Button, Container, Typography, Grid, Card, CardContent, Dialog, DialogTitle, DialogContent, DialogActions, Paper } from "@mui/material";
import Dashboard from "./Dashboard"; // Import the Dashboard component
import UpdateProfile from "./UpdateProfile"; // Import the UpdateProfile component
import AttendancePrediction from "./AttendancePrediction"; // Import the new AttendancePrediction component
import AttendanceAnalytics from "./DataAnalysis"; // Import the AttendanceAnalytics component
import { ThemeProvider, ThemeContext } from "./ThemeContext"; // Import the ThemeProvider and ThemeContext
import ThemeToggle from "./ThemeToggle"; // Import the ThemeToggle component
import "./theme.css"; // Import theme CSS

const Home = () => {
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupContent, setPopupContent] = useState("");
  const [showDashboard, setShowDashboard] = useState(false);
  const [showUpdateProfile, setShowUpdateProfile] = useState(false);
  const [showAttendancePrediction, setShowAttendancePrediction] = useState(false);
  const [showDataAnalysis, setShowDataAnalysis] = useState(false); // Add state for data analysis
  const { themeMode } = useContext(ThemeContext);  // Access the theme

  // Function to trigger Python scripts
  const runScript = (scriptName) => {
    fetch(`http://localhost:5000/run-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: scriptName }),
    })
      .then((response) => response.json())
      .then((data) => console.log(data))
      .catch((error) => console.error("Error:", error));
  };

  // Function to open popup
  const handleOpenPopup = (content, scriptName) => {
    if (scriptName) {
      runScript(scriptName); // Run script if provided
    }
    setPopupContent(content);
    setPopupOpen(true);
  };

  // Function to close popup
  const handleClosePopup = () => {
    setPopupOpen(false);
  };

  // Function to show dashboard
  const handleShowDashboard = () => {
    setShowDashboard(true);
  };

  // Function to show update profile
  const handleShowUpdateProfile = () => {
    setShowUpdateProfile(true);
  };

  // Function to show attendance prediction
  const handleShowAttendancePrediction = () => {
    setShowAttendancePrediction(true);
  };

  // Function to show data analysis
  const handleShowDataAnalysis = () => {
    setShowDataAnalysis(true);
  };

  // Function to return from any component to home
  const handleBackToHome = () => {
    setShowDashboard(false);
    setShowUpdateProfile(false);
    setShowAttendancePrediction(false);
    setShowDataAnalysis(false); // Reset data analysis state
  };

  // Render AttendanceAnalytics component
  if (showDataAnalysis) {
    return <AttendanceAnalytics onBack={handleBackToHome} />;
  }

  // Render AttendancePrediction component
  if (showAttendancePrediction) {
    return <AttendancePrediction onBack={handleBackToHome} />;
  }

  // Render UpdateProfile component
  if (showUpdateProfile) {
    return <UpdateProfile onBack={handleBackToHome} />;
  }

  // Render Dashboard component
  if (showDashboard) {
    return <Dashboard onBack={handleBackToHome} />;
  }

  // Card style based on theme
  const cardStyle = {
    cursor: "pointer",
    transition: "transform 0.3s ease, box-shadow 0.3s ease",
    '&:hover': {
      transform: "translateY(-5px)",
      boxShadow: themeMode === 'dark' ? '0 8px 16px rgba(0, 0, 0, 0.5)' : '0 8px 16px rgba(0, 0, 0, 0.2)',
    }
  };

  // Icon style based on theme
  const iconStyle = {
    fontSize: '40px',
    color: themeMode === 'dark' ? '#90caf9' : '#1976d2',
    marginBottom: '10px'
  };

  return (
    <Container>
      <Paper
        elevation={3}
        sx={{
          mt: 5,
          mb: 5,
          padding: 3,
          borderRadius: 2,
        }}
      >
        <Typography
          variant="h3"
          gutterBottom
          sx={{
            mb: 4,
            textAlign: "center",
            fontWeight: "bold"
          }}
        >
          Face Attendance System
        </Typography>
        <Grid container spacing={3} justifyContent="center">
          {/* Give Attendance */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              onClick={() => handleOpenPopup("Running attendance system...", "main.py")}
              sx={cardStyle}
            >
              <CardContent sx={{ textAlign: 'center', padding: 3 }}>
                <FaUserCheck size={40} style={iconStyle} />
                <Typography variant="h6">Give Attendance</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Register Yourself */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              onClick={() => handleOpenPopup("Opening registration process...", "registration.py")}
              sx={cardStyle}
            >
              <CardContent sx={{ textAlign: 'center', padding: 3 }}>
                <FaUserPlus size={40} style={iconStyle} />
                <Typography variant="h6">Register Yourself</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* View Dashboard */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              onClick={handleShowDashboard}
              sx={cardStyle}
            >
              <CardContent sx={{ textAlign: 'center', padding: 3 }}>
                <FaChartBar size={40} style={iconStyle} />
                <Typography variant="h6">View Dashboard</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Attendance Prediction */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              onClick={handleShowAttendancePrediction}
              sx={cardStyle}
            >
              <CardContent sx={{ textAlign: 'center', padding: 3 }}>
                <FaBrain size={40} style={iconStyle} />
                <Typography variant="h6">Attendance Prediction</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Data Analysis */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              onClick={handleShowDataAnalysis}
              sx={cardStyle}
            >
              <CardContent sx={{ textAlign: 'center', padding: 3 }}>
                <FaChartLine size={40} style={iconStyle} />
                <Typography variant="h6">Data Analysis</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Update Profile */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              onClick={handleShowUpdateProfile}
              sx={cardStyle}
            >
              <CardContent sx={{ textAlign: 'center', padding: 3 }}>
                <FaUserEdit size={40} style={iconStyle} />
                <Typography variant="h6">Update Profile</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Popup Dialog */}
      <Dialog open={popupOpen} onClose={handleClosePopup}>
        <DialogTitle>Notification</DialogTitle>
        <DialogContent>
          <Typography>{popupContent}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePopup}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

// Main App component that wraps Home with ThemeProvider
const App = () => {
  return (
    <ThemeProvider>
      <div className="App">
        <ThemeToggle />
        <Home />
      </div>
    </ThemeProvider>
  );
};

export default App;
