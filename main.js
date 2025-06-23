// Infinite 3D World - main.js
// Basic Three.js setup

let scene, camera, renderer;
let controls, velocity, direction, moveForward, moveBackward, moveLeft, moveRight, canJump;

// Terrain generation parameters
const CHUNK_SIZE = 64;
const VERTS_PER_CHUNK = 64;
const RENDER_DISTANCE = 2; // Chunks in each direction
const HEIGHT_SCALE = 32;

let simplex = new SimplexNoise();
let chunks = new Map();

// Biome definitions
const BIOMES = [
  {
    name: 'Ocean',
    color: [0.1, 0.2, 0.8],
    condition: (e, t, m) => e < 2,
  },
  {
    name: 'Beach',
    color: [0.9, 0.9, 0.5],
    condition: (e, t, m) => e >= 2 && e < 5,
  },
  {
    name: 'Desert',
    color: [0.93, 0.85, 0.45],
    condition: (e, t, m) => t > 0.6 && m < 0.3 && e >= 5 && e < 18,
  },
  {
    name: 'Plains',
    color: [0.4, 0.8, 0.2],
    condition: (e, t, m) => t > 0.4 && m > 0.3 && e >= 5 && e < 18,
  },
  {
    name: 'Forest',
    color: [0.1, 0.6, 0.1],
    condition: (e, t, m) => t <= 0.4 && m > 0.4 && e >= 5 && e < 18,
  },
  {
    name: 'Hills',
    color: [0.5, 0.4, 0.2],
    condition: (e, t, m) => e >= 18 && e < 28,
  },
  {
    name: 'Mountain',
    color: [0.8, 0.8, 0.8],
    condition: (e, t, m) => e >= 28,
  },
  {
    name: 'Snow',
    color: [1.0, 1.0, 1.0],
    condition: (e, t, m) => e >= 28 && t < 0.3,
  },
];

function getBiomeWeights(e, t, m) {
  // Assign a weight to each biome based on how close the conditions are
  let weights = BIOMES.map(biome => biome.condition(e, t, m) ? 1 : 0);
  // Soft blending: for each biome, use a smoothstep-like function
  // Ocean
  weights[0] = 1 - Math.min(1, Math.max(0, (e - 1.5) / 1.5));
  // Beach
  weights[1] = Math.max(0, 1 - Math.abs(e - 3.5) / 1.5);
  // Desert
  weights[2] = Math.max(0, (t - 0.6) * 2) * Math.max(0, 0.3 - m) * Math.max(0, (e - 5) / 13);
  // Plains
  weights[3] = Math.max(0, (t - 0.4) * 2) * Math.max(0, (m - 0.3) * 2) * Math.max(0, (e - 5) / 13);
  // Forest
  weights[4] = Math.max(0, (0.4 - t) * 2) * Math.max(0, (m - 0.4) * 2) * Math.max(0, (e - 5) / 13);
  // Hills
  weights[5] = Math.max(0, (e - 18) / 10);
  // Mountain
  weights[6] = Math.max(0, (e - 28) / 10);
  // Snow
  weights[7] = Math.max(0, (e - 28) / 10) * Math.max(0, (0.3 - t) * 3);
  // Normalize
  const sum = weights.reduce((a, b) => a + b, 0.0001);
  return weights.map(w => w / sum);
}

function createLowPolyTree() {
  const group = new THREE.Group();
  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.5, 4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, flatShading: true });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2;
  group.add(trunk);
  // Leaves
  const leavesGeo = new THREE.ConeGeometry(2.5, 6, 8);
  const leavesMat = new THREE.MeshStandardMaterial({ color: 0x228B22, flatShading: true });
  const leaves = new THREE.Mesh(leavesGeo, leavesMat);
  leaves.position.y = 6;
  group.add(leaves);
  return group;
}

function createLowPolyDeer() {
  const group = new THREE.Group();
  // Body
  const bodyGeo = new THREE.BoxGeometry(2, 1, 0.8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdeb887, flatShading: true });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.2;
  group.add(body);
  // Head
  const headGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xc2b280, flatShading: true });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(1.2, 1.7, 0);
  group.add(head);
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.15, 0.15, 1, 6);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true });
  for (let dx of [-0.6, 0.6]) {
    for (let dz of [-0.25, 0.25]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(dx, 0.5, dz);
      group.add(leg);
    }
  }
  // Antlers
  const antlerGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 4);
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0xeee8aa, flatShading: true });
  for (let dx of [0.2, 0.5]) {
    const antler = new THREE.Mesh(antlerGeo, antlerMat);
    antler.position.set(1.5, 2.1, dx - 0.35);
    antler.rotation.z = Math.PI / 4 * (dx > 0.3 ? 1 : -1);
    group.add(antler);
  }
  group.castShadow = true;
  return group;
}

