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
        this.dustCount = config.count || 1024;
        this.dustGeometry = new THREE.ConeGeometry(1, 3, 3);
        this.dustGeometry.rotateX(Math.PI / 2);
        const dustColor = this.config.dustColor !== undefined ? this.config.dustColor : 0xffffff;
        this.dustMaterial = new THREE.MeshBasicMaterial({ color: dustColor });

        this.dustMesh = new THREE.InstancedMesh(this.dustGeometry, this.dustMaterial, this.dustCount);
        this.dustMesh.frustumCulled = false; // Prevent culling when looking away from center
        this.scene.add(this.dustMesh);

        // Dust Data
        this.dustData = []; // { position, velocity, life, maxLife, initialScale, smoothedInfluence }
        this.initDust();


        // --- Smoke System (Instanced) ---
        this.smokeMaxCount = config.poolSize || 1500;
        this.smokeGeometry = new THREE.ConeGeometry(1, 3, 3);
        this.smokeGeometry.rotateX(Math.PI / 2);
        this.smokeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });

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

            this.updateInstance(this.dustMesh, i, this.dustData[i].position, 0);
        }
        this.dustMesh.instanceMatrix.needsUpdate = true;
    }

    spawnSmoke(position) {
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
        p.life = 6 + Math.random() * 9;
        p.maxLife = p.life;
        p.initialScale = 0.1 + Math.random() * 0.9;
        p.smoothedInfluence.set(0, 0, 0);

        this.updateInstance(this.smokeMesh, idx, p.position, p.initialScale);
        this.smokeMesh.instanceMatrix.needsUpdate = true;
    }

    updateInstance(mesh, index, position, scale, lookAtTarget = null) {
        this.dummy.position.copy(position);
        this.dummy.scale.setScalar(scale);

        if (lookAtTarget) {
            this.dummy.lookAt(lookAtTarget);
        } else {
            // Default orientation if needed, or maintain previous?
            // Cone points +Z naturally after init logic?
            // init logic: geometry.rotateX(PI/2). Cone points +Z (local).
            // InstancedMesh default quaternion is Identity.
            // If we don't lookAt, it points +Z world.
            this.dummy.rotation.set(0, 0, 0);
        }

        this.dummy.updateMatrix();
        mesh.setMatrixAt(index, this.dummy.matrix);
    }

    update(dt, velocityField, celestialBodies, player) {
        let itemsForViz = []; // Kept for debug visualizer compatibility
        const radius = this.size;
        const radiusSq = radius * radius;

        // --- Update Dust ---
        for (let i = 0; i < this.dustCount; i++) {
            const p = this.dustData[i];

            // 1. Physics & Influence
            velocityField.calculateTotalVelocity(p.position, celestialBodies, player, this._tempInfluence);

            // Enforce Y=0 on influence
            this._tempInfluence.y = 0;

            const smoothFactor = Math.min(1.0, 3.0 * dt);
            p.smoothedInfluence.lerp(this._tempInfluence, smoothFactor);

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

            this.updateInstance(this.dustMesh, i, p.position, p.initialScale * scaleMod, target);

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

            this._tempEffectiveVel.copy(p.velocity).add(p.smoothedInfluence);

            p.position.addScaledVector(this._tempEffectiveVel, dt);
            p.position.y = 0;

            p.life -= dt;

            // 2. Visuals (Fading)
            if (p.life <= 0) {
                p.active = false;
                // Scale to 0 to hide
                this.updateInstance(this.smokeMesh, i, p.position, 0);
            } else {
                const lifeRatio = p.life / p.maxLife;
                let scaleMod = 1.0;
                if (lifeRatio > 0.9) scaleMod = (1.0 - lifeRatio) / 0.1;
                else if (lifeRatio < 0.5) scaleMod = lifeRatio / 0.5;

                const currentScale = p.initialScale * scaleMod;

                let target = null;
                if (this._tempEffectiveVel.lengthSq() > 0.0001) {
                    target = p.position.clone().add(this._tempEffectiveVel);
                }
                this.updateInstance(this.smokeMesh, i, p.position, currentScale, target);

                // Show every 5th active smoke particle
                if (i % 5 === 0 && p.smoothedInfluence.lengthSq() > 0.01) {
                    itemsForViz.push({ position: p.position.clone(), force: p.smoothedInfluence.clone() });
                }
            }
        }
        this.smokeMesh.instanceMatrix.needsUpdate = true;

        return itemsForViz;
    }
}
