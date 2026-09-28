const GenericEquivalence = require('../models/GenericEquivalence');
const BatchRecall = require('../models/BatchRecall');
const EpidemiologicalSignal = require('../models/EpidemiologicalSignal');
const PublicHealthAlert = require('../models/PublicHealthAlert');
const Inventory = require('../models/Inventory');
const Medicine = require('../models/Medicine');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const HealthTip = require('../models/HealthTip');
const PublicHealthCampaign = require('../models/PublicHealthCampaign');

// ==========================================
// 1. GENERIC BIOEQUIVALENCE OVERSIGHT
// ==========================================

const getGenericEquivalences = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { referenceMedicineName: { $regex: search, $options: 'i' } },
        { genericMedicineName: { $regex: search, $options: 'i' } },
        { activeIngredient: { $regex: search, $options: 'i' } }
      ];
    }

    const equivalences = await GenericEquivalence.find(query)
      .populate('referenceMedicineId', 'name brand strength form atcCode referencePriceCeiling')
      .populate('genericMedicineId', 'name brand strength form atcCode referencePriceCeiling manufacturer')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: equivalences
    });
  } catch (error) {
    console.error('Error fetching generic equivalences:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch generic equivalences', error: error.message });
  }
};

const reviewGenericEquivalence = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, regulatoryNotes, minsanteCertificationNumber } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Expected APPROVED or REJECTED.' });
    }

    const equivalence = await GenericEquivalence.findById(id);
    if (!equivalence) {
      return res.status(404).json({ success: false, message: 'Bioequivalence record not found' });
    }

    equivalence.status = status;
    equivalence.regulatoryNotes = regulatoryNotes;
    equivalence.minsanteCertificationNumber = minsanteCertificationNumber || `MINSANTE-BIO-${Date.now().toString().slice(-6)}`;
    equivalence.reviewedBy = req.user?.id;
    equivalence.reviewerName = req.user?.name || 'Inspecteur Général de la Pharmacie (MINSANTÉ)';
    equivalence.approvedAt = new Date();

    await equivalence.save();

    res.json({
      success: true,
      message: `Bioequivalence pairing ${status.toLowerCase()} successfully`,
      data: equivalence
    });
  } catch (error) {
    console.error('Error reviewing generic equivalence:', error);
    res.status(500).json({ success: false, message: 'Failed to update generic equivalence', error: error.message });
  }
};

// ==========================================
// 2. PHARMACOVIGILANCE & BATCH RECALLS
// ==========================================

const getBatchRecalls = async (req, res) => {
  try {
    const recalls = await BatchRecall.find()
      .populate('issuedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: recalls
    });
  } catch (error) {
    console.error('Error fetching batch recalls:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch batch recalls', error: error.message });
  }
};

