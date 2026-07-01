/* ============================================================
   LOAD LIMIT — Bridge Engineering Lab
   Full-featured: Verlet physics, undo, rating, levels,
   symmetry, slow-mo, collapse, leaderboard, wind/quake
   ============================================================ */

// ---------- Canvas ----------
const canvas = document.getElementById('stage');
const ctx    = canvas.getContext('2d');
const W = 1000, H = 560;
const GROUND_Y    = 420;
const METERS_PER_PIXEL = 0.05;
const SNAP_RADIUS = 30;

// ---------- Levels ----------
const LEVELS = [
  { id:0, name:'Narrow Gorge',   chasmLeft:310, chasmRight:690, budget:120000, desc:'Short span, tight budget. Master the basics.' },
  { id:1, name:'River Crossing', chasmLeft:260, chasmRight:740, budget:300000, desc:'Standard span. Use bracing to survive trucks.' },
  { id:2, name:'Grand Canyon',   chasmLeft:180, chasmRight:820, budget:500000, desc:'Wide gap. Only steel trusses will survive semis.' },
];
let currentLevel = 1;

function lvl() { return LEVELS[currentLevel]; }
function CHASM_LEFT()  { return lvl().chasmLeft;  }
function CHASM_RIGHT() { return lvl().chasmRight; }
function BUDGET()      { return lvl().budget;      }

function getAnchors() {
  return [
    { x:CHASM_LEFT(),  y:GROUND_Y+5  },
    { x:CHASM_LEFT(),  y:GROUND_Y+60 },
    { x:CHASM_RIGHT(), y:GROUND_Y+5  },
    { x:CHASM_RIGHT(), y:GROUND_Y+60 },
  ];
}

// ---------- Materials ----------
const MATERIALS = {
  wood:     { key:'wood',     name:'Wood',     color:'#c89a64', dark:'#8a6239', costPerMeter:14,  thickness:8,  sagBreak:3,  note:'Cheap & light. Snaps under heavy loads.' },
  steel:    { key:'steel',    name:'Steel',    color:'#a9bdce', dark:'#5d6e7c', costPerMeter:135, thickness:7,  sagBreak:22, note:'Strongest by far. Expensive and heavy.'  },
  concrete: { key:'concrete', name:'Concrete', color:'#b3b1a6', dark:'#76746c', costPerMeter:68,  thickness:11, sagBreak:9,  note:'Decent strength, very heavy on long spans.' },
};

// ---------- Vehicles ----------
const VEHICLE_TYPES = {
  sedan: { label:'Sedan',     kg:1400,  force:0.8,  w:46,  h:20, color:'#3b6ea5', speed:2.8, emoji:'🚗' },
  van:   { label:'Van',       kg:2800,  force:1.6,  w:56,  h:26, color:'#3b8a5a', speed:2.5, emoji:'🚐' },
  truck: { label:'Box Truck', kg:9000,  force:4.5,  w:76,  h:36, color:'#c97a2b', speed:2.1, emoji:'🚚' },
  semi:  { label:'Semi',      kg:18000, force:9.0,  w:104, h:42, color:'#a23b3b', speed:1.7, emoji:'🚛' },
  tank:  { label:'Tank',      kg:60000, force:28.0, w:120, h:48, color:'#5a4a2a', speed:1.2, emoji:'🪖' },
};

// ---------- Physics constants ----------
const GRAVITY      = 0.2;
const DAMPING      = 0.96;
const ITERATIONS   = 8;
const SETTLE_TOTAL = 120;

// ---------- Build state ----------
let joints=[], beams=[], nextId=1, totalCost=0, activeMaterial='wood';
let history = []; // undo stack: each entry is {joints, beams, totalCost}

// ---------- Sim state ----------
let simJoints=[], simBeams=[], vehicles=[];
let settleFrames=0, totalLoadKg=0;
let mode='build'; // 'build'|'simulating'|'lost'|'won'
let drag=null, pressDownPos=null;
let symmetryMode=false;
let slowMo=false;
let windActive=false, quakeActive=false;
let windTimer=0, quakeTimer=0;
let vehiclesCrossed=0, maxLoadSurvived=0;
let debrisParticles=[];
let frameCount=0;

// ---------- Leaderboard (localStorage) ----------
function lbKey() { return `lb_level_${currentLevel}`; }
function getLeaderboard() {
  try { return JSON.parse(localStorage.getItem(lbKey()) || '[]'); } catch(e) { return []; }
}
function saveScore(cost, maxKg) {
  const lb = getLeaderboard();
  lb.push({ cost, maxKg, date: new Date().toLocaleDateString() });
  lb.sort((a,b) => a.cost - b.cost);
  localStorage.setItem(lbKey(), JSON.stringify(lb.slice(0,10)));
}

