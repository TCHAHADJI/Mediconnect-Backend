const Medicine = require('../models/Medicine');
const AuditLog = require('../models/AuditLog');

// Get paginated list of Master Medicines with advanced filters
const getMasterMedicines = async (req, res) => {
  try {
    const {
      search,
      category,
      form,
      dispensingCategory,
      atcCode,
      minsanteApproved,
      status, // 'all', 'active', 'inactive'
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    const query = {};

    // Only filter by isActive if explicitly requested
    if (status === 'active') {
      query.isActive = { $ne: false };
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    // By default (or status === 'all'), all medicines in the database are returned!

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { activeIngredient: { $regex: search, $options: 'i' } },
        { atcCode: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all' && category.trim() !== '') {
      query.category = { $regex: category.trim(), $options: 'i' };
    }
    if (form && form !== 'all' && form.trim() !== '') {
      query.form = { $regex: form.trim(), $options: 'i' };
    }
    if (dispensingCategory && dispensingCategory !== 'all' && dispensingCategory.trim() !== '') {
      query.dispensingCategory = dispensingCategory.trim();
    }
    if (atcCode && atcCode.trim() !== '') {
      query.atcCode = { $regex: atcCode.trim(), $options: 'i' };
    }
    if (minsanteApproved !== undefined && minsanteApproved !== '') {
      query.minsanteApproved = minsanteApproved === 'true';
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const isFetchAll = limit === 'all' || parseInt(limit, 10) >= 500;
    const pageSize = isFetchAll ? 1000 : Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    const skip = isFetchAll ? 0 : (pageNum - 1) * pageSize;

    const sortOptions = {};
    if (sortBy) {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions.name = 1;
    }

    const [medicines, total, distinctCategories] = await Promise.all([
      Medicine.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Medicine.countDocuments(query),
      Medicine.distinct('category')
    ]);

    const [totalInDb, activeCount] = await Promise.all([
      Medicine.countDocuments(),
      Medicine.countDocuments({ isActive: { $ne: false } })
    ]);

    res.json({
      success: true,
      data: {
        medicines,
        categories: distinctCategories.filter(Boolean),
        summary: {
          totalInDb,
          activeCount,
          filteredCount: total
        },
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: isFetchAll ? 1 : Math.ceil(total / pageSize)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching master catalogue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch master medicines catalogue',
      error: error.message
    });
  }
};

// Fast search / autocomplete endpoint for pharmacies to select medicine
const searchMasterMedicines = async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      const topMedicines = await Medicine.find({ isActive: { $ne: false } })
        .limit(parseInt(limit, 10))
        .select('name genericName brand strength dosage form category dispensingCategory atcCode manufacturer')
        .lean();
      return res.json({ success: true, data: topMedicines });
    }

    const regex = new RegExp(q.trim(), 'i');
    const results = await Medicine.find({
      isActive: { $ne: false },
      $or: [
        { name: regex },
        { genericName: regex },
        { brand: regex },
        { activeIngredient: regex },
        { atcCode: regex },
        { barcode: regex }
      ]
    })
      .limit(parseInt(limit, 10))
      .select('name genericName brand strength dosage form category dispensingCategory atcCode manufacturer bioequivalentGroup referencePriceCeiling')
      .lean();

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error in master catalogue search:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search master catalogue',
      error: error.message
    });
  }
};

// Get single master medicine by ID
const getMasterMedicineById = async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Master medicine not found'
      });
    }

    // Also fetch bioequivalent certified alternatives if grouped
    let bioequivalents = [];
    if (medicine.bioequivalentGroup) {
      bioequivalents = await Medicine.find({
        _id: { $ne: medicine._id },
        bioequivalentGroup: medicine.bioequivalentGroup,
        isActive: { $ne: false }
      }).select('name genericName brand strength form dispensingCategory referencePriceCeiling');
    }

    res.json({
      success: true,
      data: {
        medicine,
        bioequivalents
      }
    });
  } catch (error) {
    console.error('Error fetching master medicine by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch master medicine details',
      error: error.message
    });
  }
};

