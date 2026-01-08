import * as THREE from 'three';
import { playerConfig } from '../config.js';

const _tempBodyVel = new THREE.Vector3();

export class VelocityField {
    constructor(scene) {
        this.scene = scene;
        this.arrowHelperGroup = new THREE.Group();
        this.arrowHelperGroup.visible = false;
        this.scene.add(this.arrowHelperGroup);

        // Cache arrows
        this.arrows = [];
    }


    // Calculate total velocity influence at a position
    // Optimized: target is optional, defaults to new vector if not provided (for non-hot paths)
    // ships parameter can be a single ship or array of ships
    calculateTotalVelocity(position, celestialBodies, ships, target = new THREE.Vector3()) {
        target.set(0, 0, 0);

        // 1. Celestial Bodies
        for (const body of celestialBodies) {
            body.getVelocityAt(position, _tempBodyVel);
            target.add(_tempBodyVel);
        }

        // Convert ships to array for uniform handling
        const shipsArray = ships ? (Array.isArray(ships) ? ships : [ships]) : [];

        // 2. Ships' Wake and Exhaust Fields
        for (const ship of shipsArray) {
            if (!ship) continue;

            // 2a. Ship Wake (rotation field when very close)
            if (ship.getVelocityAt) {
                const pVel = ship.getVelocityAt(position);
                target.add(pVel);
            }

            // 2b. Ship Engine Exhaust (check all engine exhausts)
            // Use per-thruster exhaust field dimensions and forces
            // Only apply exhaust forces when thrusters are active
            if (ship.getExhaustPositions && ship.controls && ship.controls.thrust) {
                const exhaustPositions = ship.getExhaustPositions();
                const exhaustDirections = ship.getExhaustDirections ? ship.getExhaustDirections() : [];
                const exhaustDimensions = ship.getExhaustDimensions ? ship.getExhaustDimensions() : [];
                const exhaustForces = ship.getExhaustForces ? ship.getExhaustForces() : [];

                exhaustPositions.forEach((exhaustPos, index) => {
                    // Get dimensions and force for this thruster
                    const dimensions = exhaustDimensions[index] || { width: 3.0, length: 6.0 };
                    const exhaustForce = exhaustForces[index] || 10.0;
                    const halfWidth = dimensions.width / 2.0;
                    const exhaustLength = dimensions.length;

                    // Check if particle is within rectangular exhaust field
                    // Get vector from exhaust center to particle
                    const toParticle = position.clone().sub(exhaustPos);

                    if (exhaustDirections[index]) {
                        const exhaustDir = exhaustDirections[index].clone().normalize();

                        // Get perpendicular direction (cross with up vector)
                        const perpDir = new THREE.Vector3().crossVectors(exhaustDir, new THREE.Vector3(0, 1, 0)).normalize();

                        // Project onto exhaust direction (backward from thruster)
                        const alongExhaust = toParticle.dot(exhaustDir);

                        // Project onto perpendicular direction (width)
                        const acrossExhaust = toParticle.dot(perpDir);

                        // Check if within rectangular bounds (directional - only behind thruster)
                        // Exhaust center is at thruster + exhaustLength/2, so particles from
                        // -exhaustLength/2 to +exhaustLength/2 relative to center are in field
                        if (alongExhaust >= -exhaustLength/2 && alongExhaust <= exhaustLength/2 &&
                            Math.abs(acrossExhaust) <= halfWidth) {
                            // Particle is within exhaust field - apply per-thruster force
                            target.x += exhaustDir.x * exhaustForce;
                            target.y += exhaustDir.y * exhaustForce;
                            target.z += exhaustDir.z * exhaustForce;
                        }
                    } else {
                        // Legacy fallback: use simple distance check
                        const distSq = toParticle.lengthSq();
                        const halfLength = exhaustLength / 2.0;
                        if (distSq < halfLength * halfLength) {
                            target.x -= ship.velocity.x * exhaustForce;
                            target.y -= ship.velocity.y * exhaustForce;
                            target.z -= ship.velocity.z * exhaustForce;
                        }
                    }
                });
            }
        }

        return target;
    }

    // Update visuals: Draw arrows for list of items
    // Items format: [{ position: THREE.Vector3, force: THREE.Vector3 }, ...]
    updateVisuals(items) {
        // Pool management: Ensure enough arrow helpers
        while (this.arrows.length < items.length) {
            // Create new arrow
            // dir, origin, length, color, headLength, headWidth
            const arrow = new THREE.ArrowHelper(
                new THREE.Vector3(1, 0, 0),
                new THREE.Vector3(0, 0, 0),
                1,
                0xffff00,
                0.2,
                0.1
            );
            this.arrows.push(arrow);
            this.arrowHelperGroup.add(arrow);
        }

        // Hide unused arrows
        for (let i = 0; i < this.arrows.length; i++) {
            if (i >= items.length) {
                this.arrows[i].visible = false;
            } else {
                const item = items[i];
                const forceLen = item.force.length();

                if (forceLen > 0.1) {
                    this.arrows[i].visible = true;
                    this.arrows[i].position.copy(item.position);
                    this.arrows[i].setDirection(item.force.clone().normalize());

                    const length = Math.min(forceLen * 0.5, 3); // Cap length
                    this.arrows[i].setLength(length, length * 0.2, length * 0.1);
                } else {
                    this.arrows[i].visible = false;
                }
            }
        }
    }

    setVisible(visible) {
        this.arrowHelperGroup.visible = visible;
    }

    // Legacy support to prevent crash if old calls exist (optional, but good for safety)
    clearForces() { }
    update(time) { }
    addForce() { }
    getForceAtPosition() { return new THREE.Vector3(); }
}
