import * as THREE from 'three';

const _viewPos = new THREE.Vector3();
const _viewDir = new THREE.Vector3();
const _horizonCenter = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _tempPoint = new THREE.Vector3();

// Pre-allocate array for horizon points (16 points for smooth approximation)
const _horizonPoints = [];
for (let i = 0; i < 16; i++) _horizonPoints.push(new THREE.Vector3());

export class HUD {
    constructor(game, mainCamera) {
        this.game = game;
        this.mainCamera = mainCamera;

        // Orthographic Camera for UI overlay (Screen Space)
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0, 10);
        this.camera.position.z = 5;

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
        // Simple 2D box outline
        const points = [
            new THREE.Vector3(-0.5, -0.5, 0),
            new THREE.Vector3(0.5, -0.5, 0),
            new THREE.Vector3(0.5, 0.5, 0),
            new THREE.Vector3(-0.5, 0.5, 0)
        ];

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00 });

        const box = new THREE.LineLoop(geometry, material);
        box.frustumCulled = false;

        // Invisible Hit Mesh for Raycasting
        const hitGeometry = new THREE.PlaneGeometry(1, 1);
        const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
        hitMesh.userData = { target: celestialBody };

        box.add(hitMesh);
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
                item.material.color.setHex(0x33ccff);
            } else {
                item.material.color.setHex(0xffff00);
            }
        });
    }

    onResize(width, height) {
        this.camera.left = -width / 2;
        this.camera.right = width / 2;
        this.camera.top = height / 2;
        this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix();
    }

    update() {
        if (this.game.gameMode !== 'game') {
            this.scene.visible = false;
            return;
        }

        this.scene.visible = true;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const camPos = this.mainCamera.position;

        this.overlays.forEach(item => {
            if (!item.target || !item.target.position) return;

            const r = item.target.sizeRadius;
            const targetPos = item.target.position;

            // Vector from Camera to Sphere Center
            _viewDir.subVectors(targetPos, camPos);
            const L2 = _viewDir.lengthSq();
            const L = Math.sqrt(L2);

            // Ensure we are outside the sphere
            if (L <= r * 1.05) {
                item.mesh.visible = false;
                return;
            }

            // --- HORIZON CIRCLE CALCULATION ---

            // Distance from Camera to Horizon Plane
            // d = L - (r^2 / L) = (L^2 - r^2) / L
            const dHorizon = (L2 - r * r) / L;

            // Radius of Horizon Circle
            // rH = sqrt(r^2 - (r^2/L)^2) = r * sqrt(1 - (r/L)^2) = (r/L) * sqrt(L^2 - r^2)
            const rHorizon = (r / L) * Math.sqrt(L2 - r * r);

            // Center of Horizon Circle in World Space
            // H = CamPos + ViewDirNormalized * dHorizon
            _viewDir.normalize();
            _horizonCenter.copy(camPos).addScaledVector(_viewDir, dHorizon);

            // Construct Basis for Horizon Circle Plane (Perpendicular to ViewDir)
            // Use Camera Up as initial reference to ensure stability, but project it to be orthogonal
            // Actually, we can use an arbitrary vector, but camera up reduces jitter.
            _camUp.set(0, 1, 0).applyQuaternion(this.mainCamera.quaternion);

            // Right = ViewDir x CamUp
            _right.crossVectors(_viewDir, _camUp).normalize();
            if (_right.lengthSq() < 0.001) {
                // ViewDir is parallel to CamUp (looking straight down/up)
                // Use World X
                _right.crossVectors(_viewDir, new THREE.Vector3(1, 0, 0)).normalize();
            }

            // Up (on horizon plane) = Right x ViewDir
            _up.crossVectors(_right, _viewDir).normalize();

            // --- GENERATE & PROJECT POINTS ---
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let visibleCount = 0;

            const numPoints = 16;
            for (let i = 0; i < numPoints; i++) {
                const theta = (i / numPoints) * Math.PI * 2;
                const cos = Math.cos(theta);
                const sin = Math.sin(theta);

                // Point on Horizon Circle
                // P = Center + rH * (cos * Right + sin * Up)
                _tempPoint.copy(_horizonCenter)
                    .addScaledVector(_right, rHorizon * cos)
                    .addScaledVector(_up, rHorizon * sin);

                // Project to Screen
                _tempPoint.project(this.mainCamera);

                // Check Bounds [-1, 1]
                // Note: If z > 1, it's clipped by far plane. If z < -1 not visible?
                // Standard project: result is in NDC.
                // If the sphere is visible, the horizon should be largely visible.

                if (_tempPoint.z < 1 && _tempPoint.z > -1) {
                    visibleCount++;
                    const sx = _tempPoint.x * halfWidth;
                    const sy = _tempPoint.y * halfHeight;

                    if (sx < minX) minX = sx;
                    if (sx > maxX) maxX = sx;
                    if (sy < minY) minY = sy;
                    if (sy > maxY) maxY = sy;
                }
            }

            if (visibleCount < 4) { // Arbitrary threshold
                item.mesh.visible = false;
                return;
            }

            item.mesh.visible = true;

            // Apply Margin
            const margin = 10;
            minX -= margin;
            maxX += margin;
            minY -= margin;
            maxY += margin;

            const w = maxX - minX;
            const h = maxY - minY;
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;

            if (w > width * 5 || h > height * 5) {
                item.mesh.visible = false;
                return;
            }

            item.mesh.position.set(cx, cy, 0);
            item.mesh.scale.set(w, h, 1);
        });
    }
}
