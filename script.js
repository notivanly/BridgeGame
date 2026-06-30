/* ============================================================
   LOAD LIMIT — Bridge Engineering Lab
   Custom Verlet constraint simulation — no Matter.js for structure
   ============================================================ */

// ---------- Canvas & world geometry ----------
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const W = 1000, H = 560;
const GROUND_Y = 420;
const CHASM_LEFT = 260;
const CHASM_RIGHT = 740;
const METERS_PER_PIXEL = 0.05;
const SNAP_RADIUS = 30;

const FIXED_ANCHORS = [
  { x: CHASM_LEFT,  y: GROUND_Y + 5 },
  { x: CHASM_LEFT,  y: GROUND_Y + 60 },
  { x: CHASM_RIGHT, y: GROUND_Y + 5 },
  { x: CHASM_RIGHT, y: GROUND_Y + 60 },
];

// ---------- Materials ----------
// maxStrain: fraction of rest length a beam can stretch before snapping
const MATERIALS = {
  wood: {
    key:'wood', name:'Wood', color:'#c89a64', dark:'#8a6239',
    costPerMeter:14, thickness:8, sagBreak:3,
    strength:2, weight:1, note:'Cheap & light. Snaps under heavy loads.'
  },
  steel: {
    key:'steel', name:'Steel', color:'#a9bdce', dark:'#5d6e7c',
    costPerMeter:135, thickness:7, sagBreak:22,
    strength:5, weight:3, note:'Strongest by far. Expensive and heavy.'
  },
  concrete: {
    key:'concrete', name:'Concrete', color:'#b3b1a6', dark:'#76746c',
    costPerMeter:68, thickness:11, sagBreak:9,
    strength:3, weight:5, note:'Decent strength, but very heavy on long spans.'
  },
};

// ---------- Vehicle types ----------
const VEHICLE_TYPES = {
  sedan: { label:'Sedan',     kg:1400,  force:0.8,  w:46,  h:20, color:'#3b6ea5', speed:2.8, emoji:'🚗' },
  van:   { label:'Van',       kg:2800,  force:1.6,  w:56,  h:26, color:'#3b8a5a', speed:2.5, emoji:'🚐' },
  truck: { label:'Box Truck', kg:9000,  force:4.5,  w:76,  h:36, color:'#c97a2b', speed:2.1, emoji:'🚚' },
  semi:  { label:'Semi',      kg:18000, force:9.0,  w:104, h:42, color:'#a23b3b', speed:1.7, emoji:'🚛' },
  tank:  { label:'Tank',      kg:60000, force:28.0, w:120, h:48, color:'#5a4a2a', speed:1.2, emoji:'🪖' },
};

const BUDGET = 500000;

// Verlet simulation constants
const GRAVITY      = 0.2;
const DAMPING      = 0.96;
const ITERATIONS   = 8;
const SETTLE_TOTAL = 120;

// ---------- Build state ----------
let joints = [], beams = [], nextId = 1, totalCost = 0, activeMaterial = 'wood';

// ---------- Simulation state ----------
let simJoints = [];  // {x, y, px, py, fixed}
let simBeams  = [];  // {ai, bi, restLen, material, broken, stress}
let vehicles  = [];  // {x, y, typeKey, wheelPhase, done}
let settleFrames = 0;
let totalLoadKg  = 0;
let mode = 'build';  // 'build' | 'simulating' | 'lost'
let drag = null, pressDownPos = null;

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
  const dpr = window.devicePixelRatio || 1;
  if (dpr > 1) {
    canvas.width  = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);
  }
}

// ============================================================
// Input
// ============================================================
canvas.style.touchAction = 'none';

canvas.addEventListener('pointerdown', e => {
  if (mode !== 'build') return;
  const p = canvasPos(e);
  pressDownPos = p;
  drag = { from: findNearestJoint(p.x, p.y, SNAP_RADIUS), x: p.x, y: p.y };
});

canvas.addEventListener('pointermove', e => {
  if (mode !== 'build' || !drag) return;
  const p = canvasPos(e);
  drag.x = p.x; drag.y = p.y;
});

