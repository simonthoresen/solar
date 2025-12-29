import * as THREE from 'three';

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
            // getVelocityAt now takes a target. We can reuse a temp one or add directly?
            // "totalVel.add(body.getVelocityAt(position))"
            // body.getVelocityAt writes to its target argument.
            // Let's pass _tempBodyVel to body, then add to total (target).

            body.getVelocityAt(position, _tempBodyVel);
            target.add(_tempBodyVel);
        }

        // 2. Player Wake (if applicable)
        if (player && player.getVelocityAt) {
            // Assuming player.getVelocityAt might still return new Vector, or we update it too?
            // For now, Player wake is not heavily used/optimized yet, but let's handle it safely.
            const pVel = player.getVelocityAt(position);
            target.add(pVel);
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
                    // Scale arrow length by force magnitude, clamped?
                    // Let's keep it visible but maybe scaled slightly
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
