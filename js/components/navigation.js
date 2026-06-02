export function initNavigation() {
    const buttons = document.querySelectorAll('.nav-btn');
    const screens = document.querySelectorAll('.screen');

    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentBtn = e.target.closest('.nav-btn');
            if (!currentBtn) return;
            const targetId = currentBtn.getAttribute('data-target');
            if (!targetId) return; // Ignore buttons without data-target
            
            // Save to localStorage for persistence
            localStorage.setItem('mtg_last_tab', targetId);

            // Update buttons
            buttons.forEach(b => {
                if (b.hasAttribute('data-target')) {
                    b.classList.remove('active');
                }
            });
            currentBtn.classList.add('active');

            // Update screens
            screens.forEach(screen => {
                if (screen.id === targetId) {
                    screen.classList.add('active');
                } else {
                    screen.classList.remove('active');
                }
            });
        });
    });
}

// Function to switch tab programmatically
export function navigateTo(targetId) {
    const btn = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
    if (btn) btn.click();
}
