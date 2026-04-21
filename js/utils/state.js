import { getInventory, getAllSets } from './db.js';

export const state = {
    selectedSets: [],       // Array of basic metadata
    activeSetsData: [],     // Array of full set JSON data
    inventory: [],          // Array of cards owned
    currentOpeningPack: [], // Cards in the currently open booster
    language: localStorage.getItem('mtg_language') || 'en',  // Persisted language for Scryfall
    hoverZoom: parseFloat(localStorage.getItem('mtg_hover_zoom')) || 1.4, // Zoom multiplier for hover
    
    // Observers to react to state changes
    listeners: [],
    
    subscribe(callback) {
        this.listeners.push(callback);
    },

    async init() {
        try {
            console.log('[State] Inicializando estado global...');
            const [inv, sets] = await Promise.all([
                getInventory(),
                getAllSets()
            ]);
            this.inventory = inv;
            this.activeSetsData = sets;
            this.selectedSets = sets.map(s => ({ code: s.code, name: s.name }));
            
            // Set initial CSS variable
            document.documentElement.style.setProperty('--card-hover-zoom', this.hoverZoom);
            
            this.notify();
            console.log(`[State] Cargadas ${inv.length} cartas y ${sets.length} sets activos.`);
        } catch (e) {
            console.error("[State] Error en inicialización:", e);
        }
    },
    
    setSelectedSets(sets) {
        this.selectedSets = sets;
        this.notify();
    },
    
    setActiveSetsData(fullSets) {
        this.activeSetsData = fullSets;
        this.notify();
    },

    setLanguage(lang) {
        this.language = lang;
        localStorage.setItem('mtg_language', lang);
        console.log('[State] Idioma cambiado a:', lang);
        this.notify();
    },

    setHoverZoom(val) {
        this.hoverZoom = val;
        localStorage.setItem('mtg_hover_zoom', val);
        document.documentElement.style.setProperty('--card-hover-zoom', val);
        this.notify();
    },
    
    async loadInventory() {
        try {
            this.inventory = await getInventory();
            this.notify();
        } catch (e) {
            console.error("Failed to load inventory:", e);
        }
    },
    
    notify() {
        this.listeners.forEach(cb => cb({
            selectedSets: this.selectedSets,
            activeSetsData: this.activeSetsData,
            inventory: this.inventory,
            language: this.language,
            hoverZoom: this.hoverZoom
        }));
    }
};
