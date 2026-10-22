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
import { PortalRoom } from "./room/room";
import { visitBounds, RoomViewInputs, type VisitBounds } from "./room/visit";
import { Unravel, UnravelInputs } from "./room/unravel";
import {
  ROOMS,
  parseRoomId,
  roomDefinition,
  RoomJourney,
  type RoomId,
} from "./room/catalog";
import { FrameExport } from "./export";
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
  unravel = new Unravel(motion),
  media = new MediaManager(),
  monitor = new PerformanceMonitor(),
  scene = new SceneTexture(),
  frameExport = new FrameExport(),
  room = new PortalRoom(wake),
  journey = new RoomJourney();
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
  userReduced = false,
  ambient = false,
  depth = defaults.depth,
  lightAngle = defaults.lightAngle,
  composition: 0 | 1 | 2 = 0,
  ambientTime = 0,
  pendingExport = false,
  roomEnabled = new URLSearchParams(location.search).get("room") === "1",
  selectedRoom: RoomId = parseRoomId(
    new URLSearchParams(location.search).get("space"),
  ),
  roomLook = true;
let entered = false,
  enterPending = false,
  visitToken = 0,
  studioOpen = false,
  restoreVisitFocus = false,
  visitInspect = false,
  visitWasRoom = false,
  visitRadius = radius,
  visitView = { x: 0, y: 0 };
const roomView = $("#room-view"),
  enterButton = $<HTMLButtonElement>("#enter-room");
