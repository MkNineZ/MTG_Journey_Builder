const DB_NAME = 'mtg_nexus_db';
const DB_VERSION = 3; // Bumped for decks support

let dbInstance = null;

export function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('sets')) {
                db.createObjectStore('sets', { keyPath: 'code' });
            }
            if (!db.objectStoreNames.contains('inventory')) {
                db.createObjectStore('inventory', { keyPath: 'uuid' });
            }
            // Store for Activity Log
            if (!db.objectStoreNames.contains('activity_log')) {
                db.createObjectStore('activity_log', { keyPath: 'id', autoIncrement: true });
            }
            // Store for Decks
            if (!db.objectStoreNames.contains('decks')) {
                db.createObjectStore('decks', { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };
    });
}

export async function saveSet(code, setData) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('sets', 'readwrite');
        const store = tx.objectStore('sets');
        store.put({ code, data: setData });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getSet(code) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('sets', 'readonly');
        const store = tx.objectStore('sets');
        const request = store.get(code);
        request.onsuccess = () => resolve(request.result ? request.result.data : null);
        request.onerror = () => reject(request.error);
    });
}

export async function clearAllSets() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('sets', 'readwrite');
        const store = tx.objectStore('sets');
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getInventory() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('inventory', 'readonly');
        const store = tx.objectStore('inventory');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Returns Map<uuid, count> for O(1) Smart-filter lookups
export async function getInventoryMap() {
    const inventory = await getInventory();
    const map = new Map();
    inventory.forEach(item => map.set(item.uuid, item.count));
    return map;
}


export async function clearNewStatus() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('inventory', 'readwrite');
        const store = tx.objectStore('inventory');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const items = request.result || [];
            items.forEach(item => {
                if (item.isNew) {
                    item.isNew = false;
                    store.put(item);
                }
            });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function saveToInventory(cards, source = 'manual') {
    const db = await initDB();
    const stats = { updated: 0, added: 0, failed: 0 };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventory', 'activity_log'], 'readwrite');
        const store = tx.objectStore('inventory');
        const logStore = tx.objectStore('activity_log');
        
        let completed = 0;
        if (cards.length === 0) {
            resolve(stats);
            return;
        }

        cards.forEach(card => {
            if (!card.uuid) {
                console.error("[DB] Carta sin UUID detectada:", card.name || 'Desconocida');
                stats.failed++;
                checkFinish();
                return;
            }

            const getReq = store.get(card.uuid);
            getReq.onsuccess = () => {
                try {
                    let item = getReq.result;
                    const addCount = card.count || 1;
                    if (item) {
                        item.count += addCount;
                        item.isNew = true; 
                        stats.updated++;
                    } else {
                        item = { 
                            uuid: card.uuid, 
                            name: card.name || 'Unknown Card', 
                            setCode: card.setCode || '???',
                            number: card.number || '0',
                            count: addCount, 
                            rarity: card.rarity || 'common', 
                            colors: card.colors || [], 
                            type: card.type || 'Card', 
                            isNew: true 
                        };
                        stats.added++;
                    }
                    store.put(item);
                } catch (e) {
                    console.error("[DB] Error procesando carta:", card.name, e);
                    stats.failed++;
                } finally {
                    checkFinish();
                }
            };
            getReq.onerror = (e) => {
                console.error("[DB] Error al consultar carta:", card.name, e);
                stats.failed++;
                checkFinish();
            };
        });

        function checkFinish() {
            completed++;
            if (completed === cards.length) {
                finalize();
            }
        }

        function finalize() {
            try {
                if (source === 'booster') {
                    logStore.add({
                        type: 'booster',
                        desc: `Sobre abierto (${cards.length} cartas)`,
                        cards: cards,
                        date: Date.now()
                    });
                } else if (source === 'bulk') {
                    logStore.add({
                        type: 'bulk',
                        desc: `Importación Masiva (${cards.length} modelos únicos)`,
                        cards: cards,
                        date: Date.now()
                    });
                }
            } catch (e) {
                console.error("[DB] Error guardando log de actividad:", e);
            }
        }

        tx.oncomplete = () => resolve(stats);
        tx.onerror = (e) => {
            console.error("[DB] Error de transacción:", e);
            reject(tx.error);
        };
    });
}

export async function getAllSets() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('sets', 'readonly');
        const store = tx.objectStore('sets');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.map(r => r.data) || []);
        request.onerror = () => reject(request.error);
    });
}

export async function removeFromInventory(cards) {
    const db = await initDB();
    const stats = { removed: 0, subtracted: 0, failed: 0 };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventory', 'activity_log'], 'readwrite');
        const store = tx.objectStore('inventory');
        const logStore = tx.objectStore('activity_log');
        
        let completed = 0;
        if (cards.length === 0) {
            resolve(stats);
            return;
        }

        cards.forEach(card => {
            if (!card.uuid) {
                stats.failed++;
                checkFinish();
                return;
            }

            const getReq = store.get(card.uuid);
            getReq.onsuccess = () => {
                try {
                    let item = getReq.result;
                    const removeCount = card.count || 1;
                    if (item) {
                        item.count -= removeCount;
                        if (item.count <= 0) {
                            store.delete(card.uuid);
                            stats.removed++;
                        } else {
                            store.put(item);
                            stats.subtracted++;
                        }
                    } else {
                        stats.failed++;
                    }
                } catch (e) {
                    stats.failed++;
                } finally {
                    checkFinish();
                }
            };
            getReq.onerror = () => {
                stats.failed++;
                checkFinish();
            };
        });

        function checkFinish() {
            completed++;
            if (completed === cards.length) {
                const totalRemoved = stats.removed + stats.subtracted;
                if (totalRemoved > 0) {
                    logStore.add({
                        desc: `Eliminación masiva de ${totalRemoved} cartas de la colección`,
                        date: Date.now(),
                        type: 'bulk_remove'
                    });
                }
            }
        }

        tx.oncomplete = () => resolve(stats);
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearInventory() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventory', 'activity_log'], 'readwrite');
        const store = tx.objectStore('inventory');
        const logStore = tx.objectStore('activity_log');
        
        const req = store.clear();
        req.onsuccess = () => {
            logStore.add({
                desc: `Toda la colección fue eliminada`,
                date: Date.now(),
                type: 'clear_inventory'
            });
            resolve();
        };
        req.onerror = () => reject(tx.error);
    });
}

