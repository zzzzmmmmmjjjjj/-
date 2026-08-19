import * as THREE from "three";
import { createFloatingPetalTexture, createSoftParticleTexture } from "./textures.js";

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
  const petalCount = quality.floatingPetals ?? 28;
  const dustCount = quality.goldDustCount ?? 80;

  const petalTexture = createFloatingPetalTexture(quality.isMobile ? 128 : 256);
  const floatingPetals = [];

  for (let i = 0; i < petalCount; i++) {
    const w = 0.14 + rand() * 0.16;
    const h = 0.18 + rand() * 0.2;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: petalTexture,
        transparent: true,
        opacity: 0.18 + rand() * 0.32,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    const side = rand() > 0.5 ? 1 : -1;
    mesh.position.set(
      (rand() - 0.5) * 10,
      rand() * 3 - 0.5,
      -1.5 - rand() * 4
    );
    mesh.rotation.set(rand() * 0.8, rand() * Math.PI, rand() * 0.6);
    group.add(mesh);
    floatingPetals.push({
      mesh,
      side,
      speedY: 0.04 + rand() * 0.08,
      speedX: (0.06 + rand() * 0.14) * side,
      spinX: (rand() - 0.5) * 0.5,
      spinY: (rand() - 0.5) * 0.35,
      spinZ: (rand() - 0.5) * 0.6,
      phase: rand() * Math.PI * 2,
      baseOpacity: mesh.material.opacity,
      resetX: -6 - rand() * 2,
      resetY: rand() * 3 - 0.2
    });
  }

  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = new Float32Array(dustCount * 4);
  for (let i = 0; i < dustCount; i++) {
    dustSeeds[i * 4] = rand() * Math.PI * 2;
    dustSeeds[i * 4 + 1] = 0.4 + rand() * 1.2;
    dustSeeds[i * 4 + 2] = (rand() - 0.5) * 8;
    dustSeeds[i * 4 + 3] = rand();
  }

  const dust = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      map: createSoftParticleTexture(),
      color: 0xffe8ee,
      size: quality.isMobile ? 0.028 : 0.038,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
  );
  dust.geometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  group.add(dust);

  const streakCount = quality.isMobile ? 4 : 8;
  const streaks = [];
  for (let i = 0; i < streakCount; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4 + rand() * 2, 0.015 + rand() * 0.02),
      new THREE.MeshBasicMaterial({
        color: 0xffdce6,
        transparent: true,
        opacity: 0.04 + rand() * 0.05,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    mesh.position.set((rand() - 0.5) * 8, rand() * 2.5, -2.5 - rand() * 3);
    mesh.rotation.z = (rand() - 0.5) * 0.12;
    group.add(mesh);
    streaks.push({ mesh, speed: 0.12 + rand() * 0.18, phase: rand() * Math.PI * 2 });
  }

  let windStrength = 0;

  function update(time, progress) {
    const open = THREE.MathUtils.clamp(progress, 0, 1);
    const gust = Math.pow(Math.max(0, Math.sin(time * 0.22 - 0.4)), 3);
    const gust2 = Math.pow(Math.max(0, Math.sin(time * 0.15 + 1.2)), 4);
    windStrength = 0.25 + gust * 0.85 + gust2 * 0.55;
    const windX = 1;
    const lift = windStrength * 0.004;

    for (const petal of floatingPetals) {
      const { mesh, speedY, speedX, spinX, spinY, spinZ, phase, baseOpacity } = petal;
      mesh.position.x += speedX * windStrength * 0.016 + Math.sin(time * 0.35 + phase) * 0.003 * windStrength;
      mesh.position.y += speedY * 0.008 + lift * Math.sin(time * 0.5 + phase);
      mesh.position.z += Math.sin(time * 0.2 + phase) * 0.001;
      mesh.rotation.x += spinX * 0.006 * (0.4 + windStrength);
      mesh.rotation.y += spinY * 0.005 * windStrength;
      mesh.rotation.z += spinZ * 0.008 * (0.5 + windStrength);

      if (mesh.position.x > 6) {
        mesh.position.x = petal.resetX;
        mesh.position.y = petal.resetY;
      } else if (mesh.position.x < -6) {
        mesh.position.x = -petal.resetX;
        mesh.position.y = petal.resetY;
      }
      if (mesh.position.y > 3.5) mesh.position.y = -1.2 - petal.phase * 0.01;
      mesh.material.opacity = baseOpacity * (0.45 + open * 0.65) * (0.7 + windStrength * 0.35);
    }

    const positions = dust.geometry.attributes.position.array;
    for (let i = 0; i < dustCount; i++) {
      const seed = dustSeeds[i * 4];
      const speed = dustSeeds[i * 4 + 1];
      const baseX = dustSeeds[i * 4 + 2];
      const height = dustSeeds[i * 4 + 3];
      positions[i * 3] = baseX + Math.sin(time * 0.12 * speed + seed) * 0.4 + time * 0.04 * windStrength * windX;
      positions[i * 3 + 1] = height * 2.2 + Math.sin(time * 0.18 * speed + seed) * 0.6;
      positions[i * 3 + 2] = -1.2 - dustSeeds[i * 4 + 3] * 2.8;
    }
    dust.geometry.attributes.position.needsUpdate = true;
    dust.material.opacity = 0.12 + open * 0.28 + windStrength * 0.08;

    for (const streak of streaks) {
      streak.mesh.position.x += streak.speed * windStrength * 0.05;
      streak.mesh.material.opacity = (0.03 + open * 0.04) * (0.4 + windStrength * 0.75);
      if (streak.mesh.position.x > 7) streak.mesh.position.x = -7;
    }
  }

  return { group, update, getWindStrength: () => windStrength };
}
