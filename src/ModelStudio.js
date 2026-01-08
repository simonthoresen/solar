import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShipModels, SHIP_TYPES } from './objects/ShipModels.js';
import { ParticleSystem } from './objects/ParticleSystem.js';
import { MainMenu } from './MainMenu.js';
import { Turret } from './objects/Turret.js';

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

        // State - Initialize before setupUI so dropdown can reference these values
        this.currentShip = null;
        this.turrets = [];
        this.shipType = 'viper';
        this.shipColor = 0x00ff00;
        this.engineOn = true;
        this.engineTimer = 0;
        this.wakeMesh = null;
        this.wakeLight = null;
        this.smokeAccumulator = 0;
        this._tempSmokeInfluence = new THREE.Vector3();

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

        // Track arrow key state for camera rotation
        this.arrowKeys = {
            up: false,
            down: false,
            left: false,
            right: false
        };

        window.addEventListener('resize', this.onResize.bind(this));
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.mainMenu.toggle();
            }
            // Track arrow keys for camera rotation
            if (e.key === 'ArrowUp') this.arrowKeys.up = true;
            if (e.key === 'ArrowDown') this.arrowKeys.down = true;
            if (e.key === 'ArrowLeft') this.arrowKeys.left = true;
            if (e.key === 'ArrowRight') this.arrowKeys.right = true;
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowUp') this.arrowKeys.up = false;
            if (e.key === 'ArrowDown') this.arrowKeys.down = false;
            if (e.key === 'ArrowLeft') this.arrowKeys.left = false;
            if (e.key === 'ArrowRight') this.arrowKeys.right = false;
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
        this.wakeMeshes = []; // Array to store multiple wakes
        this.wakeLights = []; // Array to store multiple lights

        if (!engineOffsets || engineOffsets.length === 0) {
            // Fallback if no engine offsets defined
            engineOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        // Create a wake for each engine
        engineOffsets.forEach(engineOffset => {
            const height = 3.0; // Wake length
            const radius = 0.5;

            const geometry = new THREE.ConeGeometry(radius, height, 8);
            geometry.rotateX(Math.PI / 2);

            const zStart = engineOffset.z;

            // Shift geometry so tip is at 0,0,0, extending to +Z
            geometry.translate(0, 0, height / 2);

            const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 });
            const wakeMesh = new THREE.Mesh(geometry, material);
            wakeMesh.visible = false;
            wakeMesh.position.copy(engineOffset);

            const wakeLight = new THREE.PointLight(0xffff00, 2, 10);
            wakeLight.position.set(0, 0, 1.0); // Local to wakeMesh
            wakeMesh.add(wakeLight);

            this.currentShip.add(wakeMesh);
            this.wakeMeshes.push(wakeMesh);
            this.wakeLights.push(wakeLight);
        });

        // Keep backward compatibility - first wake is the "main" wake
        this.wakeMesh = this.wakeMeshes[0];
        this.wakeLight = this.wakeLights[0];
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

        // Return first engine position for backward compatibility
        if (this.currentShipInfo.engineOffsets && this.currentShipInfo.engineOffsets.length > 0) {
            return this.getEnginePositionFromOffset(this.currentShipInfo.engineOffsets[0]);
        }

        // Fallback
        const offset = new THREE.Vector3(0, 0, 1.5);
        if (this.currentShip) {
            offset.applyEuler(this.currentShip.rotation);
        }
        return offset; // World pos is same as local since ship is at 0,0,0
    }

    getEnginePositionFromOffset(engineOffset) {
        const offset = engineOffset.clone();
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
        if (this.arrowKeys.up || this.arrowKeys.down || this.arrowKeys.left || this.arrowKeys.right) {
            const rotateSpeed = 2.0; // Speed of rotation with arrow keys
            const offset = new THREE.Vector3();
            const spherical = new THREE.Spherical();

            offset.copy(this.camera.position).sub(this.controls.target);
            spherical.setFromVector3(offset);

            // Apply rotations based on arrow keys
            if (this.arrowKeys.left) spherical.theta += rotateSpeed * dt;
            if (this.arrowKeys.right) spherical.theta -= rotateSpeed * dt;
            if (this.arrowKeys.up) spherical.phi -= rotateSpeed * dt;
            if (this.arrowKeys.down) spherical.phi += rotateSpeed * dt;

            // Clamp phi to prevent flipping
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
            spherical.makeSafe();

            offset.setFromSpherical(spherical);
            this.camera.position.copy(this.controls.target).add(offset);
            this.camera.lookAt(this.controls.target);
        }

        // Update Camera
        this.controls.update();


        // Update Ship Logic (Wake & Smoke)
        if (this.engineOn) {
            // Update all wake meshes
            if (this.wakeMeshes && this.wakeMeshes.length > 0) {
                const pulse = 1.0 + Math.sin(Date.now() * 0.02) * 0.2 + (Math.random() - 0.5) * 0.5;
                const lenPulse = 1.0 + (Math.random() - 0.5) * 0.8;

                // Random color for all wakes
                let col = null;
                if (Math.random() > 0.8) {
                    const colors = [0xffff00, 0xff4400, 0xffffff, 0xffaa00, 0xff0000];
                    col = colors[Math.floor(Math.random() * colors.length)];
                }

                this.wakeMeshes.forEach((wakeMesh, index) => {
                    wakeMesh.visible = true;
                    wakeMesh.rotation.z += 15 * dt;
                    wakeMesh.scale.set(pulse, pulse, lenPulse);

                    if (col !== null) {
                        wakeMesh.material.color.setHex(col);
                        if (this.wakeLights[index]) {
                            this.wakeLights[index].color.setHex(col);
                        }
                    }
                });
            }

            // Smoke Emission from all engines
            this.smokeAccumulator += dt;
            const emissionInterval = 0.05;

            if (this.smokeAccumulator >= emissionInterval) {
                this.smokeAccumulator = 0;

                // Spawn smoke from each engine
                if (this.currentShipInfo && this.currentShipInfo.engineOffsets) {
                    this.currentShipInfo.engineOffsets.forEach(engineOffset => {
                        const wakePos = this.getEnginePositionFromOffset(engineOffset);

                        // Get influence at this point
                        this.velocityField.calculateTotalVelocity(wakePos, [], null, this._tempSmokeInfluence);

                        this.particleSystem.spawnSmoke(wakePos, this._tempSmokeInfluence, this.camera);
                    });
                }
            }

        } else {
            // Hide all wakes
            if (this.wakeMeshes && this.wakeMeshes.length > 0) {
                this.wakeMeshes.forEach(wakeMesh => {
                    wakeMesh.visible = false;
                });
            }
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

                // If this animation has dynamic engines, update engine offsets
                if (anim.dynamicEngines && anim.engineOffsets) {
                    // Calculate current engine positions based on rotation
                    this.currentShipInfo.engineOffsets = anim.engineOffsets.map(baseOffset => {
                        // Apply the group's rotation to the base offset
                        const rotatedOffset = baseOffset.clone();
                        rotatedOffset.applyEuler(anim.mesh.rotation);
                        // Add the group's position
                        rotatedOffset.add(anim.mesh.position);
                        return rotatedOffset;
                    });

                    // Update wake positions to match engine offsets
                    this.updateWakePositions();
                    this.updateVortexPositions();
                }
            }
        });
    }

    updateWakePositions() {
        if (!this.wakeMeshes || !this.currentShipInfo.engineOffsets) return;

        // Update each wake mesh to match its corresponding engine offset
        this.currentShipInfo.engineOffsets.forEach((offset, index) => {
            if (this.wakeMeshes[index]) {
                this.wakeMeshes[index].position.copy(offset);
            }
        });
    }

    updateVortexPositions() {
        if (!this.vortexLines || !this.currentShipInfo.engineOffsets) return;

        const vortexRadius = 2.0;

        // Update each vortex ring to match its corresponding engine offset
        this.currentShipInfo.engineOffsets.forEach((offset, index) => {
            if (this.vortexLines[index]) {
                // Position vortex 'radius' units behind the engine, with y=0
                this.vortexLines[index].position.set(offset.x, 0, offset.z + vortexRadius);
            }
        });
    }
}
