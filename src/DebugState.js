// Global debug state singleton
// All entities reference this directly instead of maintaining local copies

class DebugStateManager {
    constructor() {
        if (DebugStateManager.instance) {
            return DebugStateManager.instance;
        }

        this.state = {
            planetRing: false,
            playerRing: false,
            planetAxis: false,
            playerAxis: false,
            planetToParent: false,
            planetToPlayer: false,
            planetVelocity: false,
            dustVelocity: false,
            shipExhaust: false
        };

        // Global selected entity reference
        // Entities check if (this === DebugState.selectedEntity) to know if they're selected
        this.selectedEntity = null;

        DebugStateManager.instance = this;
    }

    // Get a debug value
    get(key) {
        return this.state[key];
    }

    // Set a debug value
    set(key, value) {
        this.state[key] = value;
    }

    // Get all state
    getAll() {
        return this.state;
    }

    // Set multiple values
    setAll(newState) {
        Object.assign(this.state, newState);
    }

    // Set the globally selected entity
    setSelected(entity) {
        this.selectedEntity = entity;
    }

    // Get the globally selected entity
    getSelected() {
        return this.selectedEntity;
    }

    // Check if an entity is selected
    isSelected(entity) {
        return this.selectedEntity === entity;
    }
}

// Export singleton instance
export const DebugState = new DebugStateManager();