export async function updateInventoryCount(cardData, delta) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventory', 'activity_log'], 'readwrite');
        const store = tx.objectStore('inventory');
        const logStore = tx.objectStore('activity_log');
        const request = store.get(cardData.uuid);

        request.onsuccess = () => {
            let item = request.result;
            if (item) {
                item.count += delta;
                if (delta > 0) item.isNew = true;
                
                if (item.count <= 0) {
                    store.delete(cardData.uuid);
                } else {
                    store.put(item);
                }
            } else if (delta > 0) {
                item = { ...cardData, count: delta, isNew: true };
                store.put(item);
            }
            
            // Log manual activity
            const actionVerb = delta > 0 ? 'Añadida' : 'Eliminada';
            const absDelta = Math.abs(delta);
            logStore.add({
                type: 'manual',
                desc: `${actionVerb} ${absDelta}x ${cardData.name}`,
                cardData: cardData,
                delta: delta,
                date: Date.now()
            });
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getActivityLog() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('activity_log', 'readonly');
        const store = tx.objectStore('activity_log');
        const request = store.getAll();
        request.onsuccess = () => {
            // Sort by date descending
            const results = request.result || [];
            results.sort((a, b) => b.date - a.date);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function undoActivity(logId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['inventory', 'activity_log'], 'readwrite');
        const invStore = tx.objectStore('inventory');
        const logStore = tx.objectStore('activity_log');
        
        const getLogReq = logStore.get(logId);
        getLogReq.onsuccess = () => {
            const logEntry = getLogReq.result;
            if (!logEntry) {
                resolve();
                return;
            }

            // Undo logic
            if (logEntry.type === 'booster') {
                logEntry.cards.forEach(card => {
                    const invReq = invStore.get(card.uuid);
                    invReq.onsuccess = () => {
                        let item = invReq.result;
                        if (item) {
                            item.count -= 1;
                            if (item.count <= 0) {
                                invStore.delete(card.uuid);
                            } else {
                                invStore.put(item);
                            }
                        }
                    };
                });
            } else if (logEntry.type === 'manual') {
                const invReq = invStore.get(logEntry.cardData.uuid);
                invReq.onsuccess = () => {
                    let item = invReq.result;
                    if (item) {
                        item.count -= logEntry.delta; // Reverse the delta
                        if (item.count <= 0) {
                            invStore.delete(logEntry.cardData.uuid);
                        } else {
                            invStore.put(item);
                        }
                    }
                };
            }

            // Delete the log entry
            logStore.delete(logId);
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// ── Deck CRUD ────────────────────────────────────────────────────────────────

export async function getAllDecks() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('decks', 'readonly');
        const store = tx.objectStore('decks');
        const request = store.getAll();
        request.onsuccess = () => {
            const decks = request.result || [];
            decks.sort((a, b) => b.updatedAt - a.updatedAt);
            resolve(decks);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function getDeck(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('decks', 'readonly');
        const store = tx.objectStore('decks');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Saves (creates or updates) a deck.
 * If deckObj has an `id`, it updates. Otherwise, it creates a new one.
 * Returns the id of the saved deck.
 */
export async function saveDeck(deckObj) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('decks', 'readwrite');
        const store = tx.objectStore('decks');
        const toSave = { ...deckObj, updatedAt: Date.now() };
        if (!toSave.createdAt) toSave.createdAt = Date.now();
        const request = store.put(toSave);
        request.onsuccess = () => resolve(request.result); // returns the key (id)
        tx.onerror = () => reject(tx.error);
    });
}

export async function deleteDeck(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('decks', 'readwrite');
        const store = tx.objectStore('decks');
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearActivityLog() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('activity_log', 'readwrite');
        const store = tx.objectStore('activity_log');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(tx.error);
    });
}

// ── Backup & Restore ─────────────────────────────────────────────────────────

/**
 * Gathers all user data from IndexedDB for export.
 */
export async function exportDatabase() {
    const db = await initDB();
    const backup = {
        version: DB_VERSION,
        timestamp: Date.now(),
        inventory: [],
        decks: [],
        activity_log: []
    };

    return new Promise((resolve, reject) => {
        const stores = ['inventory', 'decks', 'activity_log'];
        const tx = db.transaction(stores, 'readonly');
        
        tx.objectStore('inventory').getAll().onsuccess = (e) => backup.inventory = e.target.result;
        tx.objectStore('decks').getAll().onsuccess = (e) => backup.decks = e.target.result;
        tx.objectStore('activity_log').getAll().onsuccess = (e) => backup.activity_log = e.target.result;

        tx.oncomplete = () => resolve(backup);
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Overwrites IndexedDB stores with provided backup data.
 * @param {Object} data The backup object containing inventory, decks, and logs.
 */
export async function importDatabase(data) {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
        const stores = ['inventory', 'decks', 'activity_log'];
        const tx = db.transaction(stores, 'readwrite');
        
        stores.forEach(sName => {
            const store = tx.objectStore(sName);
            store.clear();
            const items = data[sName] || [];
            items.forEach(item => store.put(item));
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
