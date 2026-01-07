import * as THREE from 'three';

export const SHIP_TYPES = [
    'viper', 'dart', 'saucer', 'hauler', 'interceptor',
    'needle', 'twinhull', 'hammerhead', 'speeder', 'orbiter'
];

export class ShipModels {
    /**
     * Creates a ship model group based on type.
     * @param {string} type 
     * @param {number} color 
     * @returns {object} { mesh: THREE.Group, collisionRadius: number, engineOffset: THREE.Vector3 }
     */
    static createModel(type, color) {
        const mesh = new THREE.Group();
        let collisionRadius = 1.0;
        let engineOffset = new THREE.Vector3(0, 0, 1.0);
        let turretMounts = []; // Array of { position: Vector3, type: string }

        // Materials
        // Materials - Use Phong for per-pixel lighting (better for low poly)
        const primaryMat = new THREE.MeshPhongMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.1, // Reduced from 0.3 to prevent washout
            shininess: 30
        });
        const darkMat = new THREE.MeshPhongMaterial({
            color: 0x333333,
            emissive: 0x111111,
            emissiveIntensity: 0.1,
            shininess: 30
        });
        const cabinMat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.1,
            shininess: 90
        });
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Engine glow

        // Helper to add parts
        function addPart(geom, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
            const part = new THREE.Mesh(geom, mat);
            part.position.set(...pos);
            part.rotation.set(...rot);
            part.scale.set(...scale);
            part.castShadow = true;
            part.receiveShadow = true;
            mesh.add(part);
            return part;
        }

        switch (type) {
            case 'dart':
                // Long sleek cone
                addPart(new THREE.ConeGeometry(0.5, 2.0, 4), primaryMat, [0, 0, 0], [Math.PI / 2, Math.PI / 4, 0]);
                // Wings
                addPart(new THREE.BoxGeometry(1.6, 0.1, 0.8), primaryMat, [0, 0, 0.5]);

                collisionRadius = 1.0;
                engineOffset.set(0, 0, 1.0);
                turretMounts.push({ position: new THREE.Vector3(0, 0.2, -0.5), type: 'triangular' });
                break;

            case 'saucer':
                // Main disc
                addPart(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 8), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Cabin bubble top
                addPart(new THREE.IcosahedronGeometry(0.4, 0), cabinMat, [0, 0.2, 0]);

                collisionRadius = 1.0;
                engineOffset.set(0, 0, 0.8);
                turretMounts.push({ position: new THREE.Vector3(0, 0.6, 0), type: 'circular' });
                break;

            case 'hauler':
                // Main Box
                addPart(new THREE.BoxGeometry(0.8, 0.8, 1.5), primaryMat, [0, 0, 0]);
                // Cockpit front
                addPart(new THREE.BoxGeometry(0.6, 0.5, 0.5), cabinMat, [0, 0.2, -0.9]);
                // Cargo containers side
                addPart(new THREE.BoxGeometry(0.4, 0.4, 1.2), darkMat, [-0.7, 0, 0]);
                addPart(new THREE.BoxGeometry(0.4, 0.4, 1.2), darkMat, [0.7, 0, 0]);

                collisionRadius = 1.2;
                engineOffset.set(0, 0, 0.8);
                turretMounts.push({ position: new THREE.Vector3(0.5, 0.45, -0.6), type: 'square' });
                turretMounts.push({ position: new THREE.Vector3(-0.5, 0.45, -0.6), type: 'square' });
                break;

            case 'interceptor':
                // Central fuse
                addPart(new THREE.BoxGeometry(0.4, 0.4, 1.8), primaryMat, [0, 0, 0]);
                // X-Wings (using 4 rotated boxes)
                const wingGeom = new THREE.BoxGeometry(1.2, 0.1, 0.5);
                addPart(wingGeom, primaryMat, [0.8, 0.5, 0.5], [0, 0, -Math.PI / 6]); // Top-Right
                addPart(wingGeom, primaryMat, [-0.8, 0.5, 0.5], [0, 0, Math.PI / 6]); // Top-Left
                addPart(wingGeom, primaryMat, [0.8, -0.5, 0.5], [0, 0, Math.PI / 6]); // Bot-Right
                addPart(wingGeom, primaryMat, [-0.8, -0.5, 0.5], [0, 0, -Math.PI / 6]); // Bot-Left

                collisionRadius = 1.0;
                engineOffset.set(0, 0, 0.9);
                turretMounts.push({ position: new THREE.Vector3(0, 0.3, 0), type: 'circular' });
                break;

            case 'needle':
                // Very long thin cylinder
                addPart(new THREE.CylinderGeometry(0.2, 0.3, 2.2, 6), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Rear ring
                addPart(new THREE.TorusGeometry(0.4, 0.1, 4, 8), darkMat, [0, 0, 0.8]);

                collisionRadius = 0.5;
                engineOffset.set(0, 0, 1.1);
                turretMounts.push({ position: new THREE.Vector3(0, 0.2, 0), type: 'triangular' });
                break;

            case 'twinhull':
                // Left Hull
                addPart(new THREE.BoxGeometry(0.4, 0.4, 2.0), primaryMat, [-0.6, 0, 0]);
                // Right Hull
                addPart(new THREE.BoxGeometry(0.4, 0.4, 2.0), primaryMat, [0.6, 0, 0]);
                // Center strut
                addPart(new THREE.BoxGeometry(1.0, 0.2, 0.4), darkMat, [0, 0, 0]);
                // Pod
                addPart(new THREE.SphereGeometry(0.3, 8, 8), cabinMat, [0, 0.1, -0.2]);

                collisionRadius = 1.1;
                engineOffset.set(0, 0, 1.0);
                turretMounts.push({ position: new THREE.Vector3(-0.6, 0.25, -0.5), type: 'triangular' });
                turretMounts.push({ position: new THREE.Vector3(0.6, 0.25, -0.5), type: 'triangular' });
                break;

            case 'hammerhead':
                // Body
                addPart(new THREE.BoxGeometry(0.5, 0.4, 1.8), primaryMat, [0, 0, 0.2]);
                // Head
                addPart(new THREE.BoxGeometry(1.6, 0.3, 0.4), primaryMat, [0, 0, -0.8]);

                collisionRadius = 1.0;
                engineOffset.set(0, 0, 1.1);
                turretMounts.push({ position: new THREE.Vector3(-0.6, 0.2, -0.8), type: 'square' });
                turretMounts.push({ position: new THREE.Vector3(0.6, 0.2, -0.8), type: 'square' });
                break;

            case 'speeder':
                // Big engine Left
                addPart(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), primaryMat, [-0.5, 0, 0.2], [Math.PI / 2, 0, 0]);
                // Big engine Right
                addPart(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), primaryMat, [0.5, 0, 0.2], [Math.PI / 2, 0, 0]);
                // Center seat
                addPart(new THREE.BoxGeometry(0.4, 0.2, 0.6), cabinMat, [0, -0.1, 0.5]);

                collisionRadius = 0.9;
                engineOffset.set(0, 0, 0.8);
                turretMounts.push({ position: new THREE.Vector3(0, 0.1, 0.5), type: 'circular' });
                break;

            case 'orbiter':
                // Core
                addPart(new THREE.IcosahedronGeometry(0.6, 0), primaryMat, [0, 0, 0]);
                // Ring
                addPart(new THREE.TorusGeometry(0.9, 0.1, 4, 12), darkMat, [0, 0, 0], [Math.PI / 2, 0, 0]); // Vertical ring?
                // Or flat ring
                addPart(new THREE.TorusGeometry(0.9, 0.05, 4, 12), cabinMat, [0, 0, 0]); // Flat ring

                collisionRadius = 1.0;
                engineOffset.set(0, 0, 0.7);
                turretMounts.push({ position: new THREE.Vector3(0, 0.6, 0), type: 'circular' });
                break;

            case 'viper':
            default:
                // Re-creating the original tetrahedrons roughly
                // Hull
                // (radius, height, isTop, color)
                // createTetrahdron logic was complex, let's approximate with Cone
                addPart(new THREE.ConeGeometry(0.8, 1.0, 3), primaryMat, [0, -0.25, 0], [Math.PI / 2, 0, Math.PI]); // Pointing -Z
                // Cabin
                addPart(new THREE.ConeGeometry(0.5, 0.6, 3), cabinMat, [0, 0.25, 0.2], [Math.PI / 2, 0, Math.PI]);

                collisionRadius = 1.0;
                engineOffset.set(0, 0, 0.5);
                turretMounts.push({ position: new THREE.Vector3(0, 0.4, 0), type: 'triangular' });
                break;
        }

        // Common Axis Helper (optional, handled by Spaceship debug)

        return { mesh, collisionRadius, engineOffset, turretMounts };
    }

    static getRandomType() {
        return SHIP_TYPES[Math.floor(Math.random() * SHIP_TYPES.length)];
    }
}