class Animal {
  constructor(x, y, z) {
    this.mesh = createLowPolyDeer();
    this.mesh.position.set(x, y, z);
    this.target = this.randomTarget();
    this.speed = 0.7 + Math.random() * 0.5;
  }
  randomTarget() {
    return new THREE.Vector3(
      this.mesh.position.x + (Math.random() - 0.5) * 10,
      this.mesh.position.y,
      this.mesh.position.z + (Math.random() - 0.5) * 10
    );
  }
  update(dt) {
    const pos = this.mesh.position;
    const dir = this.target.clone().sub(pos);
    if (dir.length() < 0.5) {
      this.target = this.randomTarget();
    } else {
      dir.y = 0;
      dir.normalize();
      pos.x += dir.x * this.speed * dt;
      pos.z += dir.z * this.speed * dt;
      this.mesh.lookAt(this.target.x, pos.y, this.target.z);
    }
  }
}

// River system
let rivers = [];
const RIVER_COUNT = 3;

function generateRiverPath(startX, startZ) {
  const path = [];
  let x = startX, z = startZ;
  const maxSteps = 100;
  
  for (let step = 0; step < maxSteps; step++) {
    path.push({ x, z });
    
    // Find lowest neighbor (downhill flow)
    let lowestX = x, lowestZ = z, lowestElevation = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const testX = x + dx * 2;
        const testZ = z + dz * 2;
        const elevation = getElevationAt(testX, testZ);
        if (elevation < lowestElevation) {
          lowestElevation = elevation;
          lowestX = testX;
          lowestZ = testZ;
        }
      }
    }
    
    // Stop if we reached ocean or no downhill
    if (lowestElevation >= getElevationAt(x, z) || lowestElevation < 2) {
      break;
    }
    
    x = lowestX;
    z = lowestZ;
  }
  
  return path;
}

function getElevationAt(x, z) {
  const worldX = x * 0.2;
  const worldZ = z * 0.2;
  let elevation =
    0.6 * simplex.noise2D(worldX, worldZ) +
    0.3 * simplex.noise2D(worldX * 6, worldZ * 6) +
    0.1 * simplex.noise2D(worldX * 36, worldZ * 36);
  return Math.pow(elevation, 3) * HEIGHT_SCALE;
}

function generateRivers() {
  rivers = [];
  for (let i = 0; i < RIVER_COUNT; i++) {
    // Start rivers at high elevations
    const startX = (Math.random() - 0.5) * 100;
    const startZ = (Math.random() - 0.5) * 100;
    const elevation = getElevationAt(startX, startZ);
    
    if (elevation > 20) { // Only start from mountains/hills
      const path = generateRiverPath(startX, startZ);
      if (path.length > 10) { // Only keep rivers with sufficient length
        rivers.push(path);
      }
    }
  }
}