initJoints();
resizeCanvasForDPR();
buildLevelUI();
requestAnimationFrame(loop);

// ============================================================
// Setup
// ============================================================
function initJoints() {
  joints = getAnchors().map(a=>({id:nextId++,x:a.x,y:a.y,fixed:true}));
  beams=[]; totalCost=0; history=[];
}

function resizeCanvasForDPR() {
  const dpr=window.devicePixelRatio||1;
  if(dpr>1){canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(dpr,dpr);}
}

function buildLevelUI() {
  const wrap = document.getElementById('level-tabs');
  if (!wrap) return;
  wrap.innerHTML = '';
  LEVELS.forEach((lv,i) => {
    const btn = document.createElement('button');
    btn.className = 'level-tab' + (i===currentLevel?' active':'');
    btn.textContent = lv.name;
    btn.addEventListener('click', () => {
      currentLevel = i;
      resetGame();
      buildLevelUI();
    });
    wrap.appendChild(btn);
  });
  const desc = document.getElementById('level-desc');
  if(desc) desc.textContent = lvl().desc;
}

// ============================================================
// Undo
// ============================================================
function pushHistory() {
  history.push({
    joints: JSON.parse(JSON.stringify(joints)),
    beams:  JSON.parse(JSON.stringify(beams)),
    totalCost,
  });
  if(history.length>50) history.shift();
}
function undoAction() {
  if(!history.length){flashMessage('Nothing to undo.');return;}
  const snap = history.pop();
  joints    = snap.joints;
  beams     = snap.beams;
  totalCost = snap.totalCost;
  nextId    = Math.max(...joints.map(j=>j.id), ...beams.map(b=>b.id), nextId) + 1;
  refreshHUD();
}

// ============================================================
// Input
// ============================================================
canvas.style.touchAction='none';

canvas.addEventListener('pointerdown', e=>{
  if(mode!=='build') return;
  const p=canvasPos(e);
  pressDownPos=p;
  if(activeMaterial==='screw'){
    const hit=findBeamNear(p.x,p.y,20);
    if(hit){pushHistory();const j=splitBeamAt(hit,p.x,p.y);j.isScrew=true;}
    else flashMessage('Click directly on a beam to place a junction.');
    drag=null; return;
  }
  drag={from:findNearestJoint(p.x,p.y,SNAP_RADIUS),x:p.x,y:p.y};
});
canvas.addEventListener('pointermove',e=>{
  if(mode!=='build'||!drag) return;
  const p=canvasPos(e); drag.x=p.x; drag.y=p.y;
});
canvas.addEventListener('pointerup',e=>{
  if(mode!=='build'||!drag){drag=null;return;}
  const p=canvasPos(e);
  const moved=dist(p.x,p.y,pressDownPos.x,pressDownPos.y)>6;
  if(!moved){
    const hit=findBeamNear(p.x,p.y,7);
    if(hit){pushHistory();removeBeam(hit.id);}
    drag=null; return;
  }
  const from=drag.from||addJoint(pressDownPos.x,pressDownPos.y,false);
  let to=findNearestJoint(p.x,p.y,SNAP_RADIUS)||addJoint(p.x,p.y,false);
  if(from.id!==to.id&&!beamExists(from.id,to.id)){
    pushHistory();
    addBeam(from,to,activeMaterial);
    if(symmetryMode){
      // Mirror across span center
      const cx=(CHASM_LEFT()+CHASM_RIGHT())/2;
      const mFrom=mirrorJoint(from,cx), mTo=mirrorJoint(to,cx);
      if(mFrom.id!==mTo.id&&!beamExists(mFrom.id,mTo.id))
        addBeam(mFrom,mTo,activeMaterial);
    }
  }
  drag=null;
});
canvas.addEventListener('pointerleave',()=>{drag=null;});

function mirrorJoint(j,cx){
  const mx=cx+(cx-j.x), my=j.y;
  const existing=findNearestJoint(mx,my,10);
  if(existing) return existing;
  return addJoint(mx,my,false);
}

function canvasPos(e){
  const r=canvas.getBoundingClientRect();
  return{x:(e.clientX-r.left)*(W/r.width),y:(e.clientY-r.top)*(H/r.height)};
}

