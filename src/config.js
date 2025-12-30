export const solarSystemConfig = [
    {
        id: 'sun',
        sizeRadius: 10,
        color: 0xffff00,
        rotationRadius: 450,
        parentId: null,
        orbitDistance: 0,
        orbitSpeed: 0
    },
    {
        id: 'mercury',
        sizeRadius: 10.0,
        color: 0x00ff00, //0xaaaaaa,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 50,
        orbitSpeed: 0.25
    },
    {
        id: 'venus',
        sizeRadius: 10.0,
        color: 0xffaa00,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 100,
        orbitSpeed: 0.15
    },
    {
        id: 'earth',
        sizeRadius: 10.0,
        color: 0x0000ff,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 150,
        orbitSpeed: 0.3
    },
    {
        id: 'moon',
        sizeRadius: 5.0,
        color: 0x888888,
        rotationRadius: 1,
        parentId: 'earth',
        orbitDistance: 20.0,
        orbitSpeed: 1.0
    },
    {
        id: 'mars',
        sizeRadius: 10.0,
        color: 0xff0000,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 200,
        orbitSpeed: 0.2
    },
    {
        id: 'phobos',
        sizeRadius: 5.0,
        color: 0x666666,
        rotationRadius: 0.5,
        parentId: 'mars',
        orbitDistance: 20.0,
        orbitSpeed: 0.4
    },
    {
        id: 'deimos',
        sizeRadius: 5.0,
        color: 0x555555,
        rotationRadius: 0.5,
        parentId: 'mars',
        orbitDistance: 35.0,
        orbitSpeed: 0.7
    },
    {
        id: 'jupiter',
        sizeRadius: 10.0,
        color: 0xffaa88,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 250,
        orbitSpeed: 0.4
    },
    {
        id: 'io',
        sizeRadius: 5.0,
        color: 0xffffaa,
        rotationRadius: 1.5,
        parentId: 'jupiter',
        orbitDistance: 20.0,
        orbitSpeed: 5.0
    },
    {
        id: 'europa',
        sizeRadius: 5.0,
        color: 0xaaffff,
        rotationRadius: 1.5,
        parentId: 'jupiter',
        orbitDistance: 35.0,
        orbitSpeed: 4.0
    },
    {
        id: 'saturn',
        sizeRadius: 10.0,
        color: 0xeeddcc,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 300,
        orbitSpeed: 0.3
    },
    {
        id: 'uranus',
        sizeRadius: 10.0,
        color: 0xaabbff,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 350,
        orbitSpeed: 0.2
    },
    {
        id: 'neptune',
        sizeRadius: 10.0,
        color: 0x4466ff,
        rotationRadius: 20,
        parentId: 'sun',
        orbitDistance: 400,
        orbitSpeed: 0.15
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
    deceleration: 3.0
};
