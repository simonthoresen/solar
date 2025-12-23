import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ForceGrid } from './objects/ForceGrid.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { Player } from './objects/Player.js';
import { CelestialBody } from './objects/CelestialBody.js';

export class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        this.setupLights();

        // Components
        this.forceGrid = new ForceGrid(this.scene);
        this.particleSystem = new ParticleSystem(this.scene, 72);
        this.player = new Player(this.scene);

        this.celestialBodies = [];

        // Sun
        const sun = new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 4, 0xffff00, 20);
        this.celestialBodies.push(sun);

        // Mercury
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.4, 0xaaaaaa, 2, sun, 6, 1.5));

        // Venus
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.9, 0xffaa00, 4, sun, 9, 1.2));

        // Earth
        const earth = new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.9, 0x0000ff, 4, sun, 12, 1.0);
        this.celestialBodies.push(earth);
        // Moon
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.2, 0x888888, 1, earth, 1.5, 3.0));

        // Mars
        const mars = new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.5, 0xff0000, 3, sun, 15, 0.8);
        this.celestialBodies.push(mars);
        // Phobos
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.1, 0x666666, 0.5, mars, 0.8, 4.0));
        // Deimos
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.1, 0x555555, 0.5, mars, 1.2, 3.5));

        // Jupiter
        const jupiter = new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 2.2, 0xffaa88, 8, sun, 24, 0.4);
        this.celestialBodies.push(jupiter);
        // Io
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.4, 0xffffaa, 1.5, jupiter, 3.0, 5.0));
        // Europa
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 0.3, 0xaaffff, 1.5, jupiter, 4.0, 4.0));

        // Saturn
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 2.0, 0xeeddcc, 7, sun, 32, 0.3));

        // Uranus
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 1.5, 0xaabbff, 6, sun, 40, 0.2));

        // Neptune
        this.celestialBodies.push(new CelestialBody(this.scene, new THREE.Vector3(0, 0, 0), 1.4, 0x4466ff, 6, sun, 48, 0.15));

        this.setupCamera();
        this.setupControls();

        this.lastPlayerPos = this.player.getPosition().clone();

        this.clock = new THREE.Clock();

        this.debugMode = true; // Default On

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
            body.update(delta);
        });

        // 2. Player Forces & Update
        // Calculate Force on Player (from Bodies, but NOT wake - wake is FROM player)
        // Actually, player is affected by bodies. Wake affects others.
        // We can use ForceGrid.calculateTotalForce for player, but pass 'null' as player arg to avoid self-wake force?
        // Or simply: Player is affected by CelestialBodies.
        const playerForce = this.forceGrid.calculateTotalForce(
            this.player.getPosition(),
            this.celestialBodies,
            null // Player ignores its own wake for movement? Usually yes.
        );

        // Manual update for Player (since signature changed in Player.update to expect grid?)
        // Let's modify Player.update to accept FORCE vector instead of Grid, or Mock the grid?
        // Actually, let's fix Player.js update locally here or update Player.js signature?
        // Optimally, I should update Player.js to accept `externalForce`.
        // For now, I'll pass a mock object or just Update Player.js in Step 2.
        // Wait, I didn't update Player.js `update` method signature in previous steps!
        // Player.update(dt, forceGrid). existing code: const externalForce = forceGrid.getForceAtPosition(...)
        // Since ForceGrid no longer has getForceAtPosition (I removed it!), this will crash.
        // I need to update Player.js `update` method too! 
        // I will do it in a follow up or assume I can hotfix it now.
        // Actually, I can allow Game.js to pass a "Force Provider" or pass the vector directly.
        // Let's assume I will update Player.js to accept the vector.

        // I will use a temporary monkey-patch or better, update Player.js properly in next step.
        // But for now, let's write Game.js assuming Player.update takes (dt, forceVector).
        this.player.update(delta, playerForce);

        // 3. Particle System Update
        // Returns list of { position, force } for visualization
        const particleVizItems = this.particleSystem.update(delta, this.forceGrid, this.celestialBodies, this.player);

        // 4. Visualize Forces
        let allVizItems = [...particleVizItems];
        if (playerForce.lengthSq() > 0.01) {
            allVizItems.push({ position: this.player.getPosition().clone(), force: playerForce });
        }

        this.forceGrid.updateVisuals(allVizItems);

        // Camera follow player logic
        const currentPlayerPos = this.player.getPosition();
        const deltaPos = currentPlayerPos.clone().sub(this.lastPlayerPos);

        this.camera.position.add(deltaPos);
        this.controls.target.add(deltaPos);

        this.controls.update();

        this.lastPlayerPos.copy(currentPlayerPos);

        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