// ============================================================
// Build helpers
// ============================================================
function addJoint(x,y,fixed){const j={id:nextId++,x,y,fixed};joints.push(j);return j;}
function addBeam(a,b,matKey){
  const mat=MATERIALS[matKey], len=dist(a.x,a.y,b.x,b.y);
  beams.push({id:nextId++,aId:a.id,bId:b.id,material:matKey,length:len});
  totalCost+=len*METERS_PER_PIXEL*mat.costPerMeter;
  refreshHUD();
}
function removeBeam(beamId){
  const b=beams.find(b=>b.id===beamId); if(!b) return;
  totalCost-=b.length*METERS_PER_PIXEL*MATERIALS[b.material].costPerMeter;
  beams=beams.filter(x=>x.id!==beamId);
  joints=joints.filter(j=>j.fixed||beams.some(bm=>bm.aId===j.id||bm.bId===j.id));
  refreshHUD();
}
function beamExists(aId,bId){return beams.some(b=>(b.aId===aId&&b.bId===bId)||(b.aId===bId&&b.bId===aId));}
function findNearestJoint(x,y,r){let best=null,bestD=r;for(const j of joints){const d=dist(x,y,j.x,j.y);if(d<bestD){best=j;bestD=d;}}return best;}
function findBeamNear(x,y,tol){let best=null,bestD=tol;for(const b of beams){const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c)continue;const d=distToSegment(x,y,a.x,a.y,c.x,c.y);if(d<bestD){best=b;bestD=d;}}return best;}
function jointById(id){return joints.find(j=>j.id===id);}
function dist(x1,y1,x2,y2){return Math.hypot(x2-x1,y2-y1);}
function distToSegment(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,len2=dx*dx+dy*dy||1;const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/len2));return dist(px,py,x1+t*dx,y1+t*dy);}
function splitBeamAt(beam,x,y){
  const a=jointById(beam.aId),b=jointById(beam.bId);
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy||1;
  const t=Math.max(0.08,Math.min(0.92,((x-a.x)*dx+(y-a.y)*dy)/len2));
  const mat=beam.material;
  removeBeam(beam.id);
  const nj=addJoint(a.x+t*dx,a.y+t*dy,false);
  addBeam(a,nj,mat); addBeam(nj,b,mat);
  return nj;
}

// ============================================================
// Verlet Simulation
// ============================================================
function startSimulation(){
  if(beams.length===0){flashMessage('Build at least one beam first.');return;}
  const jMap=new Map();
  simJoints=joints.map((j,i)=>{jMap.set(j.id,i);return{x:j.x,y:j.y,px:j.x,py:j.y,fixed:!!j.fixed};});
  const SEG_LEN=38;
  simBeams=[];
  for(const rb of beams){
    const ai=jMap.get(rb.aId),bi=jMap.get(rb.bId);
    const sja=simJoints[ai],sjb=simJoints[bi];
    const nSegs=Math.max(2,Math.ceil(Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/SEG_LEN));
    const segLen=Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/nSegs;
    let prev=ai;
    for(let s=1;s<nSegs;s++){
      const t=s/nSegs;
      const ni=simJoints.length;
      simJoints.push({x:sja.x+(sjb.x-sja.x)*t,y:sja.y+(sjb.y-sja.y)*t,px:sja.x+(sjb.x-sja.x)*t,py:sja.y+(sjb.y-sja.y)*t,fixed:false});
      simBeams.push({ai:prev,bi:ni,restLen:segLen,material:MATERIALS[rb.material],broken:false,stress:0});
      prev=ni;
    }
    simBeams.push({ai:prev,bi:bi,restLen:segLen,material:MATERIALS[rb.material],broken:false,stress:0});
  }
  vehicles=[]; settleFrames=SETTLE_TOTAL; totalLoadKg=0;
  vehiclesCrossed=0; maxLoadSurvived=0; debrisParticles=[];
  windActive=false; quakeActive=false; windTimer=0; quakeTimer=0;
  mode='simulating'; refreshHUD();
}

