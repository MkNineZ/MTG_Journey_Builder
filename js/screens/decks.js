export function initDecks() {
    const container = document.getElementById('decks');
    
    container.innerHTML = `
        <div class="deck-header">
            <h2 style="margin: 0;">Editor de Mazos</h2>
            <div class="deck-controls">
                <button id="toggle-deck-view" class="nav-btn" title="Alternar Vista Expandida">
                    <i class="fas fa-expand-alt"></i>
                </button>
                <button id="save-deck-btn" class="save-btn" style="padding: 0.6rem 1.2rem;">
                    <i class="fas fa-save" style="margin-right: 0.5rem;"></i> Guardar Mazo
                </button>
            </div>
        </div>

        <div class="deck-editor-container" id="deck-editor">
            <!-- Left Panel: Inventory/Library Search -->
            <div class="inventory-panel">
                <h3 style="font-size: 1rem; margin-bottom: 1rem; color: var(--accent-color);">Biblioteca Disponible</h3>
                <div id="deck-inventory-search" style="margin-bottom: 1rem;"></div>
                <div id="deck-inventory-results" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem;">
                    <!-- Cards from inventory will be loaded here -->
                    <p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); margin-top: 2rem; font-size: 0.9rem;">
                        Cargando tu colección...
                    </p>
                </div>
            </div>

            <!-- Right Panel: Current Deck -->
            <div class="deck-panel">
                <div class="deck-header">
                    <h3 style="font-size: 1rem; margin: 0;">Nuevo Mazo</h3>
                    <span id="deck-count-label" style="font-size: 0.8rem; color: var(--text-secondary);">0 cartas</span>
                </div>

                <div class="deck-content">
                    <div class="deck-stats">
                        <div style="text-align: center;">
                            <i class="fas fa-chart-bar" style="font-size: 1.5rem; margin-bottom: 0.5rem; opacity: 0.3;"></i>
                            <div>Estadísticas del Mazo</div>
                        </div>
                    </div>

                    <div class="deck-list" id="deck-list-content">
                        <!-- Cards in deck will be listed here -->
                        <div style="text-align: center; padding: 2rem; opacity: 0.5; font-size: 0.85rem;">
                            Mazo vacío. Haz clic en las cartas de la izquierda para añadirlas.
                        </div>
                    </div>
                </div>

                <div style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <select id="deck-format" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); color: #fff; padding: 0.5rem; border-radius: 8px; font-size: 0.85rem;">
                        <option value="standard">Standard</option>
                        <option value="commander">Commander / EDH</option>
                        <option value="modern">Modern</option>
                        <option value="legacy">Legacy</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    // Toggle View Logic
    const toggleBtn = document.getElementById('toggle-deck-view');
    const editor = document.getElementById('deck-editor');

    toggleBtn.onclick = () => {
        editor.classList.toggle('expanded-view');
        const icon = toggleBtn.querySelector('i');
        if (editor.classList.contains('expanded-view')) {
            icon.classList.replace('fa-expand-alt', 'fa-compress-alt');
        } else {
            icon.classList.replace('fa-compress-alt', 'fa-expand-alt');
        }
    };
}
