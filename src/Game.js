
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VelocityField } from './objects/VelocityField.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { ProjectileSystem } from './objects/ProjectileSystem.js';
import { Player } from './objects/Player.js';
import { NPC } from './objects/NPC.js';
import { CelestialBody } from './objects/CelestialBody.js';
import { Nebula } from './objects/Nebula.js';
import { MainMenu } from './MainMenu.js';
import { solarSystemConfig, dustConfig, playerConfig } from './config.js';
import { HUD } from './HUD.js';
import { DetailPanel } from './DetailPanel.js';
import { ArrowKeyCameraRotation, PointerLockCameraRotation, ZoomWhileRotating } from './utils/CameraControls.js';
import { DebugState } from './DebugState.js';

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
        this.projectileSystem = new ProjectileSystem(this.scene);
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

        // Initialize NPCs - create one of each type
        this.npcs = [];
        const npcTypes = ['hopper', 'speedster', 'kamikaze', 'shooter', 'follower'];
        npcTypes.forEach(type => {
            // Random position away from center but within reasonable bounds
            // Solar systems can be large, Player starts at 0,0,15.
            const angle = Math.random() * Math.PI * 2;
            const dist = 50 + Math.random() * 50; // 50-100 units away
            const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

            const npc = new NPC(this.scene, type, pos, this.celestialBodies, this.player);
            this.npcs.push(npc);
        });

        this.setupCamera();
        this.setupControls();

        this.lastPlayerPos = this.player.getPosition().clone();

        // Assign Physics Callbacks
        this.player.onExplode = this.handleShipExplosion.bind(this);
        this.npcs.forEach(npc => npc.onExplode = this.handleShipExplosion.bind(this));
        // Hook new NPCs in spawnRandomNPC too

        this.mainMenu = new MainMenu(this);
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.hud = new HUD(this, this.camera);
        // Initialize HUD with bodies after they are created
        this.hud.init(this.celestialBodies);
        this.hud.addPlayer(this.player);

        // Add NPCs to HUD
        this.npcs.forEach(npc => {
            this.hud.addSpaceship(npc);
        });

        this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));

        this.detailPanel = new DetailPanel(this);

        this.clock = new THREE.Clock();

        // Debug State is now global via DebugState singleton

        this.initDebugUI();

        window.addEventListener('resize', this.onResize.bind(this));

        // Scratch objects
        this._tempSmokeInfluence = new THREE.Vector3();
        this.smokeAccumulator = 0;
        this.playerRespawnTimer = 3.0;
        this.isPlayerRespawning = false;
        this.respawnTransitionTimer = 0;
        this.respawnTransitionDuration = 1.5; // Smooth transition over 1.5 seconds
        this.respawnStartCameraPos = new THREE.Vector3();
        this.respawnStartCameraQuat = new THREE.Quaternion();
        this.respawnTargetCameraPos = new THREE.Vector3();
        this.respawnTargetCameraQuat = new THREE.Quaternion();

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'h') {
                if (this.debugUIContainer) {
                    this.debugUIContainer.style.display = this.debugUIContainer.style.display === 'none' ? 'block' : 'none';
                }
            }
            if (e.key === 'Escape') {
                const hasSelection = (this.player && this.player.getSelectedItem());
                if (hasSelection) {
                    this.deselectAll();
                } else {
                    this.mainMenu.toggle();
                }
            }
            if (e.key === 'Backspace') {
                if (this.player && this.player.isActive) {
                    this.player.takeDamage(Infinity);
                }
            }
            if (e.key === 'Tab') {
                e.preventDefault(); // Prevent default tab behavior
                this.selectNearestItem();
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
            playerAxis: 'Ship Axis',
            playerRing: 'Ship Ring',
            shipExhaust: 'Ship Exhaust'
        };

        // Sort keys alphabetically by their label
        const sortedKeys = Object.keys(DebugState.getAll()).sort((a, b) => {
            const labelA = labelMap[a] || a;
            const labelB = labelMap[b] || b;
            return labelA.localeCompare(labelB);
        });

        sortedKeys.forEach(key => {
            const row = document.createElement('div');
            row.style.marginBottom = '2px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `debug-${key}`;
            checkbox.checked = DebugState.get(key);
            checkbox.style.marginRight = '5px';
            checkbox.style.cursor = 'pointer';

            checkbox.addEventListener('change', (e) => {
                DebugState.set(key, e.target.checked);
                // Update velocity field visibility directly
                if (key === 'dustVelocity') {
                    this.velocityField.setVisible(e.target.checked);
                }
                // Entities will update themselves on their next update() call
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


    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // Reduced ambient light for space atmosphere
        this.scene.add(ambientLight);
    }

    setupCamera() {
        this.camera.up.set(0, 1, 0); // Enforce Y-up to prevent roll
        // Initial camera position relative to player
        const pPos = this.player.getPosition();
        this.camera.position.set(pPos.x, pPos.y + 10, pPos.z + 20); // Behind and above
        this.camera.lookAt(pPos);
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

            // Initialize camera controls
            this.arrowKeyRotation = new ArrowKeyCameraRotation(this.camera, this.controls, 2.0);
            this.pointerLockRotation = new PointerLockCameraRotation(this.camera, this.controls, this.renderer);
            this.zoomWhileRotating = new ZoomWhileRotating(this.camera, this.controls, this.renderer);
        }

        // Target the player
        this.controls.target.copy(this.player.getPosition());
        this.controls.maxDistance = 500;

        this.controls.update();
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
                const allShips = [this.player, ...this.npcs];
                this.particleSystem.update(0, this.velocityField, this.celestialBodies, allShips, this.camera, false);
            }

            // Static render
            this.renderer.clear();
            // Nebula background is now scene.background, no manual update/render needed.
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const time = this.clock.getElapsedTime();

        // Orbital updates
        this.celestialBodies.forEach(body => {
            body.update(delta, this.player);
        });

        this.updateGameLogic(delta);

        // Particle System & Velocity Visuals Update
        // Pass all ships (player + NPCs) so exhaust fields from all ships affect particles
        const allShips = [this.player, ...this.npcs];
        const particleVizItems = this.particleSystem.update(
            delta,
            this.velocityField,
            this.celestialBodies,
            allShips,
            this.camera,
            DebugState.get('dustVelocity')
        );

        // Update Velocity Visualization
        let allVizItems = [...particleVizItems];
        const playerInfluence = this.velocityField.calculateTotalVelocity(this.player.getPosition(), this.celestialBodies, null);
        if (playerInfluence.lengthSq() > 0.01) {
            allVizItems.push({ position: this.player.getPosition().clone(), force: playerInfluence });
        }
        this.velocityField.updateVisuals(allVizItems);

        // --- RENDER PASSES ---
        this.renderer.clear();
        // Background is handled by scene.background

        this.renderer.render(this.scene, this.camera);

        // HUD Pass
        this.hud.update();
        this.renderer.clearDepth(); // Ensure HUD draws on top
        this.renderer.render(this.hud.scene, this.hud.camera);

        // Detail Panel 3D Preview Update
        if (this.detailPanel) {
            this.detailPanel.update(delta);
        }
    }

    updateGameLogic(delta) {
        this.checkRespawns(delta);
        const allShips = [this.player, ...this.npcs];

        this.projectileSystem.update(delta, this.celestialBodies, allShips, this.particleSystem);

        // Player Updates
        this.player.update(
            delta,
            this.velocityField, // Pass Field directly now
            this.celestialBodies,
            this.particleSystem,
            this.projectileSystem, // Pass Projectile System
            this.camera,
            allShips
        );

        // Update NPCs
        this.npcs.forEach(npc => {
            npc.update(
                delta,
                this.velocityField,
                this.celestialBodies,
                this.particleSystem,
                this.projectileSystem, // Pass Projectile System
                this.camera,
                allShips
            );
        });

        // Check ship-to-ship collisions
        this.checkShipCollisions(allShips);

        // Legacy smoke code removed (now in Spaceship.update)

        // Camera follow update
        const currentPlayerPos = this.player.getPosition();

        // Handle respawn transition smoothly
        if (this.isPlayerRespawning) {
            this.respawnTransitionTimer += delta;
            const t = Math.min(this.respawnTransitionTimer / this.respawnTransitionDuration, 1.0);

            // Smooth easing function (ease-in-out cubic for smooth start and end)
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            // Smoothly interpolate position to maintain distance
            this.camera.position.lerpVectors(this.respawnStartCameraPos, this.respawnTargetCameraPos, eased);

            // Smoothly interpolate rotation using quaternion slerp
            this.camera.quaternion.slerpQuaternions(this.respawnStartCameraQuat, this.respawnTargetCameraQuat, eased);

            // Smoothly lerp the controls target to player position
            this.controls.target.lerp(currentPlayerPos, eased);

            // Update lastPlayerPos
            this.lastPlayerPos.lerp(currentPlayerPos, eased);

            // End transition
            if (t >= 1.0) {
                this.isPlayerRespawning = false;
                this.lastPlayerPos.copy(currentPlayerPos);
                this.controls.target.copy(currentPlayerPos);
            }
        } else {
            // Normal camera follow
            const deltaPos = currentPlayerPos.clone().sub(this.lastPlayerPos);

            // Update target and camera position to maintain relative offset
            this.controls.target.copy(currentPlayerPos);
            this.camera.position.add(deltaPos);

            this.lastPlayerPos.copy(currentPlayerPos);
        }

        // Arrow key camera rotation
        if (this.arrowKeyRotation) {
            this.arrowKeyRotation.update(delta);
        }

        this.controls.update();
    }

    checkRespawns(dt) {
        // Player Logic
        if (!this.player.isActive) {
            // Hide detail panel when player dies
            if (this.detailPanel && this.detailPanel.isVisible) {
                this.detailPanel.hide();
            }

            this.playerRespawnTimer -= dt;
            if (this.playerRespawnTimer <= 0) {
                // Respawn
                this.player.isActive = true;
                this.player.health = this.player.maxHealth;
                this.player.shield = this.player.maxShield;
                this.player.mesh.visible = true;
                this.player.velocity.set(0, 0, 0);

                // Random pos in dust (Radius ~50-80)
                const angle = Math.random() * Math.PI * 2;
                const dist = 50 + Math.random() * 30;
                this.player.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
                this.player.mesh.position.copy(this.player.position);

                // Start smooth camera transition - compute start and target states once
                this.isPlayerRespawning = true;
                this.respawnTransitionTimer = 0;

                // Store starting camera state
                this.respawnStartCameraPos.copy(this.camera.position);
                this.respawnStartCameraQuat.copy(this.camera.quaternion);

                const newPlayerPos = this.player.getPosition();

                // Calculate target camera position to maintain same distance in XZ plane
                // Preserve Y coordinate from starting position
                const currentCameraPos2D = new THREE.Vector2(this.camera.position.x, this.camera.position.z);
                const currentTarget2D = new THREE.Vector2(this.controls.target.x, this.controls.target.z);
                const desiredDistance = currentCameraPos2D.distanceTo(currentTarget2D);

                // Direction in XZ plane only: from new player position to current camera position
                const directionToCamera2D = new THREE.Vector2(
                    this.camera.position.x - newPlayerPos.x,
                    this.camera.position.z - newPlayerPos.z
                );
                directionToCamera2D.normalize();

                // Target position: new player position + direction * desired distance (XZ only)
                this.respawnTargetCameraPos.set(
                    newPlayerPos.x + directionToCamera2D.x * desiredDistance,
                    this.respawnStartCameraPos.y, // Preserve Y coordinate
                    newPlayerPos.z + directionToCamera2D.y * desiredDistance
                );

                // Calculate target camera orientation (looking at player)
                const tempCam = new THREE.Object3D();
                tempCam.position.copy(this.respawnTargetCameraPos);
                tempCam.lookAt(newPlayerPos);
                this.respawnTargetCameraQuat.copy(tempCam.quaternion);

                // Debug visuals will be applied automatically on next update()

                this.playerRespawnTimer = 3.0;
            }
        } else {
            this.playerRespawnTimer = 3.0; // Reset timer while alive
        }

        // NPC Logic
        for (let i = this.npcs.length - 1; i >= 0; i--) {
            const npc = this.npcs[i];
            if (!npc.isActive) {
                // Destroy Logic
                if (this.hud) this.hud.removeSpaceship(npc);

                this.scene.remove(npc.mesh);
                if (npc.playerLine) this.scene.remove(npc.playerLine);

                this.npcs.splice(i, 1);

                // Respawn new one immediately (or after delay, but user said "a new random npc should spawn")
                this.spawnRandomNPC();
            }
        }
    }

    spawnRandomNPC() {
        const npcTypes = ['hopper', 'speedster', 'kamikaze', 'shooter', 'follower'];
        const type = npcTypes[Math.floor(Math.random() * npcTypes.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 50;
        const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

        const npc = new NPC(this.scene, type, pos, this.celestialBodies, this.player);
        // Re-bind onExplode (referencing local function from constructor is hard here. easier to make it a method)
        npc.onExplode = this.handleShipExplosion.bind(this);

        // Debug visuals will be applied automatically on next update()

        this.npcs.push(npc);
        if (this.hud) this.hud.addSpaceship(npc);
    }

    handleShipExplosion(pos, radius) {
        const allShips = [this.player, ...this.npcs];
        const forceStrength = 500.0; // Strong impulse to be clearly visible
        const radiusSq = radius * radius;
        const _tempVec = new THREE.Vector3();

        allShips.forEach(ship => {
            if (!ship.isActive) return;

            const distSq = ship.position.distanceToSquared(pos);
            if (distSq < radiusSq && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                _tempVec.subVectors(ship.position, pos).normalize();
                const falloff = 1.0 - (dist / radius);

                if (falloff > 0) {
                    ship.applyImpulse(_tempVec.multiplyScalar(forceStrength * falloff));
                }
            }
        });
    }

    checkShipCollisions(allShips) {
        // Check all pairs of ships for collision
        for (let i = 0; i < allShips.length; i++) {
            const shipA = allShips[i];
            if (!shipA.isActive || shipA.collisionCooldown > 0) continue;

            for (let j = i + 1; j < allShips.length; j++) {
                const shipB = allShips[j];
                if (!shipB.isActive || shipB.collisionCooldown > 0) continue;

                // Check if collision spheres intersect
                const distance = shipA.position.distanceTo(shipB.position);
                const collisionDistance = shipA.collisionRadius + shipB.collisionRadius;

                if (distance < collisionDistance) {
                    // Collision detected - apply damage to both ships
                    shipA.takeDamage(25);
                    shipB.takeDamage(25);

                    // Set cooldown to prevent continuous damage (0.5 seconds)
                    shipA.collisionCooldown = 0.5;
                    shipB.collisionCooldown = 0.5;

                    // Apply physics separation - push ships apart
                    const overlap = collisionDistance - distance;

                    // Calculate normal from A to B
                    const normal = new THREE.Vector3();
                    normal.subVectors(shipB.position, shipA.position);

                    if (distance > 0.001) {
                        normal.divideScalar(distance); // Normalize
                    } else {
                        // Ships are exactly on top of each other, push in random direction
                        normal.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
                    }

                    // Push ships apart by half the overlap each
                    shipA.position.addScaledVector(normal, -overlap * 0.5);
                    shipB.position.addScaledVector(normal, overlap * 0.5);

                    // Apply velocity impulse - bounce apart
                    const bounceStrength = 20.0; // Adjust for desired bounce intensity
                    const relativeVelocity = new THREE.Vector3().subVectors(shipB.velocity, shipA.velocity);
                    const velocityAlongNormal = relativeVelocity.dot(normal);

                    // Only apply impulse if ships are moving toward each other
                    if (velocityAlongNormal < 0) {
                        const impulse = normal.clone().multiplyScalar(bounceStrength);
                        shipA.velocity.sub(impulse);
                        shipB.velocity.add(impulse);
                    }
                }
            }
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.hud && this.hud.onResize) {
            this.hud.onResize(window.innerWidth, window.innerHeight);
        }
    }

    deselectAll() {
        // Clear player's selection (which will deselect the item)
        if (this.player) {
            this.player.clearSelection();
        }

        // Hide detail panel
        if (this.detailPanel) {
            this.detailPanel.hide();
        }
    }

    selectNearestItem() {
        // Collect all selectable items
        const selectableItems = [];

        // Add celestial bodies
        this.celestialBodies.forEach(body => {
            selectableItems.push({
                object: body,
                position: body.position
            });
        });

        // Add NPCs
        this.npcs.forEach(npc => {
            if (npc.isActive) {
                selectableItems.push({
                    object: npc,
                    position: npc.position
                });
            }
        });

        // Don't add player - Tab should only select external targets

        if (selectableItems.length === 0) return;

        // Find nearest item to player position
        const playerPos = this.player.getPosition();
        let nearest = null;
        let minDistance = Infinity;

        selectableItems.forEach(item => {
            const distance = playerPos.distanceTo(item.position);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = item;
            }
        });

        if (nearest) {
            const target = nearest.object;

            // If already selected, do nothing
            if (this.player.getSelectedItem() === target) {
                return;
            }

            // Deselect current
            this.deselectAll();

            // Select nearest using player's selection
            this.player.setSelectedItem(target);

            if (this.detailPanel) {
                this.detailPanel.show(target);
            }
        }
    }

    onMouseClick(event) {
        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Check HUD interaction
        this.raycaster.setFromCamera(this.mouse, this.hud.camera);

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
                // If already selected, do nothing
                if (this.player.getSelectedItem() === target) {
                    return;
                }

                // Deselect current
                this.deselectAll();

                // Select using player's selection
                this.player.setSelectedItem(target);

                // Show Detail Panel
                if (this.detailPanel) {
                    this.detailPanel.show(target);
                }
            }
        } else {
            // Clicked on nothing - deselect current selection
            this.deselectAll();
        }
    }

}
