import * as THREE from "three";
import { createFloatingPetalTexture, createGoldParticleTexture, createSoftParticleTexture } from "./textures.js";

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

export function createAtmosphere(quality = {}) {
  const group = new THREE.Group();
  const rand = mulberry32(880819);
  const petalCount = quality.floatingPetals ?? 24;
  const goldCount = quality.goldDustCount ?? 120;

  const petalTexture = createFloatingPetalTexture(quality.isMobile ? 128 : 256);
  const petalMaterial = new THREE.MeshBasicMaterial({
    map: petalTexture,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide
  });

  const floatingPetals = [];
  for (let i = 0; i < petalCount; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.22 + rand() * 0.18, 0.28 + rand() * 0.2), petalMaterial.clone());
    mesh.material.opacity = 0.12 + rand() * 0.28;
    mesh.position.set((rand() - 0.5) * 8, rand() * 4 - 1.5, -2.2 - rand() * 4.5);
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    group.add(mesh);
    floatingPetals.push({
      mesh,
      speed: 0.08 + rand() * 0.16,
      spin: (rand() - 0.5) * 0.4,
      drift: (rand() - 0.5) * 0.25,
      phase: rand() * Math.PI * 2,
      baseOpacity: mesh.material.opacity
    });
  }

  const goldPositions = new Float32Array(goldCount * 3);
  const goldSeeds = new Float32Array(goldCount * 4);
  for (let i = 0; i < goldCount; i++) {
    goldSeeds[i * 4] = rand() * Math.PI * 2;
    goldSeeds[i * 4 + 1] = 0.5 + rand() * 1.4;
    goldSeeds[i * 4 + 2] = rand();
    goldSeeds[i * 4 + 3] = 0.4 + rand() * 0.6;
  }

  const goldDust = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map: createGoldParticleTexture(),
      color: 0xffd080,
      size: quality.isMobile ? 0.035 : 0.05,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
  );
  goldDust.geometry.setAttribute("position", new THREE.BufferAttribute(goldPositions, 3));
  group.add(goldDust);

  const bokehCount = quality.bokehCount ?? 18;
  const bokehs = [];
  const bokehMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8090,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  for (let i = 0; i < bokehCount; i++) {
    const size = 0.15 + rand() * 0.55;
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(size, 24), bokehMaterial.clone());
    mesh.material.opacity = 0.03 + rand() * 0.08;
    mesh.position.set((rand() - 0.5) * 10, (rand() - 0.5) * 6, -3.5 - rand() * 5);
    group.add(mesh);
    bokehs.push({ mesh, phase: rand() * Math.PI * 2, speed: 0.15 + rand() * 0.2 });
  }

  function update(time, progress) {
    const open = THREE.MathUtils.clamp(progress, 0, 1);
    for (const petal of floatingPetals) {
      const { mesh, speed, spin, drift, phase, baseOpacity } = petal;
      mesh.position.y += speed * 0.012;
      mesh.position.x += Math.sin(time * 0.4 + phase) * drift * 0.008;
      mesh.rotation.z += spin * 0.004;
      mesh.rotation.y += spin * 0.002;
      if (mesh.position.y > 3.2) {
        mesh.position.y = -2.2 - rand() * 1.5;
        mesh.position.x = (rand() - 0.5) * 8;
      }
      mesh.material.opacity = baseOpacity * (0.35 + open * 0.85);
    }

    const positions = goldDust.geometry.attributes.position.array;
    for (let i = 0; i < goldCount; i++) {
      const seed = goldSeeds[i * 4];
      const speed = goldSeeds[i * 4 + 1];
      const radius = 0.8 + goldSeeds[i * 4 + 2] * 2.4;
      const height = goldSeeds[i * 4 + 3];
      const angle = seed + time * 0.08 * speed;
      const y = Math.sin(time * 0.15 * speed + seed) * 1.2 + height * 1.8;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = -1.8 - goldSeeds[i * 4 + 2] * 3.2 + Math.sin(angle * 2) * 0.4;
    }
    goldDust.geometry.attributes.position.needsUpdate = true;
    goldDust.material.opacity = 0.18 + open * 0.62;

    for (const bokeh of bokehs) {
      bokeh.mesh.material.opacity = (0.035 + open * 0.07) * (0.45 + Math.sin(time * bokeh.speed + bokeh.phase) * 0.55);
      bokeh.mesh.scale.setScalar(0.9 + Math.sin(time * 0.3 + bokeh.phase) * 0.08);
    }
  }

  return { group, update };
}
