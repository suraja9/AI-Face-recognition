import React, { useState, useEffect, useContext } from 'react';
import { 
  Container, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, FormControl, InputLabel,
  Select, MenuItem, TextField, Button, Grid, 
  Box, CircularProgress, Alert
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { enGB } from 'date-fns/locale';
import { format, parse } from 'date-fns';
import { ThemeContext } from './ThemeContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Dashboard = ({ onBack }) => {
  // Access theme
  const { themeMode } = useContext(ThemeContext);
  
  // State variables
  const [, setAttendanceData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dateRangeMode, setDateRangeMode] = useState(false);
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [rollNumber, setRollNumber] = useState('');
  const [filterType, setFilterType] = useState('date'); // 'date' or 'roll'
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [courses, setCourses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  
  // Utility function to format date for API (dd-MM-yyyy)
  const formatDateForAPI = (date) => {
    return format(date, 'dd-MM-yyyy');
  };

  // Utility function to format date for display (dd-MM-yyyy)
  const formatDateForDisplay = (dateString) => {
    try {
      // If dateString is already in dd-MM-yyyy format, return as is
      if (dateString && dateString.includes('-') && dateString.split('-')[0].length === 2) {
        return dateString;
      }
      
      // If dateString is in yyyy-MM-dd format, convert to dd-MM-yyyy
      if (dateString && dateString.includes('-') && dateString.split('-')[0].length === 4) {
        const date = parse(dateString, 'yyyy-MM-dd', new Date());
        return format(date, 'dd-MM-yyyy');
      }
      
      // If dateString is in MM/dd/yyyy or dd/MM/yyyy format
      if (dateString && dateString.includes('/')) {
        const parts = dateString.split('/');
        if (parts.length === 3) {
          // Assume dd/MM/yyyy format
          if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
            return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
          }
          // If MM/dd/yyyy format
          if (parts[1].length <= 2 && parts[0].length <= 2 && parts[2].length === 4) {
            return `${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}-${parts[2]}`;
          }
        }
      }
      
      // If it's a Date object
      if (dateString instanceof Date) {
        return format(dateString, 'dd-MM-yyyy');
      }
      
      // Try to parse as a general date and format
      const parsedDate = new Date(dateString);
      if (!isNaN(parsedDate.getTime())) {
        return format(parsedDate, 'dd-MM-yyyy');
      }
      
      return dateString;
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  // Utility function to convert dd-MM-yyyy to yyyy-MM-dd for backend compatibility
  const convertToBackendFormat = (ddMMyyyyy) => {
    try {
      if (ddMMyyyyy && typeof ddMMyyyyy === 'string' && ddMMyyyyy.includes('-')) {
        const parts = ddMMyyyyy.split('-');
        if (parts.length === 3 && parts[0].length === 2) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      return ddMMyyyyy;
    } catch (error) {
      console.error('Error converting date format:', error);
      return ddMMyyyyy;
    }
  };

  // Sorting function
  const handleSort = (column) => {
    const isAsc = sortColumn === column && sortDirection === 'asc';
    setSortDirection(isAsc ? 'desc' : 'asc');
    setSortColumn(column);
    
    const sortedData = [...filteredData].sort((a, b) => {
      let aValue, bValue;
      
      // Handle roll number with multiple possible field names
      if (column === 'roll_number') {
        aValue = a.roll_number || a.roll_no || '';
        bValue = b.roll_number || b.roll_no || '';
        // Extract numeric part from roll numbers like "CE202108003"
        const aNumeric = aValue.toString().replace(/[^0-9]/g, '');
        const bNumeric = bValue.toString().replace(/[^0-9]/g, '');
        aValue = parseInt(aNumeric) || 0;
        bValue = parseInt(bNumeric) || 0;
      } else if (column === 'date') {
        // Convert date strings to Date objects for proper sorting
        aValue = new Date(a[column].split('-').reverse().join('-'));
        bValue = new Date(b[column].split('-').reverse().join('-'));
      } else if (column === 'semester') {
        // Handle numeric semesters
        aValue = parseInt(a[column]) || 0;
        bValue = parseInt(b[column]) || 0;
      } else {
        // String comparison (case insensitive)
        aValue = (a[column] || '').toString().toLowerCase();
        bValue = (b[column] || '').toString().toLowerCase();
      }
      
      if (aValue < bValue) {
        return isAsc ? 1 : -1;
      }
      if (aValue > bValue) {
        return isAsc ? -1 : 1;
      }
      return 0;
    });
    
    setFilteredData(sortedData);
  };

  // Function to get sort icon
  const getSortIcon = (column) => {
    if (sortColumn !== column) {
      return '⇅'; // Better neutral sort icon
    }
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // PDF Download Function
  const downloadPDF = () => {
    if (filteredData.length === 0) {
      alert('No data to download. Please apply filters first.');
      return;
    }

    try {
      // Create new PDF document
      const doc = new jsPDF('p', 'mm', 'a4');
      
      // Set document properties
      doc.setProperties({
        title: 'Attendance Report',
        subject: 'Student Attendance Records',
        author: 'Attendance Management System',
        creator: 'Dashboard'
      });

      // Add title
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text('Attendance Report', 14, 22);
      
      // Add subtitle with filter information
      doc.setFontSize(12);
      doc.setFont(undefined, 'normal');
      let subtitle = '';
      
      if (filterType === 'date') {
        if (dateRangeMode) {
          subtitle = `Date Range: ${formatDateForAPI(startDate)} to ${formatDateForAPI(endDate)}`;
        } else {
          subtitle = `Date: ${formatDateForAPI(selectedDate)}`;
        }
      } else {
        subtitle = `Student: ${rollNumber}`;
        if (dateRangeMode) {
          subtitle += ` | Date Range: ${formatDateForAPI(startDate)} to ${formatDateForAPI(endDate)}`;
        }
      }
      
      if (selectedCourse) subtitle += ` | Course: ${selectedCourse}`;
      if (selectedSemester) subtitle += ` | Semester: ${selectedSemester}`;
      
      doc.text(subtitle, 14, 32);
      
      // Add generation timestamp
      const now = new Date();
      doc.setFontSize(10);
      doc.text(`Generated on: ${format(now, 'dd-MM-yyyy HH:mm:ss')}`, 14, 42);
      
      // Prepare table data
      const tableColumns = ['Date', 'Time', 'Roll No', 'Name', 'Attendance', 'Course', 'Semester'];
      const tableRows = filteredData.map(record => [
        record.date,
        record.timestamp || 'N/A',
        record.roll_number || record.roll_no || 'N/A',
        record.name,
        record.attendance_status || 'Present',
        record.course,
        record.semester
      ]);

      // Add table using autoTable plugin
      autoTable(doc, {
        head: [tableColumns],
        body: tableRows,
        startY: 50,
        styles: {
          fontSize: 9,
          cellPadding: 3,
        },
        headStyles: {
          fillColor: [41, 128, 185], // Blue header
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245] // Light gray for alternate rows
        },
        margin: { top: 50, left: 14, right: 14 },
        didDrawPage: function (data) {
          // Add page number
          const pageCount = doc.internal.getNumberOfPages();
          const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
          doc.setFontSize(10);
          doc.text(
            `Page ${pageNumber} of ${pageCount}`,
            doc.internal.pageSize.width - 30,
            doc.internal.pageSize.height - 10
          );
        }
      });

      // Add summary at the end
      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 50;
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`Total Records: ${filteredData.length}`, 14, finalY + 20);

      // Generate filename based on filter type and current date
      let filename = 'attendance_report';
      if (filterType === 'roll' && rollNumber) {
        filename = `attendance_${rollNumber.replace(/\s+/g, '_').toLowerCase()}`;
      } else if (filterType === 'date') {
        if (dateRangeMode) {
          filename = `attendance_${formatDateForAPI(startDate)}_to_${formatDateForAPI(endDate)}`;
        } else {
          filename = `attendance_${formatDateForAPI(selectedDate)}`;
        }
      }
      filename += `_${format(now, 'yyyyMMdd_HHmmss')}.pdf`;
      
      // Generate PDF as blob and trigger download with save dialog
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      console.error('Error details:', error.message);
      alert(`Error generating PDF: ${error.message}`);
    }
  };
  
  // Fetch courses and semesters on component mount
  useEffect(() => {
    fetchCoursesAndSemesters();
  }, []);

  // Fetch attendance data when filters change
  useEffect(() => {
    // Reset sorting when filters change
    setSortColumn('');
    setSortDirection('asc');
    
    if (filterType === 'date') {
      fetchAttendanceByDate();
    } else if (filterType === 'roll' && rollNumber.trim() !== '') {
      fetchAttendanceByRollNumber();
    }// eslint-disable-next-line
  }, [selectedDate, filterType, rollNumber]);

  const fetchCoursesAndSemesters = async () => {
    try {
      const response = await fetch('http://localhost:5000/get-courses-semesters');
      const data = await response.json();
      
      if (data.success) {
        setCourses(data.courses || []);
        setSemesters(data.semesters || []);
      } else {
        // If API fails, set some default values for testing
        setCourses(['CSE', 'IT', 'ECE', 'ME']);
        setSemesters(['1', '2', '3', '4', '5', '6', '7', '8']);
      }
    } catch (error) {
      console.error('Error fetching courses and semesters:', error);
      // Set default values if API fails
      setCourses(['CSE', 'IT', 'ECE', 'ME']);
      setSemesters(['1', '2', '3', '4', '5', '6', '7', '8']);
    }
  };

  const fetchAttendanceByDate = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = 'http://localhost:5000/get-students-with-attendance?';
      
      if (dateRangeMode) {
        // For date range, we'll need to call the API for each date and combine results
        let allStudentsData = [];
        let currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
          const backendDate = convertToBackendFormat(formatDateForAPI(currentDate));
          let dateUrl = `http://localhost:5000/get-students-with-attendance?date=${backendDate}`;
          
          if (selectedCourse) dateUrl += `&course=${selectedCourse}`;
          if (selectedSemester) dateUrl += `&semester=${selectedSemester}`;
          
          const response = await fetch(dateUrl);
          const data = await response.json();
          
          if (data.success) {
            const studentsWithDate = data.students.map(student => ({
              ...student,
              date: formatDateForDisplay(data.date)
            }));
            allStudentsData = [...allStudentsData, ...studentsWithDate];
          }
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        setAttendanceData(allStudentsData);
        setFilteredData(allStudentsData);
      } else {
        const formattedDate = formatDateForAPI(selectedDate);
        const backendDate = convertToBackendFormat(formattedDate);
        url += `date=${backendDate}`;
        
        if (selectedCourse) url += `&course=${selectedCourse}`;
        if (selectedSemester) url += `&semester=${selectedSemester}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
          const studentsWithDate = data.students.map(student => ({
            ...student,
            date: formatDateForDisplay(data.date)
          }));
          
          setAttendanceData(studentsWithDate);
          setFilteredData(studentsWithDate);
        } else {
          setError(data.message || 'Failed to fetch attendance data');
          setAttendanceData([]);
          setFilteredData([]);
        }
      }
    } catch (error) {
      console.error('Error fetching attendance by date:', error);
      setError('Error connecting to server');
      setAttendanceData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendanceByRollNumber = async () => {
    if (!rollNumber.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      let url = `http://localhost:5000/get-student-attendance-with-status?roll_number=${encodeURIComponent(rollNumber)}`;
      
      if (dateRangeMode) {
        const formattedStartDate = formatDateForAPI(startDate);
        const formattedEndDate = formatDateForAPI(endDate);
        // Convert to backend format if needed
        const backendStartDate = convertToBackendFormat(formattedStartDate);
        const backendEndDate = convertToBackendFormat(formattedEndDate);
        url += `&start_date=${backendStartDate}&end_date=${backendEndDate}`;
      } else {
        // For single date mode, add the selected date
        const formattedDate = formatDateForAPI(selectedDate);
        const backendDate = convertToBackendFormat(formattedDate);
        url += `&date=${backendDate}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        // Process data - format dates for display
        const processedData = data.attendance.map(record => ({
          ...record,
          date: formatDateForDisplay(record.date)
        }));
        
        setAttendanceData(processedData);
        setFilteredData(processedData);
      } else {
        setError(data.message || 'Failed to fetch attendance data');
        setAttendanceData([]);
        setFilteredData([]);
      }
    } catch (error) {
      console.error('Error fetching attendance by roll number:', error);
      setError('Error connecting to server');
      setAttendanceData([]);
      setFilteredData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    // Reset data when switching filter types
    setAttendanceData([]);
    setFilteredData([]);
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  const handleCourseChange = (event) => {
    setSelectedCourse(event.target.value);
  };

  const handleSemesterChange = (event) => {
    setSelectedSemester(event.target.value);
  };

  const handleRollNumberChange = (event) => {
    setRollNumber(event.target.value);
  };

  const handleDateRangeModeChange = () => {
    setDateRangeMode(!dateRangeMode);
    // Reset data when switching modes
    setAttendanceData([]);
    setFilteredData([]);
  };

  const handleStartDateChange = (date) => {
    setStartDate(date);
  };

  const handleEndDateChange = (date) => {
    setEndDate(date);
  };

  // Custom styling based on theme
  const paperStyle = {
    borderRadius: 2,
    boxShadow: themeMode === 'dark' 
      ? '0 4px 20px rgba(0, 0, 0, 0.5)' 
      : '0 4px 20px rgba(0, 0, 0, 0.1)',
  };

  const tableStyle = {
    '& .MuiTableRow-root:hover': {
      backgroundColor: 'var(--table-hover-bg)',
    }
  };

  // Dark mode input styling
  const inputFieldStyle = {
    '& .MuiInputBase-input': {
      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
    },
    '& .MuiInputLabel-root': {
      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
    },
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: themeMode === 'dark' ? '#555' : 'inherit',
      },
      '&:hover fieldset': {
        borderColor: themeMode === 'dark' ? '#888' : 'inherit',
      },
      '&.Mui-focused fieldset': {
        borderColor: themeMode === 'dark' ? '#90caf9' : 'inherit',
      },
    },
    // Fix for dropdown arrow and calendar icon
    '& .MuiSvgIcon-root': {
      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
    },
    '& .MuiIconButton-root': {
      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
    },
  };

  const selectStyle = {
    '& .MuiInputBase-input': {
      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
    },
    '& .MuiInputLabel-root': {
      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
    },
    '& .MuiOutlinedInput-root': {
      '& fieldset': {
        borderColor: themeMode === 'dark' ? '#555' : 'inherit',
      },
      '&:hover fieldset': {
        borderColor: themeMode === 'dark' ? '#888' : 'inherit',
      },
      '&.Mui-focused fieldset': {
        borderColor: themeMode === 'dark' ? '#90caf9' : 'inherit',
      },
    },
    '& .MuiSelect-icon': {
      color: themeMode === 'dark' ? '#ffffff' : 'inherit',
    },
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" gutterBottom>
          Attendance Dashboard
        </Typography>
        <Button 
          variant="contained" 
          onClick={onBack}
          sx={{
            bgcolor: 'var(--accent-color)',
            '&:hover': {
              bgcolor: themeMode === 'dark' ? '#64b5f6' : '#1565c0',
            }
          }}
        >
          Back to Home
        </Button>
      </Box>

      {/* Filter Buttons */}
      <Box mb={3}>
        <Button 
          variant={filterType === 'date' ? 'contained' : 'outlined'} 
          onClick={() => handleFilterTypeChange('date')}
          sx={{ 
            mr: 2,
            bgcolor: filterType === 'date' ? 'var(--accent-color)' : 'transparent',
            borderColor: 'var(--accent-color)',
            color: filterType === 'date' ? '#fff' : 'var(--accent-color)',
            '&:hover': {
              bgcolor: filterType === 'date' 
                ? (themeMode === 'dark' ? '#64b5f6' : '#1565c0') 
                : 'var(--hover-color)',
            }
          }}
        >
          Filter by Date
        </Button>
        <Button 
          variant={filterType === 'roll' ? 'contained' : 'outlined'} 
          onClick={() => handleFilterTypeChange('roll')}
          sx={{ 
            bgcolor: filterType === 'roll' ? 'var(--accent-color)' : 'transparent',
            borderColor: 'var(--accent-color)',
            color: filterType === 'roll' ? '#fff' : 'var(--accent-color)',
            '&:hover': {
              bgcolor: filterType === 'roll' 
                ? (themeMode === 'dark' ? '#64b5f6' : '#1565c0') 
                : 'var(--hover-color)',
            }
          }}
        >
          Filter by Roll Number
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ ...paperStyle, p: 3, mb: 4 }}>
        <Grid container spacing={3} alignItems="center">
          {/* Date Range Toggle */}
          <Grid item xs={12}>
            <Button 
              variant={dateRangeMode ? 'contained' : 'outlined'} 
              onClick={handleDateRangeModeChange}
              sx={{ 
                mr: 2,
                bgcolor: dateRangeMode ? 'var(--accent-color)' : 'transparent',
                borderColor: 'var(--accent-color)',
                color: dateRangeMode ? '#fff' : 'var(--accent-color)',
                '&:hover': {
                  bgcolor: dateRangeMode 
                    ? (themeMode === 'dark' ? '#64b5f6' : '#1565c0') 
                    : 'var(--hover-color)',
                }
              }}
            >
              {dateRangeMode ? 'Date Range Mode' : 'Single Date Mode'}
            </Button>
          </Grid>

          {/* Date Selection */}
          {filterType === 'date' ? (
            dateRangeMode ? (
              <>
                <Grid item xs={12} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
                    <DatePicker
                      label="Start Date"
                      value={startDate}
                      onChange={handleStartDateChange}
                      format="dd-MM-yyyy"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          sx: inputFieldStyle
                        }
                      }}
                      sx={{
                        '& .MuiInputBase-input': {
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                        },
                        '& .MuiSvgIcon-root': {
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                        },
                      }}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
                    <DatePicker
                      label="End Date"
                      value={endDate}
                      onChange={handleEndDateChange}
                      format="dd-MM-yyyy"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          sx: inputFieldStyle
                        }
                      }}
                      sx={{
                        '& .MuiInputBase-input': {
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                        },
                        '& .MuiSvgIcon-root': {
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                        },
                      }}
                    />
                  </LocalizationProvider>
                </Grid>
              </>
            ) : (
              <Grid item xs={12} md={4}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
                  <DatePicker
                    label="Select Date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    format="dd-MM-yyyy"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        sx: inputFieldStyle
                      }
                    }}
                    sx={{
                      '& .MuiInputBase-input': {
                        color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                      },
                      '& .MuiSvgIcon-root': {
                        color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                      },
                    }}
                  />
                </LocalizationProvider>
              </Grid>
            )
          ) : (
            <>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Roll Number"
                  value={rollNumber}
                  onChange={handleRollNumberChange}
                  fullWidth
                  required
                  sx={inputFieldStyle}
                />
              </Grid>
              {dateRangeMode ? (
                <>
                  <Grid item xs={12} md={3}>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
                      <DatePicker
                        label="Start Date"
                        value={startDate}
                        onChange={handleStartDateChange}
                        format="dd-MM-yyyy"
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            required: true,
                            sx: inputFieldStyle
                          }
                        }}
                        sx={{
                          '& .MuiInputBase-input': {
                            color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                          },
                          '& .MuiSvgIcon-root': {
                            color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                          },
                        }}
                      />
                    </LocalizationProvider>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
                      <DatePicker
                        label="End Date"
                        value={endDate}
                        onChange={handleEndDateChange}
                        format="dd-MM-yyyy"
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            required: true,
                            sx: inputFieldStyle
                          }
                        }}
                        sx={{
                          '& .MuiInputBase-input': {
                            color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                          },
                          '& .MuiSvgIcon-root': {
                            color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                          },
                        }}
                      />
                    </LocalizationProvider>
                  </Grid>
                </>
              ) : (
                <Grid item xs={12} md={4}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
                    <DatePicker
                      label="Select Date"
                      value={selectedDate}
                      onChange={handleDateChange}
                      format="dd-MM-yyyy"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          sx: inputFieldStyle
                        }
                      }}
                      sx={{
                        '& .MuiInputBase-input': {
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                        },
                        '& .MuiSvgIcon-root': {
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                        },
                      }}
                    />
                  </LocalizationProvider>
                </Grid>
              )}
            </>
          )}
          
          {/* Course and Semester filters - only show for date filter */}
          {filterType === 'date' && (
            <>
              <Grid item xs={12} md={dateRangeMode ? 2 : 3}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: themeMode === 'dark' ? '#ffffff' : 'inherit' }}>
                    Course
                  </InputLabel>
                  <Select
                    value={selectedCourse}
                    onChange={handleCourseChange}
                    label="Course"
                    sx={selectStyle}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          bgcolor: themeMode === 'dark' ? '#333' : '#fff',
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                          '& .MuiMenuItem-root': {
                            color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                            '&:hover': {
                              bgcolor: themeMode === 'dark' ? '#555' : 'rgba(0, 0, 0, 0.04)',
                            },
                          },
                        }
                      }
                    }}
                  >
                    <MenuItem value="">All Courses</MenuItem>
                    {courses.map((course) => (
                      <MenuItem key={course} value={course}>{course}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12} md={dateRangeMode ? 2 : 3}>
                <FormControl fullWidth>
                  <InputLabel sx={{ color: themeMode === 'dark' ? '#ffffff' : 'inherit' }}>
                    Semester
                  </InputLabel>
                  <Select
                    value={selectedSemester}
                    onChange={handleSemesterChange}
                    label="Semester"
                    sx={selectStyle}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          bgcolor: themeMode === 'dark' ? '#333' : '#fff',
                          color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                          '& .MuiMenuItem-root': {
                            color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                            '&:hover': {
                              bgcolor: themeMode === 'dark' ? '#555' : 'rgba(0, 0, 0, 0.04)',
                            },
                          },
                        }
                      }
                    }}
                  >
                    <MenuItem value="">All Semesters</MenuItem>
                    {semesters.map((semester) => (
                      <MenuItem key={semester} value={semester}>{semester}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </>
          )}
          
          <Grid item xs={12} md={2}>
            <Button 
              variant="contained" 
              fullWidth
              onClick={filterType === 'date' ? fetchAttendanceByDate : fetchAttendanceByRollNumber}
              disabled={filterType === 'roll' && (!rollNumber.trim() || (!selectedDate && !dateRangeMode) || (dateRangeMode && (!startDate || !endDate)))}
              sx={{
                bgcolor: 'var(--accent-color)',
                '&:hover': {
                  bgcolor: themeMode === 'dark' ? '#64b5f6' : '#1565c0',
                }
              }}
            >
              Apply Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Display error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Loading indicator */}
      {loading && (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress sx={{ color: 'var(--accent-color)' }} />
        </Box>
      )}

      {/* Download PDF Button - Show only when data is available */}
      {!loading && filteredData.length > 0 && (
        <Box display="flex" justifyContent="flex-end" mb={2}>
          <Button 
            variant="contained" 
            onClick={downloadPDF}
            sx={{
              bgcolor: '#4caf50', // Green color for download
              color: '#fff',
              '&:hover': {
                bgcolor: '#45a049',
              }
            }}
          >
            📄 Download PDF
          </Button>
        </Box>
      )}

      {/* Attendance Table */}
      {!loading && filteredData.length > 0 ? (
        <TableContainer component={Paper} sx={paperStyle}>
          <Table sx={{ ...tableStyle, minWidth: 800 }} stickyHeader>
            <TableHead>
              <TableRow sx={{ bgcolor: themeMode === 'dark' ? '#424242' : '#f5f5f5' }}>
                <TableCell sx={{ minWidth: 120 }}>
                  <Box
                    component="button"
                    onClick={() => handleSort('date')}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      padding: 0,
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    Date <span style={{ fontSize: '12px', marginLeft: '4px' }}>{getSortIcon('date')}</span>
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 100 }}>
                  <Box
                    component="button"
                    onClick={() => handleSort('timestamp')}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      padding: 0,
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    Time <span style={{ fontSize: '12px', marginLeft: '4px' }}>{getSortIcon('timestamp')}</span>
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 140 }}>
                  <Box
                    component="button"
                    onClick={() => handleSort('roll_number')}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      padding: 0,
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    Roll No <span style={{ fontSize: '12px', marginLeft: '4px' }}>{getSortIcon('roll_number')}</span>
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 150 }}>
                  <Box
                    component="button"
                    onClick={() => handleSort('name')}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      padding: 0,
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    Name <span style={{ fontSize: '12px', marginLeft: '4px' }}>{getSortIcon('name')}</span>
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <Box
                    component="button"
                    onClick={() => handleSort('attendance_status')}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      padding: 0,
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    Attendance <span style={{ fontSize: '12px', marginLeft: '4px' }}>{getSortIcon('attendance_status')}</span>
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 200 }}>
                  <Box
                    component="button"
                    onClick={() => handleSort('course')}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      padding: 0,
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    Course <span style={{ fontSize: '12px', marginLeft: '4px' }}>{getSortIcon('course')}</span>
                  </Box>
                </TableCell>
                <TableCell sx={{ minWidth: 120 }}>
                  <Box
                    component="button"
                    onClick={() => handleSort('semester')}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'bold',
                      padding: 0,
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    Semester <span style={{ fontSize: '12px', marginLeft: '4px' }}>{getSortIcon('semester')}</span>
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredData.map((record, index) => (
                <TableRow key={index}>
                  <TableCell>{record.date}</TableCell>
                  <TableCell>{record.timestamp || 'N/A'}</TableCell>
                  <TableCell>{record.roll_number || record.roll_no || 'N/A'}</TableCell>
                  <TableCell>{record.name}</TableCell>
                  <TableCell>
                    <span style={{
                      color: (record.attendance_status === 'Present' || !record.attendance_status) ? '#4caf50' : '#f44336',
                      fontWeight: 'bold'
                    }}>
                      {record.attendance_status || 'Present'}
                    </span>
                  </TableCell>
                  <TableCell>{record.course}</TableCell>
                  <TableCell>{record.semester}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : !loading && (
        <Box textAlign="center" py={4}>
          <Typography variant="subtitle1" color="textSecondary">
            No attendance records found. Try adjusting your filters.
          </Typography>
        </Box>
      )}
    </Container>
  );
};

export default Dashboard;