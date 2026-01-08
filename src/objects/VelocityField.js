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
    calculateTotalVelocity(position, celestialBodies, player, target = new THREE.Vector3()) {
        target.set(0, 0, 0);

        // 1. Celestial Bodies
        for (const body of celestialBodies) {
            body.getVelocityAt(position, _tempBodyVel);
            target.add(_tempBodyVel);
        }

        // 2. Player Wake (if applicable)
        if (player && player.getVelocityAt) {
            // Assuming player.getVelocityAt might still return new Vector, or we update it too?
            const pVel = player.getVelocityAt(position);
            target.add(pVel);
        }

        // 3. Player Engine Exhaust (check all engine exhausts)
        // Use per-thruster exhaust field dimensions and forces
        if (player && player.getExhaustPositions) {
            const exhaustPositions = player.getExhaustPositions();
            const exhaustDirections = player.getExhaustDirections ? player.getExhaustDirections() : [];
            const exhaustDimensions = player.getExhaustDimensions ? player.getExhaustDimensions() : [];
            const exhaustForces = player.getExhaustForces ? player.getExhaustForces() : [];

            exhaustPositions.forEach((exhaustPos, index) => {
                // Get dimensions and force for this thruster
                const dimensions = exhaustDimensions[index] || { width: 3.0, length: 6.0 };
                const exhaustForce = exhaustForces[index] || 10.0;
                const halfWidth = dimensions.width / 2.0;
                const halfLength = dimensions.length / 2.0;

                // Check if particle is within rectangular exhaust field
                // Get vector from exhaust center to particle
                const toParticle = position.clone().sub(exhaustPos);

                if (exhaustDirections[index]) {
                    const exhaustDir = exhaustDirections[index].clone().normalize();

                    // Get perpendicular direction (cross with up vector)
                    const perpDir = new THREE.Vector3().crossVectors(exhaustDir, new THREE.Vector3(0, 1, 0)).normalize();

                    // Project onto exhaust direction (Z in local space)
                    const alongExhaust = toParticle.dot(exhaustDir);

                    // Project onto perpendicular direction (X in local space)
                    const acrossExhaust = toParticle.dot(perpDir);

                    // Check if within rectangular bounds
                    if (Math.abs(alongExhaust) <= halfLength && Math.abs(acrossExhaust) <= halfWidth) {
                        // Particle is within exhaust field - apply per-thruster force
                        target.x += exhaustDir.x * exhaustForce;
                        target.y += exhaustDir.y * exhaustForce;
                        target.z += exhaustDir.z * exhaustForce;
                    }
                } else {
                    // Legacy fallback: use simple distance check
                    const distSq = toParticle.lengthSq();
                    if (distSq < halfLength * halfLength) {
                        target.x -= player.velocity.x * exhaustForce;
                        target.y -= player.velocity.y * exhaustForce;
                        target.z -= player.velocity.z * exhaustForce;
                    }
                }
            });
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
