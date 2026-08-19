export function detectPetMode(standalone = false) {
  const params = new URLSearchParams(location.search);
  if (params.get("pet") === "1") return true;
  if (params.get("pet") === "0") return false;
  if (standalone && localStorage.getItem("pet-mode") !== "0") return true;
  return localStorage.getItem("pet-mode") === "1";
}

export function setPetMode(enabled) {
  localStorage.setItem("pet-mode", enabled ? "1" : "0");
}

let wakeLock = null;

export async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return false;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
    return true;
  } catch {
    return false;
  }
}

export async function reacquireWakeLock() {
  if (wakeLock) return true;
  return requestWakeLock();
}

export function releaseWakeLock() {
  wakeLock?.release?.();
  wakeLock = null;
}

export function bindWakeLockLifecycle(onVisible) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      reacquireWakeLock();
      onVisible?.();
    }
  });
}
