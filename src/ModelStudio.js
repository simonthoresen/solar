import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShipModels, SHIP_TYPES } from './objects/ShipModels.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { MainMenu } from './MainMenu.js';
import { Turret } from './objects/Turret.js';
import { EngineEffects } from './utils/EngineEffects.js';
import { ArrowKeyCameraRotation, PointerLockCameraRotation, ZoomWhileRotating } from './utils/CameraControls.js';

// Mock Velocity Field for Studio (smoke drifting)
class MockVelocityField {
    constructor(studio) {
        this.studio = studio;
    }

    calculateTotalVelocity(position, bodies, player, targetVec) {
        targetVec.set(0, 0, 1);

        // Apply exhaust field from ship thrusters (only when thrusters are on)
        if (this.studio.engineOn && this.studio.currentShip && this.studio.currentShipInfo && this.studio.currentShipInfo.thrusterOffsets) {
            const multiplier = 5.0;
            const ship = this.studio.currentShip;

            // Transform particle position from world space to local ship space
            const localParticlePos = ship.worldToLocal(position.clone());

            // Get thruster directions (for animated thrusters)
            const thrusterDirections = this.studio.thrusterDirections || [];
            const thrusterConfigs = this.studio.currentShipInfo.thrusterConfigs || [];

            this.studio.currentShipInfo.thrusterOffsets.forEach((thrusterOffset, index) => {
                // Get config for this thruster
                const config = thrusterConfigs[index] || {
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0
                };

                const exhaustWidth = config.exhaustWidth;
                const exhaustLength = config.exhaustLength;
                const halfWidth = exhaustWidth / 2.0;
                const halfLength = exhaustLength / 2.0;

                // Get exhaust direction in local space
                let exhaustDir;
                if (thrusterDirections[index]) {
                    exhaustDir = thrusterDirections[index].clone().normalize();
                } else {
                    // Default: thrusters point backward (+Z in local space)
                    exhaustDir = new THREE.Vector3(0, 0, 1);
                }

                // Calculate exhaust center position in local space
                const exhaustCenter = exhaustLength / 2.0;
                const exhaustPos = new THREE.Vector3(
                    thrusterOffset.x,
                    0,
                    thrusterOffset.z + exhaustCenter
                );

                // Vector from exhaust center to particle (in local space)
                const toParticle = localParticlePos.clone().sub(exhaustPos);

                // Get perpendicular direction (cross with up vector)
                const perpDir = new THREE.Vector3().crossVectors(exhaustDir, new THREE.Vector3(0, 1, 0)).normalize();

                // Project onto exhaust direction (along exhaust)
                const alongExhaust = toParticle.dot(exhaustDir);

                // Project onto perpendicular direction (across exhaust)
                const acrossExhaust = toParticle.dot(perpDir);

                // Check if within rectangular exhaust field bounds
                if (Math.abs(alongExhaust) <= halfLength && Math.abs(acrossExhaust) <= halfWidth) {
                    // Particle is within exhaust field - apply force in world space
                    // Transform exhaust direction from local to world space
                    const worldExhaustDir = exhaustDir.clone().applyEuler(ship.rotation).normalize();
                    targetVec.x += worldExhaustDir.x * multiplier;
                    targetVec.y += worldExhaustDir.y * multiplier;
                    targetVec.z += worldExhaustDir.z * multiplier;
                }
            });
        }

        return targetVec;
    }

    // Separate exhaust force calculation (for compatibility with ParticleSystem)
    // In the mock, exhaust is already included in calculateTotalVelocity, so return zero
    calculateExhaustForce(position, celestialBodies, ships, target = new THREE.Vector3()) {
        target.set(0, 0, 0);
        return target;
    }

    // Check if position is in exhaust field (for debug purposes)
    isInExhaustField(position, celestialBodies, ships) {
        return false; // Mock doesn't need this
    }
}

