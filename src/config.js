export const solarSystemConfig = [
    {
        id: 'sun',
        sizeRadius: 10,
        color: 0xffff00,
        rotationRadius: 450,
        parentId: null,
        orbitDistance: 0,
        orbitSpeed: 0,
        rotationSpeed: 0.5
    },
    {
        id: 'mercury',
        sizeRadius: 10.0,
        color: 0xaaaaaa,
        rotationRadius: 35,
        parentId: 'sun',
        orbitDistance: 50,
        orbitSpeed: 0.25,
        rotationSpeed: 1
    },
    {
        id: 'venus',
        sizeRadius: 10.0,
        color: 0xffaa00,
        rotationRadius: 35,
        parentId: 'sun',
        orbitDistance: 100,
        orbitSpeed: 0.15,
        rotationSpeed: 0.5
    },
    {
        id: 'earth',
        sizeRadius: 10.0,
        color: 0x0000ff,
        rotationRadius: 35,
        parentId: 'sun',
        orbitDistance: 150,
        orbitSpeed: 0.3,
        rotationSpeed: 2.5
    },
    {
        id: 'moon',
        sizeRadius: 5.0,
        color: 0x888888,
        rotationRadius: 15,
        parentId: 'earth',
        orbitDistance: 20.0,
        orbitSpeed: 1.0,
        rotationSpeed: 0.5
    },
    {
        id: 'mars',
        sizeRadius: 10.0,
        color: 0xff0000,
        rotationRadius: 35,
        parentId: 'sun',
        orbitDistance: 200,
        orbitSpeed: 0.2,
        rotationSpeed: 1.5
    },
    {
        id: 'phobos',
        sizeRadius: 5.0,
        color: 0x666666,
        rotationRadius: 15,
        parentId: 'mars',
        orbitDistance: 20.0,
        orbitSpeed: 1.4,
        rotationSpeed: 1.2
    },
    {
        id: 'deimos',
        sizeRadius: 5.0,
        color: 0x555555,
        rotationRadius: 15,
        parentId: 'mars',
        orbitDistance: 35.0,
        orbitSpeed: 0.7,
        rotationSpeed: 1.4
    },
    {
        id: 'jupiter',
        sizeRadius: 10.0,
        color: 0xffaa88,
        rotationRadius: 35,
        parentId: 'sun',
        orbitDistance: 250,
        orbitSpeed: 0.4,
        rotationSpeed: 2.0
    },
    {
        id: 'io',
        sizeRadius: 5.0,
        color: 0xffffaa,
        rotationRadius: 15,
        parentId: 'jupiter',
        orbitDistance: 20.0,
        orbitSpeed: 5.0,
        rotationSpeed: 0.8
    },
    {
        id: 'europa',
        sizeRadius: 5.0,
        color: 0xaaffff,
        rotationRadius: 15,
        parentId: 'jupiter',
        orbitDistance: 35.0,
        orbitSpeed: 4.0,
        rotationSpeed: 0.6
    },
    {
        id: 'saturn',
        sizeRadius: 10.0,
        color: 0xeeddcc,
        rotationRadius: 30,
        parentId: 'sun',
        orbitDistance: 300,
        orbitSpeed: 0.3,
        rotationSpeed: 0.9
    },
    {
        id: 'uranus',
        sizeRadius: 10.0,
        color: 0xaabbff,
        rotationRadius: 30,
        parentId: 'sun',
        orbitDistance: 350,
        orbitSpeed: 0.2,
        rotationSpeed: 0.7
    },
    {
        id: 'neptune',
        sizeRadius: 10.0,
        color: 0x4466ff,
        rotationRadius: 30,
        parentId: 'sun',
        orbitDistance: 400,
        orbitSpeed: 0.15,
        rotationSpeed: 0.8
    }
];

export const dustConfig = {
    count: 4096,
    fieldRadius: 450,
    dustColor: 0xffffff,
    minLife: 2,
    maxLife: 5,
    poolSize: 1500
};

export const playerConfig = {
    acceleration: 50,
    maxSpeed: 50,
    turnSpeed: 3,
    deceleration: 3.0,
    smokeEmissionInterval: 0.01,
    vortexRadius: 4.0,
    vortexRadius: 3.0,
    vortexOffsetZ: 3.5,
    hullColor: 0x4488ff,
    modelScale: 1.0,
    wakeOffsetZ: 1.5,
    laserColor: 0x00ff00 // Green laser default
};
