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


const authRoutes = require('./routes/authRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const assessmentRoutes = require('./routes/assessmentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const systemRoutes = require('./routes/systemRoutes');
const { loadUser } = require('./middleware/authMiddleware');

// Global middleware for templates
app.use(loadUser);
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.user = req.user || null;
    next();
});

const notificationRoutes = require('./routes/notificationRoutes');

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
// Redirect legacy dojo routes to the new assessment paths
app.get('/dojo/assessment/:id', (req, res) => res.redirect(`/api/assessment/assessment/${req.params.id}`));
app.use('/api/system', systemRoutes);

// View Routes
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

// 404 Handler
app.use((req, res) => {
    if (req.accepts('html')) {
        return res.status(404).send('<h2>404 – Page not found</h2><a href="/login">Go to Login</a>');
    }
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]', err.stack);
    if (req.accepts('html')) {
        return res.status(500).send('<h2>500 – Server error</h2><a href="/login">Go to Login</a>');
    }
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

module.exports = app;
