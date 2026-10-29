// تطبيق ويب قابل للتثبيت (PWA): تسجيل Service Worker والتقاط حدث التثبيت.

let deferred = null;
const listeners = new Set();

const notify = () => listeners.forEach(listener => listener());

export function initPwa() {
  const secure = location.protocol === "https:" || location.hostname === "localhost";

  if ("serviceWorker" in navigator && secure) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferred = event;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export const canInstall = () => Boolean(deferred);

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export async function installApp() {
  if (!deferred) return false;

  deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  notify();

  return choice.outcome === "accepted";
}

export function onInstallChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