export class ModelStudio {
    constructor() {
        this.container = document.getElementById('app');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'app';
            document.body.appendChild(this.container);
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        // Initial Camera State
        // handled by controls setup

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // State - Initialize before setupUI so dropdown can reference these values
        this.currentShip = null;
        this.turrets = [];
        this.shipType = 'viper';
        this.shipColor = 0x00ff00;
        this.engineOn = true;
        this.engineTimer = 0;
        this.flameMesh = null;
        this.smokeAccumulator = 0;
        this._tempSmokeInfluence = new THREE.Vector3();

        // Manual ship controls
        this.keys = {
            w: false,
            a: false,
            d: false
        };

        this.setupLights();
        this.setupInteraction(); // Custom controls
        this.setupUI();

        // Systems
        this.clock = new THREE.Clock();
        this.velocityField = new MockVelocityField(this);
        this.particleSystem = new ParticleSystem(this.scene, {
            fieldRadius: 15,
            count: 100,
            dustScale: 0.2,
            poolSize: 500,
            minLife: 2.0,
            maxLife: 4.0
        });

        this.isPaused = false;
        this.mainMenu = new MainMenu(this);

        // Initial Load
        this.loadShip(this.shipType);

        // Orbiting Target
        this.targetCube = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.5, 0), // Low poly (detail 0)
            new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true })
        );
        this.targetCube.castShadow = false; // Don't block light
        this.targetCube.receiveShadow = false;
        this.scene.add(this.targetCube);

        // Add light to target
        // Distance 0 = infinite range
        const targetLight = new THREE.PointLight(0xffff00, 10, 0); // Increased intensity from 2 to 10
        this.targetCube.add(targetLight);

        this.targetAngle = 0;

        window.addEventListener('resize', this.onResize.bind(this));
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.mainMenu.toggle();
            }

            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) {
                this.keys[k] = true;
            }
        });
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) {
                this.keys[k] = false;
            }
        });

        this.animate();
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        this.scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-5, 0, -5);
        this.scene.add(fillLight);
    }

    setupInteraction() {
        // Use OrbitControls but customized
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = false;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 20;

        // Map Right Click to Rotate
        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };

        // Initialize camera controls
        this.arrowKeyRotation = new ArrowKeyCameraRotation(this.camera, this.controls, 2.0);
        this.pointerLockRotation = new PointerLockCameraRotation(this.camera, this.controls, this.renderer);
        this.zoomWhileRotating = new ZoomWhileRotating(this.camera, this.controls, this.renderer);

        // Initial Camera Position (Slightly above and away)
        this.camera.position.set(3, 4, 6);
        this.controls.update();
    }

    setupUI() {
        const uiContainer = document.createElement('div');
        uiContainer.style.position = 'absolute';
        uiContainer.style.top = '20px';
        uiContainer.style.left = '20px';
        uiContainer.style.padding = '15px';
        uiContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        uiContainer.style.color = 'white';
        uiContainer.style.borderRadius = '8px';
        uiContainer.style.fontFamily = 'system-ui, sans-serif';

        // Title
        const title = document.createElement('h2');
        title.innerText = 'Ship Model Studio';
        title.style.marginTop = '0';
        uiContainer.appendChild(title);

        // Select Type
        const typeContainer = document.createElement('div');
        typeContainer.style.marginBottom = '10px';

        const typeLabel = document.createElement('label');
        typeLabel.innerText = 'Ship Type: ';
        typeContainer.appendChild(typeLabel);

        const typeSelect = document.createElement('select');
        typeSelect.style.marginLeft = '10px';
        typeSelect.style.padding = '5px';

        // Use imported constants
        const sortedTypes = [...SHIP_TYPES].sort();

        sortedTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.innerText = type.charAt(0).toUpperCase() + type.slice(1);
            typeSelect.appendChild(option);
        });

        // Set initial dropdown value to match the loaded ship
        typeSelect.value = this.shipType;

        typeSelect.addEventListener('change', (e) => {
            this.shipType = e.target.value;
            this.loadShip(this.shipType);
        });
        typeContainer.appendChild(typeSelect);
        uiContainer.appendChild(typeContainer);

        // Color Picker
        const colorContainer = document.createElement('div');
        colorContainer.style.marginBottom = '10px';

        const colorLabel = document.createElement('label');
        colorLabel.innerText = 'Base Color: ';
        colorContainer.appendChild(colorLabel);

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = '#00ff00';
        colorInput.style.marginLeft = '10px';

        colorInput.addEventListener('input', (e) => {
            this.shipColor = parseInt(e.target.value.replace('#', '0x'), 16);
            this.loadShip(this.shipType);
        });

        colorContainer.appendChild(colorInput);
        uiContainer.appendChild(colorContainer);

        document.body.appendChild(uiContainer);
        this.turretUIContainer = document.createElement('div');
        this.turretUIContainer.style.marginTop = '10px';
        this.turretUIContainer.style.borderTop = '1px solid #444';
        this.turretUIContainer.style.paddingTop = '10px';
        uiContainer.appendChild(this.turretUIContainer);
    }

    updateTurretUI() {
        this.turretUIContainer.innerHTML = '';
        const label = document.createElement('h3');
        label.innerText = 'Turret Configuration';
        label.style.fontSize = '14px';
        label.style.marginTop = '0';
        this.turretUIContainer.appendChild(label);

        if (!this.currentShipInfo || !this.currentShipInfo.turretMounts) return;

        this.currentShipInfo.turretMounts.forEach((mount, index) => {
            const row = document.createElement('div');
            row.style.marginBottom = '5px';
            row.style.fontSize = '12px';

            const lbl = document.createElement('span');
            lbl.innerText = `Mount ${index + 1}: `;
            row.appendChild(lbl);

            const select = document.createElement('select');
            const types = ['triangular', 'circular', 'square'];
            types.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.innerText = t;
                if (mount.type === t) opt.selected = true;
                select.appendChild(opt);
            });

            select.addEventListener('change', (e) => {
                const newType = e.target.value;
                // Update mount info
                mount.type = newType;
                // Recreate this turret
                this.recreateTurret(index, mount);
            });

            row.appendChild(select);
            this.turretUIContainer.appendChild(row);
        });
    }

    recreateTurret(index, mount) {
        // Remove old
        if (this.turrets[index]) {
            this.currentShip.remove(this.turrets[index].mesh);
        }

        // Create new
        const turret = new Turret(this.currentShip, mount.position, mount.type);
        this.turrets[index] = turret;
    }

    loadShip(type) {
        if (this.currentShip) {
            this.scene.remove(this.currentShip);
        }

        const modelData = ShipModels.createModel(type, this.shipColor);
        this.currentShip = modelData.mesh;
        this.currentShipInfo = modelData; // Store collisionRadius, thrusterOffsets, animations
        this.animations = modelData.animations || [];
        this.baseThrusterOffsets = modelData.thrusterOffsets.map(v => v.clone()); // Store base offsets
        this.scene.add(this.currentShip);

        this.initFlames(modelData.thrusterOffsets);
        this.initStudioTurrets(modelData.turretMounts);
        this.addDebugHelpers(this.currentShip, modelData.collisionRadius, modelData.thrusterOffsets);

        this.updateTurretUI();

        // Add a grid helper for floor reference
        if (!this.grid) {
            this.grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
            this.scene.add(this.grid);
        }
    }

    addDebugHelpers(mesh, radius, thrusterOffsets) {
        // 1. Axis Helper
        const axisHelper = new THREE.AxesHelper(2);
        axisHelper.scale.set(1, 1, -1);
        mesh.add(axisHelper);

        // 2. Collision Field (Red)
        const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI, false, 0);
        const points = curve.getPoints(32);
        const boundaryGeom = new THREE.BufferGeometry().setFromPoints(points);
        const boundaryMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const boundaryLine = new THREE.Line(boundaryGeom, boundaryMat);
        boundaryLine.rotation.x = -Math.PI / 2;
        mesh.add(boundaryLine);

        // 3. Exhaust Field (Magenta) - rectangular field per thruster
        this.exhaustRings = [];

        if (!thrusterOffsets || thrusterOffsets.length === 0) {
            thrusterOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        // Get thruster configs from currentShipInfo
        const thrusterConfigs = this.currentShipInfo?.thrusterConfigs || [];

        thrusterOffsets.forEach((thrusterOffset, index) => {
            // Get config for this thruster
            const config = thrusterConfigs[index] || {
                exhaustWidth: 3.0,
                exhaustLength: 6.0,
                exhaustForce: 1000.0,
                smokeSize: 0.3,
                smokeColor: 0xaaaaaa,
                smokeLifetime: 3.0
            };

            const exhaustWidth = config.exhaustWidth;
            const exhaustLength = config.exhaustLength;
            const halfWidth = exhaustWidth / 2.0;

            const rectPoints = [
                new THREE.Vector3(-halfWidth, 0, 0),
                new THREE.Vector3(halfWidth, 0, 0),
                new THREE.Vector3(halfWidth, 0, exhaustLength),
                new THREE.Vector3(-halfWidth, 0, exhaustLength),
                new THREE.Vector3(-halfWidth, 0, 0) // close the loop
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(rectPoints);
            const material = new THREE.LineBasicMaterial({ color: 0xff00ff });
            const exhaustRect = new THREE.Line(geometry, material);

            // Position rectangle starting at the thruster, extending backward
            exhaustRect.position.set(thrusterOffset.x, 0, thrusterOffset.z);
            mesh.add(exhaustRect);
            this.exhaustRings.push(exhaustRect);
        });
    }

    initFlames(thrusterOffsets) {
        if (!thrusterOffsets || thrusterOffsets.length === 0) {
            // Fallback if no thruster offsets defined
            thrusterOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        this.flameMeshes = EngineEffects.initFlames(thrusterOffsets, this.currentShip);

        // Keep backward compatibility - first flame is the "main" flame
        this.flameMesh = this.flameMeshes[0];
    }

    initStudioTurrets(mounts) {
        this.turrets = []; // Clear
        if (!mounts) return;

        mounts.forEach(mount => {
            const turret = new Turret(this.currentShip, mount.position, mount.type);
            this.turrets.push(turret);
        });
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    getThrusterPosition() {
        if (!this.currentShip || !this.currentShipInfo) return new THREE.Vector3();

        const thrusterOffsets = this.currentShipInfo.thrusterOffsets;
        const rotation = this.currentShip ? this.currentShip.rotation : new THREE.Euler();
        return EngineEffects.getThrusterPosition(thrusterOffsets, rotation, null);
    }

    getThrusterPositionFromOffset(thrusterOffset) {
        const rotation = this.currentShip ? this.currentShip.rotation : new THREE.Euler();
        return EngineEffects.getThrusterPositionFromOffset(thrusterOffset, rotation, null);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        if (this.isPaused) {
            // Optional: Render static scene or nothing?
            // If main menu is overlays, we might want to keep rendering static scene.
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const dt = this.clock.getDelta();

        // Manual ship rotation (A/D keys)
        if (this.currentShip) {
            const turnSpeed = 2.0; // radians per second
            let turn = 0;
            if (this.keys.a) turn += 1; // Turn left
            if (this.keys.d) turn += -1; // Turn right
            this.currentShip.rotation.y += turn * turnSpeed * dt;
        }

        // Engine Timer (15s cycle for auto-thrust)
        this.engineTimer += dt;
        if (this.engineTimer > 30.0) { // 30s total cycle (15 on, 15 off)
            this.engineTimer = 0;
        }

        // Manual thrust override: W key overrides auto-thrust cycle
        if (this.keys.w) {
            this.engineOn = true; // Force engines on
        } else {
            this.engineOn = this.engineTimer < 15.0; // Auto-thrust: On for first 15s, Off for next 15s
        }

        // Orbit Logic
        this.targetAngle += dt * 0.5; // Slow rotation
        const radius = 7.5; // Increased by 50% (was 5)
        this.targetCube.position.set(
            Math.cos(this.targetAngle) * radius,
            0, // Y=0 Plane as requested
            Math.sin(this.targetAngle) * radius
        );

        // Update Turrets
        this.turrets.forEach(turret => {
            turret.update(dt, this.targetCube.position);
        });

        // Arrow key camera rotation
        if (this.arrowKeyRotation) {
            this.arrowKeyRotation.update(dt);
        }

        // Update Camera
        this.controls.update();


        // Update Ship Logic (Flame & Smoke)
        if (this.engineOn) {
            // Update all flame meshes
            if (this.flameMeshes && this.flameMeshes.length > 0) {
                EngineEffects.updateFlameVisuals(this.flameMeshes, dt);
            }

            // Smoke Emission from all thrusters
            if (this.currentShipInfo && this.currentShipInfo.thrusterOffsets) {
                this.smokeAccumulator = EngineEffects.emitSmoke(
                    this.currentShipInfo.thrusterOffsets,
                    (offset) => this.getThrusterPositionFromOffset(offset),
                    this.smokeAccumulator,
                    dt,
                    this.particleSystem,
                    this.velocityField,
                    this.camera,
                    [],
                    this._tempSmokeInfluence,
                    0.05,
                    this.currentShipInfo.thrusterConfigs,
                    null // Model studio ship is stationary, no velocity-based scaling needed
                );
            }

        } else {
            // Hide all flames
            EngineEffects.hideFlames(this.flameMeshes);
        }

        // Update Animations
        this.updateAnimations(dt);

        // Update Particles
        this.particleSystem.update(dt, this.velocityField, [], null, this.camera);

        this.renderer.render(this.scene, this.camera);
    }

    updateAnimations(dt) {
        if (!this.animations || this.animations.length === 0) return;

        this.animations.forEach(anim => {
            if (anim.type === 'rotate') {
                // Rotate the animated mesh
                if (anim.axis === 'x') {
                    anim.mesh.rotation.x += anim.speed * dt;
                } else if (anim.axis === 'y') {
                    anim.mesh.rotation.y += anim.speed * dt;
                } else if (anim.axis === 'z') {
                    anim.mesh.rotation.z += anim.speed * dt;
                }

                // If this animation has dynamic thrusters, update thruster offsets AND directions
                if (anim.dynamicEngines && anim.thrusterOffsets) {
                    const newOffsets = [];
                    const newDirections = [];

                    anim.thrusterOffsets.forEach(baseOffset => {
                        // Calculate thruster position
                        const rotatedOffset = baseOffset.clone();
                        rotatedOffset.applyEuler(anim.mesh.rotation);
                        rotatedOffset.add(anim.mesh.position);
                        newOffsets.push(rotatedOffset);

                        // Calculate thruster exhaust direction
                        // Thruster points in +Z direction in its local space
                        const localExhaustDir = new THREE.Vector3(0, 0, 1);
                        // Apply thruster group rotation (no ship rotation in model studio)
                        const worldExhaustDir = localExhaustDir.clone().applyEuler(anim.mesh.rotation);
                        newDirections.push(worldExhaustDir);
                    });

                    this.currentShipInfo.thrusterOffsets = newOffsets;
                    this.thrusterDirections = newDirections;
                    this.updateFlamePositions();
                    this.updateExhaustPositions();
                }
            }
        });
    }

    updateFlamePositions() {
        EngineEffects.updateFlamePositions(this.flameMeshes, this.currentShipInfo?.thrusterOffsets);
    }

    updateExhaustPositions() {
        // Update exhaust field rectangles only (no arrows)
        if (this.currentShipInfo?.thrusterOffsets) {
            this.currentShipInfo.thrusterOffsets.forEach((thrusterOffset, index) => {
                if (this.exhaustRings[index]) {
                    this.exhaustRings[index].position.set(thrusterOffset.x, 0, thrusterOffset.z);
                }
            });
        }
    }
}
