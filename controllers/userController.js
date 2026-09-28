const User = require('../models/User'); // Import User model
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

//create user
const createUser = async (req, res) => {
    try {
        const {email, password, name, phone, role, userType, dateOfBirth, address} = req.body;

        // Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with that email already exists' });
        }

        const newUser = await User.create({
            email,
            password, // Password will be hashed by the pre-save hook in the User model
            name,
            phone,
            role,
            userType,
            dateOfBirth,
            address
        });

        if (!newUser) {
            return res.status(400).json({ success: false, message: 'User creation failed' });
        }

        res.status(201).json({ success: true, data: newUser });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}); // Find all users
        res.status(200).json({ success: true, data: users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
const getUserById = async (req, res) => {
    try {
        const {id} = req.params;
        const user = await User.findById(id); // Find by ID
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const updateUser = async (req, res) => {
    try {
        const id = req.params.id || (req.user ? (req.user._id || req.user.id) : null);
        if (!id) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        const user = await User.findById(id).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const {
            name,
            email,
            phone,
            address,
            profilePicture,
            profileImage,
            password,
            newPassword,
            currentPassword,
            dateOfBirth,
            emergencyContact,
            bloodGroup,
            allergies,
            chronicDiseases,
            businessName,
            businessAddress,
            city,
            district,
            latitude,
            longitude,
            licenseNumber,
            onpcNumber,
            operatingHours,
            dutyRosterZone,
            realTimeStatus,
            isOnDuty,
            dutySchedule,
            posApiKey,
            csuIdentifier,
            csuInsurance
        } = req.body;

        // If email is changed, ensure no other user has it
        if (email && email.toLowerCase() !== user.email.toLowerCase()) {
            const emailExists = await User.findOne({ 
                email: email.toLowerCase().trim(), 
                _id: { $ne: user._id } 
            });
            if (emailExists) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'A user with that email already exists' 
                });
            }
            user.email = email.toLowerCase().trim();
        }

        if (name !== undefined) user.name = name.trim();
        if (phone !== undefined) user.phone = phone.trim();
        if (address !== undefined) user.address = address.trim();

        const imageToSave = profilePicture || profileImage;
        if (imageToSave !== undefined) {
            user.profilePicture = imageToSave;
            user.profileImage = imageToSave;
        }

        if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
        if (emergencyContact !== undefined) user.emergencyContact = emergencyContact;
        if (bloodGroup !== undefined) user.bloodGroup = bloodGroup;
        if (allergies !== undefined) {
            user.allergies = Array.isArray(allergies) 
                ? allergies 
                : (typeof allergies === 'string' && allergies.trim() ? allergies.split(',').map(a => a.trim()) : []);
        }
        if (chronicDiseases !== undefined) {
            user.chronicDiseases = Array.isArray(chronicDiseases) 
                ? chronicDiseases 
                : (typeof chronicDiseases === 'string' && chronicDiseases.trim() ? chronicDiseases.split(',').map(c => c.trim()) : []);
        }
        if (businessName !== undefined) user.businessName = businessName ? businessName.trim() : '';
        if (businessAddress !== undefined) user.businessAddress = businessAddress ? businessAddress.trim() : '';
        if (city !== undefined) user.city = city ? city.trim() : 'Yaoundé';
        if (district !== undefined) user.district = district ? district.trim() : '';
        if (licenseNumber !== undefined) user.licenseNumber = licenseNumber ? licenseNumber.trim() : '';
        if (onpcNumber !== undefined) user.onpcNumber = onpcNumber ? onpcNumber.trim() : '';
        if (operatingHours !== undefined) user.operatingHours = operatingHours;
        if (dutyRosterZone !== undefined) user.dutyRosterZone = dutyRosterZone ? dutyRosterZone.trim() : '';
        if (realTimeStatus !== undefined) {
            user.realTimeStatus = realTimeStatus;
            user.isOnDuty = realTimeStatus === 'ON_DUTY';
        }
        if (isOnDuty !== undefined) user.isOnDuty = !!isOnDuty;
        if (dutySchedule !== undefined) user.dutySchedule = dutySchedule;
        if (posApiKey !== undefined) user.posApiKey = posApiKey ? posApiKey.trim() : undefined;
        if (latitude !== undefined && latitude !== null && !isNaN(Number(latitude))) user.latitude = Number(latitude);
        if (longitude !== undefined && longitude !== null && !isNaN(Number(longitude))) user.longitude = Number(longitude);

        if (csuIdentifier !== undefined) {
            user.csuIdentifier = csuIdentifier ? csuIdentifier.trim().toUpperCase() : '';
            if (user.csuInsurance) {
                user.csuInsurance.matricule = user.csuIdentifier;
            }
        }
        if (csuInsurance !== undefined && typeof csuInsurance === 'object') {
            user.csuInsurance = {
                ...user.csuInsurance,
                ...csuInsurance,
                matricule: csuInsurance.matricule ? csuInsurance.matricule.trim().toUpperCase() : (user.csuIdentifier || ''),
                status: csuInsurance.status || 'ACTIVE',
                linkedAt: csuInsurance.linkedAt || new Date()
            };
            if (user.csuInsurance.matricule) {
                user.csuIdentifier = user.csuInsurance.matricule;
            }
        }

        // Password change handling - strictly optional, only when newPassword is explicitly provided
        const passToSet = typeof newPassword === 'string' && newPassword.trim().length > 0
            ? newPassword.trim()
            : null;

        if (passToSet) {
            if (passToSet.length < 6) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'New password must be at least 6 characters long' 
                });
            }

            // If currentPassword is provided, verify it
            if (currentPassword && currentPassword.trim()) {
                const isMatch = await bcrypt.compare(currentPassword.trim(), user.password);
                if (!isMatch) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'Current password is incorrect' 
                    });
                }
            }

            user.password = passToSet;
        }

        await user.save();

        const userObj = user.toObject();
        delete userObj.password;

        res.status(200).json({ 
            success: true, 
            message: 'Profile updated successfully',
            data: userObj 
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
}

const deleteUser = async (req, res) => {
    try {
        const {id} = req.params;
        const deletedUser = await User.findByIdAndDelete(id);
        if (!deletedUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const getPatients = async (req, res) => {
    try {
        const patients = await User.find({userType: 'PATIENT'});
        res.status(200).json({ success: true, data: patients });
    } catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const getPharmacies = async (req, res) => {
    try {
        const pharmacies = await User.find({userType: 'PHARMACY'});
        res.status(200).json({ success: true, data: pharmacies });
    } catch (error) {
        console.error('Error fetching pharmacies:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const getApprovedPharmacies = async (req, res) => {
    try {
        const approvedPharmacies = await User.find({
            userType: 'PHARMACY',
            status: 'ACTIVE'
        });
        res.status(200).json({ success: true, data: approvedPharmacies });
    } catch (error) {
        console.error('Error fetching approved pharmacies:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const createPatient = async (req, res) => {
    console.log('Body Data: ', req.body)
    try {
        const {name, email, phone, password, address, userType} = req.body;

        // Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with that email already exists' });
        }

        const newPatient = await User.create({
            email,
            password,
            name,
            phone,
            address,
            userType,
        });
        if (!newPatient) {
            return res.status(400).json({ success: false, message: 'Patient creation failed' });
        }

        res.status(201).json({ success: true, data: newPatient });
    } catch (error) {
        console.error('Error creating patient:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const createPharmacy = async (req, res) => {
    console.log('Body Data: ', req.body)
    try {
        const {name, email, phone, password, businessName, licenseNumber, businessAddress, latitude, longitude, operatingHours} = req.body;

        // Check if email already exists
        const emailExists = await User.findOne({ email });
        if (emailExists) {
            return res.status(400).json({ success: false, message: 'User with that email already exists' });
        }

        // Application-level uniqueness check for licenseNumber for PHARMACY
        if (licenseNumber) {
            const existingPharmacy = await User.findOne({
                licenseNumber: licenseNumber,
                userType: 'PHARMACY'
            });
            if (existingPharmacy) {
                return res.status(409).json({ success: false, message: 'License number already registered for another pharmacy.' });
            }
        }

        const newPharmacy = await User.create({
            email,
            password,
            name,
            phone,
            businessName,
            licenseNumber,
            businessAddress,
            latitude,
            longitude,
            operatingHours,
            userType: 'PHARMACY',
            status: 'PENDING_VERIFICATION', // Set default status
            verificationStatus: false      // Set default verification status
        });
        if (!newPharmacy) {
            return res.status(400).json({ success: false, message: 'Pharmacy creation failed' });
        }

        res.status(201).json({ success: true, data: newPharmacy });
    } catch (error) {
        console.error('Error creating pharmacy:', error);
        // Add specific handling for Mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: `Validation failed: ${messages.join(', ')}`
            });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const updatePatient = async (req, res) => {
    try {
        const {id} = req.params;
        const {email, password, name, phone, address, dateOfBirth} = req.body;

        const patient = await User.findById(id);

        if (!patient) {
            return res.status(404).json({ success: false, message: 'Patient not found' });
        }

        // Update fields
        patient.email = email || patient.email;
        patient.name = name || patient.name;
        patient.phone = phone || patient.phone;
        patient.address = address || patient.address;
        patient.dateOfBirth = dateOfBirth || patient.dateOfBirth;

        if (password) {
            patient.password = password; // Pre-save hook will hash it
        }

        const updatedPatient = await patient.save(); // Save the updated patient

        res.status(200).json({ success: true, data: updatedPatient });
    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const updatePharmacy = async (req, res) => {
    try {
        const {id} = req.params;
        const {email, password, name, phone, businessName, licenseNumber, businessAddress} = req.body;

        const pharmacy = await User.findById(id);

        if (!pharmacy) {
            return res.status(404).json({ success: false, message: 'Pharmacy not found' });
        }

        // Application-level uniqueness check for licenseNumber during update
        if (licenseNumber) {
            const existingPharmacy = await User.findOne({
                licenseNumber: licenseNumber,
                userType: 'PHARMACY',
                _id: { $ne: id } // Exclude the current user being updated
            });
            if (existingPharmacy) {
                return res.status(409).json({ success: false, message: 'License number already registered for another pharmacy.' });
            }
        }

        // Update fields
        pharmacy.email = email || pharmacy.email;
        pharmacy.name = name || pharmacy.name;
        pharmacy.phone = phone || pharmacy.phone;
        pharmacy.businessName = businessName || pharmacy.businessName;
        pharmacy.licenseNumber = licenseNumber || pharmacy.licenseNumber;
        pharmacy.businessAddress = businessAddress || pharmacy.businessAddress;

        if (password) {
            pharmacy.password = password; // Pre-save hook will hash it
        }

        const updatedPharmacy = await pharmacy.save(); // Save the updated pharmacy

        res.status(200).json({ success: true, data: updatedPharmacy });
    } catch (error) {
        console.error('Error updating pharmacy:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const getPendingPharmacies = async (req, res) => {
    try {
        const pendingPharmacies = await User.find({
            userType: 'PHARMACY',
            status: 'PENDING_VERIFICATION'
        });
        res.status(200).json({ success: true, data: pendingPharmacies });
    } catch (error) {
        console.error('Error fetching pending pharmacies:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const updatePharmacyStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, verificationNotes } = req.body;

        const pharmacy = await User.findById(id);

        if (!pharmacy || pharmacy.userType !== 'PHARMACY') {
            return res.status(404).json({ success: false, message: 'Pharmacy not found' });
        }

        const wasPreviouslyInactive = pharmacy.status !== 'ACTIVE';

        pharmacy.status = status;
        pharmacy.verificationStatus = status === 'ACTIVE' ? true : false;
        pharmacy.verificationNotes = verificationNotes;
        pharmacy.verifiedAt = new Date();

        const updatedPharmacy = await pharmacy.save();

        // If the pharmacy was just approved, create notifications for all patients
        if (status === 'ACTIVE' && wasPreviouslyInactive) {
            try {
                const patients = await User.find({ userType: 'PATIENT' }, '_id');
                const patientIds = patients.map(p => p._id);

                const notifications = patientIds.map(patientId => ({
                    userId: patientId,
                    type: 'new_pharmacy',
                    title: 'New Pharmacy Available',
                    message: `${updatedPharmacy.businessName} is now available on MediConnect in ${updatedPharmacy.businessAddress}.`,
                    relatedId: updatedPharmacy._id
                }));

                if (notifications.length > 0) {
                    await Notification.insertMany(notifications);
                }
            } catch (notificationError) {
                console.error('Failed to create new pharmacy notifications:', notificationError);
                // Don't block the main response for this
            }
        }

        res.status(200).json({ success: true, data: updatedPharmacy });
    } catch (error) {
        console.error('Error updating pharmacy status:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const mongoose = require('mongoose');

const getUserNotifications = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
        
        const userIdString = req.user._id ? req.user._id.toString() : (req.user.id ? req.user.id.toString() : null);
        const userObjectId = userIdString ? new mongoose.Types.ObjectId(userIdString) : null;

        const queryConditions = [
            { userId: null },
            { userId: { $exists: false } }
        ];
        if (userObjectId) {
            queryConditions.push({ userId: userObjectId });
        }

        let notifications = await Notification.find({ $or: queryConditions })
            .sort({ createdAt: -1 })
            .limit(50);

        // If no notifications exist yet in DB for this user, seed helpful initial notifications
        if (notifications.length === 0 && userObjectId) {
            const initialNotifs = [
                {
                    userId: userObjectId,
                    type: 'system',
                    title: 'Bienvenue sur MediConnect',
                    message: 'Votre espace de notification est opérationnel. Vous recevrez ici vos alertes de stock, ordonnances et actualités.',
                    read: false
                },
                {
                    userId: userObjectId,
                    type: 'stock',
                    title: 'Disponibilité des médicaments',
                    message: 'Suivez la disponibilité en temps réel des médicaments essentiels dans les pharmacies partenaires au Cameroun.',
                    read: false
                },
                {
                    userId: userObjectId,
                    type: 'new_pharmacy',
                    title: 'Réseau d\'officines agréées',
                    message: 'Découvrez les pharmacies agréées par le MINSANTÉ et l\'ONPC à proximité de votre position.',
                    read: false
                }
            ];
            try {
                await Notification.insertMany(initialNotifs);
                notifications = await Notification.find({ $or: queryConditions })
                    .sort({ createdAt: -1 })
                    .limit(50);
            } catch (seedErr) {
                console.warn('Initial notifications seed error (non-fatal):', seedErr.message);
            }
        }

        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        console.error('Error fetching user notifications:', error);
        next(error);
    }
};

const markNotificationAsRead = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
        const { id } = req.params;
        const notification = await Notification.findByIdAndUpdate(
            id,
            { $set: { read: true, isRead: true } },
            { new: true }
        );
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        next(error);
    }
};

const markAllNotificationsAsRead = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
        const userIdString = req.user._id ? req.user._id.toString() : (req.user.id ? req.user.id.toString() : null);
        const userObjectId = userIdString ? new mongoose.Types.ObjectId(userIdString) : null;

        const filter = {
            $or: [
                { userId: null },
                { userId: { $exists: false } }
            ]
        };
        if (userObjectId) {
            filter.$or.push({ userId: userObjectId });
        }

        await Notification.updateMany(filter, { $set: { read: true, isRead: true } });
        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        next(error);
    }
};

const deleteNotification = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required.' });
        }
        const { id } = req.params;
        await Notification.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        next(error);
    }
};

const getRecipients = async (req, res, next) => {
    try {
        const currentUserType = req.user ? req.user.userType : 'PATIENT';
        const { search, type } = req.query;

        let query = {};
        let recipientType = type ? type.toUpperCase() : null;

        if (!recipientType || recipientType === 'ALL') {
            if (currentUserType === 'PATIENT') {
                query = {
                    $or: [
                        { userType: 'PHARMACY', status: 'ACTIVE' },
                        { userType: 'ADMIN' }
                    ]
                };
            } else if (currentUserType === 'PHARMACY') {
                query = { userType: 'PATIENT' };
            } else {
                query = { userType: 'PHARMACY', status: 'ACTIVE' };
            }
        } else if (recipientType === 'PHARMACY') {
            query = { userType: 'PHARMACY', status: 'ACTIVE' };
        } else if (recipientType === 'ADMIN') {
            query = { userType: 'ADMIN' };
        } else {
            query = { userType: recipientType };
        }

        if (search && search.trim()) {
            const regex = { $regex: search.trim(), $options: 'i' };
            const searchClause = [
                { name: regex },
                { businessName: regex },
                { businessAddress: regex },
                { address: regex },
                { email: regex }
            ];
            if (query.$or) {
                query = {
                    $and: [
                        { $or: query.$or },
                        { $or: searchClause }
                    ]
                };
            } else {
                query.$or = searchClause;
            }
        }

        const users = await User.find(query).select('name businessName address businessAddress phone email userType').limit(50);

        const formattedUsers = users.map(user => ({
            value: user._id.toString(),
            label: user.userType === 'PHARMACY' 
                ? (user.businessName || user.name) 
                : (user.userType === 'ADMIN' ? `${user.name} (MediConnect Support)` : user.name),
            address: user.businessAddress || user.address || (user.userType === 'ADMIN' ? 'Platform Central Support' : ''),
            phone: user.phone || '',
            userType: user.userType,
        }));

        res.status(200).json({ success: true, data: formattedUsers });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc Link Cameroon CSU Health Insurance Card to Patient
 * @route POST /api/users/csu/link
 */
const linkCsuInsurance = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const { matricule, beneficiaryCategory, affiliatedFacility, coverageRate } = req.body;

        if (!matricule || !matricule.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: 'CSU registration number (Matricule) is required' 
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const cleanMatricule = matricule.trim().toUpperCase();
        const category = beneficiaryCategory || 'Régime Général (Assurés & Familles)';
        const facility = affiliatedFacility || 'Hôpital Central de Yaoundé';
        const rate = Number(coverageRate) || (
            category.includes('Femme') || category.includes('Enfant') || category.includes('Indigent') 
                ? 100 
                : (category.includes('Dialyse') ? 95 : 70)
        );

        const issueDate = new Date();
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        user.csuIdentifier = cleanMatricule;
        user.csuInsurance = {
            matricule: cleanMatricule,
            beneficiaryCategory: category,
            coverageRate: rate,
            affiliatedFacility: facility,
            status: 'ACTIVE',
            issueDate,
            expiryDate,
            linkedAt: new Date(),
            qrData: `CSU-CM|${cleanMatricule}|${user.name}|${category}|${rate}%|${facility}`
        };

        await user.save();

        // Send confirmation notification
        try {
            await Notification.create({
                userId: user._id,
                type: 'CSU_LINKED',
                title: 'Couverture Santé Universelle (CSU) activée',
                message: `Votre matricule CSU ${cleanMatricule} a été validé avec succès. Prise en charge: ${rate}% (${category}) auprès des pharmacies agréées et de ${facility}.`,
                data: { matricule: cleanMatricule, coverageRate: rate }
            });
        } catch (notifErr) {
            console.warn('Could not create notification for CSU link:', notifErr.message);
        }

        const userObj = user.toObject();
        delete userObj.password;

        res.status(200).json({
            success: true,
            message: 'CSU Insurance linked successfully',
            data: userObj
        });
    } catch (error) {
        console.error('Error linking CSU:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

/**
 * @desc Unlink CSU Health Insurance Card
 * @route DELETE /api/users/csu/unlink
 */
const unlinkCsuInsurance = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        user.csuIdentifier = undefined;
        user.csuInsurance = undefined;
        await user.save();

        const userObj = user.toObject();
        delete userObj.password;

        res.status(200).json({
            success: true,
            message: 'CSU Insurance unlinked successfully',
            data: userObj
        });
    } catch (error) {
        console.error('Error unlinking CSU:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

/**
 * @desc Update patient digital medical booklet, health vitals, allergies & emergency QR settings
 * @route PUT /api/users/medical-booklet
 */
const updateMedicalBooklet = async (req, res) => {
    try {
        const userId = req.user._id || req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const {
            bloodGroup,
            genotype,
            height,
            weight,
            chronicDiseases,
            emergencyContactName,
            emergencyContactPhone,
            emergencyContactRelation,
            attendingPhysician,
            attendingHospital,
            organDonor,
            vitalNotes,
            detailedAllergies,
            emergencyQrConfig,
        } = req.body;

        if (!user.medicalBooklet) {
            user.medicalBooklet = {};
        }

        if (bloodGroup !== undefined) {
            user.medicalBooklet.bloodGroup = bloodGroup;
            user.bloodGroup = bloodGroup;
        }
        if (genotype !== undefined) user.medicalBooklet.genotype = genotype;
        if (height !== undefined) user.medicalBooklet.height = Number(height);
        if (weight !== undefined) user.medicalBooklet.weight = Number(weight);
        if (height && weight) {
            const hMeters = Number(height) / 100;
            user.medicalBooklet.bmi = Number((Number(weight) / (hMeters * hMeters)).toFixed(1));
        }
        if (chronicDiseases !== undefined) {
            user.medicalBooklet.chronicDiseases = Array.isArray(chronicDiseases) ? chronicDiseases : [];
            user.chronicDiseases = user.medicalBooklet.chronicDiseases;
        }
        if (emergencyContactName !== undefined) user.medicalBooklet.emergencyContactName = emergencyContactName;
        if (emergencyContactPhone !== undefined) {
            user.medicalBooklet.emergencyContactPhone = emergencyContactPhone;
            user.emergencyContact = emergencyContactPhone;
        }
        if (emergencyContactRelation !== undefined) user.medicalBooklet.emergencyContactRelation = emergencyContactRelation;
        if (attendingPhysician !== undefined) user.medicalBooklet.attendingPhysician = attendingPhysician;
        if (attendingHospital !== undefined) user.medicalBooklet.attendingHospital = attendingHospital;
        if (organDonor !== undefined) user.medicalBooklet.organDonor = organDonor;
        if (vitalNotes !== undefined) user.medicalBooklet.vitalNotes = vitalNotes;

        if (detailedAllergies !== undefined) {
            user.medicalBooklet.detailedAllergies = Array.isArray(detailedAllergies) ? detailedAllergies : [];
            user.allergies = user.medicalBooklet.detailedAllergies.map(a => a.name);
        }

        // Configure Emergency QR
        if (!user.medicalBooklet.emergencyQrConfig) {
            user.medicalBooklet.emergencyQrConfig = {};
        }
        if (!user.medicalBooklet.emergencyQrConfig.publicQrToken) {
            user.medicalBooklet.emergencyQrConfig.publicQrToken = crypto.randomBytes(12).toString('hex');
        }

        if (emergencyQrConfig !== undefined) {
            user.medicalBooklet.emergencyQrConfig = {
                ...user.medicalBooklet.emergencyQrConfig,
                ...emergencyQrConfig,
                publicQrToken: user.medicalBooklet.emergencyQrConfig.publicQrToken,
            };
        }

        await user.save();

        const userObj = user.toObject();
        delete userObj.password;

        res.status(200).json({
            success: true,
            message: 'Medical booklet updated successfully',
            data: userObj,
        });
    } catch (error) {
        console.error('Error updating medical booklet:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

/**
 * @desc Get public emergency responder card data via QR token
 * @route GET /api/users/emergency-card/:token
 */
const getPublicEmergencyMedicalInfo = async (req, res) => {
    try {
        const { token } = req.params;
        const mongoose = require('mongoose');

        // Look up by publicQrToken first
        let user = await User.findOne({ 'medicalBooklet.emergencyQrConfig.publicQrToken': token });

        // If not found, check if token represents user _id or emg_<id>
        if (!user) {
            const rawId = token.startsWith('emg_') ? token.slice(4) : token;
            if (mongoose.Types.ObjectId.isValid(rawId)) {
                user = await User.findById(rawId);
            }
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'Emergency medical card not found' });
        }

        const booklet = user.medicalBooklet || {};
        const config = booklet.emergencyQrConfig || {};

        if (config.enabled === false) {
            return res.status(403).json({ success: false, message: 'Emergency card is disabled by the patient' });
        }

        const emergencyData = {
            patientName: user.name,
            bloodGroup: config.showBloodGroup !== false ? (booklet.bloodGroup || user.bloodGroup || 'O+') : undefined,
            genotype: config.showGenotype !== false ? (booklet.genotype || 'AA') : undefined,
            emergencyContact: config.showEmergencyContact !== false ? {
                name: booklet.emergencyContactName || 'Contact d\'Urgence',
                phone: booklet.emergencyContactPhone || user.emergencyContact || user.phone,
                relation: booklet.emergencyContactRelation || 'Proche / Famille',
            } : undefined,
            allergies: config.showAllergies !== false ? (booklet.detailedAllergies || (user.allergies || []).map(name => ({ name, category: 'DRUG', severity: 'SEVERE_ANAPHYLAXIS' }))) : undefined,
            chronicDiseases: config.showChronicDiseases !== false ? (booklet.chronicDiseases || user.chronicDiseases || []) : undefined,
            csuIdentifier: config.showCsuNumber !== false ? (user.csuIdentifier || user.csuInsurance?.matricule) : undefined,
            emergencyNotes: config.emergencyNotes || booklet.vitalNotes,
            attendingHospital: booklet.attendingHospital,
            attendingPhysician: booklet.attendingPhysician,
            organDonor: booklet.organDonor,
            qrToken: token,
            updatedAt: user.updatedAt,
        };

        res.status(200).json({ success: true, data: emergencyData });
    } catch (error) {
        console.error('Error fetching emergency medical info:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

// --- Health Authority Credential Management (Admin Only) ---
const getAuthorityCredentials = async (req, res) => {
    try {
        let authorityUser = await User.findOne({ userType: 'HEALTH_AUTHORITY' }).sort({ createdAt: 1 });
        
        if (!authorityUser) {
            authorityUser = await User.create({
                name: 'Dr. Inspecteur Général (MINSANTÉ/ONPC)',
                email: 'authority@minsante.cm',
                password: 'Minsante2026!',
                phone: '+237 222 22 22 22',
                userType: 'HEALTH_AUTHORITY',
                organization: 'MINSANTE',
                institutionDepartment: 'Coordination Nationale Conjointe MINSANTÉ / ONPC',
                status: 'ACTIVE',
                isMfaRequired: false,
                mfaCode: '237237'
            });
        }

        const userObj = authorityUser.toObject();
        delete userObj.password;

        res.status(200).json({
            success: true,
            data: userObj
        });
    } catch (error) {
        console.error('Error fetching Health Authority credentials:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve Health Authority credentials', error: error.message });
    }
};

const updateAuthorityCredentials = async (req, res) => {
    try {
        const { email, password, name, organization, department, phone, isMfaRequired, mfaCode } = req.body;

        let authorityUser = await User.findOne({ userType: 'HEALTH_AUTHORITY' }).sort({ createdAt: 1 }).select('+password');

        if (!authorityUser) {
            authorityUser = new User({
                userType: 'HEALTH_AUTHORITY',
                status: 'ACTIVE'
            });
        }

        if (email) {
            const cleanEmail = email.toLowerCase().trim();
            const exists = await User.findOne({ email: cleanEmail, _id: { $ne: authorityUser._id } });
            if (exists) {
                return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé par un autre utilisateur.' });
            }
            authorityUser.email = cleanEmail;
        }

        if (name) authorityUser.name = name.trim();
        if (organization) authorityUser.organization = organization;
        if (department !== undefined) authorityUser.institutionDepartment = department.trim();
        if (phone !== undefined) authorityUser.phone = phone.trim();
        if (isMfaRequired !== undefined) authorityUser.isMfaRequired = Boolean(isMfaRequired);
        if (mfaCode !== undefined) authorityUser.mfaCode = String(mfaCode).trim();

        if (password && typeof password === 'string' && password.trim().length > 0) {
            if (password.trim().length < 6) {
                return res.status(400).json({ success: false, message: 'Le mot de passe doit comporter au moins 6 caractères.' });
            }
            authorityUser.password = password.trim();
        }

        await authorityUser.save();

        await AuditLog.create({
            userId: req.user?._id,
            action: 'UPDATE_HEALTH_AUTHORITY_CREDENTIALS',
            resource: 'HealthAuthority',
            resourceId: authorityUser._id,
            details: {
                targetEmail: authorityUser.email,
                organization: authorityUser.organization,
                updatedBy: req.user?.email || 'Admin',
                platform: 'MediConnect Governance'
            }
        }).catch(err => console.warn('Audit error on authority update:', err.message));

        const userObj = authorityUser.toObject();
        delete userObj.password;

        res.status(200).json({
            success: true,
            message: 'Identifiants Régulateur MINSANTÉ mis à jour avec succès dans la base de données.',
            data: userObj
        });
    } catch (error) {
        console.error('Error updating Health Authority credentials:', error);
        res.status(500).json({ success: false, message: 'Échec de la mise à jour des identifiants', error: error.message });
    }
};

const resetAuthorityCredentials = async (req, res) => {
    try {
        let authorityUser = await User.findOne({ userType: 'HEALTH_AUTHORITY' }).sort({ createdAt: 1 }).select('+password');

        if (!authorityUser) {
            authorityUser = new User({ userType: 'HEALTH_AUTHORITY' });
        }

        authorityUser.email = 'authority@minsante.cm';
        authorityUser.password = 'Minsante2026!';
        authorityUser.name = 'Dr. Inspecteur Général (MINSANTÉ/ONPC)';
        authorityUser.organization = 'MINSANTE';
        authorityUser.institutionDepartment = 'Coordination Nationale Conjointe MINSANTÉ / ONPC';
        authorityUser.phone = '+237 222 22 22 22';
        authorityUser.status = 'ACTIVE';
        authorityUser.isMfaRequired = false;
        authorityUser.mfaCode = '237237';

        await authorityUser.save();

        await AuditLog.create({
            userId: req.user?._id,
            action: 'RESET_HEALTH_AUTHORITY_CREDENTIALS',
            resource: 'HealthAuthority',
            resourceId: authorityUser._id,
            details: {
                defaultEmail: authorityUser.email,
                organization: authorityUser.organization,
                resetBy: req.user?.email || 'Admin',
                platform: 'MediConnect Governance'
            }
        }).catch(err => console.warn('Audit error on authority reset:', err.message));

        const userObj = authorityUser.toObject();
        delete userObj.password;

        res.status(200).json({
            success: true,
            message: 'Identifiants réinitialisés aux valeurs standards (authority@minsante.cm / Minsante2026!).',
            data: userObj
        });
    } catch (error) {
        console.error('Error resetting Health Authority credentials:', error);
        res.status(500).json({ success: false, message: 'Échec de la réinitialisation des identifiants', error: error.message });
    }
};

// Exporting controller functions for potential reuse if needed elsewhere
exports.createUser = createUser;
exports.getAllUsers = getAllUsers;
exports.getUserById = getUserById;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.getPatients = getPatients;
exports.getPharmacies = getPharmacies;
exports.getApprovedPharmacies = getApprovedPharmacies;
exports.createPatient = createPatient;
exports.createPharmacy = createPharmacy;
exports.updatePatient = updatePatient;
exports.updatePharmacy = updatePharmacy;
exports.getPendingPharmacies = getPendingPharmacies;
exports.updatePharmacyStatus = updatePharmacyStatus;
exports.getUserNotifications = getUserNotifications;
exports.markNotificationAsRead = markNotificationAsRead;
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
exports.deleteNotification = deleteNotification;
exports.getRecipients = getRecipients;
exports.linkCsuInsurance = linkCsuInsurance;
exports.unlinkCsuInsurance = unlinkCsuInsurance;
exports.updateMedicalBooklet = updateMedicalBooklet;
exports.getPublicEmergencyMedicalInfo = getPublicEmergencyMedicalInfo;
exports.getAuthorityCredentials = getAuthorityCredentials;
exports.updateAuthorityCredentials = updateAuthorityCredentials;
exports.resetAuthorityCredentials = resetAuthorityCredentials;

