require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const pingRoutes = require('./routes/ping');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

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

// Routes
app.use('/ping', pingRoutes);
app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});