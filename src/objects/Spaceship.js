import * as THREE from 'three';
import { playerConfig, dustConfig } from '../config.js';

// Scratch vectors for wake calculation
const _tempWakeDiff = new THREE.Vector3();
const _tempWakeLocal = new THREE.Vector3();
const _tempSmokeInfluence = new THREE.Vector3();

export class Spaceship {
    constructor(scene, color, position) {
        this.scene = scene;
        this.color = color;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.smoothedVelocityInfluence = new THREE.Vector3(0, 0, 0); // For smoothing
        this.rotation = new THREE.Euler(0, 0, 0);
        this.sizeRadius = 2.0; // For HUD size calculation

        // Control State
        this.controls = {
            thrust: false,
            turn: 0, // -1 to 1
            fire: false
        };

        this.initMesh(color);
        this.initWake();

        this.shootCooldown = 0;
        this.smokeAccumulator = 0;

        this.hasAttacked = false;

        this.isActive = true; // Use to track if destroyed?

        // Stats
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.maxShield = 100;
        this.shield = this.maxShield;
        this.laserDamage = 25;
    }

    explode() {
        if (!this.isActive) return;
        this.isActive = false;

        // Hide mesh
        this.mesh.visible = false;
        this.setDebugVisibility({ playerAxis: false, playerRing: false, playerVortex: false });

        // Trigger particles
        if (this.particleSystemReference) {
            this.particleSystemReference.spawnExplosion(this.position, this.color);
        }
    }

    takeDamage(amount) {
        if (!this.isActive) return;

        // 1. Shield absorbs damages
        if (this.shield > 0) {
            if (this.shield >= amount) {
                this.shield -= amount;
                amount = 0;
            } else {
                amount -= this.shield;
                this.shield = 0;
            }
        }

        // 2. Remaining damage to health
        if (amount > 0) {
            this.health -= amount;
            if (this.health <= 0) {
                this.health = 0;
                this.explode();
            }
        }
    }

    initMesh(color) {
        // Player is a Group containing two tetrahedrons
        this.mesh = new THREE.Group();

        const scale = playerConfig.modelScale || 1.0;

        // Custom BufferGeometry helper
        function createTetrahedron(radius, height, isTop, colorVal) {
            const geom = new THREE.BufferGeometry();

            const len = radius * 1.5;
            const wid = radius * 0.8;
            const h = height;

            // Base Triangle on Y=0
            const vFront = [0, 0, -len];
            const vBackL = [-wid, 0, len * 0.5];
            const vBackR = [wid, 0, len * 0.5];
            const y = isTop ? h : -h; // Apex Y
            const zApex = 0;
            const vApex = [0, y, zApex];

            let verticesArray;

            if (isTop) {
                verticesArray = [
                    // Top (Cabin) 
                    ...vFront, ...vBackL, ...vApex,
                    ...vFront, ...vApex, ...vBackR,
                    ...vBackL, ...vBackR, ...vApex,
                    ...vFront, ...vBackR, ...vBackL
                ];
            } else {
                verticesArray = [
                    // Bottom (Hull) 
                    ...vFront, ...vApex, ...vBackL,
                    ...vFront, ...vBackR, ...vApex,
                    ...vBackL, ...vApex, ...vBackR,
                    ...vFront, ...vBackL, ...vBackR
                ];
            }

            const vertices = new Float32Array(verticesArray);

            geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geom.computeVertexNormals();

            const mat = new THREE.MeshLambertMaterial({ color: colorVal });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        }

        const hullHeight = 0.5 * scale;
        const hullSize = 1.0 * scale;
        this.hullMesh = createTetrahedron(hullSize, hullHeight, false, color);
        this.mesh.add(this.hullMesh);

        // 2. Cabin (Top, smaller, always white)
        const cabinHeight = 0.4 * scale;
        const cabinSize = 0.6 * scale;
        this.cabinMesh = createTetrahedron(cabinSize, cabinHeight, true, 0xffffff);
        this.cabinMesh.position.z = 0.2 * scale;
        this.mesh.add(this.cabinMesh);

        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);

        // Axis helper for debug
        this.axisHelper = new THREE.AxesHelper(2);
        this.axisHelper.visible = false;
        this.axisHelper.scale.set(1, 1, -1);
        this.mesh.add(this.axisHelper);

