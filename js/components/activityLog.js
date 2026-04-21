import { getActivityLog, undoActivity } from '../utils/db.js';
import { state } from '../utils/state.js';

export function initActivityLog() {
    // Inject floating button and drawer
    const container = document.createElement('div');
    container.innerHTML = `
        <button id="btn-activity-clock" class="floating-clock" title="Historial de Actividad">⌚</button>
        <div id="activity-drawer" class="activity-drawer">
            <div class="drawer-header">
                <h3>Historial</h3>
                <button id="btn-close-drawer" class="nav-btn" style="font-size:1.5rem; padding:0 0.5rem;">✕</button>
            </div>
            <div id="activity-content" class="drawer-content">
                <!-- Logs will be rendered here -->
            </div>
        </div>
    `;
    document.body.appendChild(container);

    const btnClock = document.getElementById('btn-activity-clock');
    const btnClose = document.getElementById('btn-close-drawer');
    const drawer = document.getElementById('activity-drawer');
    const content = document.getElementById('activity-content');

    const renderLogs = async () => {
        const logs = await getActivityLog();
        if (logs.length === 0) {
            content.innerHTML = '<p style="color:var(--text-secondary);text-align:center;margin-top:2rem;">No hay actividad reciente.</p>';
            return;
        }

        content.innerHTML = logs.map(log => {
            const timeStr = new Date(log.date).toLocaleString();
            return `
                <div class="log-entry">
                    <div class="log-entry-time">${timeStr}</div>
                    <div class="log-entry-desc">${log.desc}</div>
                    <button class="log-btn-undo" data-id="${log.id}">Deshacer Acción</button>
                </div>
            `;
        }).join('');

        // Attach undo events
        const undoBtns = content.querySelectorAll('.log-btn-undo');
        undoBtns.forEach(btn => {
            btn.onclick = async (e) => {
                const id = parseInt(e.target.getAttribute('data-id'), 10);
                e.target.innerText = 'Deshaciendo...';
                e.target.disabled = true;
                await undoActivity(id);
                await state.loadInventory(); // Update global state
                renderLogs(); // Refresh logs
            };
        });
    };

    btnClock.onclick = () => {
        drawer.classList.add('open');
        renderLogs();
    };

    btnClose.onclick = () => {
        drawer.classList.remove('open');
    };
}