function createRiverMesh(riverPath) {
  const points = [];
  const widths = [];
  
  for (let i = 0; i < riverPath.length; i++) {
    const point = riverPath[i];
    const elevation = getElevationAt(point.x, point.z);
    points.push(new THREE.Vector3(point.x * CHUNK_SIZE, elevation - 0.5, point.z * CHUNK_SIZE));
    
    // River gets wider as it flows downstream
    const width = 2 + (i / riverPath.length) * 3;
    widths.push(width);
  }
  
  if (points.length < 2) return null;
  
  // Create a curved tube along the river path
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, points.length * 2, 1, 8, false);
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      waterColor: { value: new THREE.Color(0x4a90e2) },
      skyColor: { value: new THREE.Color(0x87ceeb) },
      cameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      uniform float time;
      varying vec3 vPos;
      varying float vFlow;
      void main() {
        vPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vFlow = position.x + time * 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 waterColor;
      uniform vec3 skyColor;
      uniform vec3 cameraPos;
      varying vec3 vPos;
      varying float vFlow;
      void main() {
        vec3 viewDir = normalize(cameraPos - vPos);
        float fresnel = pow(1.0 - abs(viewDir.y), 2.0);
        vec3 color = mix(waterColor, skyColor, fresnel * 0.3);
        // Add flow effect
        color += 0.1 * sin(vFlow * 0.1);
        gl_FragColor = vec4(color, 0.8);
      }
    `,
    transparent: true,
  });
  
  return new THREE.Mesh(geometry, material);
}

function modifyTerrainForRivers() {
  // Modify terrain elevation along river paths
  for (const river of rivers) {
    for (const point of river) {
      const chunkX = Math.floor(point.x);
      const chunkZ = Math.floor(point.z);
      const key = chunkKey(chunkX, chunkZ);
      
      if (chunks.has(key)) {
        const chunk = chunks.get(key);
        // Mark this chunk as having a river for terrain modification
        if (!chunk.hasRiver) {
          chunk.hasRiver = true;
          chunk.riverPoints = [];
        }
        chunk.riverPoints.push(point);
      }
    }
  }
}

// Cave system
let caves = [];
const CAVE_COUNT = 2;

function generateCaveSystem(entranceX, entranceZ) {
  const cave = {
    entrance: { x: entranceX, y: getElevationAt(entranceX, entranceZ), z: entranceZ },
    tunnels: [],
    chambers: []
  };
  
  // Generate main tunnel
  const tunnel = generateCaveTunnel(entranceX, entranceZ, 0, 20);
  cave.tunnels.push(tunnel);
  
  // Generate branching tunnels
  for (let i = 0; i < 3; i++) {
    const branchPoint = tunnel[Math.floor(Math.random() * tunnel.length)];
    const branchTunnel = generateCaveTunnel(branchPoint.x, branchPoint.z, branchPoint.y, 10);
    cave.tunnels.push(branchTunnel);
  }
  
  return cave;
}

function generateCaveTunnel(startX, startZ, startY, length) {
  const tunnel = [];
  let x = startX, y = startY, z = startZ;
  
  for (let i = 0; i < length; i++) {
    tunnel.push({ x, y, z });
    
    // Use 3D noise to determine direction
    const noiseX = simplex.noise3D(x * 0.1, y * 0.1, z * 0.1);
    const noiseY = simplex.noise3D(x * 0.1 + 100, y * 0.1, z * 0.1);
    const noiseZ = simplex.noise3D(x * 0.1, y * 0.1, z * 0.1 + 100);
    
    x += noiseX * 2;
    y += noiseY * 0.5; // Less vertical movement
    z += noiseZ * 2;
    
    // Keep tunnels within reasonable bounds
    y = Math.max(y, -10);
    y = Math.min(y, 5);
  }
  
  return tunnel;
}

function generateCaves() {
  caves = [];
  for (let i = 0; i < CAVE_COUNT; i++) {
    // Find suitable cave entrance location (hills/mountains)
    let attempts = 0;
    while (attempts < 50) {
      const x = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 100;
      const elevation = getElevationAt(x, z);
      
      if (elevation > 15 && elevation < 30) { // Hills/mountains
        const cave = generateCaveSystem(x, z);
        caves.push(cave);
        break;
      }
      attempts++;
    }
  }
}

function createCaveMesh(cave) {
  const group = new THREE.Group();
  
  // Create cave entrance (hole in terrain)
  const entranceGeo = new THREE.CylinderGeometry(3, 3, 5, 16);
  const entranceMat = new THREE.MeshStandardMaterial({ 
    color: 0x2d1810, 
    transparent: true, 
    opacity: 0.8 
  });
  const entrance = new THREE.Mesh(entranceGeo, entranceMat);
  entrance.position.set(
    cave.entrance.x * CHUNK_SIZE, 
    cave.entrance.y - 2, 
    cave.entrance.z * CHUNK_SIZE
  );
  group.add(entrance);
  
  // Create tunnel meshes
  for (const tunnel of cave.tunnels) {
    const tunnelMesh = createTunnelMesh(tunnel);
    if (tunnelMesh) {
      group.add(tunnelMesh);
    }
  }
  
  return group;
}

function createTunnelMesh(tunnel) {
  if (tunnel.length < 2) return null;
  
  const points = tunnel.map(point => 
    new THREE.Vector3(
      point.x * CHUNK_SIZE, 
      point.y, 
      point.z * CHUNK_SIZE
    )
  );
  
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, tunnel.length * 2, 2, 8, false);
  
  const material = new THREE.MeshStandardMaterial({ 
    color: 0x1a1a1a, 
    roughness: 0.9,
    metalness: 0.1
  });
  
  return new THREE.Mesh(geometry, material);
}

function modifyTerrainForCaves() {
  // Carve cave entrances into terrain
  for (const cave of caves) {
    const chunkX = Math.floor(cave.entrance.x);
    const chunkZ = Math.floor(cave.entrance.z);
    const key = chunkKey(chunkX, chunkZ);
    
    if (chunks.has(key)) {
      const chunk = chunks.get(key);
      if (!chunk.hasCave) {
        chunk.hasCave = true;
        chunk.caveEntrances = [];
      }
      chunk.caveEntrances.push(cave.entrance);
    }
  }
}

class TerrainChunk {
  constructor(chunkX, chunkZ) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.hasRiver = false;
    this.riverPoints = [];
    this.hasCave = false;
    this.caveEntrances = [];
    this.mesh = this.generateMesh();
    this.mesh.position.set(chunkX * CHUNK_SIZE, 0, chunkZ * CHUNK_SIZE);
    this.trees = [];
    this.animals = [];
    this.riverMeshes = [];
    this.caveMeshes = [];
    this.generateTrees();
    this.generateAnimals();
    this.generateRiverSegments();
    this.generateCaveSegments();
  }

  generateMesh() {
    const geometry = new THREE.PlaneGeometry(
      CHUNK_SIZE,
      CHUNK_SIZE,
      VERTS_PER_CHUNK,
      VERTS_PER_CHUNK
    );
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.attributes.position;
    const colors = [];
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i) / CHUNK_SIZE + this.chunkX;
      const z = vertices.getZ(i) / CHUNK_SIZE + this.chunkZ;
      // Elevation noise
      let elevation =
        0.6 * simplex.noise2D(x * 0.2, z * 0.2) +
        0.3 * simplex.noise2D(x * 1.2, z * 1.2) +
        0.1 * simplex.noise2D(x * 6.2, z * 6.2);
      elevation = Math.pow(elevation, 3) * HEIGHT_SCALE;
      
      // Carve river channels
      for (const river of rivers) {
        for (const point of river) {
          const dist = Math.sqrt((x - point.x) ** 2 + (z - point.z) ** 2);
          if (dist < 2) {
            elevation = Math.min(elevation, 1.5);
          }
        }
      }
      
      // Carve cave entrances
      for (const cave of caves) {
        const dist = Math.sqrt((x - cave.entrance.x) ** 2 + (z - cave.entrance.z) ** 2);
        if (dist < 3) {
          elevation = Math.min(elevation, cave.entrance.y - 2);
        }
      }
      
      vertices.setY(i, elevation);
      // Temperature and moisture noise
      let temp = 0.5 + 0.5 * simplex.noise2D(x * 0.1 + 100, z * 0.1 + 100);
      let moist = 0.5 + 0.5 * simplex.noise2D(x * 0.1 - 100, z * 0.1 - 100);
      // Biome blending
      const weights = getBiomeWeights(elevation, temp, moist);
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < BIOMES.length; j++) {
        r += BIOMES[j].color[0] * weights[j];
        g += BIOMES[j].color[1] * weights[j];
        b += BIOMES[j].color[2] * weights[j];
      }
      colors.push(r, g, b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
    });
    return new THREE.Mesh(geometry, material);
  }

  generateRiverSegments() {
    // Generate river mesh segments for this chunk
    for (const river of rivers) {
      const chunkSegments = [];
      for (let i = 0; i < river.length - 1; i++) {
        const point = river[i];
        const nextPoint = river[i + 1];
        
        // Check if this segment is in our chunk
        const chunkX1 = Math.floor(point.x);
        const chunkZ1 = Math.floor(point.z);
        const chunkX2 = Math.floor(nextPoint.x);
        const chunkZ2 = Math.floor(nextPoint.z);
        
        if ((chunkX1 === this.chunkX && chunkZ1 === this.chunkZ) ||
            (chunkX2 === this.chunkX && chunkZ2 === this.chunkZ)) {
          chunkSegments.push([point, nextPoint]);
        }
      }
      
      if (chunkSegments.length > 0) {
        const riverMesh = createRiverMesh(chunkSegments.flat());
        if (riverMesh) {
          this.mesh.add(riverMesh);
          this.riverMeshes.push(riverMesh);
        }
      }
    }
  }

  generateCaveSegments() {
    // Generate cave mesh segments for this chunk
    for (const cave of caves) {
      const chunkX = Math.floor(cave.entrance.x);
      const chunkZ = Math.floor(cave.entrance.z);
      
      if (chunkX === this.chunkX && chunkZ === this.chunkZ) {
        const caveMesh = createCaveMesh(cave);
        if (caveMesh) {
          this.mesh.add(caveMesh);
          this.caveMeshes.push(caveMesh);
        }
      }
    }
  }

  generateTrees() {
    // Only place trees in suitable biomes
    const treeBiomes = ['Plains', 'Forest', 'Hills'];
    const numTrees = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < numTrees; i++) {
      const localX = (Math.random() - 0.5) * CHUNK_SIZE;
      const localZ = (Math.random() - 0.5) * CHUNK_SIZE;
      const worldX = this.chunkX * CHUNK_SIZE + localX;
      const worldZ = this.chunkZ * CHUNK_SIZE + localZ;
      // Get elevation, temp, moist at this point
      const x = worldX / CHUNK_SIZE;
      const z = worldZ / CHUNK_SIZE;
      let elevation =
        0.6 * simplex.noise2D(x * 0.2, z * 0.2) +
        0.3 * simplex.noise2D(x * 1.2, z * 1.2) +
        0.1 * simplex.noise2D(x * 6.2, z * 6.2);
      elevation = Math.pow(elevation, 3) * HEIGHT_SCALE;
      let temp = 0.5 + 0.5 * simplex.noise2D(x * 0.1 + 100, z * 0.1 + 100);
      let moist = 0.5 + 0.5 * simplex.noise2D(x * 0.1 - 100, z * 0.1 - 100);
      const weights = getBiomeWeights(elevation, temp, moist);
      let maxIdx = 0;
      for (let j = 1; j < weights.length; j++) if (weights[j] > weights[maxIdx]) maxIdx = j;
      const biome = BIOMES[maxIdx].name;
      if (!treeBiomes.includes(biome)) continue;
      if (elevation < 2.5) continue; // Avoid water
      // Avoid steep slopes (sample neighbors)
      let e1 = elevation;
      let e2 = Math.pow(0.6 * simplex.noise2D((x+0.01)*0.2, (z+0.01)*0.2) + 0.3 * simplex.noise2D((x+0.01)*1.2, (z+0.01)*1.2) + 0.1 * simplex.noise2D((x+0.01)*6.2, (z+0.01)*6.2), 3) * HEIGHT_SCALE;
      if (Math.abs(e1 - e2) > 2.5) continue;
      // Place tree
      const tree = createLowPolyTree();
      tree.position.set(localX, elevation, localZ);
      this.mesh.add(tree);
      this.trees.push(tree);
    }
  }

  generateAnimals() {
    // Only spawn animals in suitable biomes
    const animalBiomes = ['Plains', 'Forest'];
    const numAnimals = Math.random() < 0.5 ? 0 : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numAnimals; i++) {
      const localX = (Math.random() - 0.5) * CHUNK_SIZE * 0.8;
      const localZ = (Math.random() - 0.5) * CHUNK_SIZE * 0.8;
      const worldX = this.chunkX * CHUNK_SIZE + localX;
      const worldZ = this.chunkZ * CHUNK_SIZE + localZ;
      // Get elevation, temp, moist at this point
      const x = worldX / CHUNK_SIZE;
      const z = worldZ / CHUNK_SIZE;
      let elevation =
        0.6 * simplex.noise2D(x * 0.2, z * 0.2) +
        0.3 * simplex.noise2D(x * 1.2, z * 1.2) +
        0.1 * simplex.noise2D(x * 6.2, z * 6.2);
      elevation = Math.pow(elevation, 3) * HEIGHT_SCALE;
      let temp = 0.5 + 0.5 * simplex.noise2D(x * 0.1 + 100, z * 0.1 + 100);
      let moist = 0.5 + 0.5 * simplex.noise2D(x * 0.1 - 100, z * 0.1 - 100);
      const weights = getBiomeWeights(elevation, temp, moist);
      let maxIdx = 0;
      for (let j = 1; j < weights.length; j++) if (weights[j] > weights[maxIdx]) maxIdx = j;
      const biome = BIOMES[maxIdx].name;
      if (!animalBiomes.includes(biome)) continue;
      if (elevation < 2.5) continue; // Avoid water
      // Avoid steep slopes
      let e1 = elevation;
      let e2 = Math.pow(0.6 * simplex.noise2D((x+0.01)*0.2, (z+0.01)*0.2) + 0.3 * simplex.noise2D((x+0.01)*1.2, (z+0.01)*1.2) + 0.1 * simplex.noise2D((x+0.01)*6.2, (z+0.01)*6.2), 3) * HEIGHT_SCALE;
      if (Math.abs(e1 - e2) > 2.5) continue;
      // Place animal
      const animal = new Animal(localX, elevation + 0.5, localZ);
      this.mesh.add(animal.mesh);
      this.animals.push(animal);
    }
  }

  dispose() {
    // Remove trees
    for (const tree of this.trees) {
      this.mesh.remove(tree);
    }
    this.trees = [];
    // Remove animals
    for (const animal of this.animals) {
      this.mesh.remove(animal.mesh);
    }
    this.animals = [];
    // Remove river meshes
    for (const riverMesh of this.riverMeshes) {
      this.mesh.remove(riverMesh);
    }
    this.riverMeshes = [];
    // Remove cave meshes
    for (const caveMesh of this.caveMeshes) {
      this.mesh.remove(caveMesh);
    }
    this.caveMeshes = [];
  }
}

function chunkKey(x, z) {
  return `${x},${z}`;
}

function updateChunks() {
  const camChunkX = Math.floor(camera.position.x / CHUNK_SIZE);
  const camChunkZ = Math.floor(camera.position.z / CHUNK_SIZE);
  const needed = new Set();
  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      const key = chunkKey(camChunkX + dx, camChunkZ + dz);
      needed.add(key);
      if (!chunks.has(key)) {
        const chunk = new TerrainChunk(camChunkX + dx, camChunkZ + dz);
        scene.add(chunk.mesh);
        chunks.set(key, chunk);
      }
    }
  }
  // Remove distant chunks
  for (const [key, chunk] of chunks) {
    if (!needed.has(key)) {
      scene.remove(chunk.mesh);
      chunk.dispose && chunk.dispose();
      chunks.delete(key);
    }
  }
}

// Weather system
let weather = {
  type: 'clear', // 'clear', 'rain', 'snow', 'thunderstorm'
  intensity: 0,
  timer: 0,
};
let rainParticles, snowParticles, lightningFlash;

function getCurrentBiomeUnderCamera() {
  // Sample the biome under the camera for weather
  const x = camera.position.x / CHUNK_SIZE;
  const z = camera.position.z / CHUNK_SIZE;
  let elevation =
    0.6 * simplex.noise2D(x * 0.2, z * 0.2) +
    0.3 * simplex.noise2D(x * 1.2, z * 1.2) +
    0.1 * simplex.noise2D(x * 6.2, z * 6.2);
  elevation = Math.pow(elevation, 3) * HEIGHT_SCALE;
  let temp = 0.5 + 0.5 * simplex.noise2D(x * 0.1 + 100, z * 0.1 + 100);
  let moist = 0.5 + 0.5 * simplex.noise2D(x * 0.1 - 100, z * 0.1 - 100);
  // Find dominant biome
  const weights = getBiomeWeights(elevation, temp, moist);
  let maxIdx = 0;
  for (let i = 1; i < weights.length; i++) if (weights[i] > weights[maxIdx]) maxIdx = i;
  return BIOMES[maxIdx].name;
}

function updateWeather(dt) {
  weather.timer -= dt;
  if (weather.timer <= 0) {
    // Decide new weather
    const biome = getCurrentBiomeUnderCamera();
    let roll = Math.random();
    if (biome === 'Snow') {
      weather.type = roll < 0.8 ? 'snow' : 'clear';
      weather.intensity = roll < 0.8 ? 1 : 0;
    } else if (biome === 'Desert') {
      weather.type = 'clear';
      weather.intensity = 0;
    } else if (biome === 'Ocean' || biome === 'Beach') {
      weather.type = roll < 0.2 ? 'rain' : 'clear';
      weather.intensity = roll < 0.2 ? 0.5 : 0;
    } else {
      if (roll < 0.1) {
        weather.type = 'thunderstorm';
        weather.intensity = 1;
      } else if (roll < 0.5) {
        weather.type = 'rain';
        weather.intensity = 1;
      } else {
        weather.type = 'clear';
        weather.intensity = 0;
      }
    }
    weather.timer = 10 + Math.random() * 10; // Weather changes every 10-20s
  }
}

function createRainParticles() {
  const count = 2000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = Math.random() * 100 + 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x66aaff, size: 0.5, transparent: true });
  return new THREE.Points(geometry, material);
}

function createSnowParticles() {
  const count = 1500;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = Math.random() * 100 + 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, transparent: true });
  return new THREE.Points(geometry, material);
}

function createLightningFlash() {
  const light = new THREE.PointLight(0xffffff, 0, 500);
  light.position.set(0, 200, 0);
  return light;
}

function updateParticles() {
  if (weather.type === 'rain') {
    if (!rainParticles) {
      rainParticles = createRainParticles();
      scene.add(rainParticles);
    }
    if (snowParticles) {
      scene.remove(snowParticles);
      snowParticles = null;
    }
  } else if (weather.type === 'snow') {
    if (!snowParticles) {
      snowParticles = createSnowParticles();
      scene.add(snowParticles);
    }
    if (rainParticles) {
      scene.remove(rainParticles);
      rainParticles = null;
    }
  } else {
    if (rainParticles) {
      scene.remove(rainParticles);
      rainParticles = null;
    }
    if (snowParticles) {
      scene.remove(snowParticles);
      snowParticles = null;
    }
  }
}

function animateParticles() {
  if (rainParticles) {
    const positions = rainParticles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] -= 2 + Math.random() * 2;
      if (positions[i + 1] < 0) positions[i + 1] = 100 + Math.random() * 20;
    }
    rainParticles.geometry.attributes.position.needsUpdate = true;
    rainParticles.position.copy(camera.position);
  }
  if (snowParticles) {
    const positions = snowParticles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] -= 0.5 + Math.random();
      positions[i] += Math.sin(Date.now() * 0.001 + i) * 0.01;
      if (positions[i + 1] < 0) positions[i + 1] = 100 + Math.random() * 20;
    }
    snowParticles.geometry.attributes.position.needsUpdate = true;
    snowParticles.position.copy(camera.position);
  }
}

function updateLightning(dt) {
  if (weather.type === 'thunderstorm') {
    if (!lightningFlash) {
      lightningFlash = createLightningFlash();
      scene.add(lightningFlash);
    }
    if (Math.random() < 0.01) {
      lightningFlash.intensity = 8 + Math.random() * 8;
      setTimeout(() => { if (lightningFlash) lightningFlash.intensity = 0; }, 100 + Math.random() * 200);
    }
    lightningFlash.position.copy(camera.position).add(new THREE.Vector3(0, 200, 0));
  } else {
    if (lightningFlash) {
      scene.remove(lightningFlash);
      lightningFlash = null;
    }
  }
}

let skyDome;
let waterMesh;

function createSkyDome() {
  const geometry = new THREE.SphereGeometry(1000, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x87ceeb) }, // Sky blue
      bottomColor: { value: new THREE.Color(0xf0e6d6) }, // Horizon
      offset: { value: 400 },
      exponent: { value: 0.6 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `
  });
  return new THREE.Mesh(geometry, material);
}