canvas.addEventListener('pointerup', e => {
  if (mode !== 'build' || !drag) { drag = null; return; }
  const p = canvasPos(e);
  const moved = dist(p.x, p.y, pressDownPos.x, pressDownPos.y) > 6;

  if (!moved) {
    if (activeMaterial === 'screw') {
      // Screw tool: click on a beam to place a junction point, splitting it
      const hit = findBeamNear(p.x, p.y, 10);
      if (hit) {
        splitBeamAt(hit, p.x, p.y);
      } else {
        flashMessage('Click directly on a beam to place a junction screw.');
      }
    } else {
      // Normal tool: click to delete beam under cursor
      const hit = findBeamNear(p.x, p.y, 7);
      if (hit) removeBeam(hit.id);
    }
    drag = null; return;
  }

  if (activeMaterial === 'screw') { drag = null; return; } // screw only places, doesn't draw

  const fromJoint = drag.from || addJoint(pressDownPos.x, pressDownPos.y, false);
  const toJoint   = findNearestJoint(p.x, p.y, SNAP_RADIUS) || addJoint(p.x, p.y, false);
  if (fromJoint.id !== toJoint.id && !beamExists(fromJoint.id, toJoint.id))
    addBeam(fromJoint, toJoint, activeMaterial);
  drag = null;
});

canvas.addEventListener('pointerleave', () => { drag = null; });

function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}

// Split a beam at the closest point to (x, y), creating a new joint there
// and replacing the original beam with two shorter ones of the same material.
function splitBeamAt(beam, x, y) {
  const a = jointById(beam.aId), b = jointById(beam.bId);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy || 1;
  // Clamp t away from the very ends so we don't create zero-length segments
  const t = Math.max(0.08, Math.min(0.92, ((x-a.x)*dx + (y-a.y)*dy) / len2));
  const sx = a.x + t*dx, sy = a.y + t*dy;
  const mat = beam.material;
  // Remove the original beam (cost refunded) then add two replacements
  removeBeam(beam.id);
  const newJoint = addJoint(sx, sy, false);
  addBeam(a, newJoint, mat);
  addBeam(newJoint, b, mat);
  return newJoint;
}

// ============================================================
// Build helpers
// ============================================================
function addJoint(x, y, fixed) { const j={id:nextId++,x,y,fixed}; joints.push(j); return j; }

function addBeam(a, b, materialKey) {
  const material = MATERIALS[materialKey];
  const length = dist(a.x, a.y, b.x, b.y);
  const cost = length * METERS_PER_PIXEL * material.costPerMeter;
  beams.push({ id: nextId++, aId: a.id, bId: b.id, material: materialKey, length });
  totalCost += cost;
  refreshHUD();
}

function removeBeam(beamId) {
  const b = beams.find(b => b.id === beamId); if (!b) return;
  totalCost -= b.length * METERS_PER_PIXEL * MATERIALS[b.material].costPerMeter;
  beams = beams.filter(x => x.id !== beamId);
  joints = joints.filter(j => j.fixed || beams.some(bm => bm.aId===j.id || bm.bId===j.id));
  refreshHUD();
}

function beamExists(aId, bId) {
  return beams.some(b => (b.aId===aId&&b.bId===bId)||(b.aId===bId&&b.bId===aId));
}
function findNearestJoint(x, y, radius) {
  let best=null, bestD=radius;
  for (const j of joints) { const d=dist(x,y,j.x,j.y); if(d<=bestD){best=j;bestD=d;} }
  return best;
}
function findBeamNear(x, y, tol) {
  let best=null, bestD=tol;
  for (const b of beams) {
    const a=jointById(b.aId), c=jointById(b.bId); if(!a||!c) continue;
    const d=distToSegment(x,y,a.x,a.y,c.x,c.y); if(d<bestD){best=b;bestD=d;}
  }
  return best;
}
function jointById(id) { return joints.find(j=>j.id===id); }
function dist(x1,y1,x2,y2) { return Math.hypot(x2-x1,y2-y1); }
function distToSegment(px,py,x1,y1,x2,y2) {
  const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy||1;
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2));
  return dist(px,py,x1+t*dx,y1+t*dy);
}

