// functions/src/trips/tripScheduler.js
// Runs on trip days (Mon/Wed/Sat) at 12:00 PKT (07:00 UTC)
// Sends reminders to all confirmed passengers for that day's trip

const admin = require('firebase-admin');

// Runs on trip days at 12pm PKT
const sendTripReminders = async (event) => {
  try {
    const db = admin.firestore();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Fetch all confirmed bookings for today
    const snapshot = await db.collection('tripBookings')   // ← fixed: flat collection
      .where('tripDate', '==', today)
      .where('status', '==', 'confirmed')                  // ← fixed: correct status value
      .get();

    if (snapshot.empty) {
      console.log(`No confirmed trip bookings for ${today}`);
      return;
    }

    console.log(`Sending trip reminders to ${snapshot.size} passengers for ${today}`);

    for (const doc of snapshot.docs) {
      const booking = doc.data();

      // Store reminder notification in Firestore
      await db.collection('notifications').add({
        title:              'Medical Trip Reminder',
        body:               'Your medical trip to RYK departs today at 17:30 from Medical Centre. Please be ready at your pickup point.',
        category:           'trip_reminder',
        targetType:         'individual',
        targetEmployeeId:   booking.bookedBy,
        bookingId:          doc.id,
        tripDate:           today,
        sentBy:             'system',
        sentByRole:         'system',
        sentAt:             new Date().toISOString(),
        whatsappDeferred:   true,
      });
    }

    console.log('Trip reminders stored successfully');

  } catch (error) {
    console.error('Trip reminder error:', error);
  }
};

module.exports = { sendTripReminders };