const triggerBatchRecall = async (req, res) => {
  try {
    const { batchNumber, medicineName, reason, hazardDescription, severity = 'CRITICAL', broadcastToPublic = true } = req.body;

    if (!batchNumber || !medicineName || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Batch number, medicine name, and recall reason are required.'
      });
    }

    // 1. Locate all pharmacy inventory records stocking this batch
    const affectedInventory = await Inventory.find({ batchNumber: batchNumber.trim() })
      .populate('pharmacyId', 'name businessName email phone city');

    const affectedPharmacies = [];
    let totalUnitsQuarantined = 0;

    // 2. Freeze every affected inventory item immediately
    for (const item of affectedInventory) {
      item.isFrozen = true;
      item.status = 'FROZEN';
      item.freezeReason = `MINSANTÉ EMERGENCY RECALL: ${reason}`;
      await item.save();

      totalUnitsQuarantined += item.quantity;

      const pharmacy = item.pharmacyId;
      affectedPharmacies.push({
        pharmacyId: pharmacy?._id,
        pharmacyName: pharmacy?.businessName || pharmacy?.name || 'Pharmacie Partenaire',
        unitsQuarantined: item.quantity,
        notifiedAt: new Date()
      });

      // Send critical notification to pharmacy
      if (pharmacy?._id) {
        await Notification.create({
          userId: pharmacy._id,
          type: 'SAFETY_ALERT',
          title: '🚨 RAPPEL DE LOT IMMÉDIAT — MINSANTÉ',
          message: `URGENT: Le lot ${batchNumber} de ${medicineName} est rappelé (${reason}). La délivrance a été automatiquement bloquée. Placez ce stock en zone de quarantaine.`,
          data: { batchNumber, medicineName, inventoryId: item._id }
        }).catch(err => console.warn('Notification error:', err.message));
      }
    }

    // 3. Create the Recall Record
    const nationalAlertRef = `ALERT-MINSANTE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const recall = await BatchRecall.create({
      batchNumber: batchNumber.trim(),
      medicineName,
      reason,
      hazardDescription,
      severity,
      recallStatus: 'ACTIVE',
      affectedPharmacies,
      totalUnitsQuarantined,
      issuedBy: req.user?.id,
      inspectorName: req.user?.name || 'Inspection Pharmaceutique MINSANTÉ',
      nationalAlertReference: nationalAlertRef,
      broadcastToPublic
    });

    // 4. Optionally broadcast emergency public alert
    if (broadcastToPublic) {
      await PublicHealthAlert.create({
        title: `Alerte Sécurité Médicament: Rappel du Lot ${batchNumber} (${medicineName})`,
        content: `Le Ministère de la Santé Publique ordonne le rappel immédiat du lot ${batchNumber} de ${medicineName}. Motif: ${reason}. Ne consommez pas ce produit. Ramenez-le en pharmacie.`,
        alertType: 'MEDICINE_RECALL',
        severity: 'URGENT',
        targetRegions: ['Toutes les régions'],
        channels: ['MOBILE_PUSH', 'SMS_BROADCAST', 'WEB_BANNER'],
        issuedBy: req.user?.id,
        authorityOrganization: 'MINSANTÉ - Pharmacovigilance Cameroun'
      }).catch(err => console.warn('PublicHealthAlert error:', err.message));
    }

    res.status(201).json({
      success: true,
      message: `Emergency batch recall issued! ${affectedPharmacies.length} pharmacies notified and ${totalUnitsQuarantined} units quarantined.`,
      data: recall
    });
  } catch (error) {
    console.error('Trigger recall error:', error);
    res.status(500).json({ success: false, message: 'Failed to trigger batch recall', error: error.message });
  }
};

// ==========================================
// 3. EPIDEMIOLOGICAL SURVEILLANCE & CRITICAL STOCKOUTS
// ==========================================

const getEpidemiologicalTelemetry = async (req, res) => {
  try {
    const signals = await EpidemiologicalSignal.find()
      .sort({ anomalyPercentage: -1 });

    const totalOutbreakAlerts = signals.filter(s => s.alertLevel === 'OUTBREAK_WARNING').length;
    const elevatedAlerts = signals.filter(s => s.alertLevel === 'ELEVATED').length;

    res.json({
      success: true,
      data: {
        signals,
        summary: {
          totalMonitoredRegions: 10,
          outbreakWarnings: totalOutbreakAlerts,
          elevatedAnomalies: elevatedAlerts,
          topDiseaseSurge: signals[0]?.diseaseCategory || 'MALARIA'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching epidemiological telemetry:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch telemetry data', error: error.message });
  }
};

const getCriticalStockoutMonitoring = async (req, res) => {
  try {
    // Monitor vital life-saving drugs in Cameroon: Insulin, Antivenom, SRO, ACT
    const vitalKeywords = ['Insuline', 'SRO', 'Coartem', 'Sérum', 'Artéméther'];
    const vitalMedicines = await Medicine.find({
      $or: vitalKeywords.map(k => ({ name: { $regex: k, $options: 'i' } }))
    }).select('_id name genericName form strength referencePriceCeiling');

    const medicineIds = vitalMedicines.map(m => m._id);

    // Aggregate inventory by vital medicine and region
    const stockReport = await Inventory.aggregate([
      { $match: { medicineId: { $in: medicineIds }, isFrozen: false } },
      {
        $lookup: {
          from: 'users',
          localField: 'pharmacyId',
          foreignField: '_id',
          as: 'pharmacy'
        }
      },
      { $unwind: '$pharmacy' },
      {
        $group: {
          _id: {
            medicineId: '$medicineId',
            city: { $ifNull: ['$pharmacy.city', 'Yaoundé'] }
          },
          totalStock: { $sum: '$quantity' },
          pharmaciesCount: { $sum: 1 }
        }
      }
    ]);

    // Format output with alert indicators
    const formatted = vitalMedicines.map(med => {
      const cityStocks = stockReport.filter(r => r._id.medicineId.toString() === med._id.toString());
      const totalNationalStock = cityStocks.reduce((sum, c) => sum + c.totalStock, 0);

      return {
        medicineId: med._id,
        name: med.name,
        genericName: med.genericName,
        form: med.form,
        totalNationalStock,
        isCriticalStockout: totalNationalStock < 25,
        regionalBreakdown: cityStocks.map(c => ({
          city: c._id.city,
          stock: c.totalStock,
          pharmaciesStocking: c.pharmaciesCount,
          status: c.totalStock < 10 ? 'CRITICAL_SHORTAGE' : c.totalStock < 30 ? 'LOW' : 'SUFFICIENT'
        }))
      };
    });

    res.json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Critical stockout monitoring error:', error);
    res.status(500).json({ success: false, message: 'Failed to monitor critical stockouts', error: error.message });
  }
};

// ==========================================
// 4. OFFICIAL BROADCAST ALERTS & ADVISORIES
// ==========================================

const getPublicHealthAlerts = async (req, res) => {
  try {
    const alerts = await PublicHealthAlert.find().sort({ createdAt: -1 });
    res.json({ success: true, data: alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch public alerts', error: error.message });
  }
};

const broadcastPublicHealthAlert = async (req, res) => {
  try {
    const { title, content, alertType = 'EPIDEMIC_OUTBREAK', severity = 'HIGH', targetRegions, channels } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Alert title and content are required' });
    }

    const alert = await PublicHealthAlert.create({
      title,
      content,
      alertType,
      severity,
      targetRegions: targetRegions || ['Toutes les régions'],
      channels: channels || ['MOBILE_PUSH', 'SMS_BROADCAST'],
      issuedBy: req.user?.id,
      recipientsCount: Math.floor(12500 + Math.random() * 8000) // Simulated reach across Cameroon
    });

    res.status(201).json({
      success: true,
      message: 'Urgent public health alert dispatched successfully to mobile and SMS gateways!',
      data: alert
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to broadcast alert', error: error.message });
  }
};

// ==========================================
// 5. ONPC PHARMACY ACCREDITATION & DUTY ROSTER
// ==========================================

const getPharmacyAccreditations = async (req, res) => {
  try {
    const pharmacies = await User.find({ userType: 'PHARMACY' })
      .select('name businessName email phone city district licenseNumber onpcNumber verificationStatus status isOnDuty dutyRosterZone createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: pharmacies
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch pharmacy registry', error: error.message });
  }
};

const updatePharmacyAccreditation = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus, status, onpcNumber, isOnDuty, dutyRosterZone } = req.body;

    const pharmacy = await User.findById(id);
    if (!pharmacy || pharmacy.userType !== 'PHARMACY') {
      return res.status(404).json({ success: false, message: 'Pharmacy establishment not found' });
    }

    if (verificationStatus !== undefined) pharmacy.verificationStatus = verificationStatus;
    if (status !== undefined) pharmacy.status = status;
    if (onpcNumber !== undefined) pharmacy.onpcNumber = onpcNumber;
    if (isOnDuty !== undefined) pharmacy.isOnDuty = isOnDuty;
    if (dutyRosterZone !== undefined) pharmacy.dutyRosterZone = dutyRosterZone;

    await pharmacy.save();

    res.json({
      success: true,
      message: `Pharmacy accreditation updated for ${pharmacy.businessName || pharmacy.name}`,
      data: pharmacy
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update pharmacy accreditation', error: error.message });
  }
};

// ==========================================
// 6. SEED MOCK REGULATORY TELEMETRY
// ==========================================

const seedAuthorityMockData = async (req, res) => {
  try {
    // 1. Seed Generic Bioequivalence Pairings
    const [coartem, artefan, doliprane, paracetamolGen, amoxil, amoxGen] = await Promise.all([
      Medicine.findOne({ name: /Coartem/i }),
      Medicine.findOne({ name: /Artefan/i }),
      Medicine.findOne({ name: /Doliprane/i }),
      Medicine.findOne({ name: /Paracétamol Générique/i }),
      Medicine.findOne({ name: /Amoxicilline.*Gélule/i }),
      Medicine.findOne({ name: /Amoxil/i }) || Medicine.findOne({ name: /Amoxicilline/i })
    ]);

    if (coartem && artefan) {
      await GenericEquivalence.findOneAndUpdate(
        { referenceMedicineId: coartem._id, genericMedicineId: artefan._id },
        {
          referenceMedicineId: coartem._id,
          referenceMedicineName: 'Coartem 20/120mg (Novartis)',
          genericMedicineId: artefan._id,
          genericMedicineName: 'Artefan 20/120mg (Ajanta Pharma)',
          activeIngredient: 'Artéméther 20mg / Luméfantrine 120mg',
          strength: '20/120mg',
          form: 'Comprimé',
          bioequivalenceRatio: 99.2,
          status: 'APPROVED',
          referencePrice: 2800,
          genericPrice: 1800,
          estimatedPatientSavingsPercent: 35.7,
          minsanteCertificationNumber: 'MINSANTE-BIO-ACT-2024-08',
          reviewerName: 'Pr. Nguendo (Comité Scientifique du Médicament)'
        },
        { upsert: true }
      );
    }

    if (doliprane && paracetamolGen) {
      await GenericEquivalence.findOneAndUpdate(
        { referenceMedicineId: doliprane._id, genericMedicineId: paracetamolGen._id },
        {
          referenceMedicineId: doliprane._id,
          referenceMedicineName: 'Doliprane 500mg (Sanofi)',
          genericMedicineId: paracetamolGen._id,
          genericMedicineName: 'Paracétamol DCI 500mg (Cinpharm Cameroun)',
          activeIngredient: 'Paracétamol',
          strength: '500mg',
          form: 'Comprimé',
          bioequivalenceRatio: 100.0,
          status: 'APPROVED',
          referencePrice: 1200,
          genericPrice: 500,
          estimatedPatientSavingsPercent: 58.3,
          minsanteCertificationNumber: 'MINSANTE-BIO-PARAC-2024-02',
          reviewerName: 'Dr. Mbarga (ONPC)'
        },
        { upsert: true }
      );
    }

    // 2. Seed Epidemiological Signals across Cameroon regions (AI Search Spikes)
    const sampleSignals = [
      {
        region: 'Littoral',
        district: 'Douala IV (Bonabéri)',
        diseaseCategory: 'CHOLERA',
        symptomKeywords: ['watery diarrhea', 'severe vomiting', 'acute dehydration', 'sunken eyes'],
        correlatedDrugs: ['Oral Rehydration Salts (ORS)', 'Aquatabs (Water Purifier)', 'Ciprofloxacin 500mg', 'Zinc Sulfate 20mg'],
        searchVolume: 1240,
        baselineVolume: 280,
        anomalyPercentage: 342.8,
        alertLevel: 'OUTBREAK_WARNING',
        aiConfidence: 96,
        channelSpikes: { web: 420, mobile: 680, ussd: 140 },
        recommendedAction: 'Immediate dispatch of ORS kits, water chlorination tablets, and deployment of rapid epidemiological response teams in Bonabéri.'
      },
      {
        region: 'Centre',
        district: 'Yaoundé VI (Biyem-Assi)',
        diseaseCategory: 'MALARIA',
        symptomKeywords: ['high intermittent fever', 'shivering chills', 'rapid malaria test', 'joint pains'],
        correlatedDrugs: ['Coartem 20/120mg (Artemether/Lumefantrine)', 'Artefan', 'Paracetamol 500mg', 'Quinine injectable'],
        searchVolume: 3480,
        baselineVolume: 1950,
        anomalyPercentage: 78.5,
        alertLevel: 'ELEVATED',
        aiConfidence: 92,
        channelSpikes: { web: 980, mobile: 2100, ussd: 400 },
        recommendedAction: 'Pre-position ACT antimalarial stocks across on-duty pharmacies and scale up community LLIN mosquito net coverage.'
      },
      {
        region: 'Extrême-Nord',
        district: 'Maroua Urbain',
        diseaseCategory: 'MEASLES',
        symptomKeywords: ['red maculopapular rash', 'barking cough', 'high fever in infant', 'runny nose'],
        correlatedDrugs: ['Vitamin A 100,000 IU', 'Paracetamol Syrup', 'Amoxicillin Dry Syrup'],
        searchVolume: 610,
        baselineVolume: 180,
        anomalyPercentage: 238.8,
        alertLevel: 'OUTBREAK_WARNING',
        aiConfidence: 95,
        channelSpikes: { web: 90, mobile: 310, ussd: 210 },
        recommendedAction: 'Urgent mobile vaccination ring campaign (MMR/Rougeole) targeting children aged 6 months to 9 years.'
      },
      {
        region: 'Ouest',
        district: 'Bafoussam I',
        diseaseCategory: 'TYPHOID',
        symptomKeywords: ['prolonged step-ladder fever', 'severe stomach cramps', 'widal serology test', 'extreme weakness'],
        correlatedDrugs: ['Ciprofloxacin 500mg', 'Ceftriaxone 1g Injectable', 'Azithromycin 500mg'],
        searchVolume: 820,
        baselineVolume: 510,
        anomalyPercentage: 60.7,
        alertLevel: 'ELEVATED',
        aiConfidence: 89,
        channelSpikes: { web: 210, mobile: 490, ussd: 120 },
        recommendedAction: 'Sanitary inspection of community water points and public health hygiene advisories across schools and markets.'
      }
    ];

    await EpidemiologicalSignal.deleteMany({});
    await EpidemiologicalSignal.insertMany(sampleSignals);

    // 3. Seed Sample Public Health Alert
    await PublicHealthAlert.findOneAndUpdate(
      { title: /Cholera/i },
      {
        title: 'Epidemic Warning: High Risk of Cholera Surge (Littoral Region)',
        content: 'MINSANTÉ urges populations in Douala and surrounding districts to strictly adhere to hygiene measures: wash hands with clean water and soap, drink boiled or chlorinated water, and seek immediate pharmacy or clinical assistance upon experiencing acute watery diarrhea.',
        alertType: 'EPIDEMIC_OUTBREAK',
        severity: 'URGENT',
        targetRegions: ['Littoral', 'Sud-Ouest'],
        channels: ['MOBILE_PUSH', 'SMS_BROADCAST', 'WEB_BANNER'],
        authorityOrganization: 'MINSANTÉ - Directorate of Disease Control & Surveillance',
        recipientsCount: 24500
      },
      { upsert: true }
    );

    // 4. Seed Sample Batch Recall
    const authUser = await User.findOne({ userType: 'HEALTH_AUTHORITY' });
    await BatchRecall.findOneAndUpdate(
      { batchNumber: 'LOT-AMOX-2024-09' },
      {
        batchNumber: 'LOT-AMOX-2024-09',
        medicineName: 'Amoxicillin 500mg Capsule',
        manufacturer: 'Pharma Lab International',
        reason: 'Organic impurities exceeding national safety specifications detected during LNSPM quality testing',
        severity: 'CRITICAL',
        recallStatus: 'ACTIVE',
        issuedBy: authUser ? authUser._id : undefined,
        inspectorName: 'Chief Quality Inspector (MINSANTÉ/ONPC)',
        totalUnitsQuarantined: 420,
        broadcastToPublic: true,
        quarantineActionLog: [
          {
            action: 'RECALL_INITIATED',
            performedBy: 'Chief Quality Inspector (MINSANTÉ)',
            details: 'Emergency stock-lock dispatched to all registered pharmacy servers'
          }
        ]
      },
      { upsert: true }
    );

    // 5. Seed Sample Public Health Campaigns (English)
    await PublicHealthCampaign.deleteMany({});
    await PublicHealthCampaign.insertMany([
      {
        title: 'National Insecticide-Treated Mosquito Net Campaign (LLIN 2026)',
        theme: 'MALARIA_PREVENTION',
        description: 'Nationwide distribution of 14 million long-lasting insecticidal nets (LLINs) to Cameroonian households coupled with pharmacy-led community education.',
        objectives: 'Reduce malaria clinical incidence by 40% and prioritize protection for pregnant mothers and children under five.',
        targetRegions: ['All Regions (National)'],
        targetAudience: 'General Population, Families with Infants',
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-10-31'),
        budgetOrPartner: 'MINSANTÉ Cameroon / Global Fund / USAID PMI',
        status: 'ACTIVE',
        priority: 'URGENT',
        keyMessages: [
          'Sleep inside an insecticide-treated bednet (LLIN) every single night',
          'Visit a community pharmacy or health center immediately at the onset of fever',
          'Free Intermittent Preventive Treatment (IPTp) available for pregnant mothers'
        ],
        estimatedReach: 480000,
        participatingPharmaciesCount: 180,
        authorityOrganization: 'MINSANTÉ - National Malaria Control Program (NMCP)'
      },
      {
        title: 'Emergency Cholera Response & Safe Water Initiative — Wouri Basin & Littoral',
        theme: 'CHOLERA_RESPONSE',
        description: 'Reinforcing syndromic early-warning, pre-positioning oral rehydration salts (ORS), and distributing water purification solutions in dense coastal settlements.',
        objectives: 'Contain the Bonabéri epidemic cluster and protect drinking water supply chains.',
        targetRegions: ['Littoral', 'Sud-Ouest'],
        targetAudience: 'Coastal Communities, Schools, Open Markets',
        startDate: new Date('2026-08-15'),
        endDate: new Date('2026-12-15'),
        budgetOrPartner: 'MINSANTÉ / WHO / UNICEF Cameroon',
        status: 'ACTIVE',
        priority: 'URGENT',
        keyMessages: [
          'Wash hands thoroughly with soap and running water before meals and after latrine use',
          'Boil drinking water or disinfect with Aquatabs / dilute bleach',
          'In case of profuse watery diarrhea, drink ORS immediately and visit the nearest health post'
        ],
        estimatedReach: 120000,
        participatingPharmaciesCount: 95,
        authorityOrganization: 'MINSANTÉ - Department of Disease Control (DLM)'
      },
      {
        title: 'National Awareness Week Against Counterfeit & Illicit Street Drugs',
        theme: 'COUNTERFEIT_DRUGS_AWARENESS',
        description: 'Joint MINSANTÉ / ONPC public campaign educating citizens on the lethal risks of street medicines and promoting licensed pharmacy dispensing.',
        objectives: 'Sensitize 500,000 citizens and enforce supply-chain pedigree verification.',
        targetRegions: ['All Regions (National)'],
        targetAudience: 'General Public',
        startDate: new Date('2026-10-01'),
        endDate: new Date('2026-10-15'),
        budgetOrPartner: 'National Order of Pharmacists (ONPC) & MINSANTÉ',
        status: 'SCHEDULED',
        priority: 'HIGH',
        keyMessages: [
          'Street drugs kill: 1 in 2 street medicines is toxic, sub-potent, or counterfeit',
          'Always demand batch traceability and professional advice from your licensed Doctor of Pharmacy',
          'Report adverse drug reactions or suspicious medicines directly on MediConnect'
        ],
        estimatedReach: 250000,
        participatingPharmaciesCount: 240,
        authorityOrganization: 'National Order of Pharmacists of Cameroon (ONPC) & DPM'
      }
    ]);

    // 6. Seed Pending & Approved Health Tips (Admin-Drafted for Health Authority Approval)
    await HealthTip.deleteMany({});
    await HealthTip.insertMany([
      {
        title: 'Warning Signs of Severe Malaria in Infants and Young Children',
        content: 'During any febrile episode in infants or children under five, immediately monitor for danger signs: repeated vomiting preventing oral intake, abnormal lethargy, convulsions, or refusal to breastfeed. Never delay seeking medical attention: Rapid Diagnostic Tests (RDTs) and Artemisinin-based Combination Therapies (ACTs) are readily accessible at community pharmacies and clinic centers.',
        category: 'Malaria',
        author: 'System Administrator (MediConnect Clinical Desk)',
        isPublished: false,
        status: 'PENDING_APPROVAL',
        submitterRole: 'ADMIN',
        targetAudience: 'Parents, Mothers of Young Children',
        priority: 'URGENT',
        reviewerNotes: 'Draft submitted by System Admin awaiting National Health Authority review and clearance.'
      },
      {
        title: 'Emergency Protocol: Safe Water Household Chlorination & Cholera Defense',
        content: 'To render water safe in high-risk zones: add 3 drops of standard unscented household bleach (8° to 12°) per liter of clear water, mix thoroughly, and wait 30 minutes before drinking. If water is turbid, filter through clean cloth first. Always store treated water in clean, narrow-neck covered containers.',
        category: 'Hygiene & Sanitation',
        author: 'System Administrator (Public Health Editorial Board)',
        isPublished: false,
        status: 'PENDING_APPROVAL',
        submitterRole: 'ADMIN',
        targetAudience: 'General Public, Coastal Communities',
        priority: 'URGENT',
        reviewerNotes: 'Draft created by Admin following Bonabéri syndromic cluster alert.'
      },
      {
        title: 'Hazards of Unsupervised NSAIDs (Ibuprofen / Aspirin) in Acute Febrile Illness',
        content: 'Blind usage of ibuprofen or aspirin during fever without clinical confirmation can trigger severe hemorrhagic complications in dengue or malaria infections. For first-line symptom relief, only weight-adjusted paracetamol should be administered prior to professional medical consultation.',
        category: 'Safe Medicine Use',
        author: 'Dr. Biwole (Partner Pharmacy - Centre)',
        isPublished: false,
        status: 'PENDING_APPROVAL',
        submitterRole: 'PHARMACY',
        targetAudience: 'General Public',
        priority: 'STANDARD',
        reviewerNotes: 'Proposed by community pharmacy practitioner for national homologation.'
      },
      {
        title: 'Official MINSANTÉ Advisory: Safe Medicine Storage in High-Humidity Climates',
        content: 'Across tropical zones in Cameroon, elevated ambient heat and humidity degrade oral antibiotic suspensions, syrups, and ophthalmic drops. Always store medicines in a dry, ventilated cabinet away from direct sunlight (never inside bathrooms or near kitchen heat). Discard any syrup exhibiting changes in color, cloudiness, or odor.',
        category: 'Rational Drug Use',
        author: 'Directorate of Pharmacy, Medicine and Laboratories (MINSANTÉ)',
        isPublished: true,
        status: 'APPROVED',
        submitterRole: 'HEALTH_AUTHORITY',
        targetAudience: 'General Public',
        priority: 'STANDARD',
        reviewerNotes: 'Certified and officially published by MINSANTÉ Scientific Committee.'
      }
    ]);

    res.json({
      success: true,
      message: 'Health Authority mock regulatory, tips, and campaigns data seeded successfully in English!'
    });
  } catch (error) {
    console.error('Error seeding authority mock data:', error);
    res.status(500).json({ success: false, message: 'Failed to seed authority data', error: error.message });
  }
};

// ==========================================
// 7. DHIS2 INTEROPERABILITY EXPORT
// ==========================================

const exportDHIS2Json = async (req, res) => {
  try {
    const signals = await EpidemiologicalSignal.find().sort({ region: 1 });
    const now = new Date();
    const currentYear = now.getFullYear();
    const firstDayOfYear = new Date(currentYear, 0, 1);
    const pastDaysOfYear = (now - firstDayOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    const period = `${currentYear}W${weekNumber < 10 ? '0' + weekNumber : weekNumber}`;

    const dhis2DataValueSet = {
      dataSet: "DS_EPIDEMIO_SURVEILLANCE_CAMEROON_MINSANTE",
      completeDate: now.toISOString().split('T')[0],
      period: period,
      orgUnit: "OU_MINSANTE_CAMEROUN_NATIONAL",
      dataValues: signals.map(sig => {
        const cleanRegion = (sig.region || 'CENTRE').toUpperCase().replace(/[^A-Z]/g, '_');
        const cleanDistrict = (sig.district || 'CENTRAL').toUpperCase().replace(/[^A-Z]/g, '_');
        return {
          dataElement: `DE_${sig.diseaseCategory || 'EPIDEMIO'}_SURVEILLANCE`,
          period: period,
          orgUnit: `OU_CM_${cleanRegion}_${cleanDistrict}`,
          categoryOptionCombo: "default",
          attributeOptionCombo: "default",
          value: String(sig.searchVolume || 0),
          storedBy: req.user?.email || "minsante_epidemio",
          created: sig.createdAt ? sig.createdAt.toISOString() : now.toISOString(),
          lastUpdated: now.toISOString(),
          comment: `Anomalie requêtes syndromiques: +${sig.anomalyPercentage}% | Alerte: ${sig.alertLevel} | Keywords: ${(sig.symptomKeywords || []).join(', ')}`
        };
      })
    };

    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=dhis2_export_${period}.json`);
      return res.send(JSON.stringify(dhis2DataValueSet, null, 2));
    }

    res.json({
      success: true,
      data: dhis2DataValueSet
    });
  } catch (error) {
    console.error('DHIS2 JSON export error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l export DHIS2 JSON', error: error.message });
  }
};

