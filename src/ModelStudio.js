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

        // Apply vortex field from ship engines (only when engines are on)
        if (this.studio.engineOn && this.studio.currentShipInfo && this.studio.currentShipInfo.engineOffsets) {
            const vortexRadius = 2.0;
            const radiusSq = vortexRadius * vortexRadius;
            const multiplier = 5.0;
            const simulatedVelocity = new THREE.Vector3(0, 0, -10); // Simulate ship moving forward

            this.studio.currentShipInfo.engineOffsets.forEach(engineOffset => {
                // Calculate vortex position (radius units behind engine, y=0)
                const vortexPos = new THREE.Vector3(
                    engineOffset.x,
                    0,
                    engineOffset.z + vortexRadius
                );

                const distSq = position.distanceToSquared(vortexPos);
                if (distSq < radiusSq) {
                    // Apply inverted velocity (backwards push)
                    targetVec.x -= simulatedVelocity.x * multiplier;
                    targetVec.y -= simulatedVelocity.y * multiplier;
                    targetVec.z -= simulatedVelocity.z * multiplier;
                }
            });
        }

        return targetVec;
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
        this.wakeMesh = null;
        this.smokeAccumulator = 0;
        this._tempSmokeInfluence = new THREE.Vector3();

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
        this.currentShipInfo = modelData; // Store collisionRadius, engineOffsets, animations
        this.animations = modelData.animations || [];
        this.baseEngineOffsets = modelData.engineOffsets.map(v => v.clone()); // Store base offsets
        this.scene.add(this.currentShip);

        this.initWake(modelData.engineOffsets);
        this.initStudioTurrets(modelData.turretMounts);
        this.addDebugHelpers(this.currentShip, modelData.collisionRadius, modelData.engineOffsets);

        this.updateTurretUI();

        // Add a grid helper for floor reference
        if (!this.grid) {
            this.grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
            this.scene.add(this.grid);
        }
    }

    addDebugHelpers(mesh, radius, engineOffsets) {
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

        // 3. Vortex Field (Magenta) - one ring per engine
        const vortexRadius = 2.0;
        this.vortexLines = [];

        if (!engineOffsets || engineOffsets.length === 0) {
            engineOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        engineOffsets.forEach(engineOffset => {
            const vCurve = new THREE.EllipseCurve(0, 0, vortexRadius, vortexRadius, 0, 2 * Math.PI, false, 0);
            const vPoints = vCurve.getPoints(32);
            const vGeom = new THREE.BufferGeometry().setFromPoints(vPoints);
            const vMat = new THREE.LineBasicMaterial({ color: 0xff00ff });
            const vLine = new THREE.Line(vGeom, vMat);

            // Position vortex 'radius' units behind the engine, with y=0
            vLine.position.set(engineOffset.x, 0, engineOffset.z + vortexRadius);
            vLine.rotation.x = -Math.PI / 2;
            mesh.add(vLine);
            this.vortexLines.push(vLine);
        });
    }

    initWake(engineOffsets) {
        if (!engineOffsets || engineOffsets.length === 0) {
            // Fallback if no engine offsets defined
            engineOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        this.wakeMeshes = EngineEffects.initWakes(engineOffsets, this.currentShip);

        // Keep backward compatibility - first wake is the "main" wake
        this.wakeMesh = this.wakeMeshes[0];
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

    getEnginePosition() {
        if (!this.currentShip || !this.currentShipInfo) return new THREE.Vector3();

        const engineOffsets = this.currentShipInfo.engineOffsets;
        const rotation = this.currentShip ? this.currentShip.rotation : new THREE.Euler();
        return EngineEffects.getEnginePosition(engineOffsets, rotation, null);
    }

    getEnginePositionFromOffset(engineOffset) {
        const rotation = this.currentShip ? this.currentShip.rotation : new THREE.Euler();
        return EngineEffects.getEnginePositionFromOffset(engineOffset, rotation, null);
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

        // Engine Timer (15s cycle)
        this.engineTimer += dt;
        if (this.engineTimer > 30.0) { // 30s total cycle (15 on, 15 off)? Or 15s toggle? "every 15 seconds"
            this.engineTimer = 0;
        }

        this.engineOn = this.engineTimer < 15.0; // On for first 15s, Off for next 15s

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


        // Update Ship Logic (Wake & Smoke)
        if (this.engineOn) {
            // Update all wake meshes
            if (this.wakeMeshes && this.wakeMeshes.length > 0) {
                EngineEffects.updateWakeVisuals(this.wakeMeshes, dt);
            }

            // Smoke Emission from all engines
            if (this.currentShipInfo && this.currentShipInfo.engineOffsets) {
                this.smokeAccumulator = EngineEffects.emitSmoke(
                    this.currentShipInfo.engineOffsets,
                    (offset) => this.getEnginePositionFromOffset(offset),
                    this.smokeAccumulator,
                    dt,
                    this.particleSystem,
                    this.velocityField,
                    this.camera,
                    [],
                    this._tempSmokeInfluence,
                    0.05
                );
            }

        } else {
            // Hide all wakes
            EngineEffects.hideWakes(this.wakeMeshes);
        }

        // Update Animations
        this.updateAnimations(dt);

        // Update Particles
        this.particleSystem.update(dt, this.velocityField, [], null, this.camera);

        this.renderer.render(this.scene, this.camera);
    }

    updateAnimations(dt) {
        EngineEffects.updateAnimations(
            this.animations,
            dt,
            (newOffsets) => { this.currentShipInfo.engineOffsets = newOffsets; },
            () => this.updateWakePositions(),
            () => this.updateVortexPositions()
        );
    }

    updateWakePositions() {
        EngineEffects.updateWakePositions(this.wakeMeshes, this.currentShipInfo?.engineOffsets);
    }

    updateVortexPositions() {
        const vortexRadius = 2.0;
        EngineEffects.updateVortexPositions(this.vortexLines, this.currentShipInfo?.engineOffsets, vortexRadius);
    }
}