// Create a new master medicine (Admin / Health Authority)
const createMasterMedicine = async (req, res) => {
  try {
    const {
      name,
      genericName,
      brand,
      manufacturer,
      atcCode,
      activeIngredient,
      strength,
      dosage,
      form,
      administrationRoute,
      category,
      dispensingCategory,
      requiresPrescription,
      isControlledSubstance,
      barcode,
      cipCode,
      bioequivalentGroup,
      minsanteApproved,
      minsanteApprovalNumber,
      description,
      indications,
      sideEffects,
      contraindications,
      referencePriceCeiling
    } = req.body;

    if (!name || (typeof name === 'string' && !name.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Medicine name is required'
      });
    }

    const cleanBarcode = barcode && typeof barcode === 'string' && barcode.trim() !== '' ? barcode.trim() : undefined;
    const cleanCipCode = cipCode && typeof cipCode === 'string' && cipCode.trim() !== '' ? cipCode.trim() : undefined;
    const cleanAtcCode = atcCode && typeof atcCode === 'string' && atcCode.trim() !== '' ? atcCode.trim().toUpperCase() : undefined;
    const cleanApprovalNumber = minsanteApprovalNumber && typeof minsanteApprovalNumber === 'string' && minsanteApprovalNumber.trim() !== '' ? minsanteApprovalNumber.trim() : undefined;
    const cleanPriceCeiling = referencePriceCeiling !== undefined && referencePriceCeiling !== null && referencePriceCeiling !== '' && !isNaN(parseFloat(referencePriceCeiling)) ? parseFloat(referencePriceCeiling) : undefined;

    const newMedicine = new Medicine({
      name: name.trim(),
      genericName: (genericName && genericName.trim()) || name.trim(),
      brand: (brand && brand.trim()) || name.trim(),
      manufacturer: manufacturer && manufacturer.trim() ? manufacturer.trim() : undefined,
      atcCode: cleanAtcCode,
      activeIngredient: activeIngredient && activeIngredient.trim() ? activeIngredient.trim() : undefined,
      strength: (strength && strength.trim()) || (dosage && dosage.trim()) || undefined,
      dosage: (dosage && dosage.trim()) || (strength && strength.trim()) || undefined,
      form: form || 'Comprimé',
      administrationRoute: administrationRoute || 'Oral',
      category: category || 'Général',
      dispensingCategory: dispensingCategory || (requiresPrescription ? 'PRESCRIPTION_ONLY' : 'OTC'),
      requiresPrescription: requiresPrescription || dispensingCategory === 'PRESCRIPTION_ONLY',
      isControlledSubstance: !!isControlledSubstance,
      barcode: cleanBarcode,
      cipCode: cleanCipCode,
      bioequivalentGroup: bioequivalentGroup || (genericName ? `${genericName.toLowerCase().trim().replace(/\s+/g, '-')}-${strength || ''}-${form || ''}` : undefined),
      minsanteApproved: minsanteApproved !== undefined ? minsanteApproved : true,
      minsanteApprovalNumber: cleanApprovalNumber,
      description: description && description.trim() ? description.trim() : undefined,
      indications: indications && indications.trim() ? indications.trim() : undefined,
      sideEffects: sideEffects && sideEffects.trim() ? sideEffects.trim() : undefined,
      contraindications: contraindications && contraindications.trim() ? contraindications.trim() : undefined,
      referencePriceCeiling: cleanPriceCeiling
    });

    const saved = await newMedicine.save();

    // Log audit event if user is logged in
    if (req.user) {
      await AuditLog.create({
        action: 'CREATE_MASTER_MEDICINE',
        userId: req.user._id || req.user.id,
        resource: 'MASTER_MEDICINE',
        resourceId: saved._id,
        details: {
          medicineId: saved._id,
          name: saved.name,
          genericName: saved.genericName,
          atcCode: saved.atcCode
        }
      }).catch(err => console.warn('AuditLog error:', err.message));
    }

    res.status(201).json({
      success: true,
      message: 'Master medicine created successfully',
      data: saved
    });
  } catch (error) {
    console.error('Error creating master medicine:', error);
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        message: `A medicine with this ${duplicateField === 'barcode' ? 'barcode' : duplicateField} already exists in the master catalogue.`,
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create master medicine',
      error: error.message
    });
  }
};

