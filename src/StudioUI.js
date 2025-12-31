
import { solarSystemConfig, dustConfig, playerConfig } from './config.js';

export class StudioUI {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.selectedBody = null;
        this.isVisible = false;

        this.init();
    }

    init() {
        this.createUI();
        this.hide(); // Hidden by default until an object is selected
    }

    createUI() {
        this.container = document.createElement('div');
        this.container.className = 'studio-ui-panel';
        this.container.style.display = 'none';

        // Basic structure handling
        this.container.innerHTML = `
            <div class="studio-header">
                <h3>Solar Studio</h3>
                <div class="studio-controls">
                    <button id="studio-toggle-orbit-btn" class="control-btn">Pause Orbits</button>
                    <button id="studio-reset-orbits-btn" class="control-btn">Reset Orbits</button>
                </div>
                <div class="studio-actions">
                    <button id="studio-play-btn">Play Game</button>
                    <button id="studio-save-btn">Save Config</button>
                </div>
            </div>
            <div class="studio-body-editor" id="studio-editor">
                <div class="no-selection">Select a celestial body to edit</div>
            </div>
        `;

        document.body.appendChild(this.container);

        document.getElementById('studio-save-btn').addEventListener('click', () => {
            this.saveConfig();
        });

        document.getElementById('studio-play-btn').addEventListener('click', () => {
            this.game.setMode('game');
        });

        const toggleOrbitBtn = document.getElementById('studio-toggle-orbit-btn');
        toggleOrbitBtn.addEventListener('click', () => {
            const isPaused = this.game.toggleOrbitPause();
            toggleOrbitBtn.innerText = isPaused ? 'Play Orbits' : 'Pause Orbits';
        });

        document.getElementById('studio-reset-orbits-btn').addEventListener('click', () => {
            if (confirm('Reset all planetary orbits to zero alignment?')) {
                this.game.resetOrbits();
            }
        });
    }

    show(celestialBody) {
        this.selectedBody = celestialBody;
        this.isVisible = true;
        this.container.style.display = 'block';
        this.renderEditor();
    }

    hide() {
        this.isVisible = false;
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    renderEditor() {
        const editor = document.getElementById('studio-editor');
        if (!this.selectedBody) {
            editor.innerHTML = '<div class="no-selection">Select a celestial body to edit</div>';
            return;
        }

        // We need to match the celestial body back to the config data to edit it reliably.
        // For now, let's assume successful mapping or store config ref on body.
        // The Game class recreates bodies from config, so we might need to modify config directly
        // and let Game updates reflect it, or update body and then serialize.

        // Let's create fields for the editable properties
        const config = this.game.getConfigForBody(this.selectedBody);

        if (!config) {
            editor.innerHTML = '<div class="error">Could not find config for this body</div>';
            return;
        }

        let fieldsHtml = '<div class="editor-fields">';

        // Editable fields definition
        const fields = [
            { key: 'sizeRadius', label: 'Size', type: 'number' },
            { key: 'color', label: 'Color (Hex)', type: 'hex' },
            { key: 'rotationRadius', label: 'Gravity Radius', type: 'number' },
            { key: 'orbitDistance', label: 'Orbit Distance', type: 'number' },
            { key: 'orbitSpeed', label: 'Orbit Speed', type: 'number' },
            { key: 'rotationSpeed', label: 'Rotation Speed', type: 'number' }
        ];

        fields.forEach(field => {
            const value = field.type === 'hex' ? '#' + config[field.key].toString(16).padStart(6, '0') : config[field.key];
            fieldsHtml += `
                <div class="field-row">
                    <label>${field.label}</label>
                    <input type="${field.type === 'hex' ? 'color' : 'number'}" 
                           data-key="${field.key}" 
                           value="${value}"
                           step="${field.type === 'number' ? '0.1' : ''}"
                    >
                </div>
            `;
        });

        fieldsHtml += '</div>';
        editor.innerHTML = `<h4>Editing: ${config.id}</h4>` + fieldsHtml;

        // Add listeners
        const inputs = editor.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('change', (e) => {
                this.updateBody(config, e.target.dataset.key, e.target.value, e.target.type);
            });
            input.addEventListener('input', (e) => {
                this.updateBody(config, e.target.dataset.key, e.target.value, e.target.type);
            });
        });
    }

    updateBody(config, key, value, type) {
        let parsedValue = value;
        if (type === 'number') {
            parsedValue = parseFloat(value);
            if (isNaN(parsedValue)) {
                parsedValue = 0;
            }
        } else if (type === 'color') {
            parsedValue = parseInt(value.replace('#', ''), 16);
        }

        // Update config
        config[key] = parsedValue;

        // Update visual body
        if (key === 'color') {
            this.selectedBody.setColor(parsedValue);
        } else if (key === 'sizeRadius') {
            this.selectedBody.updateSize(parsedValue);
        }

        // Other properties are used in update loop, so updating config object might be enough 
        // IF the body reads from it. Currently CelestialBody constructs with values.
        // So we need to push values to the body instance too.
        this.selectedBody.updateConfig(key, parsedValue);
    }

    saveConfig() {
        const configData = solarSystemConfig;

        // Format as JS file content
        const fileContent = `export const solarSystemConfig = ${JSON.stringify(configData, null, 4)};\n\n` +
            `export const dustConfig = ${JSON.stringify(dustConfig, null, 4)};\n\n` +
            `export const playerConfig = ${JSON.stringify(playerConfig, null, 4)};`;

        const blob = new Blob([fileContent], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);

        const date = new Date().toISOString().split('T')[0];
        const filename = `${date} solar.js`;

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();

        URL.revokeObjectURL(url);
    }
}
