const HealthTip = require('../models/HealthTip');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * Curated standard health categories for Cameroon public health
 */
const STANDARD_CATEGORIES = [
  'Paludisme & Prévention MILDA',
  'Riposte Choléra & Eau Salubre',
  'Hygiène & Assainissement',
  'Santé Mère-Enfant & CPN',
  'Vaccination & PEV',
  'Usage Rationnel des Médicaments',
  'Lutte Contre Médicaments de la Rue',
  'Maladies Chroniques, Diabète & Hypertension',
  'Nutrition & Alimentation Saine',
  'Premiers Secours & Urgences',
  'Santé Mentale & Bien-être',
  'Santé Saisonnière & Climat',
  'Maladies Infectieuses & Épidémies',
  'Santé Cardiovasculaire',
  'Santé Respiratoire & Asthme',
  'Soins Pédiatriques'
];

/**
 * @desc    Get all health tips
 * @route   GET /api/health-tips
 * @access  Private / Patients (only APPROVED & isPublished), Admins & Health Authorities (all)
 */
const getHealthTips = async (req, res) => {
  try {
    let query = {};
    const role = req.user?.userType || req.user?.role;

    if (role === 'ADMIN' || role === 'HEALTH_AUTHORITY') {
      // Admins and Health Authorities can see all tips (including drafts, pending approval, rejected)
      query = {};
    } else {
      // Patients, Pharmacies, Citizens:
      // STRICT REGULATORY FILTER: Only APPROVED tips with isPublished: true are visible!
      query = { status: 'APPROVED', isPublished: true };
    }

    const healthTips = await HealthTip.aggregate([
      { $match: query },
      { $addFields: { views: { $size: { "$ifNull": ["$viewedBy", []] } } } },
      { $project: { viewedBy: 0 } },
      { $sort: { createdAt: -1 } }
    ]);

    res.json({ success: true, data: healthTips });
  } catch (error) {
    console.error('Error fetching health tips:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des conseils santé' });
  }
};

/**
 * @desc    Get all available health tip categories
 * @route   GET /api/health-tips/categories
 * @access  Private
 */
