import { initNavigation, navigateTo } from './components/navigation.js';
import { initActivityLog } from './components/activityLog.js';
import { initSettings } from './screens/settings.js';
import { initExplore } from './screens/explore.js';
import { initCollection } from './screens/collection.js';
import { initBoosters, openBoosterClassic, openBoosterMassClassic, openBoosterCustom, openBoosterCustomConfirm, confirmBoosterSave, toggleColorBtn, discardBooster, openBoosterModal } from './screens/boosters.js';
import { initDecks } from './screens/decks.js';
import { initAbout } from './screens/about.js';
import { state } from './utils/state.js';
import { exportDatabase } from './utils/db.js';

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
        initAbout();

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

    // ── Global Save Button ────────────────────────────────────────────────────
    const globalSaveBtn = document.getElementById('global-save-btn');
    if (globalSaveBtn) {
        globalSaveBtn.addEventListener('click', async () => {
            try {
                globalSaveBtn.disabled = true;
                const originalHtml = globalSaveBtn.innerHTML;
                globalSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 5px;"></i> Preparando...';
                
                const dbData = await exportDatabase();
                const fullBackup = {
                    ...dbData,
                    settings: {
                        language: state.language,
                        hoverZoom: state.hoverZoom,
                        selectedSets: state.selectedSets.map(s => s.code)
                    }
                };
                
                const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mtg-journey-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                globalSaveBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 5px; color: #4ade80;"></i> ¡Guardado!';
                globalSaveBtn.style.borderColor = '#4ade80';
                
                setTimeout(() => {
                    globalSaveBtn.disabled = false;
                    globalSaveBtn.innerHTML = originalHtml;
                    globalSaveBtn.style.borderColor = 'var(--accent-color)';
                }, 2000);
            } catch (err) {
                console.error('[Backup] Error:', err);
                alert('Error al exportar el progreso.');
                globalSaveBtn.disabled = false;
                globalSaveBtn.innerHTML = '<i class="fas fa-save" style="margin-right: 5px;"></i> Guardar Progreso';
            }
        });
    }

    // ── Global Event Delegation ───────────────────────────────────────────────
    
    // ── Scroll to Top Logic ───────────────────────────────────────────────────
    const scrollTopBtn = document.getElementById('scroll-top-btn');
    if (scrollTopBtn) {
        // Listen to scroll events on document (with capture phase to catch overflow: auto containers)
        document.addEventListener('scroll', (e) => {
            const target = e.target;
            if (target && target.classList && target.classList.contains('app-main-content')) {
                if (target.scrollTop > 300) {
                    scrollTopBtn.classList.add('visible');
                    // Store the current active scroll container so the button knows where to scroll
                    scrollTopBtn.dataset.activeScrollContainer = target.id || '';
                    scrollTopBtn.activeScrollElement = target;
                } else {
                    scrollTopBtn.classList.remove('visible');
                }
            }
        }, true);

        scrollTopBtn.addEventListener('click', () => {
            if (scrollTopBtn.activeScrollElement) {
                scrollTopBtn.activeScrollElement.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

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

        // Mass Classic booster
        const massClassicBtn = e.target.closest('.open-booster-mass-classic');
        if (massClassicBtn) {
            const index = parseInt(massClassicBtn.dataset.index, 10);
            await openBoosterMassClassic(index);
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

        // Custom mass booster confirm (inside panel)
        const customMassConfirmBtn = e.target.closest('.open-booster-mass-custom-confirm');
        if (customMassConfirmBtn) {
            const index = parseInt(customMassConfirmBtn.dataset.index, 10);
            import('./screens/boosters.js').then(m => m.openBoosterMassCustomConfirm(index));
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
