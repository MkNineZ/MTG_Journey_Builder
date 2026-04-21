import { initNavigation, navigateTo } from './components/navigation.js';
import { initActivityLog } from './components/activityLog.js';
import { initSettings } from './screens/settings.js';
import { initExplore } from './screens/explore.js';
import { initCollection } from './screens/collection.js';
import { initBoosters, openBoosterClassic, openBoosterCustom, openBoosterCustomConfirm, confirmBoosterSave, toggleColorBtn, discardBooster, openBoosterModal } from './screens/boosters.js';
import { initDecks } from './screens/decks.js';
import { state } from './utils/state.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        initNavigation();
        initActivityLog();

        // Essential: wait for state to be fully loaded from DB before initting screens
        await state.init();

        initSettings();
        initExplore();
        initCollection();
        initBoosters();
        initDecks();

        // ── Startup Routing ──────────────────────────────────────────────────
        const lastTab = localStorage.getItem('mtg_last_tab');
        const hasSets = state.activeSetsData && state.activeSetsData.length > 0;

        if (!hasSets) {
            // First time or no sets: go to settings
            navigateTo('settings');
        } else if (lastTab) {
            // Return to last visited tab
            navigateTo(lastTab);
        } else {
            // Default home: My Collection
            navigateTo('collection');
        }

    } catch (err) {
        console.error("Critical error during App Init:", err);
    }

    // ── Notification dot ──────────────────────────────────────────────────────
    const dot = document.getElementById('collection-dot');
    state.subscribe((s) => {
        if (s.inventory && s.inventory.some(c => c.isNew)) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });

    // ── Global Event Delegation ───────────────────────────────────────────────
    // All booster interactions are handled here to survive tab switches and
    // innerHTML re-renders without duplicate listener leaks.
    document.body.addEventListener('click', async (e) => {

        // Classic booster
        const classicBtn = e.target.closest('.open-booster-classic');
        if (classicBtn) {
            const index = parseInt(classicBtn.dataset.index, 10);
            await openBoosterClassic(index);
            return;
        }

        // Custom config panel toggle
        const customBtn = e.target.closest('.open-booster-custom');
        if (customBtn) {
            const index = parseInt(customBtn.dataset.index, 10);
            await openBoosterCustom(index);
            return;
        }

        // Custom booster confirm (inside panel)
        const customConfirmBtn = e.target.closest('.open-booster-custom-confirm');
        if (customConfirmBtn) {
            const index = parseInt(customConfirmBtn.dataset.index, 10);
            await openBoosterCustomConfirm(index);
            return;
        }

        // Save booster to collection
        if (e.target.closest('#add-booster-to-inv')) {
            await confirmBoosterSave();
            return;
        }

        // Discard booster
        if (e.target.closest('#discard-booster')) {
            discardBooster();
            return;
        }

        // Booster card zoom
        const boosterCard = e.target.closest('.booster-card-item');
        if (boosterCard) {
            const uuid = boosterCard.dataset.uuid;
            openBoosterModal(uuid);
            return;
        }

        // Color identity toggle buttons inside custom panel
        const colorBtn = e.target.closest('.color-identity-btn');
        if (colorBtn) {
            toggleColorBtn(colorBtn);
            return;
        }
    });

    console.log('MTG Journey Builder Initialized.');
});
