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

        // 3. Player Engine Vortex
        if (player && player.getEnginePosition) {
            const enginePos = player.getEnginePosition();
            const distSq = position.distanceToSquared(enginePos);
            const vortexRadius = playerConfig.vortexRadius || 1.0;

            if (distSq < vortexRadius * vortexRadius) {
                // Apply inverted player velocity
                // Use temp vector to avoid allocation if possible, but player.velocity is safe to clone/negate?
                // Actually, let's just use a scratch vector or direct add if we want performance.
                // target.add(player.velocity.clone().negate());

                // Better:
                // Boost the force to overcome smoothing
                const multiplier = 5.0;
                target.x -= player.velocity.x * multiplier;
                target.y -= player.velocity.y * multiplier;
                target.z -= player.velocity.z * multiplier;
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
