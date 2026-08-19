import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createBloomingFlower } from "./bloomingFlower.js";
import { createAtmosphere } from "./atmosphere.js";
import { detectDevice, isStandaloneApp, viewSize } from "./device.js";

const BLOOM_DURATION = 11;
const BLOOM_HOLD = 0.7;
const CLOSE_DURATION = 1.1;

const canvas = document.querySelector("#scene");
const loading = document.querySelector(".loading");
const bloomButton = document.querySelector(".bloom");
const bloomLabel = document.querySelector(".bloom-label");
const musicButton = document.querySelector(".music");
const music = document.querySelector("#background-music");
const startGate = document.querySelector(".start-gate");
const hint = document.querySelector(".hint");
const intro = document.querySelector(".intro");
const installBanner = document.querySelector(".install-banner");
const installBtn = document.querySelector("#install-btn");
const installClose = document.querySelector(".install-close");
const installGuide = document.querySelector(".install-guide");
const installGuideClose = document.querySelector(".install-guide-close");
const assetUrl = (fileName) => `${import.meta.env.BASE_URL}${fileName}`;
const quality = detectDevice();
const standalone = isStandaloneApp();

if (quality.isMobile) document.documentElement.classList.add("is-mobile");
if (quality.isWeChat) document.documentElement.classList.add("is-wechat");
if (standalone) document.documentElement.classList.add("is-standalone");

music.src = assetUrl("the-rose.mp3");
music.volume = 0.42;
music.setAttribute("playsinline", "");
music.setAttribute("webkit-playsinline", "");
music.preload = quality.isMobile ? "metadata" : "auto";

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060204, quality.isMobile ? 0.022 : 0.032);
scene.background = new THREE.Color(0x060204);

const { width: startWidth, height: startHeight } = viewSize();
const camera = new THREE.PerspectiveCamera(quality.isMobile ? 40 : 38, startWidth / startHeight, 0.1, 80);
camera.position.set(1.35, 0.42, 5.6);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: quality.antialias,
  alpha: true,
  powerPreference: quality.isMobile ? "low-power" : "high-performance",
  stencil: false,
  depth: true
});
renderer.setSize(startWidth, startHeight, false);
renderer.setPixelRatio(quality.pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = quality.isMobile ? 1.22 : 1.08;

if (quality.environment) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = quality.isMobile ? 0.28 : 0.32;
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3.2;
controls.maxDistance = 9;
controls.autoRotate = false;
controls.target.set(0.85, 0.05, 0);
controls.rotateSpeed = quality.isMobile ? 0.72 : 1;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

const keyLight = new THREE.DirectionalLight(0xfff0e8, quality.isMobile ? 3.2 : 2.8);
keyLight.position.set(4.2, 5.6, 4.2);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffa870, quality.isMobile ? 3.4 : 3.8);
rimLight.position.set(-4.6, 2.8, -5.2);
scene.add(rimLight);

const backLight = new THREE.DirectionalLight(0xff6080, quality.isMobile ? 1.8 : 2.4);
backLight.position.set(0.2, 1.4, -6);
scene.add(backLight);

const fillLight = new THREE.PointLight(0xff8098, quality.isMobile ? 4.2 : 6.2, 12, 2);
fillLight.position.set(1.2, 1.4, 3.2);
scene.add(fillLight);

const bottomLight = new THREE.PointLight(0xff6880, quality.isMobile ? 2.8 : 4.2, 9, 1.8);
bottomLight.position.set(0.1, -0.55, 2.2);
scene.add(bottomLight);

const coreLight = new THREE.PointLight(0xffc860, quality.isMobile ? 6 : 10, 4.5, 2);
coreLight.position.set(0, 0.18, 0.2);
scene.add(coreLight);

scene.add(new THREE.HemisphereLight(0xffdce4, 0x18080c, quality.isMobile ? 0.55 : 0.42));
scene.add(new THREE.AmbientLight(0x2a0810, 0.08));

const halo = new THREE.Mesh(
  new THREE.SphereGeometry(2.8, 32, 32),
  new THREE.MeshBasicMaterial({
    color: 0xff5068,
    transparent: true,
    opacity: 0.09,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide
  })
);
halo.position.set(0.15, 0.42, -0.6);
scene.add(halo);

