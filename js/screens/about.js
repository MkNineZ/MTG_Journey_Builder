export function initAbout() {
    const container = document.getElementById('about');
    
    container.innerHTML = `
        <div class="about-container" style="max-width: 900px; margin: 0 auto; padding-bottom: 5rem; animation: fadeIn 0.6s ease-out;">
            <div style="text-align: center; margin-bottom: 4rem;">
                <h2 style="font-size: 3rem; font-family: var(--font-heading); color: var(--accent-secondary); margin-bottom: 1rem; letter-spacing: 2px;">Manifiesto del Caminante</h2>
                <div style="width: 100px; height: 2px; background: linear-gradient(to right, transparent, var(--accent-secondary), transparent); margin: 0 auto;"></div>
            </div>

            <!-- 1. Filosofía -->
            <div class="about-block manifesto-gradient">
                <h3><i class="fas fa-feather-alt"></i> Nuestra Filosofía: El Regreso al 'Kitchen Table'</h3>
                <h4 style="color: var(--highlight-text); margin-bottom: 1.5rem; font-family: var(--font-heading);">"El Arte de Construir con lo que Tienes"</h4>
                <p>MTG Journey Builder nació para recuperar la esencia del Magic casual: esa sensación de abrir una caja de zapatos, extender tus cartas sobre la alfombra y preguntarte: <strong>¿Qué es lo mejor que puedo montar con esto?</strong></p>
                <p style="margin-top: 1.2rem;">A diferencia de modelos como MTG Arena, donde la progresión está ligada a la monetización y al 'metajuego' dictado por algoritmos, aquí el límite lo pone tu ingenio y tu colección real. Es un simulador de progresión orgánica donde cada carta nueva cuenta y cada decisión de deckbuilding es un puzzle de recursos limitados. No buscamos el mazo perfecto de internet, sino la mejor estrategia con <em>tus</em> cartas.</p>
            </div>

            <!-- 2. Privacidad -->
            <div class="about-block">
                <h3><i class="fas fa-hand-holding-heart"></i> Tus Cartas, Tus Datos</h3>
                <p>Creemos en la <strong>soberanía del jugador</strong>. Por eso, MTG Journey Builder no tiene servidores ni cuentas en la nube. Todo el inventario y los mazos se guardan localmente en tu navegador.</p>
                <p style="margin-top: 1.2rem; border-left: 2px solid var(--accent-color); padding-left: 1.5rem; font-style: italic; color: var(--text-secondary);">"No somos dueños de tu colección; tú lo eres. Eres el único responsable y soberano de tu progreso."</p>
            </div>

            <!-- 3. Créditos y Fuentes -->
            <div class="about-block" style="background: rgba(0,0,0,0.4);">
                <h3><i class="fas fa-code-branch"></i> Créditos y Fuentes de Datos</h3>
                <p style="margin-bottom: 1.5rem; opacity: 0.8;">Esta herramienta es posible gracias a la generosidad y el esfuerzo de la comunidad abierta de Magic:</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                    <div class="credit-item">
                        <strong>Scryfall</strong>
                        <p>Por su increíble API de búsqueda e imágenes de alta resolución que dan vida a la app.</p>
                    </div>
                    <div class="credit-item">
                        <strong>MTGJSON</strong>
                        <p>Por proporcionar los datos técnicos detallados que alimentan nuestra base de datos interna.</p>
                    </div>
                    <div class="credit-item">
                        <strong>Simbología</strong>
                        <p>Iconografía de maná y símbolos de expansiones obtenidos de Scryfall y el proyecto Keyrune.</p>
                    </div>
                </div>

                <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(255, 69, 0, 0.05); border: 1px solid rgba(255, 69, 0, 0.2); border-radius: 12px; font-size: 0.85rem;">
                    <p><strong>Aviso Legal:</strong> Magic: The Gathering es marca registrada de <strong>Wizards of the Coast LLC</strong>. Este proyecto no está afiliado, respaldado ni patrocinado por ellos. Se trata de una herramienta gratuita para uso personal y recreativo.</p>
                </div>
            </div>

            <!-- 4. Seguridad -->
            <div class="about-block" style="border-color: #f1c40f;">
                <h3><i class="fas fa-exclamation-triangle" style="color: #f1c40f;"></i> Seguridad del Peregrino</h3>
                <p>Al no existir cuentas en la nube, tu progreso vive en el almacenamiento local de este navegador. <strong>Si limpias el historial o el caché, podrías perder tu colección.</strong></p>
                <p style="margin-top: 1rem; font-weight: 800; color: var(--highlight-text);">
                    <i class="fas fa-arrow-right"></i> Usa siempre el botón de <strong>Exportar JSON</strong> en la pestaña de Configuración para respaldar tus datos o moverlos a otro dispositivo.
                </p>
            </div>

            <!-- Versión -->
            <div style="text-align: center; margin-top: 4rem; opacity: 0.4; font-size: 0.8rem; letter-spacing: 1px;">
                <p>MTG JOURNEY BUILDER — MYTHIC BRONZE EDITION</p>
                <p>v1.0 — 2026</p>
            </div>
        </div>

        <style>
            .about-block {
                background: var(--surface-highlight);
                border: 1px solid var(--border-color);
                border-radius: 20px;
                padding: 2.5rem;
                margin-bottom: 2.5rem;
                box-shadow: 0 15px 40px rgba(0,0,0,0.3);
                position: relative;
                overflow: hidden;
            }
            .manifesto-gradient::after {
                content: '';
                position: absolute;
                top: 0; right: 0; width: 150px; height: 150px;
                background: radial-gradient(circle at top right, rgba(133, 109, 64, 0.1), transparent);
                pointer-events: none;
            }
            .about-block h3 {
                color: var(--accent-secondary);
                font-family: var(--font-heading);
                font-size: 1.4rem;
                margin-bottom: 1.5rem;
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            .about-block p {
                line-height: 1.8;
                color: var(--text-primary);
                font-size: 1.05rem;
            }
            .credit-item {
                padding: 1rem;
                background: rgba(255,255,255,0.02);
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.05);
            }
            .credit-item strong {
                display: block;
                margin-bottom: 0.5rem;
                color: var(--accent-secondary);
                font-family: var(--font-heading);
            }
            .credit-item p {
                font-size: 0.85rem;
                line-height: 1.4;
                opacity: 0.8;
            }
        </style>
    `;
}
