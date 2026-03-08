const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  // Role-Based Access Control
  role: {
    type: String,
    enum: ['candidate', 'hr', 'admin', 'employee', 'manager'], // Added new roles, kept old ones for backward compatibility
    default: 'candidate'
  },

  // For HR/Admin users
  company: String,
  department: String,

  // For Candidates
  phone: String,
  resume: String, // File path or URL
  skills: [String], // Extracted or self-reported skills
  parsedResumeData: {
    skills: [String],
    profile: {
        name: String,
        email: String,
        phone: String,
        years: Number
    },
    lastParsed: Date
  },

  // Legacy fields (keep for backward compatibility)
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastLogin: {
    type: Date
  },
  jobRole: {
    type: String,
    enum: ['Developer', 'Team Lead', 'HR', 'Project Manager', 'None'],
    default: 'None'
  },
  isAuthorized: {
    type: Boolean,
    default: true
  },

  // Account Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, {
    expiresIn: '30d' // Simple expiry for demo
  });
};

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
