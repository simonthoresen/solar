
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VelocityField } from './objects/VelocityField.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { Player } from './objects/Player.js';
import { CelestialBody } from './objects/CelestialBody.js';
import { Nebula } from './objects/Nebula.js';
import { StudioUI } from './StudioUI.js';
import { solarSystemConfig, dustConfig, playerConfig } from './config.js';

export class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.backgroundScene = new THREE.Scene(); // For Nebula
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50000); // Increased Far clip for studio view
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false; // Important for multi-pass rendering
        document.body.appendChild(this.renderer.domElement);

        this.setupLights();

        // Components
        this.velocityField = new VelocityField(this.scene);
        this.particleSystem = new ParticleSystem(this.scene, dustConfig);
        this.player = new Player(this.scene);
        this.nebula = new Nebula(this.backgroundScene); // Initialize Nebula

        this.celestialBodies = [];

        // Initialize Celestial Bodies from Config
        const bodiesMap = new Map();

        solarSystemConfig.forEach(data => {
            const parent = data.parentId ? bodiesMap.get(data.parentId) : null;

            // If parent is specified but not found yet, we might need a multi-pass or topological sort.
            // For now, config is ordered parents-first.
            // A simple check: if parentId exists but parent is null, it's an issue with order.
            if (data.parentId && !parent) {
                console.warn(`Parent '${data.parentId}' not found for '${data.id}'.Check config order.`);
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
                data.id // Pass ID
            );

            bodiesMap.set(data.id, body);
            this.celestialBodies.push(body);

            // Special handling for Sun
            if (data.id === 'sun') {
                const sunLight = new THREE.PointLight(0xffffff, 2500, 0); // High intensity (2500), Infinite range (0)
                body.mesh.add(sunLight);

                // Make Sun mesh emissive so it looks bright even if not lit by itself (which works for Basic/Lambert, but ensuring visuals)
                // CelestialBody uses MeshLambertMaterial (based on previous edits/assumptions, or let's verify).
                // If it uses Lambert, it reacts to light. Emissive helps it look like a source.
                if (body.mesh.material) {
                    body.mesh.material.emissive = new THREE.Color(0xffff00);
                    body.mesh.material.emissiveIntensity = 1.0;
                }
            }
        });

        this.setupCamera();
        this.setupControls();

        this.lastPlayerPos = this.player.getPosition().clone();

        this.gameMode = 'game';
        this.isOrbitPaused = false;
        this.studioUI = new StudioUI(this);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));

        this.clock = new THREE.Clock();

        // Debug State
        this.debugState = {
            rings: false,
            axis: false,
            planetToParent: false,
            planetToPlayer: false,
            planetVelocity: false,
            dustVelocity: false,
            vortex: false
        };

        this.initDebugUI();

        window.addEventListener('resize', this.onResize.bind(this));

        // Scratch objects
        this._tempSmokeInfluence = new THREE.Vector3();
        this.smokeAccumulator = 0;

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'h') {
                this.handleMasterToggle();
            }
        });
    }

    initDebugUI() {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        container.style.padding = '10px';
        container.style.borderRadius = '5px';
        container.style.color = 'white';
        container.style.fontFamily = 'monospace';
        container.style.zIndex = '1000';
        container.style.display = 'block';

        const title = document.createElement('div');
        title.innerText = 'Debug Options';
        title.style.marginBottom = '5px';
        title.style.fontWeight = 'bold';
        container.appendChild(title);

        this.checkboxes = {};

        const labelMap = {
            rings: 'Rings',
            axis: 'Axis',
            planetToParent: 'Planet to Parent',
            planetToPlayer: 'Planet to Player',
            planetVelocity: 'Planet Velocity',
            dustVelocity: 'Dust Velocity',
            vortex: 'Vortex'
        };

        Object.keys(this.debugState).forEach(key => {
            const row = document.createElement('div');
            row.style.marginBottom = '2px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `debug-${key}`;
            checkbox.checked = this.debugState[key];
            checkbox.style.marginRight = '5px';
            checkbox.style.cursor = 'pointer';

            checkbox.addEventListener('change', (e) => {
                this.debugState[key] = e.target.checked;
                this.updateDebugVisibility();
            });

            const label = document.createElement('label');
            label.htmlFor = `debug-${key}`;
            label.innerText = labelMap[key] || key;
            label.style.cursor = 'pointer';

            row.appendChild(checkbox);
            row.appendChild(label);
            container.appendChild(row);

            this.checkboxes[key] = checkbox;
        });

        document.body.appendChild(container);
    }

    handleMasterToggle() {
        // If any is true -> set all false
        // If all false -> set all true
        const anyEnabled = Object.values(this.debugState).some(v => v);

        const newState = !anyEnabled;

        Object.keys(this.debugState).forEach(key => {
            this.debugState[key] = newState;
            if (this.checkboxes[key]) {
                this.checkboxes[key].checked = newState;
            }
        });

        this.updateDebugVisibility();
    }

    updateDebugVisibility() {
        if (this.player.setDebugVisibility) {
            this.player.setDebugVisibility(this.debugState);
        }

        // Force Grid Arrows (Now Velocity Field Arrows)
        this.velocityField.setVisible(this.debugState.dustVelocity);

        // Celestial Rings
        this.celestialBodies.forEach(body => {
            body.setDebugVisibility(this.debugState);
        });
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
        this.scene.add(ambientLight);
    }

    setupCamera() {
        this.camera.up.set(0, 1, 0); // Enforce Y-up to prevent roll
        if (this.gameMode === 'game') {
            // Initial camera position relative to player
            const pPos = this.player.getPosition();
            this.camera.position.set(pPos.x, pPos.y + 10, pPos.z + 20); // Behind and above
            this.camera.lookAt(pPos);
        } else {
            // Studio Mode: Top down, far away
            // Offset Z slightly to avoid LookAt(0,0,0) singularity with Up(0,1,0)
            this.camera.position.set(0, 1000, 1);
            this.camera.lookAt(0, 0, 0);
        }
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true; // Allow scroll zoom
        this.controls.enablePan = false; // Disable panning to keep target centered
        this.controls.screenSpacePanning = false;

        if (this.gameMode === 'game') {
            // Target the player
            this.controls.target.copy(this.player.getPosition());
            this.controls.maxDistance = 500;
        } else {
            // Target center initially
            this.controls.target.set(0, 0, 0);
            this.controls.maxDistance = 50000;
        }

        this.controls.update();
    }

    start() {
        this.renderer.setAnimationLoop(this.animate.bind(this));
    }


    animate() {
        let delta = this.clock.getDelta();
        // Cap delta to prevent huge jumps on tab resume
        if (delta > 0.1) delta = 0.1;
        const time = this.clock.getElapsedTime();

        // 1. Orbital updates (Run in both modes to see effects)
        // Use 0 delta if paused in studio
        let orbitDelta = delta;
        if (this.gameMode === 'studio' && this.isOrbitPaused) {
            orbitDelta = 0;
        }

        this.celestialBodies.forEach(body => {
            body.update(orbitDelta, this.player);
        });

        if (this.gameMode === 'game') {
            this.updateGameLogic(delta);
            this.controls.target.copy(this.player.getPosition());
        } else {
            // Studio Mode Logic
            // Follow selected body if any
            if (this.studioUI && this.studioUI.selectedBody) {
                this.controls.target.copy(this.studioUI.selectedBody.position);
            }
            this.controls.update();
        }

        // --- RENDER PASSES ---
        this.renderer.clear();

        if (this.gameMode === 'game') {
            this.nebula.update(this.camera.position);
            this.renderer.render(this.backgroundScene, this.camera);
            this.renderer.clearDepth();
        }

        this.renderer.render(this.scene, this.camera);
    }

    updateGameLogic(delta) {
        // 2. Player Velocity Influence & Update
        const playerInfluence = this.velocityField.calculateTotalVelocity(
            this.player.getPosition(),
            this.celestialBodies,
            null
        );

        this.player.update(delta, playerInfluence, this.celestialBodies, this.particleSystem);


        // 3. Particle System Update
        const particleVizItems = this.particleSystem.update(
            delta,
            this.velocityField,
            this.celestialBodies,
            this.player,
            this.camera, // Pass camera for billboards
            this.debugState.dustVelocity // Pass debug flag
        );

        // 4. Visualize Velocities
        let allVizItems = [...particleVizItems];
        if (playerInfluence.lengthSq() > 0.01) {
            allVizItems.push({ position: this.player.getPosition().clone(), force: playerInfluence });
        }

        this.velocityField.updateVisuals(allVizItems);

        // 5. Smoke Trails
        if (this.player.keys.w) {
            this.smokeAccumulator += delta;
            if (this.smokeAccumulator >= playerConfig.smokeEmissionInterval) {
                this.smokeAccumulator = 0; // Reset accumulator

                const wakePos = this.player.getRandomWakePosition();

                // Calculate field influence at this position
                this.velocityField.calculateTotalVelocity(
                    wakePos,
                    this.celestialBodies,
                    null, // Do not include player/vortex in initial influence. Let it lerp in.
                    this._tempSmokeInfluence
                );

                this.particleSystem.spawnSmoke(wakePos, this._tempSmokeInfluence, this.camera);
            }
        } else {
            // Reset to interval so it spawns immediately when pressing W
            this.smokeAccumulator = playerConfig.smokeEmissionInterval;
        }

        // Camera follow update
        // We do NOT manually move the camera position here for 'follow', 
        // OrbitControls handles position relative to target if we update target.
        // BUT standard OrbitControls doesn't automatically move camera WITH target (it just pivots).
        // To make camera "follow" the player (maintain relative offset), we need to shift camera too.

        const currentPlayerPos = this.player.getPosition();
        const deltaPos = currentPlayerPos.clone().sub(this.lastPlayerPos);

        // Add delta to Camera position to maintain relative offset
        this.camera.position.add(deltaPos);

        // Target is updated in animate loop for robustness, but we can do it here too/instead.
        // animate loop does: this.controls.target.copy(this.player.getPosition());

        this.controls.update();

        this.lastPlayerPos.copy(currentPlayerPos);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseClick(event) {
        if (this.gameMode !== 'studio') return;

        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Intersect with celestial bodies
        // accessing mesh property of CelestialBody
        const meshes = this.celestialBodies.map(cb => cb.mesh);
        const intersects = this.raycaster.intersectObjects(meshes, true);

        if (intersects.length > 0) {
            // Find the CelestialBody corresponding to the mesh
            // We need to traverse up to find the root mesh if we hit a child (like a ring or detail)
            // But CelestialBody stores the mesh. 
            // Better: find which CelestialBody holds this mesh.

            const hitObject = intersects[0].object;
            const selectedBody = this.celestialBodies.find(cb => {
                // Check if hitObject is the mesh or a child of the mesh
                let current = hitObject;
                while (current) {
                    if (current === cb.mesh) return true;
                    current = current.parent;
                }
                return false;
            });

            if (selectedBody) {
                console.log("Selected:", selectedBody);

                // Deselect previous
                if (this.studioUI.selectedBody) {
                    this.studioUI.selectedBody.setSelected(false);
                }

                selectedBody.setSelected(true);
                this.studioUI.show(selectedBody);
            }
        } else {
            // Clicked empty space
            if (this.studioUI.selectedBody) {
                this.studioUI.selectedBody.setSelected(false);
            }
            this.studioUI.hide();
        }
    }

    // Helpers for StudioUI to get config
    getConfigForBody(celestialBody) {
        return solarSystemConfig.find(c => c.id === celestialBody.configId) ||
            // Fallback if we didn't store ID on body. 
            // We should probably store the ID on the body during creation.
            // Let's check CelestialBody.js to see if it has 'id' or we can match by reference?
            // Creating a map might be better, or just adding the ID to the body.
            // For now, let's assume we can match by reference from our initial map or I'll add the ID to CelestialBody.
            null;
    }

    getAllBodyConfigs() {
        return solarSystemConfig;
    }

    setMode(mode) {
        this.gameMode = mode;
        this.setupCamera();
        this.setupControls();

        if (mode === 'studio') {
            this.studioUI.container.style.display = 'block'; // Make sure UI is back if we return
            this.player.mesh.visible = false; // Hide player in studio?
        } else {
            this.studioUI.hide();
            this.player.mesh.visible = true;
            // Reset player position if needed? Or just continue?
            // Maybe reset camera to player logic
        }
    }

    toggleOrbitPause() {
        this.isOrbitPaused = !this.isOrbitPaused;
        return this.isOrbitPaused;
    }

    resetOrbits() {
        this.celestialBodies.forEach(body => {
            body.resetOrbit();
        });
    }
}
