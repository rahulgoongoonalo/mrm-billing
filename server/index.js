require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/db');

// Import routes
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const royaltyAccountingRoutes = require('./routes/royaltyAccounting');
const settingsRoutes = require('./routes/settings');

// Import models for initialization
const Settings = require('./models/Settings');

// Import notification service
const { sendOutstandingNotification } = require('./services/outstandingNotification');

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://billing.musicrightsmanagement.in']
    : true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/royalty-accounting', royaltyAccountingRoutes);
app.use('/api/settings', settingsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Initialize default settings on startup
const initializeApp = async () => {
  try {
    await Settings.initializeDefaults();
    console.log('Default settings initialized');
  } catch (error) {
    console.error('Error initializing settings:', error);
  }
};

// Error handling middleware
app.use((err, req, res, next) => {
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token expired' });
  }

  console.error('Error:', err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeApp();

  // Schedule daily outstanding email at 1:20 PM (server local time)
  cron.schedule('20 13 * * *', () => {
    console.log('Running daily outstanding notification...');
    sendOutstandingNotification();
  });
  console.log('Outstanding notification scheduled daily at 1:20 PM');
});

module.exports = app;
