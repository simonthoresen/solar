export const solarSystemConfig = [
    {
        id: 'sun',
        sizeRadius: 4,
        color: 0xffff00,
        rotationRadius: 72,
        parentId: null,
        orbitDistance: 0,
        orbitSpeed: 0
    },
    {
        id: 'mercury',
        sizeRadius: 0.4,
        color: 0xaaaaaa,
        rotationRadius: 2,
        parentId: 'sun',
        orbitDistance: 6,
        orbitSpeed: 1.5
    },
    {
        id: 'venus',
        sizeRadius: 0.9,
        color: 0xffaa00,
        rotationRadius: 4,
        parentId: 'sun',
        orbitDistance: 9,
        orbitSpeed: 1.2
    },
    {
        id: 'earth',
        sizeRadius: 0.9,
        color: 0x0000ff,
        rotationRadius: 4,
        parentId: 'sun',
        orbitDistance: 12,
        orbitSpeed: 1.0
    },
    {
        id: 'moon',
        sizeRadius: 0.2,
        color: 0x888888,
        rotationRadius: 1,
        parentId: 'earth',
        orbitDistance: 1.5,
        orbitSpeed: 3.0
    },
    {
        id: 'mars',
        sizeRadius: 0.5,
        color: 0xff0000,
        rotationRadius: 3,
        parentId: 'sun',
        orbitDistance: 15,
        orbitSpeed: 0.8
    },
    {
        id: 'phobos',
        sizeRadius: 0.1,
        color: 0x666666,
        rotationRadius: 0.5,
        parentId: 'mars',
        orbitDistance: 0.8,
        orbitSpeed: 4.0
    },
    {
        id: 'deimos',
        sizeRadius: 0.1,
        color: 0x555555,
        rotationRadius: 0.5,
        parentId: 'mars',
        orbitDistance: 1.2,
        orbitSpeed: 3.5
    },
    {
        id: 'jupiter',
        sizeRadius: 2.2,
        color: 0xffaa88,
        rotationRadius: 8,
        parentId: 'sun',
        orbitDistance: 24,
        orbitSpeed: 0.4
    },
    {
        id: 'io',
        sizeRadius: 0.4,
        color: 0xffffaa,
        rotationRadius: 1.5,
        parentId: 'jupiter',
        orbitDistance: 3.0,
        orbitSpeed: 5.0
    },
    {
        id: 'europa',
        sizeRadius: 0.3,
        color: 0xaaffff,
        rotationRadius: 1.5,
        parentId: 'jupiter',
        orbitDistance: 4.0,
        orbitSpeed: 4.0
    },
    {
        id: 'saturn',
        sizeRadius: 2.0,
        color: 0xeeddcc,
        rotationRadius: 7,
        parentId: 'sun',
        orbitDistance: 32,
        orbitSpeed: 0.3
    },
    {
        id: 'uranus',
        sizeRadius: 1.5,
        color: 0xaabbff,
        rotationRadius: 6,
        parentId: 'sun',
        orbitDistance: 40,
        orbitSpeed: 0.2
    },
    {
        id: 'neptune',
        sizeRadius: 1.4,
        color: 0x4466ff,
        rotationRadius: 6,
        parentId: 'sun',
        orbitDistance: 48,
        orbitSpeed: 0.15
    }
];

export const dustConfig = {
    count: 1024,
    fieldRadius: 72,
    dustColor: 0xffffff,
    minLife: 2,
    maxLife: 5,
    poolSize: 1500
};

export const playerConfig = {
    acceleration: 25,
    maxSpeed: 250,
    turnSpeed: 3,
    deceleration: 3.0
};
