import * as THREE from 'three';

export class Turret {
    /**
     * @param {THREE.Group} parentMesh - The ship's mesh group to attach to
     * @param {THREE.Vector3} position - Relative position on the ship
     * @param {string} type - 'triangular', 'circular', 'square'
     */
    constructor(parentMesh, position, type = 'triangular') {
        this.parentMesh = parentMesh;
        this.type = type;

        // Create Mesh
        this.mesh = new THREE.Group();
        this.mesh.position.copy(position);

        // Base Cube (common)
        // Slightly larger than radius. Let's assume turret radius ~0.2-0.3
        const baseGeom = new THREE.BoxGeometry(0.4, 0.2, 0.4);
        const baseMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const base = new THREE.Mesh(baseGeom, baseMat);
        base.castShadow = true;
        base.receiveShadow = true;
        this.mesh.add(base);

        // Barrel Pivot (allows up/down if we wanted, but for now just Y rotation of whole group + maybe X of pivot)
        // For simplicity, we rotate the whole mesh container in Y (yaw).
        // If we want pitch, we need a pivot point.
        this.pivot = new THREE.Group();
        this.pivot.position.set(0, 0.1, 0); // Sit on top of base
        this.mesh.add(this.pivot);

        this.createBarrel(type);

        this.parentMesh.add(this.mesh);

        // State
        this.targetRotation = 0; // Local Y
    }

    createBarrel(type) {
        const barrelMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
        let barrel;

        switch (type) {
            case 'circular':
                // Long circular tube
                const circGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12);
                circGeom.rotateX(Math.PI / 2); // Point forward Z
                circGeom.translate(0, 0, 0.4); // Origin at back
                barrel = new THREE.Mesh(circGeom, barrelMat);
                break;

            case 'square':
                // Short square tube
                const sqGeom = new THREE.BoxGeometry(0.15, 0.15, 0.5);
                sqGeom.translate(0, 0, 0.25);
                barrel = new THREE.Mesh(sqGeom, barrelMat);
                break;

            case 'triangular':
            default:
                // Triangular pipe
                const triGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 3);
                triGeom.rotateX(Math.PI / 2); // Point forward Z
                triGeom.rotateZ(Math.PI / 6); // Flat bottom?
                triGeom.translate(0, 0, 0.3);
                barrel = new THREE.Mesh(triGeom, barrelMat);
                break;
        }

        if (barrel) {
            barrel.castShadow = true;
            barrel.receiveShadow = true;
            this.pivot.add(barrel);

            // Define firing tip
            // Approx length based on geometry
            const zLength = type === 'circular' ? 0.8 : (type === 'square' ? 0.5 : 0.6);
            this.fireTip = new THREE.Vector3(0, 0, zLength);
        }
    }

    /**
     * @param {THREE.Vector3} targetWorldPos - The world position to aim at
     */
    update(dt, targetWorldPos) {
        if (!targetWorldPos) return;

        // Convert target world position to local space of the turret parent (ship)
        // Actually, we want it in the local space of the turret's parent (this.parentMesh)
        // But Turret.mesh is a child of parentMesh.
        // We want to calculate the rotation for this.mesh (Yaw) and this.pivot (Pitch).

        // Get turret world position
        const turretWorldPos = new THREE.Vector3();
        this.mesh.getWorldPosition(turretWorldPos);

        const direction = new THREE.Vector3().subVectors(targetWorldPos, turretWorldPos).normalize();

        // 1. Orient the whole group (Yaw)
        // We need to know what "Forward" is in world space if rotation is 0.
        // Turret is attached to Ship. Ship rotates. 
        // We can use lookAt but we need to account for parent rotation.

        // Easiest way: Use lookAt then zero out roll? 
        // Or transform target to local space.

        const localTarget = this.parentMesh.worldToLocal(targetWorldPos.clone());
        const localPos = this.mesh.position; // Position relative to parent

        const dx = localTarget.x - localPos.x;
        const dz = localTarget.z - localPos.z;

        // Yaw (Y axis)
        const targetYaw = Math.atan2(dx, dz); // +Z is forward? 0 deg.
        // In Three.js: +/- depends. 
        // atan2(x, z): (1, 1) -> 45deg (PI/4). 
        // If forward is +Z, then rotY should be ... ?
        // Usually atan2(x, z) gives angle from Z axis. 

        // Let's use rotateTowards or lerp for smooth movement
        // But simply setting rotation is fine for now.
        this.mesh.rotation.y = targetYaw;

        // Pitch (X axis) - applied to pivot
        // Transform target to THIS mesh local space (after Yaw applied)
        // Actually we can do it easier:
        // Distance in XZ plane
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        const dy = localTarget.y - localPos.y;

        // Pitch = atan2(dy, distXZ)
        // Be careful with sign. Positive dy (up) -> Positive Pitch?
        // Default orientation is along +Z. Rotate X positive -> tilt DOWN? Or UP?
        // Basic Right-Hand Rule: Thumb X (Right), Fingers curl Y->Z. 
        // Wait, standard: X is Right, Y is Up, Z is Back (Forward is -Z usually in Three.js objects, but we modeled +Z forward in createMesh?)
        // In createBarrel:
        // circGeom.rotateX(Math.PI/2) -> Cylinder is now along Z. 
        // If cylinder was Y-up, now it's Z-something. 
        // We need to check if we built it facing +Z. Yes: translate(0, 0, 0.4).

        // If forward is +Z.
        // Pitch up (dy > 0): We want nose up.
        // Rotation X: +X gives ... ?
        // If X axis is Left (-X is Right?), wait.
        // Let's assume standard local axes: +X Right, +Y Up, +Z Forward.
        // Rotate around +X: +Y goes towards +Z. Nose (Z) goes DOWN (-Y).
        // So Pitch Up means NEGATIVE X rotation.

        // RESTRICTION: User requested 0 tilt in Y-axis (which is pitch, rotation around local X).
        this.pivot.rotation.x = 0;
    }

    getFirePositionAndDirection() {
        // Return world position of tip and forward vector
        const tipWorld = this.fireTip.clone();
        this.pivot.localToWorld(tipWorld);

        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(this.pivot.getWorldQuaternion(new THREE.Quaternion()));

        return { position: tipWorld, direction: forward };
    }
}