function createWaterMesh() {
  const geometry = new THREE.PlaneGeometry(2000, 2000, 128, 128);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      waterColor: { value: new THREE.Color(0x3a9ad9) },
      skyColor: { value: new THREE.Color(0x87ceeb) },
      foamColor: { value: new THREE.Color(0xffffff) },
      cameraPos: { value: new THREE.Vector3() },
      fogColor: { value: new THREE.Color(0xf0e6d6) },
      fogNear: { value: 150 },
      fogFar: { value: 600 },
    },
    vertexShader: `
      uniform float time;
      varying vec3 vPos;
      varying float vFoam;
      void main() {
        vPos = (modelMatrix * vec4(position, 1.0)).xyz;
        float freq = 0.08;
        float amp = 1.5;
        float wave = sin((position.x + time * 20.0) * freq) * amp +
                    cos((position.y + time * 15.0) * freq) * amp * 0.5;
        vec3 pos = position;
        pos.z += wave;
        vFoam = abs(wave) > 1.2 ? 1.0 : 0.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 waterColor;
      uniform vec3 skyColor;
      uniform vec3 foamColor;
      uniform vec3 cameraPos;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      varying vec3 vPos;
      varying float vFoam;
      void main() {
        // Fresnel effect
        vec3 viewDir = normalize(cameraPos - vPos);
        float fresnel = pow(1.0 - abs(viewDir.y), 2.0);
        // Sky reflection
        vec3 color = mix(waterColor, skyColor, fresnel * 0.5);
        // Foam near shore
        color = mix(color, foamColor, vFoam * 0.4);
        // Fog
        float dist = length(cameraPos.xz - vPos.xz);
        float fogFactor = smoothstep(fogNear, fogFar, dist);
        color = mix(color, fogColor, fogFactor);
        gl_FragColor = vec4(color, 0.7);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 1.5; // Ocean level
  return mesh;
}

function setupFirstPersonControls() {
  controls = new THREE.PointerLockControls(camera, document.body);
  scene.add(controls.getObject());
  velocity = new THREE.Vector3();
  direction = new THREE.Vector3();
  moveForward = moveBackward = moveLeft = moveRight = canJump = false;

  const onKeyDown = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW': moveForward = true; break;
      case 'ArrowLeft':
      case 'KeyA': moveLeft = true; break;
      case 'ArrowDown':
      case 'KeyS': moveBackward = true; break;
      case 'ArrowRight':
      case 'KeyD': moveRight = true; break;
      case 'Space': if (canJump) velocity.y += 10; canJump = false; break;
    }
  };
  const onKeyUp = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW': moveForward = false; break;
      case 'ArrowLeft':
      case 'KeyA': moveLeft = false; break;
      case 'ArrowDown':
      case 'KeyS': moveBackward = false; break;
      case 'ArrowRight':
      case 'KeyD': moveRight = false; break;
    }
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Click to play instructions
  const blocker = document.createElement('div');
  blocker.style.position = 'absolute';
  blocker.style.top = '0';
  blocker.style.left = '0';
  blocker.style.width = '100vw';
  blocker.style.height = '100vh';
  blocker.style.background = 'rgba(0,0,0,0.5)';
  blocker.style.color = '#fff';
  blocker.style.display = 'flex';
  blocker.style.alignItems = 'center';
  blocker.style.justifyContent = 'center';
  blocker.style.fontSize = '2em';
  blocker.style.zIndex = '10';
  blocker.innerHTML = 'Click to play';
  document.body.appendChild(blocker);
  blocker.addEventListener('click', () => {
    controls.lock();
  });
  controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
  controls.addEventListener('unlock', () => { blocker.style.display = 'flex'; });
}

// Sound system
let listener, ambientSound, rainSound, thunderSound, animalSounds = [];

function setupAudio() {
  listener = new THREE.AudioListener();
  camera.add(listener);

  // Ambient sound
  ambientSound = new THREE.Audio(listener);
  ambientSound.setLoop(true);
  ambientSound.setVolume(0.5);

  // Rain sound
  rainSound = new THREE.Audio(listener);
  rainSound.setLoop(true);
  rainSound.setVolume(0.6);

  // Thunder sound
  thunderSound = new THREE.Audio(listener);
  thunderSound.setLoop(false);
  thunderSound.setVolume(1.0);

  // Load placeholder sounds (replace URLs with your own files)
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load('https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae7e2.mp3', buffer => {
    ambientSound.setBuffer(buffer);
  }); // Forest ambience
  audioLoader.load('https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae7e2.mp3', buffer => {
    rainSound.setBuffer(buffer);
  }); // Rain (replace with rain sound)
  audioLoader.load('https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae7e2.mp3', buffer => {
    thunderSound.setBuffer(buffer);
  }); // Thunder (replace with thunder sound)
}

function updateAmbientSound(biome) {
  if (!ambientSound.isPlaying) ambientSound.play();
  // Adjust volume or switch sound based on biome
  // (For demo, just play one sound. You can add more logic here.)
}

function updateWeatherSound() {
  if (weather.type === 'rain' || weather.type === 'thunderstorm') {
    if (!rainSound.isPlaying) rainSound.play();
  } else {
    if (rainSound.isPlaying) rainSound.stop();
  }
}

function playThunderSound() {
  if (thunderSound.isPlaying) thunderSound.stop();
  thunderSound.play();
}

function playAnimalSound(type, position) {
  // For demo, just play a deer call at random
  const audioLoader = new THREE.AudioLoader();
  const deerSound = new THREE.PositionalAudio(listener);
  audioLoader.load('https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae7e2.mp3', buffer => {
    deerSound.setBuffer(buffer);
    deerSound.setRefDistance(20);
    deerSound.setVolume(0.7);
    deerSound.play();
  });
  if (position) deerSound.position.copy(position);
  animalSounds.push(deerSound);
  scene.add(deerSound);
}

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 50, 100);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Lighting
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(200, 400, 100);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // Sky dome
  skyDome = createSkyDome();
  scene.add(skyDome);

  // Water
  waterMesh = createWaterMesh();
  scene.add(waterMesh);

  // Fog
  scene.fog = new THREE.Fog(0xf0e6d6, 150, 600);

  setupFirstPersonControls();

  generateRivers();
  generateCaves();

  setupAudio();

  animate();
}

let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // First-person controls movement
  if (controls && controls.isLocked) {
    velocity.x -= velocity.x * 10.0 * dt;
    velocity.z -= velocity.z * 10.0 * dt;
    velocity.y -= 30.0 * dt; // gravity
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();
    if (moveForward || moveBackward) velocity.z -= direction.z * 50.0 * dt;
    if (moveLeft || moveRight) velocity.x -= direction.x * 50.0 * dt;
    controls.moveRight(-velocity.x * dt);
    controls.moveForward(-velocity.z * dt);
    camera.position.y += velocity.y * dt;
    if (camera.position.y < 5) {
      velocity.y = 0;
      camera.position.y = 5;
      canJump = true;
    }
  }

  updateChunks();
  updateWeather(dt);
  updateParticles();
  animateParticles();
  updateLightning(dt);
  // Animate water
  if (waterMesh) {
    waterMesh.material.uniforms.time.value = now * 0.0002;
    waterMesh.material.uniforms.cameraPos.value.copy(camera.position);
    waterMesh.position.x = camera.position.x;
    waterMesh.position.z = camera.position.z;
  }
  // Animate animals
  for (const chunk of chunks.values()) {
    if (chunk.animals) {
      for (const animal of chunk.animals) {
        animal.update(dt);
      }
    }
  }
  // Animate river water
  for (const chunk of chunks.values()) {
    if (chunk.riverMeshes) {
      for (const riverMesh of chunk.riverMeshes) {
        if (riverMesh.material.uniforms) {
          riverMesh.material.uniforms.time.value = now * 0.0002;
          riverMesh.material.uniforms.cameraPos.value.copy(camera.position);
        }
      }
    }
  }

  // Sound logic
  const biome = getCurrentBiomeUnderCamera();
  updateAmbientSound(biome);
  updateWeatherSound();
  if (weather.type === 'thunderstorm' && Math.random() < 0.005) {
    playThunderSound();
  }
  // Occasionally play animal sounds
  if (Math.random() < 0.002) {
    for (const chunk of chunks.values()) {
      if (chunk.animals && chunk.animals.length > 0) {
        const animal = chunk.animals[Math.floor(Math.random() * chunk.animals.length)];
        playAnimalSound('deer', animal.mesh.position);
      }
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

init(); 