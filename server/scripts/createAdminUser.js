const mongoose = require('mongoose');
const dns = require('dns');
const User = require('../models/User');
require('dotenv').config();

dns.setServers(['1.1.1.1', '8.8.8.8']);

const users = [
  {
    email: 'admin@mrm.com',
    password: 'Admin@123',
    name: 'MRM Admin',
    role: 'admin',
    isVerified: true,
    isActive: true
  },
  {
    email: 'accounts@joshuainc.in',
    password: 'Poonam@mrm',
    name: 'Poonam',
    role: 'user',
    isVerified: true,
    isActive: true
  },
  {
    email: 'accounts@musicrightsmanagementindia.com',
    password: 'Pallavi@mrm',
    name: 'Pallavi',
    role: 'user',
    isVerified: true,
    isActive: true
  },
  {
    email: 'rahul.goongoonalo@gmail.com',
    password: 'Rahul@mrm',
    name: 'Rahul',
    role: 'admin',
    isVerified: true,
    isActive: true
  }
];

async function createUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const userData of users) {
      const existing = await User.findOne({ email: userData.email });
      if (existing) {
        console.log(`User already exists: ${userData.email} (${existing.name})`);
        continue;
      }

      const user = await User.create(userData);
      console.log(`Created user: ${user.email} (${user.name}) - Role: ${user.role}`);
    }

    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating users:', error);
    process.exit(1);
  }
}

createUsers();
