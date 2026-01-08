import * as THREE from 'three';
import { playerConfig, dustConfig } from '../config.js';
import { ShipModels } from './ShipModels.js';
import { Turret } from './Turret.js';
import { EngineEffects } from '../utils/EngineEffects.js';
import { DebugState } from '../DebugState.js';

// Scratch vectors for flame/exhaust calculation
const _tempFlameDiff = new THREE.Vector3();
const _tempFlameLocal = new THREE.Vector3();
const _tempSmokeInfluence = new THREE.Vector3();

export class Spaceship {
    constructor(scene, color, position, type = 'viper') {
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
        this.initFlames();

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
        this.setDebugVisibility({ playerAxis: false, playerRing: false, shipExhaust: false });

        // Trigger particles
        if (this.particleSystemReference) {
            this.particleSystemReference.spawnExplosion(this.position, this.color, 150);
            this.particleSystemReference.spawnBlastSphere(this.position, this.color);
        }

        // Trigger physics callback
        if (this.onExplode) {
            this.onExplode(this.position, 20.0); // Radius matches visual blast sphere
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
        this.thrusterOffsets = modelData.thrusterOffsets; // Array of Vector3
        this.thrusterConfigs = modelData.thrusterConfigs || []; // Array of thruster configurations
        this.baseEngineOffsets = modelData.thrusterOffsets.map(v => v.clone()); // Store base offsets
        this.animations = modelData.animations || []; // Array of animation data
        this.thrusterDirections = null; // Will be calculated dynamically for animated engines

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

        this.initExhaustDebug();
        this.initTurrets(modelData.turretMounts);
    }

    initExhaustDebug() {
        this.exhaustRings = [];
        this.exhaustArrows = [];

        if (!this.thrusterOffsets || this.thrusterOffsets.length === 0) {
            this.thrusterOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        // Create a rectangular exhaust field for each thruster using per-thruster configs
        this.thrusterOffsets.forEach((thrusterOffset, index) => {
            // Get config for this thruster, or use defaults
            const config = this.thrusterConfigs[index] || {
                exhaustWidth: 3.0,
                exhaustLength: 6.0,
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
            exhaustRect.visible = false;
            this.mesh.add(exhaustRect);
            this.exhaustRings.push(exhaustRect);

            // Add arrow to show force direction applied by exhaust field
            // Arrow originates from center of the exhaust rectangle
            const exhaustCenter = exhaustLength / 2.0;
            const arrow = new THREE.ArrowHelper(
                new THREE.Vector3(0, 0, 1), // Direction (will be updated in update())
                new THREE.Vector3(thrusterOffset.x, 0, thrusterOffset.z + exhaustCenter),
                2.0, // Length (will be updated based on thrust state)
                0x00ffff, // Cyan color
                0.4, // Head length
                0.2 // Head width
            );
            arrow.visible = false;
            this.mesh.add(arrow);
            this.exhaustArrows.push(arrow);
        });

        // Keep backward compatibility - first exhaust ring is the "main" exhaust ring
        this.exhaustRing = this.exhaustRings[0];
    }

    initTurrets(mounts) {
        if (!mounts) return;

        mounts.forEach(mount => {
            const turret = new Turret(this.mesh, mount.position, mount.type);
            this.turrets.push(turret);
        });
    }

    initFlames() {
        if (!this.thrusterOffsets || this.thrusterOffsets.length === 0) {
            this.thrusterOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        this.flameMeshes = EngineEffects.initFlames(this.thrusterOffsets, this.mesh);

        // Keep backward compatibility
        this.flameMesh = this.flameMeshes[0];
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

            EngineEffects.updateFlameVisuals(this.flameMeshes, dt);

            this.smokeAccumulator = EngineEffects.emitSmoke(
                this.thrusterOffsets,
                (offset) => this.getThrusterPositionFromOffset(offset),
                this.smokeAccumulator,
                dt,
                particleSystem,
                velocityField,
                camera,
                celestialBodies,
                _tempSmokeInfluence,
                playerConfig.smokeEmissionInterval || 0.05,
                this.thrusterConfigs
            );

        } else {
            // Hide all flames
            EngineEffects.hideFlames(this.flameMeshes);
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

        // Update Animations
        this.updateAnimations(dt);

        // Shooting
        if (this.shootCooldown > 0) {
            this.shootCooldown -= dt;
        }

        if (this.controls.fire && this.shootCooldown <= 0) {
            this.fireLaser();
            this.shootCooldown = 0.25;
        }

        // Removed updateLasers call, now handled by ProjectileSystem

        // Update debug visuals based on global state
        this.updateDebugVisuals();

        this.mesh.position.copy(this.position);
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

                // If this animation has dynamic engines, update engine offsets AND directions
                if (anim.dynamicEngines && anim.thrusterOffsets) {
                    const newOffsets = [];
                    const newDirections = [];

                    anim.thrusterOffsets.forEach(baseOffset => {
                        // Calculate engine position
                        const rotatedOffset = baseOffset.clone();
                        rotatedOffset.applyEuler(anim.mesh.rotation);
                        rotatedOffset.add(anim.mesh.position);
                        newOffsets.push(rotatedOffset);

                        // Calculate engine exhaust direction
                        // Engine points in +Z direction in its local space
                        const localExhaustDir = new THREE.Vector3(0, 0, 1);
                        // Apply engine group rotation
                        const groupExhaustDir = localExhaustDir.applyEuler(anim.mesh.rotation);
                        // Apply ship rotation to get world-space direction
                        const worldExhaustDir = groupExhaustDir.applyEuler(this.rotation);
                        newDirections.push(worldExhaustDir);
                    });

                    this.thrusterOffsets = newOffsets;
                    this.thrusterDirections = newDirections;
                    this.updateFlamePositions();
                    this.updateExhaustPositions();
                }
            }
        });
    }

    updateFlamePositions() {
        EngineEffects.updateFlamePositions(this.flameMeshes, this.thrusterOffsets);
    }

    updateExhaustPositions() {
        // Update rectangle positions and arrows for each thruster
        this.thrusterOffsets.forEach((thrusterOffset, index) => {
            // Get config for this thruster
            const config = this.thrusterConfigs[index] || {
                exhaustWidth: 3.0,
                exhaustLength: 6.0,
                exhaustForce: 10.0,
                smokeSize: 0.3,
                smokeColor: 0xaaaaaa,
                smokeLifetime: 3.0
            };

            const exhaustLength = config.exhaustLength;
            const exhaustForce = config.exhaustForce;

            // Update rectangle position
            if (this.exhaustRings[index]) {
                // Position rectangle starting at the thruster, extending backward
                this.exhaustRings[index].position.set(thrusterOffset.x, 0, thrusterOffset.z);
            }

            // Update arrow
            if (this.exhaustArrows[index]) {
                // Update arrow position to forward edge of exhaust rectangle (middle of forward edge)
                const arrowPos = new THREE.Vector3(thrusterOffset.x, 0, thrusterOffset.z + exhaustLength);
                this.exhaustArrows[index].position.copy(arrowPos);

                // Arrows are children of the ship mesh, so use LOCAL exhaust direction
                // Thruster exhaust always points backward (+Z) in local space
                const localExhaustDir = new THREE.Vector3(0, 0, 1);

                // Arrow length equals exhaust rectangle length when thrusters active
                const arrowLength = this.controls.thrust ? exhaustLength : 0.0;

                // Update arrow direction and length
                this.exhaustArrows[index].setDirection(localExhaustDir);
                if (arrowLength > 0) {
                    this.exhaustArrows[index].setLength(arrowLength, arrowLength * 0.2, arrowLength * 0.1);
                    this.exhaustArrows[index].visible = this.exhaustArrows[index].visible; // preserve visibility from debug state
                } else {
                    // Hide arrow when thrusters are off
                    this.exhaustArrows[index].visible = false;
                }
            }
        });
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

    getThrusterPosition() {
        return EngineEffects.getThrusterPosition(this.thrusterOffsets, this.rotation, this.position);
    }

    getThrusterPositionFromOffset(thrusterOffset) {
        return EngineEffects.getThrusterPositionFromOffset(thrusterOffset, this.rotation, this.position);
    }

    getRandomFlamePosition() {
        // Pick a random thruster
        if (this.thrusterOffsets && this.thrusterOffsets.length > 0) {
            const randomOffset = this.thrusterOffsets[Math.floor(Math.random() * this.thrusterOffsets.length)];
            return this.getThrusterPositionFromOffset(randomOffset);
        }
        return this.getThrusterPosition();
    }

    getExhaustPositions() {
        // Return exhaust center positions for all thrusters
        const exhaustPositions = [];

        if (this.thrusterOffsets && this.thrusterOffsets.length > 0) {
            this.thrusterOffsets.forEach((thrusterOffset, index) => {
                // Get config for this thruster
                const config = this.thrusterConfigs[index] || {
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0
                };

                const exhaustLength = config.exhaustLength;
                const exhaustCenter = exhaustLength / 2.0;

                // Exhaust field center is at thruster + exhaustCenter in Z direction
                const exhaustOffset = new THREE.Vector3(
                    thrusterOffset.x,
                    0,
                    thrusterOffset.z + exhaustCenter
                );
                const rotatedOffset = exhaustOffset.applyEuler(this.rotation);
                const worldPos = this.position.clone().add(rotatedOffset);
                exhaustPositions.push(worldPos);
            });
        } else {
            // Fallback
            const fallbackOffset = new THREE.Vector3(0, 0, 3.0 + 0.5);
            const rotatedOffset = fallbackOffset.applyEuler(this.rotation);
            exhaustPositions.push(this.position.clone().add(rotatedOffset));
        }

        return exhaustPositions;
    }

    getExhaustDimensions() {
        // Return the exhaust field dimensions for each thruster
        const dimensions = [];

        this.thrusterOffsets.forEach((_, index) => {
            const config = this.thrusterConfigs[index] || {
                exhaustWidth: 3.0,
                exhaustLength: 6.0
            };

            dimensions.push({
                width: config.exhaustWidth,
                length: config.exhaustLength
            });
        });

        return dimensions;
    }

    getExhaustForces() {
        // Return the exhaust force for each thruster
        const forces = [];

        this.thrusterOffsets.forEach((_, index) => {
            const config = this.thrusterConfigs[index] || {
                exhaustForce: 10.0
            };

            forces.push(config.exhaustForce);
        });

        return forces;
    }

    getExhaustDirections() {
        // Return the exhaust direction for each thruster (the direction smoke should be pushed)
        // Use stored directions if available (for animated thrusters), otherwise calculate from ship rotation

        if (this.thrusterDirections) {
            // Use pre-calculated directions (updated by animations)
            return this.thrusterDirections;
        }

        // Calculate from ship rotation (for non-animated thrusters)
        const exhaustDirections = [];

        if (this.thrusterOffsets && this.thrusterOffsets.length > 0) {
            this.thrusterOffsets.forEach(() => {
                // Thruster exhaust direction in local space is +Z
                const localExhaustDir = new THREE.Vector3(0, 0, 1);
                // Apply ship rotation to get world-space direction
                const worldExhaustDir = localExhaustDir.applyEuler(this.rotation);
                exhaustDirections.push(worldExhaustDir);
            });
        } else {
            // Fallback
            const localExhaustDir = new THREE.Vector3(0, 0, 1);
            const worldExhaustDir = localExhaustDir.applyEuler(this.rotation);
            exhaustDirections.push(worldExhaustDir);
        }

        return exhaustDirections;
    }

    // Update debug visuals based on global DebugState
    updateDebugVisuals() {
        const isSelected = DebugState.isSelected(this);

        // Axis helper: visible if selected OR debug enabled
        if (this.axisHelper) {
            this.axisHelper.visible = isSelected || DebugState.get('playerAxis');
        }

        // Boundary ring: visible if debug enabled
        if (this.boundaryLine) {
            this.boundaryLine.visible = DebugState.get('playerRing');
        }

        // Exhaust visualization: visible if debug enabled
        if (this.exhaustRings) {
            const exhaustVisible = DebugState.get('shipExhaust');
            this.exhaustRings.forEach(line => {
                line.visible = exhaustVisible;
            });
        }
        if (this.exhaustArrows) {
            const exhaustVisible = DebugState.get('shipExhaust');
            this.exhaustArrows.forEach(arrow => {
                arrow.visible = exhaustVisible;
            });
        }
    }

    // DEPRECATED: Kept for backwards compatibility, does nothing now
    // Debug state is managed globally via DebugState singleton
    setDebugVisibility(visible) {
        // No-op: Debug visuals now reference global DebugState directly
    }

    setSelected(isSelected) {
        // Update global selection state
        if (isSelected) {
            DebugState.setSelected(this);
        } else if (DebugState.getSelected() === this) {
            DebugState.setSelected(null);
        }
        // Visual update happens in updateDebugVisuals()
    }
}