const goldHalo = new THREE.Mesh(
  new THREE.SphereGeometry(1.1, 24, 24),
  new THREE.MeshBasicMaterial({
    color: 0xffb040,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
goldHalo.position.set(0, 0.2, 0);
scene.add(goldHalo);

const atmosphere = createAtmosphere(quality);
scene.add(atmosphere.group);

const flowerRoot = new THREE.Group();
scene.add(flowerRoot);
const flower = createBloomingFlower(quality);
flowerRoot.add(flower.group);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(startWidth, startHeight),
  quality.bloomStrength,
  quality.bloomRadius,
  quality.bloomThreshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
let bloomElapsed = 0;
let closeElapsed = 0;
let displayProgress = 0;
let isPlayingBloom = false;
let isClosing = false;
const lockedProgress = (() => {
  const raw = new URLSearchParams(location.search).get("p");
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : null;
})();
let awaitingStart = quality.isMobile && lockedProgress === null && !standalone;
if (lockedProgress !== null || standalone) {
  awaitingStart = false;
  isPlayingBloom = false;
}

function applyResponsiveLayout() {
  const { width, height } = viewSize();
  const portrait = height >= width;
  if (quality.isMobile || width < 700) {
    const scale = portrait ? 0.9 : 0.8;
    flowerRoot.position.set(0, portrait ? 0.12 : 0.06, 0);
    flowerRoot.scale.setScalar(scale);
    camera.position.set(0.15, portrait ? 0.42 : 0.48, portrait ? 4.85 : 4.55);
    controls.target.set(0, portrait ? 0.22 : 0.26, 0);
    flowerRoot.rotation.set(-0.02, 0.12, 0);
  } else {
    flowerRoot.position.set(0.75, 0.12, 0);
    flowerRoot.scale.setScalar(1.02);
    camera.position.set(1.15, 0.58, 5.35);
    controls.target.set(0.65, 0.22, 0);
    flowerRoot.rotation.set(-0.06, 0.48, -0.12);
  }
  controls.update();
}

function resizeRenderer() {
  const { width, height } = viewSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(quality.pixelRatio);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
  applyResponsiveLayout();
  flowerRoot.userData.baseY = flowerRoot.position.y;
}

function replayBloom() {
  if (lockedProgress !== null) return;
  if (awaitingStart || isClosing || isPlayingBloom) return;
  isClosing = true;
  closeElapsed = 0;
  bloomLabel.textContent = "收拢中";
}

bloomButton.addEventListener("click", (event) => {
  event.stopPropagation();
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

musicButton.addEventListener("click", async (event) => {
  event.stopPropagation();
  if (music.paused) await playMusic();
  else {
    music.pause();
    updateMusicUI(false);
  }
});

function beginBloom() {
  startGate?.classList.add("hidden");
  installBanner?.classList.add("hidden");
  hint?.classList.toggle("hidden", !quality.isMobile || standalone);
  if (!awaitingStart && isPlayingBloom) return;
  awaitingStart = false;
  clock.stop();
  clock.start();
  bloomElapsed = 0;
  closeElapsed = 0;
  isClosing = false;
  isPlayingBloom = lockedProgress === null;
  displayProgress = lockedProgress ?? 0;
  flower.setBloom(displayProgress);
  bloomLabel.textContent = lockedProgress !== null ? "预览" : "开放中";
  playMusic();
}

startGate?.addEventListener("click", beginBloom);
startGate?.addEventListener("touchend", (event) => {
  event.preventDefault();
  beginBloom();
}, { passive: false });

if (lockedProgress !== null) {
  startGate?.classList.add("hidden");
}

let deferredInstallPrompt = null;

function showInstallBanner() {
  if (standalone || quality.isWeChat || sessionStorage.getItem("install-dismissed")) return;
  installBanner?.classList.remove("hidden");
}

function hideInstallBanner() {
  installBanner?.classList.add("hidden");
  sessionStorage.setItem("install-dismissed", "1");
}

installBtn?.addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBanner();
    return;
  }
  installGuide?.classList.remove("hidden");
});

installClose?.addEventListener("click", hideInstallBanner);
installGuideClose?.addEventListener("click", () => installGuide?.classList.add("hidden"));

addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallBanner();
});

if (quality.isIOS && !standalone && !quality.isWeChat) {
  setTimeout(showInstallBanner, 2800);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (awaitingStart) {
    flower.setBloom(0);
    flower.updateSparkles(time, 0);
    flower.updatePremiumEffects(time, 0);
    atmosphere.update(time, 0);
    halo.scale.setScalar(1 + Math.sin(time * 0.8) * 0.05);
    goldHalo.scale.setScalar(0.85 + Math.sin(time * 1.1) * 0.06);
    composer.render();
    return;
  }

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
      if (standalone) intro?.classList.add("immersive");
    }
  }

  flower.setBloom(displayProgress);
  flower.updateSparkles(time, displayProgress);
  flower.updateIdle(time, displayProgress);
  flower.updatePremiumEffects(time, displayProgress);
  atmosphere.update(time, displayProgress);

  const glowPulse = 0.88 + Math.sin(time * 1.15) * 0.12 + displayProgress * 0.32;
  halo.scale.setScalar((1.08 + displayProgress * 0.22) * glowPulse);
  halo.material.opacity = 0.06 + displayProgress * 0.1;
  goldHalo.scale.setScalar((0.75 + displayProgress * 0.45) * (0.9 + Math.sin(time * 1.4) * 0.1));
  goldHalo.material.opacity = 0.06 + displayProgress * 0.16;

  bloomPass.strength = quality.bloomStrength * (0.75 + displayProgress * 0.55);
  bloomPass.threshold = quality.bloomThreshold - displayProgress * 0.12;

  coreLight.intensity = (quality.isMobile ? 6 : 10) * (0.35 + displayProgress * 0.85);
  keyLight.intensity = (quality.isMobile ? 3.2 : 2.8) * (0.82 + displayProgress * 0.28);
  rimLight.intensity = (quality.isMobile ? 3.4 : 3.8) * (0.78 + displayProgress * 0.42);
  fillLight.intensity = (quality.isMobile ? 4.2 : 6.2) * (0.72 + displayProgress * 0.38);
  bottomLight.intensity = (quality.isMobile ? 2.8 : 4.2) * (0.65 + displayProgress * 0.35);

  flowerRoot.position.y = flowerRoot.userData.baseY + Math.sin(time * 0.45) * 0.02;
  controls.update(delta);
  composer.render();
}

applyResponsiveLayout();
flowerRoot.userData.baseY = flowerRoot.position.y;
displayProgress = 0;
flower.setBloom(0);
loading.classList.add("hidden");

if (awaitingStart) {
  bloomLabel.textContent = "轻触开启";
} else {
  startGate?.classList.add("hidden");
  beginBloom();
}

addEventListener("resize", resizeRenderer);
visualViewport?.addEventListener("resize", resizeRenderer);
visualViewport?.addEventListener("scroll", resizeRenderer);
addEventListener("orientationchange", () => setTimeout(resizeRenderer, 250));

animate();
