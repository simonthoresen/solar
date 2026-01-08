export const solarSystemConfig = [
    {
        "id": "sun",
        "sizeRadius": 10,
        "color": 0xffff00,
        "rotationRadius": 500,
        "parentId": null,
        "orbitDistance": 0,
        "orbitSpeed": 0,
        "rotationSpeed": 0.5,
        "renderMode": "toon"
    },
    {
        "id": "mercury",
        "sizeRadius": 10,
        "color": 0xaaaaaa,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 65,
        "orbitSpeed": 0.25,
        "rotationSpeed": 1,
        "renderMode": "toon"
    },
    {
        "id": "venus",
        "sizeRadius": 10,
        "color": 0xffaa00,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 100,
        "orbitSpeed": 0.15,
        "rotationSpeed": 0.5,
        "renderMode": "toon"
    },
    {
        "id": "earth",
        "sizeRadius": 10,
        "color": 0x0000ff,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 150,
        "orbitSpeed": 0.3,
        "rotationSpeed": 2.5,
        "renderMode": "toon"
    },
    {
        "id": "moon",
        "sizeRadius": 5,
        "color": 0x888888,
        "rotationRadius": 15,
        "parentId": "earth",
        "orbitDistance": 20,
        "orbitSpeed": 1,
        "rotationSpeed": 0.5,
        "renderMode": "toon"
    },
    {
        "id": "mars",
        "sizeRadius": 10,
        "color": 0xff0000,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 225,
        "orbitSpeed": 0.2,
        "rotationSpeed": 1.5,
        "renderMode": "toon"
    },
    {
        "id": "phobos",
        "sizeRadius": 5,
        "color": 0x666666,
        "rotationRadius": 15,
        "parentId": "mars",
        "orbitDistance": 20,
        "orbitSpeed": 1.4,
        "rotationSpeed": 1.2,
        "renderMode": "toon"
    },
    {
        "id": "deimos",
        "sizeRadius": 5,
        "color": 0x555555,
        "rotationRadius": 15,
        "parentId": "mars",
        "orbitDistance": 35,
        "orbitSpeed": 0.7,
        "rotationSpeed": 1.4,
        "renderMode": "toon"
    },
    {
        "id": "jupiter",
        "sizeRadius": 10,
        "color": 0xffaa08,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 325,
        "orbitSpeed": 0.4,
        "rotationSpeed": 2,
        "renderMode": "toon"
    },
    {
        "id": "io",
        "sizeRadius": 5,
        "color": 0xffff0a,
        "rotationRadius": 15,
        "parentId": "jupiter",
        "orbitDistance": 20,
        "orbitSpeed": 5,
        "rotationSpeed": 0.8,
        "renderMode": "toon"
    },
    {
        "id": "europa",
        "sizeRadius": 5,
        "color": 0xaaffff,
        "rotationRadius": 15,
        "parentId": "jupiter",
        "orbitDistance": 35,
        "orbitSpeed": 4,
        "rotationSpeed": 0.6,
        "renderMode": "toon"
    },
    {
        "id": "saturn",
        "sizeRadius": 10,
        "color": 0xeeeedc,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 395,
        "orbitSpeed": 0.3,
        "rotationSpeed": 0.9,
        "renderMode": "toon"
    },
    {
        "id": "uranus",
        "sizeRadius": 10,
        "color": 0xaabbff,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 430,
        "orbitSpeed": 0.2,
        "rotationSpeed": 0.7,
        "renderMode": "toon"
    },
    {
        "id": "neptune",
        "sizeRadius": 10,
        "color": 0x4466ff,
        "rotationRadius": 35,
        "parentId": "sun",
        "orbitDistance": 465,
        "orbitSpeed": 0.15,
        "rotationSpeed": 0.8,
        "renderMode": "toon"
    }
];

export const dustConfig = {
    "count": 4096,
    "fieldRadius": 525,
    "dustColor": 0xffffff,
    "minLife": 2,
    "maxLife": 5,
    "poolSize": 1500
};

export const playerConfig = {
    "acceleration": 50,
    "maxSpeed": 50,
    "turnSpeed": 3,
    "deceleration": 3,
    "smokeEmissionInterval": 0.0666, // 5% of original emission rate (20x the interval)
    "exhaustRadius": 2,
    "hullColor": 0x4488ff,
    "modelScale": 1,
    "laserColor": 0x00ff00
};