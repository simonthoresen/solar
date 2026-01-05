import * as THREE from 'three';

export class HUD {
    constructor(game, camera) {
        this.game = game;
        this.camera = camera;
        this.scene = new THREE.Scene();
        this.overlays = [];
        this.selectedBody = null;
    }

    init(celestialBodies) {
        celestialBodies.forEach(body => {
            this.createOverlay(body);
        });
    }

    createOverlay(celestialBody) {
        // "square should be the same size as the celestial body... so first find the perfect fit square box and then add a fixed margin"
        // Perfect fit half-side is sizeRadius.
        // Add fixed margin (e.g. 2.0 units)
        const margin = 2.0;
        const r = celestialBody.sizeRadius + margin;

        const points = [
            new THREE.Vector3(-r, -r, 0),
            new THREE.Vector3(r, -r, 0),
            new THREE.Vector3(r, r, 0),
            new THREE.Vector3(-r, r, 0)
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        // Default color: Regular Yellow, Thickness 2
        const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });

        const box = new THREE.LineLoop(geometry, material);

        // Invisible Hit Mesh for Raycasting
        // Plane covering the box area
        const hitGeometry = new THREE.PlaneGeometry(r * 2, r * 2);
        const hitMaterial = new THREE.MeshBasicMaterial({ visible: false }); // Invisible but raycastable
        const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
        hitMesh.userData = { target: celestialBody }; // Link back to body

        // Add both to a container object? 
        // Or just add hitMesh to scene and sync it?
        // Let's add hitMesh as child of box? 
        // If box is LineLoop, adding child might work but rotation applies.
        // Let's just create a Group or manage them separately.
        // Simplest: box and hitMesh are siblings in the scene or hitMesh is child of box.

        box.add(hitMesh); // hitMesh will inherit position/rotation from box

        // Add to HUD scene
        this.scene.add(box);

        this.overlays.push({
            mesh: box,
            hitMesh: hitMesh,
            target: celestialBody,
            material: material
        });
    }

    setSelected(celestialBody) {
        this.selectedBody = celestialBody;
        this.overlays.forEach(item => {
            if (item.target === celestialBody) {
                // Selected: Light Blue (Cyan-ish)
                item.material.color.setHex(0x33ccff);
                item.material.linewidth = 2;
            } else {
                // Unselected: Regular Yellow
                item.material.color.setHex(0xffff00);
                item.material.linewidth = 2;
            }
        });
    }

    update() {
        if (this.game.gameMode !== 'game') {
            this.scene.visible = false;
            return;
        }

        this.scene.visible = true;

        this.overlays.forEach(item => {
            if (!item.target || !item.target.position) return;

            // Sync Position
            item.mesh.position.copy(item.target.position);

            // Billboarding: Face Camera
            // We want it to be a 2D square facing the camera.
            item.mesh.quaternion.copy(this.camera.quaternion);

            // Check visibility/distance if necessary?
            // "Rendered after other scene... not take into account lighting" handled by Game.js loop
        });
    }
}
