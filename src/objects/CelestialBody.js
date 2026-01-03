import * as THREE from 'three';

const _tempRadial = new THREE.Vector3();
const _tempTangent = new THREE.Vector3();
const _tempUp = new THREE.Vector3(0, 1, 0);

export class CelestialBody {
    constructor(scene, position, sizeRadius, color, rotationRadius, parent = null, orbitDistance = 0, orbitSpeed = 0, rotationSpeed = 0.5, configId = null, renderMode = 'lambert_wireframe') {
        this.scene = scene;
        this.configId = configId;
        this.sizeRadius = sizeRadius;
        this.color = color;
        this.rotationRadius = rotationRadius;
        this.renderMode = renderMode;

        this.parent = parent;
        this.orbitDistance = orbitDistance;
        this.orbitSpeed = orbitSpeed;
        this.orbitAngle = Math.random() * Math.PI * 2;

        if (parent) {
            const px = parent.position.x + Math.cos(this.orbitAngle) * orbitDistance;
            const pz = parent.position.z + Math.sin(this.orbitAngle) * orbitDistance;
            this.position = new THREE.Vector3(px, 0, pz);
        } else {
            this.position = position.clone();
        }

        // Vortex parameters
        this.rotationSpeed = rotationSpeed; // Visual rotation
        this.forceMagnitude = this.rotationSpeed * 10.0; // Scaled by rotation speed

        this.velocity = new THREE.Vector3(0, 0, 0);

        this.initMesh();
        this.initRotationVisual();
        this.initAxisVisual();
        this.initDirectionVisual();
        this.initPlayerLineVisual();
        this.initVelocityVisual();
        this.initSelectionVisual();
    }

    initSelectionVisual() {
        // Create a square on XZ plane
        const s = this.sizeRadius * 1.5; // Slightly larger than radius
        const points = [
            new THREE.Vector3(-s, 0, -s),
            new THREE.Vector3(s, 0, -s),
            new THREE.Vector3(s, 0, s),
            new THREE.Vector3(-s, 0, s)
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        // LineLoop closes the loop
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });

        this.selectionBox = new THREE.LineLoop(geometry, material);
        this.selectionBox.visible = false;

