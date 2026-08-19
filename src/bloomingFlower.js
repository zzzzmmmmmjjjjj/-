import * as THREE from "three";
import { createPetalMaps, createSoftParticleTexture } from "./textures.js";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createPetalGeometry({ width, length, curl, ruffle, segmentsW = 40, segmentsL = 56 }) {
  const geometry = new THREE.PlaneGeometry(1, 1, segmentsW, segmentsL);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;

  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const xNorm = (u - 0.5) * 2;
    const profile = Math.pow(Math.sin(Math.PI * Math.pow(Math.min(v, 0.999), 0.84)), 0.58);
    const edge = 1 - Math.pow(Math.abs(xNorm), 2.35);
    const radial = Math.abs(xNorm);
    const wave = Math.sin(u * Math.PI * 9 + v * Math.PI * 3.2) * ruffle * radial * (0.35 + v);
    const x = xNorm * width * profile * Math.max(edge, 0.08) + wave * 0.35;
    const y = v * length;
    const cup = Math.sin(v * Math.PI) * curl * (1 - radial * 0.42);
    const flare = Math.pow(v, 1.8) * curl * 0.35 * radial;
    const z = cup - flare + wave;
    positions.setXYZ(i, x, y, z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createLeafGeometry() {
  const geometry = new THREE.PlaneGeometry(1, 1, 18, 32);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i);
    const v = uvs.getY(i);
    const xNorm = (u - 0.5) * 2;
    const profile = Math.sin(Math.PI * v);
    const x = xNorm * 0.28 * profile;
    const y = v * 1.15;
    const z = Math.sin(v * Math.PI) * 0.08 + Math.sin(u * Math.PI * 4) * 0.02 * v;
    positions.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createPetalMaterial(map, { transmission, roughness, metalness, opacity, emissive }) {
  return new THREE.MeshPhysicalMaterial({
    map,
    color: 0xffffff,
    roughness,
    metalness,
    transmission,
    thickness: 0.45,
    ior: 1.28,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: transmission < 0.35,
    sheen: 0.85,
    sheenColor: new THREE.Color(0xffd0dc),
    sheenRoughness: 0.38,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    emissive: new THREE.Color(emissive),
    emissiveIntensity: 0.18,
    envMapIntensity: 0.55
  });
}

export function createBloomingFlower() {
  const rand = mulberry32(20260819);
  const group = new THREE.Group();
  const blossom = new THREE.Group();
  blossom.position.y = 0.02;
  group.add(blossom);

  const maps = {
    inner: createPetalMaps("inner"),
    mid: createPetalMaps("mid"),
    outer: createPetalMaps("outer")
  };

  const geometries = {
    inner: createPetalGeometry({ width: 0.42, length: 0.78, curl: 0.22, ruffle: 0.03 }),
    mid: createPetalGeometry({ width: 0.55, length: 1.02, curl: 0.18, ruffle: 0.05 }),
    outer: createPetalGeometry({ width: 0.72, length: 1.28, curl: 0.12, ruffle: 0.08 })
  };

  const materials = {
    inner: createPetalMaterial(maps.inner, {
      transmission: 0.08,
      roughness: 0.48,
      metalness: 0,
      opacity: 1,
      emissive: 0x4a1020
    }),
    mid: createPetalMaterial(maps.mid, {
      transmission: 0.28,
      roughness: 0.36,
      metalness: 0,
      opacity: 0.96,
      emissive: 0x3a0814
    }),
    outer: createPetalMaterial(maps.outer, {
      transmission: 0.72,
      roughness: 0.22,
      metalness: 0,
      opacity: 0.78,
      emissive: 0x2a0810
    })
  };

  const layers = [
    { count: 8, kind: "inner", radius: 0.02 },
    { count: 8, kind: "inner", radius: 0.04 },
    { count: 10, kind: "mid", radius: 0.055 },
    { count: 10, kind: "mid", radius: 0.07 },
    { count: 12, kind: "mid", radius: 0.09 },
    { count: 12, kind: "outer", radius: 0.11 },
    { count: 10, kind: "outer", radius: 0.13 },
    { count: 8, kind: "outer", radius: 0.15 }
  ];

  const petals = [];
  let petalIndex = 0;
  const layerCount = layers.length;

  layers.forEach((layer, layerIndex) => {
    const t = layerIndex / (layerCount - 1);
    for (let i = 0; i < layer.count; i++) {
      const yaw = (i / layer.count) * Math.PI * 2 + layerIndex * 0.33 + (rand() - 0.5) * 0.12;
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      blossom.add(pivot);

      const mesh = new THREE.Mesh(geometries[layer.kind], materials[layer.kind]);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      pivot.add(mesh);

      const closedPitch = -0.42 + t * 0.12 + (rand() - 0.5) * 0.04;
      const openPitch = 0.28 + t * 0.72 + (rand() - 0.5) * 0.06;
      const closedScale = 0.34 + t * 0.04;
      const openScale = (layer.kind === "inner" ? 0.72 : layer.kind === "mid" ? 0.95 : 1.14) * (0.92 + rand() * 0.14);
      const closedWidth = 0.48 + t * 0.08;
      const openWidth = 1;
      const delay = t * 0.5 + rand() * 0.03;
      const span = 0.32 + (1 - t) * 0.18;

      petals.push({
        mesh,
        pivot,
        closedPitch,
        openPitch,
        closedRoll: (rand() - 0.5) * 0.12,
        openRoll: (rand() - 0.5) * 0.22,
        closedScale,
        openScale,
        closedWidth,
        openWidth,
        closedRadius: 0.004,
        openRadius: layer.radius + t * 0.05,
        delay,
        span,
        phase: rand() * Math.PI * 2,
        index: petalIndex++
      });
    }
  });

  const stamenGroup = new THREE.Group();
  blossom.add(stamenGroup);
  const stamenMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffd978,
    roughness: 0.35,
    emissive: 0x6a3a08,
    emissiveIntensity: 0.45
  });
  const filamentMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4c9d6,
    roughness: 0.5
  });
  const stamens = [];
  for (let i = 0; i < 48; i++) {
    const filament = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 5), filamentMaterial);
    const anther = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), stamenMaterial);
    const pivot = new THREE.Group();
    const yaw = i * GOLDEN;
    const tilt = 0.12 + (i % 7) * 0.03;
    pivot.rotation.set(tilt, yaw, 0);
    filament.position.y = 0.22;
    anther.position.y = 0.45;
    pivot.add(filament, anther);
    stamenGroup.add(pivot);
    stamens.push(pivot);
  }

  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0),
    new THREE.Vector3(-0.06, -0.55, 0.05),
    new THREE.Vector3(0.1, -1.25, -0.03),
    new THREE.Vector3(0.02, -2.15, 0.06)
  ]);
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(stemCurve, 48, 0.028, 10, false),
    new THREE.MeshStandardMaterial({
      color: 0x1e3a22,
      roughness: 0.72,
      metalness: 0.05
    })
  );
  group.add(stem);

  const sepalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2f5a36,
    roughness: 0.62,
    side: THREE.DoubleSide
  });
  const sepalGeometry = createPetalGeometry({ width: 0.22, length: 0.38, curl: 0.08, ruffle: 0.02, segmentsW: 12, segmentsL: 16 });
  for (let i = 0; i < 5; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 5) * Math.PI * 2;
    const sepal = new THREE.Mesh(sepalGeometry, sepalMaterial);
    sepal.rotation.x = -1.05;
    sepal.position.z = 0.04;
    pivot.add(sepal);
    blossom.add(pivot);
  }

  const leafMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x3f7a48,
    roughness: 0.55,
    side: THREE.DoubleSide,
    sheen: 0.3,
    sheenColor: new THREE.Color(0xa4e0b0)
  });
  const leafGeometry = createLeafGeometry();
  const leaves = [
    { y: -0.72, yaw: 0.8, roll: -0.4, pitch: 0.9, scale: 1 },
    { y: -1.05, yaw: -2.2, roll: 0.35, pitch: 1.05, scale: 0.82 }
  ];
  for (const leaf of leaves) {
    const pivot = new THREE.Group();
    pivot.position.y = leaf.y;
    pivot.rotation.y = leaf.yaw;
    const mesh = new THREE.Mesh(leafGeometry, leafMaterial);
    mesh.rotation.set(leaf.pitch, 0, leaf.roll);
    mesh.scale.setScalar(leaf.scale);
    pivot.add(mesh);
    group.add(pivot);
  }

  const sparkleTexture = createSoftParticleTexture();
  const sparkleCount = innerWidth < 700 ? 420 : 780;
  const sparklePositions = new Float32Array(sparkleCount * 3);
  const sparkleSeeds = new Float32Array(sparkleCount * 3);
  for (let i = 0; i < sparkleCount; i++) {
    sparkleSeeds[i * 3] = rand() * Math.PI * 2;
    sparkleSeeds[i * 3 + 1] = 0.4 + rand() * 1.6;
    sparkleSeeds[i * 3 + 2] = 0.15 + rand() * 0.85;
  }
  const sparkles = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map: sparkleTexture,
      color: 0xffd6e4,
      size: 0.07,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
      sizeAttenuation: true
    })
  );
  sparkles.geometry.setAttribute("position", new THREE.BufferAttribute(sparklePositions, 3));
  group.add(sparkles);

  function setBloom(progress) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    for (const petal of petals) {
      const local = easeInOutCubic(smoothstep(petal.delay, petal.delay + petal.span, p));
      petal.mesh.rotation.x = THREE.MathUtils.lerp(petal.closedPitch, petal.openPitch, local);
      petal.mesh.rotation.z = THREE.MathUtils.lerp(petal.closedRoll, petal.openRoll, local);
      const scale = THREE.MathUtils.lerp(petal.closedScale, petal.openScale, local);
      const width = THREE.MathUtils.lerp(petal.closedWidth, petal.openWidth, local);
      petal.mesh.scale.set(width, scale, scale);
      petal.mesh.position.z = THREE.MathUtils.lerp(petal.closedRadius, petal.openRadius, local);
      petal.mesh.position.y = THREE.MathUtils.lerp(0.0, 0.02, local);
    }

    const stamenShow = smoothstep(0.35, 0.82, p);
    stamenGroup.scale.setScalar(0.15 + stamenShow * 0.85);
    stamenGroup.position.y = THREE.MathUtils.lerp(-0.04, 0.06, stamenShow);
    sparkles.material.opacity = 0.04 + p * 0.7;
  }

  function updateSparkles(time, progress) {
    const positions = sparkles.geometry.attributes.position.array;
    const open = THREE.MathUtils.clamp(progress, 0, 1);
    for (let i = 0; i < sparkleCount; i++) {
      const seed = sparkleSeeds[i * 3];
      const speed = sparkleSeeds[i * 3 + 1];
      const radius = 0.1 + sparkleSeeds[i * 3 + 2] * (0.12 + open * 1.05);
      const rising = (time * 0.07 * speed + seed) % 1;
      const y = 0.08 + rising * (0.28 + open * 1.25);
      const angle = seed + time * 0.12 * speed;
      const wobble = Math.sin(time * speed + seed) * 0.05;
      positions[i * 3] = Math.cos(angle) * (radius + wobble);
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * (radius + wobble * 0.7);
    }
    sparkles.geometry.attributes.position.needsUpdate = true;
  }

  function updateIdle(time, progress) {
    if (progress < 0.98) return;
    for (const petal of petals) {
      petal.mesh.rotation.z += Math.sin(time * 0.7 + petal.phase) * 0.00035;
    }
    blossom.rotation.y = Math.sin(time * 0.12) * 0.04;
  }

  setBloom(0);

  return {
    group,
    setBloom,
    updateSparkles,
    updateIdle
  };
}
