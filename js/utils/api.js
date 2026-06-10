import { getSet, saveSet } from './db.js';
import { state } from './state.js';

const MTGJSON_API_BASE = 'https://mtgjson.com/api/v5';

export async function fetchSetData(code, progressCallback) {
    try {
        // 1. Check local DB first
        if (progressCallback) progressCallback(`Buscando ${code} en caché local...`);
        const localData = await getSet(code);
        
        if (localData) {
            if (progressCallback) progressCallback(`${code} cargado desde caché.`);
            return localData;
        }

        // 2. Not in DB, fetch from API
        if (progressCallback) progressCallback(`Descargando datos de ${code} desde MTGJSON...`);
        const response = await fetch(`${MTGJSON_API_BASE}/${code}.json`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status} al descargar ${code}`);
        }
        
        const responseData = await response.json();
        const setData = responseData.data; // MTGJSON wraps in { data: {...}, meta: {...} }
        
        // --- PROCESADO PARA VARIANTES Y DFCs ---
        if (setData && setData.cards) {
            const originalCards = [...setData.cards];
            
            // 1. Pre-ordenamiento por número de colección
            originalCards.sort((a, b) => {
                const numA = parseInt((a.number || '').replace(/\D/g, ''), 10) || 999;
                const numB = parseInt((b.number || '').replace(/\D/g, ''), 10) || 999;
                return numA - numB;
            });

            const baseCardsMap = new Map();
            const uuidMigrationMap = new Map(); // oldUuid -> newBaseUuid (para duplicados descartados)
            
            for (const card of originalCards) {
                // Filtro de Descarte: Ignorar Cara B de las DFC
                if (card.side === 'b') {
                    continue;
                }
                
                // Detección de Cara Principal y Fusión DFC
                if (card.side === 'a' || (card.otherFaceIds && card.otherFaceIds.length > 0)) {
                    card.isTransformable = true;
                    card.faces = [ { side: 'a', name: card.name, number: card.number } ];
                    
                    const otherFaceId = card.otherFaceIds ? card.otherFaceIds[0] : null;
                    const otherFace = otherFaceId ? originalCards.find(c => c.uuid === otherFaceId) : null;
                    
                    if (otherFace) {
                        card.faces.push({ side: 'b', name: otherFace.name, number: otherFace.number });
                    }
                }
                
                // Agrupación por nombre
                const cardName = card.name;
                
                if (!baseCardsMap.has(cardName)) {
                    // Nueva Carta Base
                    card.variants = [];
                    card.hasVariants = false;
                    baseCardsMap.set(cardName, card);
                } else {
                    // Ya existe, evaluamos si es variante o duplicado
                    const baseCard = baseCardsMap.get(cardName);
                    const promoTypes = card.promoTypes || [];
                    
                    const isVisualVariant = card.hasAlternativeArt || card.isAlternative || 
                                            promoTypes.some(t => ['borderless', 'showcase', 'extendedart'].includes(t)) ||
                                            (card.frameEffects && card.frameEffects.length > 0);
                                            
                    if (isVisualVariant) {
                        // Caso B: Variante Visual Real
                        card.regularCount = 0;
                        card.foilCount = 0;
                        baseCard.variants.push(card);
                        baseCard.hasVariants = true;
                    } else {
                        // Caso A: Duplicado (texto o starter deck). Se descarta.
                        // Marcamos para migrar su inventario a la Carta Base
                        uuidMigrationMap.set(card.uuid, baseCard.uuid);
                    }
                }
            }
            
            setData.cards = Array.from(baseCardsMap.values());
            
            // --- MIGRACIÓN DE INVENTARIO (SAFEGUARD) ---
            if (uuidMigrationMap.size > 0) {
                try {
                    // Importamos initDB dinámicamente o usamos el import existente
                    const { initDB } = await import('./db.js');
                    const db = await initDB();
                    const tx = db.transaction('inventory', 'readwrite');
                    const invStore = tx.objectStore('inventory');
                    
                    for (const [oldUuid, newUuid] of uuidMigrationMap.entries()) {
                        const getReq = invStore.get(oldUuid);
                        await new Promise((resolveReq) => {
                            getReq.onsuccess = () => {
                                const oldItem = getReq.result;
                                if (oldItem && (oldItem.regularCount > 0 || oldItem.foilCount > 0)) {
                                    const getNewReq = invStore.get(newUuid);
                                    getNewReq.onsuccess = () => {
                                        let newItem = getNewReq.result;
                                        if (!newItem) {
                                            const baseCard = setData.cards.find(c => c.uuid === newUuid);
                                            newItem = {
                                                uuid: baseCard.uuid,
                                                name: baseCard.name,
                                                setCode: baseCard.setCode,
                                                number: baseCard.number,
                                                rarity: baseCard.rarity,
                                                colors: baseCard.colors,
                                                type: baseCard.type,
                                                regularCount: 0,
                                                foilCount: 0,
                                                isNew: true
                                            };
                                        }
                                        newItem.regularCount = (newItem.regularCount || 0) + (oldItem.regularCount || 0);
                                        newItem.foilCount = (newItem.foilCount || 0) + (oldItem.foilCount || 0);
                                        invStore.put(newItem);
                                        invStore.delete(oldUuid); // Limpiamos el duplicado
                                        resolveReq();
                                    };
                                    getNewReq.onerror = () => resolveReq();
                                } else {
                                    resolveReq();
                                }
                            };
                            getReq.onerror = () => resolveReq();
                        });
                    }
                } catch (e) {
                    console.error("Error en migración de inventario:", e);
                }
            }
        }
        // ---------------------------
        
        // 3. Save to DB for future
        if (progressCallback) progressCallback(`Guardando ${code} en caché local...`);
        await saveSet(code, setData);
        
        return setData;
        
    } catch (error) {
        console.error(`Error al obtener set ${code}:`, error);
        throw error;
    }
}

// Primary: set+number+lang — the most reliable Scryfall endpoint for localized images.
// Fallback (onerror): English version via getCardImageUrlEn().
export function getCardImageUrl(card, lang) {
    const safeLang = lang || (window.state && window.state.language) || 'en';
    const setLower = card.setCode ? card.setCode.toLowerCase() : '';
    let url;
    
    const faceParam = (card.side && card.side.toLowerCase() === 'b') ? '&face=back' : '';
    
    if (card.number && setLower) {
        url = `https://api.scryfall.com/cards/${setLower}/${card.number}/${safeLang}?format=image${faceParam}`;
    } else {
        url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&set=${setLower}&lang=${safeLang}&format=image${faceParam}`;
    }
    
    return url;
}

export function getCardArtCropUrl(card, lang) {
    const safeLang = lang || (window.state && window.state.language) || 'en';
    const setLower = card.setCode ? card.setCode.toLowerCase() : '';
    let url;
    
    const faceParam = (card.side && card.side.toLowerCase() === 'b') ? '&face=back' : '';
    
    if (card.number && setLower) {
        url = `https://api.scryfall.com/cards/${setLower}/${card.number}/${safeLang}?format=image&version=art_crop${faceParam}`;
    } else {
        url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&set=${setLower}&lang=${safeLang}&format=image&version=art_crop${faceParam}`;
    }
    return url;
}

export function getCardArtCropUrlEn(card) {
    const setLower = card.setCode ? card.setCode.toLowerCase() : '';
    const faceParam = (card.side && card.side.toLowerCase() === 'b') ? '&face=back' : '';
    
    if (card.number && setLower) {
        return `https://api.scryfall.com/cards/${setLower}/${card.number}/en?format=image&version=art_crop${faceParam}`;
    }
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&set=${setLower}&lang=en&format=image&version=art_crop${faceParam}`;
}

// English-only fallback URL (always resolves – use as onerror src).
export function getCardImageUrlEn(card) {
    const setLower = card.setCode ? card.setCode.toLowerCase() : '';
    const faceParam = (card.side && card.side.toLowerCase() === 'b') ? '&face=back' : '';
    
    if (card.number && setLower) {
        return `https://api.scryfall.com/cards/${setLower}/${card.number}/en?format=image${faceParam}`;
    }
    return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}&set=${setLower}&lang=en&format=image${faceParam}`;
}
