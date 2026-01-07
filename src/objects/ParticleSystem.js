import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, config = {}) {
        this.scene = scene;
        this.size = config.fieldRadius || 72;
        this.config = config;

        // Scratch objects (Initialize first!)
        this.dummy = new THREE.Object3D();
        this._tempInfluence = new THREE.Vector3();
        this._tempEffectiveVel = new THREE.Vector3();

        // --- Dust System (Instanced) ---
        this.dustCount = config.count !== undefined ? config.count : 1024;
        this.dustGeometry = new THREE.CircleGeometry(1, 12);
        const dustColor = this.config.dustColor !== undefined ? this.config.dustColor : 0xffffff;
        this.dustMaterial = new THREE.MeshBasicMaterial({
            color: dustColor,
            side: THREE.DoubleSide,
            depthWrite: false,
            transparent: true,
            opacity: 0.9
        });

        this.dustMesh = new THREE.InstancedMesh(this.dustGeometry, this.dustMaterial, this.dustCount);
        this.dustMesh.frustumCulled = false; // Prevent culling when looking away from center
        this.scene.add(this.dustMesh);

        // Dust Data
        this.dustData = []; // { position, velocity, life, maxLife, initialScale, smoothedInfluence }
        this.initDust();


        // --- Smoke System (Instanced) ---
        this.smokeMaxCount = config.poolSize || 1500;
        this.smokeGeometry = new THREE.CircleGeometry(1, 12);
        this.smokeMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.smokeMesh = new THREE.InstancedMesh(this.smokeGeometry, this.smokeMaterial, this.smokeMaxCount);
        this.smokeMesh.frustumCulled = false; // Prevent culling
        this.scene.add(this.smokeMesh);

        // Smoke Data (Ring Buffer)
        this.smokeData = new Array(this.smokeMaxCount).fill(null);
        this.smokeCursor = 0; // Points to next available slot

        // Initialize smoke pool logic
        for (let i = 0; i < this.smokeMaxCount; i++) {
            this.smokeData[i] = {
                active: false,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                maxLife: 1,
                initialScale: 1,
                smoothedInfluence: new THREE.Vector3()
            };
            // Hide initially
            this.dummy.position.set(0, 0, 0);
            this.dummy.scale.set(0, 0, 0);
            this.dummy.updateMatrix();
            this.smokeMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.initExplosions();
        this.initBlastSpheres();
    }

    initExplosions() {
        // --- Explosion System (Instanced) ---
        this.explosionMaxCount = 4000;
        this.explosionGeometry = new THREE.PlaneGeometry(1, 1);
        this.explosionMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            depthWrite: false,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });

        this.explosionMesh = new THREE.InstancedMesh(this.explosionGeometry, this.explosionMaterial, this.explosionMaxCount);
        this.explosionMesh.frustumCulled = false;
        this.scene.add(this.explosionMesh);

        this.explosionData = new Array(this.explosionMaxCount).fill(null);
        this.explosionCursor = 0;

        for (let i = 0; i < this.explosionMaxCount; i++) {
            this.explosionData[i] = {
                active: false,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                maxLife: 1,
                color: new THREE.Color(),
                scale: 1,
                rotation: 0,
                rotSpeed: 0
            };
            this.dummy.position.set(0, 0, 0);
            this.dummy.scale.set(0, 0, 0);
            this.dummy.updateMatrix();
            this.explosionMesh.setMatrixAt(i, this.dummy.matrix);
        }
    }

    initBlastSpheres() {
        // --- Blast Sphere System (Instanced) ---
        this.blastMaxCount = 50; // Max concurrent blasts
        // Use Icosahedron for low poly look (Detail 1 = ~80 faces)
        this.blastGeometry = new THREE.IcosahedronGeometry(1, 1);
        this.blastMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0, // Fully opaque start
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.blastMesh = new THREE.InstancedMesh(this.blastGeometry, this.blastMaterial, this.blastMaxCount);
        this.blastMesh.frustumCulled = false;
        this.scene.add(this.blastMesh);

        this.blastData = new Array(this.blastMaxCount).fill(null);
        this.blastCursor = 0;

        for (let i = 0; i < this.blastMaxCount; i++) {
            this.blastData[i] = {
                active: false,
                position: new THREE.Vector3(),
                life: 0,
                maxLife: 1,
                color: new THREE.Color(),
                maxRadius: 10 // Grown to 2x (was 5)
            };
            this.dummy.position.set(0, 0, 0);
            this.dummy.scale.set(0, 0, 0);
            this.dummy.updateMatrix();
            this.blastMesh.setMatrixAt(i, this.dummy.matrix);
        }
    }

    spawnBlastSphere(position, color) {
        const idx = this.blastCursor;
        this.blastCursor = (this.blastCursor + 1) % this.blastMaxCount;

        const p = this.blastData[idx];
        p.active = true;
        p.position.copy(position);
        p.life = 0.6;
        p.maxLife = p.life;
        p.color.set(color);
        p.maxRadius = 20.0; // Enforce new max radius

        this.blastMesh.setColorAt(idx, p.color);

        // Reset rotation (No rotation allowed)
        this.dummy.position.copy(position);
        this.dummy.scale.set(0, 0, 0); // Start at 0
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.blastMesh.setMatrixAt(idx, this.dummy.matrix);

        this.blastMesh.instanceColor.needsUpdate = true;
        this.blastMesh.instanceMatrix.needsUpdate = true;

        // Apply Shockwave to particles
        // Radius matches visual (20.0), Strength increased significantly
        this.applyBlastImpulse(position, 20.0, 500.0);
    }

    applyBlastImpulse(center, radius, strength) {
        const radiusSq = radius * radius;
        const _tempVec = new THREE.Vector3();

        // 1. Dust
        for (let i = 0; i < this.dustCount; i++) {
            const p = this.dustData[i];
            const distSq = p.position.distanceToSquared(center);
            if (distSq < radiusSq && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                _tempVec.subVectors(p.position, center).normalize();

                // Falloff: Strongest at center
                const falloff = 1.0 - (dist / radius);
                if (falloff > 0) {
                    p.velocity.addScaledVector(_tempVec, strength * falloff);
                }
            }
        }

        // 2. Smoke
        for (let i = 0; i < this.smokeMaxCount; i++) {
            const p = this.smokeData[i];
            if (!p.active) continue;

            const distSq = p.position.distanceToSquared(center);
            if (distSq < radiusSq && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                _tempVec.subVectors(p.position, center).normalize();

                const falloff = 1.0 - (dist / radius);
                if (falloff > 0) {
                    p.velocity.addScaledVector(_tempVec, strength * falloff);
                }
            }
        }
    }

    spawnExplosion(position, color, count = 100, initialVelocity = new THREE.Vector3()) {
        const baseColor = new THREE.Color(color);
        const fireColors = [
            new THREE.Color(0xffaa00), // Orange
            new THREE.Color(0xff4400), // Red-Orange
            new THREE.Color(0xffff00), // Yellow
            new THREE.Color(0xffffff)  // White hot
        ];

        for (let i = 0; i < count; i++) {
            const idx = this.explosionCursor;
            this.explosionCursor = (this.explosionCursor + 1) % this.explosionMaxCount;

            const p = this.explosionData[idx];
            p.active = true;
            p.position.copy(position);

            // Random sphere velocity
            const speed = 10 + Math.random() * 40;
            const angle = Math.random() * Math.PI * 2;
            const z = (Math.random() - 0.5) * 2;
            const r = Math.sqrt(1 - z * z);

            p.velocity.set(
                r * Math.cos(angle) * speed,
                z * speed, // Use spherical Z (mapped to Y here) for full 3D explosion
                r * Math.sin(angle) * speed
            ).add(initialVelocity);

            p.life = 1.0 + Math.random() * 2.0;
            p.maxLife = p.life;
            p.scale = 0.5 + Math.random() * 2.5;
            p.rotation = Math.random() * Math.PI;
            p.rotSpeed = (Math.random() - 0.5) * 10;

            // Mix ship color with fire colors
            if (Math.random() > 0.3) {
                p.color.copy(baseColor);
                // Slight jitter
                p.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
            } else {
                p.color.copy(fireColors[Math.floor(Math.random() * fireColors.length)]);
            }

            this.explosionMesh.setColorAt(idx, p.color);
        }
        this.explosionMesh.instanceColor.needsUpdate = true;
    }

    initDust() {
        const radius = this.size;
        const minLife = this.config.minLife || 10;
        const maxLife = this.config.maxLife || 60;

        for (let i = 0; i < this.dustCount; i++) {
            const r = radius * Math.sqrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            const duration = minLife + Math.random() * (maxLife - minLife);
            this.dustData[i] = {
                position: new THREE.Vector3(x, 0, z),
                velocity: new THREE.Vector3(0, 0, 0),
                life: duration,
                maxLife: duration,
                initialScale: 0.1 + Math.random() * 0.9,
                smoothedInfluence: new THREE.Vector3()
            };

            this.updateInstance(this.dustMesh, i, this.dustData[i].position, 0, null, null);
        }
        this.dustMesh.instanceMatrix.needsUpdate = true;
    }

    spawnSmoke(position, initialInfluence = null, camera = null) {
        // Get next slot in ring buffer
        const idx = this.smokeCursor;
        this.smokeCursor = (this.smokeCursor + 1) % this.smokeMaxCount;

        const p = this.smokeData[idx];
        p.active = true;

        // Jitter Position
        p.position.copy(position);
        p.position.x += (Math.random() - 0.5) * 0.5;
        p.position.y = 0; // Enforce Y=0
        p.position.z += (Math.random() - 0.5) * 0.5;

        p.velocity.set(0, 0, 0);
        p.life = 3 + Math.random() * 6;
        p.maxLife = p.life;
        p.initialScale = 0.1 + Math.random() * 0.9;

        if (initialInfluence) {
            p.smoothedInfluence.copy(initialInfluence);
        } else {
            p.smoothedInfluence.set(0, 0, 0);
        }

        const cameraQuaternion = camera ? camera.quaternion : null;
        this.updateInstance(this.smokeMesh, idx, p.position, p.initialScale, null, cameraQuaternion);
        this.smokeMesh.instanceMatrix.needsUpdate = true;
    }

    updateInstance(mesh, index, position, scale, target = null, quaternion = null) {
        this.dummy.position.copy(position);
        this.dummy.scale.setScalar(scale);

        if (quaternion) {
            this.dummy.quaternion.copy(quaternion);
        } else if (target) {
            this.dummy.lookAt(target);
        } else {
            this.dummy.rotation.set(0, 0, 0);
        }

        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
    }

    update(dt, velocityField, celestialBodies, player, camera, debugDustVelocity = false) {
        let itemsForViz = []; // Kept for debug visualizer compatibility
        const radius = this.size;
        const radiusSq = radius * radius;
        const cameraQuaternion = camera ? camera.quaternion : null;

        // --- Update Dust ---
        for (let i = 0; i < this.dustCount; i++) {
            const p = this.dustData[i];

            // 1. Physics & Influence
            velocityField.calculateTotalVelocity(p.position, celestialBodies, player, this._tempInfluence);

            // Enforce Y=0 on influence
            this._tempInfluence.y = 0;

            const smoothFactor = Math.min(1.0, 3.0 * dt);
            p.smoothedInfluence.lerp(this._tempInfluence, smoothFactor);

            // Velocity Decay (Drag)
            p.velocity.multiplyScalar(1 - 3.0 * dt);

            this._tempEffectiveVel.copy(p.velocity).add(p.smoothedInfluence);

            // Move
            p.position.addScaledVector(this._tempEffectiveVel, dt);
            p.position.y = 0; // Enforce Y=0

            p.life -= dt;

            // 2. Respawn Logic
            if (p.life <= 0 || p.position.lengthSq() > radiusSq) {
                const r = radius * Math.sqrt(Math.random());
                const theta = Math.random() * 2 * Math.PI;
                p.position.set(r * Math.cos(theta), 0, r * Math.sin(theta));

                velocityField.calculateTotalVelocity(p.position, celestialBodies, player, this._tempInfluence);
                this._tempInfluence.y = 0;
                p.smoothedInfluence.copy(this._tempInfluence); // Snap influence

                const minLife = this.config.minLife || 10;
                const maxLife = this.config.maxLife || 60;
                p.life = minLife + Math.random() * (maxLife - minLife);
                p.maxLife = p.life;
            }

            // 3. Update Visuals
            let target = null;
            if (this._tempEffectiveVel.lengthSq() > 0.0001) {
                target = p.position.clone().add(this._tempEffectiveVel);
            }

            const lifeRatio = p.life / p.maxLife;
            let scaleMod = 1.0;
            if (lifeRatio > 0.9) scaleMod = (1.0 - lifeRatio) / 0.1;
            else if (lifeRatio < 0.5) scaleMod = lifeRatio / 0.5;

            this.updateInstance(this.dustMesh, i, p.position, p.initialScale * scaleMod, target, cameraQuaternion);

            // Viz Output (Sampled for performance distribution)
            // Show every 20th particle to get a spread across the field
            if (i % 20 === 0 && p.smoothedInfluence.lengthSq() > 0.01) {
                itemsForViz.push({ position: p.position.clone(), force: p.smoothedInfluence.clone() });
            }
        }
        this.dustMesh.instanceMatrix.needsUpdate = true;


        // --- Update Smoke ---
        for (let i = 0; i < this.smokeMaxCount; i++) {
            const p = this.smokeData[i];
            if (!p.active) continue;

            // 1. Physics
            velocityField.calculateTotalVelocity(p.position, celestialBodies, player, this._tempInfluence);
            this._tempInfluence.y = 0;

            const smoothFactor = Math.min(1.0, 3.0 * dt);
            p.smoothedInfluence.lerp(this._tempInfluence, smoothFactor);

            // Velocity Decay (Drag)
            p.velocity.multiplyScalar(1 - 3.0 * dt);

            this._tempEffectiveVel.copy(p.velocity).add(p.smoothedInfluence);

            p.position.addScaledVector(this._tempEffectiveVel, dt);
            p.position.y = 0;

            p.life -= dt;

            // 2. Visuals (Fading)
            if (p.life <= 0) {
                p.active = false;
                // Scale to 0 to hide
                this.updateInstance(this.smokeMesh, i, p.position, 0, null, null);
            } else {
                const lifeRatio = p.life / p.maxLife;
                let scaleMod = 1.0;
                // Smoke spawns at full size, only fades out
                if (lifeRatio < 0.5) scaleMod = lifeRatio / 0.5;

                const currentScale = p.initialScale * scaleMod;

                let target = null;
                if (this._tempEffectiveVel.lengthSq() > 0.0001) {
                    target = p.position.clone().add(this._tempEffectiveVel);
                }
                this.updateInstance(this.smokeMesh, i, p.position, currentScale, target, cameraQuaternion);

                // Show every 5th active smoke particle
                if (i % 5 === 0 && p.smoothedInfluence.lengthSq() > 0.01) {
                    itemsForViz.push({ position: p.position.clone(), force: p.smoothedInfluence.clone() });
                }
            }
        }
        this.smokeMesh.instanceMatrix.needsUpdate = true;


        // --- Update Explosions ---
        for (let i = 0; i < this.explosionMaxCount; i++) {
            const p = this.explosionData[i];
            if (!p.active) continue;

            p.velocity.multiplyScalar(1 - 2.0 * dt); // Drag
            p.position.addScaledVector(p.velocity, dt);

            p.rotation += p.rotSpeed * dt;
            p.life -= dt;

            if (p.life <= 0) {
                p.active = false;
                this.updateInstance(this.explosionMesh, i, p.position, 0);
            } else {
                const lifeRatio = p.life / p.maxLife;
                // Fade out by scaling down
                const scale = p.scale * lifeRatio;

                this.dummy.position.copy(p.position);
                this.dummy.scale.setScalar(scale);
                this.dummy.rotation.z = p.rotation;

                // Billboard: Face camera
                if (cameraQuaternion) {
                    this.dummy.quaternion.copy(cameraQuaternion);
                    this.dummy.rotateZ(p.rotation); // Apply local rotation after facing camera
                }

                this.dummy.updateMatrix();
                this.explosionMesh.setMatrixAt(i, this.dummy.matrix);
            }
        }
        this.explosionMesh.instanceMatrix.needsUpdate = true;


        // --- Update Blast Spheres ---
        for (let i = 0; i < this.blastMaxCount; i++) {
            const p = this.blastData[i];
            if (!p.active) continue;

            p.life -= dt;

            if (p.life <= 0) {
                p.active = false;
                this.updateInstance(this.blastMesh, i, p.position, 0);
            } else {
                const lifeRatio = p.life / p.maxLife; // 1.0 -> 0.0
                const progress = 1.0 - lifeRatio; // 0.0 -> 1.0

                // Grow from 0 to maxRadius
                const currentRadius = progress * p.maxRadius;

                // Fade from 50% (0.5) to 0% (0.0)
                // Note: Material opacity is 0.5. So color alpha doesn't matter much if not using vertex colors for alpha?
                // InstancedMesh supports color, but Three.js basic material doesn't support per-instance opacity easily without ShaderMaterial or custom depth.
                // However, we can simulate fade by scaling strictly or...
                // Actually, standard InstancedMesh with MeshBasicMaterial DOES NOT support per-instance opacity.
                // WE HAVE TO USE A TRICK: Scale is handled. Opacity is global.
                // Alternative: Use color to fade to black? No, AdditiveBlending expects black to be transparent.
                // YES! AdditiveBlending: Black = Invisible.
                // So we darken the color over time.

                // Start Color: p.color (at 50% opacity from material)
                // End Color: Black

                this.dummy.position.copy(p.position);
                this.dummy.scale.setScalar(currentRadius);
                this.dummy.rotation.set(0, 0, 0); // NO ROTATION
                this.dummy.updateMatrix();
                this.blastMesh.setMatrixAt(i, this.dummy.matrix);

                // Fade to black as life -> 0 (Additive Blending makes it fade out)

                const displayColor = p.color.clone().multiplyScalar(lifeRatio); // Fade to black as life -> 0
                this.blastMesh.setColorAt(i, displayColor);
            }
        }
        this.blastMesh.instanceMatrix.needsUpdate = true;
        if (this.blastMesh.instanceColor) this.blastMesh.instanceColor.needsUpdate = true;

        return itemsForViz;
    }

    checkLaserCollisions(laserPos, laserRadius, laserVelocity) {
        // Generous hit radius for satisfaction
        const hitRadSq = 4.0;

        // DUST
        for (let i = 0; i < this.dustCount; i++) {
            const p = this.dustData[i];
            const distSq = p.position.distanceToSquared(laserPos);
            if (distSq < hitRadSq) {
                // Apply impulse instead of killing
                p.velocity.addScaledVector(laserVelocity, 0.2);
            }
        }

        // SMOKE
        for (let i = 0; i < this.smokeMaxCount; i++) {
            const p = this.smokeData[i];
            if (!p.active) continue;

            const distSq = p.position.distanceToSquared(laserPos);
            if (distSq < hitRadSq) {
                // Apply impulse instead of killing
                p.velocity.addScaledVector(laserVelocity, 0.2);
            }
        }
    }
}