// Update master medicine (Admin / Health Authority)
const updateMasterMedicine = async (req, res) => {
  try {
    const updateData = { ...req.body };
    const unsetFields = {};

    if (updateData.barcode !== undefined) {
      if (!updateData.barcode || (typeof updateData.barcode === 'string' && updateData.barcode.trim() === '')) {
        delete updateData.barcode;
        unsetFields.barcode = 1;
      } else {
        updateData.barcode = updateData.barcode.trim();
      }
    }

    if (updateData.cipCode !== undefined) {
      if (!updateData.cipCode || (typeof updateData.cipCode === 'string' && updateData.cipCode.trim() === '')) {
        delete updateData.cipCode;
        unsetFields.cipCode = 1;
      } else {
        updateData.cipCode = updateData.cipCode.trim();
      }
    }

    if (updateData.atcCode !== undefined) {
      if (!updateData.atcCode || (typeof updateData.atcCode === 'string' && updateData.atcCode.trim() === '')) {
        delete updateData.atcCode;
        unsetFields.atcCode = 1;
      } else {
        updateData.atcCode = updateData.atcCode.trim().toUpperCase();
      }
    }

    if (updateData.referencePriceCeiling !== undefined && updateData.referencePriceCeiling !== null && updateData.referencePriceCeiling !== '') {
      updateData.referencePriceCeiling = parseFloat(updateData.referencePriceCeiling);
    }

    const updateQuery = { $set: updateData };
    if (Object.keys(unsetFields).length > 0) {
      updateQuery.$unset = unsetFields;
    }

    const updated = await Medicine.findByIdAndUpdate(
      req.params.id,
      updateQuery,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Master medicine not found'
      });
    }

    res.json({
      success: true,
      message: 'Master medicine updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating master medicine:', error);
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        message: `A medicine with this ${duplicateField === 'barcode' ? 'barcode' : duplicateField} already exists in the master catalogue.`,
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update master medicine',
      error: error.message
    });
  }
};

// Delete / Deactivate master medicine
const deleteMasterMedicine = async (req, res) => {
  try {
    const { permanent } = req.query;
    if (permanent === 'true') {
      const deleted = await Medicine.findByIdAndDelete(req.params.id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Master medicine not found'
        });
      }
      return res.json({
        success: true,
        message: 'Master medicine permanently removed from database'
      });
    }

    const medicine = await Medicine.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true }
    );

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Master medicine not found'
      });
    }

    res.json({
      success: true,
      message: 'Master medicine deactivated successfully'
    });
  } catch (error) {
    console.error('Error deactivating master medicine:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate master medicine',
      error: error.message
    });
  }
};

