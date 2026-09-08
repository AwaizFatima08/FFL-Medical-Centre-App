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

      // Notification-debugging fix — this write previously used a
      // completely different, older field schema (title/body/category/
      // targetEmployeeId/sentBy/sentAt/whatsappDeferred) than every other
      // notification write in the app. GET /my (notificationRoutes.js)
      // filters on `recipientUid`, which this document never had — the
      // reminder was written successfully every single trip day, but no
      // employee ever actually saw it, silently, since this scheduler
      // was written. `isRead` was also missing, so even a same-day
      // partial fix wouldn't have let "mark all read" work on these.
      // Rewritten to the same flat shape `fitnessScheduler.js` and every
      // route-triggered notification already use.
      await db.collection('notifications').add({
        recipientUid:  booking.bookedBy,
        recipientRole: 'employee',
        title:         'Medical Trip Reminder',
        body:          'Your medical trip to RYK departs today at 17:30 from Medical Centre. Please be ready at your pickup point.',
        type:          'trip',
        referenceId:   doc.id,
        isRead:        false,
        createdAt:     new Date().toISOString(),
      });
    }

    console.log('Trip reminders stored successfully');

  } catch (error) {
    console.error('Trip reminder error:', error);
  }
};

module.exports = { sendTripReminders };