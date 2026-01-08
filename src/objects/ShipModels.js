import * as THREE from 'three';

export const SHIP_TYPES = [
    'viper', 'dart', 'saucer', 'hauler', 'interceptor',
    'needle', 'twinhull', 'hammerhead', 'speeder', 'orbiter',
    'phantom', 'guardian', 'titan', 'corsair', 'sentinel',
    'reaver', 'raptor', 'vanguard', 'wraith', 'valkyrie'
];

export class ShipModels {
    /**
     * Creates a ship model group based on type.
     * @param {string} type
     * @param {number} color
     * @returns {object} { mesh: THREE.Group, collisionRadius: number, thrusterOffsets: THREE.Vector3[], thrusterConfigs: Array, turretMounts: Array, animations: Array }
     */
    static createModel(type, color) {
        const mesh = new THREE.Group();
        let collisionRadius = 1.0;
        let thrusterOffsets = [new THREE.Vector3(0, 0, 1.0)]; // Array to support multiple engines
        let thrusterConfigs = []; // Array of { exhaustWidth, exhaustLength, smokeSize, smokeColor, smokeLifetime }
        let turretMounts = []; // Array of { position: Vector3, type: string }
        let animations = []; // Array of { mesh: THREE.Mesh, type: string, axis: string, speed: number, thrusterOffsets?: Vector3[] }

        // Default thruster configuration
        const defaultThrusterConfig = {
            exhaustWidth: 3.0,
            exhaustLength: 6.0,
            exhaustForce: 10.0,
            smokeSize: 0.3,
            smokeColor: 0xaaaaaa,
            smokeLifetime: 3.0
        };

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
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.0)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 16.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.2, -0.5), type: 'triangular' });
                break;

            case 'saucer':
                // Main disc
                addPart(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 8), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Cabin bubble top
                addPart(new THREE.IcosahedronGeometry(0.4, 0), cabinMat, [0, 0.2, 0]);

                collisionRadius = 1.0;
                thrusterOffsets = [new THREE.Vector3(0, 0, 0.8)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 11.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
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
                thrusterOffsets = [new THREE.Vector3(0, 0, 0.8)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 9.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
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
                thrusterOffsets = [new THREE.Vector3(0, 0, 0.9)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 17.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.3, 0), type: 'circular' });
                break;

            case 'needle':
                // Very long thin cylinder
                addPart(new THREE.CylinderGeometry(0.2, 0.3, 2.2, 6), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Rear ring
                addPart(new THREE.TorusGeometry(0.4, 0.1, 4, 8), darkMat, [0, 0, 0.8]);

                collisionRadius = 0.5;
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.1)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 18.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
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
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.0)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 13.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(-0.6, 0.25, -0.5), type: 'triangular' });
                turretMounts.push({ position: new THREE.Vector3(0.6, 0.25, -0.5), type: 'triangular' });
                break;

            case 'hammerhead':
                // Body
                addPart(new THREE.BoxGeometry(0.5, 0.4, 1.8), primaryMat, [0, 0, 0.2]);
                // Head
                addPart(new THREE.BoxGeometry(1.6, 0.3, 0.4), primaryMat, [0, 0, -0.8]);

                collisionRadius = 1.0;
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.1)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 14.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
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
                thrusterOffsets = [new THREE.Vector3(0, 0, 0.8)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 19.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.1, 0.5), type: 'circular' });
                break;

            case 'orbiter':
                // Core
                addPart(new THREE.IcosahedronGeometry(0.6, 0), primaryMat, [0, 0, 0]);

                // Animated Ring 1 (vertical, rotates around Y axis)
                const ring1 = addPart(new THREE.TorusGeometry(0.85, 0.08, 6, 16), darkMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                animations.push({ mesh: ring1, type: 'rotate', axis: 'y', speed: 1.0 });

                // Animated Ring 2 (horizontal, rotates around X axis)
                const ring2 = addPart(new THREE.TorusGeometry(0.95, 0.08, 6, 16), cabinMat, [0, 0, 0]);
                animations.push({ mesh: ring2, type: 'rotate', axis: 'x', speed: -0.8 });

                collisionRadius = 1.0;
                thrusterOffsets = [new THREE.Vector3(0, 0, 0.7)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 12.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.6, 0), type: 'circular' });
                break;

            case 'phantom':
                // Stealth angular diamond design
                // Main body - octagonal prism pointing forward
                addPart(new THREE.CylinderGeometry(0.5, 0.3, 2.0, 8), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Angular wings
                addPart(new THREE.BoxGeometry(1.8, 0.05, 0.6), primaryMat, [0, 0, 0.3], [0, 0, Math.PI / 8]);
                // Cockpit
                addPart(new THREE.ConeGeometry(0.2, 0.4, 8), cabinMat, [0, 0, -0.8], [Math.PI / 2, 0, 0]);
                // Engine nacelle
                addPart(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8), darkMat, [0, 0, 0.9], [Math.PI / 2, 0, 0]);

                collisionRadius = 1.2;
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.2)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 10.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.3, -0.2), type: 'triangular' });
                break;

            case 'guardian':
                // Defensive bulky design
                // Main armored hull
                addPart(new THREE.BoxGeometry(1.2, 0.8, 1.6), primaryMat, [0, 0, 0]);
                // Cockpit turret
                addPart(new THREE.CylinderGeometry(0.4, 0.5, 0.6, 8), cabinMat, [0, 0.5, -0.3]);
                // Armor plates
                addPart(new THREE.BoxGeometry(0.3, 0.6, 1.4), darkMat, [-0.75, 0, 0]);
                addPart(new THREE.BoxGeometry(0.3, 0.6, 1.4), darkMat, [0.75, 0, 0]);
                // Engine block
                addPart(new THREE.BoxGeometry(0.8, 0.6, 0.5), darkMat, [0, 0, 0.9]);

                collisionRadius = 1.3;
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.2)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 11.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(-0.5, 0.5, -0.4), type: 'square' });
                turretMounts.push({ position: new THREE.Vector3(0.5, 0.5, -0.4), type: 'square' });
                break;

            case 'titan':
                // Large heavy ship
                // Main thick hull
                addPart(new THREE.CylinderGeometry(0.7, 0.8, 2.5, 12), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Command tower
                addPart(new THREE.BoxGeometry(0.6, 0.7, 0.8), cabinMat, [0, 0.6, -0.4]);
                // Side reinforcements
                addPart(new THREE.BoxGeometry(0.4, 0.5, 2.0), darkMat, [-1.0, 0, 0.2]);
                addPart(new THREE.BoxGeometry(0.4, 0.5, 2.0), darkMat, [1.0, 0, 0.2]);
                // Massive engine
                addPart(new THREE.CylinderGeometry(0.6, 0.7, 0.8, 12), darkMat, [0, 0, 1.4], [Math.PI / 2, 0, 0]);

                collisionRadius = 1.5;
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.8)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 15.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.8, -0.4), type: 'circular' });
                turretMounts.push({ position: new THREE.Vector3(-0.8, 0.3, 0), type: 'square' });
                turretMounts.push({ position: new THREE.Vector3(0.8, 0.3, 0), type: 'square' });
                break;

            case 'corsair':
                // Main body
                addPart(new THREE.SphereGeometry(1.0, 12, 8), primaryMat, [0, 0, 0], [0, 0, 0]);
                // Engine cone from 0z to 2z
                addPart(new THREE.CylinderGeometry(0.3, 0.4, 2.0, 10), darkMat, [0, 0, 1], [Math.PI / 2, 0, 0]);

                collisionRadius = 1.1;
                thrusterOffsets = [new THREE.Vector3(0, 0, 2)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 16.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0, 0), type: 'circular' });
                break;

            case 'sentinel':
                // Patrol ship with sensor arrays
                // Main fuselage
                addPart(new THREE.CylinderGeometry(0.4, 0.4, 2.2, 10), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Sensor dish
                addPart(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16), cabinMat, [0, 0.5, -0.2]);
                // Sensor array spikes
                addPart(new THREE.BoxGeometry(0.05, 0.6, 0.05), darkMat, [0, 0.8, -0.2]);
                addPart(new THREE.BoxGeometry(0.6, 0.05, 0.05), darkMat, [0, 0.8, -0.2]);
                // Wings with sensors
                addPart(new THREE.BoxGeometry(1.6, 0.08, 0.5), primaryMat, [0, -0.1, 0.4]);
                // Engine pod
                addPart(new THREE.CylinderGeometry(0.3, 0.35, 0.6, 10), darkMat, [0, 0, 1.0], [Math.PI / 2, 0, 0]);

                collisionRadius = 1.0;
                thrusterOffsets = [new THREE.Vector3(0, 0, 1.3)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 13.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.2, 0.4), type: 'circular' });
                break;

            case 'reaver':
                // Aggressive combat ship with split nacelles (DUAL ENGINE)
                // Central body
                addPart(new THREE.BoxGeometry(0.6, 0.5, 1.8), primaryMat, [0, 0, 0]);
                // Aggressive nose
                addPart(new THREE.ConeGeometry(0.4, 0.8, 8), primaryMat, [0, 0, -1.2], [Math.PI / 2, 0, 0]);
                // Cockpit
                addPart(new THREE.SphereGeometry(0.25, 10, 8), cabinMat, [0, 0.3, -0.5]);
                // Left engine nacelle
                addPart(new THREE.CylinderGeometry(0.25, 0.3, 1.6, 10), darkMat, [-0.7, 0, 0.2], [Math.PI / 2, 0, 0]);
                // Right engine nacelle
                addPart(new THREE.CylinderGeometry(0.25, 0.3, 1.6, 10), darkMat, [0.7, 0, 0.2], [Math.PI / 2, 0, 0]);
                // Wing struts
                addPart(new THREE.BoxGeometry(1.2, 0.08, 0.3), primaryMat, [0, 0, 0.5]);

                collisionRadius = 1.2;
                thrusterOffsets = [new THREE.Vector3(-0.7, 0, 1.0), new THREE.Vector3(0.7, 0, 1.0)];

                // Aggressive dual-color thrusters: red left (powerful), blue right (efficient)
                thrusterConfigs = [
                    {
                        exhaustWidth: 2.5,
                        exhaustLength: 5.0,
                        exhaustForce: 15.0,
                        smokeSize: 0.35,
                        smokeColor: 0xff4444,
                        smokeLifetime: 2.5
                    },
                    {
                        exhaustWidth: 2.5,
                        exhaustLength: 5.0,
                        exhaustForce: 12.0,
                        smokeSize: 0.35,
                        smokeColor: 0x4444ff,
                        smokeLifetime: 2.5
                    }
                ];

                turretMounts.push({ position: new THREE.Vector3(-0.7, 0.3, -0.2), type: 'triangular' });
                turretMounts.push({ position: new THREE.Vector3(0.7, 0.3, -0.2), type: 'triangular' });
                break;

            case 'raptor':
                // Bird-like predator with wing-mounted engines (DUAL ENGINE)
                // Sleek body
                addPart(new THREE.CylinderGeometry(0.3, 0.4, 2.0, 12), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Head/cockpit
                addPart(new THREE.ConeGeometry(0.35, 0.6, 12), cabinMat, [0, 0, -1.2], [Math.PI / 2, 0, 0]);
                // Wide swept wings
                addPart(new THREE.BoxGeometry(2.2, 0.08, 0.9), primaryMat, [0, 0, 0.3], [0, 0, -Math.PI / 12]);
                // Left wingtip engine
                addPart(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 12), darkMat, [-1.1, 0, 0.5], [Math.PI / 2, 0, 0]);
                // Right wingtip engine
                addPart(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 12), darkMat, [1.1, 0, 0.5], [Math.PI / 2, 0, 0]);
                // Tail fins
                addPart(new THREE.BoxGeometry(0.6, 0.4, 0.08), primaryMat, [0, 0.3, 0.9], [0, Math.PI / 4, 0]);

                collisionRadius = 1.3;
                thrusterOffsets = [new THREE.Vector3(-1.1, 0, 0.9), new THREE.Vector3(1.1, 0, 0.9)];

                // Asymmetric thrusters: large hot orange left (very powerful), small cool blue right (weak)
                thrusterConfigs = [
                    {
                        exhaustWidth: 3.5,
                        exhaustLength: 7.0,
                        exhaustForce: 20.0,
                        smokeSize: 0.45,
                        smokeColor: 0xff8800,
                        smokeLifetime: 3.5
                    },
                    {
                        exhaustWidth: 2.0,
                        exhaustLength: 4.0,
                        exhaustForce: 8.0,
                        smokeSize: 0.2,
                        smokeColor: 0x6688ff,
                        smokeLifetime: 2.0
                    }
                ];

                turretMounts.push({ position: new THREE.Vector3(0, 0.2, -0.3), type: 'circular' });
                break;

            case 'vanguard':
                // Military style with parallel engine pods (DUAL ENGINE)
                // Main fuselage
                addPart(new THREE.BoxGeometry(0.5, 0.4, 2.2), primaryMat, [0, 0, 0]);
                // Cockpit
                addPart(new THREE.BoxGeometry(0.4, 0.5, 0.8), cabinMat, [0, 0.3, -0.8]);
                // Left engine pod
                addPart(new THREE.CylinderGeometry(0.3, 0.35, 1.8, 12), darkMat, [-0.6, -0.1, 0.1], [Math.PI / 2, 0, 0]);
                // Right engine pod
                addPart(new THREE.CylinderGeometry(0.3, 0.35, 1.8, 12), darkMat, [0.6, -0.1, 0.1], [Math.PI / 2, 0, 0]);
                // Connecting wings
                addPart(new THREE.BoxGeometry(1.0, 0.08, 0.4), primaryMat, [0, -0.1, 0.3]);
                addPart(new THREE.BoxGeometry(1.0, 0.08, 0.4), primaryMat, [0, -0.1, 0.8]);
                // Weapon hardpoints
                addPart(new THREE.BoxGeometry(0.15, 0.15, 0.6), darkMat, [-0.6, -0.4, 0.3]);
                addPart(new THREE.BoxGeometry(0.15, 0.15, 0.6), darkMat, [0.6, -0.4, 0.3]);

                collisionRadius = 1.2;
                thrusterOffsets = [new THREE.Vector3(-0.6, -0.1, 1.0), new THREE.Vector3(0.6, -0.1, 1.0)];

                // Military efficient thrusters: large white exhaust left (strong), compact gray right (medium)
                thrusterConfigs = [
                    {
                        exhaustWidth: 3.2,
                        exhaustLength: 6.5,
                        exhaustForce: 14.0,
                        smokeSize: 0.4,
                        smokeColor: 0xdddddd,
                        smokeLifetime: 3.2
                    },
                    {
                        exhaustWidth: 2.5,
                        exhaustLength: 5.0,
                        exhaustForce: 11.0,
                        smokeSize: 0.25,
                        smokeColor: 0x888888,
                        smokeLifetime: 2.8
                    }
                ];

                turretMounts.push({ position: new THREE.Vector3(0, 0.45, -0.4), type: 'square' });
                turretMounts.push({ position: new THREE.Vector3(-0.6, -0.2, -0.3), type: 'triangular' });
                turretMounts.push({ position: new THREE.Vector3(0.6, -0.2, -0.3), type: 'triangular' });
                break;

            case 'wraith':
                // Ghost-like sleek design with side engines (DUAL ENGINE)
                // Ultra-slim body
                addPart(new THREE.CylinderGeometry(0.25, 0.3, 2.4, 16), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Sharp nose
                addPart(new THREE.ConeGeometry(0.25, 0.6, 16), primaryMat, [0, 0, -1.5], [Math.PI / 2, 0, 0]);
                // Minimal cockpit
                addPart(new THREE.SphereGeometry(0.2, 12, 10), cabinMat, [0, 0.15, -0.6]);
                // Side-mounted engines
                addPart(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 16), darkMat, [-0.5, 0, 0.6], [Math.PI / 2, 0, 0]);
                addPart(new THREE.CylinderGeometry(0.18, 0.22, 1.0, 16), darkMat, [0.5, 0, 0.6], [Math.PI / 2, 0, 0]);
                // Thin connecting struts
                addPart(new THREE.BoxGeometry(0.9, 0.05, 0.15), primaryMat, [0, 0, 0.6]);
                // Small fins
                addPart(new THREE.BoxGeometry(0.05, 0.3, 0.4), primaryMat, [0, 0.15, 1.0]);

                collisionRadius = 0.9;
                thrusterOffsets = [new THREE.Vector3(-0.5, 0, 1.1), new THREE.Vector3(0.5, 0, 1.1)];

                // Stealthy thrusters: small dark smoke with subtle differences (low force)
                thrusterConfigs = [
                    {
                        exhaustWidth: 2.2,
                        exhaustLength: 4.5,
                        exhaustForce: 9.0,
                        smokeSize: 0.22,
                        smokeColor: 0x444455,
                        smokeLifetime: 2.3
                    },
                    {
                        exhaustWidth: 2.0,
                        exhaustLength: 4.0,
                        exhaustForce: 7.0,
                        smokeSize: 0.18,
                        smokeColor: 0x333344,
                        smokeLifetime: 2.0
                    }
                ];

                turretMounts.push({ position: new THREE.Vector3(0, 0.25, 0), type: 'circular' });
                break;

            case 'valkyrie':
                // Elegant wings with wingtip engines (DUAL ENGINE)
                // Sleek central body
                addPart(new THREE.CylinderGeometry(0.35, 0.4, 1.8, 16), primaryMat, [0, 0, 0], [Math.PI / 2, 0, 0]);
                // Elegant cockpit
                addPart(new THREE.SphereGeometry(0.3, 16, 12), cabinMat, [0, 0.2, -0.5]);
                // Graceful swept wings
                addPart(new THREE.BoxGeometry(2.4, 0.06, 1.0), primaryMat, [0, 0, 0.2], [0, 0, 0]);
                // Wing decorations
                addPart(new THREE.BoxGeometry(2.2, 0.04, 0.3), darkMat, [0, 0, 0.5], [0, 0, 0]);
                // Tail stabilizer
                addPart(new THREE.BoxGeometry(0.4, 0.5, 0.06), primaryMat, [0, 0.3, 0.9]);

                // Create rotating engine group
                const engineGroup = new THREE.Group();
                engineGroup.position.set(0, 0, 0.4); // Center of rotation

                // Left wingtip engine nacelle (relative to engine group)
                const leftEngine = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 1.0, 16), darkMat);
                leftEngine.position.set(-1.2, 0, 0);
                leftEngine.rotation.set(Math.PI / 2, 0, 0);
                leftEngine.castShadow = true;
                leftEngine.receiveShadow = true;
                engineGroup.add(leftEngine);

                // Right wingtip engine nacelle (relative to engine group)
                const rightEngine = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 1.0, 16), darkMat);
                rightEngine.position.set(1.2, 0, 0);
                rightEngine.rotation.set(Math.PI / 2, 0, 0);
                rightEngine.castShadow = true;
                rightEngine.receiveShadow = true;
                engineGroup.add(rightEngine);

                mesh.add(engineGroup);

                // Base engine offsets relative to the rotating group center
                const baseEngineOffsets = [new THREE.Vector3(-1.2, 0, 0.5), new THREE.Vector3(1.2, 0, 0.5)];

                // Add animation with dynamic engine calculation
                animations.push({
                    mesh: engineGroup,
                    type: 'rotate',
                    axis: 'z',
                    speed: 2.0,
                    thrusterOffsets: baseEngineOffsets,
                    dynamicEngines: true
                });

                collisionRadius = 1.4;
                thrusterOffsets = baseEngineOffsets; // Initial offsets

                // Elegant dual-color thrusters: purple left, cyan right with long trails (balanced force)
                thrusterConfigs = [
                    {
                        exhaustWidth: 2.8,
                        exhaustLength: 6.0,
                        exhaustForce: 13.0,
                        smokeSize: 0.32,
                        smokeColor: 0xbb44ff,
                        smokeLifetime: 4.0
                    },
                    {
                        exhaustWidth: 2.8,
                        exhaustLength: 6.0,
                        exhaustForce: 13.0,
                        smokeSize: 0.32,
                        smokeColor: 0x44ffff,
                        smokeLifetime: 4.0
                    }
                ];

                turretMounts.push({ position: new THREE.Vector3(-0.9, -0.05, 0.1), type: 'circular' });
                turretMounts.push({ position: new THREE.Vector3(0.9, -0.05, 0.1), type: 'circular' });
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
                thrusterOffsets = [new THREE.Vector3(0, 0, 0.5)];
                thrusterConfigs = [{
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    exhaustForce: 12.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                }];
                turretMounts.push({ position: new THREE.Vector3(0, 0.4, 0), type: 'triangular' });
                break;
        }

        // Common Axis Helper (optional, handled by Spaceship debug)

        // Populate thrusterConfigs with defaults if not specified
        while (thrusterConfigs.length < thrusterOffsets.length) {
            thrusterConfigs.push({ ...defaultThrusterConfig });
        }

        return { mesh, collisionRadius, thrusterOffsets, thrusterConfigs, turretMounts, animations };
    }

    static getRandomType() {
        return SHIP_TYPES[Math.floor(Math.random() * SHIP_TYPES.length)];
    }
}
