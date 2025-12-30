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
        this.smoothedVelocityInfluence = new THREE.Vector3(0, 0, 0); // For smoothing
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

        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);

        // Axis helper for debug
        this.axisHelper = new THREE.AxesHelper(2);
        this.axisHelper.visible = false;
        this.mesh.add(this.axisHelper);

        // Debug Collision Boundary (Radius 0.5)
        // Parent mesh scale is 1.0 (default).
        // Collision logic uses 0.5 (half-width or radius).
        const curve = new THREE.EllipseCurve(
            0, 0,            // ax, aY
            0.5, 0.5,        // xRadius, yRadius
            0, 2 * Math.PI,  // aStartAngle, aEndAngle
            false,           // aClockwise
            0                // aRotation
        );
        const points = curve.getPoints(32);
        const boundaryGeom = new THREE.BufferGeometry().setFromPoints(points);
        const boundaryMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.boundaryLine = new THREE.Line(boundaryGeom, boundaryMat);

        // Rotate to XZ plane (Mesh is Y-up? Player logic uses Y-rotation. Box is axis aligned.)
        // Ellipse is in XY. We want XZ. Rotate X 90.
        // Rotate to XZ plane
        this.boundaryLine.rotation.x = -Math.PI / 2;
        this.boundaryLine.visible = false;
        this.mesh.add(this.boundaryLine);
        this.initVortexDebug();
    }

    initVortexDebug() {
        const radius = playerConfig.vortexRadius || 1.0;
        const curve = new THREE.EllipseCurve(
            0, 0,            // ax, aY
            radius, radius,  // xRadius, yRadius
            0, 2 * Math.PI,  // aStartAngle, aEndAngle
            false,           // aClockwise
            0                // aRotation
        );
        const points = curve.getPoints(32);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff00ff }); // Magenta for vortex
        this.vortexLine = new THREE.Line(geometry, material);

        // Vortex is at local (0, 0, 1.5).
        this.vortexLine.position.set(0, 0, 1.5);
        this.vortexLine.rotation.x = -Math.PI / 2;
        this.vortexLine.visible = false;
        this.mesh.add(this.vortexLine);
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
                const pulse = 1.0 + Math.sin(Date.now() * 0.02) * 0.2 + (Math.random() - 0.5) * 0.5;
                const lenPulse = 1.0 + (Math.random() - 0.5) * 0.8;
                this.wakeMesh.scale.set(pulse, pulse, lenPulse);

                // 3. Color Switching
                if (Math.random() > 0.8) {
                    const colors = [0xffff00, 0xff4400, 0xffffff, 0xffaa00, 0xff0000];
                    const col = colors[Math.floor(Math.random() * colors.length)];
                    this.wakeMesh.material.color.setHex(col);
                    if (this.wakeLight) this.wakeLight.color.setHex(col);
                }
            }
        } else {
            if (this.wakeMesh) this.wakeMesh.visible = false;
        }
        if (this.keys.s) {
            this.velocity.add(forward.multiplyScalar(-playerConfig.acceleration * dt));
        }

        // Friction/Deceleration
        if (!this.keys.w && !this.keys.s) {
            this.velocity.multiplyScalar(1 - (playerConfig.deceleration * dt));
        }

        // Clamp Speed
        if (this.velocity.length() > playerConfig.maxSpeed) {
            this.velocity.setLength(playerConfig.maxSpeed);
        }

        // Effective Move
        // Smooth the velocity influence
        const smoothFactor = Math.min(1.0, 3.0 * dt);
        this.smoothedVelocityInfluence.lerp(velocityInfluence, smoothFactor);

        const totalVelocity = this.velocity.clone().add(this.smoothedVelocityInfluence);

        this.position.add(totalVelocity.clone().multiplyScalar(dt));
        this.mesh.position.copy(this.position);
    }

    // For Debug / Game loop 
    getPosition() {
        return this.position;
    }

    getEnginePosition() {
        // Engine is at local (0, 0, 1.5) rotated by ship rotation.
        // Assuming box is centered at 0,0,0. 
        // 1.5 is behind the ship (since forward is -Z).
        // Wait, forward is -Z. So back is +Z.
        // Box is size 1. So back face is at +0.5.
        // 1.5 is a bit further back. 
        const offset = new THREE.Vector3(0, 0, 1.5).applyEuler(this.rotation);
        return this.position.clone().add(offset);
    }

    getRandomWakePosition() {
        const offset = new THREE.Vector3(0, 0, 1.5).applyEuler(this.rotation);
        return this.position.clone().add(offset);
    }

    setDebugVisibility(visible) {
        if (typeof visible === 'object') {
            if (this.axisHelper) this.axisHelper.visible = visible.axis;
            if (this.boundaryLine) this.boundaryLine.visible = visible.axis; // Link boundary to axis
            if (this.vortexLine) this.vortexLine.visible = visible.vortex;
        } else {
            if (this.axisHelper) this.axisHelper.visible = visible;
            if (this.boundaryLine) this.boundaryLine.visible = visible;
            if (this.vortexLine) this.vortexLine.visible = false;
        }
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

        const material = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 }); // Increased opacity
        this.wakeMesh = new THREE.Mesh(geometry, material);
        this.wakeMesh.visible = false;

        // Add PointLight for glow
        this.wakeLight = new THREE.PointLight(0xffff00, 2, 10);
        // Cone geometry was translated by (0, 0, height/2 + 0.5)
        // So center of visual cone is at that Z.
        this.wakeLight.position.set(0, 0, height / 2 + 0.5);
        this.wakeMesh.add(this.wakeLight);

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
        const minZ = 0.5;
        const maxZ = minZ + this.wakeHeight;

        if (_tempWakeLocal.z >= minZ && _tempWakeLocal.z <= maxZ) {
            const rSq = _tempWakeLocal.x * _tempWakeLocal.x + _tempWakeLocal.y * _tempWakeLocal.y;
            // Rough cylinder check for speed
            if (rSq < this.wakeRadius * this.wakeRadius) {
                // Add velocity: Push BACKWARDS (relative to player) = +Z local.
                const push = 5.0;

                // Rotate force to world space
                const force = new THREE.Vector3(0, 0, push).applyQuaternion(this.mesh.quaternion);

                target.copy(force);
            }
        }

        return target;
    }
}
