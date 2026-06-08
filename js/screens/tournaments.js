import { getAllTournaments, getTournament, saveTournament, deleteTournament } from '../utils/db.js';

let activeTournamentId = null;
let currentTab = 'standings'; // 'standings', 'bracket', 'participants'

export async function initTournaments() {
    const container = document.getElementById('tournaments');
    if (!container) return;

    // Build the shell
    container.innerHTML = `
        <div class="lol-header">
            <div>
                <h1 style="margin: 0;">Centro de Torneos</h1>
                <p style="color: var(--text-secondary); margin-top: 5px;">Gestiona tus eventos, jugadores y clasificaciones</p>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
                <select id="tournament-selector" class="settings-select" style="width: 250px;">
                    <option value="">Cargando torneos...</option>
                </select>
                <button id="btn-new-tournament" class="btn-mythic-accent">Nuevo Torneo</button>
            </div>
        </div>

        <div class="lol-tabs-container">
            <button class="lol-tab-btn active" data-tab="standings">Clasificación</button>
            <button class="lol-tab-btn" data-tab="bracket">Cuadro</button>
            <button class="lol-tab-btn" data-tab="participants">Participantes y Mazos</button>
        </div>

        <div id="tournament-content" style="margin-top: 2rem;">
            <!-- Tab content will be injected here -->
        </div>

        <!-- Add Player / Edit Decklist Modal -->
        <div id="tourney-modal" class="deck-modal-overlay" style="display: none;">
            <div class="deck-modal-content" style="max-width: 500px;">
                <button id="tourney-modal-close" class="deck-modal-close">&times;</button>
                <h2 id="tourney-modal-title" style="color: var(--accent-color); margin-bottom: 1rem;">Añadir Jugador</h2>
                
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Nombre del Jugador</label>
                        <input type="text" id="tourney-player-name" class="settings-select" style="width: 100%; box-sizing: border-box;" placeholder="Ej. Faker">
                    </div>
                    <div>
                        <label style="color: var(--text-secondary); display: block; margin-bottom: 5px;">Lista del Mazo (Texto Plano)</label>
                        <textarea id="tourney-player-decklist" class="settings-select" style="width: 100%; height: 200px; resize: vertical; box-sizing: border-box; font-family: monospace;" placeholder="4x Siege Rhino\n2x Hero's Downfall..."></textarea>
                    </div>
                    <button id="tourney-modal-save" class="save-btn" style="width: 100%; margin-top: 1rem;">Guardar Jugador</button>
                </div>
            </div>
        </div>
    `;

    // Listeners
    document.querySelectorAll('.lol-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.lol-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            renderCurrentTab();
        });
    });

    document.getElementById('btn-new-tournament').addEventListener('click', async () => {
        const name = prompt('Introduce el nombre del nuevo torneo:');
        if (!name) return;
        
        const newT = {
            name,
            status: 'active',
            players: [],
            matches: []
        };
        const id = await saveTournament(newT);
        activeTournamentId = id;
        await refreshTournamentsList();
    });

    document.getElementById('tournament-selector').addEventListener('change', (e) => {
        activeTournamentId = e.target.value;
        renderCurrentTab();
    });

    document.getElementById('tourney-modal-close').addEventListener('click', () => {
        document.getElementById('tourney-modal').style.display = 'none';
    });

    // Initial load
    await refreshTournamentsList();
}

async function refreshTournamentsList() {
    const all = await getAllTournaments();
    const select = document.getElementById('tournament-selector');
    
    if (all.length === 0) {
        select.innerHTML = '<option value="">No hay torneos</option>';
        activeTournamentId = null;
        renderCurrentTab();
        return;
    }

    select.innerHTML = all.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    if (!activeTournamentId || !all.find(t => t.id === activeTournamentId)) {
        activeTournamentId = all[0].id;
    }
    select.value = activeTournamentId;
    
    renderCurrentTab();
}

async function renderCurrentTab() {
    const content = document.getElementById('tournament-content');
    if (!activeTournamentId) {
        content.innerHTML = '<p style="color: var(--text-secondary); text-align: center; margin-top: 3rem;">No hay torneos activos. Crea uno para empezar.</p>';
        return;
    }

    const t = await getTournament(activeTournamentId);
    if (!t) return;

    if (currentTab === 'standings') renderStandings(t, content);
    else if (currentTab === 'participants') renderParticipants(t, content);
    else if (currentTab === 'bracket') renderBracket(t, content);
}

// ── Tab Renderers ────────────────────────────────────────────────────────────

