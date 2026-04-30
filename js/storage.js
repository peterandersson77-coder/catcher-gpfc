/* ===================================
   FiskeLOGG — Storage Layer (IndexedDB)
   =================================== */

const DB_NAME = 'fiskelogg';
const DB_VERSION = 1;

class FiskeStorage {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionStore.createIndex('date', 'date', { unique: false });
                    sessionStore.createIndex('location', 'location', { unique: false });
                }

                if (!db.objectStoreNames.contains('catches')) {
                    const catchStore = db.createObjectStore('catches', { keyPath: 'id' });
                    catchStore.createIndex('sessionId', 'sessionId', { unique: false });
                    catchStore.createIndex('species', 'species', { unique: false });
                    catchStore.createIndex('method', 'method', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    // === SESSIONS ===

    async saveSession(session) {
        if (!session.id) {
            session.id = this.generateId();
        }
        session.updatedAt = new Date().toISOString();
        if (!session.createdAt) {
            session.createdAt = session.updatedAt;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('sessions', 'readwrite');
            const store = tx.objectStore('sessions');
            const request = store.put(session);
            request.onsuccess = () => {
                cloudSync.saveSession(session);
                resolve(session);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getSession(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('sessions', 'readonly');
            const store = tx.objectStore('sessions');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllSessions() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('sessions', 'readonly');
            const store = tx.objectStore('sessions');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async deleteSession(id) {
        // Delete session and its catches
        const catches = await this.getCatchesBySession(id);
        const tx = this.db.transaction(['sessions', 'catches'], 'readwrite');

        return new Promise((resolve, reject) => {
            tx.objectStore('sessions').delete(id);
            catches.forEach(c => tx.objectStore('catches').delete(c.id));
            tx.oncomplete = () => {
                cloudSync.deleteSession(id);
                resolve();
            };
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    // === CATCHES ===

    async saveCatch(catchData) {
        if (!catchData.id) {
            catchData.id = this.generateId();
        }
        catchData.updatedAt = new Date().toISOString();
        if (!catchData.createdAt) {
            catchData.createdAt = catchData.updatedAt;
        }

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('catches', 'readwrite');
            const store = tx.objectStore('catches');
            const request = store.put(catchData);
            request.onsuccess = () => {
                cloudSync.saveCatch(catchData);
                resolve(catchData);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getCatch(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('catches', 'readonly');
            const store = tx.objectStore('catches');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getCatchesBySession(sessionId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('catches', 'readonly');
            const store = tx.objectStore('catches');
            const index = store.index('sessionId');
            const request = index.getAll(sessionId);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getAllCatches() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('catches', 'readonly');
            const store = tx.objectStore('catches');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async deleteCatch(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('catches', 'readwrite');
            const store = tx.objectStore('catches');
            const request = store.delete(id);
            request.onsuccess = () => {
                cloudSync.deleteCatch(id);
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // === EXPORT / IMPORT ===

    // Local-only saves (no cloud sync — used during sync-from-cloud)
    async saveSessionLocal(session) {
        if (!session.id) session.id = this.generateId();
        session.updatedAt = session.updatedAt || new Date().toISOString();
        if (!session.createdAt) session.createdAt = session.updatedAt;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('sessions', 'readwrite');
            tx.objectStore('sessions').put(session);
            tx.oncomplete = () => resolve(session);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async saveCatchLocal(catchData) {
        if (!catchData.id) catchData.id = this.generateId();
        catchData.updatedAt = catchData.updatedAt || new Date().toISOString();
        if (!catchData.createdAt) catchData.createdAt = catchData.updatedAt;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('catches', 'readwrite');
            tx.objectStore('catches').put(catchData);
            tx.oncomplete = () => resolve(catchData);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async exportData() {
        const sessions = await this.getAllSessions();
        const catches = await this.getAllCatches();
        return JSON.stringify({ sessions, catches, exportDate: new Date().toISOString() }, null, 2);
    }

    async importData(jsonString) {
        const data = JSON.parse(jsonString);
        if (!data.sessions || !data.catches) {
            throw new Error('Ogiltigt dataformat');
        }

        for (const session of data.sessions) {
            await this.saveSession(session);
        }
        for (const c of data.catches) {
            await this.saveCatch(c);
        }

        return { sessions: data.sessions.length, catches: data.catches.length };
    }
}

// Singleton
const storage = new FiskeStorage();
