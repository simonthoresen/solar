import * as THREE from 'three';

export class CelestialBody {
    constructor(scene, position, radius, color, forceRadius, parent = null, orbitDist = 0, orbitSpeed = 0) {
        this.scene = scene;
        this.radius = radius;
        this.color = color;
        this.forceRadius = forceRadius;

        this.parent = parent;
        this.orbitDist = orbitDist;
        this.orbitSpeed = orbitSpeed;
        this.orbitAngle = Math.random() * Math.PI * 2;

        if (parent) {
            const px = parent.position.x + Math.cos(this.orbitAngle) * orbitDist;
            const pz = parent.position.z + Math.sin(this.orbitAngle) * orbitDist;
            this.position = new THREE.Vector3(px, 0, pz);
        } else {
            this.position = position.clone();
        }

        // Vortex parameters
        this.forceMagnitude = 5; // Configurable strength
        this.rotationSpeed = 0.5; // Visual rotation

        this.initMesh();
        this.initForceVisual();
        this.initAxisVisual();
    }

    initMesh() {
        let detail = 0;
        if (this.radius >= 2.0) {
            detail = 2; // High detail for Sun and large planets
        } else if (this.radius >= 0.5) {
            detail = 1; // Medium detail for Earth-sized planets
        }
        // Small moons get detail 0 (default initialized)

        const geometry = new THREE.IcosahedronGeometry(this.radius, detail);
        const material = new THREE.MeshLambertMaterial({ color: this.color, wireframe: true });
        this.mesh = new THREE.Mesh(geometry, material);
        this.updatePosition();
        this.scene.add(this.mesh);
    }

    initForceVisual() {
        const curve = new THREE.EllipseCurve(
            0, 0,            // ax, aY
            this.forceRadius, this.forceRadius,           // xRadius, yRadius
            0, 2 * Math.PI,  // aStartAngle, aEndAngle
            false,            // aClockwise
            0                 // aRotation
        );

        const points = curve.getPoints(50);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });

        // Create the final object to add to the scene
        this.ring = new THREE.LineLoop(geometry, material);
        this.ring.rotation.x = -Math.PI / 2; // Lie flat on XZ plane
        this.updatePosition();

        this.scene.add(this.ring);
    }

    initAxisVisual() {
        const points = [];
        points.push(new THREE.Vector3(0, -this.radius * 2, 0));
        points.push(new THREE.Vector3(0, this.radius * 2, 0));

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });

        this.axisLine = new THREE.Line(geometry, material);

        // Attach to mesh so it rotates with the body
        this.mesh.add(this.axisLine);
    }

    update(dt) {
        // Orbital Logic
        if (this.parent) {
            // Clockwise orbit: increase angle (visual clockwise in default top-down view)
            this.orbitAngle += this.orbitSpeed * dt;
            // Calculate target pos
            const px = this.parent.position.x + Math.cos(this.orbitAngle) * this.orbitDist;
            const pz = this.parent.position.z + Math.sin(this.orbitAngle) * this.orbitDist;
            this.position.set(px, 0, pz);
        }

        this.updatePosition();

        // Rotate body visually on local Y axis
        // Clockwise self-rotation: decrease angle
        this.mesh.rotation.y -= this.rotationSpeed * dt;
    }

    updatePosition() {
        this.mesh.position.copy(this.position);
        if (this.ring) {
            this.ring.position.copy(this.position);
            this.ring.position.y = 0;
        }
    }

    // Get force vector at specific position
    getForceAt(worldPosition) {
        const dist = worldPosition.distanceTo(this.position);

        if (dist <= this.forceRadius && dist > 0.1) {
            // Tangential force
            // Vector from center to point
            const radial = worldPosition.clone().sub(this.position);
            // Tangent: Cross product of Radial x Up (0,1,0) for Clockwise
            // (Previous was Up x Radial = CCW)
            const tangent = new THREE.Vector3().crossVectors(radial, new THREE.Vector3(0, 1, 0)).normalize();

            return tangent.multiplyScalar(this.forceMagnitude);
        }
        return new THREE.Vector3(0, 0, 0);
    }

    setDebugVisibility(visible) {
        if (this.ring) {
            this.ring.visible = visible;
        }
        if (this.axisLine) {
            this.axisLine.visible = visible;
        }
    }
}
