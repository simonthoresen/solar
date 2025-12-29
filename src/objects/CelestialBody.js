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

        this.velocity = new THREE.Vector3(0, 0, 0);

        this.initMesh();
        this.initForceVisual();
        this.initAxisVisual();
        this.initDirectionVisual();
        this.initPlayerLineVisual();
        this.initVelocityVisual();
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
        this.ring.visible = false;
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
        this.axisLine.visible = false;

        // Attach to mesh so it rotates with the body
        this.mesh.add(this.axisLine);
    }

    initDirectionVisual() {
        if (!this.parent) return;

        const points = [
            new THREE.Vector3(0, 0, 0), // Placeholder, updated in loop
            new THREE.Vector3(0, 0, 0)
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 }); // Red line

        this.directionLine = new THREE.Line(geometry, material);
        this.directionLine.visible = false;
        this.directionLine.frustumCulled = false; // Important for dynamic lines

        // Add directly to scene (world space) because it connects two separate bodies
        this.scene.add(this.directionLine);
    }

    initPlayerLineVisual() {
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Green line

        this.playerLine = new THREE.Line(geometry, material);
        this.playerLine.visible = false;
        this.playerLine.frustumCulled = false; // Important for dynamic lines
        this.scene.add(this.playerLine);
    }

    initVelocityVisual() {
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 }); // Yellow line

        this.velocityLine = new THREE.Line(geometry, material);
        this.velocityLine.visible = false;
        this.velocityLine.frustumCulled = false;
        this.scene.add(this.velocityLine);
    }

    update(dt, playerPosition) {
        // Orbital Logic
        if (this.parent) {
            // Clockwise orbit: increase angle (visual clockwise in default top-down view)
            this.orbitAngle += this.orbitSpeed * dt;
            // Calculate target pos
            const px = this.parent.position.x + Math.cos(this.orbitAngle) * this.orbitDist;
            const pz = this.parent.position.z + Math.sin(this.orbitAngle) * this.orbitDist;
            this.position.set(px, 0, pz);

            // Calculate Velocity
            // x = r * cos(theta) -> dx/dt = -r * sin(theta) * dtheta/dt
            // z = r * sin(theta) -> dz/dt = r * cos(theta) * dtheta/dt
            // orbitSpeed is dtheta/dt (radians per second)
            const vx = -this.orbitDist * Math.sin(this.orbitAngle) * this.orbitSpeed;
            const vz = this.orbitDist * Math.cos(this.orbitAngle) * this.orbitSpeed;

            // Add parent velocity if parent is moving (recursive velocity)
            // But for now, let's assume parent (Sun) is static or we just want local orbital velocity.
            // If we want absolute world velocity, we should add orbit velocity to parent's velocity?
            // "velocity of the celestial body". Usually implies world velocity.
            // Let's check if parent has velocity?
            let pv = new THREE.Vector3(0, 0, 0);
            if (this.parent.velocity) {
                pv = this.parent.velocity;
            }

            this.velocity.set(vx, 0, vz).add(pv);

        } else {
            // Static body (Sun)
            this.velocity.set(0, 0, 0);
        }

        this.updatePosition();

        // Rotate body visually on local Y axis
        // Clockwise self-rotation: decrease angle
        this.mesh.rotation.y -= this.rotationSpeed * dt;

        // Update direction line
        if (this.directionLine && this.parent) {
            const positions = this.directionLine.geometry.attributes.position.array;
            // Point 0: Parent
            positions[0] = this.parent.position.x;
            positions[1] = 0;
            positions[2] = this.parent.position.z;
            // Point 1: Self
            positions[3] = this.position.x;
            positions[4] = 0;
            positions[5] = this.position.z;

            this.directionLine.geometry.attributes.position.needsUpdate = true;
        }

        // Update player line
        if (this.playerLine && playerPosition) {
            const positions = this.playerLine.geometry.attributes.position.array;
            // Point 0: Player
            positions[0] = playerPosition.x;
            positions[1] = playerPosition.y;
            positions[2] = playerPosition.z;
            // Point 1: Self
            positions[3] = this.position.x;
            positions[4] = this.position.y;
            positions[5] = this.position.z;

            this.playerLine.geometry.attributes.position.needsUpdate = true;

            // Distance Check for Color
            const distSq = this.position.distanceToSquared(playerPosition);
            // Player is 1x1x1, half-width is 0.5. Radius + 0.5
            const collisionDist = this.radius + 0.5;

            if (distSq < collisionDist * collisionDist) {
                this.playerLine.material.color.setHex(0xff0000); // Red
            } else {
                this.playerLine.material.color.setHex(0x00ff00); // Green
            }
        }

        // Update velocity line
        if (this.velocityLine) {
            const positions = this.velocityLine.geometry.attributes.position.array;

            // Start at body center
            positions[0] = this.position.x;
            positions[1] = this.position.y;
            positions[2] = this.position.z;

            // End at position + velocity direction * 5

            let dir = this.velocity.clone();
            if (dir.lengthSq() > 0.0001) {
                dir.normalize().multiplyScalar(5);
            }

            positions[3] = this.position.x + dir.x;
            positions[4] = this.position.y + dir.y;
            positions[5] = this.position.z + dir.z;

            this.velocityLine.geometry.attributes.position.needsUpdate = true;
        }
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
        if (this.directionLine) {
            this.directionLine.visible = visible;
        }
        if (this.playerLine) {
            this.playerLine.visible = visible;
        }
        if (this.velocityLine) {
            this.velocityLine.visible = visible;
        }
    }
}
