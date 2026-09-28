const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const User = require('../models/User');

const seedAuthorities = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URI);
    console.log('Connected to MongoDB database:', mongoose.connection.name);

    const authorityAccounts = [
      {
        email: 'directeur.dpm@minsante.cm',
        password: 'MinsanteDpm2026!',
        name: 'Dr. Salihou Sadou',
        userType: 'HEALTH_AUTHORITY',
        organization: 'MINSANTE',
        permission_level: 'DIRECTOR',
        institutionDepartment: 'Direction de la Pharmacie, du Médicament et des Laboratoires (DPM)',
        phone: '+237 222 22 10 01',
        address: 'MINSANTÉ, Immeuble Ministériel, Yaoundé',
        status: 'ACTIVE',
        isMfaRequired: true,
        mfaCode: '237237'
      },
      {
        email: 'epidemio.surveillance@minsante.cm',
        password: 'EpidemioAlert2026!',
        name: 'Dr. Linda Esso',
        userType: 'HEALTH_AUTHORITY',
        organization: 'MINSANTE',
        permission_level: 'EPIDEMIOLOGIST',
        institutionDepartment: 'Division de la Surveillance Épidémiologique & Riposte',
        phone: '+237 222 22 10 02',
        address: 'MINSANTÉ, Yaoundé',
        status: 'ACTIVE',
        isMfaRequired: true,
        mfaCode: '237237'
      },
      {
        email: 'inspection.onpc@onpc.cm',
        password: 'OnpcInspect2026!',
        name: 'Dr. Prosper Hiag',
        userType: 'HEALTH_AUTHORITY',
        organization: 'ONPC',
        permission_level: 'INSPECTOR',
        institutionDepartment: 'Commission Pharmacovigilance & Bioéquivalence (ONPC)',
        phone: '+237 233 42 15 20',
        address: 'Siège de l Ordre National des Pharmaciens, Douala / Yaoundé',
        status: 'ACTIVE',
        isMfaRequired: true,
        mfaCode: '237237'
      },
      {
        email: 'ordre.president@onpc.cm',
        password: 'OnpcPresident2026!',
        name: 'Dr. Franck Nana',
        userType: 'HEALTH_AUTHORITY',
        organization: 'ONPC',
        permission_level: 'DIRECTOR',
        institutionDepartment: 'Conseil National de l Ordre des Pharmaciens (ONPC)',
        phone: '+237 222 20 33 44',
        address: 'Immeuble ONPC, Yaoundé',
        status: 'ACTIVE',
        isMfaRequired: true,
        mfaCode: '237237'
      },
      {
        email: 'authority@minsante.cm',
        password: 'Authority123!',
        name: 'Dr. Inspecteur Général (MINSANTÉ/ONPC)',
        userType: 'HEALTH_AUTHORITY',
        organization: 'MINSANTE',
        permission_level: 'DIRECTOR',
        institutionDepartment: 'Coordination Nationale Conjointe MINSANTÉ / ONPC',
        phone: '+237 222 22 22 22',
        status: 'ACTIVE',
        isMfaRequired: true,
        mfaCode: '237237'
      }
    ];

    for (const acc of authorityAccounts) {
      let u = await User.findOne({ email: acc.email });
      if (!u) {
        u = await User.create(acc);
        console.log(`Created: ${acc.email} [${acc.organization} - ${acc.permission_level}]`);
      } else {
        u.name = acc.name;
        u.userType = acc.userType;
        u.organization = acc.organization;
        u.permission_level = acc.permission_level;
        u.institutionDepartment = acc.institutionDepartment;
        u.status = acc.status;
        u.phone = acc.phone;
        u.password = acc.password;
        u.isMfaRequired = true;
        u.mfaCode = '237237';
        await u.save();
        console.log(`Updated: ${acc.email} [${acc.organization} - ${acc.permission_level}]`);
      }
    }

    console.log('All Institutional Health Authority accounts successfully provisioned in MongoDB!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedAuthorities();
