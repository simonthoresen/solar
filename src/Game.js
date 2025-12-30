
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VelocityField } from './objects/VelocityField.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { Player } from './objects/Player.js';
import { CelestialBody } from './objects/CelestialBody.js';
import { Nebula } from './objects/Nebula.js';
import { solarSystemConfig, dustConfig, playerConfig } from './config.js';

export class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.backgroundScene = new THREE.Scene(); // For Nebula
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
                data.orbitSpeed
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

        this.clock = new THREE.Clock();

        // Debug State
        this.debugState = {
            rings: false,
            axis: false,
            planetToParent: false,
            planetToPlayer: false,
            planetVelocity: false,
            dustVelocity: false
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
            dustVelocity: 'Dust Velocity'
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
            this.player.setDebugVisibility(this.debugState.player || this.debugState.axis);
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
        // Initial camera position relative to player
        const pPos = this.player.getPosition();
        this.camera.position.set(pPos.x, pPos.y + 10, pPos.z + 10);
        this.camera.lookAt(pPos);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;

        // Target the player
        this.controls.target.copy(this.player.getPosition());
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

        // 1. Orbital updates
        this.celestialBodies.forEach(body => {
            body.update(delta, this.player);
        });

        // 2. Player Velocity Influence & Update
        const playerInfluence = this.velocityField.calculateTotalVelocity(
            this.player.getPosition(),
            this.celestialBodies,
            null
        );

        this.player.update(delta, playerInfluence);


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
                    this.player, // Should player influence smoke? Maybe not self? But usually yes for consistency. 
                    this._tempSmokeInfluence
                );
                // Actually, if we want them to snap to "computed velocity of the point", that implies the field.
                // Does player influence the field? Yes, but usually at the wake position (behind player) player influence might be strong/weird?
                // Dust particles update uses 'player' in calculateTotalVelocity.
                // So we should probably include it for consistency.

                this.particleSystem.spawnSmoke(wakePos, this._tempSmokeInfluence);
            }
        } else {
            this.smokeAccumulator = playerConfig.smokeEmissionInterval; // Valid to spawn immediately on next press? Or reset to 0? 
            // Let's reset to interval so it spawns immediately when pressing W
            this.smokeAccumulator = playerConfig.smokeEmissionInterval;
        }

        // Camera follow player logic
        const currentPlayerPos = this.player.getPosition();
        const deltaPos = currentPlayerPos.clone().sub(this.lastPlayerPos);

        this.camera.position.add(deltaPos);
        this.controls.target.add(deltaPos);

        this.controls.update();

        this.lastPlayerPos.copy(currentPlayerPos);

        // --- RENDER PASSES ---
        this.renderer.clear();
        this.nebula.update(this.camera.position);
        this.renderer.render(this.backgroundScene, this.camera);
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
