import * as THREE from 'three';
import { SimplexNoise } from '../utils/SimplexNoise.js';

export class Nebula {
    constructor(scene) {
        this.scene = scene;
        this.noise = new SimplexNoise();
        this.init();
    }

    init() {
        const loader = new THREE.CubeTextureLoader();
        // order: px, nx, py, ny, pz, nz
        // left, right, top, bottom, front, back?
        // Three.js order: pos-x, neg-x, pos-y, neg-y, pos-z, neg-z
        // right, left, top, bottom, front, back (depending on coordinate system)

        // Assuming standard naming convention:
        // right, left, top, bottom, front, back
        const texture = loader.load([
            'assets/nebula_right.png',
            'assets/nebula_left.png',
            'assets/nebula_top.png',
            'assets/nebula_bottom.png',
            'assets/nebula_front.png',
            'assets/nebula_back.png'
        ]);

        this.scene.background = texture;
    }
}