        // Add to mesh so it moves with it?
        // OR add to scene and update position?
        // If we add to mesh, it rotates with mesh.
        // Planet rotates on Y. Square should probably stay axis-aligned or rotate?
        // "Green square around selected planet" -> usually generic selection box doesn't rotate with planet spin.
        // But planet moves in orbit.
        // If we attach to Mesh, and Mesh rotates, the box rotates.
        // CelestialBody mesh rotates.
        // Let's attach to scene and update in updatePosition() for stability, 
        // OR attach to mesh and counteract rotation?
        // Simplest: Attach to mesh, let it spin. It's a square.
        // Actually, if it spins, it looks weird if it's a "selection box".
        // Better: CelestialBody has a 'mesh' which rotates?
        // this.mesh.rotation.y -= this.rotationSpeed * dt;
        // Yes.
        // Let's add it to the scene (like the ring) and update its position.
        this.scene.add(this.selectionBox);
    }

    setSelected(isSelected) {
        if (this.selectionBox) {
            this.selectionBox.visible = isSelected;
            this.updatePosition(); // Ensure it's at right spot immediately
        }
    }

    initMesh() {
        let detail = 0;
        if (this.sizeRadius >= 2.0) {
            detail = 2; // High detail for Sun and large planets
        } else if (this.sizeRadius >= 0.5) {
            detail = 1; // Medium detail for Earth-sized planets
        }
        // Small moons get detail 0 (default initialized)

        const geometry = new THREE.IcosahedronGeometry(this.sizeRadius, detail);
        this.mesh = new THREE.Mesh(geometry, this.createMaterial());
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.updatePosition();
        this.scene.add(this.mesh);
    }

    createMaterial() {
        const params = { color: this.color };
        const isWireframe = this.renderMode.includes('wireframe');

        // Extract base mode
        const mode = this.renderMode.split('_')[0];

        let material;
        switch (mode) {
            case 'toon':
                material = new THREE.MeshToonMaterial(params);
                break;
            case 'basic':
                material = new THREE.MeshBasicMaterial(params);
                break;
            case 'phong':
                material = new THREE.MeshPhongMaterial(params);
                break;
            case 'standard':
                material = new THREE.MeshStandardMaterial(params);
                break;
            case 'lambert':
            default:
                material = new THREE.MeshLambertMaterial(params);
                break;
        }

        material.wireframe = isWireframe;
        return material;
    }

    initRotationVisual() {
        const curve = new THREE.EllipseCurve(
            0, 0,            // ax, aY
            this.rotationRadius, this.rotationRadius,           // xRadius, yRadius
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
        points.push(new THREE.Vector3(0, -this.sizeRadius * 2, 0));
        points.push(new THREE.Vector3(0, this.sizeRadius * 2, 0));

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

    update(dt, player) { // Now accepts full player object
        const playerPosition = player.getPosition();
        // Orbital Logic
        if (this.parent) {
            // Clockwise orbit: increase angle (visual clockwise in default top-down view)
            this.orbitAngle += this.orbitSpeed * dt;
            // Calculate target pos
            const px = this.parent.position.x + Math.cos(this.orbitAngle) * this.orbitDistance;
            const pz = this.parent.position.z + Math.sin(this.orbitAngle) * this.orbitDistance;
            this.position.set(px, 0, pz);

            // Calculate Velocity
            const vx = -this.orbitDistance * Math.sin(this.orbitAngle) * this.orbitSpeed;
            const vz = this.orbitDistance * Math.cos(this.orbitAngle) * this.orbitSpeed;

            // Add parent velocity if parent is moving (recursive velocity)
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
            const collisionDist = this.sizeRadius + 0.5;

            if (distSq < collisionDist * collisionDist) {
                this.playerLine.material.color.setHex(0xff0000); // Red

                // Collision Push Logic
                // 1. Vector Planet -> Player (Normal)
                const normal = new THREE.Vector3().subVectors(playerPosition, this.position).normalize();

                // 2. Relative Velocity along Normal
                // We want PlayerVel_Rad >= PlanetVel_Rad
                // If PlayerVel_Rad < PlanetVel_Rad, we are penetrating (or not moving away fast enough).

                const planetVelRad = this.velocity.dot(normal);
                const playerVelRad = player.velocity.dot(normal);

                if (playerVelRad < planetVelRad) {
                    // We need to add an impulse to match the planet's speed
                    // Impulse = (PlanetVel - PlayerVel) projected on Normal
                    const diff = planetVelRad - playerVelRad;

                    // Add slight extra "bounce" or separation speed (optional, let's stick to rigid first)
                    // Let's ensure at least a small positive separation speed if planet is static?
                    // User asked for "push away".
                    // If we just match, we 'stick'.
                    // Let's add a minimum separation constant?
                    // Or just match. Matching stops penetration.

                    player.velocity.addScaledVector(normal, diff);
                }

                // Positional Correction (Depenetration)
                // If we are overlapping, move player out immediately to prevent tunneling/sticking
                const dist = Math.sqrt(distSq);
                const overlap = collisionDist - dist;

                if (overlap > 0) {
                    // Move player along normal by overlap amount
                    // Positional Correction ensures no tunneling
                    const correction = normal.clone().multiplyScalar(overlap);
                    player.position.add(correction);
                    player.mesh.position.copy(player.position);
                }

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
        if (this.selectionBox) {
            this.selectionBox.position.copy(this.position);
            this.selectionBox.position.y = 0;
        }
    }


    // Get velocity influence at specific position
    // Optimized to reduce allocations. Returns target vector.
    getVelocityAt(worldPosition, target = new THREE.Vector3()) {
        const distSq = worldPosition.distanceToSquared(this.position);
        const radiusSq = this.rotationRadius * this.rotationRadius;

        if (distSq <= radiusSq && distSq > 0.01) {
            // Tangential velocity (rotation)
            // Vector from center to point
            _tempRadial.subVectors(worldPosition, this.position);
            _tempRadial.y = 0; // Enforce Flat

            // Tangent: Cross product of Radial x Up (0,1,0) for Clockwise
            // Since we are strictly 2D XZ, Tangent of (x, 0, z) is (z, 0, -x) or similar?
            // Cross (x, 0, z) x (0, 1, 0)
            // x = (0*0 - z*1) = -z
            // y = (z*0 - x*0) = 0
            // z = (x*1 - 0*0) = x
            // So Tangent is (-z, 0, x)
            _tempTangent.set(- _tempRadial.z, 0, _tempRadial.x).normalize();

            // Store result in target
            target.copy(_tempTangent).multiplyScalar(this.forceMagnitude);

            // Add planet's linear velocity
            // Scaled distance based: 
            // Surface (dist = radius) -> 100%
            // Boundary (dist = rotationRadius) -> 0%
            if (this.velocity) {
                // We need actual distance for linear interpolation, sadly sqrt is needed here
                // UNLESS we use squared interpolation, which changes the falloff curve.
                // Linear falloff is expected. `Math.sqrt` is acceptable for objects IN range.
                // The optimization is mostly skipping objects OUT of range.

                const dist = Math.sqrt(distSq);

                let t = 0;
                const range = this.rotationRadius - this.sizeRadius;

                if (range > 0) {
                    t = 1 - (dist - this.sizeRadius) / range;
                } else {
                    t = 1; // Fallback if radius == rotationRadius
                }

                // Clamp t [0, 1]
                t = Math.max(0, Math.min(1, t));

                // Add scaled velocity
                target.addScaledVector(this.velocity, t);
            }

            // Final Y enforcement
            target.y = 0;

            return target;
        }

        target.set(0, 0, 0);
        return target;
    }

    setDebugVisibility(state) {
        if (this.ring) {
            this.ring.visible = state.rings;
        }
        if (this.axisLine) {
            this.axisLine.visible = state.axis;
        }
        if (this.directionLine) {
            this.directionLine.visible = state.planetToParent;
        }
        if (this.playerLine) {
            this.playerLine.visible = state.planetToPlayer;
        }
        if (this.velocityLine) {
            this.velocityLine.visible = state.planetVelocity;
        }
    }

    setColor(hex) {
        this.color = hex;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.setHex(hex);
        }
    }

    updateSize(radius) {
        this.sizeRadius = radius;
        // Recreate mesh geometry
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh = null;
        }
        this.initMesh();

        // Restore children (Lights, Lines)
        // initMesh creates a new mesh.
        // But we had children attached to the old mesh?
        // Sun has a light attached. Axis line is attached.
        // We need to re-attach them.

        // Simplified approach: just rebuild visuals.
        // But Sun light is added in Game.js externally. The Axis is internal.

        // Actually, initMesh adds to scene. 
        // If we want to preserve children like PointLight:
        // We should move children from old mesh to new mesh.

        // But wait, the previous mesh is gone.
        // Let's implement a swap helper.
    }

    // Better implementation of updateSize to handle children preservation
    updateSize(radius) {
        // Need to capture selection state before destroying
        const wasSelected = this.selectionBox ? this.selectionBox.visible : false;

        this.sizeRadius = radius;
        if (!this.mesh) return;

        const oldMesh = this.mesh;
        const children = [...oldMesh.children]; // shallow copy

        // Detach children
        children.forEach(c => oldMesh.remove(c));

        // Dispose old
        this.scene.remove(oldMesh);
        oldMesh.geometry.dispose();

        // Create new
        this.initMesh(); // Assigns this.mesh

        // Re-attach children
        children.forEach(c => this.mesh.add(c));

        // Axis Visual needs update?
        // initAxisVisual recreates it.
        // If we re-attach the OLD axis line, it will be wrong size.
        // So we should filter out our internal visuals from 'children' we preserve.
        // The only external child is the Sun Light.

        // Internal children: axisLine.
        // Let's filter children to NOT include axisLine.

        const externalChildren = children.filter(c => c !== this.axisLine);

        // Clear old axis line if it was in the list
        if (this.axisLine) {
            this.axisLine.geometry.dispose();
            this.axisLine = null;
        }

        // Re-init axis
        this.initAxisVisual(); // adds to this.mesh

        // Re-attach external
        externalChildren.forEach(c => this.mesh.add(c));

        // Re-init selection box
        if (this.selectionBox) {
            this.scene.remove(this.selectionBox);
            this.selectionBox.geometry.dispose();
        }
        this.initSelectionVisual();
        if (typeof wasSelected !== 'undefined' && wasSelected) {
            this.selectionBox.visible = true;
        }
    }

    updateConfig(key, value) {
        // Generic updater for other props
        if (this.hasOwnProperty(key)) {
            this[key] = value;
        }

        if (key === 'rotationRadius') {
            const wasVisible = this.ring ? this.ring.visible : false;
            // Re-init ring
            if (this.ring) {
                this.scene.remove(this.ring);
                this.ring.geometry.dispose();
            }
            this.initRotationVisual();
            if (this.ring) {
                this.ring.visible = wasVisible;
            }
        }

        if (key === 'rotationSpeed') {
            this.forceMagnitude = this.rotationSpeed * 10.0;
        }

        if (key === 'renderMode') {
            if (this.mesh) {
                const oldMaterial = this.mesh.material;
                this.mesh.material = this.createMaterial();
                if (oldMaterial) oldMaterial.dispose();
            }
        }
    }

    resetOrbit() {
        this.orbitAngle = 0;
        // Force update position immediately
        if (this.parent) {
            const px = this.parent.position.x + this.orbitDistance; // cos(0)=1
            const pz = this.parent.position.z; // sin(0)=0
            this.position.set(px, 0, pz);
            this.updatePosition();
        }
    }
}
