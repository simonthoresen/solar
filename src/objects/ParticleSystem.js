import * as THREE from 'three';

export class ParticleSystem {
    constructor(scene, size = 20) {
        this.scene = scene;
        this.size = size;
        this.particles = [];

        this.initParticles();
    }

    initParticles() {
        const geometry = new THREE.ConeGeometry(0.1, 0.3, 3);
        geometry.rotateX(Math.PI / 2);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

        const radius = this.size; // Size is now treated as radius
        const radiusSq = radius * radius;

        for (let x = -Math.ceil(radius); x <= Math.ceil(radius); x++) {
            for (let z = -Math.ceil(radius); z <= Math.ceil(radius); z++) {

                // Circular check
                if (x * x + z * z <= radiusSq) {
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(x, 0, z); // Integer coordinate
                    this.scene.add(mesh);

                    this.particles.push({
                        mesh: mesh,
                        velocity: new THREE.Vector3(0, 0, 0),
                        basePos: new THREE.Vector3(x, 0, z)
                    });
                }
            }
        }
    }

    update(dt, forceGrid, celestialBodies, player) {
        let itemsForViz = [];
        // Constant drift force
        const driftForce = new THREE.Vector3(2, 0, 0);
        const radiusSq = this.size * this.size;

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
                // Respawn at opposite side
                // Multiply position by -0.99 for "opposite side but slightly inside"
                p.mesh.position.multiplyScalar(-0.99);

                // Reset velocity to avoid carrying momentum back
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
