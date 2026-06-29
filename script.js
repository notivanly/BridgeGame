/* ============================================================
   LOAD LIMIT — Bridge Engineering Lab
   Free-form bridge builder + Matter.js stress-test simulation
   ============================================================ */

const { Engine, World, Bodies, Body, Constraint, Vector } = Matter;

// ---------- Canvas & world geometry ----------
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const W = canvas.width;          // 1000
const H = canvas.height;         // 560
const GROUND_Y = 420;            // road level on top of the cliffs
const CHASM_LEFT = 260;
const CHASM_RIGHT = 740;
const METERS_PER_PIXEL = 0.05;   // 20px = 1 meter (for cost/span readouts)
const SNAP_RADIUS = 30;

const FIXED_ANCHORS = [
  { x: CHASM_LEFT,  y: GROUND_Y },
  { x: CHASM_LEFT,  y: GROUND_Y + 60 },
  { x: CHASM_RIGHT, y: GROUND_Y },
  { x: CHASM_RIGHT, y: GROUND_Y + 60 },
];

// ---------- Materials ----------
const MATERIALS = {
  wood: {
    key: 'wood', name: 'Wood', color: '#c89a64', dark: '#8a6239',
    costPerMeter: 14, density: 0.0019, breakDistance: 18, thickness: 8,
    strength: 2, weight: 1, note: 'Cheap & light, snaps under heavy load'
  },
  steel: {
    key: 'steel', name: 'Steel', color: '#a9bdce', dark: '#5d6e7c',
    costPerMeter: 135, density: 0.0048, breakDistance: 42, thickness: 7,
    strength: 5, weight: 3, note: 'Strongest, but pricey and heavy'
  },
  concrete: {
    key: 'concrete', name: 'Concrete', color: '#b3b1a6', dark: '#76746c',
    costPerMeter: 68, density: 0.0066, breakDistance: 28, thickness: 11,
    strength: 3, weight: 5, note: 'Solid in the middle, very heavy'
  },
};

// ---------- Vehicle waves (mass in sim units, kg shown is flavor) ----------
const WAVES = [
  { label: 'Wave 1 · Sedans',        kg: '~1,400 kg',  count: 4, mass: 14,  w: 46,  h: 20, color: '#3b6ea5', gap: 110, speed: 3.2 },
  { label: 'Wave 2 · Vans & Pickups', kg: '~2,800 kg',  count: 4, mass: 26,  w: 56,  h: 26, color: '#3b8a5a', gap: 130, speed: 2.8 },
  { label: 'Wave 3 · Box Trucks',     kg: '~9,000 kg',  count: 3, mass: 55,  w: 76,  h: 36, color: '#c97a2b', gap: 170, speed: 2.3 },
  { label: 'Wave 4 · Semi Trucks',    kg: '~18,000 kg', count: 2, mass: 100, w: 104, h: 42, color: '#a23b3b', gap: 220, speed: 1.8 },
];

const BUDGET = 500000;
const GRAVITY_TARGET = 1.15;
const SETTLE_TOTAL = 75;

// ---------- Collision categories ----------
const CAT = { GROUND: 0x0001, BEAM: 0x0002, VEHICLE: 0x0004, JOINT: 0x0008 };

// ---------- Game state ----------
let joints = [];   // {id, x, y, fixed}
let beams = [];    // {id, aId, bId, material}
let nextId = 1;
let totalCost = 0;
let activeMaterial = 'wood';

let mode = 'build'; // 'build' | 'simulating' | 'won' | 'lost'
let drag = null;    // {fromJoint, x, y}
let pressDownPos = null;

let engine = null;
let jointBodies = new Map();   // jointId -> body
let beamPhys = new Map();      // beamId -> {body, cA, cB, broken}
let vehicles = [];             // {body, state}
let waveIndex = 0;
let waveTimer = 0;
let settleFrames = 0;
let losingWaveLabel = '';

initJoints();
resizeCanvasForDPR();
requestAnimationFrame(loop);

// ============================================================
// Setup
// ============================================================
function initJoints() {
  joints = FIXED_ANCHORS.map(a => ({ id: nextId++, x: a.x, y: a.y, fixed: true }));
  beams = [];
  totalCost = 0;
}

function resizeCanvasForDPR() {
  // Keep crisp on retina without changing internal coordinate system
  const dpr = window.devicePixelRatio || 1;
  if (dpr > 1) {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
  }
}

