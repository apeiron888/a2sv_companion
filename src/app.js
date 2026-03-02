require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
const pingRoutes = require('./routes/ping');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const { githubAuth, githubCallback, githubStatus } = require('./controllers/authController');

// Connect to MongoDB
connectDB();

// Start cron jobs
require('./jobs/updateMapping');
require('./jobs/processQueue'); // Async submission queue processor

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*'
}));
app.use(express.json({ limit: '2mb' })); // Allow larger payloads for code submission

// Serve static files (for admin UI)
app.use(express.static(path.join(__dirname, '../public')));

// Admin UI route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Auth status pages (cross-browser OAuth redirect targets)
app.get('/auth/success', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/success.html'));
});

app.get('/auth/error', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/error.html'));
});

// API routes
app.use('/ping', pingRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Direct auth routes (fallback for deployments missing /api routing)
app.get('/api/auth/github', githubAuth);
app.get('/api/auth/github/callback', githubCallback);
app.get('/api/auth/github/status', githubStatus);

// Global error handler — logs context for easier debugging
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}`, {
    body: req.body,
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});