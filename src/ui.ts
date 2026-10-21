const icons: Record<string, string> = {
  media:
    '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
  material:
    '<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5"/>',
  interaction:
    '<path d="M9 11V5a2 2 0 0 1 4 0v6l2-1a2 2 0 0 1 3 2l-1 6a3 3 0 0 1-3 3h-3a4 4 0 0 1-3-2l-4-5a2 2 0 0 1 3-2l2 2"/>',
  details: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  scene:
    '<circle cx="12" cy="12" r="5"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  sound:
    '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow: '<path d="m8 5 7 7-7 7"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
};
export function icon(name: string) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.details}</svg>`;
}
export function mount() {
  document.querySelector("#app")!.innerHTML = `
<div id="scene" aria-hidden="true"></div>
<header class="chrome"><a class="wordmark" href="./" aria-label="FORM home">form<span>®</span></a><div class="edition"><span>OPTICAL INTERACTION STUDIO</span><span class="edition-no">VOL. 001 — LIGHT & MATTER</span></div></header>
<button id="lens" aria-label="Glass lens. Open actions" aria-expanded="false" aria-controls="actions"></button>
<button id="enter-room" class="enter-room chrome">Enter the lens ${icon("arrow")}</button>
<div id="room-view" tabindex="0" role="region" aria-label="Room view. Drag or use arrow keys to look around. Escape returns to the lens." hidden></div>
<div id="visit-bar" hidden><button id="return-to-lens">${icon("arrow")}Return to lens</button><span id="visit-hint">DRAG OR USE ARROW KEYS TO LOOK AROUND</span><button id="visit-studio" aria-expanded="false" aria-controls="studio-dock">${icon("material")}Studio</button></div>
<div id="actions" hidden role="group" aria-label="Lens actions">${["scene", "sound", "focus"].map((x) => `<button data-action="${x}" aria-label="${x === "sound" ? "Enable sound demonstration" : x === "scene" ? "Cycle scene" : "Enter focus mode"}">${icon(x)}<span>${x[0].toUpperCase() + x.slice(1)}</span></button>`).join("")}</div>
<button id="exit-focus" hidden>${icon("focus")}<span>Exit focus</span></button>
<div class="corner-note chrome"><span class="status-dot"></span><span id="scene-label">PAPER</span><span class="note-separator">/</span><span id="mode-label">MOVE TO EXPLORE</span></div>
<div class="index-note chrome"><span>AN EXPLORATION OF</span><span>LIGHT, IN YOUR HANDS.</span></div>
<nav id="room-nav" class="room-nav chrome" aria-label="Living rooms" hidden>
<button id="previous-room" aria-label="Previous room">${icon("arrow")}</button>
<div class="room-caption"><span id="room-count">LIVING ROOMS · 01 / 04</span><span id="room-name" aria-live="polite" aria-atomic="true">Limestone</span></div>
<button id="journey-play" aria-label="Play rooms">${icon("play")}</button>
<button id="next-room" aria-label="Next room">${icon("arrow")}</button>
</nav>
<aside id="capture-note" class="capture-note chrome" aria-label="Captured room" hidden><span id="capture-state" role="status" aria-live="polite"></span><span><a href="https://superspl.at/scene/dac6e508" target="_blank" rel="noopener">Pantheon · artfletch</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><button id="capture-retry" hidden>Retry capture</button></span></aside>
<div class="dock-wrap chrome" id="studio-dock"><span class="dock-caption" id="dock-caption">A STUDY IN REFRACTION</span><nav class="dock" aria-label="Studio workspaces">${["media", "material", "interaction", "details"].map((x, i) => `<button data-workspace="${x}" aria-label="${x[0].toUpperCase() + x.slice(1)}" aria-haspopup="dialog"><span class="dock-icon">${icon(x)}</span><span class="dock-label">${x[0].toUpperCase() + x.slice(1)}</span><span class="dock-number">0${i + 1}</span></button>`).join("")}</nav></div>
<dialog id="workspace" aria-labelledby="workspace-title"><div class="workspace-content"><div class="workspace-top"><span class="eyebrow" id="workspace-eyebrow">THE STUDIO / 01</span><button class="icon-button" id="close-workspace" aria-label="Close workspace">${icon("close")}</button></div><h1 id="workspace-title"></h1><p id="workspace-description" class="description"></p><div id="workspace-body"></div><footer class="workspace-footer"><span>FORM — OPTICAL STUDIO</span><span>EXPERIMENT FREELY.</span></footer></div></dialog>
<div id="toast" role="status" aria-live="polite"></div>
`;
}
export const range = (
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  unit = "",
) =>
  `<div class="control"><div class="control-label"><label for="${id}">${label}</label><output for="${id}" id="${id}-value">${value.toFixed(2)}${unit}</output></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"/></div>`;
export const toggle = (
  id: string,
  label: string,
  description: string,
  checked = false,
) =>
  `<label class="toggle-row" for="${id}"><span><strong>${label}</strong><small>${description}</small></span><input id="${id}" type="checkbox" role="switch" ${checked ? "checked" : ""}/><span class="switch" aria-hidden="true"></span></label>`;