// ============================================================
// Input (pointer events cover mouse + touch)
// ============================================================
canvas.style.touchAction = 'none';

canvas.addEventListener('pointerdown', e => {
  if (mode !== 'build') return;
  const p = canvasPos(e);
  pressDownPos = p;
  const near = findNearestJoint(p.x, p.y, SNAP_RADIUS);
  drag = { from: near, x: p.x, y: p.y };
});

canvas.addEventListener('pointermove', e => {
  if (mode !== 'build' || !drag) return;
  const p = canvasPos(e);
  drag.x = p.x;
  drag.y = p.y;
});

canvas.addEventListener('pointerup', e => {
  if (mode !== 'build' || !drag) { drag = null; return; }
  const p = canvasPos(e);
  const moved = dist(p.x, p.y, pressDownPos.x, pressDownPos.y) > 6;

  if (!moved) {
    // Treat as a click: try to delete a beam under the cursor
    const hit = findBeamNear(p.x, p.y, 7);
    if (hit) removeBeam(hit.id);
    drag = null;
    return;
  }

  // Completed a drag: create/connect beam
  let fromJoint = drag.from || addJoint(pressDownPos.x, pressDownPos.y, false);
  let toJoint = findNearestJoint(p.x, p.y, SNAP_RADIUS) || addJoint(p.x, p.y, false);

  if (fromJoint.id !== toJoint.id && !beamExists(fromJoint.id, toJoint.id)) {
    addBeam(fromJoint, toJoint, activeMaterial);
  }
  drag = null;
});

canvas.addEventListener('pointerleave', () => { drag = null; });

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (W / r.width),
    y: (e.clientY - r.top) * (H / r.height),
  };
}

// ============================================================
// Build-mode data helpers
// ============================================================
function addJoint(x, y, fixed) {
  const j = { id: nextId++, x, y, fixed };
  joints.push(j);
  return j;
}

function addBeam(a, b, materialKey) {
  const material = MATERIALS[materialKey];
  const length = dist(a.x, a.y, b.x, b.y);
  const meters = length * METERS_PER_PIXEL;
  const cost = meters * material.costPerMeter;
  beams.push({ id: nextId++, aId: a.id, bId: b.id, material: materialKey, length });
  totalCost += cost;
  refreshHUD();
}

function removeBeam(beamId) {
  const b = beams.find(b => b.id === beamId);
  if (!b) return;
  const material = MATERIALS[b.material];
  const meters = b.length * METERS_PER_PIXEL;
  totalCost -= meters * material.costPerMeter;
  beams = beams.filter(x => x.id !== beamId);
  // Clean up orphaned free joints
  joints = joints.filter(j => j.fixed || beams.some(bm => bm.aId === j.id || bm.bId === j.id));
  refreshHUD();
}

function beamExists(aId, bId) {
  return beams.some(b => (b.aId === aId && b.bId === bId) || (b.aId === bId && b.bId === aId));
}

function findNearestJoint(x, y, radius) {
  let best = null, bestD = radius;
  for (const j of joints) {
    const d = dist(x, y, j.x, j.y);
    if (d <= bestD) { best = j; bestD = d; }
  }
  return best;
}

