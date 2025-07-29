import React, { useState, useContext } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  Box,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  Divider,
  Backdrop,
  CircularProgress
} from '@mui/material';
import { FaSearch, FaUserEdit, FaArrowLeft, FaSave } from 'react-icons/fa';
import { ThemeContext } from './ThemeContext';

const UpdateProfile = ({ onBack }) => {
  const [searchRollNumber, setSearchRollNumber] = useState('');
  const [userData, setUserData] = useState(null);
  const [editData, setEditData] = useState({
    name: '',
    course: '',
    semester: '',
    roll_number: ''
  });
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isEditing, setIsEditing] = useState(false);
  
  const { themeMode } = useContext(ThemeContext);

  // Course data with duration in years
  const courseData = {
    "B.Tech in Civil Engineering": 4,
    "B.Tech in Computer Science and Engineering": 4, 
    "B.Tech in Electronics and Communication Engineering": 4,
    "B.Tech in Mechanical Engineering": 4,
    "B.Tech in Electrical Engineering": 4,
    "M.Tech in Structural Engineering": 2,
    "M.Tech in Computer Science and Engineering": 2,
    "Bachelor Of Computer Application": 3,
    "B.Sc. in Physics": 4,
    "B.Sc. in Chemistry": 4, 
    "B.Sc. in Mathematics": 4,
    "M.Sc. in Physics": 2,
    "M.Sc. in Chemistry": 2,
    "M.Sc. in Mathematics": 2,
    "Bachelor Of Business Administration": 4
  };

  // Generate semesters based on selected course
  const getSemestersForCourse = (courseName) => {
    const duration = courseData[courseName];
    if (!duration) return [];
    
    const totalSemesters = duration * 2; // Each year has 2 semesters
    const semesters = [];
    
    for (let i = 1; i <= totalSemesters; i++) {
      const semesterNumber = i === 1 ? "1st" : 
                            i === 2 ? "2nd" : 
                            i === 3 ? "3rd" : 
                            `${i}th`;
      semesters.push(`${semesterNumber} Semester`);
    }
    
    return semesters;
  };

  const allAvailableOptions = {
    courses: Object.keys(courseData),
    semesters: getSemestersForCourse(editData.course)
  };

  const handleSearch = async () => {
    if (!searchRollNumber.trim()) {
      setMessage({ type: 'error', text: 'Please enter a roll number' });
      return;
    }

    setSearching(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch(`http://localhost:5000/search-user-by-roll?roll_number=${encodeURIComponent(searchRollNumber)}`);
      const data = await response.json();

      if (data.success) {
        setUserData(data.user);
        setEditData({
          name: data.user.name,
          course: data.user.course,
          semester: data.user.semester,
          roll_number: data.user.roll_number
        });
        setMessage({ type: 'success', text: 'User found successfully!' });
      } else {
        setUserData(null);
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error searching for user. Please check your connection.' });
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleInputChange = (field, value) => {
    setEditData(prev => {
      const newData = {
        ...prev,
        [field]: value
      };
      
      // If course is changed, reset semester if it's invalid for the new course
      if (field === 'course') {
        const availableSemesters = getSemestersForCourse(value);
        if (!availableSemesters.includes(newData.semester)) {
          newData.semester = '';
        }
      }
      
      return newData;
    });
  };

  const handleUpdate = async () => {
    if (!editData.course || !editData.semester) {
      setMessage({ type: 'error', text: 'Course and semester are required' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('http://localhost:5000/update-user-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editData),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setUserData({ ...editData });
        setIsEditing(false);
        
        // Clear form after successful update
        setTimeout(() => {
          setSearchRollNumber('');
          setUserData(null);
          setEditData({ name: '', course: '', semester: '', roll_number: '' });
          setMessage({ type: '', text: '' });
        }, 2000);
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error updating profile. Please try again.' });
      console.error('Update error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditData({
      name: userData.name,
      course: userData.course,
      semester: userData.semester,
      roll_number: userData.roll_number
    });
    setIsEditing(false);
    setMessage({ type: '', text: '' });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Enhanced dark mode input styling
  const inputFieldStyle = {
    '& .MuiInputBase-input': {
      color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
    },
    '& .MuiInputLabel-root': {
      color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: themeMode === 'dark' ? '#90caf9 !important' : 'inherit',
    },
    '& .MuiFormHelperText-root': {
      color: themeMode === 'dark' ? '#cccccc !important' : 'inherit',
    },
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
      },
      '&:hover fieldset': {
        borderColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
      },
      '&.Mui-focused fieldset': {
        borderColor: themeMode === 'dark' ? '#90caf9 !important' : 'inherit',
      },
      '&.Mui-disabled': {
        '& fieldset': {
          borderColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
        },
        '& .MuiInputBase-input': {
          color: themeMode === 'dark' ? '#888 !important' : 'inherit',
          WebkitTextFillColor: themeMode === 'dark' ? '#888 !important' : 'inherit',
        },
      },
    },
  };

  const selectStyle = {
    '& .MuiInputBase-input': {
      color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
    },
    '& .MuiInputLabel-root': {
      color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
    },
    '& .MuiInputLabel-root.Mui-focused': {
      color: themeMode === 'dark' ? '#90caf9 !important' : 'inherit',
    },
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
      },
      '&:hover fieldset': {
        borderColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
      },
      '&.Mui-focused fieldset': {
        borderColor: themeMode === 'dark' ? '#90caf9 !important' : 'inherit',
      },
      '&.Mui-disabled': {
        '& fieldset': {
          borderColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
        },
        '& .MuiInputBase-input': {
          color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
          WebkitTextFillColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
        },
      },
    },
    '& .MuiSelect-icon': {
      color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
    },
    '&.Mui-disabled .MuiSelect-icon': {
      color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
    },
    // Additional styling for disabled Select components
    '&.Mui-disabled': {
      '& .MuiInputBase-input': {
        color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
        WebkitTextFillColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
      },
      '& .MuiSelect-select': {
        color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
        WebkitTextFillColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
      },
    },
  };

  // Enhanced dropdown menu styling
  const menuProps = {
    PaperProps: {
      sx: {
        bgcolor: themeMode === 'dark' ? '#2c2c2c !important' : '#fff',
        color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
        maxHeight: 200,
        '& .MuiMenuItem-root': {
          color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
          backgroundColor: themeMode === 'dark' ? '#2c2c2c !important' : 'inherit',
          '&:hover': {
            backgroundColor: themeMode === 'dark' ? '#404040 !important' : 'rgba(0, 0, 0, 0.04)',
          },
          '&.Mui-selected': {
            backgroundColor: themeMode === 'dark' ? '#1976d2 !important' : 'rgba(25, 118, 210, 0.12)',
            color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
            '&:hover': {
              backgroundColor: themeMode === 'dark' ? '#1565c0 !important' : 'rgba(25, 118, 210, 0.2)',
            },
          },
        },
      }
    }
  };

  return (
    <Container maxWidth="md">
      <Backdrop open={loading} style={{ zIndex: 9999 }}>
        <CircularProgress color="primary" />
      </Backdrop>

      <Paper 
        elevation={3}
        sx={{ 
          mt: 4, 
          mb: 4, 
          p: 4,
          borderRadius: 2,
          bgcolor: themeMode === 'dark' ? '#1e1e1e' : '#fff',
        }}
      >
        {/* Header */}
        <Box display="flex" alignItems="center" mb={3}>
          <Button
            onClick={onBack}
            startIcon={<FaArrowLeft />}
            sx={{ 
              mr: 2,
              color: themeMode === 'dark' ? '#ffffff' : 'inherit',
            }}
          >
            Back
          </Button>
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              fontWeight: 'bold',
              color: themeMode === 'dark' ? '#ffffff' : 'inherit'
            }}
          >
            Update Profile
          </Typography>
        </Box>

        {/* Search Section */}
        <Card 
          elevation={2} 
          sx={{ 
            mb: 3,
            bgcolor: themeMode === 'dark' ? '#252525' : '#fff',
          }}
        >
          <CardContent>
            <Typography 
              variant="h6" 
              gutterBottom
              sx={{ color: themeMode === 'dark' ? '#ffffff' : 'inherit' }}
            >
              Search User by Roll Number
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  label="Roll Number"
                  placeholder="Enter roll number (e.g., CE202108003)"
                  value={searchRollNumber}
                  onChange={(e) => setSearchRollNumber(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={searching}
                  sx={inputFieldStyle}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleSearch}
                  disabled={searching}
                  startIcon={searching ? <CircularProgress size={20} /> : <FaSearch />}
                  sx={{ 
                    height: '56px',
                    bgcolor: 'var(--accent-color)',
                    '&:hover': {
                      bgcolor: themeMode === 'dark' ? '#64b5f6' : '#1565c0',
                    }
                  }}
                >
                  {searching ? 'Searching...' : 'Search'}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Message Display */}
        {message.text && (
          <Alert 
            severity={message.type} 
            sx={{ mb: 3 }}
            onClose={() => setMessage({ type: '', text: '' })}
          >
            {message.text}
          </Alert>
        )}

        {/* User Profile Section */}
        {userData && (
          <Card 
            elevation={2}
            sx={{ 
              bgcolor: themeMode === 'dark' ? '#252525' : '#fff',
            }}
          >
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography 
                  variant="h6"
                  sx={{ color: themeMode === 'dark' ? '#ffffff' : 'inherit' }}
                >
                  Profile Information
                </Typography>
                {!isEditing && (
                  <Button
                    variant="outlined"
                    startIcon={<FaUserEdit />}
                    onClick={() => setIsEditing(true)}
                    sx={{
                      borderColor: 'var(--accent-color)',
                      color: 'var(--accent-color)',
                      '&:hover': {
                        bgcolor: 'var(--hover-color)',
                      }
                    }}
                  >
                    Edit Profile
                  </Button>
                )}
              </Box>

              <Divider 
                sx={{ 
                  mb: 3,
                  borderColor: themeMode === 'dark' ? '#444' : 'inherit'
                }} 
              />

              <Grid container spacing={3}>
                {/* Name (Read-only) */}
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Name"
                    value={editData.name}
                    disabled
                    helperText="Name cannot be changed"
                    sx={inputFieldStyle}
                  />
                </Grid>

                {/* Roll Number */}
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Roll Number"
                    value={editData.roll_number}
                    onChange={(e) => handleInputChange('roll_number', e.target.value)}
                    disabled={!isEditing}
                    sx={inputFieldStyle}
                  />
                </Grid>

                {/* Course */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel 
                      sx={{ 
                        color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
                        '&.Mui-focused': {
                          color: themeMode === 'dark' ? '#90caf9 !important' : 'inherit',
                        }
                      }}
                    >
                      Course
                    </InputLabel>
                    <Select
                      value={editData.course}
                      label="Course"
                      onChange={(e) => handleInputChange('course', e.target.value)}
                      disabled={!isEditing}
                      sx={{
                        ...selectStyle,
                        '& .MuiSelect-select.Mui-disabled': {
                          color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
                          WebkitTextFillColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
                        }
                      }}
                      MenuProps={menuProps}
                    >
                      {allAvailableOptions.courses.map((course) => (
                        <MenuItem key={course} value={course}>
                          {course}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Semester */}
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel 
                      sx={{ 
                        color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
                        '&.Mui-focused': {
                          color: themeMode === 'dark' ? '#90caf9 !important' : 'inherit',
                        }
                      }}
                    >
                      Semester
                    </InputLabel>
                    <Select
                      value={editData.semester}
                      label="Semester"
                      onChange={(e) => handleInputChange('semester', e.target.value)}
                      disabled={!isEditing || !editData.course}
                      sx={{
                        ...selectStyle,
                        '& .MuiSelect-select.Mui-disabled': {
                          color: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
                          WebkitTextFillColor: themeMode === 'dark' ? '#ffffff !important' : 'inherit',
                        }
                      }}
                      MenuProps={menuProps}
                    >
                      {getSemestersForCourse(editData.course).map((semester) => (
                        <MenuItem key={semester} value={semester}>
                          {semester}
                        </MenuItem>
                      ))}
                    </Select>
                    {isEditing && !editData.course && (
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: themeMode === 'dark' ? '#cccccc' : 'text.secondary',
                          mt: 1 
                        }}
                      >
                        Please select a course first
                      </Typography>
                    )}
                  </FormControl>
                </Grid>
              </Grid>

              {/* Action Buttons */}
              {isEditing && (
                <Box mt={3} display="flex" gap={2} justifyContent="flex-end">
                  <Button
                    variant="outlined"
                    onClick={handleCancel}
                    disabled={loading}
                    sx={{
                      borderColor: themeMode === 'dark' ? '#888' : 'inherit',
                      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                      '&:hover': {
                        borderColor: themeMode === 'dark' ? '#aaa' : 'inherit',
                        bgcolor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'inherit',
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleUpdate}
                    disabled={loading}
                    startIcon={<FaSave />}
                    sx={{
                      bgcolor: 'var(--accent-color)',
                      '&:hover': {
                        bgcolor: themeMode === 'dark' ? '#64b5f6' : '#1565c0',
                      }
                    }}
                  >
                    Save Changes
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        {!userData && !message.text && (
          <Card 
            elevation={1} 
            sx={{ 
              mt: 3, 
              bgcolor: themeMode === 'dark' ? 'rgba(33, 150, 243, 0.1)' : 'info.light',
              color: themeMode === 'dark' ? '#90caf9' : 'info.contrastText',
              border: themeMode === 'dark' ? '1px solid rgba(33, 150, 243, 0.3)' : 'none'
            }}
          >
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Instructions:
              </Typography>
              <Typography variant="body2">
                • Enter the roll number of the user whose profile you want to update<br/>
                • Click "Search" to find the user in the database<br/>
                • Once found, click "Edit Profile" to modify the information<br/>
                • You can update the course, semester, and roll number<br/>
                • The name cannot be changed for security reasons<br/>
                • Semester options will automatically adjust based on the selected course<br/>
                • Each course has different duration: B.Tech/B.Sc/BBA (4 years), M.Tech/M.Sc (2 years), BCA (3 years)<br/>
                • Click "Save Changes" to update the profile
              </Typography>
            </CardContent>
          </Card>
        )}
      </Paper>
    </Container>
  );
};

export default UpdateProfile;