// ============================================================
// Simulation — pure Verlet constraint solver, no Matter.js
// ============================================================
function startSimulation() {
  if (beams.length === 0) { flashMessage('Build at least one beam first.'); return; }

  const jMap = new Map();
  simJoints = joints.map((j, i) => {
    jMap.set(j.id, i);
    return { x: j.x, y: j.y, px: j.x, py: j.y, fixed: !!j.fixed };
  });

  // Build beams first pass
  const rawBeams = beams.map(b => {
    const ai = jMap.get(b.aId), bi = jMap.get(b.bId);
    const sja = simJoints[ai], sjb = simJoints[bi];
    const restLen = Math.hypot(sjb.x - sja.x, sjb.y - sja.y);
    return { ai, bi, restLen, material: MATERIALS[b.material] };
  });

  // Subdivide every beam into segments with free intermediate joints.
  // Without this, a beam between two fixed anchors has zero free joints
  // and therefore zero degrees of freedom — it can never sag or break.
  const SEG_LEN = 38; // target max segment length (px)
  simBeams = [];
  for (const rb of rawBeams) {
    const sja = simJoints[rb.ai], sjb = simJoints[rb.bi];
    const nSegs = Math.max(2, Math.ceil(rb.restLen / SEG_LEN));
    const segLen = rb.restLen / nSegs;
    let prevIdx = rb.ai;
    for (let s = 1; s < nSegs; s++) {
      const t = s / nSegs;
      const x = sja.x + (sjb.x - sja.x) * t;
      const y = sja.y + (sjb.y - sja.y) * t;
      const newIdx = simJoints.length;
      simJoints.push({ x, y, px: x, py: y, fixed: false });
      simBeams.push({ ai: prevIdx, bi: newIdx, restLen: segLen, material: rb.material, broken: false, stress: 0 });
      prevIdx = newIdx;
    }
    simBeams.push({ ai: prevIdx, bi: rb.bi, restLen: segLen, material: rb.material, broken: false, stress: 0 });
  }

  vehicles = [];
  settleFrames = SETTLE_TOTAL;
  totalLoadKg = 0;
  mode = 'simulating';
  refreshHUD();
}

function simulationStep() {
  // 1. Verlet integrate free joints
  for (const sj of simJoints) {
    if (sj.fixed) continue;
    const vx = (sj.x - sj.px) * DAMPING;
    const vy = (sj.y - sj.py) * DAMPING;
    sj.px = sj.x; sj.py = sj.y;
    sj.x += vx;
    sj.y += vy + GRAVITY;
  }

  // 2. Apply vehicle load as downward impulse to nearby free joints
  if (settleFrames === 0) {
    for (const v of vehicles) {
      const type = VEHICLE_TYPES[v.typeKey];
      const affected = [];
      for (let i = 0; i < simJoints.length; i++) {
        const sj = simJoints[i];
        if (sj.fixed) continue;
        const dx = Math.abs(sj.x - v.x);
        const dy = sj.y - (GROUND_Y + 5);
        if (dx < type.w * 0.75 && dy > -10 && dy < 130) {
          const proximity = 1 - dx / (type.w * 0.75);
          affected.push({ i, proximity });
        }
      }
      if (affected.length > 0) {
        const totalW = affected.reduce((s, a) => s + a.proximity, 0);
        for (const { i, proximity } of affected) {
          simJoints[i].y += type.force * (proximity / totalW);
        }
      }
    }
  }

  // 3. Satisfy distance constraints
  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const sb of simBeams) {
      if (sb.broken) continue;
      const sja = simJoints[sb.ai], sjb = simJoints[sb.bi];
      const dx = sjb.x - sja.x, dy = sjb.y - sja.y;
      const currentLen = Math.hypot(dx, dy);
      if (currentLen < 0.001) continue;
      const diff = (currentLen - sb.restLen) / currentLen * 0.5;
      if (!sja.fixed && !sjb.fixed) {
        sja.x += dx * diff; sja.y += dy * diff;
        sjb.x -= dx * diff; sjb.y -= dy * diff;
      } else if (!sja.fixed) {
        sja.x += dx * diff * 2; sja.y += dy * diff * 2;
      } else if (!sjb.fixed) {
        sjb.x -= dx * diff * 2; sjb.y -= dy * diff * 2;
      }
    }
  }

  // 4. Break detection: measure how far each FREE joint has dropped below
  // its original Y (vertical sag). This is far more sensitive than measuring
  // tiny length changes in near-horizontal beams — those barely change length
  // even when the midpoint sags significantly.
  if (settleFrames > 0) {
    // During settling, record each free joint's resting Y as its baseline
    for (const sj of simJoints) {
      if (!sj.fixed) sj.baseY = sj.y;
    }
    settleFrames--;
  } else {
    for (const sb of simBeams) {
      if (sb.broken) continue;
      const sja = simJoints[sb.ai], sjb = simJoints[sb.bi];
      // Max sag of this beam's two endpoints below their settled baselines
      const sagA = sja.fixed ? 0 : Math.max(0, sja.y - (sja.baseY ?? sja.y));
      const sagB = sjb.fixed ? 0 : Math.max(0, sjb.y - (sjb.baseY ?? sjb.y));
      const sag = Math.max(sagA, sagB);
      // Break limit in pixels of sag (tuned per material)
      sb.stress = Math.min(1.4, sag / (sb.material.sagBreak * 0.7));
      if (sag > sb.material.sagBreak) {
        sb.broken = true;
        const midX = (sja.x + sjb.x) / 2;
        if (midX > CHASM_LEFT && midX < CHASM_RIGHT) {
          // Release both joints so the collapse cascades naturally
          if (!sja.fixed) { sja.px = sja.x; }
          if (!sjb.fixed) { sjb.px = sjb.x; }
          if (mode === 'simulating') triggerLoss(sb.material.name);
        }
      }
    }
  }

  // 5. Advance vehicles
  stepVehicles();
}