const exportDHIS2Csv = async (req, res) => {
  try {
    const signals = await EpidemiologicalSignal.find().sort({ region: 1 });
    const now = new Date();
    const currentYear = now.getFullYear();
    const firstDayOfYear = new Date(currentYear, 0, 1);
    const pastDaysOfYear = (now - firstDayOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    const period = `${currentYear}W${weekNumber < 10 ? '0' + weekNumber : weekNumber}`;
    const dateStr = now.toISOString().split('T')[0];

    const headers = [
      'dataElement',
      'period',
      'orgUnit',
      'categoryOptionCombo',
      'attributeOptionCombo',
      'value',
      'storedBy',
      'lastUpdated',
      'comment'
    ];

    const rows = signals.map(sig => {
      const dataElement = `DE_${sig.diseaseCategory || 'EPIDEMIO'}_CASES`;
      const cleanRegion = (sig.region || 'CENTRE').toUpperCase().replace(/[^A-Z]/g, '_');
      const cleanDistrict = (sig.district || 'CENTRAL').toUpperCase().replace(/[^A-Z]/g, '_');
      const orgUnit = `OU_CM_${cleanRegion}_${cleanDistrict}`;
      const value = sig.searchVolume || 0;
      const storedBy = req.user?.email || "minsante_epidemio";
      const comment = `Signal ${sig.diseaseCategory} (+${sig.anomalyPercentage}%) [${sig.alertLevel}]`;
      return `"${dataElement}","${period}","${orgUnit}","default","default","${value}","${storedBy}","${dateStr}","${comment}"`;
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=dhis2_export_${period}.csv`);
    return res.send(csvContent);
  } catch (error) {
    console.error('DHIS2 CSV export error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l export DHIS2 CSV', error: error.message });
  }
};

// ==========================================
// 8. HEALTH TIPS REVIEW & CREATION
// ==========================================

const getAuthorityHealthTips = async (req, res) => {
  try {
    const { status, category } = req.query;
    const query = {};
    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (category && category !== 'ALL') {
      query.category = category;
    }

    const tips = await HealthTip.find(query)
      .populate('submittedBy', 'name businessName email phone role userType')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 });

    const pendingCount = await HealthTip.countDocuments({ status: { $in: ['PENDING_APPROVAL', 'DRAFT'] } });
    const approvedCount = await HealthTip.countDocuments({ status: 'APPROVED' });

    res.json({
      success: true,
      data: {
        tips,
        stats: {
          pendingCount,
          approvedCount,
          totalCount: tips.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching authority health tips:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch health tips', error: error.message });
  }
};

const reviewHealthTip = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewerNotes } = req.body; // 'APPROVED' or 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut invalide. Doit être APPROVED ou REJECTED' });
    }

    const tip = await HealthTip.findById(id);
    if (!tip) {
      return res.status(404).json({ success: false, message: 'Conseil santé introuvable' });
    }

    tip.status = status;
    tip.isPublished = (status === 'APPROVED');
    tip.reviewedBy = req.user?._id;
    tip.reviewerNotes = reviewerNotes || (status === 'APPROVED' ? 'Validé par l Autorité Sanitaire (MINSANTÉ/ONPC)' : 'Rejeté par l Autorité Sanitaire');
    await tip.save();

    await AuditLog.create({
      userId: req.user?._id,
      action: status === 'APPROVED' ? 'APPROVE_HEALTH_TIP' : 'REJECT_HEALTH_TIP',
      resource: 'HealthTip',
      resourceId: tip._id,
      details: { title: tip.title, notes: tip.reviewerNotes }
    }).catch(err => console.warn('Audit error:', err.message));

    if (tip.submittedBy) {
      await Notification.create({
        userId: tip.submittedBy,
        type: 'GENERAL',
        title: status === 'APPROVED' ? '✅ Votre conseil santé a été validé !' : '⚠️ Conseil santé non retenu',
        message: status === 'APPROVED' 
          ? `Votre conseil "${tip.title}" a été validé par le MINSANTÉ et est désormais diffusé à tous les patients.`
          : `Votre conseil "${tip.title}" n a pas été validé. Remarque de l autorité : ${tip.reviewerNotes}`
      }).catch(err => console.warn('Notification error:', err.message));
    }

    res.json({
      success: true,
      message: status === 'APPROVED' ? 'Conseil santé approuvé et publié avec succès !' : 'Conseil santé rejeté.',
      data: tip
    });
  } catch (error) {
    console.error('Error reviewing health tip:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la révision du conseil', error: error.message });
  }
};

const createAuthorityHealthTip = async (req, res) => {
  try {
    const { title, content, category, targetAudience = 'Tous publics', priority = 'STANDARD' } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({ success: false, message: 'Titre, contenu et catégorie obligatoires' });
    }

    const orgName = req.user?.organization === 'ONPC' 
      ? 'Ordre National des Pharmaciens du Cameroun (ONPC)' 
      : 'Direction de la Promotion de la Santé - MINSANTÉ';

    const healthTip = await HealthTip.create({
      title,
      content,
      category,
      author: `${orgName} (${req.user?.name || 'Officiel'})`,
      isPublished: true,
      status: 'APPROVED',
      submitterRole: 'HEALTH_AUTHORITY',
      submittedBy: req.user?._id,
      reviewedBy: req.user?._id,
      reviewerNotes: 'Publication officielle directe par l Autorité Sanitaire',
      targetAudience,
      priority
    });

    await AuditLog.create({
      userId: req.user?._id,
      action: 'CREATE_OFFICIAL_HEALTH_TIP',
      resource: 'HealthTip',
      resourceId: healthTip._id,
      details: { title: healthTip.title, category: healthTip.category }
    }).catch(err => console.warn('Audit error:', err.message));

    res.status(201).json({
      success: true,
      message: 'Conseil officiel MINSANTÉ publié avec succès !',
      data: healthTip
    });
  } catch (error) {
    console.error('Error creating authority health tip:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la publication du conseil officiel', error: error.message });
  }
};

// ==========================================
// 9. PUBLIC HEALTH CAMPAIGNS MANAGEMENT
// ==========================================

const getPublicHealthCampaigns = async (req, res) => {
  try {
    const { status, theme } = req.query;
    const query = {};
    if (status && status !== 'ALL') query.status = status;
    if (theme && theme !== 'ALL') query.theme = theme;

    const campaigns = await PublicHealthCampaign.find(query)
      .populate('createdBy', 'name email organization')
      .sort({ createdAt: -1 });

    const activeCount = campaigns.filter(c => c.status === 'ACTIVE').length;
    const scheduledCount = campaigns.filter(c => c.status === 'SCHEDULED').length;

    res.json({
      success: true,
      data: {
        campaigns,
        stats: {
          activeCount,
          scheduledCount,
          totalCount: campaigns.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching public health campaigns:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns', error: error.message });
  }
};

// Helper to broadcast notifications to all active users when a campaign is launched or concluded
const broadcastCampaignNotifications = async (campaign, action = 'LAUNCHED') => {
  try {
    const activeUsers = await User.find({ status: { $ne: 'INACTIVE' } }).select('_id userType name email');

    const isLaunch = action === 'LAUNCHED';
    const title = isLaunch
      ? `📢 Campagne Nationale de Santé: ${campaign.title}`
      : `🏁 Clôture de la Campagne: ${campaign.title}`;

    const formattedDates = `du ${new Date(campaign.startDate).toLocaleDateString('fr-FR')} ${campaign.endDate ? 'au ' + new Date(campaign.endDate).toLocaleDateString('fr-FR') : '(Durée indéterminée)'}`;

    const message = isLaunch
      ? `${campaign.description.substring(0, 180)}...\n\nPériode active: ${formattedDates}.\nConsultez les directives et conseils de prévention officiels du MINSANTÉ.`
      : `La campagne nationale de santé publique '${campaign.title}' est désormais officiellement clôturée. Le MINSANTÉ et l'ONPC remercient tous les citoyens et les officines participantes pour leur engagement.`;

    const userNotifs = activeUsers.map(u => ({
      userId: u._id,
      type: 'campaign',
      title,
      message,
      read: false,
      isRead: false,
      relatedId: campaign._id
    }));

    // Add a system-wide broadcast notification with userId: null
    userNotifs.push({
      userId: null,
      type: 'campaign',
      title,
      message,
      read: false,
      isRead: false,
      relatedId: campaign._id
    });

    if (userNotifs.length > 0) {
      await Notification.insertMany(userNotifs, { ordered: false });
      console.log(`[Campaign Notification] Broadcasted ${action} notification to ${activeUsers.length} users for "${campaign.title}"`);
    }
  } catch (err) {
    console.error('Error broadcasting campaign notifications:', err);
  }
};

// Fetch currently active public health campaigns for all users (public, patients, pharmacies)
// Automatically filters by valid time window and concludes expired campaigns
const getActivePublicHealthCampaigns = async (req, res) => {
  try {
    const now = new Date();

    // 1. Auto-conclude any active campaigns whose endDate has passed
    const expiredCampaigns = await PublicHealthCampaign.find({
      status: 'ACTIVE',
      endDate: { $ne: null, $lt: now }
    });

    if (expiredCampaigns.length > 0) {
      for (const exp of expiredCampaigns) {
        exp.status = 'COMPLETED';
        await exp.save();
        await broadcastCampaignNotifications(exp, 'CONCLUDED');
        console.log(`[Auto-Conclude] Campaign "${exp.title}" reached endDate and was concluded.`);
      }
    }

    // 2. Fetch all currently active campaigns within the active time window
    // (status is ACTIVE, and either no endDate or endDate >= now)
    const activeCampaigns = await PublicHealthCampaign.find({
      status: 'ACTIVE',
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: now } }
      ]
    })
      .populate('createdBy', 'name email organization')
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: activeCampaigns
    });
  } catch (error) {
    console.error('Error fetching active public health campaigns:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active campaigns', error: error.message });
  }
};

