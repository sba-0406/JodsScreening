const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

// Load env vars from root directory
dotenv.config({ path: path.join(__dirname, '.env') });

// Connect to database
const connectDB = require('./config/db');
connectDB();

console.log('[SYSTEM INIT] Environment Variables Checked:');
console.log(` - GROQ_API_KEY: ${process.env.GROQ_API_KEY ? 'DETECTED' : 'MISSING'}`);
console.log(` - GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'DETECTED' : 'MISSING'}`);
console.log(` - PORT: ${process.env.PORT || 4000}`);

// Register Models
require('./models/User');
require('./models/Job');
require('./models/Application');
require('./models/Assessment');
require('./models/Question');
require('./models/ChatSession');

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Cookie parser
app.use(cookieParser());

// Enable CORS
app.use(cors());

// Set static folder for public assets
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));

const dojoRoutes = require('./routes/dojoRoutes');
const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const { loadUser } = require('./middleware/authMiddleware');

// Global middleware for templates
app.use(loadUser);
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = req.user || null;
    next();
});

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/dojo', dojoRoutes);
app.use('/assessment', assessmentRoutes); // For view routes like /assessment/123


// View Routes
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

module.exports = app;