function renderStandings(tournament, container) {
    if (!tournament.players || tournament.players.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; margin-top: 3rem;">
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">No hay jugadores inscritos en este torneo.</p>
                <button class="lol-btn btn-add-player" style="margin: 0 auto;">Añadir Primer Jugador</button>
            </div>`;
        bindAddPlayerBtn();
        return;
    }

    // Sort players by winrate %, then by total wins
    const sorted = [...tournament.players].sort((a, b) => {
        const aTotal = (a.stats?.wins || 0) + (a.stats?.losses || 0);
        const bTotal = (b.stats?.wins || 0) + (b.stats?.losses || 0);
        const aWr = aTotal === 0 ? 0 : (a.stats.wins / aTotal);
        const bWr = bTotal === 0 ? 0 : (b.stats.wins / bTotal);

        if (bWr !== aWr) return bWr - aWr;
        return (b.stats?.wins || 0) - (a.stats?.wins || 0);
    });

    let html = `
        <table class="lol-table">
            <thead>
                <tr>
                    <th style="width: 80px; text-align: center;">Pos</th>
                    <th>Jugador</th>
                    <th style="text-align: center;">V - D</th>
                    <th style="text-align: right;">Win Rate</th>
                </tr>
            </thead>
            <tbody>
    `;

    sorted.forEach((p, index) => {
        const wins = p.stats?.wins || 0;
        const losses = p.stats?.losses || 0;
        const total = wins + losses;
        const wr = total === 0 ? '0%' : Math.round((wins / total) * 100) + '%';
        const color = index === 0 ? 'var(--accent-color)' : 'var(--text-primary)';

        html += `
            <tr class="lol-row">
                <td style="text-align: center; font-family: var(--font-heading); font-size: 1.2rem; color: ${color};">${index + 1}</td>
                <td style="font-weight: 600;">${p.name}</td>
                <td style="text-align: center; color: var(--text-secondary);">${wins} V - ${losses} D</td>
                <td style="text-align: right; color: var(--highlight-text);">${wr}</td>
            </tr>
        `;
    });

    html += `</tbody></table>
        <div style="margin-top: 2rem; display: flex; justify-content: flex-end;">
            <button class="lol-btn btn-add-player"><i class="fas fa-plus"></i> Añadir Jugador</button>
            <button class="lol-btn btn-record-match" style="margin-left: 1rem;"><i class="fas fa-gamepad"></i> Registrar Partida</button>
        </div>
    `;

    container.innerHTML = html;
    bindAddPlayerBtn();
    
    const recordBtn = container.querySelector('.btn-record-match');
    if (recordBtn) recordBtn.addEventListener('click', () => {
        alert('Funcionalidad de Registrar Partida en desarrollo.');
    });
}

function renderParticipants(tournament, container) {
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="margin: 0; color: var(--text-secondary);">Participantes (${tournament.players?.length || 0})</h3>
            <button class="lol-btn btn-add-player"><i class="fas fa-plus"></i> Añadir Jugador</button>
        </div>
        <div class="lol-grid">
    `;

    if (!tournament.players || tournament.players.length === 0) {
        html += `<p style="color: var(--text-secondary); grid-column: 1 / -1;">No hay participantes.</p>`;
    } else {
        tournament.players.forEach(p => {
            html += `
                <div class="lol-card">
                    <div class="lol-card-header">
                        <strong style="font-size: 1.2rem; color: var(--text-primary);">${p.name}</strong>
                        <span style="color: var(--accent-secondary); font-family: var(--font-heading);">${p.stats?.wins || 0}V - ${p.stats?.losses || 0}D</span>
                    </div>
                    <div style="flex-grow: 1;">
                        <textarea readonly class="settings-select" style="width: 100%; height: 120px; resize: none; font-family: monospace; font-size: 0.8rem; background: rgba(0,0,0,0.3); color: var(--text-secondary); border: none;">${p.decklist || 'Sin lista registrada'}</textarea>
                    </div>
                    <button class="lol-btn btn-edit-deck" data-player-id="${p.id}" style="width: 100%; margin-top: 0.5rem;">
                        <i class="fas fa-edit"></i> Editar Lista
                    </button>
                </div>
            `;
        });
    }

    html += `</div>`;
    container.innerHTML = html;
    
    bindAddPlayerBtn();

    container.querySelectorAll('.btn-edit-deck').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const playerId = e.target.closest('.btn-edit-deck').dataset.playerId;
            openPlayerModal(playerId);
        });
    });
}

function renderBracket(tournament, container) {
    container.innerHTML = `
        <div style="text-align: center; margin-top: 3rem; padding: 2rem; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px dashed var(--border-color);">
            <i class="fas fa-sitemap" style="font-size: 3rem; color: var(--accent-secondary); margin-bottom: 1rem;"></i>
            <h2>Cuadro de Eliminatorias</h2>
            <p style="color: var(--text-secondary);">La visualización del bracket de playoffs se habilitará en una actualización futura.</p>
        </div>
    `;
}

// ── Modals & Actions ─────────────────────────────────────────────────────────

function bindAddPlayerBtn() {
    document.querySelectorAll('.btn-add-player').forEach(btn => {
        btn.addEventListener('click', () => openPlayerModal(null));
    });
}

let currentPlayerEditingId = null;

async function openPlayerModal(playerId) {
    const modal = document.getElementById('tourney-modal');
    const title = document.getElementById('tourney-modal-title');
    const nameInput = document.getElementById('tourney-player-name');
    const deckInput = document.getElementById('tourney-player-decklist');
    
    currentPlayerEditingId = playerId;
    
    if (playerId) {
        title.textContent = 'Editar Jugador / Mazo';
        const t = await getTournament(activeTournamentId);
        const p = t.players.find(x => x.id === playerId);
        nameInput.value = p.name;
        deckInput.value = p.decklist || '';
    } else {
        title.textContent = 'Añadir Nuevo Jugador';
        nameInput.value = '';
        deckInput.value = '';
    }
    
    modal.style.display = 'flex';
    
    const saveBtn = document.getElementById('tourney-modal-save');
    saveBtn.onclick = async () => {
        const name = nameInput.value.trim();
        const deck = deckInput.value.trim();
        if (!name) return alert('El nombre es obligatorio');
        
        const t = await getTournament(activeTournamentId);
        
        if (currentPlayerEditingId) {
            const p = t.players.find(x => x.id === currentPlayerEditingId);
            if (p) {
                p.name = name;
                p.decklist = deck;
            }
        } else {
            t.players.push({
                id: crypto.randomUUID(),
                name,
                decklist: deck,
                stats: { wins: 0, losses: 0 }
            });
        }
        
        await saveTournament(t);
        modal.style.display = 'none';
        renderCurrentTab();
    };
}
