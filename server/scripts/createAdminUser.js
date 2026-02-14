const mongoose = require('mongoose');
const dns = require('dns');
const User = require('../models/User');
require('dotenv').config();

dns.setServers(['1.1.1.1', '8.8.8.8']);

async function createAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@mrm.com' });
    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log('Email:', existingAdmin.email);
      console.log('Name:', existingAdmin.name);
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      email: 'admin@mrm.com',
      password: 'Admin@123',  // Change this password after first login!
      name: 'MRM Admin',
      role: 'admin',
      isVerified: true,
      isActive: true
    });

    console.log('✓ Admin user created successfully!');
    console.log('Email:', admin.email);
    console.log('Password: Admin@123');
    console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');

    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