const viewBounds: VisitBounds = { x: 0, y: 0, width: 1, height: 1, round: 1 };
journey.go(selectedRoom);
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
  depth,
  lightAngle: (lightAngle * Math.PI) / 180,
  composition,
  scene: 0,
  previousScene: 0,
  reveal: 1,
  revealX: 0.5,
  revealY: 0.5,
  energy: 0,
  room: 0,
  immersion: 0,
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
  if (motion.reduced) {
    journey.pause();
    stopUnravel();
  }
  wake();
}
function resize() {
  width = innerWidth;
  height = innerHeight;
  radius = Math.min(
    roomEnabled ? 180 : 128,
    width * (roomEnabled ? 0.34 : 0.27),
    height * (roomEnabled ? 0.24 : 0.18),
  );
  const ratio =
    Math.min(
      devicePixelRatio || 1,
      1.75,
      (renderer?.maxDimension ?? 4096) / Math.max(width, height),
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
  const living = ambient && !motion.reduced;
  const continuous =
    motion.moving ||
    unravel.active ||
    room.moving ||
    journey.playing ||
    media.playing ||
    media.demo ||
    reveal < 1 ||
    living;
  if (last && continuous) {
    if (monitor.sample(now - last)) resize();
  }
  last = now;
  if (living) ambientTime += dt;
  if (roomEnabled && !dialog.open) {
    room.step(dt, motion.reduced);
    if (
      !room.switching &&
      !room.moving &&
      (room.status === "ready" || room.status === "fallback")
    ) {
      const next = journey.step(dt);
      if (next) void chooseRoom(next, true);
    }
  }
  motion.light.target =
    (lightAngle * Math.PI) / 180 +
    (living ? Math.sin(ambientTime * 0.22) * 0.55 : 0);
  motion.audio.target = media.playing || media.demo ? media.energy() : 0;
  motion.portal.target =
    roomEnabled && (room.status === "ready" || room.status === "fallback")
      ? 1
      : 0;
  motion.step(dt);
  unravel.step(dt);
  room.setUnravel(unravel.frame);
  if (reveal < 1) reveal = motion.reduced ? 1 : Math.min(1, reveal + dt * 1.8);
  const m = clamp(motion.morph.x, 0, 1),
    energy = motion.audio.x,
    immersion = clamp(motion.immersion.x, 0, 1),
    panelMorph = m * (1 - immersion);
  visitBounds(
    viewBounds,
    width,
    height,
    motion.x.x,
    motion.y.x,
    visitActive() ? visitRadius : radius,
    immersion,
  );
  optical.x = viewBounds.x + (target.x - viewBounds.x) * panelMorph;
  optical.y = viewBounds.y + (target.y - viewBounds.y) * panelMorph;
  optical.width = viewBounds.width + (target.w - viewBounds.width) * panelMorph;
  optical.height =
    viewBounds.height + (target.h - viewBounds.height) * panelMorph;
  optical.round = viewBounds.round + (30 - viewBounds.round) * panelMorph;
  optical.dx = motion.dx.x;
  optical.dy = motion.dy.x;
  optical.intensity = (motion.intensity.x + energy * 0.2) * (1 - m);
  optical.radius = radius;
  optical.ior = ior;
  optical.roughness = roughness * (1 - immersion * 0.75);
  optical.compare = compare;
  optical.depth = depth;
  optical.lightAngle = motion.light.x;
  optical.composition = composition;
  optical.scene = sceneIndex;
  optical.previousScene = previousScene;
  optical.reveal = reveal;
  optical.revealX = revealX;
  optical.revealY = revealY;
  optical.energy = energy;
  optical.room = clamp(motion.portal.x, 0, 1);
  optical.immersion = immersion;
  const viewportInset = width < 600 ? 10 : 16;
  if (optical.room > 0)
    room.render(
      motion.viewX.x,
      motion.viewY.x,
      (motion.x.x / width - 0.5) * 2,
      (motion.y.x / height - 0.46) * 2,
      motion.reduced ? 0 : motion.intensity.x,
      depth,
      immersion > 0
        ? motion.immersion.moving
          ? 768
          : Math.max(width, height) *
            Math.min(devicePixelRatio || 1, 1.25) *
            monitor.scale
        : radius * 3.2 * Math.min(devicePixelRatio || 1, 1.75) * monitor.scale,
      ambientTime,
      immersion > 0
        ? (width - viewportInset * 2) / (height - viewportInset * 2)
        : 1,
      immersion,
    );
  scene.draw(optical, media.source, media.decodedFrame);
  let rendered = true;
  try {
    renderer.draw(
      optical,
      scene.canvas,
      scene.version,
      optical.room > 0 ? room.frame : undefined,
    );
  } catch (error) {
    console.warn("Renderer replaced:", String(error));
    fallback();
    rendered = false;
  }
  renderer.canvas.dataset.roomStatus = room.status;
  renderer.canvas.dataset.roomRenderer = room.backend;
  renderer.canvas.dataset.roomDraws = String(room.draws);
  renderer.canvas.dataset.roomResolution = String(room.resolution);
  renderer.canvas.dataset.roomId = room.kind;
  renderer.canvas.dataset.captureError = String(room.captureError);
  renderer.canvas.dataset.roomSwitching = String(room.switching);
  renderer.canvas.dataset.roomBlend = String(room.blend);
  renderer.canvas.dataset.immersion = String(immersion);
  renderer.canvas.dataset.unravelMode = String(unravel.enabled);
  renderer.canvas.dataset.unravelAmount = String(unravel.frame.amount);
  renderer.canvas.dataset.unravelHolding = String(unravel.holding);
  lens.style.left = `${motion.x.x - radius}px`;
  lens.style.top = `${motion.y.x - radius}px`;
  lens.style.width = lens.style.height = `${radius * 2}px`;
  lens.style.visibility = dialog.open ? "hidden" : "visible";
  transition.update(m, workspace.active !== null);
  updateRoomChrome();
  updateVisitChrome();
  lens.style.visibility = dialog.open || visitActive() ? "hidden" : "visible";
  if (!actions.hidden) positionActions();
  if (workspace.active === "details") updateDetails();
  if (pendingExport && !dialog.open && rendered) {
    pendingExport = false;
    void frameExport
      .save(renderer.canvas)
      .then(() =>
        toast(
          `Study saved · ${renderer.canvas.width} × ${renderer.canvas.height} px`,
        ),
      )
      .catch((error) => toast(error.message));
  }
  if (
    motion.moving ||
    unravel.active ||
    (roomEnabled && !dialog.open && (room.moving || journey.playing)) ||
    media.playing ||
    media.demo ||
    reveal < 1 ||
    living
  )
    wake();
  else last = 0;
}
function visitActive() {
  return entered || enterPending || motion.immersion.x > 0;
}
async function enterLens() {
  if (enterPending || entered || dialog.open) return;
  const token = ++visitToken;
  enterPending = true;
  restoreVisitFocus = false;
  studioOpen = false;
  visitInspect = inspect;
  visitWasRoom = roomEnabled;
  visitRadius = radius;
  visitView = { x: motion.viewX.target, y: motion.viewY.target };
  setInspect(false);
  motion.release();
  closeActions();
  journey.pause();
  roomEnabled = true;
  resize();
  updateVisitChrome();
  $("#return-to-lens").focus({ preventScroll: true });
  await startRoom();
  if (disposed || token !== visitToken || !enterPending) return;
  enterPending = false;
  entered = true;
  motion.immersion.target = 1;
  wake();
}
function returnToLens() {
  stopUnravel();
  ++visitToken;
  enterPending = entered = studioOpen = false;
  journey.pause();
  motion.immersion.target = 0;
  motion.viewX.target = visitView.x;
  motion.viewY.target = visitView.y;
  roomEnabled = visitWasRoom;
  resize();
  visitRadius = radius;
  setInspect(visitInspect);
  restoreVisitFocus = true;
  closeActions();
  wake();
}
function updateVisitChrome() {
  const active = visitActive(),
    p = clamp(motion.immersion.x, 0, 1);
  document.body.classList.toggle("visiting", active);
  document.body.classList.toggle("visit-expanded", p >= 0.5);
  document.body.style.setProperty("--visit-progress", String(p));
  document.body.dataset.visit = enterPending
    ? "loading"
    : entered
      ? "inside"
      : active
        ? "returning"
        : "lens";
  lens.inert = active;
  $("header").inert = active;
  enterButton.hidden = active || dialog.open || !actions.hidden;
  enterButton.style.left = `${motion.x.x}px`;
  enterButton.style.top = `${motion.y.x + radius - 58}px`;
  $("#visit-bar").hidden = !active;
  roomView.hidden = !active || dialog.open;
  roomView.inert = !entered || motion.immersion.moving;
  const captureReady =
    entered &&
    room.kind === "pantheon" &&
    room.status === "ready" &&
    !room.switching;
  if (unravel.enabled && (!captureReady || dialog.open || motion.reduced))
    stopUnravel();
  $("#unravel-tools").hidden = !captureReady || dialog.open || studioOpen;
  const sculptButton = $<HTMLButtonElement>("#unravel-toggle");
  sculptButton.disabled = motion.reduced || motion.immersion.moving;
  sculptButton.setAttribute("aria-pressed", String(unravel.enabled));
  $("#unravel-hint").textContent = motion.reduced
    ? "Available when reduced motion is off. Looking around stays available."
    : unravel.enabled
      ? "Hold + drag · release to restore · Space + arrows on keyboard"
      : "Loosen the stone. Shape its movement. Let it return.";
  roomView.classList.toggle("sculpting", unravel.enabled);
  roomView.setAttribute(
    "aria-label",
    unravel.enabled
      ? "Unravel room. Hold and drag, or hold Space and use arrow keys. Release to restore. Escape returns to looking."
      : "Room view. Drag or use arrow keys to look around. Escape returns to the lens.",
  );
  const dock = $("#studio-dock");
  dock.hidden = active && !studioOpen;
  $("#visit-studio").setAttribute("aria-expanded", String(studioOpen));
  $<HTMLButtonElement>("#visit-studio").disabled =
    enterPending || motion.immersion.moving;
  $("#visit-hint").textContent = enterPending
    ? "OPENING THE ROOM…"
    : room.status === "fallback"
      ? room.kind === "pantheon"
        ? "CAPTURE UNAVAILABLE · CHOOSE ANOTHER ROOM"
        : "ARCHITECTURAL ILLUSTRATION · DRAG TO LOOK AROUND"
      : unravel.enabled
        ? "HOLD TO UNRAVEL · RELEASE TO RESTORE"
        : "DRAG OR USE ARROW KEYS TO LOOK AROUND";
  const nav = $("#room-nav");
  nav.style.opacity = String(Math.abs(2 * p - 1));
  nav.inert = active && (enterPending || motion.immersion.moving);
  if (restoreVisitFocus && !active && !dialog.open) {
    restoreVisitFocus = false;
    enterButton.hidden = false;
    enterButton.focus({ preventScroll: true });
  }
}
enterButton.addEventListener("click", () => {
  void enterLens();
});
$("#return-to-lens").addEventListener("click", returnToLens);
$("#unravel-toggle").addEventListener("click", () => {
  unravelInputs.cancel();
  unravel.setEnabled(!unravel.enabled);
  if (unravel.enabled) roomView.focus({ preventScroll: true });
  updateVisitChrome();
  wake();
});
$("#visit-studio").addEventListener("click", () => {
  studioOpen = !studioOpen;
  if (studioOpen) stopUnravel();
  updateVisitChrome();
});
async function startRoom() {
  if (room.status === "idle") toast("Opening the room…");
  await room.init(
    renderer.name !== "WebGPU" ||
      new URLSearchParams(location.search).get("roomRenderer") === "webgl",
    selectedRoom,
  );
  if (!room.captureError) await room.select(selectedRoom);
  if (room.captureError) selectedRoom = room.kind;
  if (disposed) return;
  if (roomEnabled)
    toast(
      room.status === "ready"
        ? `${roomDefinition(selectedRoom).name} · move to look around`
        : room.kind === "pantheon"
          ? "Capture unavailable · choose another room or retry"
          : "3D is unavailable · showing an architectural study",
    );
  wake();
}
function updateRoomChrome() {
  const nav = $("#room-nav");
  document.body.classList.toggle("has-room", roomEnabled);
  nav.hidden = !roomEnabled || dialog.open;
  const index = ROOMS.findIndex((r) => r.id === selectedRoom);
  const caption = `${room.status === "fallback" ? (room.kind === "pantheon" ? "CAPTURE UNAVAILABLE" : "ILLUSTRATED ROOMS") : "LIVING ROOMS"} · 0${index + 1} / 0${ROOMS.length}`;
  if ($("#room-count").textContent !== caption)
    $("#room-count").textContent = caption;
  const label = `${roomDefinition(selectedRoom).name}${room.switching || room.status === "loading" ? " · Opening…" : ""}`;
  const captureNote = $("#capture-note");
  captureNote.hidden =
    !roomEnabled ||
    dialog.open ||
    !(selectedRoom === "pantheon" || room.captureError || room.captureMessage);
  $("#capture-state").textContent =
    room.captureMessage ||
    (room.captureError
      ? room.kind === "pantheon" && room.status === "fallback"
        ? "Capture unavailable. Choose another room or retry."
        : "Capture unavailable. Your room is still open."
      : room.status === "fallback"
        ? "Capture renderer unavailable"
        : "CAPTURED LIGHT · HYBRID RECONSTRUCTION");
  $("#capture-retry").hidden = !room.captureError;
  if ($("#room-name").textContent !== label)
    $("#room-name").textContent = label;
  nav.dataset.playing = String(journey.playing);
  const play = $<HTMLButtonElement>("#journey-play");
  const name = journey.playing
    ? "Pause rooms"
    : journey.finished
      ? "Replay rooms"
      : "Play rooms";
  if (play.getAttribute("aria-label") !== name) {
    play.setAttribute("aria-label", name);
    play.innerHTML = journey.playing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2"/></svg>'
      : icon("play");
  }
  play.disabled = motion.reduced || room.status === "loading" || room.switching;
  play.title = motion.reduced
    ? "Reduced motion · use Previous and Next to explore"
    : "A paced sequence · 14 seconds in each room";
  const mediaPlay =
    document.querySelector<HTMLButtonElement>("#journey-toggle");
  if (mediaPlay) {
    mediaPlay.disabled = play.disabled;
    if (mediaPlay.textContent !== name)
      mediaPlay.innerHTML = `${icon("play")}${name}`;
  }
  const replay = document.querySelector<HTMLButtonElement>("#journey-replay");
  if (replay) replay.disabled = play.disabled;
}
function leaveRooms() {
  if (visitActive()) returnToLens();
  roomEnabled = false;
  journey.pause();
  const url = new URL(location.href);
  url.searchParams.delete("room");
  url.searchParams.delete("space");
  history.replaceState(null, "", url);
  resize();
}
async function chooseRoom(id: RoomId, automatic = false) {
  stopUnravel();
  selectedRoom = id;
  if (!automatic) journey.go(id);
  motion.viewX.target = motion.viewY.target = 0;
  const url = new URL(location.href);
  url.searchParams.set("room", "1");
  url.searchParams.set("space", id);
  history.replaceState(null, "", url);
  updateRoomChrome();
  wake();
  room.captureError = false;
  await room.select(id);
  if (!disposed && selectedRoom === id && room.captureError) {
    selectedRoom = room.kind;
    journey.go(selectedRoom);
    const currentURL = new URL(location.href);
    currentURL.searchParams.set("space", selectedRoom);
    history.replaceState(null, "", currentURL);
  }
  if (!disposed) wake();
}
function nextRoom(direction: number) {
  const index = ROOMS.findIndex((r) => r.id === selectedRoom);
  void chooseRoom(ROOMS[(index + direction + ROOMS.length) % ROOMS.length].id);
}
$("#capture-retry").addEventListener("click", () => {
  void chooseRoom("pantheon");
});
$("#previous-room").addEventListener("click", () => nextRoom(-1));
$("#next-room").addEventListener("click", () => nextRoom(1));
$("#journey-play").addEventListener("click", () => {
  if (motion.reduced) return;
  if (journey.playing) journey.pause();
  else {
    const id = journey.play();
    if (id !== selectedRoom) void chooseRoom(id, true);
  }
  updateRoomChrome();
  wake();
});
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
  if (workspace.active || inspect || visitActive()) return;
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
        toast(
          media.demo
            ? "Sound on · a slowly breathing harmonic study"
            : "Sound off",
        );
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
    } else if (visitActive()) {
      e.preventDefault();
      if (studioOpen) {
        studioOpen = false;
        updateVisitChrome();
        $("#visit-studio").focus();
      } else returnToLens();
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
  stopUnravel();
  const wasOpen = dialog.open;
  workspace.open(type);
  closeActions();
  if (!wasOpen) {
    saved = { x: motion.x.x, y: motion.y.x };
    motion.release();
    motion.x.target = saved.x;
    motion.y.target = saved.y;
  }
  studioOpen = false;
  transition.open(visitActive() ? $("#visit-studio") : trigger);
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
      )}</div>${range("ior", "Refractive index", 1, 2, 0.01, ior)}${range("roughness", "Surface frost", 0, 1, 0.01, roughness)}<details class="advanced-optics"><summary>Depth & lighting<span>↗</span></summary>${range("depth", "Depth of glass", 0, 2, 0.01, depth)}${range("light-angle", "Light direction", -180, 180, 1, lightAngle)}</details>${toggle("compare", "Original scene", "Temporarily remove the optical distortion.", compare)}${toggle("inspect", "Inspect the lens", "Drag freely. Arrow keys move; Escape exits.", inspect)}<button class="text-button" id="reset-material">${icon("reset")}Reset material & position</button>`;
    bindRange("ior", (value) => {
      ior = value;
      updatePresets();
    });
    bindRange("roughness", (value) => (roughness = value));
    bindRange("depth", (value) => (depth = value));
    bindRange("light-angle", (value) => (lightAngle = value), 0);
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
    $<HTMLInputElement>("#inspect").disabled = visitActive();
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
      depth = defaults.depth;
      lightAngle = defaults.lightAngle;
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
    body.innerHTML = `<div class="stage-gallery" role="group" aria-label="Studio environments">${["Fold", "Sculpture", "Veil", "Room"].map((name, index) => `<button class="stage-preset" data-composition="${index}" aria-pressed="${index === 3 ? roomEnabled : !roomEnabled && composition === index && !media.source}"><span class="stage-mini stage-${index}" aria-hidden="true"></span><span>${name}</span></button>`).join("")}</div><p class="gallery-note">CHOOSE AN ATMOSPHERE, OR BRING YOUR OWN.</p>${roomEnabled ? `<div class="room-note"><span class="badge">LIVING ROOMS / THREE STUDIES + ONE CAPTURE</span><p>Choose a space, or play the three authored studies. Pantheon is a separate captured-reality experiment, downloaded only when selected. Move to look around; lens inspection offers touch and keyboard exploration.</p></div><div class="room-gallery" role="group" aria-label="Choose a room">${ROOMS.map((entry) => `<button class="room-preset room-edition-${entry.id}" data-room="${entry.id}" aria-pressed="${selectedRoom === entry.id}"><span class="room-mini" aria-hidden="true"></span><strong>${entry.name}</strong><small>${entry.subtitle}</small></button>`).join("")}</div><p class="room-description">${roomDefinition(selectedRoom).detail}</p><p class="media-note">Pantheon: a 10.6 MB capture by <a href="https://superspl.at/scene/dac6e508" target="_blank" rel="noopener">artfletch</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Captured lighting; reconstructed floor. Small viewpoint movements reveal depth; free walking and relighting are not available.</p><div class="journey-controls"><button id="journey-toggle" class="text-button" ${motion.reduced ? "disabled" : ""}>${icon("play")}${journey.playing ? "Pause rooms" : journey.finished ? "Replay rooms" : "Play rooms"}</button><button id="journey-replay" class="text-button" ${motion.reduced ? "disabled" : ""}>${icon("reset")}Start again</button></div><p class="media-note">${motion.reduced ? "Reduced motion is active. Choose any room to explore it at rest." : "14 seconds in each room. Pause anytime; the sequence ends after Veil."}</p>${toggle("room-look", "Look around", "Gentle perspective movement. Reduced motion keeps it still.", roomLook)}` : ""}<label class="drop-zone" id="drop-zone">${icon("upload")}<strong>Drop a file, or browse</strong><small>IMAGE, VIDEO OR AUDIO · UP TO 150 MB</small><input id="file" type="file" accept="image/*,video/*,audio/*" aria-label="Choose a local media file"/></label><div id="media-info"></div><p class="media-note">Your files stay on this device. Visual media is shown in monochrome, with a cover crop that follows the lens.</p><button id="export-frame" class="export-button">${icon("download")}Save this moment<span>PNG ↗</span></button>`;
    for (const button of body.querySelectorAll<HTMLButtonElement>(
      "[data-composition]",
    ))
      button.addEventListener("click", () => {
        scene.captureReveal();
        media.clear();
        filename = "";
        if (Number(button.dataset.composition) === 3) {
          roomEnabled = true;
          resize();
          closeWorkspace();
          void startRoom();
          return;
        }
        leaveRooms();
        composition = Number(button.dataset.composition) as 0 | 1 | 2;
        previousScene = sceneIndex;
        reveal = 0;
        revealX = saved.x / width;
        revealY = saved.y / height;
        closeWorkspace();
        wake();
      });
    if (roomEnabled) {
      for (const button of body.querySelectorAll<HTMLButtonElement>(
        "[data-room]",
      ))
        button.addEventListener("click", () => {
          closeWorkspace();
          void chooseRoom(button.dataset.room as RoomId);
        });
      $("#journey-toggle").addEventListener("click", () => {
        if (motion.reduced) return;
        if (journey.playing) journey.pause();
        else {
          const id = journey.play();
          if (id !== selectedRoom) void chooseRoom(id, true);
        }
        closeWorkspace();
        wake();
      });
      $("#journey-replay").addEventListener("click", () => {
        if (motion.reduced) return;
        void chooseRoom(journey.replay(), true);
        closeWorkspace();
        wake();
      });
      $<HTMLInputElement>("#room-look").addEventListener("change", (event) => {
        roomLook = (event.target as HTMLInputElement).checked;
        if (!roomLook) motion.viewX.target = motion.viewY.target = 0;
        wake();
      });
    }
    $("#export-frame").addEventListener("click", () => {
      pendingExport = true;
      closeWorkspace();
    });
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
    body.innerHTML = `${range("magnet", "Magnetic response", 0, 1, 0.01, magnet)}${toggle("living-light", "Living light", "A slow drift through the glass and the room’s light.", ambient)}${toggle("reduce-motion", "Reduced motion", systemReduced.matches ? "System preference is active." : "Settle immediately. Keep every interaction.", userReduced || systemReduced.matches)}<p class="media-note">In navigation mode, press the lens to reveal its actions. In Material, enable inspection to move the lens without selecting an action.</p><button id="reset-interaction" class="text-button">${icon("reset")}Reset interaction</button>`;
    bindRange("magnet", (value) => (magnet = value));
    $<HTMLInputElement>("#living-light").addEventListener("change", (e) => {
      ambient = (e.target as HTMLInputElement).checked;
      wake();
    });
    $<HTMLInputElement>("#reduce-motion").addEventListener("change", (e) => {
      userReduced = (e.target as HTMLInputElement).checked;
      reduced();
    });
    $<HTMLInputElement>("#reduce-motion").disabled = systemReduced.matches;
    $("#reset-interaction").addEventListener("click", () => {
      magnet = defaults.magnet;
      userReduced = false;
      ambient = false;
      ambientTime = 0;
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
    body.innerHTML = `<div class="detail-row"><span>Active renderer</span><span id="renderer-name"></span></div><div class="detail-row"><span>Measured active frames</span><span id="fps">Collecting…</span></div><div class="detail-row"><span>Render resolution</span><span id="resolution"></span></div><div class="detail-row"><span>Room renderer</span><span id="room-renderer"></span></div><div class="detail-row"><span>Room rendering</span><span id="room-measurement"></span></div><div class="detail-row"><span>Backdrop updates</span><span id="texture-updates"></span></div><div class="detail-row"><span>Quality scale</span><span id="quality"></span></div><p class="details-copy">The lens samples the same scene you see behind it. Snell’s law bends the scene samples through a convex surface profile; optical depth controls their travel. Schlick’s approximation varies reflection with refractive index and viewing angle. Roughness softens both highlights and transmitted detail.</p><p class="details-copy">This is a real-time optical approximation, not physical ray tracing. The light wake is a soft caustic approximation driven by the same spring state as the lens.</p><span class="badge">60 FPS TARGET · 16.7 MS FRAME BUDGET</span>`;
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
      leaveRooms();
      if (workspace.active === "media") renderWorkspace("media");
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
  $("#room-renderer").textContent = room.backend;
  $("#room-measurement").textContent =
    room.status === "ready"
      ? `${room.frame.canvas.width} × ${room.frame.canvas.height} · ${room.kind === "pantheon" ? "700,000 splats" : `${room.meshCount} meshes`} · ${room.submitMs.toFixed(1)} ms CPU submit`
      : room.status === "fallback"
        ? "Illustration fallback"
        : "On demand";
  $("#texture-updates").textContent =
    `${scene.version} · ${media.decodedFrame !== undefined ? "decoded video frames" : "on demand"}`;
  $("#quality").textContent = `${Math.round(monitor.scale * 100)}% · adaptive`;
}
const gestures = new Gestures({
  lens,
  motion,
  inspect: () => inspect,
  magnet: () => magnet,
  blocked: () => dialog.open || visitActive(),
  wake,
  openActions,
  closeActions,
  preview,
  select,
  bounds: () => ({ width, height, radius }),
});
const viewInputs = new RoomViewInputs(
  roomView,
  motion,
  () => entered && !dialog.open && !motion.immersion.moving && !unravel.enabled,
  wake,
);
const unravelInputs = new UnravelInputs(
  roomView,
  unravel,
  () =>
    entered &&
    roomEnabled &&
    room.kind === "pantheon" &&
    room.status === "ready" &&
    !room.switching &&
    !dialog.open &&
    !motion.immersion.moving,
  wake,
);
function stopUnravel() {
  unravelInputs.cancel();
  unravel.setEnabled(false);
}
const roomInputs = new AbortController();
window.addEventListener(
  "pointermove",
  (event) => {
    if (
      !roomEnabled ||
      !roomLook ||
      dialog.open ||
      motion.reduced ||
      viewInputs.dragging ||
      unravel.enabled ||
      (entered && event.pointerType === "touch")
    )
      return;
    if (
      (event.target as Element)?.closest?.(
        ".chrome,#actions,#exit-focus,#visit-bar,dialog",
      )
    )
      return;
    motion.viewX.target = clamp((event.clientX / width - 0.5) * 2, -1, 1);
    motion.viewY.target = clamp((event.clientY / height - 0.5) * 2, -1, 1);
    wake();
  },
  { signal: roomInputs.signal, passive: true },
);
window.addEventListener(
  "blur",
  () => {
    motion.viewX.target = motion.viewY.target = 0;
    wake();
  },
  { signal: roomInputs.signal },
);
window.addEventListener("resize", resize);
systemReduced.addEventListener("change", reduced);
document.addEventListener("visibilitychange", () => {
  last = 0;
  if (document.hidden) {
    stopUnravel();
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
    frameExport.dispose();
    roomInputs.abort();
    viewInputs.dispose();
    unravelInputs.dispose();
    void room.dispose();
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
if (roomEnabled) void startRoom();