// Seed standard Cameroon essential medicines
const seedEssentialMedicines = async (req, res) => {
  try {
    const existingCount = await Medicine.countDocuments();
    if (existingCount > 15) {
      return res.json({
        success: true,
        message: `Catalogue already contains ${existingCount} items. Skipping initial seed.`
      });
    }

    const essentialCameroonMedicines = [
      {
        name: 'Coartem 20/120mg',
        genericName: 'Artéméther + Luméfantrine',
        brand: 'Coartem (Novartis)',
        manufacturer: 'Novartis Pharma',
        atcCode: 'P01BF01',
        activeIngredient: 'Artéméther 20mg / Luméfantrine 120mg',
        strength: '20mg/120mg',
        dosage: '1 comprimé matin et soir selon le poids',
        form: 'Comprimé',
        administrationRoute: 'Oral',
        category: 'Antipaludique (ACT)',
        dispensingCategory: 'PRESCRIPTION_ONLY',
        requiresPrescription: true,
        isControlledSubstance: false,
        minsanteApproved: true,
        minsanteApprovalNumber: 'MINSANTE-ACT-2024-001',
        bioequivalentGroup: 'artemether-lumefantrine-20-120',
        referencePriceCeiling: 2800,
        description: 'Traitement de première ligne du paludisme à Plasmodium falciparum non compliqué au Cameroun.'
      },
      {
        name: 'Artefan 20/120mg',
        genericName: 'Artéméther + Luméfantrine',
        brand: 'Artefan (Ajanta)',
        manufacturer: 'Ajanta Pharma',
        atcCode: 'P01BF01',
        activeIngredient: 'Artéméther 20mg / Luméfantrine 120mg',
        strength: '20mg/120mg',
        dosage: 'Posologie selon protocole national PNLP',
        form: 'Comprimé',
        administrationRoute: 'Oral',
        category: 'Antipaludique (ACT)',
        dispensingCategory: 'PRESCRIPTION_ONLY',
        requiresPrescription: true,
        isControlledSubstance: false,
        minsanteApproved: true,
        minsanteApprovalNumber: 'MINSANTE-ACT-2024-002',
        bioequivalentGroup: 'artemether-lumefantrine-20-120',
        referencePriceCeiling: 1800,
        description: 'Générique certifié bioéquivalent au Coartem homologué par le MINSANTÉ.'
      },
      {
        name: 'Doliprane 500mg',
        genericName: 'Paracétamol',
        brand: 'Doliprane (Sanofi)',
        manufacturer: 'Sanofi Aventis',
        atcCode: 'N02BE01',
        activeIngredient: 'Paracétamol',
        strength: '500mg',
        dosage: '1 à 2 comprimés toutes les 6 heures sans dépasser 3g/jour',
        form: 'Comprimé',
        administrationRoute: 'Oral',
        category: 'Antalgique / Antipyrétique',
        dispensingCategory: 'OTC',
        requiresPrescription: false,
        minsanteApproved: true,
        bioequivalentGroup: 'paracetamol-500mg-tablet',
        referencePriceCeiling: 1200,
        description: 'Traitement symptomatique des douleurs d intensité légère à modérée et des états fébriles.'
      },
      {
        name: 'Paracétamol Générique 500mg',
        genericName: 'Paracétamol',
        brand: 'Paracétamol DCI (Cinpharm)',
        manufacturer: 'Cinpharm Cameroun',
        atcCode: 'N02BE01',
        activeIngredient: 'Paracétamol',
        strength: '500mg',
        dosage: '500mg à 1g par prise',
        form: 'Comprimé',
        administrationRoute: 'Oral',
        category: 'Antalgique / Antipyrétique',
        dispensingCategory: 'OTC',
        requiresPrescription: false,
        minsanteApproved: true,
        bioequivalentGroup: 'paracetamol-500mg-tablet',
        referencePriceCeiling: 500,
        description: 'Générique local fabriqué au Cameroun, certifié bioéquivalent.'
      },
      {
        name: 'Amoxicilline 500mg Gélule',
        genericName: 'Amoxicilline',
        brand: 'Amoxil (GSK) / Générique',
        manufacturer: 'GlaxoSmithKline',
        atcCode: 'J01CA04',
        activeIngredient: 'Amoxicilline trihydrate',
        strength: '500mg',
        dosage: '500mg à 1g 3 fois par jour',
        form: 'Gélule',
        administrationRoute: 'Oral',
        category: 'Antibiotique (Pénicilline)',
        dispensingCategory: 'PRESCRIPTION_ONLY',
        requiresPrescription: true,
        minsanteApproved: true,
        bioequivalentGroup: 'amoxicilline-500mg-gelule',
        referencePriceCeiling: 2500,
        description: 'Antibiotique à large spectre pour infections ORL, respiratoires et urinaires.'
      },
      {
        name: 'Sels de Réhydratation Orale (SRO) OMS',
        genericName: 'Glucose + Électrolytes',
        brand: 'SRO Sachet',
        manufacturer: 'UNICEF / MINSANTÉ',
        atcCode: 'A07CA',
        activeIngredient: 'Chlorure de sodium, glucose, chlorure de potassium, citrate trisodique',
        strength: 'Sachet pour 1L',
        dosage: 'Diluer dans 1 litre d eau potable',
        form: 'Sachet Poudre',
        administrationRoute: 'Oral',
        category: 'Réhydratation & Antidiarrhéique',
        dispensingCategory: 'OTC',
        requiresPrescription: false,
        minsanteApproved: true,
        bioequivalentGroup: 'sro-oms-sachet',
        referencePriceCeiling: 300,
        description: 'Prévention et traitement de la déshydratation aiguë due aux diarrhées (choléra, gastroentérites).'
      },
      {
        name: 'Flagyl 500mg (Métronidazole)',
        genericName: 'Métronidazole',
        brand: 'Flagyl (Sanofi)',
        manufacturer: 'Sanofi',
        atcCode: 'P01AB01',
        activeIngredient: 'Métronidazole',
        strength: '500mg',
        dosage: '500mg 2 à 3 fois par jour',
        form: 'Comprimé',
        administrationRoute: 'Oral',
        category: 'Antiparasitaire / Antibactérien',
        dispensingCategory: 'PRESCRIPTION_ONLY',
        requiresPrescription: true,
        minsanteApproved: true,
        bioequivalentGroup: 'metronidazole-500mg',
        referencePriceCeiling: 1800,
        description: 'Traitement de l amibiase, de la giardiase et des infections anaérobies.'
      },
      {
        name: 'Glucophage 500mg (Metformine)',
        genericName: 'Metformine chlorhydrate',
        brand: 'Glucophage (Merck)',
        manufacturer: 'Merck Santé',
        atcCode: 'A10BA02',
        activeIngredient: 'Metformine',
        strength: '500mg',
        dosage: '1 comprimé pendant ou après le repas',
        form: 'Comprimé',
        administrationRoute: 'Oral',
        category: 'Antidiabétique Oral',
        dispensingCategory: 'PRESCRIPTION_ONLY',
        requiresPrescription: true,
        minsanteApproved: true,
        bioequivalentGroup: 'metformin-500mg',
        referencePriceCeiling: 3200,
        description: 'Traitement du diabète de type 2 chez l adulte.'
      },
      {
        name: 'Insuline Rapide 100 UI/ml',
        genericName: 'Insuline humaine',
        brand: 'Actrapid Penfill (Novo Nordisk)',
        manufacturer: 'Novo Nordisk',
        atcCode: 'A10AB01',
        activeIngredient: 'Insuline humaine',
        strength: '100 UI/ml',
        dosage: 'Selon schéma insulinique médical',
        form: 'Injectable / Cartouche',
        administrationRoute: 'Sous-cutanée',
        category: 'Antidiabétique (Insuline)',
        dispensingCategory: 'PRESCRIPTION_ONLY',
        requiresPrescription: true,
        minsanteApproved: true,
        bioequivalentGroup: 'insulin-rapid-100ui',
        referencePriceCeiling: 7500,
        description: 'Produit vital surveillé par le MINSANTÉ pour prévenir les ruptures critiques de stock.'
      },
      {
        name: 'Tramadol 50mg Gélule',
        genericName: 'Tramadol chlorhydrate',
        brand: 'Topalgic / Tramadol',
        manufacturer: 'Grünenthal',
        atcCode: 'N02AX02',
        activeIngredient: 'Tramadol',
        strength: '50mg',
        dosage: '50mg à 100mg par prise sur ordonnance stricte',
        form: 'Gélule',
        administrationRoute: 'Oral',
        category: 'Antalgique Palier 2 (Opioïde)',
        dispensingCategory: 'CONTROLLED_SUBSTANCE',
        requiresPrescription: true,
        isControlledSubstance: true,
        minsanteApproved: true,
        bioequivalentGroup: 'tramadol-50mg',
        referencePriceCeiling: 2200,
        description: 'Substance réglementée sous haute surveillance de l Ordre National des Pharmaciens (ONPC).'
      }
    ];

    const inserted = await Medicine.insertMany(essentialCameroonMedicines);

    res.json({
      success: true,
      message: `Successfully seeded ${inserted.length} standardized essential Cameroon medicines into the Master Catalogue!`,
      data: inserted
    });
  } catch (error) {
    console.error('Error seeding essential medicines:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed essential medicines',
      error: error.message
    });
  }
};

module.exports = {
  getMasterMedicines,
  searchMasterMedicines,
  getMasterMedicineById,
  createMasterMedicine,
  updateMasterMedicine,
  deleteMasterMedicine,
  seedEssentialMedicines
};
