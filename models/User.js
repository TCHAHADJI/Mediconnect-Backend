const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserType = {
  PATIENT: 'PATIENT',
  PHARMACY: 'PHARMACY',
  ADMIN: 'ADMIN',
  HEALTH_AUTHORITY: 'HEALTH_AUTHORITY' // MINSANTÉ / ONPC Regulatory Agent
};

const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION'
};

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false, // Don't return password in queries by default
  },
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  userType: {
    type: String,
    enum: Object.values(UserType),
    default: UserType.PATIENT,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.PENDING_VERIFICATION,
  },
  profileImage: {
    type: String,
  },
  profilePicture: {
    type: String,
  },
  // Patient specific fields
  dateOfBirth: {
    type: Date,
  },
  address: {
    type: String,
  },
  emergencyContact: {
    type: String,
  },
  bloodGroup: {
    type: String, // 'A+', 'O+', etc. for digital health booklet
  },
  allergies: {
    type: [String],
    default: [],
  },
  chronicDiseases: {
    type: [String],
    default: [],
  },
  csuIdentifier: {
    type: String, // Cameroon Couverture Santé Universelle ID
    trim: true,
  },
  csuInsurance: {
    matricule: { type: String, trim: true },
    beneficiaryCategory: { type: String, trim: true, default: 'Régime Général' },
    coverageRate: { type: Number, default: 70 },
    affiliatedFacility: { type: String, trim: true, default: 'Hôpital Central de Yaoundé' },
    status: { type: String, enum: ['ACTIVE', 'PENDING_VERIFICATION', 'INACTIVE'], default: 'ACTIVE' },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    linkedAt: { type: Date },
    qrData: { type: String }
  },
  medicalBooklet: {
    bloodGroup: { type: String, default: 'O+' },
    genotype: { type: String, default: 'AA' },
    height: { type: Number },
    weight: { type: Number },
    bmi: { type: Number },
    chronicDiseases: { type: [String], default: [] },
    emergencyContactName: { type: String },
    emergencyContactPhone: { type: String },
    emergencyContactRelation: { type: String },
    attendingPhysician: { type: String },
    attendingHospital: { type: String, default: 'Hôpital Central de Yaoundé (HCY)' },
    organDonor: { type: Boolean, default: false },
    vitalNotes: { type: String },
    detailedAllergies: [
      {
        name: { type: String, required: true },
        category: { type: String, enum: ['DRUG', 'FOOD', 'ENVIRONMENTAL', 'OTHER'], default: 'DRUG' },
        severity: { type: String, enum: ['MILD', 'MODERATE', 'SEVERE_ANAPHYLAXIS'], default: 'SEVERE_ANAPHYLAXIS' },
        reaction: { type: String },
        diagnosedYear: { type: String },
      }
    ],
    emergencyQrConfig: {
      enabled: { type: Boolean, default: true },
      showBloodGroup: { type: Boolean, default: true },
      showGenotype: { type: Boolean, default: true },
      showEmergencyContact: { type: Boolean, default: true },
      showAllergies: { type: Boolean, default: true },
      showChronicDiseases: { type: Boolean, default: true },
      showCsuNumber: { type: Boolean, default: true },
      emergencyNotes: { type: String },
      publicQrToken: { type: String, sparse: true },
    }
  },
  // Pharmacy specific fields
  licenseNumber: {
    type: String,
    trim: true,
  },
  onpcNumber: {
    type: String, // Official Ordre National des Pharmaciens du Cameroun Registration
    trim: true,
  },
  businessName: {
    type: String,
    trim: true,
  }, 
  businessAddress: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    default: 'Yaoundé',
  },
  district: {
    type: String,
  },
  latitude: {
    type: Number,
  },
  longitude: {
    type: Number,
  },
  operatingHours: {
    type: Object, // Stored as JSON
  },
  isOnDuty: {
    type: Boolean, // Pharmacy de Garde status
    default: false,
    index: true,
  },
  realTimeStatus: {
    type: String,
    enum: ['OPEN', 'ON_DUTY', 'CLOSED'],
    default: 'OPEN',
    index: true,
  },
  dutyRosterZone: {
    type: String,
  },
  dutySchedule: {
    nightDuty: {
      enabled: { type: Boolean, default: false },
      startTime: { type: String, default: '20:00' },
      endTime: { type: String, default: '08:00' },
      onCallPhone: { type: String, default: '' },
      dutyPharmacistName: { type: String, default: '' },
      emergencyInstructions: { type: String, default: "Sonnette de nuit disponible au guichet d'urgence." },
      is24Hours: { type: Boolean, default: false },
    },
    rotations: [
      {
        id: { type: String, required: true },
        title: { type: String, required: true },
        type: { type: String, enum: ['WEEKEND', 'HOLIDAY', 'NIGHT_EMERGENCY'], default: 'WEEKEND' },
        startDate: { type: String, required: true },
        endDate: { type: String, required: true },
        dutyStaff: { type: String, default: '' },
        contactPhone: { type: String, default: '' },
        notes: { type: String, default: '' },
        status: { type: String, enum: ['SCHEDULED', 'CONFIRMED_ONPC', 'COMPLETED'], default: 'CONFIRMED_ONPC' },
      }
    ],
    lastStatusUpdate: { type: Date, default: Date.now },
  },
  verificationStatus: {
    type: Boolean,
    default: false,
  },
  // POS & External Software Connectivity
  posApiKey: {
    type: String,
    sparse: true,
    index: true,
  },
  // Health Authority institutional & delegation fields (RBAC)
  organization: {
    type: String,
    enum: ['MINSANTE', 'ONPC', 'OTHER'],
    default: undefined,
  },
  permission_level: {
    type: String,
    enum: ['DIRECTOR', 'INSPECTOR', 'EPIDEMIOLOGIST'],
    default: undefined,
  },
  institutionDepartment: {
    type: String, // e.g. "Direction de la Pharmacie et du Médicament (DPM)", "Commission Pharmacovigilance & Bioéquivalence (ONPC)"
  },
  isMfaRequired: {
    type: Boolean,
    default: false,
  },
  mfaCode: {
    type: String,
    default: '237237', // Demonstration institutional OTP
  },
  lastLogin: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
module.exports.UserType = UserType;
module.exports.UserStatus = UserStatus;