        // Debug Collision Boundary 
        const curve = new THREE.EllipseCurve(0, 0, 0.5, 0.5, 0, 2 * Math.PI, false, 0);
        const points = curve.getPoints(32);
        const boundaryGeom = new THREE.BufferGeometry().setFromPoints(points);
        const boundaryMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.boundaryLine = new THREE.Line(boundaryGeom, boundaryMat);
        this.boundaryLine.rotation.x = -Math.PI / 2;
        this.boundaryLine.visible = false;
        this.mesh.add(this.boundaryLine);

        this.initVortexDebug();
    }

    initVortexDebug() {
        const radius = playerConfig.vortexRadius || 1.0;
        const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI, false, 0);
        const points = curve.getPoints(32);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff00ff });
        this.vortexLine = new THREE.Line(geometry, material);

        const offsetZ = playerConfig.vortexOffsetZ || 1.5;
        this.vortexLine.position.set(0, 0, offsetZ);
        this.vortexLine.rotation.x = -Math.PI / 2;
        this.vortexLine.visible = false;
        this.mesh.add(this.vortexLine);
    }

    initWake() {
        const height = 3.0;
        const radius = 0.75;

        const geometry = new THREE.ConeGeometry(radius, height, 8);
        geometry.rotateX(Math.PI / 2);

        const wakeOffset = playerConfig.wakeOffsetZ !== undefined ? playerConfig.wakeOffsetZ : 0.5;
        geometry.translate(0, 0, height / 2 + wakeOffset);

        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 });
        this.wakeMesh = new THREE.Mesh(geometry, material);
        this.wakeMesh.visible = false;

        this.wakeLight = new THREE.PointLight(0xffff00, 2, 10);
        this.wakeLight.position.set(0, 0, height / 2 + wakeOffset);
        this.wakeMesh.add(this.wakeLight);

        this.mesh.add(this.wakeMesh);

        this.wakeHeight = height;
        this.wakeRadius = radius;
    }

    // Abstract method for input/AI
    updateControls(dt) {
        // Override in subclass
    }

    update(dt, velocityField, celestialBodies = [], particleSystem = null, projectileSystem = null, camera = null, ships = []) {
        this.particleSystemReference = particleSystem;
        this.projectileSystemReference = projectileSystem;
        if (!this.isActive) return; // Stop updating if dead
        this.updateControls(dt);

        // Calculate Velocity Influence at current position
        // We do it here to ensure self-contained logic
        let velocityInfluence = new THREE.Vector3(0, 0, 0);
        if (velocityField) {
            velocityField.calculateTotalVelocity(this.position, celestialBodies, null, velocityInfluence);
        }

        // Rotation
        const turnSpeed = playerConfig.turnSpeed;
        if (this.controls.turn !== 0) {
            this.rotation.y += -this.controls.turn * turnSpeed * dt;
            // Note: Player code used: if/else for A/D. A adds, D subs. 
            // A is left turn? standard 3D: +Y rotation is left (CCW).
            // So turn=1 (Right) should be -Y. turn=-1 (Left) should be +Y.
            // If controls.turn is signed (-1 left, 1 right), then subtraction is correct.
        }

        this.mesh.rotation.y = this.rotation.y;

        // Thrust
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);

        if (this.controls.thrust) {
            this.velocity.add(forward.multiplyScalar(playerConfig.acceleration * dt));
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
            if (particleSystem && camera && velocityField) {
                this.smokeAccumulator += dt;
                const emissionInterval = playerConfig.smokeEmissionInterval || 0.05;

                if (this.smokeAccumulator >= emissionInterval) {
                    this.smokeAccumulator = 0;
                    const wakePos = this.getRandomWakePosition();

                    // Influence at wake pos
                    velocityField.calculateTotalVelocity(wakePos, celestialBodies, null, this._tempSmokeInfluence);

                    particleSystem.spawnSmoke(wakePos, this._tempSmokeInfluence, camera);
                }
            }

        } else {
            if (this.wakeMesh) this.wakeMesh.visible = false;
            this.velocity.multiplyScalar(1 - (playerConfig.deceleration * dt));
            // Reset smoke
            this.smokeAccumulator = 0.05;
        }

        // Clamp Speed
        if (this.velocity.length() > playerConfig.maxSpeed) {
            this.velocity.setLength(playerConfig.maxSpeed);
        }

        // Effective Move
        const smoothFactor = Math.min(1.0, 3.0 * dt);
        this.smoothedVelocityInfluence.lerp(velocityInfluence, smoothFactor);
        const totalVelocity = this.velocity.clone().add(this.smoothedVelocityInfluence);
        this.position.add(totalVelocity.clone().multiplyScalar(dt));

        this.checkBoundaries();
        this.handlePlanetCollisions(celestialBodies);

        // Shooting
        if (this.shootCooldown > 0) {
            this.shootCooldown -= dt;
        }

        if (this.controls.fire && this.shootCooldown <= 0) {
            this.fireLaser();
            this.shootCooldown = 0.25;
        }

        // Removed updateLasers call, now handled by ProjectileSystem
        this.mesh.position.copy(this.position);
    }

    checkBoundaries() {
        const maxRadius = dustConfig.fieldRadius;
        const distSq = this.position.x * this.position.x + this.position.z * this.position.z;
        if (distSq > maxRadius * maxRadius) {
            const dist = Math.sqrt(distSq);
            this.position.multiplyScalar(maxRadius / dist);

            const normal = this.position.clone().normalize();
            const velDot = this.velocity.dot(normal);
            if (velDot > 0) {
                this.velocity.sub(normal.multiplyScalar(velDot));
            }
        }
    }

    handlePlanetCollisions(celestialBodies) {
        if (!celestialBodies) return;

        for (const body of celestialBodies) {
            const dx = this.position.x - body.position.x;
            const dz = this.position.z - body.position.z;
            const distSq = dx * dx + dz * dz;

            const collisionDist = body.sizeRadius + 0.5;

            if (distSq < collisionDist * collisionDist) {
                const dist = Math.sqrt(distSq);
                const overlap = collisionDist - dist;

                const normal = new THREE.Vector3(dx, 0, dz);
                if (dist > 0.001) {
                    normal.divideScalar(dist);
                } else {
                    normal.set(0, 0, 1);
                }

                const planetVelRad = body.velocity.dot(normal);
                const playerVelRad = this.velocity.dot(normal);

                if (playerVelRad < planetVelRad) {
                    const diff = planetVelRad - playerVelRad;
                    this.velocity.addScaledVector(normal, diff);
                }

                if (overlap > 0) {
                    this.position.addScaledVector(normal, overlap);
                }
            }
        }
    }

    fireLaser() {
        if (!this.projectileSystemReference) return;

        const laserColor = this.hasAttacked ? 0xff0000 : (playerConfig.laserColor !== undefined ? playerConfig.laserColor : 0x00ff00);

        const scale = playerConfig.modelScale || 1.0;
        const sideOffset = 1.0 * scale;
        const verticalOffset = -0.2 * scale;
        const forwardOffset = -1.0 * scale;

        const offsets = [-sideOffset, sideOffset];

        offsets.forEach(offset => {
            const initialPos = new THREE.Vector3(offset, verticalOffset, forwardOffset).applyEuler(this.rotation).add(this.position);

            this.projectileSystemReference.spawnLaser(
                initialPos,
                this.mesh.quaternion,
                laserColor,
                this
            );
        });
    }

    // API
    getPosition() {
        return this.position;
    }

    getEnginePosition() {
        const offsetZ = playerConfig.vortexOffsetZ || 1.5;
        const offset = new THREE.Vector3(0, 0, offsetZ).applyEuler(this.rotation);
        return this.position.clone().add(offset);
    }

    getRandomWakePosition() {
        // Same as engine pos roughly
        return this.getEnginePosition();
    }

    setDebugVisibility(visible) {
        // Base logic for debug
        if (typeof visible === 'object') {
            if (this.axisHelper) this.axisHelper.visible = visible.playerAxis; // Usually we want separate debug?
            if (this.boundaryLine) this.boundaryLine.visible = visible.playerRing;
            if (this.vortexLine) this.vortexLine.visible = visible.playerVortex;
        } else {
            // Fallback
        }
    }

    setSelected(isSelected) {
        if (this.axisHelper) {
            this.axisHelper.visible = isSelected;
        }
    }
}
