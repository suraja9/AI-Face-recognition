import { useState, useEffect, useContext } from 'react';
import {
  Container, Typography, Paper, Grid, Box, CircularProgress,
  Alert, FormControl, InputLabel, Select, MenuItem, TextField,
  Button, Card, CardContent, Chip, Avatar, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination
} from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area} from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { ThemeContext } from './ThemeContext';
import {
  TrendingUp, People, School, CalendarToday,
  Assessment, BarChart as BarChartIcon,
  Person, StarBorder
} from '@mui/icons-material';

const AttendanceAnalytics = ({ onBack }) => {
  const { themeMode } = useContext(ThemeContext);
  
  // State variables
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [courses, setCourses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [dateRange, setDateRange] = useState(7);
  const [startDate, setStartDate] = useState(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState(new Date());

  // Chart data states
  const [dailyAttendanceData, setDailyAttendanceData] = useState([]);
  const [courseWiseData, setCourseWiseData] = useState([]);
  const [semesterWiseData, setSemesterWiseData] = useState([]);
  const [studentWiseData, setStudentWiseData] = useState([]);
  const [topStudentsData, setTopStudentsData] = useState([]);
  const [chartTitle, setChartTitle] = useState('🏆 Top Students by Attendance per Course');
  const [topStudentsDisplayCount, setTopStudentsDisplayCount] = useState(5);
  const [summaryStats, setSummaryStats] = useState({});

  // Table pagination states
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Cache for attendance data
  const [attendanceCache, setAttendanceCache] = useState(new Map());

  // Color schemes for charts
  const chartColors = {
    primary: themeMode === 'dark' ? '#90caf9' : '#1976d2',
    secondary: themeMode === 'dark' ? '#f48fb1' : '#d32f2f',
    success: themeMode === 'dark' ? '#a5d6a7' : '#388e3c',
    warning: themeMode === 'dark' ? '#ffcc02' : '#f57c00',
    info: themeMode === 'dark' ? '#81d4fa' : '#0288d1',
    background: themeMode === 'dark' ? '#424242' : '#ffffff'
  };

  const pieColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0', '#ffb347'];

  useEffect(() => {
    fetchCoursesAndSemesters();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchAnalyticsData();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [selectedCourse, selectedSemester, startDate, endDate]);

  useEffect(() => {
    setPage(0);
  }, [studentWiseData]);

  const fetchCoursesAndSemesters = async () => {
    try {
      const response = await fetch('http://localhost:5000/get-courses-semesters');
      const data = await response.json();
      
      if (data.success) {
        setCourses(data.courses || []);
        setSemesters(data.semesters || []);
      } else {
        setCourses(['CSE', 'IT', 'ECE', 'ME']);
        setSemesters(['1', '2', '3', '4', '5', '6', '7', '8']);
      }
    } catch (error) {
      console.error('Error fetching courses and semesters:', error);
      setCourses(['CSE', 'IT', 'ECE', 'ME']);
      setSemesters(['1', '2', '3', '4', '5', '6', '7', '8']);
    }
  };

  const fetchAnalyticsData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const cacheKey = `${format(startDate, 'yyyy-MM-dd')}-${format(endDate, 'yyyy-MM-dd')}-${selectedCourse}-${selectedSemester}`;
      
      if (attendanceCache.has(cacheKey)) {
        const cachedData = attendanceCache.get(cacheKey);
        setAttendanceData(cachedData);
        processAnalyticsData(cachedData);
        setLoading(false);
        return;
      }

      const dateInterval = eachDayOfInterval({ start: startDate, end: endDate });
      let allData = [];
      
      const chunkSize = 5;
      const dateChunks = [];
      for (let i = 0; i < dateInterval.length; i += chunkSize) {
        dateChunks.push(dateInterval.slice(i, i + chunkSize));
      }

      for (let chunkIndex = 0; chunkIndex < dateChunks.length; chunkIndex++) {
        const chunk = dateChunks[chunkIndex];
        
        if (chunkIndex > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const chunkPromises = chunk.map(async (date) => {
          const formattedDate = format(date, 'yyyy-MM-dd');
          
          const dateCacheKey = `${formattedDate}-${selectedCourse}-${selectedSemester}`;
          if (attendanceCache.has(dateCacheKey)) {
            return attendanceCache.get(dateCacheKey);
          }

          const url = `http://localhost:5000/get-attendance-by-date?date=${formattedDate}${
            selectedCourse ? `&course=${selectedCourse}` : ''
          }${selectedSemester ? `&semester=${selectedSemester}` : ''}`;
          
          try {
            const response = await fetch(url);
            const data = await response.json();
            
            let dateData = [];
            if (data.success && data.attendance.length > 0) {
              data.attendance.forEach(record => {
                if (record.students && Array.isArray(record.students)) {
                  record.students.forEach(student => {
                    dateData.push({
                      date: record.date,
                      formattedDate: format(date, 'MMM dd'),
                      ...student
                    });
                  });
                }
              });
            }
            
            attendanceCache.set(dateCacheKey, dateData);
            return dateData;
          } catch (err) {
            console.error(`Error fetching data for ${formattedDate}:`, err);
            return [];
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        allData = allData.concat(chunkResults.flat());
      }
      
      setAttendanceCache(prev => new Map(prev.set(cacheKey, allData)));
      
      setAttendanceData(allData);
      processAnalyticsData(allData);
      
    } catch (error) {
      console.error('Error fetching analytics data:', error);
      setError('Error loading analytics data. Please try reducing the date range.');
    } finally {
      setLoading(false);
    }
  };

  const generateTopStudentsData = (studentData) => {
    let topStudentsForChart = [];
    let title = '';

    if (selectedCourse && selectedSemester) {
      const filteredStudents = studentData.filter(student => 
        student.course === selectedCourse && student.semester === selectedSemester
      );
      topStudentsForChart = filteredStudents
        .slice(0, topStudentsDisplayCount)
        .map(student => ({
          name: student.name,
          value: student.attendanceCount,
          course: student.course,
          semester: student.semester,
          rollno: student.rollno,
          displayName: `${student.name} (${student.rollno})`
        }));
      title = `🏆 Top Students in ${selectedCourse} - Semester ${selectedSemester}`;
      
    } else if (selectedCourse) {
      const filteredStudents = studentData.filter(student => student.course === selectedCourse);
      topStudentsForChart = filteredStudents
        .slice(0, topStudentsDisplayCount)
        .map(student => ({
          name: student.name,
          value: student.attendanceCount,
          course: student.course,
          semester: student.semester,
          rollno: student.rollno,
          displayName: `${student.name} (Sem ${student.semester})`
        }));
      title = `🏆 Top Students in ${selectedCourse}`;
      
    } else if (selectedSemester) {
      const filteredStudents = studentData.filter(student => student.semester === selectedSemester);
      topStudentsForChart = filteredStudents
        .slice(0, topStudentsDisplayCount)
        .map(student => ({
          name: student.name,
          value: student.attendanceCount,
          course: student.course,
          semester: student.semester,
          rollno: student.rollno,
          displayName: `${student.name} (${student.course})`
        }));
      title = `🏆 Top Students in Semester ${selectedSemester}`;
      
    } else {
      const courseWiseStudents = {};
      studentData.forEach(student => {
        const course = student.course;
        if (!courseWiseStudents[course]) {
          courseWiseStudents[course] = [];
        }
        courseWiseStudents[course].push(student);
      });

      Object.keys(courseWiseStudents).forEach(course => {
        const topStudentInCourse = courseWiseStudents[course]
          .sort((a, b) => b.attendanceCount - a.attendanceCount)[0];
        
        if (topStudentInCourse) {
          topStudentsForChart.push({
            name: topStudentInCourse.name,
            value: topStudentInCourse.attendanceCount,
            course: topStudentInCourse.course,
            semester: topStudentInCourse.semester,
            rollno: topStudentInCourse.rollno,
            displayName: `${topStudentInCourse.name} (${course})`
          });
        }
      });
      title = '🏆 Top Students by Attendance per Course';
    }

    setTopStudentsData(topStudentsForChart);
    setChartTitle(title);
  };

  const processAnalyticsData = (data) => {
    const totalPossibleDays = Math.max(1, eachDayOfInterval({ start: startDate, end: endDate }).length);
    // Daily attendance trends
    const dailyStats = {};
    data.forEach(record => {
      const date = record.formattedDate;
      if (!dailyStats[date]) {
        dailyStats[date] = { date, count: 0, students: new Set() };
      }
      dailyStats[date].count++;
      dailyStats[date].students.add(record.name);
    });
    
    const dailyData = Object.values(dailyStats).map(stat => ({
      date: stat.date,
      attendance: stat.count,
      uniqueStudents: stat.students.size
    }));
    setDailyAttendanceData(dailyData);

    // Course-wise distribution
    const courseStats = {};
    data.forEach(record => {
      const course = record.course || 'Unknown';
      if (!courseStats[course]) {
        courseStats[course] = { course, count: 0, students: new Set() };
      }
      courseStats[course].count++;
      courseStats[course].students.add(record.name);
    });

    const courseData = Object.values(courseStats).map(stat => ({
      course: abbreviateCourse(stat.course),        // Abbreviated name for X-axis display
      fullCourseName: stat.course,                  // Full name for tooltip
      attendance: stat.count,
      students: stat.students.size
    }));
    setCourseWiseData(courseData);

    // Semester-wise distribution
    const semesterStats = {};
    data.forEach(record => {
      const semester = record.semester || 'Unknown';
      if (!semesterStats[semester]) {
        semesterStats[semester] = { semester, count: 0, students: new Set() };
      }
      semesterStats[semester].count++;
      semesterStats[semester].students.add(record.name);
    });
    
    const semesterData = Object.values(semesterStats).map(stat => ({
      name: `Sem ${stat.semester}`,
      value: stat.count,
      students: stat.students.size
    }));
    setSemesterWiseData(semesterData);

    // Student-wise distribution
    const studentStats = {};
    data.forEach(record => {
      const studentName = record.name || 'Unknown';
      // Try multiple possible field names for roll number
      const studentId = record.rollno || record.roll_no || record.rollNumber || 
                      record.roll || record.student_id || record.id || 'N/A';
      const course = record.course || 'Unknown';
      const semester = record.semester || 'Unknown';
      
      const studentKey = `${studentName}_${studentId}`;
      
      if (!studentStats[studentKey]) {
        studentStats[studentKey] = {
          name: studentName,
          rollno: studentId,
          course: course,
          semester: semester,
          attendanceCount: 0,
          dates: new Set()
        };
      }
      studentStats[studentKey].attendanceCount++;
      studentStats[studentKey].dates.add(record.date);
    });
    
    const studentData = Object.values(studentStats)
      .map(stat => {
        const uniqueDays = stat.dates.size;
        const attendanceRate = totalPossibleDays > 0 ? 
          ((uniqueDays / totalPossibleDays) * 100).toFixed(1) : '0.0';
        
        return {
          ...stat,
          uniqueDays: uniqueDays,
          attendanceRate: attendanceRate
        };
      })
      .sort((a, b) => b.attendanceCount - a.attendanceCount);
    
    setStudentWiseData(studentData);
    
    // Generate dynamic top students data
    generateTopStudentsData(studentData);

    // Summary statistics
    const uniqueStudents = new Set(data.map(record => record.name)).size;
    const uniqueCourses = new Set(data.map(record => record.course)).size;
    const totalAttendance = data.length;
    const avgDailyAttendance = dailyData.length > 0 ? 
      (totalAttendance / dailyData.length).toFixed(1) : 0;

    setSummaryStats({
      totalAttendance,
      uniqueStudents,
      uniqueCourses,
      avgDailyAttendance,
      activeDays: dailyData.length,
      avgStudentAttendance: studentData.length > 0 ? 
        (studentData.reduce((sum, student) => sum + student.attendanceCount, 0) / studentData.length).toFixed(1) : 0
    });
  };

  const handleDateRangeChange = (days) => {
    setDateRange(days);
    setStartDate(subDays(new Date(), days));
    setEndDate(new Date());
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const clearCache = () => {
    setAttendanceCache(new Map());
    fetchAnalyticsData();
  };

  const clearFilters = () => {
    setSelectedCourse('');
    setSelectedSemester('');
    setTopStudentsDisplayCount(5);
    setPage(0);
  };

  const paperStyle = {
    borderRadius: 2,
    boxShadow: themeMode === 'dark' 
      ? '0 4px 20px rgba(0, 0, 0, 0.5)' 
      : '0 4px 20px rgba(0, 0, 0, 0.1)',
    bgcolor: 'var(--card-bg)',
    color: 'var(--text-primary)'
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Box
          sx={{
            bgcolor: chartColors.background,
            p: 2,
            border: '1px solid #ccc',
            borderRadius: 1,
            boxShadow: 2
          }}
        >
          <Typography variant="body2">{label}</Typography>
          {payload.map((entry, index) => (
            <Typography key={index} variant="body2" sx={{ color: entry.color }}>
              {`${entry.dataKey}: ${entry.value}`}
            </Typography>
          ))}
        </Box>
      );
    }
    return null;
  };

  const EnhancedStudentTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            bgcolor: chartColors.background,
            p: 2,
            border: '1px solid #ccc',
            borderRadius: 1,
            boxShadow: 2,
            minWidth: 200
          }}
        >
          <Typography variant="body2" fontWeight="bold">{data.name}</Typography>
          <Typography variant="body2">Roll No: {data.rollno}</Typography>
          <Typography variant="body2">Course: {data.course}</Typography>
          <Typography variant="body2">Semester: {data.semester}</Typography>
          <Typography variant="body2" color="primary">
            Attendance: {data.value} records
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const paginatedStudentData = studentWiseData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const abbreviateCourse = (courseName) => {
    const abbreviations = {
      'B.Tech in Computer Science and Engineering': 'CSE',
      'B.Tech in Information Technology': 'IT', 
      'B.Tech in Electronics and Communication Engineering': 'ECE',
      'B.Tech in Mechanical Engineering': 'ME',
      'B.Tech in Civil Engineering': 'CE',
      'B.Tech in Electrical Engineering': 'EE',
      'B.Tech in Biotechnology': 'BT',
      'B.Tech in Chemical Engineering': 'CHE',
      'Master of Computer Applications': 'MCA',
      'Bachelor of Computer Applications': 'BCA',
      'Computer Science and Engineering': 'CSE',
      'Information Technology': 'IT',
      'Electronics and Communication Engineering': 'ECE', 
      'Mechanical Engineering': 'ME',
      'Civil Engineering': 'CE',
      'Electrical Engineering': 'EE',
      'Biotechnology': 'BT',
      'Chemical Engineering': 'CHE',
      // Add more as needed
    };
    
    // Return abbreviated name if exists, otherwise try to create one
    if (abbreviations[courseName]) {
      return abbreviations[courseName];
    }
    
    // Auto-generate abbreviation for unknown courses
    if (courseName && courseName !== 'Unknown') {
      // Take first letter of each significant word
      const words = courseName.split(/\s+/)
        .filter(word => !['in', 'of', 'and', 'the', 'for'].includes(word.toLowerCase()))
        .slice(0, 3); // Limit to 3 words max
      
      if (words.length > 0) {
        return words.map(word => word.charAt(0).toUpperCase()).join('');
      }
    }
    
    return courseName.length > 6 ? courseName.substring(0, 6) : courseName;
  };

  // Enhanced Tooltip Component (replace your existing EnhancedCourseTooltip):
  const EnhancedCourseTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            bgcolor: chartColors.background,
            p: 2,
            border: '1px solid #ccc',
            borderRadius: 1,
            boxShadow: 3,
            minWidth: 200,
            maxWidth: 300
          }}
        >
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
            {data.fullCourseName || label}
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block' }}>
            Display: {data.course}
          </Typography>
          {payload.map((entry, index) => (
            <Typography key={index} variant="body2" sx={{ color: entry.color, mb: 0.5 }}>
              {entry.dataKey === 'attendance' ? 'Total Attendance' : 'Unique Students'}: {entry.value}
            </Typography>
          ))}
        </Box>
      );
    }
    return null;
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            📊 Attendance Analytics Dashboard
          </Typography>
          <Typography variant="subtitle1" color="textSecondary">
            Visual insights into attendance patterns and trends
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button 
            variant="outlined" 
            onClick={clearCache}
            disabled={loading}
            size="small"
          >
            Refresh Data
          </Button>
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
      </Box>

      {/* Filters */}
      <Paper sx={{ ...paperStyle, p: 3, mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          🔍 Filter Options
        </Typography>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Date Range</InputLabel>
              <Select
                value={dateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                label="Date Range"
              >
                <MenuItem value={7}>Last 7 days</MenuItem>
                <MenuItem value={15}>Last 15 days</MenuItem>
                <MenuItem value={30}>Last 30 days</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Start Date"
                value={startDate}
                onChange={setStartDate}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={setEndDate}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Course</InputLabel>
              <Select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                label="Course"
              >
                <MenuItem value="">All Courses</MenuItem>
                {courses.map((course) => (
                  <MenuItem key={course} value={course}>{course}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Semester</InputLabel>
              <Select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                label="Semester"
              >
                <MenuItem value="">All Semesters</MenuItem>
                {semesters.map((semester) => (
                  <MenuItem key={semester} value={semester}>{semester}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={2}>
            <Button
              variant="outlined"
              size="small"
              onClick={clearFilters}
              disabled={!selectedCourse && !selectedSemester}
              sx={{ height: '56px', width: '100%' }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
        
        <Box mt={2}>
          <Typography variant="caption" color="textSecondary">
            📝 Cached data entries: {attendanceCache.size} | 
            {loading ? ' Loading...' : ' Ready'} |
            💡 Tip: Use smaller date ranges (7-15 days) for better performance
          </Typography>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" my={4}>
          <CircularProgress sx={{ color: 'var(--accent-color)' }} />
          <Typography variant="body2" sx={{ ml: 2, alignSelf: 'center' }}>
            Loading attendance data...
          </Typography>
        </Box>
      ) : (
        <>
          {/* Summary Cards */}
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={paperStyle}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Total Attendance
                      </Typography>
                      <Typography variant="h4">
                        {summaryStats.totalAttendance || 0}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: chartColors.primary }}>
                      <Assessment />
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={paperStyle}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Unique Students
                      </Typography>
                      <Typography variant="h4">
                        {summaryStats.uniqueStudents || 0}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: chartColors.success }}>
                      <People />
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={paperStyle}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Active Courses
                      </Typography>
                      <Typography variant="h4">
                        {summaryStats.uniqueCourses || 0}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: chartColors.warning }}>
                      <School />
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={paperStyle}>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography color="textSecondary" gutterBottom>
                        Avg Student Attendance
                      </Typography>
                      <Typography variant="h4">
                        {summaryStats.avgStudentAttendance || 0}
                      </Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: chartColors.info }}>
                      <TrendingUp />
                    </Avatar>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Charts Grid */}
          <Grid container spacing={3}>
            {/* Daily Attendance Trend */}
            <Grid item xs={12} lg={8}>
              <Paper sx={{ ...paperStyle, p: 4 }}>
                <Typography variant="h6" gutterBottom>
                  📈 Daily Attendance Trends
                </Typography>
                <ResponsiveContainer width="100%" height={450}>
                  <AreaChart data={dailyAttendanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="attendance"
                      stroke={chartColors.primary}
                      fill={chartColors.primary}
                      fillOpacity={0.3}
                      name="Total Attendance"
                    />
                    <Area
                      type="monotone"
                      dataKey="uniqueStudents"
                      stroke={chartColors.success}
                      fill={chartColors.success}
                      fillOpacity={0.3}
                      name="Unique Students"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Dynamic Top Students Chart - Improved Version */}
            <Grid item xs={12} lg={4}>
              <Paper sx={{ ...paperStyle, p: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
                    {chartTitle}
                  </Typography>
                  {(selectedCourse || selectedSemester) && (
                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <InputLabel>Top</InputLabel>
                      <Select
                        value={topStudentsDisplayCount}
                        onChange={(e) => {
                          setTopStudentsDisplayCount(e.target.value);
                          if (studentWiseData.length > 0) {
                            generateTopStudentsData(studentWiseData);
                          }
                        }}
                        label="Top"
                      >
                        <MenuItem value={3}>3</MenuItem>
                        <MenuItem value={5}>5</MenuItem>
                        <MenuItem value={10}>10</MenuItem>
                        <MenuItem value={15}>15</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                </Box>
                
                {topStudentsData.length > 0 ? (
                  <Box>
                    {/* Pie Chart */}
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={topStudentsData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={90}
                          paddingAngle={2}
                          fill="#8884d8"
                          dataKey="value"
                          label={false} // Remove labels from pie slices
                        >
                          {topStudentsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<EnhancedStudentTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    
                    {/* Improved Custom Legend Below Chart */}
                    <Box sx={{ mt: 2, maxHeight: 200, overflowY: 'auto' }}>
                      {topStudentsData.map((entry, index) => (
                        <Box 
                          key={`legend-${index}`} 
                          display="flex" 
                          alignItems="flex-start" 
                          sx={{ 
                            mb: 1.5, 
                            p: 1.5, 
                            borderRadius: 2,
                            bgcolor: index % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent',
                            '&:hover': {
                              bgcolor: 'rgba(0,0,0,0.05)'
                            },
                            border: '1px solid',
                            borderColor: 'divider'
                          }}
                        >
                          {/* Color indicator */}
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              bgcolor: pieColors[index % pieColors.length],
                              mr: 2,
                              flexShrink: 0,
                              mt: 0.5
                            }}
                          />
                          
                          {/* Student info */}
                          <Box flex={1} minWidth={0}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                lineHeight: 1.2,
                                mb: 0.5,
                                wordBreak: 'break-word'
                              }}
                            >
                              {entry.name}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              color="textSecondary"
                              sx={{ 
                                fontSize: '0.75rem',
                                display: 'block',
                                lineHeight: 1.1
                              }}
                            >
                              {entry.rollno !== 'N/A' ? `Roll: ${entry.rollno}` : ''} 
                              {entry.rollno !== 'N/A' && entry.course !== 'Unknown' ? ' | ' : ''}
                              {entry.course !== 'Unknown' ? `${entry.course}` : ''}
                              {entry.semester !== 'Unknown' ? ` - Sem ${entry.semester}` : ''}
                            </Typography>
                          </Box>
                          
                          {/* Attendance stats */}
                          <Box display="flex" flexDirection="column" alignItems="flex-end" ml={1}>
                            <Chip
                              label={entry.value}
                              size="small"
                              variant="filled"
                              sx={{ 
                                fontSize: '0.75rem', 
                                height: 22,
                                bgcolor: pieColors[index % pieColors.length],
                                color: 'white',
                                fontWeight: 600,
                                mb: 0.5,
                                '& .MuiChip-label': { px: 1 }
                              }}
                            />
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: pieColors[index % pieColors.length]
                              }}
                            >
                              {((entry.value / topStudentsData.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : (
                  <Box 
                    display="flex" 
                    alignItems="center" 
                    justifyContent="center" 
                    height={300}
                    sx={{ 
                      bgcolor: 'grey.50', 
                      borderRadius: 2,
                      border: '2px dashed',
                      borderColor: 'grey.300'
                    }}
                  >
                    <Box textAlign="center">
                      <Typography variant="h6" color="textSecondary" sx={{ mb: 1 }}>
                        📊 No Data Available
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        No students found for the selected filters
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Paper>
            </Grid>

            {/* Course-wise Analysis */}
            <Grid item xs={12} lg={6}>
              <Paper sx={{ ...paperStyle, p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  🎓 Course-wise Attendance
                </Typography>
                <ResponsiveContainer width="100%" height={480}>
                  <BarChart 
                    data={courseWiseData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }} // Increased bottom margin
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="course" // This now uses the abbreviated name
                      angle={0}
                      textAnchor="end"
                      height={160}
                      fontSize={12}
                      interval={0} // Show all labels
                      tick={{ fontSize: 20 }} // Slightly smaller font
                    />
                    <YAxis />
                    <Tooltip content={<EnhancedCourseTooltip />} />
                    <Legend />
                    <Bar 
                      dataKey="attendance" 
                      fill={chartColors.primary} 
                      name="Total Attendance"
                      radius={[2, 2, 0, 0]} // Rounded top corners
                    />
                    <Bar 
                      dataKey="students" 
                      fill={chartColors.success} 
                      name="Unique Students"
                      radius={[2, 2, 0, 0]} // Rounded top corners
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* Semester Distribution */}
            <Grid item xs={12} lg={6}>
              <Paper sx={{ ...paperStyle, p: 3 }}>
                <Typography variant="h6" gutterBottom>
                  📚 Semester-wise Distribution
                </Typography>
                <ResponsiveContainer width="100%" height={480}>
                  <PieChart>
                    <Pie
                      data={semesterWiseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                    >
                      {semesterWiseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
          </Grid>

          {/* Student Details Table - Modified to show all students with pagination */}
          <Paper sx={{ ...paperStyle, p: 3, mt: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">
                👥 All Students Attendance Details ({studentWiseData.length} students)
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Showing students from {format(startDate, 'MMM dd, yyyy')} to {format(endDate, 'MMM dd, yyyy')}
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>Student Name</TableCell>
                    <TableCell>Roll Number</TableCell>
                    <TableCell>Course</TableCell>
                    <TableCell>Semester</TableCell>
                    <TableCell align="right">Total Attendance</TableCell>
                    <TableCell align="right">Unique Days</TableCell>
                    <TableCell align="right">Attendance Rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedStudentData.map((student, index) => {
                    const actualRank = page * rowsPerPage + index + 1;
                    return (
                      <TableRow key={`${student.name}_${student.rollno}`} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            {actualRank <= 3 ? (
                              <StarBorder sx={{ 
                                color: actualRank === 1 ? '#FFD700' : actualRank === 2 ? '#C0C0C0' : '#CD7F32', 
                                mr: 1 
                              }} />
                            ) : null}
                            {actualRank}
                          </Box>
                        </TableCell>
                        <TableCell>{student.name}</TableCell>
                        <TableCell>{student.rollno}</TableCell>
                        <TableCell>{student.course}</TableCell>
                        <TableCell>{student.semester}</TableCell>
                        <TableCell align="right">{student.attendanceCount}</TableCell>
                        <TableCell align="right">{student.uniqueDays}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${student.attendanceRate}%`}
                            size="small"
                            sx={{
                              // Dynamic styling based on attendance rate and theme
                              ...(parseFloat(student.attendanceRate) >= 90 ? {
                                // High attendance (90%+) - Green
                                bgcolor: themeMode === 'dark' ? 'rgba(52, 228, 8, 0.2)' : 'rgba(76, 175, 80, 0.1)',
                                color: themeMode === 'dark' ? '#81c784' : '#2e7d32',
                                border: `1px solid ${themeMode === 'dark' ? '#81c784' : '#4caf50'}`,
                              } : parseFloat(student.attendanceRate) >= 75 ? {
                                // Medium attendance (75-89%) - Orange/Warning
                                bgcolor: themeMode === 'dark' ? 'rgba(32, 8, 241, 0.29)' : 'rgba(255, 152, 0, 0.1)',
                                color: themeMode === 'dark' ? '#ffb74d' : '#ef6c00',
                                border: `1px solid ${themeMode === 'dark' ? '#ffb74d' : '#ff9800'}`,
                              } : {
                                // Low attendance (<75%) - Red/Error
                                bgcolor: themeMode === 'dark' ? 'rgba(58, 209, 20, 0.27)' : 'rgba(244, 67, 54, 0.1)',
                                color: themeMode === 'dark' ? '#e57373' : '#c62828',
                                border: `1px solid ${themeMode === 'dark' ? '#e57373' : '#f44336'}`,
                              }),
                              fontWeight: 600,
                              minWidth: '60px',
                              '&:hover': {
                                ...(parseFloat(student.attendanceRate) >= 90 ? {
                                  bgcolor: themeMode === 'dark' ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.15)',
                                } : parseFloat(student.attendanceRate) >= 75 ? {
                                  bgcolor: themeMode === 'dark' ? 'rgba(255, 152, 0, 0.3)' : 'rgba(255, 152, 0, 0.15)',
                                } : {
                                  bgcolor: themeMode === 'dark' ? 'rgba(244, 67, 54, 0.3)' : 'rgba(244, 67, 54, 0.15)',
                                })
                              }
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={studentWiseData.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{
                borderTop: '1px solid',
                borderColor: 'divider',
                mt: 2,
                // Enhanced dark mode styling
                backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
                borderRadius: '0 0 8px 8px',
                padding: '12px 16px',
                
                // Main pagination text
                '& .MuiTablePagination-root': {
                  color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                },
                
                // "Rows per page" and other caption text
                '& .MuiTablePagination-caption': {
                  color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                },
                
                // Dropdown for rows per page
                '& .MuiTablePagination-select': {
                  color: themeMode === 'dark' ? '#ffffff' : 'inherit',
                  backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.1)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  minWidth: '45px',
                  '&:hover': {
                    backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                  },
                  '&:focus': {
                    backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)',
                    borderColor: themeMode === 'dark' ? '#90caf9' : '#1976d2',
                    outline: 'none',
                  },
                },
                
                // Dropdown arrow icon
                '& .MuiTablePagination-selectIcon': {
                  color: themeMode === 'dark' ? '#e0e0e0' : 'rgba(0, 0, 0, 0.54)',
                },
                
                // Page navigation buttons container
                '& .MuiTablePagination-actions': {
                  marginLeft: '16px',
                  '& .MuiIconButton-root': {
                    color: themeMode === 'dark' ? '#e0e0e0' : 'rgba(0, 0, 0, 0.54)',
                    backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                    border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.12)',
                    borderRadius: '6px',
                    margin: '0 3px',
                    padding: '6px',
                    minWidth: '32px',
                    minHeight: '32px',
                    transition: 'all 0.2s ease-in-out',
                    
                    '&:hover': {
                      backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                      borderColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                      color: themeMode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
                      transform: 'translateY(-1px)',
                      boxShadow: themeMode === 'dark' 
                        ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
                        : '0 2px 4px rgba(0, 0, 0, 0.1)',
                    },
                    
                    '&:active': {
                      transform: 'translateY(0px)',
                      backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.12)',
                    },
                    
                    // Disabled state
                    '&.Mui-disabled': {
                      color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.26)',
                      backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                      border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(0, 0, 0, 0.06)',
                      cursor: 'not-allowed',
                      transform: 'none',
                      boxShadow: 'none',
                      
                      '&:hover': {
                        transform: 'none',
                        backgroundColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                        borderColor: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                      },
                    },
                    
                    // SVG icons inside buttons
                    '& .MuiSvgIcon-root': {
                      fontSize: '1.1rem',
                      transition: 'color 0.2s ease-in-out',
                    },
                  },
                },
                
                // Page range text (e.g., "1–25 of 100")
                '& .MuiTablePagination-displayedRows': {
                  color: themeMode === 'dark' ? '#e0e0e0' : 'rgba(0, 0, 0, 0.87)',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  margin: '0 16px',
                },
                
                // Responsive adjustments
                '@media (max-width: 768px)': {
                  padding: '8px 12px',
                  '& .MuiTablePagination-caption': {
                    fontSize: '0.8rem',
                  },
                  '& .MuiTablePagination-displayedRows': {
                    fontSize: '0.8rem',
                    margin: '0 8px',
                  },
                  '& .MuiTablePagination-actions': {
                    marginLeft: '8px',
                    '& .MuiIconButton-root': {
                      margin: '0 2px',
                      minWidth: '28px',
                      minHeight: '28px',
                      padding: '4px',
                    },
                  },
                },
              }}
            />
          </Paper>

          {/* Additional Insights */}
          <Paper sx={{ ...paperStyle, p: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              💡 Key Insights
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Chip
                  icon={<CalendarToday />}
                  label={`${summaryStats.activeDays || 0} Active Days`}
                  sx={{ 
                    m: 1,
                    bgcolor: themeMode === 'dark' ? 'rgba(144, 202, 249, 0.15)' : 'rgba(25, 118, 210, 0.08)',
                    color: themeMode === 'dark' ? '#90caf9' : '#1976d2',
                    border: `1px solid ${themeMode === 'dark' ? '#90caf9' : '#1976d2'}`,
                    '& .MuiChip-icon': {
                      color: themeMode === 'dark' ? '#90caf9' : '#1976d2'
                    },
                    '&:hover': {
                      bgcolor: themeMode === 'dark' ? 'rgba(144, 202, 249, 0.25)' : 'rgba(25, 118, 210, 0.12)'
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Chip
                  icon={<Person />}
                  label={`${studentWiseData.length} Students Tracked`}
                  sx={{ 
                    m: 1,
                    bgcolor: themeMode === 'dark' ? 'rgba(165, 214, 167, 0.15)' : 'rgba(56, 142, 60, 0.08)',
                    color: themeMode === 'dark' ? '#a5d6a7' : '#388e3c',
                    border: `1px solid ${themeMode === 'dark' ? '#a5d6a7' : '#388e3c'}`,
                    '& .MuiChip-icon': {
                      color: themeMode === 'dark' ? '#a5d6a7' : '#388e3c'
                    },
                    '&:hover': {
                      bgcolor: themeMode === 'dark' ? 'rgba(165, 214, 167, 0.25)' : 'rgba(56, 142, 60, 0.12)'
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Chip
                  icon={<BarChartIcon />}
                  label={`Peak: ${Math.max(...dailyAttendanceData.map(d => d.attendance), 0)} daily`}
                  sx={{ 
                    m: 1,
                    bgcolor: themeMode === 'dark' ? 'rgba(255, 204, 2, 0.15)' : 'rgba(245, 124, 0, 0.08)',
                    color: themeMode === 'dark' ? '#ffcc02' : '#f57c00',
                    border: `1px solid ${themeMode === 'dark' ? '#ffcc02' : '#f57c00'}`,
                    '& .MuiChip-icon': {
                      color: themeMode === 'dark' ? '#ffcc02' : '#f57c00'
                    },
                    '&:hover': {
                      bgcolor: themeMode === 'dark' ? 'rgba(255, 204, 2, 0.25)' : 'rgba(245, 124, 0, 0.12)'
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Chip
                  icon={<TrendingUp />}
                  label={`Top Student: ${studentWiseData[0]?.attendanceCount || 0} records`}
                  sx={{ 
                    m: 1,
                    bgcolor: themeMode === 'dark' ? 'rgba(129, 212, 250, 0.15)' : 'rgba(2, 136, 209, 0.08)',
                    color: themeMode === 'dark' ? '#81d4fa' : '#0288d1',
                    border: `1px solid ${themeMode === 'dark' ? '#81d4fa' : '#0288d1'}`,
                    '& .MuiChip-icon': {
                      color: themeMode === 'dark' ? '#81d4fa' : '#0288d1'
                    },
                    '&:hover': {
                      bgcolor: themeMode === 'dark' ? 'rgba(129, 212, 250, 0.25)' : 'rgba(2, 136, 209, 0.12)'
                    }
                  }}
                />
              </Grid>
            </Grid>
          </Paper>
        </>
      )}
    </Container>
  );
};

export default AttendanceAnalytics;