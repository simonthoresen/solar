import * as THREE from 'three';
import { playerConfig } from '../config.js';

// Scratch vectors for wake calculation
const _tempWakeDiff = new THREE.Vector3();
const _tempWakeLocal = new THREE.Vector3();
const _tempWakeForward = new THREE.Vector3(0, 0, -1); // Player forward is -Z

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.position = new THREE.Vector3(0, 0, 15); // Start closer
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = new THREE.Euler(0, 0, 0);

        this.initMesh();
        this.initWake();

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
            if (this.wakeMesh) {
                this.wakeMesh.visible = true;

                // Animate Wake
                // 1. Rotation (Spin)
                this.wakeMesh.rotation.z += 15 * dt;

                // 2. Pulse Size/Length
                // Random jitter + sine wave
                const pulse = 1.0 + Math.sin(Date.now() * 0.02) * 0.2 + (Math.random() - 0.5) * 0.5;
                const lenPulse = 1.0 + (Math.random() - 0.5) * 0.8;
                this.wakeMesh.scale.set(pulse, pulse, lenPulse);

                // 3. Color Switching
                // Variants of Yellow, Red, White
                if (Math.random() > 0.8) {
                    const colors = [0xffff00, 0xff4400, 0xffffff, 0xffaa00, 0xff0000];
                    const col = colors[Math.floor(Math.random() * colors.length)];
                    this.wakeMesh.material.color.setHex(col);
                }
            }
        } else {
            if (this.wakeMesh) this.wakeMesh.visible = false;
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

    // ... (rest of class) ...

    initWake() {
        // Wake: 2x Length (3.0), 1.5x Width (Radius 0.75)
        const height = 3.0; // Was 1.5
        const radius = 0.75; // Was 0.5

        const geometry = new THREE.ConeGeometry(radius, height, 8); // Increased segments for smoother look with larger size
        geometry.rotateX(Math.PI / 2); // Point back (towards +Z local)
        // Offset: Center of cone is at height/2. We want tip at player (0,0,0) or back face?
        // ConeGeometry is centered at 0.
        // If we rotate X 90, it points +Z. Base is at -height/2?? No.
        // Default Cone: Base at -height/2, Tip at +height/2 (Y axis).
        // Rotate X 90: Y->Z. Tip at +Z, Base at -Z.
        // We want wake BEHIND player. Player forward is -Z. So wake should point +Z.
        // Center should be shifted so tip is near 0.
        // Shift +height/2 in Z?
        // Let's rely on translate.
        geometry.translate(0, 0, height / 2 + 0.5); // Move behind nicely

        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.2 }); // Lower opacity for larger wake
        this.wakeMesh = new THREE.Mesh(geometry, material);
        this.wakeMesh.visible = false;

        this.mesh.add(this.wakeMesh);

        this.wakeHeight = height;
        this.wakeRadius = radius;
    }

    // Get velocity influence at specific position
    getVelocityAt(worldPosition, target = new THREE.Vector3()) {
        target.set(0, 0, 0);

        // Only apply wake if thrusting
        if (!this.keys.w) return target;

        // Transform worldPosition to Local Space
        _tempWakeDiff.subVectors(worldPosition, this.position);

        // Un-rotate to align with local axes
        // Apply inverse quaternion of player
        _tempWakeLocal.copy(_tempWakeDiff).applyQuaternion(this.mesh.quaternion.clone().invert());

        // Check if inside wake cone
        // Wake points +Z. 
        // Z range: [0.5, 0.5 + wakeHeight] approximately (due to translation)
        // Let's check precise bounds from geometry logic:
        // Translate Z by height/2 + 0.5.
        // Cone local Z range (before translate): [-h/2, h/2].
        // After translate: [0.5, 0.5 + h]. 

        const minZ = 0.5;
        const maxZ = minZ + this.wakeHeight;

        if (_tempWakeLocal.z >= minZ && _tempWakeLocal.z <= maxZ) {
            // Check Radius at this Z
            // Cone gets wider as Z increases (Tip is at minZ? No Wait.)
            // ConeGeometry (Y-up): Tip at +Y/2? Or -Y/2?
            // "BufferGeometry is centered". Tip usually at +height/2.
            // Rotate X 90 -> Tip at +Z.
            // Translate +Z -> Tip is furthest away?
            // "Wake is a simple triangle/cone behind the player"
            // If geometry.rotateX(Math.PI/2), Tip points +Z.
            // Usually wake narrows away from boat? Or expands?
            // Boat wake expands.
            // Cone tip should be at player (start), expanding outwards.
            // If Tip is at +Z (end), checks out? 
            // Wait, Tip is a point. Base is a circle.
            // If Tip is at +Z (furthest), then it narrows away. That's a "reverse" wake (exhaust).
            // Usually exhaust expands. 
            // Let's assume user wants a "Wake" = Expanding trail.
            // So Base (circle) should be at far end. Tip at player.
            // Default THREE.Cone: Tip at +Y/2. Base at -Y/2.
            // Rotate X 90: Tip at +Z/2. Base at -Z/2.
            // We want Tip at 0 (Player). Base at +Z (Behind).
            // So we need to shift by -height/2? No.
            // We want Tip (Z positive) to be at Z=0?
            // Shift by -height/2.
            // BUT previously I put translate(0, 0, height/2). This pushes it POSITIVE Z.
            // So Tip is at +height (+0.5). Base is at 0.
            // This means the wide part is near the player. The point is far away.
            // This is "reverse wake".

            // Let's fix orientation to be logical: Tip near player, Base far away.
            // Base at +Z range.
            // Tip should be at Z ~ 0.5.
            // Existing: Tip at +Z. Base at -Z.
            // To have Base at +Z: Rotate X -90? (Tip at -Z, Base at +Z).
            // Then shift +Z.
            // Let's verify visual later. For now, logic:

            // Let's simplify: Check approximate cylinder or bounding box for "in range"
            // Then accurate cone check.

            // Radius at distance Z (linear interpolation)
            // If Tip is at Z_tip and Base at Z_base.
            // r = radius * (dist_from_tip / height).

            // Let's assume standard "Exhaust":
            // Push velocity backwards (Local +Z).

            const rSq = _tempWakeLocal.x * _tempWakeLocal.x + _tempWakeLocal.y * _tempWakeLocal.y;
            // Rough cylinder check for speed
            if (rSq < this.wakeRadius * this.wakeRadius) {
                // Add velocity: Push BACKWARDS (relative to player) = +Z local.
                // "Wake applies velocity".
                // Usually pushes things AWAY from player motion.
                // Player moves -Z. Wake pushes +Z.

                // Magnitude:
                const push = 5.0;

                // Rotate force to world space
                const force = new THREE.Vector3(0, 0, push).applyQuaternion(this.mesh.quaternion);

                target.copy(force);
            }
        }

        return target;
    }
}
