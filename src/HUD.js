import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

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
        this.resolution = new THREE.Vector2(width, height);

        this.scene = new THREE.Scene();
        this.overlays = [];
        this.selectedBody = null;
    }

    init(celestialBodies) {
        celestialBodies.forEach(body => {
            this.createOverlay(body);
        });
    }

    addPlayer(player) {
        // Player gets a green box
        this.createOverlay(player, 0x00ff00);
    }

    createOverlay(celestialBody, colorOverride = null) {
        // Simple 2D box outline
        // LineLoop doesn't exist for Fat Lines, so we must close the loop manually
        // Points: Bottom-Left -> Bottom-Right -> Top-Right -> Top-Left -> Bottom-Left
        const positions = [
            -0.5, -0.5, 0,
            0.5, -0.5, 0,
            0.5, 0.5, 0,
            -0.5, 0.5, 0,
            -0.5, -0.5, 0
        ];

        const geometry = new LineGeometry();
        geometry.setPositions(positions);

        // Default color Gray (0x888888) if not specified
        const color = colorOverride !== null ? colorOverride : 0x888888;

        const material = new LineMaterial({
            color: color,
            linewidth: 2, // pixels
            resolution: this.resolution, // Resolution of the viewport
            dashed: false
        });

        const box = new Line2(geometry, material);
        box.frustumCulled = false;

        // Invisible Hit Mesh for Raycasting
        // Only valid if target is a CelestialBody (has a mesh)
        let hitMesh = null;
        if (celestialBody.mesh) {
            const hitGeometry = new THREE.PlaneGeometry(1, 1);
            const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
            hitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
            hitMesh.userData = { target: celestialBody };
            box.add(hitMesh);
        }

        this.scene.add(box);

        this.overlays.push({
            mesh: box,
            hitMesh: hitMesh,
            target: celestialBody,
            material: material,
            baseColor: color // Store base color to revert to
        });
    }

    setSelected(celestialBody) {
        this.selectedBody = celestialBody;
        this.overlays.forEach(item => {
            if (item.baseColor === 0x00ff00) return; // Skip player

            if (item.target === celestialBody) {
                item.material.color.setHex(0xffff00); // Yellow
                item.material.linewidth = 5; // Thick lines!
            } else {
                item.material.color.setHex(0x888888); // Gray
                item.material.linewidth = 2; // Standard thickness
            }
        });
    }

    onResize(width, height) {
        this.camera.left = -width / 2;
        this.camera.right = width / 2;
        this.camera.top = height / 2;
        this.camera.bottom = -height / 2;
        this.camera.updateProjectionMatrix();

        // Update resolution for all Fat Lines
        this.resolution.set(width, height);
        this.overlays.forEach(item => {
            if (item.material && item.material.resolution) {
                item.material.resolution.set(width, height);
            }
        });
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

        // Compass Update
        this.updateCompass();
    }

    initCompass() {
        if (this.compassContainer) return;

        // Container
        this.compassContainer = document.createElement('div');
        this.compassContainer.className = 'compass-container';
        document.body.appendChild(this.compassContainer);

        // Tape
        this.compassTape = document.createElement('div');
        this.compassTape.className = 'compass-tape';
        this.compassContainer.appendChild(this.compassTape);

        // Indicators
        this.compassIndicators = document.createElement('div');
        this.compassIndicators.className = 'compass-indicators';
        document.body.appendChild(this.compassIndicators);

        // Player Triangle (Blue)
        this.playerTriangle = document.createElement('div');
        this.playerTriangle.className = 'compass-triangle player';
        this.compassIndicators.appendChild(this.playerTriangle);

        // Target Triangle (Yellow)
        this.targetTriangle = document.createElement('div');
        this.targetTriangle.className = 'compass-triangle target';
        this.compassIndicators.appendChild(this.targetTriangle);

        // Config
        this.compassPPD = 5; // Pixels Per Degree
        this.compassWidth = 600; // Matches CSS
        const step = 15;

        // Generate Ticks (3 sets: -360..0, 0..360, 360..720 effectively)
        // We use 3 sets of 0..360 for seamless scrolling.
        // Index 0: -360 to 0 (conceptually) -> Real positions -360*PPD to 0
        // Index 1: 0 to 360 -> Real positions 0 to 360*PPD
        // Index 2: 360 to 720

        const labels = {
            0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
            180: 'S', 225: 'SW', 270: 'W', 315: 'NW'
        };

        for (let set = -1; set <= 1; set++) {
            const offsetDeg = set * 360;
            for (let deg = 0; deg < 360; deg += step) {
                const tick = document.createElement('div');
                tick.className = 'compass-tick';

                const currentDeg = deg;
                const totalDeg = offsetDeg + currentDeg;
                const pos = totalDeg * this.compassPPD;

                tick.style.left = pos + 'px';

                if (currentDeg % 45 === 0 || currentDeg === 0) {
                    tick.classList.add('major');
                    const label = document.createElement('span');
                    label.className = 'compass-label';
                    label.innerText = labels[currentDeg];
                    // Label should be centered on tick
                    // But styling handles transform x -50
                    tick.appendChild(label);
                }

                this.compassTape.appendChild(tick);
            }
        }
    }

    updateCompass() {
        if (!this.compassContainer) {
            this.initCompass();
        }
        if (!this.compassContainer) return;

        // Ensure visible matches game mode
        const isGame = this.game.gameMode === 'game';
        this.compassContainer.style.display = isGame ? 'block' : 'none';
        this.compassIndicators.style.display = isGame ? 'block' : 'none';

        if (!isGame) return;

        // 1. Camera Heading
        // Three.js: -Z is forward.
        // World North = -Z?
        // Let's assume standard map: North = -Z (0 deg), East = +X (90 deg), South = +Z (180), West = -X (270).
        // Camera Direction vector (x, z).
        // atan2(x, z)? 
        // If x=0, z=-1. atan2(0, -1) = 180 (In JS atan2(y,x)). Here z is 'y' param?
        // Let's use standard math `Math.atan2(z, x)`.
        // x=0, z=-1 (N). atan2(-1, 0) = -PI/2 = -90. We want 0.
        // x=1, z=0 (E). atan2(0, 1) = 0. We want 90.
        // x=0, z=1 (S). atan2(1, 0) = PI/2 = 90. We want 180.
        // x=-1, z=0 (W). atan2(0, -1) = PI = 180. We want 270 (-90).
        // Formula: `degrees = Math.atan2(x, -z) * (180 / Math.PI)` ?
        // x=0, z=-1 (-z=1). atan2(0, 1) = 0. (Math.atan2(y, x) -> x, y order swapped?). 
        // JS: atan2(y, x).
        // Try `atan2(x, -z)`.
        // N: atan2(0, 1) = 0. Correct.
        // E: x=1, z=0. atan2(1, 0) = 90. Correct.
        // S: x=0, z=1 (-z=-1). atan2(0, -1) = 180. Correct.
        // W: x=-1, z=0. atan2(-1, 0) = -90 (270). Correct.

        this.mainCamera.getWorldDirection(_viewDir);
        let camHeading = Math.atan2(_viewDir.x, -_viewDir.z) * (180 / Math.PI);
        if (camHeading < 0) camHeading += 360; // 0..360

        // Tape Position
        // We want 'camHeading' to be at Center of Container.
        // Tape origin (0 deg) is at 0px.
        // Center of container is at `width / 2`.
        // We want `camHeading * PPD` to be at `width / 2`.
        // So `TapePos + camHeading * PPD = width / 2`.
        // `TapePos = width / 2 - camHeading * PPD`.
        // But we have 3 sets. Center set starts at 0.
        // We want to map to the center set mostly.
        // But if camHeading is 0, we view [-Region..+Region]. 
        // Logic: Use the value `camHeading` (0..360) projected onto the geometry.
        // Geometry range: -360..720.
        // We track `camHeading` in continuous space? No, just map 0-360 to the middle set?
        // If CamHeading is 0. We want to show 0.
        // Position on tape = 0.
        // Tape X = 300 - 0 = 300.
        // At X=300, we see tick 0.
        // Left of 0 is -15, -30... (Set -1).
        // It works perfectly with the default math if sets are contiguous.
        // Tape Shift = `center - camHeading * PPD`.
        // Wait, if camHeading is 0, we use tick at 0.
        // If we use tick at 0 (start of Set 1), left is Set 0 (-360..0). Correct.
        // Effectively we treat our tape as infinite universe.
        // `translateX` should be based on `camHeading`.

        const centerX = this.compassWidth / 2;
        const tapeX = centerX - camHeading * this.compassPPD;
        this.compassTape.style.transform = `translateX(${tapeX}px)`;

        // 2. Playe Heading (Blue Triangle)
        // Player Rotation Y. 
        // 0 -> -Z?
        // Player model: Forward is -Z.
        // `player.rotation.y` is Euler.
        // If rotY = 0, facing -Z (North).
        // If rotY = -90 (deg), facing +X?
        // Three.js RotY: Positive is Counter-Clockwise around Y.
        // N (0). Rot+ -> Face Left (West, -X).
        // Wait. `rotY` rotates the object. 
        // Object forward (-Z). Apply RotY(+90).
        // (-Z) x (+90 deg around Y) -> (-X). (West).
        // So RotY is Positive = West / Left Turn.
        // Compass: N(0) -> E(90) -> S(180) -> W(270/-90).
        // Standard Angle: CCW?
        // Math.atan2(x,-z):
        // N(0, -1) -> 0.
        // E(1, 0) -> 90.
        // W(-1, 0) -> -90.
        // So my Compass math is CW (Clockwise positive).
        // N->E->S is 0->90->180.
        // Player RotY is typically CCW (Standard Math/GL).
        // So `PlayerHeading = -PlayerRotY`.

        let playerHeading = -this.game.player.rotation.y * (180 / Math.PI);
        // Normalize
        playerHeading = playerHeading % 360;
        if (playerHeading < 0) playerHeading += 360;

        // Relative Angle
        let diff = playerHeading - camHeading;
        // Normalize diff to -180..180
        if (diff < -180) diff += 360;
        if (diff > 180) diff -= 360;

        // Position
        // Center + Diff * PPD
        let pX = centerX + diff * this.compassPPD;

        // Clamp (Cap to edges)
        // Triangle width ~14px.
        const capMargin = 10;
        if (pX < capMargin) pX = capMargin;
        if (pX > this.compassWidth - capMargin) pX = this.compassWidth - capMargin;

        this.playerTriangle.style.left = pX + 'px';

        // 3. Target (Yellow Triangle)
        if (this.selectedBody) {
            this.targetTriangle.classList.remove('hidden');
            const targetPos = this.selectedBody.position;
            // Vector from Camera to Target
            _tempPoint.subVectors(targetPos, this.mainCamera.position);

            // Heading
            let targetHeading = Math.atan2(_tempPoint.x, -_tempPoint.z) * (180 / Math.PI);
            if (targetHeading < 0) targetHeading += 360;

            let tDiff = targetHeading - camHeading;
            if (tDiff < -180) tDiff += 360;
            if (tDiff > 180) tDiff -= 360;

            let tX = centerX + tDiff * this.compassPPD;
            if (tX < capMargin) tX = capMargin;
            if (tX > this.compassWidth - capMargin) tX = this.compassWidth - capMargin;

            this.targetTriangle.style.left = tX + 'px';

        } else {
            this.targetTriangle.classList.add('hidden');
        }
    }
}
