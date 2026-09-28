const mongoose = require('mongoose');

const PublicHealthCampaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a campaign title'],
    trim: true,
  },
  theme: {
    type: String,
    enum: [
      'VACCINATION', 
      'MALARIA_PREVENTION', 
      'CHOLERA_RESPONSE', 
      'HYGIENE_SANITATION', 
      'MATERNAL_CHILD_HEALTH', 
      'COUNTERFEIT_DRUGS_AWARENESS', 
      'CHRONIC_DISEASE_DIABETES_HYPERTENSION',
      'GENERAL_PREVENTION'
    ],
    default: 'GENERAL_PREVENTION',
  },
  description: {
    type: String,
    required: [true, 'Please add a campaign description'],
  },
  objectives: {
    type: String,
    default: '',
  },
  targetRegions: [{
    type: String, // 'Toutes les régions (National)', 'Littoral', 'Centre', 'Extrême-Nord', etc.
  }],
  targetAudience: {
    type: String,
    default: 'Population générale', // e.g. 'Population générale', 'Mères et nourrissons', 'Scolaires', 'Personnes âgées'
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },
  budgetOrPartner: {
    type: String,
    default: 'MINSANTÉ Cameroun / Partenaires Techniques (OMS, UNICEF, GAVI)',
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'SCHEDULED', 'COMPLETED', 'SUSPENDED'],
    default: 'ACTIVE',
  },
  priority: {
    type: String,
    enum: ['HIGH', 'URGENT', 'STANDARD'],
    default: 'HIGH',
  },
  keyMessages: [{
    type: String,
  }],
  preventionDirectives: [{
    type: String,
  }],
  pharmacyDirectives: [{
    type: String,
  }],
  estimatedReach: {
    type: Number,
    default: 15000,
  },
  participatingPharmaciesCount: {
    type: Number,
    default: 45,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  authorityOrganization: {
    type: String,
    default: 'MINSANTÉ - Direction de la Promotion de la Santé',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('PublicHealthCampaign', PublicHealthCampaignSchema);
