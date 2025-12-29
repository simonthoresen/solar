import * as THREE from 'three';
import { playerConfig } from '../config.js';

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.position = new THREE.Vector3(-5, 0, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = 0; // Y-rotation angle

        this.acceleration = playerConfig.acceleration;
        this.maxSpeed = playerConfig.maxSpeed;
        this.turnSpeed = playerConfig.turnSpeed;
        this.deceleration = playerConfig.deceleration;

        this.keys = { w: false, a: false, d: false };

        this.initMesh();
        this.setupControls();
    }

    initMesh() {
        // 1x1x1 Cube
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color: 0x0000ff });
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);

        // Axis visualization
        // "render the axis of the cube as 2 unit long lines and label them as x, y, and z"
        this.axes = new THREE.Group();
        this.axes.visible = false;
        this.mesh.add(this.axes); // Attach to mesh to rotate with it

        const axisLen = 2;

        // X Axis (Red)
        this.createAxisLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(axisLen, 0, 0), 0xff0000);
        // Y Axis (Green)
        this.createAxisLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axisLen, 0), 0x00ff00);
        // Z Axis (Blue)
        this.createAxisLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -axisLen), 0x0000ff);

        // Labels (using simple HTML overlay or Sprites? Sprites are easier in 3D scene)
        // Since I don't have a font loader handy for 3D text, I'll use CanvasTexture with Sprites.
        this.createLabel('X', new THREE.Vector3(axisLen + 0.2, 0, 0), 'red');
        this.createLabel('Y', new THREE.Vector3(0, axisLen + 0.2, 0), 'green');
        this.createLabel('Z', new THREE.Vector3(0, 0, -axisLen - 0.2), 'blue');

        // Wake
        // "triangle directly behind the cube... as wide as the cube (1), start behind it, extend 3 units"
        // Setup geometry: Triangle flat on Y=0
        const wakeGeo = new THREE.BufferGeometry();
        // Points relative to player local space
        // Player faces -Z (typically) or +Z? Let's assume +Z is forward for now, but usually -Z is forward in Three.js objects.
        // Wait, "w moves the player forwards".
        // Let's assume local +Z is "forward" for simplicity of math, or local -Z.
        // If Model faces Z, "behind" is -Z?
        // Let's stick to standard Three.js: -Z is forward. So behind is +Z.
        // Width 1, Starts at back face (z=0.5?), extend 3 units (to z=3.5).
        // Triangle: (0, 0, 3.5), (0.5, 0, 0.5), (-0.5, 0, 0.5)

        const vertices = new Float32Array([
            -0.5, 0, 1.0, // Left base
            0.5, 0, 1.0, // Right base
            0.0, 0, 4.0  // Tip
        ]);
        wakeGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide });
        this.wake = new THREE.Mesh(wakeGeo, wakeMat);
        this.wake.visible = false;
        this.mesh.add(this.wake);
    }

    createAxisLine(start, end, color) {
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const mat = new THREE.LineBasicMaterial({ color: color });
        const line = new THREE.Line(geo, mat);
        this.axes.add(line);
    }

    createLabel(text, position, colorStr) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = colorStr;
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 32, 32);

        const map = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: map });
        const sprite = new THREE.Sprite(material);
        sprite.position.copy(position);
        sprite.scale.set(1, 1, 1);
        this.axes.add(sprite);
    }

    setupControls() {
        window.addEventListener('keydown', (e) => {
            if (this.keys.hasOwnProperty(e.key.toLowerCase())) {
                this.keys[e.key.toLowerCase()] = true;
            }
        });
        window.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.key.toLowerCase())) {
                this.keys[e.key.toLowerCase()] = false;
            }
        });
    }

    update(dt, externalForce) {
        // Rotation
        if (this.keys.a) {
            this.rotation += this.turnSpeed * dt;
        }
        if (this.keys.d) {
            this.rotation -= this.turnSpeed * dt;
        }

        // Update mesh rotation
        this.mesh.rotation.y = this.rotation;

        // Movement vector (Forward is -Z in local space, so rotated vector)
        const forwardDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);

        // Thrust
        if (this.keys.w) {
            this.velocity.add(forwardDir.multiplyScalar(this.acceleration * dt));
            this.wake.visible = true;
        } else {
            this.wake.visible = false;
        }

        // Apply external forces
        if (externalForce) {
            this.velocity.add(externalForce.clone().multiplyScalar(dt));
        }

        // Apply friction / deceleration
        const decency = 1 - this.deceleration * dt;
        this.velocity.multiplyScalar(decency > 0 ? decency : 0);

        // Limit speed
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity.setLength(this.maxSpeed);
        }

        // Position update
        this.position.add(this.velocity.clone().multiplyScalar(dt));
        this.mesh.position.copy(this.position);
    }

    getPosition() {
        return this.mesh.position;
    }

    // Check if a world point is inside the wake triangle
    isPointInWake(worldPoint) {
        if (!this.wake.visible) return false;

        // Convert world point to Player's local space
        const localPoint = worldPoint.clone();
        this.mesh.worldToLocal(localPoint);

        // Check if inside triangle in local space (ignoring Y)
        // Triangle vertices: A(-0.5, 1.0), B(0.5, 1.0), C(0.0, 4.0)
        const px = localPoint.x;
        const pz = localPoint.z;

        // Bounding box check first
        if (pz < 1.0 || pz > 4.0) return false;
        if (px < -0.5 || px > 0.5) return false;

        // Barycentric Check
        const x1 = -0.5, z1 = 1.0;
        const x2 = 0.5, z2 = 1.0;
        const x3 = 0.0, z3 = 4.0;

        // Denominator
        const den = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
        const a = ((z2 - z3) * (px - x3) + (x3 - x2) * (pz - z3)) / den;
        const b = ((z3 - z1) * (px - x3) + (x1 - x3) * (pz - z3)) / den;
        const c = 1 - a - b;

        return a >= 0 && a <= 1 && b >= 0 && b <= 1 && c >= 0 && c <= 1;
    }

    getWakeForce() {
        const forceDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        return forceDir.multiplyScalar(20);
    }

    // Get force exerted by player on explicit point
    getForceAt(worldPosition) {
        if (!this.wake.visible) return new THREE.Vector3(0, 0, 0);

        // Optimization: Quick distance check?
        if (worldPosition.distanceTo(this.position) > 10) return new THREE.Vector3(0, 0, 0);

        if (this.isPointInWake(worldPosition)) {
            return this.getWakeForce();
        }
        return new THREE.Vector3(0, 0, 0);
    }

    setDebugVisibility(visible) {
        if (this.axes) {
            this.axes.visible = visible;
        }
    }

    getRandomWakePosition() {
        // Wake is a triangle in local space:
        // Tip at (0, 0, 4), Base center at (0, 0, 1), Base width 1 (-0.5 to 0.5)

        // Random Z between 1 and 4
        const z = 1.0 + Math.random() * 3.0; // 1 to 4

        // Width at this Z (linear interpolation)
        // At z=1, width=1. At z=4, width=0.
        // Ratio t = (z - 1) / 3   (0 at base, 1 at tip)
        // width = 1 * (1 - t)
        const t = (z - 1.0) / 3.0;
        const width = 1.0 * (1.0 - t);

        // Random X within [-width/2, width/2]
        const x = (Math.random() - 0.5) * width;

        // Local point
        const localPos = new THREE.Vector3(x, 0, z); // Y is 0 (flat)

        // Transform to world
        // We can use mesh.localToWorld, but it modifies the vector in place
        return this.mesh.localToWorld(localPos);
    }
}
