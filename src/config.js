export const solarSystemConfig = [
    {
        id: 'sun',
        radius: 4,
        color: 0xffff00,
        forceRadius: 72,
        parentId: null,
        orbitDistance: 0,
        orbitSpeed: 0
    },
    {
        id: 'mercury',
        radius: 0.4,
        color: 0xaaaaaa,
        forceRadius: 2,
        parentId: 'sun',
        orbitDistance: 6,
        orbitSpeed: 1.5
    },
    {
        id: 'venus',
        radius: 0.9,
        color: 0xffaa00,
        forceRadius: 4,
        parentId: 'sun',
        orbitDistance: 9,
        orbitSpeed: 1.2
    },
    {
        id: 'earth',
        radius: 0.9,
        color: 0x0000ff,
        forceRadius: 4,
        parentId: 'sun',
        orbitDistance: 12,
        orbitSpeed: 1.0
    },
    {
        id: 'moon',
        radius: 0.2,
        color: 0x888888,
        forceRadius: 1,
        parentId: 'earth',
        orbitDistance: 1.5,
        orbitSpeed: 3.0
    },
    {
        id: 'mars',
        radius: 0.5,
        color: 0xff0000,
        forceRadius: 3,
        parentId: 'sun',
        orbitDistance: 15,
        orbitSpeed: 0.8
    },
    {
        id: 'phobos',
        radius: 0.1,
        color: 0x666666,
        forceRadius: 0.5,
        parentId: 'mars',
        orbitDistance: 0.8,
        orbitSpeed: 4.0
    },
    {
        id: 'deimos',
        radius: 0.1,
        color: 0x555555,
        forceRadius: 0.5,
        parentId: 'mars',
        orbitDistance: 1.2,
        orbitSpeed: 3.5
    },
    {
        id: 'jupiter',
        radius: 2.2,
        color: 0xffaa88,
        forceRadius: 8,
        parentId: 'sun',
        orbitDistance: 24,
        orbitSpeed: 0.4
    },
    {
        id: 'io',
        radius: 0.4,
        color: 0xffffaa,
        forceRadius: 1.5,
        parentId: 'jupiter',
        orbitDistance: 3.0,
        orbitSpeed: 5.0
    },
    {
        id: 'europa',
        radius: 0.3,
        color: 0xaaffff,
        forceRadius: 1.5,
        parentId: 'jupiter',
        orbitDistance: 4.0,
        orbitSpeed: 4.0
    },
    {
        id: 'saturn',
        radius: 2.0,
        color: 0xeeddcc,
        forceRadius: 7,
        parentId: 'sun',
        orbitDistance: 32,
        orbitSpeed: 0.3
    },
    {
        id: 'uranus',
        radius: 1.5,
        color: 0xaabbff,
        forceRadius: 6,
        parentId: 'sun',
        orbitDistance: 40,
        orbitSpeed: 0.2
    },
    {
        id: 'neptune',
        radius: 1.4,
        color: 0x4466ff,
        forceRadius: 6,
        parentId: 'sun',
        orbitDistance: 48,
        orbitSpeed: 0.15
    }
];

export const starfieldConfig = {
    count: 1024,
    fieldRadius: 72,
    starColor: 0xffffff,
    minLife: 10,
    maxLife: 60
};
