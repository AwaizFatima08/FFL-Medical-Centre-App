const admin = require('firebase-admin');
const { APPOINTMENT_STATUS } = require('../constants');

const sendFitnessReminders = async (event) => {
  try {
    const db = admin.firestore();
    const today = new Date();
    const reminderDays = [7, 3, 1];

    const snapshot = await db.collection('fitnessAppointments')
      .where('status', 'in', [
        APPOINTMENT_STATUS.SCHEDULED,
        APPOINTMENT_STATUS.RESCHEDULED,
      ])
      .get();

    for (const doc of snapshot.docs) {
      const appointment = doc.data();
      const appointmentDate = new Date(appointment.scheduledDate);
      const daysUntil = Math.ceil(
        (appointmentDate - today) / (1000 * 60 * 60 * 24)
      );

      if (reminderDays.includes(daysUntil)) {
        await db.collection('notifications').add({
          title:            'Fitness Appointment Reminder',
          body:             `Reminder: Your annual fitness examination is in ${daysUntil} day(s) on ${appointment.scheduledDate} at ${appointment.scheduledTime} at the Medical Centre.`,
          category:         'fitness_appointment',
          targetType:       'individual',
          targetEmployeeId: appointment.employeeId,
          appointmentId:    doc.id,
          sentBy:           'system',
          sentByRole:       'system',
          sentAt:           new Date().toISOString(),
          whatsappDeferred: true,
        });
      }
    }

    console.log('Fitness reminders sent');
  } catch (error) {
    console.error('Fitness reminder error:', error);
  }
};

module.exports = { sendFitnessReminders };