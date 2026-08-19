import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createBloomingFlower } from "./bloomingFlower.js";

const BLOOM_DURATION = 11;
const BLOOM_HOLD = 0.7;
const CLOSE_DURATION = 1.1;

const canvas = document.querySelector("#scene");
const loading = document.querySelector(".loading");
const bloomButton = document.querySelector(".bloom");
const bloomLabel = document.querySelector(".bloom-label");
const musicButton = document.querySelector(".music");
const music = document.querySelector("#background-music");
const assetUrl = (fileName) => `${import.meta.env.BASE_URL}${fileName}`;

music.src = assetUrl("the-rose.mp3");
music.volume = 0.42;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x090406, 0.045);
scene.background = new THREE.Color(0x090406);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 80);
camera.position.set(1.35, 0.42, 5.6);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3.6;
controls.maxDistance = 9;
controls.autoRotate = false;
controls.target.set(0.85, 0.05, 0);

const keyLight = new THREE.DirectionalLight(0xffe4ec, 2.1);
keyLight.position.set(3.4, 4.2, 3.8);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffc1d0, 2.6);
rimLight.position.set(-3.8, 1.6, -4.4);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0xff8aa0, 6.5, 12, 2);
fillLight.position.set(0.4, 0.8, 2.4);
scene.add(fillLight);

const hemi = new THREE.HemisphereLight(0xffdce4, 0x12080b, 0.55);
scene.add(hemi);

const flowerRoot = new THREE.Group();
scene.add(flowerRoot);
const flower = createBloomingFlower();
flowerRoot.add(flower.group);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.52, 0.82);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
let bloomElapsed = 0;
let closeElapsed = 0;
let displayProgress = 0;
let isPlayingBloom = true;
let isClosing = false;
const lockedProgress = (() => {
  const raw = new URLSearchParams(location.search).get("p");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : null;
})();
if (lockedProgress !== null) isPlayingBloom = false;

function applyResponsiveLayout() {
  if (innerWidth < 700) {
    flowerRoot.position.set(0.08, -0.18, 0);
    flowerRoot.scale.setScalar(0.78);
    camera.position.set(0.2, 0.35, 5.4);
    controls.target.set(0.08, 0.05, 0);
  } else {
    flowerRoot.position.set(0.95, -0.05, 0);
    flowerRoot.scale.setScalar(1);
    camera.position.set(1.35, 0.42, 5.6);
    controls.target.set(0.85, 0.05, 0);
  }
  flowerRoot.rotation.set(-0.08, 0.55, -0.16);
  controls.update();
}

function replayBloom() {
  if (lockedProgress !== null) return;
  if (isClosing || isPlayingBloom) return;
  isClosing = true;
  closeElapsed = 0;
  bloomLabel.textContent = "收拢中";
}

bloomButton.addEventListener("click", () => {
  if (lockedProgress !== null) return;
  if (isPlayingBloom || isClosing) return;
  replayBloom();
});

function updateMusicUI(isPlaying) {
  musicButton.classList.toggle("playing", isPlaying);
  musicButton.setAttribute("aria-pressed", String(isPlaying));
  musicButton.setAttribute("aria-label", isPlaying ? "暂停背景音乐" : "播放背景音乐");
}

async function playMusic() {
  try {
    await music.play();
    updateMusicUI(true);
  } catch {
    updateMusicUI(false);
  }
}

musicButton.addEventListener("click", async () => {
  if (music.paused) await playMusic();
  else {
    music.pause();
    updateMusicUI(false);
  }
});

playMusic();
addEventListener("pointerdown", (event) => {
  if (!event.target.closest?.(".music") && music.paused) playMusic();
}, { once: true });

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = clock.elapsedTime;

  if (lockedProgress !== null) {
    displayProgress = lockedProgress;
  } else if (isClosing) {
    closeElapsed += delta;
    const closeT = THREE.MathUtils.clamp(closeElapsed / CLOSE_DURATION, 0, 1);
    displayProgress = displayProgress * (1 - closeT * closeT * (3 - 2 * closeT));
    if (closeT >= 1) {
      isClosing = false;
      bloomElapsed = 0;
      isPlayingBloom = true;
      displayProgress = 0;
      bloomLabel.textContent = "开放中";
    }
  } else if (isPlayingBloom) {
    bloomElapsed += delta;
    displayProgress = THREE.MathUtils.clamp((bloomElapsed - BLOOM_HOLD) / BLOOM_DURATION, 0, 1);
    if (displayProgress >= 1) {
      isPlayingBloom = false;
      bloomLabel.textContent = "再开放一次";
    }
  }

  flower.setBloom(displayProgress);
  flower.updateSparkles(time, displayProgress);
  flower.updateIdle(time, displayProgress);
  flowerRoot.position.y = flowerRoot.userData.baseY + Math.sin(time * 0.45) * 0.02;
  controls.update(delta);
  composer.render();
}

applyResponsiveLayout();
flowerRoot.userData.baseY = flowerRoot.position.y;
flower.setBloom(lockedProgress ?? 0);
bloomLabel.textContent = lockedProgress !== null ? "预览" : "开放中";
loading.classList.add("hidden");

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  composer.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth, innerHeight);
  applyResponsiveLayout();
  flowerRoot.userData.baseY = flowerRoot.position.y;
});

animate();
