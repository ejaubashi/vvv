import "./style.css";
import { mount, icon, range, toggle } from "./ui";
import {
  defaults,
  clamp,
  WorkspaceState,
  type Workspace,
  type OpticalState,
  type Scene,
} from "./state";
import { Motion } from "./motion";
import { Gestures } from "./gestures";
import { WorkspaceTransition } from "./transitions";
import { MediaManager } from "./media";
import { PerformanceMonitor } from "./performance";
import { SceneTexture } from "./render/scene";
import {
  createRenderer,
  CanvasRenderer,
  type Renderer,
} from "./render/renderer";
mount();
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const lens = $<HTMLButtonElement>("#lens"),
  dialog = $<HTMLDialogElement>("#workspace"),
  content = $(".workspace-content"),
  actions = $("#actions");
const workspace = new WorkspaceState(),
  motion = new Motion(),
  media = new MediaManager(),
  monitor = new PerformanceMonitor(),
  scene = new SceneTexture();
let width = innerWidth,
  height = innerHeight,
  radius = Math.min(128, width * 0.27, height * 0.18),
  frame = 0,
  last = 0,
  disposed = false;
let renderer: Renderer,
  sceneIndex: Scene = 0,
  previousScene: Scene = 0,
  reveal = 1,
  revealX = 0.5,
  revealY = 0.5;
let ior = defaults.ior,
  roughness = defaults.roughness,
  magnet = defaults.magnet,
  compare = false,
  inspect = false,
  focus = false,
  userReduced = false;
const systemReduced = matchMedia("(prefers-reduced-motion: reduce)");
let saved = { x: width * 0.5, y: height * 0.46 },
  target = { x: width * 0.5, y: height * 0.5, w: 480, h: 500 };
const transition = new WorkspaceTransition(dialog, content, motion, lens);
let toastTimer = 0,
  filename = "",
  loading = false;
