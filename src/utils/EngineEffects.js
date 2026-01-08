import * as THREE from 'three';

export class EngineEffects {
    static emitSmoke(
        engineOffsets,
        getPositionCallback,
        smokeAccumulator,
        dt,
        particleSystem,
        velocityField,
        camera,
        celestialBodies,
        tempInfluenceVector,
        emissionInterval = 0.05
    ) {
        if (!particleSystem || !camera || !velocityField) return smokeAccumulator;

        smokeAccumulator += dt;

        if (smokeAccumulator >= emissionInterval) {
            smokeAccumulator = 0;
            const smokeMaxRadius = 1.0;

            engineOffsets.forEach(engineOffset => {
                const wakePos = getPositionCallback(engineOffset);
                wakePos.z += smokeMaxRadius;
                velocityField.calculateTotalVelocity(wakePos, celestialBodies || [], null, tempInfluenceVector);
                particleSystem.spawnSmoke(wakePos, tempInfluenceVector, camera);
            });
        }

        return smokeAccumulator;
    }

    static updateWakeVisuals(wakeMeshes, dt) {
        if (!wakeMeshes || wakeMeshes.length === 0) return;

        const pulse = 1.0 + Math.sin(Date.now() * 0.02) * 0.2 + (Math.random() - 0.5) * 0.5;
        const lenPulse = 1.0 + (Math.random() - 0.5) * 0.8;

        let col = null;
        if (Math.random() > 0.8) {
            const colors = [0xffff00, 0xff4400, 0xffffff, 0xffaa00, 0xff0000];
            col = colors[Math.floor(Math.random() * colors.length)];
        }

        wakeMeshes.forEach((wakeMesh) => {
            wakeMesh.visible = true;
            wakeMesh.rotation.z += 15 * dt;
            wakeMesh.scale.set(pulse, pulse, lenPulse);

            if (col !== null) {
                wakeMesh.material.color.setHex(col);
            }
        });
    }

    static hideWakes(wakeMeshes) {
        if (!wakeMeshes || wakeMeshes.length === 0) return;

        wakeMeshes.forEach(wakeMesh => {
            wakeMesh.visible = false;
        });
    }

    static updateWakePositions(wakeMeshes, engineOffsets) {
        if (!wakeMeshes || !engineOffsets) return;

        engineOffsets.forEach((offset, index) => {
            if (wakeMeshes[index]) {
                wakeMeshes[index].position.copy(offset);
            }
        });
    }

    static updateVortexPositions(vortexLines, engineOffsets, vortexRadius = 2.0) {
        if (!vortexLines || !engineOffsets) return;

        engineOffsets.forEach((offset, index) => {
            if (vortexLines[index]) {
                vortexLines[index].position.set(offset.x, 0, offset.z + vortexRadius);
            }
        });
    }

    static getEnginePosition(engineOffsets, rotation, position = null) {
        if (engineOffsets && engineOffsets.length > 0) {
            return this.getEnginePositionFromOffset(engineOffsets[0], rotation, position);
        }

        const offset = new THREE.Vector3(0, 0, 1.5).applyEuler(rotation);
        return position ? position.clone().add(offset) : offset;
    }

    static getEnginePositionFromOffset(engineOffset, rotation, position = null) {
        const offset = engineOffset.clone().applyEuler(rotation);
        return position ? position.clone().add(offset) : offset;
    }

    static updateAnimations(
        animations,
        dt,
        setEngineOffsetsCallback,
        wakeUpdateCallback,
        vortexUpdateCallback
    ) {
        if (!animations || animations.length === 0) return;

        animations.forEach(anim => {
            if (anim.type === 'rotate') {
                if (anim.axis === 'x') {
                    anim.mesh.rotation.x += anim.speed * dt;
                } else if (anim.axis === 'y') {
                    anim.mesh.rotation.y += anim.speed * dt;
                } else if (anim.axis === 'z') {
                    anim.mesh.rotation.z += anim.speed * dt;
                }

                if (anim.dynamicEngines && anim.engineOffsets) {
                    const newOffsets = anim.engineOffsets.map(baseOffset => {
                        const rotatedOffset = baseOffset.clone();
                        rotatedOffset.applyEuler(anim.mesh.rotation);
                        rotatedOffset.add(anim.mesh.position);
                        return rotatedOffset;
                    });

                    if (setEngineOffsetsCallback) {
                        setEngineOffsetsCallback(newOffsets);
                    }

                    if (wakeUpdateCallback) wakeUpdateCallback();
                    if (vortexUpdateCallback) vortexUpdateCallback();
                }
            }
        });
    }

    static initWakes(engineOffsets, parentMesh) {
        const wakeMeshes = [];

        if (!engineOffsets || engineOffsets.length === 0) {
            engineOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        engineOffsets.forEach(engineOffset => {
            const height = 3.0;
            const radius = 0.5;

            const geometry = new THREE.ConeGeometry(radius, height, 8);
            geometry.rotateX(Math.PI / 2);
            geometry.translate(0, 0, height / 2);

            const material = new THREE.MeshBasicMaterial({
                color: 0xffff00
            });
            const wakeMesh = new THREE.Mesh(geometry, material);
            wakeMesh.visible = false;
            wakeMesh.position.copy(engineOffset);

            parentMesh.add(wakeMesh);
            wakeMeshes.push(wakeMesh);
        });

        return wakeMeshes;
    }
}
