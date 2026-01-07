import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CelestialBody } from './objects/CelestialBody.js';
import { VelocityField } from './objects/VelocityField.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { Nebula } from './objects/Nebula.js';
import { MainMenu } from './MainMenu.js';
import { solarSystemConfig, dustConfig } from './config.js';

export class SolarStudio {
    constructor() {
        this.container = document.getElementById('app');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'app';
            document.body.appendChild(this.container);
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.setupLights();

        // Components
        this.velocityField = new VelocityField(this.scene);
        this.particleSystem = new ParticleSystem(this.scene, dustConfig);
        this.nebula = new Nebula(this.scene);
        this.celestialBodies = [];

        // Initialize Celestial Bodies from Config
        this.initCelestialBodies();

        // Camera and Controls
        this.setupCamera();
        this.setupControls();

        // UI
        this.selectedBody = null;
        this.setupUI();

        // State
        this.isOrbitPaused = false;
        this.mainMenu = new MainMenu(this);
        this.clock = new THREE.Clock();
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Debug State
        this.debugState = {
            planetRing: false,
            planetAxis: false,
            planetToParent: false,
            planetToPlayer: false,
            planetVelocity: false,
            dustVelocity: false
        };

        // Event Listeners
        window.addEventListener('resize', this.onResize.bind(this));
        this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.selectedBody) {
                    this.deselectAll();
                } else {
                    this.mainMenu.toggle();
                }
            }
        });

        // Start animation loop
        this.animate();
    }

    initCelestialBodies() {
        const bodiesMap = new Map();

        solarSystemConfig.forEach(data => {
            const parent = data.parentId ? bodiesMap.get(data.parentId) : null;

            if (data.parentId && !parent) {
                console.warn(`Parent '${data.parentId}' not found for '${data.id}'. Check config order.`);
            }

            const body = new CelestialBody(
                this.scene,
                new THREE.Vector3(0, 0, 0),
                data.sizeRadius,
                data.color,
                data.rotationRadius,
                parent,
                data.orbitDistance,
                data.orbitSpeed,
                data.rotationSpeed,
                data.id,
                data.renderMode || 'lambert_wireframe'
            );

            bodiesMap.set(data.id, body);
            this.celestialBodies.push(body);

            // Special handling for Sun
            if (data.id === 'sun') {
                const sunLight = new THREE.PointLight(0xffffff, 10000, 0);
                sunLight.decay = 2;
                sunLight.castShadow = true;

                sunLight.shadow.mapSize.width = 4096;
                sunLight.shadow.mapSize.height = 4096;
                sunLight.shadow.camera.near = 0.5;
                sunLight.shadow.camera.far = 1000;
                sunLight.shadow.bias = 0;
                sunLight.shadow.normalBias = 0.1;

                body.mesh.add(sunLight);
                body.mesh.castShadow = false;

                if (body.mesh.material) {
                    body.mesh.material.emissive = new THREE.Color(0xffff00);
                    body.mesh.material.emissiveIntensity = 1.0;
                }
            }
        });
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
        this.scene.add(ambientLight);
    }

    setupCamera() {
        this.camera.up.set(0, 1, 0);
        this.camera.position.set(0, 1000, 1);
        this.camera.lookAt(0, 0, 0);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = false;
        this.controls.screenSpacePanning = false;
        this.controls.target.set(0, 0, 0);
        this.controls.maxDistance = 50000;

        // Remap controls: Right click to Rotate
        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };

        // Pointer Lock for Right Click Rotation
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                this.renderer.domElement.requestPointerLock();
            }
        });

        document.addEventListener('mouseup', () => {
            if (document.pointerLockElement === this.renderer.domElement) {
                document.exitPointerLock();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.renderer.domElement) {
                const { movementX, movementY } = e;
                const rotateSpeed = this.controls.rotateSpeed || 1.0;
                const element = this.renderer.domElement;

                const offset = new THREE.Vector3();
                const spherical = new THREE.Spherical();

                offset.copy(this.camera.position).sub(this.controls.target);
                spherical.setFromVector3(offset);

                const deltaTheta = 2 * Math.PI * movementX / element.clientHeight * rotateSpeed;
                const deltaPhi = 2 * Math.PI * movementY / element.clientHeight * rotateSpeed;

                spherical.theta -= deltaTheta;
                spherical.phi -= deltaPhi;

                const minPolarAngle = this.controls.minPolarAngle || 0;
                const maxPolarAngle = this.controls.maxPolarAngle || Math.PI;
                spherical.phi = Math.max(minPolarAngle, Math.min(maxPolarAngle, spherical.phi));

                spherical.makeSafe();

                offset.setFromSpherical(spherical);
                this.camera.position.copy(this.controls.target).add(offset);
                this.camera.lookAt(this.controls.target);
            }
        });

        // Custom Wheel Listener for Zooming while Rotating
        this.renderer.domElement.addEventListener('wheel', (e) => {
            if (e.buttons & 2) {
                e.preventDefault();
                e.stopPropagation();

                const zoomSpeed = this.controls.zoomSpeed || 1.0;
                const delta = -Math.sign(e.deltaY);

                if (delta === 0) return;

                const scale = Math.pow(0.95, zoomSpeed);
                const finalScale = (e.deltaY < 0) ? scale : (1 / scale);

                const offset = new THREE.Vector3().copy(this.camera.position).sub(this.controls.target);
                offset.multiplyScalar(finalScale);

                const dist = offset.length();
                if (dist < this.controls.minDistance) {
                    offset.setLength(this.controls.minDistance);
                } else if (dist > this.controls.maxDistance) {
                    offset.setLength(this.controls.maxDistance);
                }

                this.camera.position.copy(this.controls.target).add(offset);
            }
        }, { passive: false });

        this.controls.update();
    }

    setupUI() {
        // Global controls at the top
        this.topControls = document.createElement('div');
        this.topControls.className = 'top-controls';
        this.topControls.innerHTML = `
            <button id="studio-toggle-orbit-btn" class="control-btn">Pause Orbits</button>
            <button id="studio-reset-orbits-btn" class="control-btn">Reset Orbits</button>
            <button id="studio-save-btn" class="control-btn">Save Config</button>
        `;
        document.body.appendChild(this.topControls);

        // Editor panel
        this.editorPanel = document.createElement('div');
        this.editorPanel.className = 'studio-ui-panel';
        this.editorPanel.style.display = 'none';
        this.editorPanel.innerHTML = `
            <div class="studio-body-editor" id="studio-editor">
                <div class="no-selection">Select a celestial body to edit</div>
            </div>
        `;
        document.body.appendChild(this.editorPanel);

        // Event listeners
        document.getElementById('studio-save-btn').addEventListener('click', () => {
            this.saveConfig();
        });

        const toggleOrbitBtn = document.getElementById('studio-toggle-orbit-btn');
        toggleOrbitBtn.addEventListener('click', () => {
            this.isOrbitPaused = !this.isOrbitPaused;
            toggleOrbitBtn.innerText = this.isOrbitPaused ? 'Play Orbits' : 'Pause Orbits';
        });

        document.getElementById('studio-reset-orbits-btn').addEventListener('click', () => {
            this.resetOrbits();
        });
    }

    showEditor(celestialBody) {
        this.selectedBody = celestialBody;
        this.editorPanel.style.display = 'block';
        this.renderEditor();
    }

    hideEditor() {
        this.editorPanel.style.display = 'none';
    }

    renderEditor() {
        const editor = document.getElementById('studio-editor');
        if (!this.selectedBody) {
            editor.innerHTML = '<div class="no-selection">Select a celestial body to edit</div>';
            return;
        }

        const config = this.getConfigForBody(this.selectedBody);

        if (!config) {
            editor.innerHTML = '<div class="error">Could not find config for this body</div>';
            return;
        }

        let fieldsHtml = '<div class="editor-fields">';

        const fields = [
            { key: 'sizeRadius', label: 'Size', type: 'number' },
            { key: 'color', label: 'Color (Hex)', type: 'hex' },
            { key: 'rotationRadius', label: 'Gravity Radius', type: 'number' },
            { key: 'orbitDistance', label: 'Orbit Distance', type: 'number' },
            { key: 'orbitSpeed', label: 'Orbit Speed', type: 'number' },
            { key: 'rotationSpeed', label: 'Rotation Speed', type: 'number' },
            {
                key: 'renderMode',
                label: 'Render Mode',
                type: 'select',
                options: [
                    { value: 'lambert_wireframe', label: 'Lambert Wireframe' },
                    { value: 'lambert', label: 'Lambert Solid' },
                    { value: 'phong', label: 'Phong' },
                    { value: 'standard', label: 'Standard' },
                    { value: 'toon', label: 'Toon' },
                    { value: 'basic', label: 'Unlit Basic' },
                    { value: 'basic_wireframe', label: 'Basic Wireframe' }
                ]
            }
        ];

        fields.forEach(field => {
            let inputHtml = '';
            if (field.type === 'select') {
                const optionsHtml = field.options.map(opt =>
                    `<option value="${opt.value}" ${config[field.key] === opt.value ? 'selected' : ''}>${opt.label}</option>`
                ).join('');
                inputHtml = `<select data-key="${field.key}">${optionsHtml}</select>`;
            } else {
                const value = field.type === 'hex' ? '#' + config[field.key].toString(16).padStart(6, '0') : config[field.key];
                inputHtml = `<input type="${field.type === 'hex' ? 'color' : 'number'}"
                           data-key="${field.key}"
                           value="${value}"
                           step="${field.type === 'number' ? '0.1' : ''}"
                    >`;
            }

            fieldsHtml += `
                <div class="field-row">
                    <label>${field.label}</label>
                    ${inputHtml}
                </div>
            `;
        });

        fieldsHtml += '</div>';
        editor.innerHTML = `<h4>Editing: ${config.id}</h4>` + fieldsHtml;

        // Add listeners
        const inputs = editor.querySelectorAll('input, select');
        inputs.forEach(input => {
            const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
            input.addEventListener(eventName, (e) => {
                this.updateBody(config, e.target.dataset.key, e.target.value, e.target.type || 'select');
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
        } else if (type === 'select') {
            parsedValue = value;
        }

        config[key] = parsedValue;

        if (key === 'color') {
            this.selectedBody.setColor(parsedValue);
        } else if (key === 'sizeRadius') {
            this.selectedBody.updateSize(parsedValue);
        }

        this.selectedBody.updateConfig(key, parsedValue);
    }

    saveConfig() {
        const stringifyWithHex = (data) => {
            let json = JSON.stringify(data, null, 4);
            return json.replace(/("(?:[a-zA-Z0-9]+)?color(?:[a-zA-Z0-9]+)?"):\s*(\d+)/gi, (match, key, value) => {
                const hexValue = "0x" + parseInt(value).toString(16).padStart(6, '0');
                return `${key}: ${hexValue}`;
            });
        };

        const fileContent = `export const solarSystemConfig = ${stringifyWithHex(solarSystemConfig)};\n\n` +
            `export const dustConfig = ${stringifyWithHex(dustConfig)};`;

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

    getConfigForBody(celestialBody) {
        return solarSystemConfig.find(c => c.id === celestialBody.configId);
    }

    resetOrbits() {
        this.celestialBodies.forEach(body => {
            body.resetOrbit();
        });
    }

    deselectAll() {
        this.celestialBodies.forEach(cb => cb.setSelected(false));
        this.selectedBody = null;
        this.hideEditor();
    }

    onMouseClick(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const meshes = this.celestialBodies.map(cb => cb.mesh);
        const intersects = this.raycaster.intersectObjects(meshes, true);

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;
            const selectedBody = this.celestialBodies.find(cb => {
                let current = hitObject;
                while (current) {
                    if (current === cb.mesh) return true;
                    current = current.parent;
                }
                return false;
            });

            if (selectedBody) {
                this.deselectAll();
                selectedBody.setSelected(true);
                this.selectedBody = selectedBody;
                this.showEditor(selectedBody);
            }
        } else {
            this.deselectAll();
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        if (this.mainMenu && this.mainMenu.isVisible) {
            if (this.particleSystem) {
                this.particleSystem.update(0, this.velocityField, this.celestialBodies, null, this.camera, false);
            }

            this.renderer.clear();
            this.renderer.render(this.scene, this.camera);
            return;
        }

        let delta = this.clock.getDelta();
        if (delta > 0.1) delta = 0.1;

        const time = this.clock.getElapsedTime();

        // Orbital updates
        const orbitDelta = this.isOrbitPaused ? 0 : delta;

        this.celestialBodies.forEach(body => {
            body.update(orbitDelta, null);
        });

        // Follow selected body
        if (this.selectedBody) {
            this.controls.target.copy(this.selectedBody.position);
        }

        this.controls.update();

        // Particle System Update
        const particleDelta = this.isOrbitPaused ? 0 : delta;

        const particleVizItems = this.particleSystem.update(
            particleDelta,
            this.velocityField,
            this.celestialBodies,
            null,
            this.camera,
            this.debugState.dustVelocity
        );

        this.velocityField.updateVisuals(particleVizItems);

        // Render
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
    }
}