motion.x.snap(saved.x);
motion.y.snap(saved.y);
const optical: OpticalState = {
  x: saved.x,
  y: saved.y,
  radius,
  width: radius * 2,
  height: radius * 2,
  round: radius,
  dx: 0,
  dy: 0,
  intensity: 0,
  ior,
  roughness,
  compare,
  scene: 0,
  previousScene: 0,
  reveal: 1,
  revealX: 0.5,
  revealY: 0.5,
  energy: 0,
};
function toast(message: string) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("visible"), 3500);
}
function wake() {
  if (renderer && !disposed && !document.hidden && !frame)
    frame = requestAnimationFrame(tick);
}
function reduced() {
  motion.reduced = systemReduced.matches || userReduced;
  document.body.classList.toggle("reduced", motion.reduced);
  wake();
}
function resize() {
  width = innerWidth;
  height = innerHeight;
  radius = Math.min(128, width * 0.27, height * 0.18);
  const ratio =
    Math.min(
      devicePixelRatio || 1,
      1.75,
      Math.sqrt(3_000_000 / (width * height)),
    ) * monitor.scale;
  renderer?.resize(width, height, ratio);
  scene.resize(width, height);
  saved.x = clamp(saved.x, radius + 12, width - radius - 12);
  saved.y = clamp(
    saved.y,
    radius + 80,
    Math.max(radius + 80, height - radius - 140),
  );
  motion.x.target = clamp(motion.x.target, radius + 12, width - radius - 12);
  motion.y.target = clamp(
    motion.y.target,
    radius + 80,
    Math.max(radius + 80, height - radius - 140),
  );
  measureDialog();
  wake();
}
function measureDialog() {
  if (!dialog.open) return;
  const rect = dialog.getBoundingClientRect();
  target = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    w: rect.width,
    h: rect.height,
  };
  wake();
}
const observer = new ResizeObserver(measureDialog);
observer.observe(dialog);
function tick(now: number) {
  frame = 0;
  if (disposed || document.hidden) return;
  const dt = last ? Math.min((now - last) / 1000, 0.25) : 1 / 60;
  const continuous = motion.moving || media.playing || media.demo || reveal < 1;
  if (last && continuous) {
    if (monitor.sample(now - last)) resize();
  }
  last = now;
  motion.step(dt);
  if (reveal < 1) reveal = motion.reduced ? 1 : Math.min(1, reveal + dt * 1.8);
  const m = clamp(motion.morph.x, 0, 1),
    energy = media.energy();
  optical.x = motion.x.x + (target.x - motion.x.x) * m;
  optical.y = motion.y.x + (target.y - motion.y.x) * m;
  optical.width = radius * 2 + (target.w - radius * 2) * m;
  optical.height = radius * 2 + (target.h - radius * 2) * m;
  optical.round = radius + (30 - radius) * m;
  optical.dx = motion.dx.x;
  optical.dy = motion.dy.x;
  optical.intensity = (motion.intensity.x + energy * 0.2) * (1 - m);
  optical.radius = radius;
  optical.ior = ior;
  optical.roughness = roughness;
  optical.compare = compare;
  optical.scene = sceneIndex;
  optical.previousScene = previousScene;
  optical.reveal = reveal;
  optical.revealX = revealX;
  optical.revealY = revealY;
  optical.energy = energy;
  scene.draw(optical, media.source);
  try {
    renderer.draw(optical, scene.canvas, scene.version);
  } catch (error) {
    console.warn("Renderer replaced:", String(error));
    fallback();
  }
  lens.style.left = `${motion.x.x - radius}px`;
  lens.style.top = `${motion.y.x - radius}px`;
  lens.style.width = lens.style.height = `${radius * 2}px`;
  lens.style.visibility = dialog.open ? "hidden" : "visible";
  transition.update(m, workspace.active !== null);
  lens.style.visibility = dialog.open ? "hidden" : "visible";
  if (!actions.hidden) positionActions();
  if (workspace.active === "details") updateDetails();
  if (motion.moving || media.playing || media.demo || reveal < 1) wake();
  else last = 0;
}
function fallback() {
  if (!renderer || disposed) return;
  renderer.dispose();
  renderer.canvas.remove();
  renderer = new CanvasRenderer();
  $("#scene").append(renderer.canvas);
  resize();
  toast("A simpler glass renderer is active. All controls remain available.");
}
function positionActions() {
  actions.style.left = `${clamp(motion.x.x, 126, width - 126)}px`;
  actions.style.top = `${clamp(motion.y.x + radius + 26, 100, height - 190)}px`;
}
function openActions() {
  if (workspace.active || inspect) return;
  actions.hidden = false;
  lens.setAttribute("aria-expanded", "true");
  positionActions();
}
function closeActions() {
  actions.hidden = true;
  lens.setAttribute("aria-expanded", "false");
  for (const el of actions.querySelectorAll(".preview"))
    el.classList.remove("preview");
}
function actionAt(x: number, y: number) {
  return [...actions.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    },
  );
}
function preview(x: number, y: number) {
  const selected = actionAt(x, y);
  for (const button of actions.querySelectorAll("button"))
    button.classList.toggle("preview", button === selected);
}
function select(x: number, y: number) {
  const action = actionAt(x, y);
  if (action) {
    executeAction(action.dataset.action!);
    closeActions();
  } else {
    const d = Math.hypot(x - motion.x.x, y - motion.y.x);
    if (d > radius) closeActions();
  }
}
function executeAction(action: string) {
  if (action === "scene") {
    previousScene = sceneIndex;
    sceneIndex = ((sceneIndex + 1) % 3) as Scene;
    reveal = 0;
    revealX = motion.x.x / width;
    revealY = motion.y.x / height;
    $("#scene-label").textContent = ["PAPER", "SILVER", "GRAPHITE"][sceneIndex];
    document.body.classList.toggle("dark", sceneIndex === 2);
    wake();
  }
  if (action === "sound") {
    void media
      .toggleDemo()
      .then(() => {
        const button = actions.querySelector("[data-action=sound]")!;
        button.setAttribute("aria-pressed", String(media.demo));
        button.setAttribute(
          "aria-label",
          media.demo
            ? "Disable sound demonstration"
            : "Enable sound demonstration",
        );
        toast(media.demo ? "Sound on · a quiet 110 Hz study" : "Sound off");
        wake();
      })
      .catch(() => toast("Audio could not start in this browser."));
  }
  if (action === "focus") {
    focus = true;
    document.body.classList.add("focused");
    $("#exit-focus").hidden = false;
    $("#exit-focus").focus();
  }
}
$("#exit-focus").addEventListener("click", exitFocus);
function exitFocus() {
  focus = false;
  document.body.classList.remove("focused");
  $("#exit-focus").hidden = true;
  lens.focus();
}
lens.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (inspect) {
      toast("Inspection mode · use arrow keys to move.");
      return;
    }
    openActions();
    actions.querySelector("button")!.focus();
  }
  if (
    inspect &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
  ) {
    e.preventDefault();
    motion.x.target = clamp(
      motion.x.target +
        (e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0),
      radius + 12,
      width - radius - 12,
    );
    motion.y.target = clamp(
      motion.y.target +
        (e.key === "ArrowUp" ? -16 : e.key === "ArrowDown" ? 16 : 0),
      radius + 85,
      height - radius - 145,
    );
    wake();
  }
});
actions.addEventListener("click", (e) => {
  const button = (e.target as Element).closest<HTMLButtonElement>("button");
  if (button) {
    executeAction(button.dataset.action!);
    closeActions();
    if (!focus) lens.focus();
  }
});
actions.addEventListener("keydown", (e) => {
  if (["ArrowRight", "ArrowLeft"].includes(e.key)) {
    e.preventDefault();
    const buttons = [...actions.querySelectorAll("button")],
      index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + (e.key === "ArrowRight" ? 1 : 2)) % 3].focus();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (!lens.contains(e.target as Node) && !actions.contains(e.target as Node))
    closeActions();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (dialog.open) {
      e.preventDefault();
      closeWorkspace();
    } else if (!actions.hidden) {
      closeActions();
      lens.focus();
    } else if (focus) exitFocus();
    else if (inspect) {
      setInspect(false);
      toast("Navigation mode");
    }
  }
});
function setInspect(value: boolean) {
  inspect = value;
  lens.setAttribute(
    "aria-label",
    value
      ? "Inspect lens. Drag or use arrow keys to move. Escape exits inspection."
      : "Glass lens. Open actions",
  );
  $("#mode-label").textContent = value ? "INSPECTION MODE" : "MOVE TO EXPLORE";
  $("#dock-caption").textContent = value
    ? "DRAG TO FEEL THE MATERIAL"
    : "A STUDY IN REFRACTION";
}
function title(name: string, description: string, no: number) {
  $("#workspace-title").textContent = name;
  $("#workspace-description").textContent = description;
  $("#workspace-eyebrow").textContent = `THE STUDIO / 0${no}`;
}
function openWorkspace(type: Workspace, trigger: HTMLElement) {
  const wasOpen = dialog.open;
  workspace.open(type);
  closeActions();
  if (!wasOpen) {
    saved = { x: motion.x.x, y: motion.y.x };
    motion.release();
    motion.x.target = saved.x;
    motion.y.target = saved.y;
  }
  transition.open(trigger);
  renderWorkspace(type);
  measureDialog();
  wake();
}
function closeWorkspace() {
  if (!workspace.active) return;
  workspace.close();
  transition.close();
  motion.x.target = saved.x;
  motion.y.target = saved.y;
  motion.morph.target = 0;
  wake();
}
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeWorkspace();
});
$("#close-workspace").addEventListener("click", closeWorkspace);
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeWorkspace();
  }
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-workspace]",
))
  button.addEventListener("click", () =>
    openWorkspace(button.dataset.workspace as Workspace, button),
  );
