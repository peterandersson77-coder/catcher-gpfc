/* ===================================
   Catcher by GPFC — Firebase Cloud Sync
   =================================== */

const firebaseConfig = {
    apiKey: "AIzaSyAMYwYG7I4IZmzXcaaC1NeGFP_xFOpD90g",
    authDomain: "catcher-gpfc.firebaseapp.com",
    projectId: "catcher-gpfc",
    storageBucket: "catcher-gpfc.firebasestorage.app",
    messagingSenderId: "152934314916",
    appId: "1:152934314916:web:ce5f9c122266ddae978731"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const cloudSync = {
    // Save session to Firestore
    async saveSession(session) {
        try {
            await db.collection('sessions').doc(session.id).set(session);
        } catch (e) {
            console.warn('Cloud sync failed (session):', e.message);
        }
    },

    // Save catch to Firestore
    async saveCatch(catchData) {
        try {
            await db.collection('catches').doc(catchData.id).set(catchData);
        } catch (e) {
            console.warn('Cloud sync failed (catch):', e.message);
        }
    },

    // Delete session from Firestore
    async deleteSession(id) {
        try {
            await db.collection('sessions').doc(id).delete();
            // Delete associated catches
            const snapshot = await db.collection('catches').where('sessionId', '==', id).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch (e) {
            console.warn('Cloud sync failed (delete session):', e.message);
        }
    },

    // Delete catch from Firestore
    async deleteCatch(id) {
        try {
            await db.collection('catches').doc(id).delete();
        } catch (e) {
            console.warn('Cloud sync failed (delete catch):', e.message);
        }
    },

    // Pull all data from cloud (for restoring on new device/browser)
    async pullAll() {
        try {
            const sessionsSnap = await db.collection('sessions').get();
            const catchesSnap = await db.collection('catches').get();
            const sessions = sessionsSnap.docs.map(doc => doc.data());
            const catches = catchesSnap.docs.map(doc => doc.data());
            return { sessions, catches };
        } catch (e) {
            console.warn('Cloud pull failed:', e.message);
            return null;
        }
    },

    // Push all local data to cloud (full sync)
    async pushAll(sessions, catches) {
        try {
            const batch = db.batch();
            sessions.forEach(s => {
                batch.set(db.collection('sessions').doc(s.id), s);
            });
            catches.forEach(c => {
                batch.set(db.collection('catches').doc(c.id), c);
            });
            await batch.commit();
            return true;
        } catch (e) {
            console.warn('Cloud push failed:', e.message);
            return false;
        }
    }
};
