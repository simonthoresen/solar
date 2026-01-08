import * as THREE from 'three';

export class ArrowKeyCameraRotation {
    constructor(camera, controls, rotateSpeed = 2.0) {
        this.camera = camera;
        this.controls = controls;
        this.rotateSpeed = rotateSpeed;

        this.arrowKeys = {
            up: false,
            down: false,
            left: false,
            right: false
        };

        this.initListeners();
    }

    initListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') this.arrowKeys.up = true;
            if (e.key === 'ArrowDown') this.arrowKeys.down = true;
            if (e.key === 'ArrowLeft') this.arrowKeys.left = true;
            if (e.key === 'ArrowRight') this.arrowKeys.right = true;
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowUp') this.arrowKeys.up = false;
            if (e.key === 'ArrowDown') this.arrowKeys.down = false;
            if (e.key === 'ArrowLeft') this.arrowKeys.left = false;
            if (e.key === 'ArrowRight') this.arrowKeys.right = false;
        });
    }

    update(delta) {
        if (!this.arrowKeys.up && !this.arrowKeys.down &&
            !this.arrowKeys.left && !this.arrowKeys.right) {
            return;
        }

        const offset = new THREE.Vector3();
        const spherical = new THREE.Spherical();

        offset.copy(this.camera.position).sub(this.controls.target);
        spherical.setFromVector3(offset);

        if (this.arrowKeys.left) spherical.theta += this.rotateSpeed * delta;
        if (this.arrowKeys.right) spherical.theta -= this.rotateSpeed * delta;
        if (this.arrowKeys.up) spherical.phi -= this.rotateSpeed * delta;
        if (this.arrowKeys.down) spherical.phi += this.rotateSpeed * delta;

        const minPolarAngle = this.controls.minPolarAngle || 0;
        const maxPolarAngle = this.controls.maxPolarAngle || Math.PI;
        spherical.phi = Math.max(minPolarAngle, Math.min(maxPolarAngle, spherical.phi));
        spherical.makeSafe();

        offset.setFromSpherical(spherical);
        this.camera.position.copy(this.controls.target).add(offset);
        this.camera.lookAt(this.controls.target);
    }
}

export class PointerLockCameraRotation {
    constructor(camera, controls, renderer) {
        this.camera = camera;
        this.controls = controls;
        this.renderer = renderer;

        this.initPointerLock();
    }

    initPointerLock() {
        this.controls.mouseButtons = {
            LEFT: null,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
        };

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                this.renderer.domElement.requestPointerLock();
            }
        });

        document.addEventListener('mouseup', () => {
            if (document.pointerLockElement === this.renderer.domElement) {
                document.exitPointerLock();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === this.renderer.domElement) {
                this.handlePointerLockMovement(e);
            }
        });
    }

    handlePointerLockMovement(e) {
        const { movementX, movementY } = e;
        const rotateSpeed = this.controls.rotateSpeed || 1.0;
        const element = this.renderer.domElement;

        const offset = new THREE.Vector3();
        const spherical = new THREE.Spherical();

        offset.copy(this.camera.position).sub(this.controls.target);
        spherical.setFromVector3(offset);

        const deltaTheta = 2 * Math.PI * movementX / element.clientHeight * rotateSpeed;
        const deltaPhi = 2 * Math.PI * movementY / element.clientHeight * rotateSpeed;

        spherical.theta -= deltaTheta;
        spherical.phi -= deltaPhi;

        const minPolarAngle = this.controls.minPolarAngle || 0;
        const maxPolarAngle = this.controls.maxPolarAngle || Math.PI;
        spherical.phi = Math.max(minPolarAngle, Math.min(maxPolarAngle, spherical.phi));

        spherical.makeSafe();

        offset.setFromSpherical(spherical);
        this.camera.position.copy(this.controls.target).add(offset);
        this.camera.lookAt(this.controls.target);
    }
}

export class ZoomWhileRotating {
    constructor(camera, controls, renderer) {
        this.camera = camera;
        this.controls = controls;
        this.renderer = renderer;

        this.initZoomListener();
    }

    initZoomListener() {
        this.renderer.domElement.addEventListener('wheel', (e) => {
            if (e.buttons & 2) {
                e.preventDefault();
                e.stopPropagation();

                const zoomSpeed = this.controls.zoomSpeed || 1.0;
                const scale = Math.pow(0.95, zoomSpeed);
                const finalScale = (e.deltaY < 0) ? scale : (1 / scale);

                const offset = new THREE.Vector3()
                    .copy(this.camera.position)
                    .sub(this.controls.target);
                offset.multiplyScalar(finalScale);

                const dist = offset.length();
                if (dist < this.controls.minDistance) {
                    offset.setLength(this.controls.minDistance);
                } else if (dist > this.controls.maxDistance) {
                    offset.setLength(this.controls.maxDistance);
                }

                this.camera.position.copy(this.controls.target).add(offset);
            }
        }, { passive: false });
    }
}
