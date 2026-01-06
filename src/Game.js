
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VelocityField } from './objects/VelocityField.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { Player } from './objects/Player.js';
import { CelestialBody } from './objects/CelestialBody.js';
import { Nebula } from './objects/Nebula.js';
import { StudioUI } from './StudioUI.js';
import { MainMenu } from './MainMenu.js';
import { solarSystemConfig, dustConfig, playerConfig } from './config.js';
import { HUD } from './HUD.js';

export class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.backgroundScene = new THREE.Scene(); // For Nebula
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50000); // Increased Far clip for studio view
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false; // Important for multi-pass rendering
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        this.setupLights();

        // Components
        this.velocityField = new VelocityField(this.scene);
        this.particleSystem = new ParticleSystem(this.scene, dustConfig);
        this.player = new Player(this.scene);
        this.nebula = new Nebula(this.scene); // Initialize Nebula with main scene

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
                data.id, // Pass ID
                data.renderMode || 'lambert_wireframe'
            );

            bodiesMap.set(data.id, body);
            this.celestialBodies.push(body);

            // Special handling for Sun
            if (data.id === 'sun') {
                const sunLight = new THREE.PointLight(0xffffff, 10000, 0); // Reduced intensity for better balance
                sunLight.decay = 2; // Physical decay
                sunLight.castShadow = true;

                // Shadow map configuration
                sunLight.shadow.mapSize.width = 4096;
                sunLight.shadow.mapSize.height = 4096;
                sunLight.shadow.camera.near = 0.5;
                sunLight.shadow.camera.far = 1000;
                sunLight.shadow.bias = 0; // Better for high res maps
                sunLight.shadow.normalBias = 0.1; // Offset lookup along normal to fix acne on curves

                body.mesh.add(sunLight);

                // IMPORTANT: Disable shadow casting for the Sun mesh itself to allow light to escape
                body.mesh.castShadow = false;

                // Make Sun mesh emissive
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
        this.mainMenu = new MainMenu(this);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.hud = new HUD(this, this.camera);
        // Initialize HUD with bodies after they are created
        this.hud.init(this.celestialBodies);

        this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));

        this.clock = new THREE.Clock();

        // Debug State
        this.debugState = {
            planetRing: false,
            playerRing: true,
            planetAxis: false,
            playerAxis: true,
            planetToParent: false,
            planetToPlayer: false,
            planetVelocity: false,
            dustVelocity: false,
            playerVortex: true
        };

        this.initDebugUI();

        window.addEventListener('resize', this.onResize.bind(this));

        // Scratch objects
        this._tempSmokeInfluence = new THREE.Vector3();
        this.smokeAccumulator = 0;

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'h') {
                if (this.debugUIContainer) {
                    this.debugUIContainer.style.display = this.debugUIContainer.style.display === 'none' ? 'block' : 'none';
                }
            }
            if (e.key === 'Escape') {
                this.mainMenu.toggle();
            }
        });
    }

    initDebugUI() {
        const container = document.createElement('div');
        this.debugUIContainer = container; // Store reference

        container.style.position = 'absolute';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'; // 50% transparent black
        container.style.padding = '10px';
        container.style.borderRadius = '15px'; // Rounded edges
        container.style.border = '2px solid blue'; // Blue outline
        container.style.color = 'white';
        container.style.fontFamily = 'monospace';
        container.style.zIndex = '1000';
        container.style.display = 'none';

        const title = document.createElement('div');
        title.innerText = 'Debug Options';
        title.style.marginBottom = '5px';
        title.style.fontWeight = 'bold';
        container.appendChild(title);

        this.checkboxes = {};

        const labelMap = {
            dustVelocity: 'Dust Velocity',
            planetAxis: 'Planet Axis',
            planetRing: 'Planet Ring',
            planetToParent: 'Planet to Parent',
            planetToPlayer: 'Planet to Player',
            planetVelocity: 'Planet Velocity',
            playerAxis: 'Player Axis',
            playerRing: 'Player Ring',
            playerVortex: 'Player Vortex'
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

        // Apply initial state
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // Reduced ambient light for space atmosphere
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
        if (!this.controls) {
            this.controls = new OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.enableZoom = true; // Allow scroll zoom
            this.controls.enablePan = false; // Disable panning to keep target centered
            this.controls.screenSpacePanning = false;

            // Remap controls: Right click to Rotate
            this.controls.mouseButtons = {
                LEFT: null,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE
            };

            // Pointer Lock for Right Click Rotation
            // We do NOT disable controls, because we need controls.update() to run for manual rotation to work.
            // OrbitControls ignores mousemove when pointer is locked (clientX/Y are constant).

            this.renderer.domElement.addEventListener('mousedown', (e) => {
                if (e.button === 2) { // Right Click
                    this.renderer.domElement.requestPointerLock();
                }
            });

            document.addEventListener('mouseup', () => {
                // If we are locked and release right click, unlock
                if (document.pointerLockElement === this.renderer.domElement) {
                    document.exitPointerLock();
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (document.pointerLockElement === this.renderer.domElement) {
                    const { movementX, movementY } = e;
                    const rotateSpeed = this.controls.rotateSpeed || 1.0;
                    const element = this.renderer.domElement;

                    // Manual Rotation Logic using Spherical Coordinates
                    const offset = new THREE.Vector3();
                    const spherical = new THREE.Spherical();

                    // 1. Get offset from target
                    offset.copy(this.camera.position).sub(this.controls.target);

                    // 2. Convert to Spherical
                    spherical.setFromVector3(offset);

                    // 3. Apply Deltas
                    // Adjust sign to match desired drag behavior (Drag Left -> Camera Left -> Theta Increases)
                    const deltaTheta = 2 * Math.PI * movementX / element.clientHeight * rotateSpeed; // Left/Right
                    const deltaPhi = 2 * Math.PI * movementY / element.clientHeight * rotateSpeed;   // Up/Down

                    spherical.theta -= deltaTheta;
                    spherical.phi -= deltaPhi;

                    // 4. Clamp Phi (Vertical Angle)
                    const minPolarAngle = this.controls.minPolarAngle || 0;
                    const maxPolarAngle = this.controls.maxPolarAngle || Math.PI;
                    spherical.phi = Math.max(minPolarAngle, Math.min(maxPolarAngle, spherical.phi));

                    spherical.makeSafe();

                    // 5. Apply back to Camera
                    offset.setFromSpherical(spherical);
                    this.camera.position.copy(this.controls.target).add(offset);
                    this.camera.lookAt(this.controls.target);

                    // OrbitControls.update() in loop will handle damping if enabled, but might conflict if we manually set pos?
                    // Usually safe if we update pos, then calling update() will just re-sync.
                }
            });
        }

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

        // Custom Wheel Listener for Zooming while Rotating
        this.renderer.domElement.addEventListener('wheel', (e) => {
            // Check if Right Mouse Button is held (Bitmask 2)
            if (e.buttons & 2) {
                e.preventDefault();
                e.stopPropagation();

                const zoomSpeed = this.controls.zoomSpeed || 1.0;
                const delta = -Math.sign(e.deltaY); // -1 for Zoom OUT (Scroll Down), +1 for Zoom IN (Scroll Up)
                // Note: Standard DeltaY > 0 is Scroll Down.

                if (delta === 0) return;

                // Scale factor: 0.95 ^ speed
                const scale = Math.pow(0.95, zoomSpeed);

                // If Zooming IN (Delta < 0 -> e.deltaY < 0), we want distance to shrink -> multiply by scale < 1.
                // If Zooming OUT (Delta > 0 -> e.deltaY > 0), we want distance to grow -> divide by scale (or mult by 1/scale).

                const finalScale = (e.deltaY < 0) ? scale : (1 / scale);

                const offset = new THREE.Vector3().copy(this.camera.position).sub(this.controls.target);
                offset.multiplyScalar(finalScale);

                // Clamp
                const dist = offset.length();
                if (dist < this.controls.minDistance) {
                    offset.setLength(this.controls.minDistance);
                } else if (dist > this.controls.maxDistance) {
                    offset.setLength(this.controls.maxDistance);
                }

                this.camera.position.copy(this.controls.target).add(offset);

                // Optional: Update controls? 
                // controls.update() will be called in animate loop anyway, which reads camera position.
            }
        }, { passive: false }); // Passive false mostly needed for preventDefault, though 'wheel' is passive by default in some browsers
    }

    start() {
        this.renderer.setAnimationLoop(this.animate.bind(this));
    }


    animate() {
        let delta = this.clock.getDelta();
        // Cap delta to prevent huge jumps on tab resume
        if (delta > 0.1) delta = 0.1;

        if (this.mainMenu && this.mainMenu.isVisible) {
            // Update billboards even during pause if camera orbits
            if (this.particleSystem) {
                this.particleSystem.update(0, this.velocityField, this.celestialBodies, this.player, this.camera, false);
            }

            // Static render
            this.renderer.clear();
            // Nebula background is now scene.background, no manual update/render needed.
            this.renderer.render(this.scene, this.camera);
            return;
        }

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
        } else {
            // Studio Mode Logic
            // Follow selected body if any
            if (this.studioUI && this.studioUI.selectedBody) {
                this.controls.target.copy(this.studioUI.selectedBody.position);
            }
            this.controls.update();
        }

        // Particle System & Velocity Visuals Update (Run in both modes)
        // Use 0 delta if logic should be static but visuals (billboards) should update
        const particleDelta = (this.gameMode === 'studio' && this.isOrbitPaused) ? 0 : delta;

        const particleVizItems = this.particleSystem.update(
            particleDelta,
            this.velocityField,
            this.celestialBodies,
            this.player,
            this.camera,
            this.debugState.dustVelocity
        );

        // Update Velocity Visualization
        let allVizItems = [...particleVizItems];
        if (this.gameMode === 'game') {
            const playerInfluence = this.velocityField.calculateTotalVelocity(this.player.getPosition(), this.celestialBodies, null);
            if (playerInfluence.lengthSq() > 0.01) {
                allVizItems.push({ position: this.player.getPosition().clone(), force: playerInfluence });
            }
        }
        this.velocityField.updateVisuals(allVizItems);

        // --- RENDER PASSES ---
        this.renderer.clear();
        // Background is handled by scene.background

        this.renderer.render(this.scene, this.camera);

        // HUD Pass
        if (this.gameMode === 'game') {
            this.hud.update();
            this.renderer.clearDepth(); // Ensure HUD draws on top
            this.renderer.render(this.hud.scene, this.hud.camera);
        }
    }

    updateGameLogic(delta) {
        // 2. Player Velocity Influence & Update
        const playerInfluence = this.velocityField.calculateTotalVelocity(
            this.player.getPosition(),
            this.celestialBodies,
            null
        );

        this.player.update(delta, playerInfluence, this.celestialBodies, this.particleSystem);

        // 5. Smoke Trails (Moved down, numbered for history)
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
        const currentPlayerPos = this.player.getPosition();
        const deltaPos = currentPlayerPos.clone().sub(this.lastPlayerPos);

        // Update target and camera position to maintain relative offset
        this.controls.target.copy(currentPlayerPos);
        this.camera.position.add(deltaPos);

        this.controls.update();

        this.lastPlayerPos.copy(currentPlayerPos);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.hud && this.hud.onResize) {
            this.hud.onResize(window.innerWidth, window.innerHeight);
        }
    }

    onMouseClick(event) {
        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        if (this.gameMode === 'game') {
            // Check HUD interaction first
            // For Screen Space HUD, we raycast using HUD camera or just 2D check
            this.raycaster.setFromCamera(this.mouse, this.hud.camera);

            // HUD Scene check
            // We need to traverse HUD scene to find hitMeshes.

            // Collect all hit meshes from overlays
            const hitTargets = [];
            this.hud.overlays.forEach(o => {
                if (o.hitMesh) hitTargets.push(o.hitMesh);
            });

            const intersects = this.raycaster.intersectObjects(hitTargets, false);

            if (intersects.length > 0) {
                const hit = intersects[0];
                const target = hit.object.userData.target;
                if (target) {
                    // Update HUD selection
                    this.hud.setSelected(target);
                }
            }
            return;
        }

        if (this.gameMode !== 'studio') return;

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
            this.studioUI.toggleTopControls(true);
            this.player.mesh.visible = false; // Hide player in studio?
        } else {
            this.studioUI.hide();
            this.studioUI.toggleTopControls(false);
            this.player.mesh.visible = true;
            // Reset player position if needed? Or just continue?
            // Maybe reset camera to player logic
        }

        if (this.mainMenu.isVisible) {
            this.mainMenu.hide();
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
