import { Spaceship } from './Spaceship.js';
import * as THREE from 'three';

export class NPC extends Spaceship {
    constructor(scene, type, position, celestialBodies, player) {
        // Different colors per type
        let color = 0xffffff;
        switch (type) {
            case 'hopper': color = 0x00ff00; break; // Green
            case 'speedster': color = 0xffaa00; break; // Orange
            case 'kamikaze': color = 0xff0000; break; // Red
            case 'shooter': color = 0xff00ff; break; // Magenta
        }

        super(scene, color, position);
        this.type = type;
        this.celestialBodies = celestialBodies;
        this.player = player;

        // State for behaviors
        this.targetBody = null;
        this.decisionTimer = 0;

        // Avoidance randomizer
        this.wanderOffset = 0;

        this.initPlayerLine();
        this.isSelected = false;
    }

    updateControls(dt) {
        this.decisionTimer -= dt;

        switch (this.type) {
            case 'hopper': this.updateHopper(dt); break;
            case 'speedster': this.updateSpeedster(dt); break;
            case 'kamikaze': this.updateKamikaze(dt); break;
            case 'shooter': this.updateShooter(dt); break;
        }
    }

    updateHopper(dt) {
        // Pick random planet, fly to it, then pick another
        if (!this.targetBody || this.decisionTimer <= 0) {
            this.pickRandomPlanet();
            this.decisionTimer = 15; // Give up after 15s
        }

        if (this.targetBody) {
            // Fly towards target
            this.flyTowards(this.targetBody.position);

            // If close, pick new
            if (this.position.distanceTo(this.targetBody.position) < this.targetBody.sizeRadius + 15) {
                this.pickRandomPlanet();
            }
        }

        this.controls.thrust = true;
    }

    updateSpeedster(dt) {
        // Fly forward always
        this.controls.thrust = true;

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);
        let avoidTurn = 0;

        // Avoid planets
        // Check closest?
        for (const body of this.celestialBodies) {
            const toBody = body.position.clone().sub(this.position);
            const dist = toBody.length();
            if (dist < body.sizeRadius + 20) { // Detection range
                // Check if in front
                if (forward.dot(toBody.normalize()) > 0.4) {
                    // It's ahead. Steer away using cross product
                    const cross = forward.clone().cross(toBody);
                    if (cross.y > 0) {
                        avoidTurn = 1; // Planet on left -> Turn Right
                    } else {
                        avoidTurn = -1; // Planet on right -> Turn Left
                    }
                }
            }
        }

        if (avoidTurn !== 0) {
            this.controls.turn = avoidTurn;
        } else {
            // Wander slightly
            if (Math.random() < 0.05) this.wanderOffset = (Math.random() - 0.5);
            this.controls.turn = this.wanderOffset;
        }
    }

    updateKamikaze(dt) {
        if (this.player && this.player.isActive) {
            this.flyTowards(this.player.position);
            this.controls.thrust = true;

            // Mark as enemy if charging
            if (this.position.distanceTo(this.player.position) < 100) {
                this.hasAttacked = true;
            }
        }
    }

    updateShooter(dt) {
        if (this.player && this.player.isActive) {
            const dist = this.position.distanceTo(this.player.position);

            this.flyTowards(this.player.position);

            // Shoot if aligned
            const toPlayer = this.player.position.clone().sub(this.position).normalize();
            const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);

            if (dist < 60 && forward.dot(toPlayer) > 0.95) {
                this.controls.fire = true;
                this.hasAttacked = true; // Became hostile
            } else {
                this.controls.fire = false;
            }

            // Speed control
            if (dist < 20) {
                this.controls.thrust = false;
            } else {
                this.controls.thrust = true;
            }
        }
    }

    flyTowards(targetPos) {
        const toTarget = targetPos.clone().sub(this.position);
        toTarget.normalize();

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);
        const cross = forward.clone().cross(toTarget);

        // Simple P-controller steering
        if (cross.y > 0.1) {
            this.controls.turn = -1; // Left
        } else if (cross.y < -0.1) {
            this.controls.turn = 1; // Right
        } else {
            this.controls.turn = 0;
        }
    }

    pickRandomPlanet() {
        if (this.celestialBodies.length > 0) {
            // Filter out sun maybe? ID usually 'sun'.
            const planets = this.celestialBodies.filter(b => b.configId !== 'sun');
            if (planets.length > 0) {
                this.targetBody = planets[Math.floor(Math.random() * planets.length)];
            } else {
                this.targetBody = this.celestialBodies[0];
            }
        }
    }

    initPlayerLine() {
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });

        this.playerLine = new THREE.Line(geometry, material);
        this.playerLine.visible = false;
        this.playerLine.frustumCulled = false;
        this.scene.add(this.playerLine);
    }

    setSelected(isSelected) {
        super.setSelected(isSelected); // Call base handles axisHelper
        this.isSelected = isSelected;
        this.updatePlayerLine();
    }

    update(dt, velocityField, celestialBodies = [], particleSystem = null, projectileSystem = null, camera = null, ships = []) {
        if (!this.isActive) {
            if (this.playerLine) this.playerLine.visible = false;
            return;
        }
        super.update(dt, velocityField, celestialBodies, particleSystem, projectileSystem, camera, ships);
        this.updatePlayerLine();
    }

    updatePlayerLine() {
        if (!this.playerLine || !this.player) return;

        // Visibility Check: Selected AND Player Active
        const shouldBeVisible = this.isSelected && this.player.isActive;
        this.playerLine.visible = shouldBeVisible;

        if (!shouldBeVisible) return;

        const positions = this.playerLine.geometry.attributes.position.array;

        // Start: NPC
        positions[0] = this.position.x;
        positions[1] = this.position.y;
        positions[2] = this.position.z;

        // End: Player
        const pPos = this.player.getPosition();
        positions[3] = pPos.x;
        positions[4] = pPos.y;
        positions[5] = pPos.z;

        this.playerLine.geometry.attributes.position.needsUpdate = true;

        // Update Color
        let isAggressive = false;
        if (this.hasAttacked) isAggressive = true;
        if (this.type === 'kamikaze' || this.type === 'shooter') isAggressive = true;

        const color = isAggressive ? 0xff0000 : 0x00ff00;
        if (this.playerLine.material.color.getHex() !== color) {
            this.playerLine.material.color.setHex(color);
        }
    }
}
