
import * as THREE from 'three';

export class DetailPanel {
    constructor(game) {
        this.game = game;
        this.isVisible = false;
        this.selectedObject = null;
        this.previewScene = null;
        this.previewCamera = null;
        this.previewRenderer = null;
        this.previewMesh = null;

        this.initUI();
        this.init3D();
    }

    initUI() {
        this.container = document.createElement('div');
        this.container.id = 'detail-panel';
        this.container.style.display = 'none'; // Hidden by default

        // Inner HTML structure
        this.container.innerHTML = `
            <div id="preview-container"></div>
            <div id="detail-content">
                <h2 id="detail-title">Object Name</h2>
                <div id="detail-attributes"></div>
            </div>
        `;

        document.body.appendChild(this.container);

        // Cache DOM elements
        this.previewContainer = this.container.querySelector('#preview-container');
        this.titleElement = this.container.querySelector('#detail-title');
        this.attributesElement = this.container.querySelector('#detail-attributes');
    }

    init3D() {
        // Create separate scene for preview
        this.previewScene = new THREE.Scene();

        // Camera
        this.previewCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        this.previewCamera.position.z = 4;

        // Renderer
        this.previewRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.previewRenderer.setSize(200, 200); // Fixed size for now, matches CSS
        this.previewRenderer.setClearColor(0x000000, 0); // Transparent

        this.previewContainer.appendChild(this.previewRenderer.domElement);

        // Lights for preview
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.previewScene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(2, 2, 5);
        this.previewScene.add(dirLight);
    }

    show(object) {
        if (!object) return;

        this.selectedObject = object;
        this.isVisible = true;
        this.container.style.display = 'flex';

        this.updateContent(object);
        this.updatePreviewMesh(object);
    }

    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
        this.selectedObject = null;
    }

    updateContent(object) {
        // Clear previous attributes
        this.attributesElement.innerHTML = '';

        let title = 'Unknown Object';
        const attributes = [];

        // Check type and extract data
        if (object.constructor.name === 'CelestialBody') {
            title = object.configId ? object.configId.toUpperCase() : 'PLANET';

            attributes.push({ label: 'Type', value: object.parent ? 'Planet/Moon' : 'Star' });
            attributes.push({ label: 'Radius', value: object.sizeRadius.toFixed(2) });
            if (object.parent) {
                attributes.push({ label: 'Orbit Distance', value: object.orbitDistance.toFixed(0) });
                attributes.push({ label: 'Orbit Speed', value: object.orbitSpeed.toFixed(3) });
            }
            attributes.push({ label: 'Rotation Speed', value: object.rotationSpeed.toFixed(3) });

        } else if (object.isPlayer || (object.constructor.name === 'NPC')) {
            const isPlayer = object.isPlayer;
            const isNPC = !isPlayer;

            title = isPlayer ? 'PLAYER SHIP' : `NPC SHIP (${object.type.toUpperCase()})`;

            attributes.push({ label: 'Type', value: 'Spacecraft' });

            if (isNPC) {
                const dist = object.position.distanceTo(this.game.player.position);
                attributes.push({ label: 'Distance', value: dist.toFixed(0) });

                // Aggression
                let status = 'Neutral';
                let color = '#ccc';
                if (object.hasAttacked || object.type === 'kamikaze') {
                    status = 'HOSTILE';
                    color = '#ff4444';
                } else if (object.type === 'hopper') {
                    status = 'Peaceful';
                    color = '#44ff44';
                }
                attributes.push({ label: 'Status', value: status, color: color });
            }

            if (object.health !== undefined) {
                attributes.push({ label: 'Health', value: Math.ceil(object.health) });
            }
            if (object.shield !== undefined) {
                attributes.push({ label: 'Shield', value: Math.ceil(object.shield) });
            }
        }

        // Render Title
        this.titleElement.innerText = title;

        // Render Attributes
        attributes.forEach(attr => {
            const row = document.createElement('div');
            row.className = 'detail-row';

            const label = document.createElement('span');
            label.className = 'detail-label';
            label.innerText = attr.label;

            const value = document.createElement('span');
            value.className = 'detail-value';
            value.innerText = attr.value;
            if (attr.color) value.style.color = attr.color;

            row.appendChild(label);
            row.appendChild(value);
            this.attributesElement.appendChild(row);
        });
    }

    updatePreviewMesh(object) {
        // Remove old mesh
        if (this.previewMesh) {
            this.previewScene.remove(this.previewMesh);
            // Dispose logic simplified: rely on garbage collection for now or implement deep dispose if memory is an issue
            this.previewMesh = null;
        }

        if (!object.mesh) return;

        const original = object.mesh;
        let previewObject;

        if (original.isGroup) {
            previewObject = new THREE.Group();
            original.children.forEach(child => {
                // Only clone Meshes (Hull, Cabin), ignore Lines (Helpers)
                if (child.isMesh) {
                    // Check if it's a wake mesh ? 
                    // Users might want to see the wake? 
                    // Spaceship.js: wakeMesh is a child. 
                    // Let's clone it.
                    const clone = child.clone();
                    previewObject.add(clone);
                }
            });
        } else if (original.isMesh) {
            // Planet (Mesh)
            // Existing logic: clone geometry/material to get rid of children (helpers) 
            // OR just clone the mesh and remove children?
            // Planets have children like lights, axisLines.
            // Cleaner to new Mesh(geometry, material).
            const geometry = original.geometry;
            const material = original.material;
            previewObject = new THREE.Mesh(geometry, material);
        } else {
            return;
        }

        this.previewMesh = previewObject;

        // Normalize Scale
        const box = new THREE.Box3().setFromObject(previewObject);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const radius = sphere.radius;

        if (radius > 0) {
            const scale = 1.5 / radius;
            this.previewMesh.scale.set(scale, scale, scale);
        }

        this.previewScene.add(this.previewMesh);
    }

    update(dt) {
        if (!this.isVisible) return;

        // Rotate preview mesh
        if (this.previewMesh) {
            // Match object rotation?
            if (this.selectedObject && this.selectedObject.mesh) {
                this.previewMesh.rotation.copy(this.selectedObject.mesh.rotation);
            } else {
                // Fallback spin
                this.previewMesh.rotation.y += dt * 0.5;
            }
        }

        this.previewRenderer.render(this.previewScene, this.previewCamera);
    }
}
