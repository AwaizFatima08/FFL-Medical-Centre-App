const admin = require('firebase-admin');
const { AVAILABILITY_STATUS } = require('../constants');
const { isWithinWorkingHours } = require('../utils');

// Runs every 15 minutes
// Auto sets doctors to not_available outside working hours
const autoUpdateAvailability = async (event) => {
  try {
    const db = admin.firestore();
    const snapshot = await db.collection('doctorAvailability').get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const withinHours = isWithinWorkingHours(data.role);

      // If outside working hours and currently available
      // auto set to not_available
      if (!withinHours &&
          data.currentStatus === AVAILABILITY_STATUS.AVAILABLE) {
        await doc.ref.update({
          currentStatus: AVAILABILITY_STATUS.NOT_AVAILABLE,
          updatedBy:     'system',
          updatedByType: 'auto',
          updatedAt:     new Date().toISOString(),
        });

        await doc.ref.collection('statusLog').add({
          status:        AVAILABILITY_STATUS.NOT_AVAILABLE,
          updatedBy:     'system',
          updatedByType: 'auto',
          updatedAt:     new Date().toISOString(),
        });
      }
    }

    console.log('Availability auto-update completed');
  } catch (error) {
    console.error('Auto availability update error:', error);
  }
};

module.exports = { autoUpdateAvailability };