function bindRange(id: string, callback: (value: number) => void, digits = 2) {
  const input = $<HTMLInputElement>("#" + id);
  input.addEventListener("input", () => {
    $("#" + id + "-value").textContent = Number(input.value).toFixed(digits);
    callback(Number(input.value));
    wake();
  });
}
function renderWorkspace(type: Workspace) {
  const body = $("#workspace-body");
  if (type === "material") {
    title(
      "Matter, made light.",
      "A change in material. A different way of seeing.",
      2,
    );
    body.innerHTML = `<div class="presets" role="group" aria-label="Material presets">${[
      ["Water", 1.33],
      ["Glass", 1.52],
      ["Crystal", 1.62],
    ]
      .map(
        ([name, value]) =>
          `<button class="preset" data-ior="${value}" aria-pressed="${Math.abs(ior - Number(value)) < 0.005}"><span class="orb" aria-hidden="true"></span>${name}<small>n ${value}</small></button>`,
      )
      .join(
        "",
      )}</div>${range("ior", "Refractive index", 1, 2, 0.01, ior)}${range("roughness", "Surface frost", 0, 1, 0.01, roughness)}${toggle("compare", "Original scene", "Temporarily remove the optical distortion.", compare)}${toggle("inspect", "Inspect the lens", "Drag freely. Arrow keys move; Escape exits.", inspect)}<button class="text-button" id="reset-material">${icon("reset")}Reset material & position</button>`;
    bindRange("ior", (value) => {
      ior = value;
      updatePresets();
    });
    bindRange("roughness", (value) => (roughness = value));
    for (const preset of body.querySelectorAll<HTMLButtonElement>("[data-ior]"))
      preset.addEventListener("click", () => {
        ior = Number(preset.dataset.ior);
        $<HTMLInputElement>("#ior").value = String(ior);
        $("#ior-value").textContent = ior.toFixed(2);
        updatePresets();
        wake();
      });
    $<HTMLInputElement>("#compare").addEventListener("change", (e) => {
      compare = (e.target as HTMLInputElement).checked;
      wake();
    });
    $<HTMLInputElement>("#inspect").addEventListener("change", (e) => {
      setInspect((e.target as HTMLInputElement).checked);
      if (inspect) {
        transition.returnFocus = lens;
        closeWorkspace();
        toast("Inspection mode · drag the lens. Escape returns to navigation.");
      }
    });
    $("#reset-material").addEventListener("click", () => {
      ior = defaults.ior;
      roughness = defaults.roughness;
      compare = false;
      setInspect(false);
      saved = { x: width * 0.5, y: height * 0.46 };
      motion.reset(saved.x, saved.y);
      renderWorkspace("material");
      toast("Material & position reset");
      wake();
    });
  }
  if (type === "media") {
    title(
      "A new perspective.",
      "Bring something of your own into the light.",
      1,
    );
    body.innerHTML = `<label class="drop-zone" id="drop-zone">${icon("upload")}<strong>Drop a file, or browse</strong><small>IMAGE, VIDEO OR AUDIO · UP TO 150 MB</small><input id="file" type="file" accept="image/*,video/*,audio/*" aria-label="Choose a local media file"/></label><div id="media-info"></div><p class="media-note">Your files stay on this device. Visual media is shown in monochrome, with a cover crop that follows the lens.</p>`;
    $<HTMLInputElement>("#file").addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      input.value = "";
      if (f) void loadFile(f);
    });
    const drop = $("#drop-zone");
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("dragging");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("dragging");
      const f = e.dataTransfer?.files[0];
      if (f) void loadFile(f);
    });
    updateMediaUI();
  }
  if (type === "interaction") {
    title(
      "A little give.",
      "Fine-tune the relationship between you and the lens.",
      3,
    );
    body.innerHTML = `${range("magnet", "Magnetic response", 0, 1, 0.01, magnet)}${toggle("reduce-motion", "Reduced motion", systemReduced.matches ? "System preference is active." : "Settle immediately. Keep every interaction.", userReduced || systemReduced.matches)}<p class="media-note">In navigation mode, press the lens to reveal its actions. In Material, enable inspection to move the lens without selecting an action.</p><button id="reset-interaction" class="text-button">${icon("reset")}Reset interaction</button>`;
    bindRange("magnet", (value) => (magnet = value));
    $<HTMLInputElement>("#reduce-motion").addEventListener("change", (e) => {
      userReduced = (e.target as HTMLInputElement).checked;
      reduced();
    });
    $<HTMLInputElement>("#reduce-motion").disabled = systemReduced.matches;
    $("#reset-interaction").addEventListener("click", () => {
      magnet = defaults.magnet;
      userReduced = false;
      setInspect(false);
      motion.release();
      reduced();
      renderWorkspace("interaction");
      toast("Interaction reset");
    });
  }
  if (type === "details") {
    title(
      "Behind the surface.",
      "An optical study in a single, continuous object.",
      4,
    );
    body.innerHTML = `<div class="detail-row"><span>Active renderer</span><span id="renderer-name"></span></div><div class="detail-row"><span>Measured active frames</span><span id="fps">Collecting…</span></div><div class="detail-row"><span>Render resolution</span><span id="resolution"></span></div><div class="detail-row"><span>Quality scale</span><span id="quality"></span></div><p class="details-copy">The lens samples the same scene you see behind it. An analytical approximation bends those samples according to the surface profile and refractive index. Edge reflections approximate Fresnel response; neighboring samples soften the surface frost.</p><p class="details-copy">This is a real-time optical approximation, not physical ray tracing. The light wake is a soft caustic approximation driven by the same spring state as the lens.</p><span class="badge">60 FPS TARGET · 16.7 MS FRAME BUDGET</span>`;
    updateDetails();
  }
  measureDialog();
}
function updatePresets() {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-ior]",
  ))
    button.setAttribute(
      "aria-pressed",
      String(Math.abs(Number(button.dataset.ior) - ior) < 0.005),
    );
}
async function loadFile(file: File) {
  if (loading) toast("Replacing the previous selection…");
  loading = true;
  $("#media-info").textContent = "Opening local file…";
  try {
    const loaded = await media.load(file);
    if (loaded) {
      filename = file.name;
      toast("Local media ready");
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : "Could not load this file.");
  } finally {
    loading = false;
    if (workspace.active === "media") updateMediaUI();
    wake();
  }
}
function format(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function updateMediaUI() {
  if (workspace.active !== "media") return;
  const info = $("#media-info");
  if (!media.kind) {
    info.innerHTML = "";
    return;
  }
  info.innerHTML = `<div class="file-info" id="filename"></div>${media.player ? `<div class="transport"><button class="play" id="play" aria-label="${media.playing ? "Pause" : "Play"} media">${media.playing ? "Ⅱ" : icon("play")}</button><input id="scrub" type="range" min="0" max="100" value="0" step="0.1" aria-label="Playback position"/><output id="time">0:00 / 0:00</output></div>` : ""}<button id="remove-media" class="text-button">${icon("close")}Remove media</button>`;
  $("#filename").textContent = filename;
  if (media.player) {
    $("#play").addEventListener("click", () => {
      if (media.playing) media.player!.pause();
      else
        void media
          .play()
          .catch(() => toast("Playback could not start. Try another file."));
      wake();
    });
    $<HTMLInputElement>("#scrub").addEventListener("input", (e) => {
      if (media.player && Number.isFinite(media.player.duration)) {
        media.player.currentTime =
          (Number((e.target as HTMLInputElement).value) / 100) *
          media.player.duration;
        wake();
      }
    });
    updateTransport();
  }
  $("#remove-media").addEventListener("click", () => {
    media.clear();
    filename = "";
    updateMediaUI();
    wake();
  });
  measureDialog();
}
function updateTransport() {
  if (workspace.active !== "media" || !media.player) return;
  const p = media.player,
    play = $<HTMLButtonElement>("#play"),
    scrub = $<HTMLInputElement>("#scrub");
  if (!play) return;
  play.setAttribute("aria-label", p.paused ? "Play media" : "Pause media");
  play.innerHTML = p.paused ? icon("play") : "Ⅱ";
  scrub.value = String(
    Number.isFinite(p.duration) && p.duration
      ? (p.currentTime / p.duration) * 100
      : 0,
  );
  $("#time").textContent = `${format(p.currentTime)} / ${format(p.duration)}`;
}
media.onChange = () => {
  updateTransport();
  wake();
};
function updateDetails() {
  if (workspace.active !== "details") return;
  $("#renderer-name").textContent = renderer.name;
  $("#fps").textContent = monitor.fps
    ? `${monitor.fps.toFixed(0)} fps / ${monitor.frameMs.toFixed(1)} ms`
    : "Awaiting active interaction";
  $("#resolution").textContent =
    `${renderer.canvas.width} × ${renderer.canvas.height}`;
  $("#quality").textContent = `${Math.round(monitor.scale * 100)}% · adaptive`;
}
const gestures = new Gestures({
  lens,
  motion,
  inspect: () => inspect,
  magnet: () => magnet,
  blocked: () => dialog.open,
  wake,
  openActions,
  closeActions,
  preview,
  select,
  bounds: () => ({ width, height, radius }),
});
window.addEventListener("resize", resize);
systemReduced.addEventListener("change", reduced);
document.addEventListener("visibilitychange", () => {
  last = 0;
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
    media.player?.pause();
    if (media.context?.state === "running") void media.context.suspend();
  } else {
    if (media.demo) void media.context?.resume();
    wake();
  }
});
window.addEventListener(
  "pagehide",
  () => {
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(toastTimer);
    gestures.dispose();
    observer.disconnect();
    media.dispose();
    renderer.dispose();
    window.removeEventListener("resize", resize);
    systemReduced.removeEventListener("change", reduced);
  },
  { once: true },
);
renderer = await createRenderer(fallback);
$("#scene").append(renderer.canvas);
reduced();
resize();
wake();
