import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShipModels, SHIP_TYPES } from './objects/ShipModels.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { MainMenu } from './MainMenu.js';

// Mock Velocity Field for Studio (smoke drifting)
class MockVelocityField {
    calculateTotalVelocity(position, bodies, player, targetVec) {
        // Simulate backward drift (as if ship moving forward)
        // Ship faces -Z? Or +Z?
        // In Spaceship.js: forward = (0,0,-1).
        // So wake should drift +Z (backwards).
        targetVec.set(0, 0, 10); // Drift speed 10 units/s backwards
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

        this.setupLights();
        this.setupInteraction(); // Custom controls
        this.setupUI();

        // Systems
        this.clock = new THREE.Clock();
        this.velocityField = new MockVelocityField();
        this.particleSystem = new ParticleSystem(this.scene, {
            fieldRadius: 100, // Small field for studio
            count: 0, // No dust
            poolSize: 500, // Enough for smoke
            minLife: 2.0,
            maxLife: 4.0 // Short life for studio
        });

        // State
        this.currentShip = null;
        this.shipType = 'standard';
        this.shipColor = 0x00ff00;
        this.engineOn = true;
        this.engineTimer = 0;
        this.wakeMesh = null;
        this.wakeLight = null;
        this.smokeAccumulator = 0;
        this._tempSmokeInfluence = new THREE.Vector3();

        this.isPaused = false;
        this.mainMenu = new MainMenu(this);

        // Initial Load
        this.loadShip(this.shipType);

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

        // Pointer Lock for Right Click (Matches Game.js behavior)
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) { // Right Click
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
                const rotateSpeed = 0.002; // Sensitivity

                // OrbitControls usually handles rotation via drag. 
                // When pointer is locked, we need to manually update camera or controls.
                // Simpler approach: Manually orbit camera around target (0,0,0)

                // Convert to Spherical
                const offset = new THREE.Vector3().copy(this.camera.position).sub(this.controls.target);
                const spherical = new THREE.Spherical().setFromVector3(offset);

                // Apply Delta
                spherical.theta -= movementX * rotateSpeed;
                spherical.phi -= movementY * rotateSpeed;

                // Clamp Phi
                spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

                spherical.makeSafe();

                // Apply back
                offset.setFromSpherical(spherical);
                this.camera.position.copy(this.controls.target).add(offset);
                this.camera.lookAt(this.controls.target);
            }
        });

        // Custom Wheel Listener for Zooming while Rotating
        this.renderer.domElement.addEventListener('wheel', (e) => {
            // Check if Right Mouse Button is held (Bitmask 2)
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

                // Clamp
                const dist = offset.length();
                if (dist < this.controls.minDistance) {
                    offset.setLength(this.controls.minDistance);
                } else if (dist > this.controls.maxDistance) {
                    offset.setLength(this.controls.maxDistance);
                }

                this.camera.position.copy(this.controls.target).add(offset);
            }
        }, { passive: false });

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
    }

    loadShip(type) {
        if (this.currentShip) {
            this.scene.remove(this.currentShip);
        }

        const modelData = ShipModels.createModel(type, this.shipColor);
        this.currentShip = modelData.mesh;
        this.currentShipInfo = modelData; // Store collisionRadius, engineOffset
        this.scene.add(this.currentShip);

        this.initWake(modelData.engineOffset);
        this.addDebugHelpers(this.currentShip, modelData.collisionRadius);

        // Add a grid helper for floor reference
        if (!this.grid) {
            this.grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
            this.scene.add(this.grid);
        }
    }

    addDebugHelpers(mesh, radius) {
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

        // 3. Vortex Field (Magenta)
        // Default playerConfig.vortexRadius is 1.0 (from seeing Spaceship.js or config)
        // Actually reading Spaceship.js: initVortexDebug uses playerConfig.vortexRadius || 1.0
        const vortexRadius = 1.0;
        const vCurve = new THREE.EllipseCurve(0, 0, vortexRadius, vortexRadius, 0, 2 * Math.PI, false, 0);
        const vPoints = vCurve.getPoints(32);
        const vGeom = new THREE.BufferGeometry().setFromPoints(vPoints);
        const vMat = new THREE.LineBasicMaterial({ color: 0xff00ff });
        const vLine = new THREE.Line(vGeom, vMat);

        // Offset Z
        const offsetZ = 1.5; // playerConfig.vortexOffsetZ || 1.5
        vLine.position.set(0, 0, offsetZ);
        vLine.rotation.x = -Math.PI / 2;
        mesh.add(vLine);
    }

    initWake(engineOffset) {
        if (this.wakeMesh) {
            // If already exists, just re-parent or move? 
            // Better to recreate if logic depends on ship params.
            // But we can check if we attached it to the ship group.
            // Here `currentShip` is a new Group. We should add wake to it.
        }

        // Adapted from Spaceship.initWake
        const height = 3.0; // Wake length
        const radius = 0.5;

        const geometry = new THREE.ConeGeometry(radius, height, 8);
        geometry.rotateX(Math.PI / 2);

        const zStart = engineOffset ? engineOffset.z : 0.5;

        // Shift geometry so tip is at 0,0,0, extending to +Z
        geometry.translate(0, 0, height / 2);

        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 });
        this.wakeMesh = new THREE.Mesh(geometry, material);
        this.wakeMesh.visible = false;
        this.wakeMesh.position.set(0, 0, zStart);

        this.wakeLight = new THREE.PointLight(0xffff00, 2, 10);
        this.wakeLight.position.set(0, 0, 1.0); // Local to wakeMesh
        this.wakeMesh.add(this.wakeLight);

        this.currentShip.add(this.wakeMesh);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    getEnginePosition() {
        if (!this.currentShip || !this.currentShipInfo) return new THREE.Vector3();

        const offsetZ = this.currentShipInfo.engineOffset ? this.currentShipInfo.engineOffset.z : 1.5;
        // In local space of ship (which is at 0,0,0 unrotated mostly unless we rotated it)
        // If we rotate the ship mesh in animate, we need to account for it.
        const offset = new THREE.Vector3(0, 0, offsetZ);
        if (this.currentShip) {
            offset.applyEuler(this.currentShip.rotation);
        }
        return offset; // World pos is same as local since ship is at 0,0,0
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

        // Update Camera
        this.controls.update();


        // Update Ship Logic (Wake & Smoke)
        if (this.engineOn) {
            if (this.wakeMesh) {
                this.wakeMesh.visible = true;
                this.wakeMesh.rotation.z += 15 * dt;

                const pulse = 1.0 + Math.sin(Date.now() * 0.02) * 0.2 + (Math.random() - 0.5) * 0.5;
                const lenPulse = 1.0 + (Math.random() - 0.5) * 0.8;
                this.wakeMesh.scale.set(pulse, pulse, lenPulse);

                if (Math.random() > 0.8) {
                    const colors = [0xffff00, 0xff4400, 0xffffff, 0xffaa00, 0xff0000];
                    const col = colors[Math.floor(Math.random() * colors.length)];
                    this.wakeMesh.material.color.setHex(col);
                    if (this.wakeLight) this.wakeLight.color.setHex(col);
                }
            }

            // Smoke Emission
            this.smokeAccumulator += dt;
            const emissionInterval = 0.05;

            if (this.smokeAccumulator >= emissionInterval) {
                this.smokeAccumulator = 0;

                // Spawn Smoke
                const wakePos = this.getEnginePosition();

                // Velocity inheritance: Ship is "moving" forward, so smoke should inherit expected velocity?
                // Or just the wake velocity?
                // User said "inherit the velocity according to the ship wake definition".
                // In Spaceship.js, smoke inherits `velocityField` influence.
                // Our MockVelocityField drives particles backwards (+Z).
                // So we spawn at engine, and let ParticleSystem update move it.

                // Get influence at this point
                this.velocityField.calculateTotalVelocity(wakePos, [], null, this._tempSmokeInfluence);

                this.particleSystem.spawnSmoke(wakePos, this._tempSmokeInfluence, this.camera);
            }

        } else {
            if (this.wakeMesh) this.wakeMesh.visible = false;
        }

        // Update Particles
        this.particleSystem.update(dt, this.velocityField, [], null, this.camera);

        this.renderer.render(this.scene, this.camera);
    }
}
