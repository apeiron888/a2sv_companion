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

// Start cron job for mapping updates
require('./jobs/updateMapping');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*'
}));
app.use(express.json());

// Serve static files (for admin UI)
app.use(express.static(path.join(__dirname, '../public')));

// Admin UI route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// API routes
app.use('/ping', pingRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Direct auth routes (fallback for deployments missing /api routing)
app.get('/api/auth/github', githubAuth);
app.get('/api/auth/github/callback', githubCallback);
app.get('/api/auth/github/status', githubStatus);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});