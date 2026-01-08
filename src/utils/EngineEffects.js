import * as THREE from 'three';

export class EngineEffects {
    static emitSmoke(
        thrusterOffsets,
        getPositionCallback,
        smokeAccumulator,
        dt,
        particleSystem,
        velocityField,
        camera,
        celestialBodies,
        tempInfluenceVector,
        emissionInterval = 0.05,
        thrusterConfigs = []
    ) {
        if (!particleSystem || !camera || !velocityField) return smokeAccumulator;

        smokeAccumulator += dt;

        if (smokeAccumulator >= emissionInterval) {
            smokeAccumulator = 0;
            const smokeMaxRadius = 1.0;

            thrusterOffsets.forEach((thrusterOffset, index) => {
                // Get config for this thruster
                const config = thrusterConfigs[index] || {
                    exhaustWidth: 3.0,
                    exhaustLength: 6.0,
                    smokeSize: 0.3,
                    smokeColor: 0xaaaaaa,
                    smokeLifetime: 3.0
                };

                // Apply smoke offset in local space before rotation
                const offsetWithSmoke = thrusterOffset.clone();
                offsetWithSmoke.z += smokeMaxRadius;

                const flamePos = getPositionCallback(offsetWithSmoke);
                velocityField.calculateTotalVelocity(flamePos, celestialBodies || [], null, tempInfluenceVector);

                // Spawn smoke with per-thruster configuration
                particleSystem.spawnSmoke(
                    flamePos,
                    tempInfluenceVector,
                    camera,
                    config.smokeSize,
                    config.smokeColor,
                    config.smokeLifetime
                );
            });
        }

        return smokeAccumulator;
    }

    static updateFlameVisuals(flameMeshes, dt) {
        if (!flameMeshes || flameMeshes.length === 0) return;

        const pulse = 1.0 + Math.sin(Date.now() * 0.02) * 0.2 + (Math.random() - 0.5) * 0.5;
        const lenPulse = 1.0 + (Math.random() - 0.5) * 0.8;

        let col = null;
        if (Math.random() > 0.8) {
            const colors = [0xffff00, 0xff4400, 0xffffff, 0xffaa00, 0xff0000];
            col = colors[Math.floor(Math.random() * colors.length)];
        }

        flameMeshes.forEach((flameMesh) => {
            flameMesh.visible = true;
            flameMesh.rotation.z += 15 * dt;
            flameMesh.scale.set(pulse, pulse, lenPulse);

            if (col !== null) {
                flameMesh.material.color.setHex(col);
            }
        });
    }

    static hideFlames(flameMeshes) {
        if (!flameMeshes || flameMeshes.length === 0) return;

        flameMeshes.forEach(flameMesh => {
            flameMesh.visible = false;
        });
    }

    static updateFlamePositions(flameMeshes, thrusterOffsets) {
        if (!flameMeshes || !thrusterOffsets) return;

        thrusterOffsets.forEach((offset, index) => {
            if (flameMeshes[index]) {
                flameMeshes[index].position.copy(offset);
            }
        });
    }

    static updateExhaustPositions(exhaustRings, thrusterOffsets, exhaustRadius = 2.0) {
        if (!exhaustRings || !thrusterOffsets) return;

        thrusterOffsets.forEach((offset, index) => {
            if (exhaustRings[index]) {
                exhaustRings[index].position.set(offset.x, 0, offset.z + exhaustRadius);
            }
        });
    }

    static getThrusterPosition(thrusterOffsets, rotation, position = null) {
        if (thrusterOffsets && thrusterOffsets.length > 0) {
            return this.getThrusterPositionFromOffset(thrusterOffsets[0], rotation, position);
        }

        const offset = new THREE.Vector3(0, 0, 1.5).applyEuler(rotation);
        return position ? position.clone().add(offset) : offset;
    }

