// functions/src/fitness/fitnessScheduler.js
// Runs daily at 9am PKT (4am UTC) — configured in index.js
// Sends fitness appointment reminders: 1 day before and on the day

const { getFirestore } = require('firebase-admin/firestore');

const sendFitnessReminders = async (event) => {
  try {
    const db = getFirestore();

    // Get today's date and tomorrow's date in YYYY-MM-DD format (PKT = UTC+5)
    const nowUTC = new Date();
    const pktOffset = 5 * 60 * 60 * 1000; // UTC+5 in milliseconds
    const nowPKT = new Date(nowUTC.getTime() + pktOffset);

    const todayStr    = nowPKT.toISOString().slice(0, 10);
    const tomorrowPKT = new Date(nowPKT.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrowPKT.toISOString().slice(0, 10);

    // Fetch appointments scheduled for today or tomorrow that are still active
    const snapshot = await db.collection('fitnessAppointments')
      .where('status', 'in', ['scheduled', 'confirmed', 'rescheduled', 'reschedule_rejected'])
      .get();

    if (snapshot.empty) {
      console.log('Fitness reminders: no upcoming appointments found');
      return;
    }

    let remindersSent = 0;

    for (const doc of snapshot.docs) {
      const appt = doc.data();
      const apptDate = appt.scheduledDate;

      let reminderLabel = null;
      if (apptDate === tomorrowStr) reminderLabel = 'tomorrow';
      if (apptDate === todayStr)    reminderLabel = 'today';

      if (!reminderLabel) continue; // Not a reminder day for this appointment

      // Write notification directly using the new flat pattern
      await db.collection('notifications').add({
        recipientUid:  appt.employeeUid,
        recipientRole: 'employee',
        title:         'Fitness Appointment Reminder',
        body:          reminderLabel === 'today'
          ? `Reminder: Your annual fitness examination is today at ${appt.scheduledTime} at the Medical Centre.`
          : `Reminder: Your annual fitness examination is tomorrow (${appt.scheduledDate}) at ${appt.scheduledTime} at the Medical Centre.`,
        type:          'fitness',
        referenceId:   doc.id,
        isRead:        false,
        createdAt:     new Date().toISOString(),
      });

      remindersSent++;
    }

    console.log(`Fitness reminders sent: ${remindersSent}`);
  } catch (error) {
    console.error('Fitness reminder error:', error);
  }
};

module.exports = { sendFitnessReminders };