function simulationStep(){
  frameCount++;
  // Wind & quake timers
  if(windActive){windTimer--;if(windTimer<=0)windActive=false;}
  if(quakeActive){quakeTimer--;if(quakeTimer<=0)quakeActive=false;}

  // 1. Verlet integrate
  for(const sj of simJoints){
    if(sj.fixed) continue;
    let vx=(sj.x-sj.px)*DAMPING, vy=(sj.y-sj.py)*DAMPING;
    sj.px=sj.x; sj.py=sj.y;
    if(windActive)  vx+=0.18*Math.sin(frameCount*0.05);
    if(quakeActive){vx+=0.35*(Math.random()-0.5)*2; vy+=0.15*(Math.random()-0.5);}
    sj.x+=vx; sj.y+=vy+GRAVITY;
  }

  // 2. Vehicle load
  if(settleFrames===0){
    for(const v of vehicles){
      const type=VEHICLE_TYPES[v.typeKey];
      const affected=[];
      for(let i=0;i<simJoints.length;i++){
        const sj=simJoints[i]; if(sj.fixed) continue;
        const dx=Math.abs(sj.x-v.x),dy=sj.y-(GROUND_Y+5);
        if(dx<type.w*0.75&&dy>-10&&dy<130) affected.push({i,prox:1-dx/(type.w*0.75)});
      }
      if(affected.length){
        const tw=affected.reduce((s,a)=>s+a.prox,0);
        for(const{i,prox}of affected) simJoints[i].y+=type.force*(prox/tw);
      }
    }
  }

  // 3. Constraints
  for(let iter=0;iter<ITERATIONS;iter++){
    for(const sb of simBeams){
      if(sb.broken) continue;
      const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
      const dx=sjb.x-sja.x,dy=sjb.y-sja.y,cur=Math.hypot(dx,dy);
      if(cur<0.001) continue;
      const diff=(cur-sb.restLen)/cur*0.5;
      if(!sja.fixed&&!sjb.fixed){sja.x+=dx*diff;sja.y+=dy*diff;sjb.x-=dx*diff;sjb.y-=dy*diff;}
      else if(!sja.fixed){sja.x+=dx*diff*2;sja.y+=dy*diff*2;}
      else if(!sjb.fixed){sjb.x-=dx*diff*2;sjb.y-=dy*diff*2;}
    }
  }

  // 4. Break detection
  if(settleFrames>0){
    for(const sj of simJoints) if(!sj.fixed) sj.baseY=sj.y;
    settleFrames--;
  } else {
    for(const sb of simBeams){
      if(sb.broken) continue;
      const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
      const sagA=sja.fixed?0:Math.max(0,sja.y-(sja.baseY??sja.y));
      const sagB=sjb.fixed?0:Math.max(0,sjb.y-(sjb.baseY??sjb.y));
      const sag=Math.max(sagA,sagB);
      sb.stress=Math.min(1.4,sag/(sb.material.sagBreak*0.7));
      if(sag>sb.material.sagBreak){
        sb.broken=true;
        // Spawn debris particles at break point
        const bx=(sja.x+sjb.x)/2,by=(sja.y+sjb.y)/2;
        for(let i=0;i<6;i++) debrisParticles.push({x:bx,y:by,vx:(Math.random()-0.5)*4,vy:-Math.random()*3-1,life:40,color:sb.material.color});
        const midX=bx;
        if(midX>CHASM_LEFT()&&midX<CHASM_RIGHT()&&mode==='simulating')
          triggerLoss(sb.material.name);
      }
    }
  }

  // 5. Debris
  for(const d of debrisParticles){d.x+=d.vx;d.y+=d.vy;d.vy+=0.3;d.life--;}
  debrisParticles=debrisParticles.filter(d=>d.life>0);

  // 6. Vehicles
  stepVehicles();
}

function getBridgeSurfaceY(vx){
  let sy=null;
  for(const sb of simBeams){
    if(sb.broken) continue;
    const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
    const minX=Math.min(sja.x,sjb.x),maxX=Math.max(sja.x,sjb.x);
    if(vx<minX||vx>maxX) continue;
    const t=(vx-sja.x)/(sjb.x-sja.x||0.001);
    const beamY=sja.y+t*(sjb.y-sja.y);
    if(beamY>GROUND_Y-80&&beamY<GROUND_Y+80)
      if(sy===null||beamY<sy) sy=beamY;
  }
  return sy;
}

function spawnVehicle(typeKey){
  if(mode!=='simulating') return;
  if(vehicles.some(v=>v.x<80)){flashMessage('Entry busy — wait a moment.');return;}
  const type=VEHICLE_TYPES[typeKey];
  vehicles.push({x:-type.w/2,y:GROUND_Y,vy:0,typeKey,wheelPhase:0,done:false});
  refreshHUD();
}

