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
        
        // --- PROCESADO PARA DFCs ---
        if (setData && setData.cards) {
            const originalCards = [...setData.cards];
            const processedCards = [];
            
            for (const card of originalCards) {
                // Filtro de Descarte: Ignorar Cara B
                if (card.side === 'b') {
                    continue;
                }
                
                // Detección de Cara Principal y Fusión
                if (card.side === 'a' || (card.otherFaceIds && card.otherFaceIds.length > 0)) {
                    card.isTransformable = true;
                    
                    card.faces = [
                        { side: 'a', name: card.name, number: card.number }
                    ];
                    
                    const otherFaceId = card.otherFaceIds ? card.otherFaceIds[0] : null;
                    const otherFace = otherFaceId ? originalCards.find(c => c.uuid === otherFaceId) : null;
                    
                    if (otherFace) {
                        card.faces.push({
                            side: 'b',
                            name: otherFace.name,
                            number: otherFace.number
                        });
                    }
                }
                
                processedCards.push(card);
            }
            
            setData.cards = processedCards;
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
