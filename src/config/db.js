const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // 10 s before giving up on initial connect
      heartbeatFrequencyMS: 30000,     // 30 s heartbeat to detect dropped connections
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Reconnect automatically if the connection drops (e.g., Atlas free tier idle timeout)
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected — attempting reconnect in 5 s...');
  setTimeout(() => {
    mongoose.connect(process.env.MONGODB_URI).catch(err => {
      console.error('MongoDB reconnect failed:', err.message);
    });
  }, 5000);
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

module.exports = connectDB;