function findBeamNear(x, y, tol) {
  let best = null, bestD = tol;
  for (const b of beams) {
    const a = jointById(b.aId), c = jointById(b.bId);
    if (!a || !c) continue;
    const d = distToSegment(x, y, a.x, a.y, c.x, c.y);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

function jointById(id) { return joints.find(j => j.id === id); }

function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

// ============================================================
// Physics: build the Matter world from joints/beams
// ============================================================
function startSimulation() {
  if (beams.length === 0) {
    flashMessage('Build at least one beam across the gap first.');
    return;
  }
  engine = Engine.create({
    positionIterations: 14,
    velocityIterations: 10,
    constraintIterations: 8,
  });
  engine.gravity.y = 0; // ramped in gradually in simulationStep — see GRAVITY_TARGET

  jointBodies.clear();
  beamPhys.clear();
  vehicles = [];
  waveIndex = 0;
  waveTimer = 90; // small delay before first wave rolls in
  settleFrames = SETTLE_TOTAL; // grace period: let the structure settle before checking for breaks

  // Static ground for the two cliffs (collides with vehicles only)
  // Left cliff extends well off-screen so staggered vehicle spawn points
  // (which sit at negative x for stagger timing) have solid ground under them.
  const LEFT_EXTEND = 900;
  const leftCliffWidth = CHASM_LEFT + LEFT_EXTEND;
  const leftCliff = Bodies.rectangle(CHASM_LEFT / 2 - LEFT_EXTEND / 2, GROUND_Y + 70, leftCliffWidth, 140, {
    isStatic: true, collisionFilter: { category: CAT.GROUND, mask: CAT.VEHICLE },
  });
  const rightCliff = Bodies.rectangle(CHASM_RIGHT + (W - CHASM_RIGHT) / 2, GROUND_Y + 70, W - CHASM_RIGHT, 140, {
    isStatic: true, collisionFilter: { category: CAT.GROUND, mask: CAT.VEHICLE },
  });
  World.add(engine.world, [leftCliff, rightCliff]);

  // Every joint becomes a real body now — fixed joints are static (immovable
  // but still proper bodies), free joints are dynamic. Beams will be pure
  // distance constraints between these, which is far more stable for
  // arbitrary topologies (including closed loops/triangles) than chaining
  // independently-rotating rigid rectangles together.
  const jointMass = new Map();
  for (const j of joints) jointMass.set(j.id, 2.2); // small base mass
  for (const b of beams) {
    const material = MATERIALS[b.material];
    const beamMass = b.length * material.thickness * material.density;
    jointMass.set(b.aId, (jointMass.get(b.aId) || 2.2) + beamMass / 2);
    jointMass.set(b.bId, (jointMass.get(b.bId) || 2.2) + beamMass / 2);
  }

  for (const j of joints) {
    const body = Bodies.circle(j.x, j.y, 6, {
      isStatic: !!j.fixed,
      collisionFilter: { category: CAT.JOINT, mask: 0 },
      friction: 0,
      frictionAir: 0.12,
    });
    if (!j.fixed) Body.setMass(body, jointMass.get(j.id));
    jointBodies.set(j.id, body);
    World.add(engine.world, body);
  }

  // Beams: a pure distance constraint carries the structural load; a thin
  // static "skin" rectangle is repositioned every frame to visually and
  // physically track the line between the two joints (for vehicles to
  // collide with) — it is NOT part of the constraint network, so it can't
  // introduce any of the instability rigid-rectangle links were causing.
  for (const b of beams) {
    const a = jointById(b.aId), c = jointById(b.bId);
    const material = MATERIALS[b.material];
    const bodyA = jointBodies.get(a.id);
    const bodyB = jointBodies.get(c.id);
    const len = b.length;

    const constraint = Constraint.create({
      bodyA, bodyB, length: len, stiffness: 0.95, damping: 0.35,
    });
    World.add(engine.world, constraint);

    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    const angle = Math.atan2(c.y - a.y, c.x - a.x);
    const skin = Bodies.rectangle(mx, my, len, material.thickness, {
      isStatic: true, angle,
      collisionFilter: { category: CAT.BEAM, mask: CAT.GROUND | CAT.VEHICLE },
    });
    World.add(engine.world, skin);

    beamPhys.set(b.id, { constraint, skin, bodyA, bodyB, broken: false, material, len, baseline: undefined });
  }

  mode = 'simulating';
  refreshHUD();
}

function computeDeformation(bp) {
  const dx = bp.bodyB.position.x - bp.bodyA.position.x;
  const dy = bp.bodyB.position.y - bp.bodyA.position.y;
  const currentDist = Math.hypot(dx, dy);
  return { deformation: Math.abs(currentDist - bp.len), dx, dy };
}

// ============================================================
// Simulation tick
// ============================================================
function simulationStep() {
  // Ease gravity in over the settle window so closed loops (boxes, triangles)
  // don't get hit with full weight in one instant and pop into a warped shape.
  const settleFrac = 1 - settleFrames / SETTLE_TOTAL; // 0 -> 1 over the settle window
  const eased = settleFrac * settleFrac * (3 - 2 * settleFrac); // smoothstep
  engine.gravity.y = GRAVITY_TARGET * Math.min(1, Math.max(0, eased));

  Engine.update(engine, 1000 / 60);

  const wasSettling = settleFrames > 0;
  if (settleFrames > 0) settleFrames--;
  const justSettled = wasSettling && settleFrames === 0;

  // Check every beam for excess *added* deformation (above its own settled
  // resting tension) -> break. A complex truss naturally settles into some
  // resting tension just from its own weight; that's normal, not failure.
  // We only care about load added on top of that (e.g. a vehicle's weight).
  for (const [beamId, bp] of beamPhys) {
    if (bp.broken) continue;
    const { deformation, dx, dy } = computeDeformation(bp);

    if (justSettled) bp.baseline = deformation;

    const effectiveLimit = bp.material.breakDistance * Math.max(1, bp.len / 150);
    const added = Math.max(0, deformation - (bp.baseline ?? deformation));
    bp.stress = Math.min(1.4, added / effectiveLimit);

    if (settleFrames === 0 && bp.baseline !== undefined && added > effectiveLimit) {
      World.remove(engine.world, [bp.constraint, bp.skin]);
      bp.broken = true;
    } else {
      // Keep the collidable "skin" tracking the current joint positions
      const mx = (bp.bodyA.position.x + bp.bodyB.position.x) / 2;
      const my = (bp.bodyA.position.y + bp.bodyB.position.y) / 2;
      Body.setPosition(bp.skin, { x: mx, y: my });
      Body.setAngle(bp.skin, Math.atan2(dy, dx));
    }
  }

  // Wave logic
  if (waveTimer > 0) {
    waveTimer--;
    if (waveTimer === 0) spawnWave(waveIndex);
  } else {
    stepVehicles();
  }
}

function spawnWave(idx) {
  const wave = WAVES[idx];
  for (let i = 0; i < wave.count; i++) {
    const startX = -40 - i * wave.gap;
    const body = Bodies.rectangle(startX, GROUND_Y - wave.h / 2 - 6, wave.w, wave.h, {
      chamfer: { radius: 4 }, friction: 0.9, frictionStatic: 1, restitution: 0.02,
      collisionFilter: { category: CAT.VEHICLE, mask: CAT.GROUND | CAT.BEAM | CAT.VEHICLE },
    });
    Body.setMass(body, wave.mass);
    Body.setInertia(body, Infinity); // keeps the car upright — no tumbling/rolling from collisions
    Body.setVelocity(body, { x: wave.speed, y: 0 });
    World.add(engine.world, body);
    vehicles.push({
      body, wave: idx, state: 'active', color: wave.color, speed: wave.speed,
      w: wave.w, h: wave.h, wheelPhase: 0,
    });
  }
}

function stepVehicles() {
  let waveDone = true;
  for (const v of vehicles) {
    if (v.state !== 'active') continue;
    Body.setVelocity(v.body, { x: v.speed, y: v.body.velocity.y });
    Body.setAngle(v.body, 0);
    Body.setAngularVelocity(v.body, 0);
    v.wheelPhase += v.speed * 0.35;

    if (v.body.position.y > GROUND_Y + 260) {
      v.state = 'fallen';
      triggerLoss(WAVES[v.wave].label);
      return;
    }
    if (v.body.position.x > W + 60) {
      v.state = 'done';
      World.remove(engine.world, v.body);
    }
  }
  for (const v of vehicles) {
    if (v.wave === waveIndex && v.state === 'active') waveDone = false;
  }
  if (waveDone) {
    if (waveIndex >= WAVES.length - 1) {
      mode = 'won';
      refreshHUD();
    } else {
      waveIndex++;
      waveTimer = 110;
    }
  }
}

function triggerLoss(label) {
  mode = 'lost';
  losingWaveLabel = label;
  refreshHUD();
}

// ============================================================
// Reset
// ============================================================
function resetGame() {
  engine = null;
  jointBodies.clear();
  beamPhys.clear();
  vehicles = [];
  waveIndex = 0;
  mode = 'build';
  initJoints();
  refreshHUD();
}

// ============================================================
// Rendering
// ============================================================
function loop() {
  if (mode === 'simulating') simulationStep();
  draw();
  requestAnimationFrame(loop);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawGrid();
  drawTerrain();
  drawSpanDimension();

  if (mode === 'build') {
    drawAnchors();
    drawBeamsBuildMode();
    drawJointsBuildMode();
    if (drag) drawDragLine();
  } else {
    drawBeamsPhysics();
    drawVehicles();
  }
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 25) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 25) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain() {
  // Chasm water/void
  ctx.fillStyle = '#04203b';
  ctx.fillRect(CHASM_LEFT, GROUND_Y, CHASM_RIGHT - CHASM_LEFT, H - GROUND_Y);

  // Cliffs
  ctx.fillStyle = '#3a4a52';
  ctx.fillRect(0, GROUND_Y, CHASM_LEFT, H - GROUND_Y);
  ctx.fillRect(CHASM_RIGHT, GROUND_Y, W - CHASM_RIGHT, H - GROUND_Y);

  // Hatch lines (blueprint cross-hatch on rock)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = -H; i < CHASM_LEFT + H; i += 14) {
    ctx.beginPath(); ctx.moveTo(i, GROUND_Y); ctx.lineTo(i + (H - GROUND_Y), H); ctx.stroke();
  }
  for (let i = CHASM_RIGHT - H; i < W + H; i += 14) {
    ctx.beginPath(); ctx.moveTo(i, GROUND_Y); ctx.lineTo(i + (H - GROUND_Y), H); ctx.stroke();
  }

  // Road edge lines
  ctx.strokeStyle = '#cfe3ee';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(CHASM_LEFT, GROUND_Y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CHASM_RIGHT, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
}

function drawSpanDimension() {
  if (mode !== 'build') return;
  const y = GROUND_Y + 95;
  ctx.save();
  ctx.strokeStyle = '#7fa8c9';
  ctx.fillStyle = '#7fa8c9';
  ctx.font = '12px "IBM Plex Mono", monospace';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CHASM_LEFT, y); ctx.lineTo(CHASM_RIGHT, y); ctx.stroke();
  [CHASM_LEFT, CHASM_RIGHT].forEach(x => {
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke();
  });
  const meters = ((CHASM_RIGHT - CHASM_LEFT) * METERS_PER_PIXEL).toFixed(0);
  ctx.textAlign = 'center';
  ctx.fillText(`SPAN: ${meters} m`, (CHASM_LEFT + CHASM_RIGHT) / 2, y + 18);
  ctx.restore();
}

