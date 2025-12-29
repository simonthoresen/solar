import * as THREE from 'three';
import { playerConfig } from '../config.js';

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.position = new THREE.Vector3(0, 0, 15); // Start closer
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = new THREE.Euler(0, 0, 0);

        this.initMesh();

        // Input state
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            shift: false
        };

        this.initInput();
    }

    initMesh() {
        // Player is a small cube
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color: 0x0000ff });
        this.mesh = new THREE.Mesh(geometry, material);
        // Shrink
        this.mesh.scale.set(0.5, 0.5, 0.5);

        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);

        // Axis helper for debug
        this.axisHelper = new THREE.AxesHelper(2);
        this.axisHelper.visible = false;
        this.mesh.add(this.axisHelper);
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) this.keys[k] = true;
            if (e.key === 'Shift') this.keys.shift = true;
        });
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) this.keys[k] = false;
            if (e.key === 'Shift') this.keys.shift = false;
        });
    }

    update(dt, velocityInfluence = new THREE.Vector3()) { // Renamed external input
        // Rotation
        const turnSpeed = playerConfig.turnSpeed;
        if (this.keys.a) this.rotation.y += turnSpeed * dt;
        if (this.keys.d) this.rotation.y -= turnSpeed * dt;

        this.mesh.rotation.y = this.rotation.y;

        // Thrust
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(this.rotation);

        // Acceleration
        if (this.keys.w) {
            this.velocity.add(forward.multiplyScalar(playerConfig.acceleration * dt));
        }
        if (this.keys.s) {
            this.velocity.add(forward.multiplyScalar(-playerConfig.acceleration * dt));
        }

        // Apply External Velocity Influence (from VelocityGrid)
        // Previous logic: velocity += force * dt
        // New logic: "Velocity ... should be added to the velocity of all particles"
        // Wait, "Rotation velocity... and velocity of celestial body... added to velocity of all particles"
        // If VelocityGrid returns a VELOCITY vector (m/s), then we should ADD it directly? 
        // Or is it a force that causes acceleration? 
        // "any particle within that radius will receive a rotation velocity... velocity of celestial body should also be added"
        // This implies: ParticleVelocity = ParticleMomentumVelocity + EnvironmentVelocity?
        // OR ParticleVelocity += EnvironmentVelocity * dt?
        // IF it's a "Velocity Field" (like wind), usually objects act like:
        // ObjectVel += (WindVel - ObjectVel) * dragFactor * dt.
        // BUT user said: "added to the velocity... simplier... always just about adding actual velocity vectors"
        // If I just add VelocityField to this.velocity every frame, it will accelerate infinitely?
        // "Added to the velocity"
        // If I am in a river moving 5m/s. My speed is MySwimmingSpeed + RiverSpeed.
        // If I stop swimming, I move at RiverSpeed.
        // So: EffectiveVelocity = InternalVelocity + ExternalVelocity.
        // Then Position += EffectiveVelocity * dt.
        // This is DIFFERENT from "Force" (Acceleration).
        // Let's implement this interpretation:
        // this.velocity (momentum) is updated by thrust/drag.
        // this.position += (this.velocity + velocityInfluence) * dt.

        // WAIT. Existing particle system did: `p.velocity.add(totalForce * dt)`. This IS acceleration.
        // User says "refactor all the force functionality... much simpler... adding actual velocity vectors"
        // If usage is: `p.mesh.position.add(p.velocity * dt)`, and we want adding velocity vectors.
        // Maybe: `p.mesh.position.add( (p.velocity + envVelocity) * dt )`? 
        // OR `p.velocity += envVelocity`? (This would accumulate infinitely).
        // User phrasing "receive a rotation velocity" implies an instantaneous component.
        // Let's assume: The Object's Motion = Internal Velocity + External Velocity.

        // Update Position

        // Friction/Deceleration
        this.velocity.multiplyScalar(1 - (playerConfig.deceleration * dt));

        // Clamp Speed
        if (this.velocity.length() > playerConfig.maxSpeed) {
            this.velocity.setLength(playerConfig.maxSpeed);
        }

        // Effective Move
        const totalVelocity = this.velocity.clone().add(velocityInfluence); // Add influence here

        this.position.add(totalVelocity.clone().multiplyScalar(dt));
        this.mesh.position.copy(this.position);
    }

    // For Debug / Game loop 
    getPosition() {
        return this.position;
    }

    getRandomWakePosition() {
        const offset = new THREE.Vector3(0, 0, 1.5).applyEuler(this.rotation);
        return this.position.clone().add(offset);
    }

    setDebugVisibility(visible) {
        if (this.axisHelper) this.axisHelper.visible = visible;
    }

    // Wake function (if needed for VelocityField, though mostly particles affect it not vice versa?)
    // Game.js calculates force FROM bodies TO player.
    // Does player impart velocity? "Player Wake" was in ForceGrid. 
    // If we want Player to push particles, we need getVelocityAt.
    getVelocityAt(pos) {
        // Simple wake: push away or drag? 
        // Previously: Repel close, drag behind?
        // Let's keep it simple or return 0 if not specified.
        // Returning 0 for now to keep refactor clean unless asked.
        return new THREE.Vector3(0, 0, 0);
    }
}