const getHealthTipCategories = async (req, res) => {
  try {
    const dbCategories = await HealthTip.distinct('category');
    // Combine standard list with existing categories in MongoDB and remove duplicates
    const allCategories = Array.from(new Set([...STANDARD_CATEGORIES, ...dbCategories].filter(Boolean))).sort();
    res.json({ success: true, data: allCategories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des catégories', error: error.message });
  }
};

/**
 * @desc    Create a health tip (by Admin as DRAFT / PENDING_APPROVAL)
 * @route   POST /api/health-tips
 * @access  Private/Admin
 */
const createHealthTip = async (req, res) => {
  try {
    const { title, content, category, author, targetAudience = 'Tous publics', priority = 'STANDARD' } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json({ success: false, message: 'Le titre, le contenu et la catégorie sont obligatoires' });
    }

    // When created by the Admin, the tip MUST remain unpublished and in PENDING_APPROVAL status
    // until the National Health Authority approves it.
    const healthTip = await HealthTip.create({
      title: title.trim(),
      content: content.trim(),
      category: category.trim(),
      author: author?.trim() || req.user?.name || 'MediConnect Administration',
      isPublished: false, // NOT published until Health Authority validates it!
      status: 'PENDING_APPROVAL', // Waiting for Health Authority review!
      submitterRole: 'ADMIN',
      submittedBy: req.user?._id,
      targetAudience,
      priority,
      reviewerNotes: 'Draft submitted by Administrator awaiting formal Health Authority regulatory clearance'
    });

    await AuditLog.create({
      userId: req.user?._id,
      action: 'CREATE_DRAFT_HEALTH_TIP',
      resource: 'HealthTip',
      resourceId: healthTip._id,
      details: { title: healthTip.title, status: 'PENDING_APPROVAL' },
    }).catch(err => console.warn('Audit error:', err.message));

    // Notify all active Health Authority officers that a new tip requires regulatory clearance
    const healthAuthorities = await User.find({ userType: 'HEALTH_AUTHORITY', status: 'ACTIVE' }).select('_id');
    if (healthAuthorities.length > 0) {
      const notifs = healthAuthorities.map(ha => ({
        userId: ha._id,
        type: 'GENERAL',
        title: '📋 New health tip submitted for regulatory clearance',
        message: `The administrator submitted the advisory "${healthTip.title}" (${healthTip.category}) awaiting official Health Authority clearance before patient broadcast.`,
        relatedId: healthTip._id,
        read: false
      }));
      await Notification.insertMany(notifs, { ordered: false }).catch(err => console.warn('Notif error:', err.message));
    }

    res.status(201).json({
      success: true,
      message: 'Health tip draft saved successfully in database. It is now awaiting Health Authority (MINSANTÉ/ONPC) clearance before being visible to patients.',
      data: healthTip
    });
  } catch (error) {
    console.error('Error creating health tip:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update a health tip
 * @route   PATCH /api/health-tips/:id
 * @access  Private/Admin
 */
const updateHealthTip = async (req, res) => {
  try {
    const tip = await HealthTip.findById(req.params.id);
    if (!tip) {
      return res.status(404).json({ success: false, message: 'Health tip not found' });
    }

    const { title, content, category, author, targetAudience, priority } = req.body;
    if (title !== undefined) tip.title = title.trim();
    if (content !== undefined) tip.content = content.trim();
    if (category !== undefined) tip.category = category.trim();
    if (author !== undefined) tip.author = author.trim();
    if (targetAudience !== undefined) tip.targetAudience = targetAudience;
    if (priority !== undefined) tip.priority = priority;

    // If an Admin updates a tip that was previously REJECTED, it goes back to PENDING_APPROVAL for re-clearance
    if (tip.status === 'REJECTED') {
      tip.status = 'PENDING_APPROVAL';
      tip.isPublished = false;
      tip.reviewerNotes = 'Updated by administrator after previous rejection (pending re-clearance)';
    }

    await tip.save();

    await AuditLog.create({
      userId: req.user?._id,
      action: 'UPDATE_HEALTH_TIP',
      resource: 'HealthTip',
      resourceId: tip._id,
      details: { title: tip.title, changes: req.body },
    }).catch(err => console.warn('Audit error:', err.message));

    res.json({
      success: true,
      message: 'Health tip updated successfully',
      data: tip
    });
  } catch (error) {
    console.error('Error updating health tip:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete a health tip
 * @route   DELETE /api/health-tips/:id
 * @access  Private/Admin
 */
const deleteHealthTip = async (req, res) => {
  try {
    const healthTip = await HealthTip.findById(req.params.id);

    if (!healthTip) {
      return res.status(404).json({ success: false, message: 'Health tip not found' });
    }

    await healthTip.deleteOne();

    await AuditLog.create({
      userId: req.user?._id,
      action: 'DELETE_HEALTH_TIP',
      resource: 'HealthTip',
      resourceId: healthTip._id,
      details: { title: healthTip.title },
    }).catch(err => console.warn('Audit error:', err.message));

    res.json({ success: true, message: 'Health tip deleted successfully from database' });
  } catch (error) {
    console.error('Error deleting health tip:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting health tip' });
  }
};

/**
 * @desc    Increment view count for a health tip
 * @route   PATCH /api/health-tips/:id/view
 * @access  Private
 */
const incrementViewCount = async (req, res) => {
  try {
    const healthTip = await HealthTip.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { viewedBy: req.user?._id } },
      { new: true }
    );

    if (!healthTip) {
      return res.status(404).json({ success: false, message: 'Conseil santé introuvable' });
    }

    res.status(200).json({ success: true, views: (healthTip.viewedBy || []).length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * Official MINSANTÉ Health Tips Seed Data
 */
const OFFICIAL_HEALTH_TIPS = [
  {
    title: 'Asthme bronchique : Vigilance Saisonnière & Conduite à Tenir',
    category: 'Santé Respiratoire & Asthme',
    targetConditions: ['Asthme bronchique', 'Asthme'],
    priority: 'HIGH',
    readTime: '3 min',
    tags: ['asthme', 'respiratoire', 'bronchodilatateur', 'ventoline', 'crise', 'poussière'],
    summary: "Recommandations clés pour prévenir les exacerbations d'asthme au Cameroun : identification des déclencheurs, observance du traitement de fond et utilisation du bronchodilatateur.",
    content: "L'asthme bronchique est une affection respiratoire chronique nécessitant une surveillance continue, particulièrement lors des transitions saisonnières (Harmattan, poussières urbaines et début des saisons des pluies au Cameroun).\n\n1. Gardez toujours votre bronchodilatateur d'action rapide (Salbutamol / Ventoline) à portée de main.\n2. Prenez votre traitement de fond anti-inflammatoire (corticoïdes inhalés) même en l'absence de symptômes si prescrit.\n3. Évitez l'exposition à la fumée de bois, aux feux de brousse et aux poussières de chantiers.\n4. En cas de crise ne cédant pas après 2 à 4 bouffées d'inhalateur ou si vous avez des difficultés à parler, rendez-vous immédiatement aux urgences de votre hôpital de district le plus proche (HCY, Laquintinie, etc.).",
    author: 'Programme National de Lutte contre les Maladies Chroniques - MINSANTÉ',
    targetAudience: 'Patients asthmatiques et entourage',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: 'Hypertension Artérielle (HTA) : Protection Cardiovasculaire & Règles Hygiéno-Diététiques',
    category: 'Maladies Chroniques, Diabète & Hypertension',
    targetConditions: ['Hypertension Artérielle (HTA)', 'Hypertension'],
    priority: 'HIGH',
    readTime: '3 min',
    tags: ['hypertension', 'hta', 'tension', 'coeur', 'sel', 'cardiovasculaire', 'pression'],
    summary: "Contrôle de la pression artérielle : réduction du sel de table et des cubes d'assaisonnement, activité physique modérée et respect strict des prises quotidiennes.",
    content: "L'hypertension artérielle est souvent qualifiée de 'tueur silencieux' car elle évolue sans douleur apparente. Au Cameroun, un adulte sur trois est concerné.\n\n1. Réduisez la consommation de sel et de cubes exhausteurs de goût très riches en sodium.\n2. Privilégiez les assaisonnements naturels du terroir (djansang, ail, gingembre, basilic africain).\n3. Ne suspendez jamais votre traitement antihypertenseur sans avis médical, même si vos chiffres tensionnels se normalisent.\n4. Évitez l'automédication avec les anti-inflammatoires (Ibuprofène, Diclofénac) qui augmentent la tension artérielle et fragilisent les reins.\n5. Faites mesurer votre tension au moins une fois par mois en pharmacie ou au centre de santé.",
    author: 'Société Camerounaise de Cardiologie & MINSANTÉ',
    targetAudience: 'Adultes et patients hypertendus',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: "Diabète de Type 2 : Gestion de l'Index Glycémique avec les Aliments Camerounais",
    category: 'Maladies Chroniques, Diabète & Hypertension',
    targetConditions: ['Diabète de Type 2', 'Diabète de Type 1', 'Diabète'],
    priority: 'HIGH',
    readTime: '4 min',
    tags: ['diabete', 'glycemie', 'insuline', 'sucre', 'nutrition', 'pied'],
    summary: 'Adapter son alimentation traditionnelle camerounaise pour stabiliser la glycémie : choix des féculents, inspection quotidienne des pieds et autosurveillance.',
    content: "Bien vivre avec le diabète au Cameroun implique de composer intelligemment avec nos mets locaux.\n\n1. Choisissez des féculents à index glycémique modéré : préférez le plantain non mûr bouilli, la patate douce ou le manioc complet aux tubercules très mûrs ou frits.\n2. Associez toujours vos repas à des légumes verts feuilles locaux riches en fibres (Ndolé sans excès d'huile, Folong, Koki, Eru).\n3. Inspectez quotidiennement vos pieds à la recherche de petites plaies, rougeurs ou mycoses (le 'pied diabétique' doit être pris en charge d'urgence pour éviter les complications).\n4. Buvez de l'eau régulièrement et limitez strictement les boissons sucrées industrielles et bières.\n5. Suivez régulièrement votre hémoglobine glyquée (HbA1c) tous les 3 mois.",
    author: 'Division du Contrôle des Maladies Non Transmissibles - MINSANTÉ',
    targetAudience: 'Patients diabétiques et familles',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: 'Drépanocytose (Trait Drépanocytaire AS / SS) : Prévention Hydrique et Défense Antipaludique',
    category: 'Maladies Chroniques, Diabète & Hypertension',
    targetConditions: ['Drépanocytose'],
    targetGenotypes: ['SS', 'AS', 'SC', 'AC'],
    priority: 'HIGH',
    readTime: '3 min',
    tags: ['drepanocytose', 'genotype', 'hemoglobine', 'crise', 'hydratation', 'paludisme'],
    summary: 'Directives médicales vitales pour les personnes drépanocytaires et porteuses du trait AS : hyperhydratation, prévention des accès palustres et évitement du froid soudain.',
    content: "Chez les personnes atteintes de drépanocytose ou porteuses du trait drépanocytaire, la déshydratation et la fièvre favorisent la falciformation des globules rouges et déclenchent des crises vaso-occlusives très douloureuses.\n\n1. Hydratation abondante : buvez entre 2,5 et 3 litres d'eau potable par jour pour fluidifier le sang.\n2. Protection antipaludique rigoureuse : le paludisme est le premier facteur déclenchant de crise aiguë. Dormez systématiquement sous MILDA.\n3. Évitez les bains d'eau trop froide, la climatisation excessive et les efforts physiques en apnée.\n4. Prenez régulièrement votre supplémentation en Acide Folique selon prescription de votre médecin.\n5. En cas de fièvre ou de douleurs osseuses aiguës, consultez sans attendre dans un centre hospitalier équipé.",
    author: 'Centre National de Référence de la Drépanocytose (Yaoundé / Douala) & MINSANTÉ',
    targetAudience: 'Porteurs de traits et patients drépanocytaires',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: 'Alerte Sécurité Allergique : Que Faire en Cas d’Allergie à la Pénicilline & Bêtalactamines ?',
    category: 'Usage Rationnel des Médicaments',
    targetAllergies: ['Pénicilline / Bêtalactamines', 'Pénicilline', 'Amoxicilline', 'Augmentin'],
    priority: 'URGENT',
    readTime: '2 min',
    tags: ['allergie', 'penicilline', 'amoxicilline', 'choc', 'anaphylaxie', 'antibiotique'],
    summary: "Protocole d'urgence et contre-indications absolues pour les patients présentant une hypersensibilité documentée aux antibiotiques de la famille des pénicillines.",
    content: "Une allergie avérée aux pénicillines expose à un risque de choc anaphylactique ou d'œdème de Quincke pouvant mettre en jeu le pronostic vital.\n\n1. Ne prenez JAMAIS d'Amoxicilline, d'Augmentin, d'Ampicilline ou de Pénicilline V, sous aucune forme (comprimé, sirop, injection).\n2. Informez impérativement chaque médecin, dentiste, infirmier et pharmacien AVANT toute prescription ou délivrance.\n3. Assurez-vous que cette mention figure bien dans votre Carnet de Santé Numérique et sur votre carte d'urgence QR MediConnect.\n4. En cas d'infection bactérienne, des alternatives thérapeutiques efficaces existent (Macrolides comme l'Azithromycine, Fluoroquinolones, etc.).",
    author: 'Commission Nationale de Pharmacovigilance & Ordre National des Pharmaciens (ONPC)',
    targetAudience: 'Patients avec antécédents allergiques',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: 'Allergie à l’Aspirine & AINS : Danger des Anti-inflammatoires en Automédication',
    category: 'Usage Rationnel des Médicaments',
    targetConditions: ['Ulcère Gastro-duodénal'],
    targetAllergies: ['Aspirine / AINS (Ibuprofène, Diclofénac)', 'Aspirine', 'Ibuprofène', 'Diclofénac'],
    priority: 'HIGH',
    readTime: '2 min',
    tags: ['aspirine', 'ains', 'ibuprofene', 'diclofenac', 'estomac', 'ulcere', 'allergie'],
    summary: "Pourquoi les patients intolérants à l'aspirine ou souffrant d'ulcère doivent privilégier le paracétamol et bannir les AINS en automédication.",
    content: "Les anti-inflammatoires non stéroïdiens (Ibuprofène, Diclofénac, Kétoprofène) et l'aspirine peuvent provoquer des bronchospasmes sévères chez les personnes allergiques, ainsi que des hémorragies digestives chez les personnes atteintes d'ulcère gastrique.\n\n1. Pour traiter la fièvre ou les douleurs courantes (maux de tête, courbatures), le Paracétamol (1g toutes les 6 heures chez l'adulte, max 3-4g/jour) est la référence sécuritaire.\n2. Ne combinez jamais plusieurs médicaments contre la douleur sans l'avis d'un professionnel de santé.\n3. Refusez tout comprimé non identifié vendu à la sauvette ou sur les étals de marché.",
    author: 'Direction de la Pharmacie, du Médicament et des Laboratoires (DPML / MINSANTÉ)',
    targetAudience: 'Patients souffrant de gastrite ou d’allergies médicamenteuses',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: 'Couverture Santé Universelle (CSU Cameroun) : Bénéficiez de Vos Droits et Consultations',
    category: 'Santé Mère-Enfant & CPN',
    priority: 'STANDARD',
    readTime: '3 min',
    tags: ['csu', 'assurance', 'remboursement', 'matricule', 'couverture', 'soins'],
    summary: 'Comment faire valoir votre matricule CSU dans les formations sanitaires affiliées au Cameroun pour une prise en charge à 70% des soins et médicaments essentiels.',
    content: "La Couverture Santé Universelle (CSU) mise en place par le Gouvernement camerounais garantit à chaque citoyen l'accès à des soins de qualité sans barrière financière.\n\n1. Présentez votre matricule CSU ou votre carte numérique MediConnect lors de votre arrivée au guichet d'admission de l'hôpital.\n2. Bénéficiez du panier de soins de base : consultations médicales, traitement du paludisme simple et grave, accouchements et dialyse à tarif fortement subventionné.\n3. Obtenez vos médicaments génériques essentiels directement à la pharmacie hospitalière avec votre prise en charge validée.\n4. Si votre matricule n'est pas encore actif, rapprochez-vous des agents d'enrôlement CSU présents dans votre district de santé.",
    author: 'Cellule Nationale de Pilotage de la Couverture Santé Universelle (MINSANTÉ)',
    targetAudience: 'Assurés et familles éligibles à la CSU',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: 'Prévention du Paludisme : Dormir sous MILDA et Réflexe Test TDR dans les 24h',
    category: 'Paludisme & Prévention MILDA',
    priority: 'URGENT',
    readTime: '3 min',
    tags: ['paludisme', 'milda', 'moustiquaire', 'fievre', 'tdr', 'moustique', 'artemether'],
    summary: "Le paludisme reste la première cause de consultation au Cameroun. Les règles d'or : nuit sous moustiquaire imprégnée et dépistage rapide par TDR avant tout traitement.",
    content: "Le paludisme est transmis par la piqûre de l'anophèle femelle qui pique principalement entre le coucher et le lever du soleil.\n\n1. Dormez chaque nuit, toute l'année, sous Moustiquaire Imprégnée à Longue Durée d'Action (MILDA).\n2. Éliminez les eaux stagnantes (vieux pneus, récipients ouverts, caniveaux bouchés) autour de votre domicile.\n3. Toute fièvre, même modérée, chez l'adulte ou l'enfant doit faire l'objet d'un Test de Diagnostic Rapide (TDR) ou d'une goutte épaisse avant de débuter un traitement antipaludique.\n4. En cas de test positif, suivez l'intégralité du traitement par CTA (Arteméther-Luméfantrine) pendant 3 jours complets sans interrompre dès disparition de la fièvre.",
    author: 'Programme National de Lutte contre le Paludisme (PNLP / MINSANTÉ)',
    targetAudience: 'Population générale résidant au Cameroun',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  },
  {
    title: 'Nutrition & Bien-Être : Maintenir un Indice de Masse Corporelle (IMC) Sain au Cameroun',
    category: 'Nutrition & Alimentation Saine',
    priority: 'MEDIUM',
    readTime: '3 min',
    tags: ['nutrition', 'poids', 'imc', 'alimentation', 'legumes', 'fruits', 'sport'],
    summary: 'Conseils diététiques adaptés au mode de vie camerounais pour prévenir la surcharge pondérale et protéger son cœur grâce aux produits frais locaux.',
    content: "Un Indice de Masse Corporelle (IMC) équilibré entre 18,5 et 24,9 préserve des maladies métaboliques (diabète, hypertension, stéatose hépatique).\n\n1. Composez une assiette saine : 1/2 de légumes frais (folong, zom, carottes, concombres), 1/4 de protéines (poisson frais braisé, œufs, légumineuses) et 1/4 de féculents.\n2. Limitez les fritures quotidiennes et réservez les mets très riches en huile rouge (taro sauce jaune, met de pistache) pour les occasions festives.\n3. Pratiquez au moins 30 minutes de marche rapide ou d'activité physique 5 fois par semaine.\n4. Hydratez-vous avec de l'eau claire plutôt qu'avec des jus industriels ou sodas.",
    author: 'Direction de la Promotion de la Santé - MINSANTÉ',
    targetAudience: 'Adultes et jeunes adultes',
    status: 'APPROVED',
    isPublished: true,
    submitterRole: 'HEALTH_AUTHORITY',
  }
];

const seedOfficialHealthTips = async () => {
  for (const tipData of OFFICIAL_HEALTH_TIPS) {
    const existing = await HealthTip.findOne({ title: tipData.title });
    if (!existing) {
      await HealthTip.create(tipData);
    } else {
      existing.targetConditions = tipData.targetConditions || [];
      existing.targetGenotypes = tipData.targetGenotypes || [];
      existing.targetAllergies = tipData.targetAllergies || [];
      existing.summary = tipData.summary || '';
      existing.readTime = tipData.readTime || '3 min';
      existing.status = 'APPROVED';
      existing.isPublished = true;
      await existing.save();
    }
  }
};

/**
 * @desc    Get recommended health tips personalized for the authenticated patient
 * @route   GET /api/health-tips/recommended
 * @access  Private / Patient
 */
const getRecommendedHealthTips = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    }

    const booklet = user.medicalBooklet || {};
    const patientDiseases = [
      ...(Array.isArray(booklet.chronicDiseases) ? booklet.chronicDiseases : []),
      ...(Array.isArray(user.chronicDiseases) ? user.chronicDiseases : []),
    ];
    const uniqueDiseases = Array.from(new Set(patientDiseases.map(d => d.trim()))).filter(Boolean);
    const genotype = (booklet.genotype || 'AA').toUpperCase().trim();
    const bloodGroup = booklet.bloodGroup || user.bloodGroup || 'O+';
    const bmi = booklet.bmi;
    const allergies = [
      ...((booklet.detailedAllergies || []).map(a => a.name)),
      ...(user.allergies || [])
    ];
    const uniqueAllergies = Array.from(new Set(allergies.map(a => a.trim()))).filter(Boolean);
    const hasCsu = Boolean(user.csuIdentifier || user.csuInsurance?.matricule);

    // Ensure database contains official approved tips
    const approvedCount = await HealthTip.countDocuments({ status: 'APPROVED', isPublished: true });
    if (approvedCount < 5) {
      await seedOfficialHealthTips();
    }

    const allApprovedTips = await HealthTip.find({ status: 'APPROVED', isPublished: true }).lean();

    // Scoring and personalized matching
    const scoredTips = allApprovedTips.map(tip => {
      let score = 0;
      const reasons = [];

      const fullText = `${tip.title} ${tip.content} ${tip.category} ${(tip.tags || []).join(' ')} ${(tip.targetConditions || []).join(' ')}`.toLowerCase();

      // 1. Match patient's chronic diseases
      for (const disease of uniqueDiseases) {
        const dLower = disease.toLowerCase();
        const matchesCondition = (tip.targetConditions || []).some(tc => tc.toLowerCase().includes(dLower) || dLower.includes(tc.toLowerCase()));
        
        let keywordMatch = false;
        if (dLower.includes('asthm') || dLower.includes('asthma')) {
          keywordMatch = fullText.includes('asthm') || fullText.includes('respirat') || fullText.includes('bronch');
        } else if (dLower.includes('diab')) {
          keywordMatch = fullText.includes('diab') || fullText.includes('glyc') || fullText.includes('insul');
        } else if (dLower.includes('hyper') || dLower.includes('hta') || dLower.includes('tension')) {
          keywordMatch = fullText.includes('hyper') || fullText.includes('tension') || fullText.includes('artér') || fullText.includes('cardio');
        } else if (dLower.includes('drépano') || dLower.includes('sickle')) {
          keywordMatch = fullText.includes('drépano') || fullText.includes('hémog') || fullText.includes('falciforme');
        } else if (dLower.includes('ulc') || dLower.includes('gastro')) {
          keywordMatch = fullText.includes('ulc') || fullText.includes('gastr') || fullText.includes('estomac');
        } else if (dLower.includes('rénale') || dLower.includes('kidney')) {
          keywordMatch = fullText.includes('rein') || fullText.includes('rénal') || fullText.includes('néphro');
        } else if (fullText.includes(dLower)) {
          keywordMatch = true;
        }

        if (matchesCondition || keywordMatch) {
          score += 70;
          reasons.push(`Adapté à votre suivi : ${disease}`);
        }
      }

      // 2. Match Genotype (Drépanocytose / Hémoglobine)
      const targetGenotypes = (tip.targetGenotypes || []).map(g => g.toUpperCase().trim());
      if (targetGenotypes.includes(genotype)) {
        score += 55;
        reasons.push(`Spécifique au génotype ${genotype}`);
      } else if ((genotype === 'SS' || genotype === 'AS' || genotype === 'SC') && (fullText.includes('drépano') || fullText.includes('hémoglobine'))) {
        score += 50;
        reasons.push(`Recommandé pour votre profil drépanocytaire (${genotype})`);
      }

      // 3. Match Allergies
      for (const allergy of uniqueAllergies) {
        const aLower = allergy.toLowerCase();
        if (
          (aLower.includes('péni') || aLower.includes('bêta')) && (fullText.includes('péni') || fullText.includes('antibiot') || fullText.includes('allerg')) ||
          (aLower.includes('aspirin') || aLower.includes('ains') || aLower.includes('ibupro')) && (fullText.includes('aspirin') || fullText.includes('ains') || fullText.includes('anti-inflammatoire') || fullText.includes('ibuprof')) ||
          fullText.includes(aLower)
        ) {
          score += 65;
          reasons.push(`Alerte sécurité allergie : ${allergy}`);
        }
      }

      // 4. Match BMI / Weight management
      if (bmi) {
        const isOverweight = bmi >= 25;
        const isUnderweight = bmi < 18.5;
        if (isOverweight && (fullText.includes('poids') || fullText.includes('surpoids') || fullText.includes('imc') || fullText.includes('nutrition') || fullText.includes('obésité'))) {
          score += 35;
          reasons.push(`Conseil équilibre pondéral (IMC ${bmi})`);
        } else if (isUnderweight && (fullText.includes('carence') || fullText.includes('nutrition') || fullText.includes('poids'))) {
          score += 35;
          reasons.push(`Conseil nutritionnel (IMC ${bmi})`);
        }
      }

      // 5. Match CSU Health Coverage
      if (hasCsu && (fullText.includes('csu') || fullText.includes('couverture santé') || fullText.includes('assurance'))) {
        score += 30;
        reasons.push(`Droits Couverture Santé Universelle (CSU)`);
      }

      // 6. National health priority boosts
      if (tip.priority === 'URGENT') score += 20;
      else if (tip.priority === 'HIGH' || tip.priority === 'SEASONAL') score += 10;

      // Base score
      score += 5;

      const isPersonalized = reasons.length > 0;
      const primaryReason = reasons[0] || (tip.priority === 'URGENT' ? 'Priorité Nationale de Santé Publique MINSANTÉ' : 'Conseil de Prévention Sanitaire au Cameroun');

      return {
        ...tip,
        recommendationScore: score,
        isPersonalized,
        matchReason: primaryReason,
        matchReasons: reasons,
      };
    });

    // Sort by recommendationScore descending
    scoredTips.sort((a, b) => b.recommendationScore - a.recommendationScore);

    res.json({
      success: true,
      data: scoredTips,
      patientProfile: {
        name: user.name,
        chronicDiseases: uniqueDiseases,
        genotype,
        bloodGroup,
        bmi,
        allergies: uniqueAllergies,
        hasCsu,
      }
    });

  } catch (error) {
    console.error('Error fetching recommended health tips:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du calcul des recommandations santé' });
  }
};

module.exports = {
  getHealthTips,
  getHealthTipCategories,
  getRecommendedHealthTips,
  createHealthTip,
  updateHealthTip,
  deleteHealthTip,
  incrementViewCount,
  seedOfficialHealthTips,
  STANDARD_CATEGORIES
};