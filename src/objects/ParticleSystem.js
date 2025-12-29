import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, config = {}) {
        this.scene = scene;
        this.size = config.fieldRadius || 20;
        this.count = config.count || 256;
        this.config = config; // Store for usage in init/respawn
        this.particles = [];

        this.initParticles();

        // Smoke Particle Configuration
        this.smokeParticles = [];
        this.smokeBudget = 200;
        this.smokeGeometry = new THREE.ConeGeometry(0.1, 0.3, 3);
        this.smokeGeometry.rotateX(Math.PI / 2);
        this.smokeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    }

    spawnSmoke(position) {
        // Enforce budget: remove oldest if full
        if (this.smokeParticles.length >= this.smokeBudget) {
            const oldP = this.smokeParticles.shift(); // Remove oldest
            this.scene.remove(oldP.mesh);
            // Optional: Recycle mesh to avoid GC? 
            // For simplicity/readability now: Destroy and re-create or just remove.
            // Let's just remove. 
        }

        const mesh = new THREE.Mesh(this.smokeGeometry, this.smokeMaterial);
        mesh.position.copy(position);

        // Random jitter to position so it's not a single line
        mesh.position.x += (Math.random() - 0.5) * 0.5;
        mesh.position.y += (Math.random() - 0.5) * 0.5;
        mesh.position.z += (Math.random() - 0.5) * 0.5;

        // Random size
        const scale = 0.1 + Math.random() * 0.9;
        mesh.scale.setScalar(scale);

        this.scene.add(mesh);

        this.smokeParticles.push({
            mesh: mesh,
            velocity: new THREE.Vector3(0, 0, 0), // Starts still (relative to world)
            life: 6 + Math.random() * 9, // 6-15 seconds life
            maxLife: 15,
            initialScale: scale
        });
    }

    initParticles() {
        // ... (omitted for brevity, this tool handles context via line numbers usually, but here I need to target two spots. I'll do spawnSmoke first then update loop? No, replace_file_content is single block. I'll use multi_replace for safety or two calls.
        // Actually, I can use multi_replace to fix both spots in one go.
        // Let's use multi_replace_file_content.
    }

    initParticles() {
        const geometry = new THREE.ConeGeometry(0.1, 0.3, 3);
        geometry.rotateX(Math.PI / 2);

        // Use config color w/ fallback
        const color = this.config.dustColor !== undefined ? this.config.dustColor : 0xffffff;
        const material = new THREE.MeshBasicMaterial({ color: color });

        const radius = this.size;

        // Life range
        const minLife = this.config.minLife || 10;
        const maxLife = this.config.maxLife || 60;
        const lifeRange = maxLife - minLife;

        for (let i = 0; i < this.count; i++) {
            // Random position in circle
            // r = R * sqrt(random) ensures uniform distribution
            const r = radius * Math.sqrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, 0, z);

            // Random varying size (10% to 100%)
            const scale = 0.1 + Math.random() * 0.9;
            mesh.scale.setScalar(scale);

            this.scene.add(mesh);

            this.particles.push({
                mesh: mesh,
                velocity: new THREE.Vector3(0, 0, 0),
                life: minLife + Math.random() * lifeRange
            });
        }
    }

    update(dt, forceGrid, celestialBodies, player) {
        let itemsForViz = [];
        const radius = this.size;
        const radiusSq = radius * radius;

        this.particles.forEach(p => {
            // New Force Calculation
            const totalForce = forceGrid.calculateTotalForce(p.mesh.position, celestialBodies, player);

            // Physics Update
            p.velocity.add(totalForce.clone().multiplyScalar(dt));
            p.velocity.multiplyScalar(0.95); // Friction

            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

            // Reduce life
            p.life -= dt;

            if (p.life <= 0 || p.mesh.position.lengthSq() > radiusSq) {
                // Respawn at random position inside the field
                const r = radius * Math.sqrt(Math.random());
                const theta = Math.random() * 2 * Math.PI;

                p.mesh.position.x = r * Math.cos(theta);
                p.mesh.position.z = r * Math.sin(theta);

                // Reset velocity
                p.velocity.set(0, 0, 0);

                // Reset life
                const minLife = this.config.minLife || 10;
                const maxLife = this.config.maxLife || 60;
                p.life = minLife + Math.random() * (maxLife - minLife);
            }

            // Orient
            if (p.velocity.lengthSq() > 0.001) {
                p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));
            }

            // Add to viz list
            if (totalForce.lengthSq() > 0.01) {
                itemsForViz.push({ position: p.mesh.position.clone(), force: totalForce });
            }
        });

        // --- Update Smoke Particles ---
        // Iterate backwards to allow removal
        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];

            // Calculate Force (same physics as stars)
            const totalForce = forceGrid.calculateTotalForce(p.mesh.position, celestialBodies, player);

            // Physics Update
            p.velocity.add(totalForce.clone().multiplyScalar(dt));
            p.velocity.multiplyScalar(0.95); // Friction

            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

            // Reduce life
            p.life -= dt;

            // Fade out effect
            const lifeRatio = p.life / p.maxLife; // 1 -> 0
            const currentScale = p.initialScale * lifeRatio;
            p.mesh.scale.setScalar(currentScale);

            // Check collision
            // Check death
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.smokeParticles.splice(i, 1);
                continue;
            }

            // Orient
            if (p.velocity.lengthSq() > 0.001) {
                p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));
            }
        }

        return itemsForViz;
    }

}
