import * as THREE from 'three';
import { playerConfig } from '../config.js';
import { Spaceship } from './Spaceship.js';

import { ShipModels } from './ShipModels.js';

export class Player extends Spaceship {
    constructor(scene) {
        const startPos = new THREE.Vector3(0, 0, 15);
        const color = playerConfig.hullColor !== undefined ? playerConfig.hullColor : 0x4488ff;

        const type = 'valkyrie';

        super(scene, color, startPos, type);

        // Input state
        this.keys = {
            w: false,
            a: false,
            d: false,
            shift: false,
            space: false
        };

        this.initInput();
        this.isPlayer = true;
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) this.keys[k] = true;
            if (e.key === 'Shift') this.keys.shift = true;
            if (e.key === ' ') this.keys.space = true;
        });
        window.addEventListener('keyup', (e) => {
            const k = e.key.toLowerCase();
            if (this.keys.hasOwnProperty(k)) this.keys[k] = false;
            if (e.key === 'Shift') this.keys.shift = false;
            if (e.key === ' ') this.keys.space = false;
        });
    }

    updateControls(dt) {
        this.controls.thrust = this.keys.w;

        // Turn: -1 (Left/A), 1 (Right/D)
        // Original logic: A -> rot.y += speed (Left/PlusY). D -> rot.y -= speed (Right/MinusY).
        // Base logic: rot.y += -turn * speed. 
        // If turn = -1 (Left), += -(-1) = +1. Correct.
        // If turn = 1 (Right), += -(1) = -1. Correct.

        // Key A -> Turn Left (-1)
        // Key D -> Turn Right (1)

        this.controls.turn = 0;
        if (this.keys.a) this.controls.turn += -1;
        if (this.keys.d) this.controls.turn += 1;

        this.controls.fire = this.keys.space;
    }

    // Override getVelocityAt if needed, but it was in base as well since it depends on wake.
    // However, getVelocityAt was logic for "does the wake push particles". 
    // It's specific to the Player's wake affecting the world. 
    // Ideally NPCs also affect world? "same model". 
    // Yes, keep it in Base.
}
