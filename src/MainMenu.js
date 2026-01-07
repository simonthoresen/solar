
export class MainMenu {
    constructor(game) {
        this.game = game;
        this.isVisible = false;
        this.initUI();
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.id = 'main-menu-overlay';
        this.container.className = 'menu-overlay';
        this.container.style.display = 'none';

        this.container.innerHTML = `
            <div class="menu-content">
                <h1 class="menu-title">SOLAR</h1>
                <div class="menu-buttons">
                    <button id="menu-game-btn" class="menu-btn">
                        <span class="btn-icon">🚀</span>
                        <div class="btn-text">
                            <span class="btn-title">Play Game</span>
                            <span class="btn-desc">Explore the system in game mode</span>
                        </div>
                    </button>
                    <button id="menu-studio-btn" class="menu-btn">
                        <span class="btn-icon">🛠️</span>
                        <div class="btn-text">
                            <span class="btn-title">Solar Studio</span>
                            <span class="btn-desc">Design and edit celestial bodies</span>
                        </div>
                    </button>
                    <button id="menu-model-btn" class="menu-btn">
                        <span class="btn-icon">📐</span>
                        <div class="btn-text">
                            <span class="btn-title">Model Studio</span>
                            <span class="btn-desc">Design and edit 3D models</span>
                        </div>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        this.container.querySelector('#menu-game-btn').addEventListener('click', () => {
            window.location.href = 'game.html';
        });

        this.container.querySelector('#menu-studio-btn').addEventListener('click', () => {
            window.location.href = 'solar_studio.html';
        });

        this.container.querySelector('#menu-model-btn').addEventListener('click', () => {
            window.location.href = 'model_studio.html';
        });
    }

    show() {
        this.isVisible = true;
        this.container.style.display = 'flex';
        // Pause some game logic if needed
        if (this.game.isPaused !== undefined) {
            this.game.isPaused = true;
        }
    }

    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
        if (this.game.isPaused !== undefined) {
            this.game.isPaused = false;
        }
    }

    toggle() {
        if (this.isVisible) this.hide();
        else this.show();
    }
}
