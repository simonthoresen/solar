import * as THREE from 'three';
import { dustConfig } from '../config.js';

export class ProjectileSystem {
    constructor(scene) {
        this.scene = scene;
        this.lasers = [];
    }

    spawnLaser(position, quaternion, color, sourceShip) {
        const laserLength = 5.0;
        const laserRadius = 0.2;

        const geometry = new THREE.CylinderGeometry(laserRadius, laserRadius, laserLength, 8);
        geometry.rotateX(Math.PI / 2); // Align with Z
        const material = new THREE.MeshBasicMaterial({ color: color });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.quaternion.copy(quaternion);

        this.scene.add(mesh);

        // Velocity: Local -Z direction rotated by quaternion
        const velocity = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).multiplyScalar(150);

        this.lasers.push({
            mesh: mesh,
            velocity: velocity,
            life: 5.0,
            sourceShip: sourceShip,
            damage: sourceShip.laserDamage || 25
        });
    }

    update(dt, celestialBodies, ships = [], particleSystem = null) {
        const maxRadius = dustConfig.fieldRadius;
        const laserRadius = 0.2;

        for (let i = this.lasers.length - 1; i >= 0; i--) {
            const laser = this.lasers[i];

            // Move
            const nextPos = laser.mesh.position.clone().add(laser.velocity.clone().multiplyScalar(dt));

            let hasHit = false;

            // 1. Check Planets
            if (celestialBodies) {
                for (const body of celestialBodies) {
                    // Simple sphere check
                    const distSq = nextPos.distanceToSquared(body.position);
                    const hitRad = body.sizeRadius + 0.5;
                    if (distSq < hitRad * hitRad) {
                        hasHit = true;
                        break;
                    }
                }
            }

            // 2. Check Ships
            if (!hasHit && ships) {
                for (const ship of ships) {
                    if (ship === laser.sourceShip || !ship.isActive) continue; // Don't hit self or dead ships

                    const distSq = nextPos.distanceToSquared(ship.position);
                    // Hit radius approx 1.5 (Match previous logic)
                    if (distSq < 2.25) {
                        ship.takeDamage(laser.damage);

                        // Apply impulse
                        // Apply impulse
                        // Direction is normalized laser velocity (direction of beam)
                        const impulseDir = laser.velocity.clone().normalize();
                        const impulseMagnitude = 15; // Hardcoded impulse strength
                        ship.applyImpulse(impulseDir.multiplyScalar(impulseMagnitude));

                        hasHit = true;
                        break;
                    }
                }
            }

            if (hasHit) {
                this.removeLaser(i);
                continue;
            }

            // 3. Particle Interaction
            if (particleSystem) {
                particleSystem.checkLaserCollisions(nextPos, laserRadius, laser.velocity);
            }

            // Update Position
            laser.mesh.position.copy(nextPos);
            laser.life -= dt;

            // 4. Boundary / Life Check
            const distSq = laser.mesh.position.lengthSq();
            const dist = Math.sqrt(distSq);

            if (dist > maxRadius) {
                // Fade out at edge
                laser.mesh.material.transparent = true;
                const overshoot = dist - maxRadius;
                const fadeDist = 50;
                const opacity = 1.0 - Math.min(1.0, overshoot / fadeDist);
                laser.mesh.material.opacity = opacity;

                if (opacity <= 0.01 || laser.life <= 0) {
                    this.removeLaser(i);
                }
            } else if (laser.life <= 0) {
                this.removeLaser(i);
            }
        }
    }

    removeLaser(index) {
        const laser = this.lasers[index];
        this.scene.remove(laser.mesh);
        laser.mesh.geometry.dispose();
        laser.mesh.material.dispose();
        this.lasers.splice(index, 1);
    }
}