    static getThrusterPositionFromOffset(thrusterOffset, rotation, position = null) {
        const offset = thrusterOffset.clone().applyEuler(rotation);
        return position ? position.clone().add(offset) : offset;
    }

    static updateAnimations(
        animations,
        dt,
        setThrusterOffsetsCallback,
        flameUpdateCallback,
        exhaustUpdateCallback
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

                if (anim.dynamicEngines && anim.thrusterOffsets) {
                    const newOffsets = anim.thrusterOffsets.map(baseOffset => {
                        const rotatedOffset = baseOffset.clone();
                        rotatedOffset.applyEuler(anim.mesh.rotation);
                        rotatedOffset.add(anim.mesh.position);
                        return rotatedOffset;
                    });

                    if (setThrusterOffsetsCallback) {
                        setThrusterOffsetsCallback(newOffsets);
                    }

                    if (flameUpdateCallback) flameUpdateCallback();
                    if (exhaustUpdateCallback) exhaustUpdateCallback();
                }
            }
        });
    }

    static updateExhaustDebugVisuals(
        thrusterOffsets,
        thrusterConfigs,
        exhaustRings,
        exhaustArrows,
        isThrusting
    ) {
        if (!thrusterOffsets || !exhaustRings || !exhaustArrows) return;

        // Update rectangle positions and arrows for each thruster
        thrusterOffsets.forEach((thrusterOffset, index) => {
            // Get config for this thruster
            const config = thrusterConfigs[index] || {
                exhaustWidth: 3.0,
                exhaustLength: 6.0,
                exhaustForce: 10.0,
                smokeSize: 0.3,
                smokeColor: 0xaaaaaa,
                smokeLifetime: 3.0
            };

            const exhaustForce = config.exhaustForce;

            // Update rectangle position
            if (exhaustRings[index]) {
                // Position rectangle starting at the thruster, extending backward
                exhaustRings[index].position.set(thrusterOffset.x, 0, thrusterOffset.z);
            }

            // Update arrow
            if (exhaustArrows[index]) {
                // Position arrow at near end of exhaust field (at the thruster)
                const arrowPos = new THREE.Vector3(thrusterOffset.x, 0, thrusterOffset.z);
                exhaustArrows[index].position.copy(arrowPos);

                // Arrows are children of the ship mesh, so use LOCAL exhaust direction
                // Thruster exhaust always points backward (+Z) in local space
                const localExhaustDir = new THREE.Vector3(0, 0, 1);

                // Arrow length equals exhaust force when thrusters active
                const arrowLength = isThrusting ? exhaustForce : 0.0;

                // Update arrow direction and length
                exhaustArrows[index].setDirection(localExhaustDir);
                if (arrowLength > 0) {
                    exhaustArrows[index].setLength(arrowLength, arrowLength * 0.2, arrowLength * 0.1);
                    exhaustArrows[index].visible = exhaustArrows[index].visible; // preserve visibility from debug state
                } else {
                    // Hide arrow when thrusters are off
                    exhaustArrows[index].visible = false;
                }
            }
        });
    }

    static initFlames(thrusterOffsets, parentMesh) {
        const flameMeshes = [];

        if (!thrusterOffsets || thrusterOffsets.length === 0) {
            thrusterOffsets = [new THREE.Vector3(0, 0, 0.5)];
        }

        thrusterOffsets.forEach(thrusterOffset => {
            const height = 3.0;
            const radius = 0.5;

            const geometry = new THREE.ConeGeometry(radius, height, 8);
            geometry.rotateX(Math.PI / 2);
            geometry.translate(0, 0, height / 2);

            const material = new THREE.MeshBasicMaterial({
                color: 0xffff00
            });
            const flameMesh = new THREE.Mesh(geometry, material);
            flameMesh.visible = false;
            flameMesh.position.copy(thrusterOffset);

            parentMesh.add(flameMesh);
            flameMeshes.push(flameMesh);
        });

        return flameMeshes;
    }
}