function spawnVehicle(typeKey) {
  if (mode !== 'simulating') return;
  const spawnOccupied = vehicles.some(v => v.x < 80);
  if (spawnOccupied) { flashMessage('Entry busy — try again in a moment.'); return; }
  const type = VEHICLE_TYPES[typeKey];
  vehicles.push({ x: -type.w/2, y: GROUND_Y - type.h/2 - 3, typeKey, wheelPhase: 0, done: false });
  refreshHUD();
}

function stepVehicles() {
  totalLoadKg = 0;
  for (const v of vehicles) {
    const type = VEHICLE_TYPES[v.typeKey];
    v.x += type.speed;
    v.wheelPhase += type.speed * 0.35;
    if (v.x > CHASM_LEFT && v.x < CHASM_RIGHT) totalLoadKg += type.kg;
    if (v.x > W + 80) v.done = true;
  }
  vehicles = vehicles.filter(v => !v.done);
}

function triggerLoss(materialName) {
  mode = 'lost';
  refreshHUD();
  showBanner('💥 Bridge Failure!', `A ${materialName} beam snapped under the load. Try adding diagonal bracing or upgrading your material.`);
}

function resetGame() {
  simJoints = []; simBeams = []; vehicles = [];
  totalLoadKg = 0; mode = 'build';
  initJoints(); refreshHUD();
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
    drawSimJoints();
    drawVehicles();
  }
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 25) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 25) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.restore();
}

function drawTerrain() {
  ctx.fillStyle = '#04203b';
  ctx.fillRect(CHASM_LEFT, GROUND_Y, CHASM_RIGHT - CHASM_LEFT, H - GROUND_Y);
  ctx.fillStyle = '#3a4a52';
  ctx.fillRect(0, GROUND_Y, CHASM_LEFT, H - GROUND_Y);
  ctx.fillRect(CHASM_RIGHT, GROUND_Y, W - CHASM_RIGHT, H - GROUND_Y);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  for (let i = -H; i < CHASM_LEFT + H; i += 14) { ctx.beginPath(); ctx.moveTo(i,GROUND_Y); ctx.lineTo(i+(H-GROUND_Y),H); ctx.stroke(); }
  for (let i = CHASM_RIGHT - H; i < W + H; i += 14) { ctx.beginPath(); ctx.moveTo(i,GROUND_Y); ctx.lineTo(i+(H-GROUND_Y),H); ctx.stroke(); }
  ctx.strokeStyle = '#cfe3ee'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0,GROUND_Y); ctx.lineTo(CHASM_LEFT,GROUND_Y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CHASM_RIGHT,GROUND_Y); ctx.lineTo(W,GROUND_Y); ctx.stroke();
}

