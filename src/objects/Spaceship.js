import * as THREE from 'three';
import { playerConfig, dustConfig } from '../config.js';
import { ShipModels } from './ShipModels.js';
import { Turret } from './Turret.js';

// Scratch vectors for wake calculation
const _tempWakeDiff = new THREE.Vector3();
const _tempWakeLocal = new THREE.Vector3();
const _tempSmokeInfluence = new THREE.Vector3();

export class Spaceship {
    constructor(scene, color, position, type = 'standard') {
        this.scene = scene;
        this.color = color;
        this.type = type;
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

        this.turrets = [];
        this.onExplode = null;

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
            this.particleSystemReference.spawnExplosion(this.position, this.color, 150);
            this.particleSystemReference.spawnBlastSphere(this.position, this.color);
        }

        // Trigger physics callback
        if (this.onExplode) {
            this.onExplode(this.position, 10.0); // Radius matches visual blast sphere
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

    applyImpulse(force) {
        this.velocity.add(force);
    }

    initMesh(color) {
        // Use Factory
        const modelData = ShipModels.createModel(this.type, color);

        this.mesh = modelData.mesh;
        this.collisionRadius = modelData.collisionRadius;
        this.engineOffset = modelData.engineOffset;

        // Apply scale from config if needed (or keep modelScale 1.0)
        const scale = playerConfig.modelScale || 1.0;
        this.mesh.scale.setScalar(scale);

        // Update collision radius with scale
        this.collisionRadius *= scale;
        this.sizeRadius = this.collisionRadius; // Update HUD size

        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);

        // Axis helper for debug
        this.axisHelper = new THREE.AxesHelper(2);
        this.axisHelper.visible = false;
        this.axisHelper.scale.set(1, 1, -1);
        this.mesh.add(this.axisHelper);

        // Debug Collision Boundary 
        const curve = new THREE.EllipseCurve(0, 0, this.collisionRadius, this.collisionRadius, 0, 2 * Math.PI, false, 0);
        const points = curve.getPoints(32);
        const boundaryGeom = new THREE.BufferGeometry().setFromPoints(points);
        const boundaryMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.boundaryLine = new THREE.Line(boundaryGeom, boundaryMat);
        this.boundaryLine.rotation.x = -Math.PI / 2;
        this.boundaryLine.visible = false;
        this.mesh.add(this.boundaryLine);

        this.initVortexDebug();
        this.initTurrets(modelData.turretMounts);
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

    initTurrets(mounts) {
        if (!mounts) return;

        mounts.forEach(mount => {
            const turret = new Turret(this.mesh, mount.position, mount.type);
            this.turrets.push(turret);
        });
    }

    initWake() {
        const height = 3.0; // Wake length
        // Radius matches engine somewhat?
        const radius = 0.5;

        const geometry = new THREE.ConeGeometry(radius, height, 8);
        geometry.rotateX(Math.PI / 2);

        // Offset wake to start at engine pos
        // engineOffset is usually +Z. Wake should be behind it (+Z).
        // Cone origin is center. height/2 moves base to 0? No.
        // ConeGeometry: base at y=-height/2, tip at y=height/2.
        // Rotated X 90: tip at z=-height/2 (forward), base at z=height/2 (back).
        // We want tip at engineOffset, extending backwards.
        // Actually wake usually starts small and gets big? 
        // Or starts big?
        // Let's rely on previous logic roughly, but offset by this.engineOffset.z

        const zStart = this.engineOffset ? this.engineOffset.z : 0.5;

        // Shift geometry so tip is at 0,0,0, extending to +Z
        geometry.translate(0, 0, height / 2);

        // Now mesh is at local 0. We move mesh to engineOffset.

        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 });
        this.wakeMesh = new THREE.Mesh(geometry, material);
        this.wakeMesh.visible = false;
        this.wakeMesh.position.set(0, 0, zStart);

        this.wakeLight = new THREE.PointLight(0xffff00, 2, 10);
        this.wakeLight.position.set(0, 0, 1.0); // Local to wakeMesh
        this.wakeMesh.add(this.wakeLight);

        this.mesh.add(this.wakeMesh);
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

        // Soft Clamp Logic: Allow overspeed but decay back to max
        const currentSpeed = this.velocity.length();
        if (currentSpeed > playerConfig.maxSpeed) {
            const decay = 2.0 * dt;
            const newSpeed = THREE.MathUtils.lerp(currentSpeed, playerConfig.maxSpeed, decay);
            this.velocity.setLength(newSpeed);
        }

        // Effective Move
        const smoothFactor = Math.min(1.0, 3.0 * dt);
        this.smoothedVelocityInfluence.lerp(velocityInfluence, smoothFactor);
        const totalVelocity = this.velocity.clone().add(this.smoothedVelocityInfluence);
        this.position.add(totalVelocity.clone().multiplyScalar(dt));

        this.checkBoundaries();
        this.handlePlanetCollisions(celestialBodies);

        // Determine Target for Turrets
        let targetPos = null;

        // Note: Spaceship doesn't inherently know if it's player or NPC logic-wise here easily unless we pass extra info.
        // But we passed 'camera' to update().
        // If this is the Player, we aim at where the camera looks.
        // If NPC, we aim at 'ships' (target)? 
        // We need a better way to define target. 
        // Let's assume subclasses set `this.aimTarget` or we derive it.

        // Quick hack: check if this is player by checking if controls.turn is driven by input? 
        // Or better: Spaceship doesn't aim. Player/NPC subclasses aim.
        // BUT: Turret update needs to happen HERE or be called.

        // Actually, let's allow `update` simply to accept an aim position?
        // Or we calculate it here.

        // For Player: Aim at point far ahead of Camera.
        // For NPC: Aim at current target (if any).

        if (this.constructor.name === 'Player') {
            // We need camera forward. We have camera.
            if (camera) {
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                // Point far away
                targetPos = camera.position.clone().add(forward.multiplyScalar(100));
            }
        } else if (this.constructor.name === 'NPC') {
            if (this.target) {
                targetPos = this.target.position ? this.target.position : null;
            } else {
                // Forward
                const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);
                targetPos = this.position.clone().add(forward.multiplyScalar(20));
            }
        }

        // Update Turrets
        this.turrets.forEach(turret => {
            turret.update(dt, targetPos);
        });

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

            const collisionDist = body.sizeRadius + this.collisionRadius;

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

        if (this.turrets.length > 0) {
            // Fire from turrets
            this.turrets.forEach(turret => {
                const { position, direction } = turret.getFirePositionAndDirection();
                // We need quaternion for spawnLaser. LookAt the direction?
                // spawnLaser takes (position, quaternion, color, owner)
                // We can construct quaternion from direction.

                const dummy = new THREE.Object3D();
                dummy.lookAt(direction); // Valid for direction vector? lookAt expects target position.
                // dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), direction); // Assumes Z forward

                // Let's use lookAt target: pos + direction
                const target = position.clone().add(direction);
                dummy.position.copy(position);
                dummy.lookAt(target);

                this.projectileSystemReference.spawnLaser(
                    position,
                    dummy.quaternion,
                    laserColor,
                    this
                );
            });
        } else {
            // Fallback: Fire from center/sides (Legacy behavior if no turrets)
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
    }

    // API
    getPosition() {
        return this.position;
    }

    getEnginePosition() {
        const offsetZ = this.engineOffset ? this.engineOffset.z : 1.5;
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