function drawAnchors() {
  for (const a of FIXED_ANCHORS) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(232,163,61,0.25)';
    ctx.arc(a.x, a.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = '#e8a33d';
    ctx.arc(a.x, a.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#16212c';
    ctx.stroke();
  }
}

function drawJointsBuildMode() {
  for (const j of joints) {
    if (j.fixed) continue;

    // Warn if this free joint is suspiciously close to an anchor but not
    // actually snapped to it — likely an accidental near-miss.
    const nearMiss = FIXED_ANCHORS.some(a => dist(j.x, j.y, a.x, a.y) < 45);
    if (nearMiss) {
      ctx.beginPath();
      ctx.strokeStyle = '#d4483a';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.arc(j.x, j.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.fillStyle = '#f2ecdd';
    ctx.arc(j.x, j.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#16212c';
    ctx.stroke();
  }
}

function drawBeamsBuildMode() {
  for (const b of beams) {
    const a = jointById(b.aId), c = jointById(b.bId);
    if (!a || !c) continue;
    const material = MATERIALS[b.material];
    ctx.lineWidth = material.thickness;
    ctx.strokeStyle = material.color;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = material.dark;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  }
}

function drawDragLine() {
  const start = drag.from || pressDownPos;
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = MATERIALS[activeMaterial].thickness;
  ctx.strokeStyle = MATERIALS[activeMaterial].color;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(drag.x, drag.y);
  ctx.stroke();
  ctx.restore();

  const snap = findNearestJoint(drag.x, drag.y, SNAP_RADIUS);
  if (snap) {
    ctx.beginPath();
    ctx.strokeStyle = '#49b07d';
    ctx.lineWidth = 2;
    ctx.arc(snap.x, snap.y, SNAP_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBeamsPhysics() {
  for (const [, bp] of beamPhys) {
    if (bp.broken) continue;
    const { skin, material, stress = 0, len } = bp;
    ctx.save();
    ctx.translate(skin.position.x, skin.position.y);
    ctx.rotate(skin.angle);
    const half = len / 2;
    ctx.fillStyle = stressColor(stress, material.color);
    ctx.fillRect(-half, -material.thickness / 2, half * 2, material.thickness);
    ctx.restore();
  }
}

function stressColor(stress, baseColor) {
  if (stress < 0.55) return baseColor;
  const t = Math.min(1, (stress - 0.55) / 0.45);
  const r1 = 232, g1 = 163, b1 = 61;   // amber
  const r2 = 212, g2 = 72, b2 = 58;    // red
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

function drawVehicles() {
  for (const v of vehicles) {
    if (v.state !== 'active') continue;
    const b = v.body;
    const w = v.w, h = v.h;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    // angle is locked to 0, but keep using it in case that ever changes
    ctx.rotate(b.angle);

    // --- wheels (drawn first, so the body sits on top) ---
    const wheelR = Math.max(5, h * 0.32);
    const wheelY = h / 2 - wheelR * 0.5;
    const wheelXs = [-w / 2 + wheelR + 2, w / 2 - wheelR - 2];
    for (const wx of wheelXs) {
      ctx.save();
      ctx.translate(wx, wheelY);
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath(); ctx.arc(0, 0, wheelR, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(v.wheelPhase);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5;
      for (let s = 0; s < 4; s++) {
        const a = (Math.PI / 2) * s;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * wheelR * 0.8, Math.sin(a) * wheelR * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- body ---
    const r = Math.min(6, h * 0.3);
    roundedRect(-w / 2, -h / 2, w, h, r);
    ctx.fillStyle = v.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // --- cab / windshield band toward the front (direction of travel: +x) ---
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const cabW = w * 0.32;
    roundedRect(w / 2 - cabW - w * 0.08, -h / 2 + 2, cabW, h - 4, r * 0.7);
    ctx.fill();

    // --- headlight ---
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(w / 2 - 2, 0, Math.max(2, h * 0.08), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============================================================
// HUD
// ============================================================
const el = {
  budget: document.getElementById('hud-budget'),
  spent: document.getElementById('hud-spent'),
  wave: document.getElementById('hud-wave'),
  testBtn: document.getElementById('btn-test'),
  resetBtn: document.getElementById('btn-reset'),
  banner: document.getElementById('banner'),
  bannerTitle: document.getElementById('banner-title'),
  bannerBody: document.getElementById('banner-body'),
  bannerBtn: document.getElementById('banner-btn'),
  instructions: document.getElementById('instructions'),
};

function refreshHUD() {
  const remaining = BUDGET - totalCost;
  el.spent.textContent = `$${Math.round(totalCost).toLocaleString()}`;
  el.budget.textContent = `$${Math.round(remaining).toLocaleString()}`;
  el.budget.classList.toggle('over', remaining < 0);

  if (mode === 'build') {
    el.wave.textContent = `Ready — ${WAVES.length} waves ahead`;
    el.instructions.textContent = 'Drag from an anchor (amber bolt) or beam end to draw a new beam. A red dashed ring means that joint isn\'t actually snapped to the anchor — drag it away and redraw. Click a beam to delete it.';
  } else if (mode === 'simulating') {
    el.wave.textContent = WAVES[waveIndex].label;
    el.instructions.textContent = `Incoming: ${WAVES[waveIndex].kg} vehicles. Watch the stress colors — red means about to snap.`;
  }

  el.testBtn.disabled = mode !== 'build';
  el.resetBtn.disabled = mode === 'build' && beams.length === 0 && totalCost === 0;

  if (mode === 'won') {
    showBanner('🏗️ Bridge held under every wave!', `Total cost: $${Math.round(totalCost).toLocaleString()} of your $${BUDGET.toLocaleString()} budget. Nicely engineered.`);
  } else if (mode === 'lost') {
    showBanner('💥 Bridge failure', `It gave way during ${losingWaveLabel}. Try reinforcing the weak span with steel or adding more support beams.`);
  } else {
    hideBanner();
  }
}

function showBanner(title, body) {
  el.bannerTitle.textContent = title;
  el.bannerBody.textContent = body;
  el.banner.classList.add('visible');
}
function hideBanner() { el.banner.classList.remove('visible'); }
function flashMessage(msg) {
  el.instructions.textContent = msg;
  setTimeout(refreshHUD, 2200);
}

el.testBtn.addEventListener('click', startSimulation);
el.resetBtn.addEventListener('click', resetGame);
el.bannerBtn.addEventListener('click', resetGame);

document.querySelectorAll('.material-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.material-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    activeMaterial = card.dataset.material;
  });
});

refreshHUD();
