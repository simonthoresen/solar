export const solarSystemConfig = [
    {
        "id": "sun",
        "sizeRadius": 10,
        "color": 16776960,
        "rotationRadius": 450,
        "parentId": null,
        "orbitDistance": 0,
        "orbitSpeed": 0,
        "rotationSpeed": 0.5,
        "renderMode": "toon"
    },
    {
        "id": "mercury",
        "sizeRadius": 10,
        "color": 11184810,
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
        "color": 16755200,
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
        "color": 255,
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
        "color": 8947848,
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
        "color": 16711680,
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
        "color": 6710886,
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
        "color": 5592405,
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
        "color": 16755336,
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
        "color": 16777130,
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
        "color": 11206655,
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
        "color": 15654348,
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
        "color": 11189247,
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
        "color": 4482815,
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
    "fieldRadius": 500,
    "dustColor": 16777215,
    "minLife": 2,
    "maxLife": 5,
    "poolSize": 1500
};

export const playerConfig = {
    "acceleration": 50,
    "maxSpeed": 50,
    "turnSpeed": 3,
    "deceleration": 3,
    "smokeEmissionInterval": 0.01,
    "vortexRadius": 3,
    "vortexOffsetZ": 3.5,
    "hullColor": 4491519,
    "modelScale": 1,
    "wakeOffsetZ": 1.5,
    "laserColor": 65280
};