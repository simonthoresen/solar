import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, config = {}) {
        this.scene = scene;
        this.size = config.fieldRadius || 20;
        this.config = config;

        // Shared Pool
        this.particles = [];
        this.poolSize = config.poolSize || 1500;

        // Dust Settings
        this.dustCount = config.count || 256;
        this.dustGeometry = new THREE.ConeGeometry(0.1, 0.3, 3);
        this.dustGeometry.rotateX(Math.PI / 2);
        // Dust material checks config color
        const dustColor = this.config.dustColor !== undefined ? this.config.dustColor : 0xffffff;
        this.dustMaterial = new THREE.MeshBasicMaterial({ color: dustColor });

        // Smoke Settings
        this.smokeGeometry = new THREE.ConeGeometry(0.1, 0.3, 3);
        this.smokeGeometry.rotateX(Math.PI / 2);
        this.smokeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });

        // Scratch vectors for update loop
        this._tempInfluence = new THREE.Vector3();
        this._tempEffectiveVel = new THREE.Vector3();

        this.initDust();
    }

    createParticle(type, position, velocity, life, scale, maxLife = 0) {
        // Enforce Pool Limit: Remove oldest if full
        if (this.particles.length >= this.poolSize) {
            const oldP = this.particles.shift(); // Remove oldest
            if (oldP && oldP.mesh) {
                this.scene.remove(oldP.mesh);
            }
        }

        let mesh;
        if (type === 'dust') {
            mesh = new THREE.Mesh(this.dustGeometry, this.dustMaterial);
        } else {
            mesh = new THREE.Mesh(this.smokeGeometry, this.smokeMaterial);
        }

        mesh.position.copy(position);
        mesh.scale.setScalar(scale);

        if (velocity.lengthSq() > 0.001) {
            mesh.lookAt(position.clone().add(velocity));
        }

        this.scene.add(mesh);

        const particle = {
            type: type, // 'dust' or 'smoke'
            mesh: mesh,
            velocity: velocity.clone(),
            life: life,
            maxLife: maxLife, // Only used for smoke fade
            initialScale: scale,
            smoothedInfluence: new THREE.Vector3(0, 0, 0) // For smoothing
        };

        this.particles.push(particle);
        return particle;
    }

    initDust() {
        const radius = this.size;
        const minLife = this.config.minLife || 10;
        const maxLife = this.config.maxLife || 60;
        const lifeRange = maxLife - minLife;

        for (let i = 0; i < this.dustCount; i++) {
            // Random position in circle
            const r = radius * Math.sqrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            const position = new THREE.Vector3(x, 0, z);
            const velocity = new THREE.Vector3(0, 0, 0); // Dust starts still
            const life = minLife + Math.random() * lifeRange;
            const scale = 0.1 + Math.random() * 0.9;

            this.createParticle('dust', position, velocity, life, scale);
        }
    }

    spawnSmoke(position) {
        // Random jitter
        const jitterPos = position.clone();
        jitterPos.x += (Math.random() - 0.5) * 0.5;
        jitterPos.y += (Math.random() - 0.5) * 0.5;
        jitterPos.z += (Math.random() - 0.5) * 0.5;

        // Random size
        const scale = 0.1 + Math.random() * 0.9;

        // Life 6-15s
        const life = 6 + Math.random() * 9;

        // Velocity 0 initially
        const velocity = new THREE.Vector3(0, 0, 0);

        this.createParticle('smoke', jitterPos, velocity, life, scale, life);
    }

    update(dt, velocityField, celestialBodies, player) {
        let itemsForViz = [];
        const radius = this.size;
        const radiusSq = radius * radius;
        // Optimization: Pre-allocate items list only if needed, or clear it. 
        // JavaScript arrays are dynamic.

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Calculate Velocity Influence (Write to _tempInfluence)
            velocityField.calculateTotalVelocity(p.mesh.position, celestialBodies, player, this._tempInfluence);

            // Smooth Influence
            // Ensure property exists (for existing particles if hot-reloaded, though reload creates new)
            if (!p.smoothedInfluence) p.smoothedInfluence = new THREE.Vector3();

            const smoothFactor = Math.min(1.0, 3.0 * dt);
            p.smoothedInfluence.lerp(this._tempInfluence, smoothFactor);

            // Apply Influence
            // Total = p.velocity + smoothedInfluence
            this._tempEffectiveVel.copy(p.velocity).add(p.smoothedInfluence);

            // Update position (avoid allocation)
            // p.mesh.position.add(_tempEffectiveVel.multiplyScalar(dt)); // multiplyScalar modifies in place!
            // We must not modify _tempEffectiveVel in place if we need it for lookAt or debug later without recloning?
            // Actually lookAt uses it. 
            // So: scale a copy? No, we want no allocation.
            // vector.addScaledVector(v, s) is best.

            p.mesh.position.addScaledVector(this._tempEffectiveVel, dt);

            p.life -= dt;

            // Optional: Modify internal velocity?
            // "add actual velocity vectors together"
            // If we don't modify p.velocity, they simply move with the field.
            // If they leave the field, they stop.
            // Existing friction logic: p.velocity.multiplyScalar(0.95). 
            // If we use influence, we don't need to accumulate acceleration into p.velocity.

            // Orient
            if (p.smoothedInfluence.lengthSq() > 0.01) {
                itemsForViz.push({ position: p.mesh.position.clone(), force: p.smoothedInfluence.clone() });
            }


            // Type Specific Logic
            if (p.type === 'smoke') {
                // Smoke Fading
                const lifeRatio = p.life / p.maxLife;
                const currentScale = p.initialScale * lifeRatio;
                p.mesh.scale.setScalar(currentScale);

                // Smoke Death
                if (p.life <= 0) {
                    this.scene.remove(p.mesh);
                    this.particles.splice(i, 1);
                }
            } else if (p.type === 'dust') {
                // Dust Respawn Logic (Ambient)
                // If life ends OR oob
                if (p.life <= 0 || p.mesh.position.lengthSq() > radiusSq) {
                    // Respawn: move mesh, reset vel, reset life
                    const r = radius * Math.sqrt(Math.random());
                    const theta = Math.random() * 2 * Math.PI;

                    p.mesh.position.set(r * Math.cos(theta), 0, r * Math.sin(theta));
                    p.velocity.set(0, 0, 0);

                    const minLife = this.config.minLife || 10;
                    const maxLife = this.config.maxLife || 60;
                    p.life = minLife + Math.random() * (maxLife - minLife);

                    // Reset scale if needed (dust scale was constant, but good to reset if we want variety on respawn? 
                    // Implementation plan didn't specify, but existing code didn't reset scale on respawn. Let's keep scale or randomise?
                    // Existing code didn't reset scale. Let's keep it simple.
                }
            }
        }

        return itemsForViz;
    }
}
