const admin = require('firebase-admin');
const { VACCINE_STATUS } = require('../constants');

const sendVaccinationReminders = async (event) => {
  try {
    const db = admin.firestore();
    const today = new Date();

    // Reminder intervals in days
    const reminderDays = [7, 3, 1];

    const profilesSnapshot = await db.collection('vaccinationProfiles').get();

    for (const profileDoc of profilesSnapshot.docs) {
      const profile = profileDoc.data();

      const scheduleSnapshot = await db.collection('vaccinationProfiles')
        .doc(profileDoc.id)
        .collection('scheduleItems')
        .where('status', 'in', [
          VACCINE_STATUS.PENDING,
          VACCINE_STATUS.RESCHEDULED,
        ])
        .get();

      for (const itemDoc of scheduleSnapshot.docs) {
        const item = itemDoc.data();
        const effectiveDate = item.rescheduledDate || item.dueDate;
        const dueDate = new Date(effectiveDate);
        const daysUntilDue = Math.ceil(
          (dueDate - today) / (1000 * 60 * 60 * 24)
        );

        if (reminderDays.includes(daysUntilDue)) {
          // Get employee to notify
          const empDoc = await db.collection('employees')
            .doc(profile.employeeId).get();

          if (!empDoc.exists) continue;

          await db.collection('notifications').add({
            title:            'Vaccination Reminder',
            body:             `${profile.childName}'s ${item.vaccineName} is due in ${daysUntilDue} day(s) on ${effectiveDate}. Please visit the Medical Centre.`,
            category:         'vaccination_reminder',
            targetType:       'individual',
            targetEmployeeId: profile.employeeId,
            profileId:        profileDoc.id,
            itemId:           itemDoc.id,
            sentBy:           'system',
            sentByRole:       'system',
            sentAt:           new Date().toISOString(),
            whatsappDeferred: true,
          });
        }
      }
    }

    console.log('Vaccination reminders sent');
  } catch (error) {
    console.error('Vaccination reminder error:', error);
  }
};

module.exports = { sendVaccinationReminders };