function stepVehicles(){
  totalLoadKg=0;
  for(const v of vehicles){
    const type=VEHICLE_TYPES[v.typeKey];
    v.x+=type.speed*(slowMo?0.25:1);
    v.wheelPhase+=type.speed*0.35*(slowMo?0.25:1);
    const onLeft=v.x<=CHASM_LEFT(), onRight=v.x>=CHASM_RIGHT();
    if(onLeft||onRight){v.y=GROUND_Y;v.vy=0;}
    else{
      const sy=getBridgeSurfaceY(v.x);
      if(sy!==null&&v.y>=sy){v.y=sy;v.vy=0;totalLoadKg+=type.kg;}
      else{v.vy+=0.6;v.y+=v.vy;}
    }
    if(v.y>H+60){
      v.done=true;
      if(v.x>CHASM_LEFT()&&v.x<CHASM_RIGHT()&&mode==='simulating')
        triggerLoss('bridge collapsed — vehicle fell');
    }
    if(v.x>CHASM_RIGHT()+20&&v.y<=GROUND_Y+5&&!v.counted){
      v.counted=true; vehiclesCrossed++;
      maxLoadSurvived=Math.max(maxLoadSurvived,type.kg);
    }
    if(v.x>W+80) v.done=true;
  }
  vehicles=vehicles.filter(v=>!v.done);
}

function triggerLoss(reason){
  if(mode!=='simulating') return;
  mode='lost';
  const grade=calcGrade();
  refreshHUD();
  showBanner('💥 Bridge Failure',
    `Cause: ${reason}.\n\nYour bridge survived ${vehiclesCrossed} vehicle(s) and up to ${maxLoadSurvived.toLocaleString()} kg.\n\nCost: $${Math.round(totalCost).toLocaleString()} · Grade: ${grade}`,
    false);
}

function triggerWin(){
  if(mode!=='simulating') return;
  mode='won';
  const grade=calcGrade();
  saveScore(Math.round(totalCost), maxLoadSurvived);
  refreshHUD();
  showBanner('🏗️ Bridge Survived!',
    `All vehicles crossed!\n\nCost: $${Math.round(totalCost).toLocaleString()} · Max load: ${maxLoadSurvived.toLocaleString()} kg\n\nGrade: ${grade}`,
    true);
}

function calcGrade(){
  const budget=BUDGET();
  const ratio=totalCost/budget;
  const hasStress=simBeams.some(sb=>sb.stress>0.8);
  if(ratio<0.25&&!hasStress) return'A+';
  if(ratio<0.35) return'A';
  if(ratio<0.5)  return'B';
  if(ratio<0.7)  return'C';
  if(ratio<0.9)  return'D';
  return'F';
}

function resetGame(){
  simJoints=[];simBeams=[];vehicles=[];debrisParticles=[];
  totalLoadKg=0;vehiclesCrossed=0;maxLoadSurvived=0;
  windActive=false;quakeActive=false;slowMo=false;
  mode='build';
  initJoints();refreshHUD();hideBanner();
}

// ============================================================
// Rendering
// ============================================================
function loop(){
  if(mode==='simulating') simulationStep();
  draw();
  requestAnimationFrame(loop);
}

function draw(){
  ctx.clearRect(0,0,W,H);
  drawSky();
  drawTerrain();
  if(mode==='build'){
    drawSpanDimension();
    drawAnchors();
    drawBeamsBuildMode();
    drawJointsBuildMode();
    if(drag) drawDragLine();
  } else {
    drawBeamsPhysics();
    drawSimJoints();
    drawDebris();
    drawVehicles();
    drawWindQuakeOverlay();
  }
}

function drawSky(){
  // Subtle gradient sky
  const grad=ctx.createLinearGradient(0,0,0,GROUND_Y);
  grad.addColorStop(0,'#071828');
  grad.addColorStop(1,'#0a3158');
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,W,H);
  // grid
  ctx.strokeStyle='rgba(255,255,255,0.045)';ctx.lineWidth=1;
  for(let x=0;x<=W;x+=25){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}

