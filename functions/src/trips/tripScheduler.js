const admin = require('firebase-admin');
const { TRIP_STATUS, BOOKING_STATUS } = require('../constants');

// Runs on trip days at 12pm PKT
// Sends reminders for departure from Medical Centre (17:30)
// and reminder for departure from RYK (21:00)
const sendTripReminders = async (event) => {
  try {
    const db = admin.firestore();
    const today = new Date().toISOString().split('T')[0];

    const tripsSnapshot = await db.collection('medicalTrips')
      .where('tripDate', '==', today)
      .where('status', 'in', [TRIP_STATUS.OPEN, TRIP_STATUS.FULL])
      .get();

    if (tripsSnapshot.empty) return;

    for (const tripDoc of tripsSnapshot.docs) {
      const bookingsSnapshot = await db.collection('medicalTrips')
        .doc(tripDoc.id)
        .collection('bookings')
        .where('status', '==', BOOKING_STATUS.APPROVED)
        .get();

      for (const bookingDoc of bookingsSnapshot.docs) {
        const booking = bookingDoc.data();

        // Get employee user for FCM token
        const userSnapshot = await db.collection('users')
          .where('__name__', '==', booking.bookedBy)
          .get();

        if (userSnapshot.empty) continue;

        // Store notification in Firestore
        await db.collection('notifications').add({
          title:          'Medical Trip Reminder',
          body:           `Your medical trip to RYK departs today at 17:30 from Medical Centre. Please be ready at your bus stop.`,
          category:       'trip_reminder',
          targetType:     'individual',
          targetEmployeeId: booking.bookedBy,
          tripId:         tripDoc.id,
          sentBy:         'system',
          sentByRole:     'system',
          sentAt:         new Date().toISOString(),
          whatsappDeferred: true,
        });
      }
    }

    console.log('Trip reminders sent successfully');
  } catch (error) {
    console.error('Trip reminder error:', error);
  }
};

module.exports = { sendTripReminders };