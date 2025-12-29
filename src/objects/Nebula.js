import * as THREE from 'three';
import { SimplexNoise } from '../utils/SimplexNoise.js';

export class Nebula {
    constructor(scene) {
        this.scene = scene;
        this.noise = new SimplexNoise();
        this.init();
    }

    init() {
        // High detail for smooth gradients (Detail 15 makes it very dense, careful with performance)
        // Adjust detail based on performance needs. 10-15 is good for high quality.
        const detail = 15;
        const radius = 100;
        const geometry = new THREE.IcosahedronGeometry(radius, detail);

        // Access the color attribute
        const count = geometry.attributes.position.count;
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));

        const colors = geometry.attributes.color;
        const positions = geometry.attributes.position;

        // "Homeworld Palette" (Darker / Less Intense)
        const colorStops = [
            { t: 0.0, c: new THREE.Color('#000000') }, // Pure Black for void
            { t: 0.3, c: new THREE.Color('#0a0510') }, // Very subtle dark violet
            { t: 0.5, c: new THREE.Color('#150820') }, // Dark Purple
            { t: 0.7, c: new THREE.Color('#2a1025') }, // Muted dark pink
            { t: 0.9, c: new THREE.Color('#403038') }  // Greyish-red highlights (very dim)
        ];

        const scale = 0.015; // Noise scale

        for (let i = 0; i < count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            // 3D Noise density
            // Flatten Y slightly in noise lookups to stretch clouds horizontally effectively
            // Or just sample noise.
            let n = this.noise.noise3D(x * scale, y * scale * 1.5, z * scale);

            // Normalize noise from [-1, 1] to [0, 1]
            let t = (n + 1) * 0.5;

            // Apply contrast curve to open up empty space
            // Power curve pushes mid-tones to darks
            t = Math.pow(t, 2.0);

            // Sample Gradient
            const finalColor = this.getGradientColor(t, colorStops);

            colors.setXYZ(i, finalColor.r, finalColor.g, finalColor.b);
        }

        // Use BackSide to see the inside of the shape
        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false
        });

        this.mesh = new THREE.Mesh(geometry, material);

        // Flatten the sphere to look more like a galactic disk
        this.mesh.scale.set(1, 0.6, 1);

        this.scene.add(this.mesh);
    }

    getGradientColor(t, stops) {
        // Find the two stops t falls between
        for (let i = 0; i < stops.length - 1; i++) {
            const s1 = stops[i];
            const s2 = stops[i + 1];

            if (t >= s1.t && t <= s2.t) {
                // Interpolate
                const alpha = (t - s1.t) / (s2.t - s1.t);
                return s1.c.clone().lerp(s2.c, alpha);
            }
        }
        // Clamping
        if (t < stops[0].t) return stops[0].c;
        if (t > stops[stops.length - 1].t) return stops[stops.length - 1].c;

        return stops[0].c;
    }

    update(cameraPosition) {
        // Keep the nebula centered on the camera
        this.mesh.position.copy(cameraPosition);
    }
}