function drawTerrain(){
  // Chasm with water ripple
  const waterGrad=ctx.createLinearGradient(0,GROUND_Y,0,H);
  waterGrad.addColorStop(0,'#04203b');
  waterGrad.addColorStop(1,'#03152a');
  ctx.fillStyle=waterGrad;
  ctx.fillRect(CHASM_LEFT(),GROUND_Y,CHASM_RIGHT()-CHASM_LEFT(),H-GROUND_Y);
  // Water shimmer
  ctx.strokeStyle='rgba(100,160,220,0.15)';ctx.lineWidth=1;
  for(let i=0;i<5;i++){
    const wy=GROUND_Y+60+i*40+Math.sin(frameCount*0.03+i)*4;
    ctx.beginPath();ctx.moveTo(CHASM_LEFT(),wy);ctx.lineTo(CHASM_RIGHT(),wy);ctx.stroke();
  }
  // Cliffs
  ctx.fillStyle='#3a4a52';
  ctx.fillRect(0,GROUND_Y,CHASM_LEFT(),H-GROUND_Y);
  ctx.fillRect(CHASM_RIGHT(),GROUND_Y,W-CHASM_RIGHT(),H-GROUND_Y);
  // Hatch
  ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;
  for(let i=-H;i<CHASM_LEFT()+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  for(let i=CHASM_RIGHT()-H;i<W+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  // Road edges
  ctx.strokeStyle='#cfe3ee';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,GROUND_Y);ctx.lineTo(CHASM_LEFT(),GROUND_Y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(CHASM_RIGHT(),GROUND_Y);ctx.lineTo(W,GROUND_Y);ctx.stroke();
}

function drawSpanDimension(){
  const y=GROUND_Y+95;
  ctx.save();ctx.strokeStyle='#7fa8c9';ctx.fillStyle='#7fa8c9';
  ctx.font='12px "IBM Plex Mono",monospace';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(CHASM_LEFT(),y);ctx.lineTo(CHASM_RIGHT(),y);ctx.stroke();
  [CHASM_LEFT(),CHASM_RIGHT()].forEach(x=>{ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x,y+6);ctx.stroke();});
  ctx.textAlign='center';
  ctx.fillText(`SPAN: ${((CHASM_RIGHT()-CHASM_LEFT())*METERS_PER_PIXEL).toFixed(0)} m`,(CHASM_LEFT()+CHASM_RIGHT())/2,y+18);
  ctx.restore();
}

function drawAnchors(){
  for(const a of getAnchors()){
    ctx.beginPath();ctx.fillStyle='rgba(232,163,61,0.25)';ctx.arc(a.x,a.y,12,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.fillStyle='#e8a33d';ctx.arc(a.x,a.y,7,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=2;ctx.strokeStyle='#16212c';ctx.stroke();
  }
  // Symmetry line
  if(symmetryMode){
    const cx=(CHASM_LEFT()+CHASM_RIGHT())/2;
    ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle='rgba(232,163,61,0.4)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,GROUND_Y);ctx.stroke();ctx.restore();
  }
}

function drawJointsBuildMode(){
  for(const j of joints){
    if(j.fixed) continue;
    const nearMiss=getAnchors().some(a=>dist(j.x,j.y,a.x,a.y)<45);
    if(nearMiss){ctx.beginPath();ctx.strokeStyle='#d4483a';ctx.lineWidth=2;ctx.setLineDash([3,3]);ctx.arc(j.x,j.y,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    ctx.beginPath();ctx.fillStyle=j.isScrew?'#e8a33d':'#f2ecdd';
    ctx.arc(j.x,j.y,j.isScrew?7:5,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=j.isScrew?2:1.5;ctx.strokeStyle='#16212c';ctx.stroke();
    if(j.isScrew){ctx.beginPath();ctx.strokeStyle='rgba(232,163,61,0.35)';ctx.lineWidth=1;ctx.arc(j.x,j.y,14,0,Math.PI*2);ctx.stroke();}
  }
}

function drawBeamsBuildMode(){
  for(const b of beams){
    const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c) continue;
    const mat=MATERIALS[b.material];
    // Show beam length while drawing
    ctx.lineWidth=mat.thickness;ctx.strokeStyle=mat.color;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
    ctx.lineWidth=2;ctx.strokeStyle=mat.dark;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
  }
}

function drawDragLine(){
  const start=drag.from?{x:drag.from.x,y:drag.from.y}:pressDownPos;
  ctx.save();ctx.setLineDash([6,5]);
  ctx.lineWidth=MATERIALS[activeMaterial==='screw'?'wood':activeMaterial].thickness;
  ctx.strokeStyle=activeMaterial==='screw'?'#e8a33d':MATERIALS[activeMaterial].color;
  ctx.globalAlpha=0.75;
  ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(drag.x,drag.y);ctx.stroke();
  ctx.restore();
  // Show length label
  const d=dist(start.x,start.y,drag.x,drag.y);
  if(d>20){
    const mx=(start.x+drag.x)/2,my=(start.y+drag.y)/2;
    const mat=MATERIALS[activeMaterial==='screw'?'wood':activeMaterial];
    const cost=Math.round(d*METERS_PER_PIXEL*mat.costPerMeter);
    ctx.save();ctx.font='11px "IBM Plex Mono",monospace';ctx.fillStyle='#cfe3ee';ctx.textAlign='center';
    ctx.fillText(`${(d*METERS_PER_PIXEL).toFixed(1)}m · $${cost.toLocaleString()}`,mx,my-10);ctx.restore();
  }
  const snap=findNearestJoint(drag.x,drag.y,SNAP_RADIUS);
  if(snap){ctx.beginPath();ctx.strokeStyle='#49b07d';ctx.lineWidth=2;ctx.arc(snap.x,snap.y,SNAP_RADIUS,0,Math.PI*2);ctx.stroke();}
}

function drawBeamsPhysics(){
  for(const sb of simBeams){
    const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
    ctx.save();
    ctx.translate((sja.x+sjb.x)/2,(sja.y+sjb.y)/2);
    ctx.rotate(Math.atan2(sjb.y-sja.y,sjb.x-sja.x));
    const half=sb.restLen/2;
    if(sb.broken){ctx.globalAlpha=0.2;ctx.fillStyle='#d4483a';}
    else ctx.fillStyle=stressColor(sb.stress,sb.material.color);
    ctx.fillRect(-half,-sb.material.thickness/2,half*2,sb.material.thickness);
    ctx.restore();
  }
}

function drawSimJoints(){
  for(const sj of simJoints){
    if(sj.fixed) continue;
    ctx.beginPath();ctx.fillStyle='rgba(242,236,221,0.4)';
    ctx.arc(sj.x,sj.y,4,0,Math.PI*2);ctx.fill();
  }
}

function drawDebris(){
  for(const d of debrisParticles){
    ctx.save();ctx.globalAlpha=d.life/40;
    ctx.fillStyle=d.color;
    ctx.beginPath();ctx.arc(d.x,d.y,3,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
}

function drawWindQuakeOverlay(){
  if(windActive){
    ctx.save();ctx.globalAlpha=0.12;ctx.fillStyle='#8fb0cc';
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=0.9;ctx.fillStyle='#cfe3ee';
    ctx.font='bold 14px Archivo,sans-serif';ctx.textAlign='left';
    ctx.fillText('💨 WIND',12,24);ctx.restore();
  }
  if(quakeActive){
    ctx.save();ctx.globalAlpha=0.08;ctx.fillStyle='#d4483a';
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=0.9;ctx.fillStyle='#e8a33d';
    ctx.font='bold 14px Archivo,sans-serif';ctx.textAlign='left';
    ctx.fillText('🌋 QUAKE',12,44);ctx.restore();
  }
}

function stressColor(stress,baseColor){
  if(stress<0.45) return baseColor;
  const t=Math.min(1,(stress-0.45)/0.55);
  return `rgb(${Math.round(232+(212-232)*t)},${Math.round(163+(72-163)*t)},${Math.round(61+(58-61)*t)})`;
}

function drawVehicles(){
  for(const v of vehicles){
    const type=VEHICLE_TYPES[v.typeKey];
    const w=type.w,h=type.h,vx=v.x,vy=v.y-h/2-3;
    ctx.save();ctx.translate(vx,vy);
    const wheelR=Math.max(5,h*0.32),wheelY=h/2-wheelR*0.5;
    for(const wx of[-w/2+wheelR+2,w/2-wheelR-2]){
      ctx.save();ctx.translate(wx,wheelY);
      ctx.fillStyle='#1c1c1c';ctx.beginPath();ctx.arc(0,0,wheelR,0,Math.PI*2);ctx.fill();
      ctx.rotate(v.wheelPhase);ctx.strokeStyle='#555';ctx.lineWidth=1.5;
      for(let s=0;s<4;s++){const a=(Math.PI/2)*s;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*wheelR*0.8,Math.sin(a)*wheelR*0.8);ctx.stroke();}
      ctx.restore();
    }
    const r=Math.min(6,h*0.3);
    roundedRect(-w/2,-h/2,w,h,r);ctx.fillStyle=type.color;ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.55)';
    roundedRect(w/2-w*0.32-w*0.08,-h/2+2,w*0.32,h-4,r*0.7);ctx.fill();
    ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.arc(w/2-2,0,Math.max(2,h*0.08),0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
}

function roundedRect(x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

// ============================================================
// HUD
// ============================================================
const el={
  budget:document.getElementById('hud-budget'),
  spent:document.getElementById('hud-spent'),
  wave:document.getElementById('hud-wave'),
  testBtn:document.getElementById('btn-test'),
  resetBtn:document.getElementById('btn-reset'),
  undoBtn:document.getElementById('btn-undo'),
  symBtn:document.getElementById('btn-sym'),
  slowBtn:document.getElementById('btn-slow'),
  windBtn:document.getElementById('btn-wind'),
  quakeBtn:document.getElementById('btn-quake'),
  banner:document.getElementById('banner'),
  bannerTitle:document.getElementById('banner-title'),
  bannerBody:document.getElementById('banner-body'),
  bannerBtn:document.getElementById('banner-btn'),
  instructions:document.getElementById('instructions'),
  lbPanel:document.getElementById('lb-panel'),
};

function refreshHUD(){
  const rem=BUDGET()-totalCost;
  el.spent.textContent=`$${Math.round(totalCost).toLocaleString()}`;
  el.budget.textContent=`$${Math.round(rem).toLocaleString()}`;
  el.budget.classList.toggle('over',rem<0);
  if(mode==='build'){
    el.wave.textContent='Ready to test';
    el.instructions.textContent=activeMaterial==='screw'
      ?'① Click any beam to place a junction dot ② Switch to a material ③ Drag from the dot'
      :'Drag from an anchor to draw a beam · Click a beam to delete it · Use the Screw tool to add junction points';
  } else if(mode==='simulating'){
    el.wave.textContent=totalLoadKg>0?`Bridge load: ${totalLoadKg.toLocaleString()} kg on span`:'Span clear — spawn a vehicle below';
    el.instructions.textContent='Beams turn amber→red as stress builds. Use Wind/Quake to stress-test further.';
  } else if(mode==='lost'){ el.wave.textContent='Bridge failed'; }
  else if(mode==='won'){ el.wave.textContent='Bridge survived! 🎉'; }
  el.testBtn.disabled=mode!=='build';
  el.resetBtn.disabled=false;
  if(el.undoBtn) el.undoBtn.disabled=mode!=='build'||history.length===0;
  if(el.symBtn) el.symBtn.classList.toggle('active-tool',symmetryMode);
  if(el.slowBtn) el.slowBtn.classList.toggle('active-tool',slowMo);
  if(el.windBtn) el.windBtn.classList.toggle('active-tool',windActive);
  if(el.quakeBtn) el.quakeBtn.classList.toggle('active-tool',quakeActive);
  if(mode!=='lost'&&mode!=='won') hideBanner();
  renderLeaderboard();
}

function showBanner(title,body,won){
  el.bannerTitle.textContent=title;
  el.bannerBody.innerHTML=body.replace(/\n/g,'<br>');
  el.banner.classList.add('visible');
  el.banner.classList.toggle('banner-won',!!won);
}
function hideBanner(){el.banner.classList.remove('visible');}
function flashMessage(msg){el.instructions.textContent=msg;setTimeout(refreshHUD,2200);}

function renderLeaderboard(){
  if(!el.lbPanel) return;
  const lb=getLeaderboard();
  if(!lb.length){el.lbPanel.innerHTML='<div class="lb-empty">No scores yet — test your bridge!</div>';return;}
  el.lbPanel.innerHTML='<div class="lb-title">🏆 Best Scores — '+lvl().name+'</div>'+
    lb.slice(0,5).map((s,i)=>
      `<div class="lb-row"><span class="lb-rank">#${i+1}</span><span class="lb-cost">$${s.cost.toLocaleString()}</span><span class="lb-load">${s.maxKg.toLocaleString()} kg max</span><span class="lb-date">${s.date}</span></div>`
    ).join('');
}

// Wire up buttons
el.testBtn.addEventListener('click',startSimulation);
el.resetBtn.addEventListener('click',resetGame);
el.bannerBtn.addEventListener('click',resetGame);
if(el.undoBtn) el.undoBtn.addEventListener('click',undoAction);
if(el.symBtn)  el.symBtn.addEventListener('click',()=>{symmetryMode=!symmetryMode;refreshHUD();});
if(el.slowBtn) el.slowBtn.addEventListener('click',()=>{slowMo=!slowMo;refreshHUD();});
if(el.windBtn) el.windBtn.addEventListener('click',()=>{
  if(mode!=='simulating'){flashMessage('Start testing first.');return;}
  windActive=true;windTimer=180;refreshHUD();
});
if(el.quakeBtn) el.quakeBtn.addEventListener('click',()=>{
  if(mode!=='simulating'){flashMessage('Start testing first.');return;}
  quakeActive=true;quakeTimer=120;refreshHUD();
});

document.querySelectorAll('.material-card').forEach(card=>{
  card.addEventListener('click',()=>{
    document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('active'));
    card.classList.add('active');
    activeMaterial=card.dataset.material;
    refreshHUD();
  });
});
document.querySelectorAll('.spawn-btn').forEach(btn=>{
  btn.addEventListener('click',()=>spawnVehicle(btn.dataset.type));
});

// keyboard shortcuts
window.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.key==='z'){e.preventDefault();undoAction();}
  if(e.key==='s'||e.key==='S'){symmetryMode=!symmetryMode;refreshHUD();}
  if(e.key==='m'||e.key==='M'){slowMo=!slowMo;refreshHUD();}
});

refreshHUD();