function drawSpanDimension() {
  if (mode !== 'build') return;
  const y = GROUND_Y + 95;
  ctx.save();
  ctx.strokeStyle = '#7fa8c9'; ctx.fillStyle = '#7fa8c9';
  ctx.font = '12px "IBM Plex Mono", monospace'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CHASM_LEFT,y); ctx.lineTo(CHASM_RIGHT,y); ctx.stroke();
  [CHASM_LEFT, CHASM_RIGHT].forEach(x => { ctx.beginPath(); ctx.moveTo(x,y-6); ctx.lineTo(x,y+6); ctx.stroke(); });
  ctx.textAlign = 'center';
  ctx.fillText(`SPAN: ${((CHASM_RIGHT - CHASM_LEFT)*METERS_PER_PIXEL).toFixed(0)} m`, (CHASM_LEFT+CHASM_RIGHT)/2, y+18);
  ctx.restore();
}

function drawAnchors() {
  for (const a of FIXED_ANCHORS) {
    ctx.beginPath(); ctx.fillStyle = 'rgba(232,163,61,0.25)';
    ctx.arc(a.x, a.y, 12, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = '#e8a33d';
    ctx.arc(a.x, a.y, 7, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#16212c'; ctx.stroke();
  }
}

function drawJointsBuildMode() {
  for (const j of joints) {
    if (j.fixed) continue;
    const nearMiss = FIXED_ANCHORS.some(a => dist(j.x,j.y,a.x,a.y) < 45);
    if (nearMiss) {
      ctx.beginPath(); ctx.strokeStyle = '#d4483a'; ctx.lineWidth = 2;
      ctx.setLineDash([3,3]); ctx.arc(j.x,j.y,14,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.fillStyle = '#f2ecdd';
    ctx.arc(j.x, j.y, 5, 0, Math.PI*2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#16212c'; ctx.stroke();
  }
}

function drawBeamsBuildMode() {
  for (const b of beams) {
    const a = jointById(b.aId), c = jointById(b.bId); if (!a||!c) continue;
    const material = MATERIALS[b.material];
    ctx.lineWidth = material.thickness; ctx.strokeStyle = material.color; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(c.x,c.y); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = material.dark;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(c.x,c.y); ctx.stroke();
  }
}

function drawDragLine() {
  const start = drag.from ? { x: drag.from.x, y: drag.from.y }
              : drag.splitFrom ? closestPointOnBeam(drag.splitFrom, pressDownPos.x, pressDownPos.y)
              : pressDownPos;
  ctx.save(); ctx.setLineDash([6,5]);
  ctx.lineWidth = MATERIALS[activeMaterial].thickness;
  ctx.strokeStyle = MATERIALS[activeMaterial].color; ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(drag.x,drag.y); ctx.stroke();
  ctx.restore();
  const snapJ = findNearestJoint(drag.x, drag.y, SNAP_RADIUS);
  if (snapJ) {
    ctx.beginPath(); ctx.strokeStyle = '#49b07d'; ctx.lineWidth = 2;
    ctx.arc(snapJ.x, snapJ.y, SNAP_RADIUS, 0, Math.PI*2); ctx.stroke();
  } else {
    const snapB = findBeamNear(drag.x, drag.y, 10);
    if (snapB) {
      const pt = closestPointOnBeam(snapB, drag.x, drag.y);
      ctx.beginPath(); ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2;
      ctx.arc(pt.x, pt.y, 8, 0, Math.PI*2); ctx.stroke();
    }
  }
}

function closestPointOnBeam(beam, x, y) {
  const a = jointById(beam.aId), b = jointById(beam.bId);
  const dx = b.x-a.x, dy = b.y-a.y, len2 = dx*dx+dy*dy||1;
  const t = Math.max(0.08, Math.min(0.92, ((x-a.x)*dx+(y-a.y)*dy)/len2));
  return { x: a.x+t*dx, y: a.y+t*dy };
}

function drawBeamsPhysics() {
  for (const sb of simBeams) {
    const sja = simJoints[sb.ai], sjb = simJoints[sb.bi];
    const material = sb.material;
    ctx.save();
    const mx = (sja.x+sjb.x)/2, my = (sja.y+sjb.y)/2;
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(sjb.y-sja.y, sjb.x-sja.x));
    const half = sb.restLen / 2;
    if (sb.broken) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#d4483a';
    } else {
      ctx.fillStyle = stressColor(sb.stress, material.color);
    }
    ctx.fillRect(-half, -material.thickness/2, half*2, material.thickness);
    ctx.restore();
  }
}

function drawSimJoints() {
  for (const sj of simJoints) {
    if (sj.fixed) continue;
    ctx.beginPath(); ctx.fillStyle = 'rgba(242,236,221,0.5)';
    ctx.arc(sj.x, sj.y, 4, 0, Math.PI*2); ctx.fill();
  }
}

function stressColor(stress, baseColor) {
  if (stress < 0.45) return baseColor;
  const t = Math.min(1, (stress - 0.45) / 0.55);
  const r1=232,g1=163,b1=61, r2=212,g2=72,b2=58;
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

function drawVehicles() {
  for (const v of vehicles) {
    const type = VEHICLE_TYPES[v.typeKey];
    const w = type.w, h = type.h;
    const vx = v.x, vy = GROUND_Y - h/2 - 3;
    ctx.save(); ctx.translate(vx, vy);
    // Wheels
    const wheelR = Math.max(5, h*0.32);
    const wheelY = h/2 - wheelR*0.5;
    for (const wx of [-w/2+wheelR+2, w/2-wheelR-2]) {
      ctx.save(); ctx.translate(wx, wheelY);
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath(); ctx.arc(0,0,wheelR,0,Math.PI*2); ctx.fill();
      ctx.rotate(v.wheelPhase);
      ctx.strokeStyle='#555'; ctx.lineWidth=1.5;
      for (let s=0;s<4;s++){const a=(Math.PI/2)*s;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*wheelR*0.8,Math.sin(a)*wheelR*0.8);ctx.stroke();}
      ctx.restore();
    }
    // Body
    const r = Math.min(6,h*0.3);
    roundedRect(-w/2,-h/2,w,h,r);
    ctx.fillStyle = type.color; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.5; ctx.stroke();
    // Cab
    ctx.fillStyle='rgba(255,255,255,0.55)';
    roundedRect(w/2-w*0.32-w*0.08,-h/2+2,w*0.32,h-4,r*0.7); ctx.fill();
    // Headlight
    ctx.fillStyle='#fff3c4';
    ctx.beginPath(); ctx.arc(w/2-2,0,Math.max(2,h*0.08),0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

function roundedRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

// ============================================================
// HUD
// ============================================================
const el = {
  budget: document.getElementById('hud-budget'),
  spent:  document.getElementById('hud-spent'),
  wave:   document.getElementById('hud-wave'),
  testBtn: document.getElementById('btn-test'),
  resetBtn: document.getElementById('btn-reset'),
  banner: document.getElementById('banner'),
  bannerTitle: document.getElementById('banner-title'),
  bannerBody:  document.getElementById('banner-body'),
  bannerBtn:   document.getElementById('banner-btn'),
  instructions: document.getElementById('instructions'),
};

function refreshHUD() {
  const remaining = BUDGET - totalCost;
  el.spent.textContent  = `$${Math.round(totalCost).toLocaleString()}`;
  el.budget.textContent = `$${Math.round(remaining).toLocaleString()}`;
  el.budget.classList.toggle('over', remaining < 0);
  if (mode === 'build') {
    el.wave.textContent = 'Ready to test';
    if (activeMaterial === 'screw') {
      el.instructions.textContent = 'Click anywhere on a beam to place a junction point. Then switch to a material and draw from it.';
      canvas.style.cursor = 'crosshair';
    } else {
      el.instructions.textContent = 'Drag from a joint or anchor to draw a beam. Click a beam to delete it. Use the Screw tool to add junction points on existing beams.';
      canvas.style.cursor = 'crosshair';
    }
  } else if (mode === 'simulating') {
    el.wave.textContent = totalLoadKg > 0 ? `Bridge load: ${totalLoadKg.toLocaleString()} kg on span` : 'Span clear — spawn a vehicle below';
    el.instructions.textContent = 'Beams turn amber → red as stress builds. Spawn heavier vehicles to find your limit.';
  } else if (mode === 'lost') {
    el.wave.textContent = 'Bridge failed';
  }
  el.testBtn.disabled  = mode !== 'build';
  el.resetBtn.disabled = mode === 'build' && beams.length === 0;
  if (mode !== 'lost') hideBanner();
}

function showBanner(title, body) {
  el.bannerTitle.textContent = title;
  el.bannerBody.textContent  = body;
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
    refreshHUD();
  });
});

document.querySelectorAll('.spawn-btn').forEach(btn => {
  btn.addEventListener('click', () => spawnVehicle(btn.dataset.type));
});

refreshHUD();
