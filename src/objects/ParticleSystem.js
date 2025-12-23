import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, size = 20, count = 256) {
        this.scene = scene;
        this.size = size;
        this.count = count;
        this.particles = [];

        this.initParticles();
    }

    initParticles() {
        const geometry = new THREE.ConeGeometry(0.1, 0.3, 3);
        geometry.rotateX(Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });

        const radius = this.size;

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
                velocity: new THREE.Vector3(0, 0, 0)
            });
        }
    }

    update(dt, forceGrid, celestialBodies, player) {
        let itemsForViz = [];
        // Constant drift force
        const driftForce = new THREE.Vector3(2, 0, 0);
        const radius = this.size;
        const radiusSq = radius * radius;

        this.particles.forEach(p => {
            // New Force Calculation
            const totalForce = forceGrid.calculateTotalForce(p.mesh.position, celestialBodies, player);

            // Add Drift
            totalForce.add(driftForce);

            // Physics Update
            p.velocity.add(totalForce.clone().multiplyScalar(dt));
            p.velocity.multiplyScalar(0.95); // Friction

            p.mesh.position.add(p.velocity.clone().multiplyScalar(dt));

            // Boundary Wrap
            // Check squared distance
            if (p.mesh.position.lengthSq() > radiusSq) {
                // Respawn at random position inside the field
                const r = radius * Math.sqrt(Math.random());
                const theta = Math.random() * 2 * Math.PI;

                p.mesh.position.x = r * Math.cos(theta);
                p.mesh.position.z = r * Math.sin(theta);

                // Reset velocity
                p.velocity.set(0, 0, 0);
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

        return itemsForViz;
    }
}