const createPublicHealthCampaign = async (req, res) => {
  try {
    const {
      title,
      theme,
      description,
      objectives,
      targetRegions,
      targetAudience,
      startDate,
      endDate,
      budgetOrPartner,
      priority,
      keyMessages,
      preventionDirectives,
      pharmacyDirectives,
      estimatedReach,
      broadcastAlert = true
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Le titre et la description de la campagne sont obligatoires' });
    }

    const parsedPrevention = Array.isArray(preventionDirectives)
      ? preventionDirectives
      : (typeof preventionDirectives === 'string' ? preventionDirectives.split('\n').map(s => s.trim()).filter(Boolean) : []);

    const parsedPharmacy = Array.isArray(pharmacyDirectives)
      ? pharmacyDirectives
      : (typeof pharmacyDirectives === 'string' ? pharmacyDirectives.split('\n').map(s => s.trim()).filter(Boolean) : []);

    let parsedKeyMessages = Array.isArray(keyMessages)
      ? keyMessages
      : (typeof keyMessages === 'string' ? keyMessages.split('\n').map(s => s.trim()).filter(Boolean) : []);

    if (parsedKeyMessages.length === 0 && (parsedPrevention.length > 0 || parsedPharmacy.length > 0)) {
      parsedKeyMessages = [...parsedPrevention, ...parsedPharmacy];
    }

    const campaign = await PublicHealthCampaign.create({
      title,
      theme: theme || 'GENERAL_PREVENTION',
      description,
      objectives: objectives || '',
      targetRegions: (targetRegions && targetRegions.length > 0) ? targetRegions : ['Toutes les 10 régions (National)'],
      targetAudience: targetAudience || 'Population générale',
      startDate: startDate || new Date(),
      endDate: endDate || null,
      budgetOrPartner: budgetOrPartner || 'MINSANTÉ Cameroun / Partenaires Internationaux',
      priority: priority || 'HIGH',
      status: 'ACTIVE',
      keyMessages: parsedKeyMessages,
      preventionDirectives: parsedPrevention,
      pharmacyDirectives: parsedPharmacy,
      estimatedReach: Number(estimatedReach) || 25000,
      createdBy: req.user?._id,
      authorityOrganization: req.user?.organization === 'ONPC' ? 'ONPC Cameroun' : 'MINSANTÉ Cameroun'
    });

    if (broadcastAlert) {
      await PublicHealthAlert.create({
        title: `📢 CAMPAGNE NATIONALE: ${campaign.title}`,
        content: campaign.description,
        alertType: 'SEASONAL_WARNING',
        severity: campaign.priority === 'URGENT' ? 'URGENT' : 'INFO',
        targetRegions: campaign.targetRegions,
        channels: ['WEB_BANNER', 'MOBILE_PUSH'],
        issuedBy: req.user?._id,
        authorityOrganization: campaign.authorityOrganization,
        recipientsCount: campaign.estimatedReach
      }).catch(err => console.warn('Campaign broadcast alert error:', err.message));
    }

    // Broadcast in-app notifications to all registered users (patients, pharmacies, admins)
    if (campaign.status === 'ACTIVE') {
      await broadcastCampaignNotifications(campaign, 'LAUNCHED');
    }

    res.status(201).json({
      success: true,
      message: 'Campagne de santé publique lancée et diffusée avec succès !',
      data: campaign
    });
  } catch (error) {
    console.error('Error creating public health campaign:', error);
    res.status(500).json({ success: false, message: 'Failed to create campaign', error: error.message });
  }
};

const updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const campaign = await PublicHealthCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campagne introuvable' });
    }

    const previousStatus = campaign.status;
    campaign.status = status;
    await campaign.save();

    // Send notifications to all users on status transition
    if (previousStatus !== 'ACTIVE' && status === 'ACTIVE') {
      await broadcastCampaignNotifications(campaign, 'LAUNCHED');
    } else if (previousStatus === 'ACTIVE' && status === 'COMPLETED') {
      await broadcastCampaignNotifications(campaign, 'CONCLUDED');
    }

    res.json({
      success: true,
      message: `Statut de la campagne mis à jour vers: ${status}`,
      data: campaign
    });
  } catch (error) {
    console.error('Error updating campaign status:', error);
    res.status(500).json({ success: false, message: 'Failed to update campaign', error: error.message });
  }
};

const updatePublicHealthCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      theme,
      description,
      objectives,
      targetRegions,
      targetAudience,
      startDate,
      endDate,
      budgetOrPartner,
      priority,
      status,
      keyMessages,
      preventionDirectives,
      pharmacyDirectives,
      estimatedReach,
      participatingPharmaciesCount
    } = req.body;

    const campaign = await PublicHealthCampaign.findById(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campagne introuvable' });
    }

    const previousStatus = campaign.status;

    if (title !== undefined) campaign.title = title.trim();
    if (theme !== undefined) campaign.theme = theme;
    if (description !== undefined) campaign.description = description.trim();
    if (objectives !== undefined) campaign.objectives = objectives.trim();
    if (targetRegions !== undefined) {
      campaign.targetRegions = Array.isArray(targetRegions) ? targetRegions : [targetRegions];
    }
    if (targetAudience !== undefined) campaign.targetAudience = targetAudience.trim();
    if (startDate !== undefined) campaign.startDate = startDate ? new Date(startDate) : campaign.startDate;
    if (endDate !== undefined) campaign.endDate = endDate ? new Date(endDate) : null;
    if (budgetOrPartner !== undefined) campaign.budgetOrPartner = budgetOrPartner.trim();
    if (priority !== undefined) campaign.priority = priority;
    if (status !== undefined) campaign.status = status;
    
    if (preventionDirectives !== undefined) {
      campaign.preventionDirectives = Array.isArray(preventionDirectives)
        ? preventionDirectives
        : (typeof preventionDirectives === 'string' ? preventionDirectives.split('\n').map(s => s.trim()).filter(Boolean) : []);
    }
    if (pharmacyDirectives !== undefined) {
      campaign.pharmacyDirectives = Array.isArray(pharmacyDirectives)
        ? pharmacyDirectives
        : (typeof pharmacyDirectives === 'string' ? pharmacyDirectives.split('\n').map(s => s.trim()).filter(Boolean) : []);
    }
    if (keyMessages !== undefined) {
      campaign.keyMessages = Array.isArray(keyMessages) 
        ? keyMessages 
        : (typeof keyMessages === 'string' ? keyMessages.split('\n').filter(m => m.trim().length > 0) : []);
    } else if (preventionDirectives !== undefined || pharmacyDirectives !== undefined) {
      campaign.keyMessages = [...(campaign.preventionDirectives || []), ...(campaign.pharmacyDirectives || [])];
    }
    if (estimatedReach !== undefined) campaign.estimatedReach = Number(estimatedReach) || campaign.estimatedReach;
    if (participatingPharmaciesCount !== undefined) {
      campaign.participatingPharmaciesCount = Number(participatingPharmaciesCount) || campaign.participatingPharmaciesCount;
    }

    await campaign.save();

    // If status changed to ACTIVE or COMPLETED, broadcast notification
    if (previousStatus !== 'ACTIVE' && campaign.status === 'ACTIVE') {
      await broadcastCampaignNotifications(campaign, 'LAUNCHED');
    } else if (previousStatus === 'ACTIVE' && campaign.status === 'COMPLETED') {
      await broadcastCampaignNotifications(campaign, 'CONCLUDED');
    }

    res.json({
      success: true,
      message: 'Campagne sanitaire mise à jour avec succès dans la base de données !',
      data: campaign
    });
  } catch (error) {
    console.error('Error updating public health campaign:', error);
    res.status(500).json({ success: false, message: 'Échec de la mise à jour de la campagne', error: error.message });
  }
};

const deletePublicHealthCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await PublicHealthCampaign.findByIdAndDelete(id);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campagne introuvable' });
    }

    res.json({
      success: true,
      message: 'Campagne supprimée avec succès de la base de données'
    });
  } catch (error) {
    console.error('Error deleting public health campaign:', error);
    res.status(500).json({ success: false, message: 'Échec de la suppression de la campagne', error: error.message });
  }
};

module.exports = {
  getGenericEquivalences,
  reviewGenericEquivalence,
  getBatchRecalls,
  triggerBatchRecall,
  getEpidemiologicalTelemetry,
  getCriticalStockoutMonitoring,
  getPublicHealthAlerts,
  broadcastPublicHealthAlert,
  getPharmacyAccreditations,
  updatePharmacyAccreditation,
  seedAuthorityMockData,
  exportDHIS2Json,
  exportDHIS2Csv,
  getAuthorityHealthTips,
  reviewHealthTip,
  createAuthorityHealthTip,
  getPublicHealthCampaigns,
  getActivePublicHealthCampaigns,
  createPublicHealthCampaign,
  updateCampaignStatus,
  updatePublicHealthCampaign,
  deletePublicHealthCampaign
};
