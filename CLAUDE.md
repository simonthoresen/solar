# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a 3D space game built with Three.js and Vite. The game features spaceships, celestial bodies, particle effects, and combat mechanics in a solar system environment. The project includes three distinct modes accessible via different HTML entry points.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Entry Points

The application has four separate entry points, each served by a different HTML file:

1. **Main Menu** (`index.html` → `src/main.js`)
   - Shows the main menu first
   - Instantiates Game class and shows menu

2. **Game Mode** (`game.html` → `src/game_entry.js`)
   - Direct entry to gameplay with HUD and player controls
   - Includes combat, NPCs, and full game mechanics
   - Instantiates Game class

3. **Solar Studio** (`solar_studio.html` → `src/solar_studio_entry.js`)
   - Standalone solar system visualization and configuration tool
   - Top-down view with orbit pause/resume controls
   - Used for designing and testing celestial body configurations
   - Instantiates SolarStudio class (independent from Game)

4. **Model Studio** (`model_studio.html` → `src/model_studio_main.js`)
   - Standalone ship model visualization and customization tool
   - Preview ship designs, turret configurations, and visual effects
   - Instantiates ModelStudio class (independent from Game)

## Architecture

### Core Applications

- **Game.js**: Main game application for gameplay
  - Manages all game systems including player, NPCs, combat, and physics
  - Uses multi-pass rendering: background nebula → main scene → HUD overlay
  - Manages camera controls with custom pointer-lock rotation (right-click to rotate, scroll to zoom while rotating)
  - Follows player ship with dynamic camera offset

- **SolarStudio.js**: Standalone solar system visualization and editor
  - Independent application with its own scene, camera, and renderer
  - Top-down view optimized for observing orbital mechanics
  - Pause/resume orbits, edit celestial body properties, export config
  - Click-to-select celestial bodies for editing

- **ModelStudio.js**: Standalone ship model viewer and customizer
  - Independent application for previewing ship designs
  - Interactive turret configuration and visual effects preview
  - Orbiting target cube for testing turret tracking

### Entity System

All game entities follow a common pattern:

- **Spaceship.js**: Base class for all ships (player and NPCs)
  - Handles physics, collision, movement, weapons, health/shield
  - Uses ShipModels factory for visual representation
  - Turrets are child objects that track targets independently
  - Smoke emission tied to engine thrust with velocity field influence

- **Player.js**: Extends Spaceship with keyboard input controls
  - WASD movement, Space to fire
  - Camera follows player with offset maintained through deltaPos

- **NPC.js**: Extends Spaceship with AI behaviors
  - Four AI types: 'hopper', 'speedster', 'kamikaze', 'shooter'
  - Each has distinct movement and attack patterns

- **CelestialBody.js**: Planets, moons, stars with orbital mechanics
  - Hierarchical parent-child relationships for moons orbiting planets
  - Each body has debug visualization (rings, axes, lines)
  - Configuration driven by `config.js` solarSystemConfig array

### Systems (Global Managers)

- **ParticleSystem.js**: Instanced mesh-based particle system
  - Handles dust, smoke, explosions, and blast spheres
  - Uses ring buffer pooling for efficient particle reuse
  - Billboard particles that always face camera

- **ProjectileSystem.js**: Manages all laser projectiles
  - Collision detection with ships and planets
  - Pooled instances for performance

- **VelocityField.js**: Calculates gravitational influences
  - Used by particles and ships to simulate orbital dynamics
  - Visualizes force vectors as debug arrows

### Ship Visual System

- **ShipModels.js**: Factory for creating ship geometry
  - 10 distinct ship types: viper, dart, saucer, hauler, interceptor, needle, twinhull, hammerhead, speeder, orbiter
  - Returns `{ mesh, collisionRadius, engineOffset, turretMounts }`
  - Each ship type has unique turret mount configurations

- **Turret.js**: Weapon hardpoints on ships
  - Three turret types: triangular, circular, square
  - Auto-tracks target position with rotation limits
  - Provides fire position and direction for laser spawning

### UI Components

- **HUD.js**: Screen-space overlay for game mode
  - Shows health/shield bars, indicators for celestial bodies and ships
  - Click on HUD element to select corresponding 3D object
  - Uses orthographic camera for 2D rendering

- **SolarStudio.js**: Standalone solar system editor (see Core Applications)

- **MainMenu.js**: Pause menu overlay
  - ESC to toggle in-game

- **DetailPanel.js**: Shows detailed info about selected objects
  - 3D preview rendering in corner viewport

## Configuration

`src/config.js` contains three main configuration objects:

- `solarSystemConfig`: Array of celestial body definitions with id, size, color, orbital parameters, renderMode
- `dustConfig`: Particle system settings (count, radius, lifetime)
- `playerConfig`: Ship control parameters (acceleration, turn speed, weapons, visual effects)

When modifying celestial bodies, ensure parent bodies are defined before their children in the array.

## Key Development Patterns

### Coordinate System
- Y-axis is UP
- Ships face -Z forward (use `new THREE.Vector3(0, 0, -1).applyEuler(rotation)` for forward vector)
- 2D gameplay plane is XZ (Y is mostly zero for ships)

### Debug Visualization
- Press `H` to toggle debug UI in-game
- Debug checkboxes control visibility of rings, axes, velocity vectors
- Use `setDebugVisibility(debugState)` pattern for all entities

### Selection System
- Click on objects (3D in studio, HUD in game) to select
- Selection state: `setSelected(true/false)` on entities
- ESC deselects or opens menu (if nothing selected)
- Backspace kills player for testing respawn

### Respawn Logic
- Player respawns after 3 seconds at random position in dust field
- NPCs are immediately replaced with new random type on death

### Physics
- Ships use `velocity` vector and are influenced by `velocityField`
- Soft speed clamping: allow overspeed but decay back to max
- Planet collisions push ships away and match radial velocities
- Boundary wrapping keeps ships within `dustConfig.fieldRadius`

## Common Tasks

### Adding a New Ship Type
1. Add entry to SHIP_TYPES array in ShipModels.js
2. Add case in ShipModels.createModel() switch statement
3. Define geometry using addPart() helper
4. Set collisionRadius, engineOffset, and turretMounts

### Adding a New NPC Behavior
1. Add case to NPC.js updateAI() switch statement
2. Define movement pattern and attack logic
3. Add type to npcTypes array in Game.js constructor

### Modifying Celestial Bodies
1. Edit solarSystemConfig in config.js
2. Ensure parent-before-children ordering
3. renderMode options: 'toon', 'lambert_wireframe', or omit for default

### Adjusting Game Balance
- Edit playerConfig values in config.js
- Laser damage: Spaceship.laserDamage property (default 25)
- Explosion physics: handleShipExplosion() in Game.js (radius and force)
