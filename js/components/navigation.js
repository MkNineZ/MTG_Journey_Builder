export function initNavigation() {
    const buttons = document.querySelectorAll('.nav-btn');
    const screens = document.querySelectorAll('.screen');

    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            
            // Save to localStorage for persistence
            localStorage.setItem('mtg_last_tab', targetId);

            // Update buttons
            buttons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

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
