
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ForceGrid } from './objects/ForceGrid.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { Player } from './objects/Player.js';
import { CelestialBody } from './objects/CelestialBody.js';
import { Nebula } from './objects/Nebula.js'; // Added
import { solarSystemConfig, starfieldConfig } from './config.js';

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
        this.forceGrid = new ForceGrid(this.scene);
        this.particleSystem = new ParticleSystem(this.scene, starfieldConfig);
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
                data.radius,
                data.color,
                data.forceRadius,
                parent,
                data.orbitDistance,
                data.orbitSpeed
            );

            bodiesMap.set(data.id, body);
            this.celestialBodies.push(body);
        });

        this.setupCamera();
        this.setupControls();

        this.lastPlayerPos = this.player.getPosition().clone();

        this.clock = new THREE.Clock();

        this.debugMode = false; // Default Off

        window.addEventListener('resize', this.onResize.bind(this));

        // Debug Toggle
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'h') {
                this.toggleDebug();
            }
        });
    }

    toggleDebug() {
        this.debugMode = !this.debugMode;

        // Player Axes
        this.player.setDebugVisibility(this.debugMode);

        // Force Grid Arrows
        this.forceGrid.setVisible(this.debugMode);

        // Celestial Rings
        this.celestialBodies.forEach(body => {
            body.setDebugVisibility(this.debugMode);
        });
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7);
        this.scene.add(directionalLight);
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
        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        // 1. Orbital updates
        this.celestialBodies.forEach(body => {
            body.update(delta, this.player.getPosition());
        });

        // 2. Player Forces & Update
        const playerForce = this.forceGrid.calculateTotalForce(
            this.player.getPosition(),
            this.celestialBodies,
            null
        );

        this.player.update(delta, playerForce);


        // 3. Particle System Update
        const particleVizItems = this.particleSystem.update(delta, this.forceGrid, this.celestialBodies, this.player);

        // 4. Visualize Forces
        let allVizItems = [...particleVizItems];
        if (playerForce.lengthSq() > 0.01) {
            allVizItems.push({ position: this.player.getPosition().clone(), force: playerForce });
        }

        this.forceGrid.updateVisuals(allVizItems);

        // 5. Smoke Trails
        if (this.player.keys.w) {
            if (Math.random() < 0.5) {
                this.particleSystem.spawnSmoke(this.player.getRandomWakePosition());
            }
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
