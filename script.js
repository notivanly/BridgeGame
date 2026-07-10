/* ============================================================
   LOAD LIMIT — Bridge Engineering Lab  v3.0
   Full feature set: Verlet physics, inspector, save/load,
   challenges, collapse FX, trails, cable material, pier,
   timer, tutorial, procedural sound
   ============================================================ */

// ---------- Canvas ----------
const canvas = document.getElementById('stage');
const ctx    = canvas.getContext('2d');
const W = 900, H = 506;
const GROUND_Y = 378;
const METERS_PER_PIXEL = 0.05;
const SNAP_RADIUS = 30;
const TOWER_H = 150; // how far above road the suspension tower anchors sit

// ---------- Audio ----------
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSnap() {
  try {
    const ac = getAudio(); const t = ac.currentTime;
    const buf = ac.createBuffer(1, ac.sampleRate * 0.15, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.exp(-i/(ac.sampleRate*0.03));
    const src = ac.createBufferSource(); src.buffer = buf;
    const filt = ac.createBiquadFilter(); filt.type='bandpass'; filt.frequency.value=800;
    const gain = ac.createGain(); gain.gain.setValueAtTime(0.5, t);
    src.connect(filt); filt.connect(gain); gain.connect(ac.destination);
    src.start(t);
  } catch(e){}
}
function playSplash() {
  try {
    const ac = getAudio(); const t = ac.currentTime;
    const osc = ac.createOscillator(); osc.type='sine'; osc.frequency.setValueAtTime(120,t); osc.frequency.exponentialRampToValueAtTime(40,t+0.4);
    const gain = ac.createGain(); gain.gain.setValueAtTime(0.4,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.5);
    osc.connect(gain); gain.connect(ac.destination); osc.start(t); osc.stop(t+0.5);
  } catch(e){}
}
let creakInterval = null;
function startCreak() {
  stopCreak();
  creakInterval = setInterval(() => {
    try {
      const ac = getAudio(); const t = ac.currentTime;
      const osc = ac.createOscillator(); osc.type='sawtooth'; osc.frequency.setValueAtTime(80+Math.random()*40,t);
      const gain = ac.createGain(); gain.gain.setValueAtTime(0.06,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.3);
      const filt = ac.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=400;
      osc.connect(filt); filt.connect(gain); gain.connect(ac.destination); osc.start(t); osc.stop(t+0.3);
    } catch(e){}
  }, 600);
}
function stopCreak() { if (creakInterval) { clearInterval(creakInterval); creakInterval = null; } }

// ---------- Levels ----------
const LEVELS = [
  { id:0, name:'Narrow Gorge',   chasmLeft:288, chasmRight:612, budget:120000, pier:false, desc:'Short span — master the basics on a tight budget.' },
  { id:1, name:'River Crossing', chasmLeft:234, chasmRight:666, budget:300000, pier:false, desc:'Standard span. Bracing is key for heavy trucks.' },
  { id:2, name:'Grand Canyon',   chasmLeft:162, chasmRight:738, budget:500000, pier:true,  desc:'Wide gap with a mid-span pier. Steel trusses only.' },
];
let currentLevel = 1;
let challengeMode = null;

const CHALLENGES = [
  { id:0, level:0, name:'Budget Builder',  desc:'Survive a Van for under $15,000',            budget:15000,  timeLimit:180, materialLock:null,       objective:{vehicle:'van',   maxCost:15000}  },
  { id:1, level:0, name:'Wood Only',       desc:'Survive a Sedan using only Wood',             budget:80000,  timeLimit:180, materialLock:['wood'],   objective:{vehicle:'sedan'}                 },
  { id:2, level:1, name:'Truck Stop',      desc:'Survive 3 Box Trucks in a row',               budget:200000, timeLimit:240, materialLock:null,       objective:{vehicle:'truck', count:3}        },
  { id:3, level:1, name:'Semi Boss',       desc:'Survive a Semi for under $100,000',           budget:300000, timeLimit:300, materialLock:null,       objective:{vehicle:'semi',  maxCost:100000} },
  { id:4, level:2, name:'The Impossible',  desc:'Survive the Tank. Any budget. Good luck.',    budget:500000, timeLimit:0,   materialLock:null,       objective:{vehicle:'tank'}                  },
];

function lvl() { return LEVELS[currentLevel]; }
function CL()  { return lvl().chasmLeft;  }
function CR()  { return lvl().chasmRight; }
function BUD() { return challengeMode ? challengeMode.budget : lvl().budget; }
function getAnchors() {
  const anchors = [
    // Road-level anchors (4 standard)
    { x:CL(),  y:GROUND_Y+5,  label:'road' },
    { x:CL(),  y:GROUND_Y+55, label:'road' },
    { x:CR(),  y:GROUND_Y+5,  label:'road' },
    { x:CR(),  y:GROUND_Y+55, label:'road' },
    // Suspension tower anchors — high above the cliff edges
    { x:CL()-18, y:GROUND_Y-TOWER_H,     label:'tower' },
    { x:CL()-18, y:GROUND_Y-TOWER_H/2,   label:'tower' },
    { x:CR()+18, y:GROUND_Y-TOWER_H,     label:'tower' },
    { x:CR()+18, y:GROUND_Y-TOWER_H/2,   label:'tower' },
  ];
  if (lvl().pier) {
    const cx = (CL()+CR())/2;
    anchors.push({ x:cx, y:GROUND_Y+5,  label:'road'  });
    anchors.push({ x:cx, y:GROUND_Y+55, label:'road'  });
    anchors.push({ x:cx, y:GROUND_Y+110,label:'road'  });
  }
  return anchors;
}

// ---------- Materials ----------
const MATERIALS = {
  wood:     { key:'wood',     name:'Wood',            color:'#c89a64', dark:'#8a6239', costPerMeter:14,  thickness:8,  sagBreak:3,  tensionOnly:false, note:'Cheap & light. Snaps under heavy loads.' },
  steel:    { key:'steel',    name:'Steel',           color:'#a9bdce', dark:'#5d6e7c', costPerMeter:135, thickness:7,  sagBreak:22, tensionOnly:false, note:'Strongest by far. Expensive and heavy.'  },
  concrete: { key:'concrete', name:'Concrete',        color:'#b3b1a6', dark:'#76746c', costPerMeter:68,  thickness:11, sagBreak:9,  tensionOnly:false, note:'Decent strength, very heavy on long spans.' },
  cable:    { key:'cable',    name:'Cable',           color:'#f0c040', dark:'#c08010', costPerMeter:45,  thickness:3,  sagBreak:35, tensionOnly:true,  note:'Tension only — great for suspension bridges.' },
};

// ---------- Vehicles ----------
const VEHICLE_TYPES = {
  sedan: { label:'Sedan',     kg:1400,  force:0.8,  w:46,  h:20, color:'#3b6ea5', speed:2.8, emoji:'🚗' },
  van:   { label:'Van',       kg:2800,  force:1.6,  w:56,  h:26, color:'#3b8a5a', speed:2.5, emoji:'🚐' },
  truck: { label:'Box Truck', kg:9000,  force:4.5,  w:76,  h:36, color:'#c97a2b', speed:2.1, emoji:'🚚' },
  semi:  { label:'Semi',      kg:18000, force:9.0,  w:104, h:42, color:'#a23b3b', speed:1.7, emoji:'🚛' },
  tank:  { label:'Tank',      kg:60000, force:28.0, w:120, h:48, color:'#5a4a2a', speed:1.2, emoji:'🪖' },
};

// ---------- Physics ----------
const GRAVITY=0.2, DAMPING=0.96, ITERATIONS=8, SETTLE_TOTAL=120;

// ---------- Build state ----------
let joints=[], beams=[], nextId=1, totalCost=0, activeMaterial='wood';
let history=[];

// ---------- Sim state ----------
let simJoints=[], simBeams=[], vehicles=[];
let settleFrames=0, totalLoadKg=0;
let mode='build';
let drag=null, pressDownPos=null;
let symmetryMode=false, slowMo=false;
let windActive=false, quakeActive=false, windTimer=0, quakeTimer=0;
let vehiclesCrossed=0, maxLoadSurvived=0;
let challengeVehicleCount=0;
let debrisParticles=[], splashParticles=[], trailPoints=[];
let fallingBeams=[];
let frameCount=0;
let buildTimer=0, buildTimerActive=false;
let inspectedBeam=null;
let tutorialStep=-1; // -1=done, 0-5=steps

// ---------- Clouds (decorative) ----------
const clouds = Array.from({length:5},(_,i)=>({x:100+i*200,y:40+Math.sin(i)*30,w:80+i*20,speed:0.15+i*0.05}));

// ---------- Leaderboard ----------
function lbKey() { return `lb_${currentLevel}_${challengeMode?challengeMode.id:'free'}`; }
function getLeaderboard() { try { return JSON.parse(localStorage.getItem(lbKey())||'[]'); } catch(e){return[];} }
function saveScore(cost,maxKg,grade) {
  const lb=getLeaderboard();
  lb.push({cost,maxKg,grade,date:new Date().toLocaleDateString()});
  lb.sort((a,b)=>a.cost-b.cost);
  localStorage.setItem(lbKey(),JSON.stringify(lb.slice(0,10)));
}

// ---------- Saved designs ----------
function getSaves() { try { return JSON.parse(localStorage.getItem('saves')||'[]'); } catch(e){return[];} }
function saveDesign(name) {
  const saves=getSaves();
  saves.unshift({name,level:currentLevel,joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost,date:new Date().toLocaleDateString()});
  localStorage.setItem('saves',JSON.stringify(saves.slice(0,20)));
  renderSaves();
}
function loadDesign(idx) {
  const s=getSaves()[idx]; if(!s) return;
  currentLevel=s.level; initJoints();
  joints=s.joints; beams=s.beams; totalCost=s.totalCost;
  nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id))+1;
  buildLevelUI(); refreshHUD();
}
function deleteDesign(idx) {
  const saves=getSaves(); saves.splice(idx,1);
  localStorage.setItem('saves',JSON.stringify(saves));
  renderSaves();
}
function renderSaves() {
  const el=document.getElementById('saves-list'); if(!el) return;
  const saves=getSaves();
  if(!saves.length){el.innerHTML='<div class="lb-empty">No saved designs yet.</div>';return;}
  el.innerHTML=saves.map((s,i)=>`
    <div class="save-row">
      <div class="save-name">${s.name}</div>
      <div class="save-meta">${LEVELS[s.level]?.name} · $${s.totalCost?.toLocaleString()}</div>
      <div class="save-actions">
        <button onclick="loadDesign(${i})" class="save-act-btn">Load</button>
        <button onclick="deleteDesign(${i})" class="save-act-btn del">✕</button>
      </div>
    </div>`).join('');
}

// ============================================================
// Init
// ============================================================
function initJoints() {
  joints=getAnchors().map(a=>({id:nextId++,x:a.x,y:a.y,fixed:true}));
  beams=[]; totalCost=0; history=[];
}

function resizeCanvasForDPR() {
  const dpr=window.devicePixelRatio||1;
  if(dpr>1){canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(dpr,dpr);}
}

function buildLevelUI() {
  const wrap=document.getElementById('level-tabs'); if(!wrap) return;
  wrap.innerHTML='';
  LEVELS.forEach((lv,i)=>{
    const btn=document.createElement('button');
    btn.className='level-tab'+(i===currentLevel?' active':'');
    btn.textContent=lv.name;
    btn.addEventListener('click',()=>{currentLevel=i;challengeMode=null;resetGame();buildLevelUI();buildChallengeUI();});
    wrap.appendChild(btn);
  });
  const desc=document.getElementById('level-desc'); if(desc) desc.textContent=lvl().desc;
}

function buildChallengeUI() {
  const wrap=document.getElementById('challenge-list'); if(!wrap) return;
  const relevant=CHALLENGES.filter(c=>c.level===currentLevel);
  wrap.innerHTML=relevant.map(c=>`
    <button class="challenge-btn" data-cid="${c.id}">
      <span class="ch-name">${c.name}</span>
      <span class="ch-desc">${c.desc}</span>
    </button>`).join('');
  wrap.querySelectorAll('.challenge-btn').forEach(btn=>{
    btn.addEventListener('click',()=>startChallenge(parseInt(btn.dataset.cid)));
  });
}

function startChallenge(id) {
  const ch=CHALLENGES.find(c=>c.id===id); if(!ch) return;
  currentLevel=ch.level; challengeMode=ch;
  resetGame(); buildLevelUI();
  if(ch.timeLimit>0){buildTimer=ch.timeLimit*60;buildTimerActive=true;}
  document.getElementById('mode-badge').textContent='🎯 CHALLENGE: '+ch.name;
  document.getElementById('mode-badge').style.display='block';
  if(ch.materialLock){
    document.querySelectorAll('.material-card').forEach(card=>{
      card.classList.toggle('locked', ch.materialLock && !ch.materialLock.includes(card.dataset.material) && card.dataset.material!=='screw');
    });
  }
  refreshHUD();
}

// ============================================================
// Tutorial
// ============================================================
const TUTORIAL_STEPS = [
  { title:'Welcome to Load Limit!', body:'Build a bridge to get vehicles across the chasm. Let\'s walk through the basics.', highlight:null },
  { title:'Anchor Points', body:'The amber dots are your fixed anchor points. All beams must connect here to be supported.', highlight:'anchors' },
  { title:'Drawing Beams', body:'Select a material (Wood, Steel, Concrete or Cable), then drag from one anchor to another to draw a beam.', highlight:'materials' },
  { title:'Junction Screws', body:'Use the ⚙️ Junction Screw to add connection points along existing beams, so you can build trusses.', highlight:'screw' },
  { title:'Test Your Bridge', body:'Click "Test Bridge" to run the simulation. Spawn vehicles from the right panel to stress test it.', highlight:'test' },
  { title:'Read the Stress Colors', body:'Beams turn amber then red as they approach failure. Watch for red beams — they\'re about to snap!', highlight:'legend' },
];

function showTutorialStep(step) {
  tutorialStep=step;
  const el=document.getElementById('tutorial-overlay'); if(!el) return;
  if(step<0||step>=TUTORIAL_STEPS.length){el.style.display='none';tutorialStep=-1;localStorage.setItem('tutorialDone','1');return;}
  const s=TUTORIAL_STEPS[step];
  document.getElementById('tut-title').textContent=s.title;
  document.getElementById('tut-body').textContent=s.body;
  document.getElementById('tut-step').textContent=`${step+1} / ${TUTORIAL_STEPS.length}`;
  el.style.display='flex';
}

// ============================================================
// Undo
// ============================================================
function pushHistory() {
  history.push({joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost});
  if(history.length>50) history.shift();
}
function undoAction() {
  if(!history.length){flashMessage('Nothing to undo.');return;}
  const snap=history.pop();
  joints=snap.joints; beams=snap.beams; totalCost=snap.totalCost;
  nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id),nextId)+1;
  refreshHUD();
}

// ============================================================
// Input
// ============================================================
canvas.style.touchAction='none';

canvas.addEventListener('pointerdown',e=>{
  getAudio(); // unlock audio on first interaction
  if(mode==='simulating'){
    // Inspector: click to inspect a beam
    const p=canvasPos(e);
    inspectedBeam=findSimBeamNear(p.x,p.y,12);
    return;
  }
  if(mode!=='build') return;
  const p=canvasPos(e); pressDownPos=p;
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
  const to=findNearestJoint(p.x,p.y,SNAP_RADIUS)||addJoint(p.x,p.y,false);
  if(from.id!==to.id&&!beamExists(from.id,to.id)){
    pushHistory();
    addBeam(from,to,activeMaterial);
    if(symmetryMode){
      const cx=(CL()+CR())/2;
      const mf=mirrorJoint(from,cx), mt=mirrorJoint(to,cx);
      if(mf.id!==mt.id&&!beamExists(mf.id,mt.id)) addBeam(mf,mt,activeMaterial);
    }
  }
  drag=null;
});
canvas.addEventListener('pointerleave',()=>{drag=null;});

function mirrorJoint(j,cx){
  const mx=cx+(cx-j.x),my=j.y;
  if(j.fixed){
    const anch=getAnchors().find(a=>Math.abs(a.x-mx)<5&&Math.abs(a.y-my)<5);
    if(anch) return joints.find(jj=>jj.fixed&&Math.abs(jj.x-anch.x)<5&&Math.abs(jj.y-anch.y)<5)||addJoint(mx,my,false);
  }
  return findNearestJoint(mx,my,10)||addJoint(mx,my,false);
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
  if(challengeMode?.materialLock&&!challengeMode.materialLock.includes(matKey)&&matKey!=='screw'){
    flashMessage('Challenge: only '+challengeMode.materialLock.join('/')+' allowed!'); return;
  }
  const mat=MATERIALS[matKey],len=dist(a.x,a.y,b.x,b.y);
  beams.push({id:nextId++,aId:a.id,bId:b.id,material:matKey,length:len});
  totalCost+=len*METERS_PER_PIXEL*mat.costPerMeter;
  refreshHUD();
}
function removeBeam(id){
  const b=beams.find(b=>b.id===id); if(!b) return;
  totalCost-=b.length*METERS_PER_PIXEL*MATERIALS[b.material].costPerMeter;
  beams=beams.filter(x=>x.id!==id);
  joints=joints.filter(j=>j.fixed||beams.some(bm=>bm.aId===j.id||bm.bId===j.id));
  refreshHUD();
}
function beamExists(aId,bId){return beams.some(b=>(b.aId===aId&&b.bId===bId)||(b.aId===bId&&b.bId===aId));}
function findNearestJoint(x,y,r){let best=null,bestD=r;for(const j of joints){const d=dist(x,y,j.x,j.y);if(d<bestD){best=j;bestD=d;}}return best;}
function findBeamNear(x,y,tol){let best=null,bestD=tol;for(const b of beams){const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c)continue;const d=distToSegment(x,y,a.x,a.y,c.x,c.y);if(d<bestD){best=b;bestD=d;}}return best;}
function findSimBeamNear(x,y,tol){let best=null,bestD=tol;for(const sb of simBeams){const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];const d=distToSegment(x,y,sja.x,sja.y,sjb.x,sjb.y);if(d<bestD){best=sb;bestD=d;}}return best;}
function jointById(id){return joints.find(j=>j.id===id);}
function dist(x1,y1,x2,y2){return Math.hypot(x2-x1,y2-y1);}
function distToSegment(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1;const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));return dist(px,py,x1+t*dx,y1+t*dy);}
function splitBeamAt(beam,x,y){
  const a=jointById(beam.aId),b=jointById(beam.bId);
  const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1;
  const t=Math.max(0.08,Math.min(0.92,((x-a.x)*dx+(y-a.y)*dy)/l2));
  const mat=beam.material; removeBeam(beam.id);
  const nj=addJoint(a.x+t*dx,a.y+t*dy,false);
  addBeam(a,nj,mat); addBeam(nj,b,mat); return nj;
}

// ============================================================
// Simulation
// ============================================================
function startSimulation(){
  if(beams.length===0){flashMessage('Build at least one beam first.');return;}
  const jMap=new Map();
  simJoints=joints.map((j,i)=>{jMap.set(j.id,i);return{x:j.x,y:j.y,px:j.x,py:j.y,fixed:!!j.fixed};});
  const SEG=38; simBeams=[];
  for(const rb of beams){
    const ai=jMap.get(rb.aId),bi=jMap.get(rb.bId);
    const sja=simJoints[ai],sjb=simJoints[bi];
    const n=Math.max(2,Math.ceil(Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/SEG));
    const sl=Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/n;
    let prev=ai;
    for(let s=1;s<n;s++){
      const t=s/n,ni=simJoints.length;
      simJoints.push({x:sja.x+(sjb.x-sja.x)*t,y:sja.y+(sjb.y-sja.y)*t,px:sja.x+(sjb.x-sja.x)*t,py:sja.y+(sjb.y-sja.y)*t,fixed:false});
      simBeams.push({ai:prev,bi:ni,restLen:sl,material:MATERIALS[rb.material],broken:false,stress:0,origBeamId:rb.id});
      prev=ni;
    }
    simBeams.push({ai:prev,bi:bi,restLen:sl,material:MATERIALS[rb.material],broken:false,stress:0,origBeamId:rb.id});
  }
  vehicles=[]; settleFrames=SETTLE_TOTAL; totalLoadKg=0;
  vehiclesCrossed=0; maxLoadSurvived=0; challengeVehicleCount=0;
  debrisParticles=[]; splashParticles=[]; trailPoints=[]; fallingBeams=[];
  windActive=false; quakeActive=false; buildTimerActive=false;
  inspectedBeam=null;
  mode='simulating'; refreshHUD();
}

function simulationStep(){
  frameCount++;
  if(windActive){windTimer--;if(windTimer<=0)windActive=false;}
  if(quakeActive){quakeTimer--;if(quakeTimer<=0)quakeActive=false;}

  // 1. Integrate
  for(const sj of simJoints){
    if(sj.fixed) continue;
    let vx=(sj.x-sj.px)*DAMPING, vy=(sj.y-sj.py)*DAMPING;
    sj.px=sj.x; sj.py=sj.y;
    if(windActive) vx+=0.18*Math.sin(frameCount*0.05);
    if(quakeActive){vx+=0.35*(Math.random()-0.5)*2;vy+=0.15*(Math.random()-0.5);}
    sj.x+=vx; sj.y+=vy+GRAVITY;
  }

  // 2. Vehicle load
  if(settleFrames===0){
    for(const v of vehicles){
      const type=VEHICLE_TYPES[v.typeKey];
      const aff=[];
      for(let i=0;i<simJoints.length;i++){
        const sj=simJoints[i]; if(sj.fixed) continue;
        const dx=Math.abs(sj.x-v.x),dy=sj.y-(GROUND_Y+5);
        if(dx<type.w*0.75&&dy>-10&&dy<130) aff.push({i,p:1-dx/(type.w*0.75)});
      }
      if(aff.length){const tw=aff.reduce((s,a)=>s+a.p,0); for(const{i,p}of aff) simJoints[i].y+=type.force*(p/tw);}
    }
  }

  // 3. Constraints
  for(let iter=0;iter<ITERATIONS;iter++){
    for(const sb of simBeams){
      if(sb.broken) continue;
      const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
      const dx=sjb.x-sja.x,dy=sjb.y-sja.y,cur=Math.hypot(dx,dy);
      if(cur<0.001) continue;
      const stretching = cur > sb.restLen;
      // Cable: only resist tension (stretching), not compression
      if(sb.material.tensionOnly && !stretching) continue;
      const diff=(cur-sb.restLen)/cur*0.5;
      if(!sja.fixed&&!sjb.fixed){sja.x+=dx*diff;sja.y+=dy*diff;sjb.x-=dx*diff;sjb.y-=dy*diff;}
      else if(!sja.fixed){sja.x+=dx*diff*2;sja.y+=dy*diff*2;}
      else if(!sjb.fixed){sjb.x-=dx*diff*2;sjb.y-=dy*diff*2;}
    }
  }

  // 4. Break detection
  let maxStress=0;
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
      maxStress=Math.max(maxStress,sb.stress);
      if(sag>sb.material.sagBreak){
        sb.broken=true;
        playSnap();
        // Spawn falling beam
        const bx=(sja.x+sjb.x)/2,by=(sja.y+sjb.y)/2;
        fallingBeams.push({x:bx,y:by,vx:(Math.random()-0.5)*3,vy:-1-Math.random()*2,angle:Math.atan2(sjb.y-sja.y,sjb.x-sja.x),av:(Math.random()-0.5)*0.2,len:sb.restLen,mat:sb.material,life:90});
        for(let i=0;i<8;i++) debrisParticles.push({x:bx,y:by,vx:(Math.random()-0.5)*5,vy:-Math.random()*4-1,life:40,color:sb.material.color});
        const midX=bx;
        if(midX>CL()&&midX<CR()&&mode==='simulating') triggerLoss(sb.material.name);
      }
    }
    // Creak when stressed
    if(maxStress>0.75&&!creakInterval) startCreak();
    else if(maxStress<0.5) stopCreak();
  }

  // 5. Update falling beams
  for(const fb of fallingBeams){fb.x+=fb.vx;fb.y+=fb.vy;fb.vy+=0.4;fb.angle+=fb.av;fb.life--;}
  for(const fb of fallingBeams){if(fb.y>GROUND_Y+80&&fb.life>10){fb.life=Math.min(fb.life,10);if(fb.y>H-20){playSplash();spawnSplash(fb.x,H-30);}}}
  fallingBeams=fallingBeams.filter(f=>f.life>0);

  // 6. Debris & splash
  for(const d of debrisParticles){d.x+=d.vx;d.y+=d.vy;d.vy+=0.25;d.life--;}
  debrisParticles=debrisParticles.filter(d=>d.life>0);
  for(const s of splashParticles){s.x+=s.vx;s.y+=s.vy;s.vy+=0.15;s.r*=0.95;s.life--;}
  splashParticles=splashParticles.filter(s=>s.life>0);

  // 7. Vehicles
  stepVehicles();
}

function spawnSplash(x,y){
  for(let i=0;i<12;i++){
    const a=-Math.PI/2+(Math.random()-0.5)*Math.PI;
    splashParticles.push({x,y,vx:Math.cos(a)*(1+Math.random()*3),vy:Math.sin(a)*(1+Math.random()*4),r:3+Math.random()*4,life:35,color:'#4aa0d0'});
  }
}

function getBridgeSurfaceY(vx){
  let sy=null;
  for(const sb of simBeams){
    if(sb.broken) continue;
    if(sb.material.tensionOnly) continue; // cables are not a road surface
    const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
    const minX=Math.min(sja.x,sjb.x),maxX=Math.max(sja.x,sjb.x);
    if(vx<minX||vx>maxX) continue;
    const t=(vx-sja.x)/((sjb.x-sja.x)||0.001);
    const beamY=sja.y+t*(sjb.y-sja.y);
    if(beamY>GROUND_Y-80&&beamY<GROUND_Y+80) if(sy===null||beamY<sy) sy=beamY;
  }
  return sy;
}

function spawnVehicle(typeKey){
  if(mode!=='simulating'){flashMessage('Click "Test Bridge" first.');return;}
  if(vehicles.some(v=>v.x<80)){flashMessage('Entry busy — wait a moment.');return;}
  const type=VEHICLE_TYPES[typeKey];
  vehicles.push({x:-type.w/2,y:GROUND_Y,vy:0,typeKey,wheelPhase:0,done:false,counted:false,trail:[]});
  refreshHUD();
}

function stepVehicles(){
  totalLoadKg=0;
  for(const v of vehicles){
    const type=VEHICLE_TYPES[v.typeKey];
    const spd=type.speed*(slowMo?0.2:1);
    v.x+=spd; v.wheelPhase+=spd*0.35;
    const onLeft=v.x<=CL(), onRight=v.x>=CR();
    if(onLeft||onRight){v.y=GROUND_Y;v.vy=0;}
    else{
      const sy=getBridgeSurfaceY(v.x);
      if(sy!==null&&v.y>=sy){v.y=sy;v.vy=0;totalLoadKg+=type.kg;}
      else{v.vy+=0.6;v.y+=v.vy;}
    }
    // Trail points
    if(v.x>CL()&&v.x<CR()){
      v.trail.push({x:v.x,y:v.y,age:0});
      if(v.trail.length>60) v.trail.shift();
    }
    for(const tp of v.trail) tp.age++;
    if(v.y>H+60){
      v.done=true;
      if(v.x>CL()&&v.x<CR()&&mode==='simulating'){
        playSplash(); spawnSplash(v.x,H-30);
        triggerLoss('vehicle fell into the chasm');
      }
    }
    if(v.x>CR()+20&&v.y<=GROUND_Y+5&&!v.counted){
      v.counted=true; vehiclesCrossed++; challengeVehicleCount++;
      maxLoadSurvived=Math.max(maxLoadSurvived,type.kg);
      // Check challenge objective
      if(challengeMode){
        const obj=challengeMode.objective;
        const cnt=obj.count||1;
        if(challengeVehicleCount>=cnt){
          if(!obj.maxCost||totalCost<=obj.maxCost) triggerWin();
          else triggerLoss('cost exceeded $'+obj.maxCost.toLocaleString());
        }
      }
    }
    if(v.x>W+80) v.done=true;
  }
  vehicles=vehicles.filter(v=>!v.done);
  refreshHUD();
}

function triggerLoss(reason){
  if(mode!=='simulating') return;
  stopCreak(); mode='lost'; refreshHUD();
  const grade=calcGrade(false);
  showBanner('💥 Bridge Failure',`Cause: ${reason}\n\nSurvived ${vehiclesCrossed} vehicle(s) · Max: ${maxLoadSurvived.toLocaleString()} kg\n\nCost: $${Math.round(totalCost).toLocaleString()} · Grade: ${grade}`,false);
}

function triggerWin(){
  if(mode!=='simulating') return;
  stopCreak(); mode='won';
  const grade=calcGrade(true);
  saveScore(Math.round(totalCost),maxLoadSurvived,grade);
  refreshHUD();
  showBanner('🏗️ Bridge Survived!',`All vehicles crossed safely!\n\nCost: $${Math.round(totalCost).toLocaleString()} · Max load: ${maxLoadSurvived.toLocaleString()} kg\n\nGrade: ${grade} — ${gradeDesc(grade)}`,true);
}

function calcGrade(won){
  if(!won) return 'F';
  const ratio=totalCost/BUD();
  const peakStress=simBeams.reduce((m,sb)=>Math.max(m,sb.stress),0);
  if(ratio<0.25&&peakStress<0.6) return'A+';
  if(ratio<0.35) return'A';
  if(ratio<0.5)  return'B';
  if(ratio<0.7)  return'C';
  if(ratio<0.9)  return'D';
  return'D-';
}
function gradeDesc(g){
  return{
    'A+':'Masterful engineering. Minimal material, maximum strength.',
    'A':'Excellent design. Very cost-efficient.',
    'B':'Good bridge. Some room to trim the budget.',
    'C':'Solid but could be leaner.',
    'D':'It held, barely. Try a truss next time.',
    'D-':'Barely passed. There\'s lots of room to improve.',
    'F':'Back to the drawing board.',
  }[g]||'';
}

function resetGame(){
  stopCreak();
  simJoints=[];simBeams=[];vehicles=[];
  debrisParticles=[];splashParticles=[];trailPoints=[];fallingBeams=[];
  totalLoadKg=0;vehiclesCrossed=0;maxLoadSurvived=0;challengeVehicleCount=0;
  windActive=false;quakeActive=false;slowMo=false;buildTimerActive=false;
  inspectedBeam=null;
  mode='build'; initJoints(); refreshHUD(); hideBanner();
  if(!challengeMode){
    document.getElementById('mode-badge').style.display='none';
    document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('locked'));
  }
}

// ============================================================
// Rendering
// ============================================================
function loop(){
  if(mode==='simulating') simulationStep();
  if(buildTimerActive&&mode==='build'){
    buildTimer--;
    if(buildTimer<=0){buildTimerActive=false;flashMessage('⏱️ Time\'s up! Testing your bridge now...');setTimeout(startSimulation,500);}
  }
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
    if(buildTimerActive) drawTimer();
  } else {
    drawTrails();
    drawBeamsPhysics();
    drawFallingBeams();
    drawSimJoints();
    drawDebris();
    drawSplash();
    drawVehicles();
    drawOverlays();
    drawInspector();
  }
}

// ---- Sky & scenery ----
function drawSky(){
  const grad=ctx.createLinearGradient(0,0,0,GROUND_Y);
  grad.addColorStop(0,'#071828'); grad.addColorStop(1,'#0a3158');
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
  // grid
  ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=25){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  // Mountains
  ctx.fillStyle='#0d2a45';
  [[0,280,200,GROUND_Y],[150,240,220,GROUND_Y],[600,260,200,GROUND_Y],[750,230,250,GROUND_Y]].forEach(([x,py,pw])=>{
    ctx.beginPath();ctx.moveTo(x,GROUND_Y);ctx.lineTo(x+pw/2,py);ctx.lineTo(x+pw,GROUND_Y);ctx.closePath();ctx.fill();
  });
  // Clouds
  for(const c of clouds){
    c.x=(c.x+c.speed)%W;
    ctx.save();ctx.globalAlpha=0.18;ctx.fillStyle='#fff';
    [[0,0,c.w*0.6,18],[c.w*0.2,-10,c.w*0.5,22],[c.w*0.5,-4,c.w*0.5,16]].forEach(([ox,oy,cw,ch])=>{
      ctx.beginPath();ctx.ellipse(c.x+ox,c.y+oy,cw/2,ch/2,0,0,Math.PI*2);ctx.fill();
    });
    ctx.restore();
  }
  // Trees on cliffs
  drawTrees(20,GROUND_Y-5,CL()-40,8);
  drawTrees(CR()+20,GROUND_Y-5,W-CR()-40,8);
}

function drawTrees(startX,y,totalW,count){
  const spacing=totalW/(count+1);
  for(let i=1;i<=count;i++){
    const x=startX+spacing*i, h=20+Math.sin(i*7)*8;
    ctx.fillStyle='#0d3a25';
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-8,y-h*0.4);ctx.lineTo(x+8,y-h*0.4);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(x,y-h*0.3);ctx.lineTo(x-10,y-h*0.75);ctx.lineTo(x+10,y-h*0.75);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(x,y-h*0.6);ctx.lineTo(x-7,y-h);ctx.lineTo(x+7,y-h);ctx.closePath();ctx.fill();
  }
}

function drawTerrain(){
  // Water with ripples
  const wg=ctx.createLinearGradient(0,GROUND_Y,0,H);
  wg.addColorStop(0,'#04203b'); wg.addColorStop(1,'#03152a');
  ctx.fillStyle=wg; ctx.fillRect(CL(),GROUND_Y,CR()-CL(),H-GROUND_Y);
  ctx.strokeStyle='rgba(100,160,220,0.15)'; ctx.lineWidth=1;
  for(let i=0;i<6;i++){
    const wy=GROUND_Y+50+i*40+Math.sin(frameCount*0.025+i)*5;
    ctx.beginPath();ctx.moveTo(CL(),wy);ctx.lineTo(CR(),wy);ctx.stroke();
  }
  // Pier on Grand Canyon level
  if(lvl().pier){
    const cx=(CL()+CR())/2;
    ctx.fillStyle='#2a3a42';
    ctx.fillRect(cx-12,GROUND_Y+5,24,H-GROUND_Y);
    ctx.fillStyle='#3a4a52';
    ctx.fillRect(cx-14,GROUND_Y,28,12);
  }
  // Suspension tower pylons — drawn before cliffs so they sit on top
  ctx.fillStyle='#2a3a52';
  [[CL()-18, GROUND_Y-TOWER_H],[CR()+18, GROUND_Y-TOWER_H]].forEach(([tx,ty])=>{
    ctx.fillRect(tx-5, ty, 10, GROUND_Y-ty+5);
    // cross beam
    ctx.fillRect(tx-18, ty+30, 36, 6);
    ctx.fillRect(tx-14, ty+55, 28, 5);
    // cap
    ctx.beginPath();ctx.fillStyle='#64b4ff';ctx.arc(tx,ty,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2a3a52';
  });
  // Cliffs
  ctx.fillStyle='#3a4a52';
  ctx.fillRect(0,GROUND_Y,CL(),H-GROUND_Y);
  ctx.fillRect(CR(),GROUND_Y,W-CR(),H-GROUND_Y);
  ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
  for(let i=-H;i<CL()+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  for(let i=CR()-H;i<W+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  ctx.strokeStyle='#cfe3ee'; ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,GROUND_Y);ctx.lineTo(CL(),GROUND_Y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(CR(),GROUND_Y);ctx.lineTo(W,GROUND_Y);ctx.stroke();
}

function drawSpanDimension(){
  const y=GROUND_Y+105;
  ctx.save();ctx.strokeStyle='#7fa8c9';ctx.fillStyle='#7fa8c9';
  ctx.font='12px "IBM Plex Mono",monospace';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(CL(),y);ctx.lineTo(CR(),y);ctx.stroke();
  [CL(),CR()].forEach(x=>{ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x,y+6);ctx.stroke();});
  ctx.textAlign='center';
  ctx.fillText(`SPAN: ${((CR()-CL())*METERS_PER_PIXEL).toFixed(0)} m`,(CL()+CR())/2,y+18);
  ctx.restore();
}

function drawAnchors(){
  for(const a of getAnchors()){
    if(a.label==='tower'){
      // Tower anchor — blue diamond
      ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.PI/4);
      ctx.beginPath();ctx.fillStyle='rgba(100,180,255,0.2)';ctx.rect(-10,-10,20,20);ctx.fill();
      ctx.beginPath();ctx.fillStyle='#64b4ff';ctx.rect(-6,-6,12,12);ctx.fill();
      ctx.strokeStyle='#16212c';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    } else {
      // Standard road anchor — amber circle
      ctx.beginPath();ctx.fillStyle='rgba(232,163,61,0.25)';ctx.arc(a.x,a.y,12,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.fillStyle='#e8a33d';ctx.arc(a.x,a.y,7,0,Math.PI*2);ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle='#16212c';ctx.stroke();
    }
  }
  if(symmetryMode){
    const cx=(CL()+CR())/2;
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
    const a=jointById(b.aId),c=jointById(b.bId); if(!a||!c) continue;
    const mat=MATERIALS[b.material];
    ctx.lineWidth=mat.thickness;ctx.strokeStyle=mat.color;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
    if(mat.key!=='cable'){ctx.lineWidth=2;ctx.strokeStyle=mat.dark;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();}
  }
}

function drawDragLine(){
  if(activeMaterial==='screw') return;
  const mat=MATERIALS[activeMaterial];
  const start=drag.from?{x:drag.from.x,y:drag.from.y}:pressDownPos;
  ctx.save();ctx.setLineDash([6,5]);ctx.lineWidth=mat.thickness;ctx.strokeStyle=mat.color;ctx.globalAlpha=0.75;
  ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(drag.x,drag.y);ctx.stroke();ctx.restore();
  const d=dist(start.x,start.y,drag.x,drag.y);
  if(d>20){
    const mx=(start.x+drag.x)/2,my=(start.y+drag.y)/2;
    const cost=Math.round(d*METERS_PER_PIXEL*mat.costPerMeter);
    ctx.save();ctx.font='11px "IBM Plex Mono",monospace';ctx.fillStyle='#cfe3ee';ctx.textAlign='center';
    ctx.fillText(`${(d*METERS_PER_PIXEL).toFixed(1)}m · $${cost.toLocaleString()}`,mx,my-10);ctx.restore();
  }
  const snap=findNearestJoint(drag.x,drag.y,SNAP_RADIUS);
  if(snap){ctx.beginPath();ctx.strokeStyle='#49b07d';ctx.lineWidth=2;ctx.arc(snap.x,snap.y,SNAP_RADIUS,0,Math.PI*2);ctx.stroke();}
}

function drawTimer(){
  const secs=Math.ceil(buildTimer/60);
  const color=secs<30?'#d4483a':secs<60?'#e8a33d':'#cfe3ee';
  ctx.save();ctx.font='bold 18px "IBM Plex Mono",monospace';ctx.fillStyle=color;ctx.textAlign='right';
  ctx.fillText(`⏱ ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`,W-14,28);ctx.restore();
}

function drawTrails(){
  for(const v of vehicles){
    if(!v.trail||v.trail.length<2) continue;
    for(let i=1;i<v.trail.length;i++){
      const p=v.trail[i-1],q=v.trail[i];
      ctx.save();ctx.globalAlpha=Math.max(0,(60-q.age)/60)*0.3;
      ctx.strokeStyle='#8a6239';ctx.lineWidth=3;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.restore();
    }
  }
}

function drawBeamsPhysics(){
  for(const sb of simBeams){
    const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
    ctx.save();
    ctx.translate((sja.x+sjb.x)/2,(sja.y+sjb.y)/2);
    ctx.rotate(Math.atan2(sjb.y-sja.y,sjb.x-sja.x));
    const half=sb.restLen/2;
    if(sb.broken){ctx.globalAlpha=0.15;ctx.fillStyle='#d4483a';}
    else ctx.fillStyle=stressColor(sb.stress,sb.material.color);
    ctx.fillRect(-half,-sb.material.thickness/2,half*2,sb.material.thickness);
    ctx.restore();
  }
}

function drawFallingBeams(){
  for(const fb of fallingBeams){
    ctx.save();ctx.globalAlpha=Math.min(1,fb.life/20);
    ctx.translate(fb.x,fb.y);ctx.rotate(fb.angle);
    ctx.fillStyle=fb.mat.color;
    ctx.fillRect(-fb.len/2,-fb.mat.thickness/2,fb.len,fb.mat.thickness);
    ctx.restore();
  }
}

function drawSimJoints(){
  for(const sj of simJoints){
    if(sj.fixed) continue;
    ctx.beginPath();ctx.fillStyle='rgba(242,236,221,0.35)';
    ctx.arc(sj.x,sj.y,4,0,Math.PI*2);ctx.fill();
  }
}

function drawDebris(){
  for(const d of debrisParticles){
    ctx.save();ctx.globalAlpha=d.life/40;ctx.fillStyle=d.color;
    ctx.beginPath();ctx.arc(d.x,d.y,3,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

function drawSplash(){
  for(const s of splashParticles){
    ctx.save();ctx.globalAlpha=s.life/35;ctx.fillStyle=s.color;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

function drawOverlays(){
  if(windActive){ctx.save();ctx.globalAlpha=0.08;ctx.fillStyle='#8fb0cc';ctx.fillRect(0,0,W,H);ctx.restore();}
  if(quakeActive){ctx.save();ctx.globalAlpha=0.07;ctx.fillStyle='#d4483a';ctx.fillRect(0,0,W,H);ctx.restore();}
  if(windActive){ctx.save();ctx.font='bold 13px Archivo,sans-serif';ctx.fillStyle='#cfe3ee';ctx.textAlign='left';ctx.fillText('💨 WIND',12,24);ctx.restore();}
  if(quakeActive){ctx.save();ctx.font='bold 13px Archivo,sans-serif';ctx.fillStyle='#e8a33d';ctx.textAlign='left';ctx.fillText('🌋 QUAKE',12,44);ctx.restore();}
}

function drawInspector(){
  if(!inspectedBeam||inspectedBeam.broken) return;
  const sja=simJoints[inspectedBeam.ai],sjb=simJoints[inspectedBeam.bi];
  const mx=(sja.x+sjb.x)/2,my=(sja.y+sjb.y)/2;
  const stress=Math.round(inspectedBeam.stress*100/1.4);
  const lenM=(inspectedBeam.restLen*METERS_PER_PIXEL).toFixed(1);
  const cost=Math.round(inspectedBeam.restLen*METERS_PER_PIXEL*inspectedBeam.material.costPerMeter);
  const lines=[
    `Material: ${inspectedBeam.material.name}`,
    `Segment: ${lenM}m · $${cost.toLocaleString()}`,
    `Stress: ${stress}%`,
    `Status: ${inspectedBeam.stress>1?'⚠️ CRITICAL':inspectedBeam.stress>0.6?'🟠 HIGH':inspectedBeam.stress>0.3?'🟡 MODERATE':'🟢 OK'}`,
  ];
  const pw=190,ph=lines.length*20+20,px=Math.min(mx+10,W-pw-10),py=Math.max(my-ph-10,10);
  ctx.save();
  ctx.fillStyle='rgba(8,20,35,0.9)';ctx.strokeStyle='#e8a33d';ctx.lineWidth=1.5;
  roundedRectPath(px,py,pw,ph,6);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e8a33d';ctx.font='bold 11px "IBM Plex Mono",monospace';ctx.textAlign='left';
  ctx.fillText('BEAM INSPECTOR',px+10,py+16);
  ctx.fillStyle='#cfe3ee';ctx.font='11px "IBM Plex Mono",monospace';
  lines.forEach((l,i)=>ctx.fillText(l,px+10,py+32+i*20));
  ctx.restore();
}

function roundedRectPath(x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

function stressColor(stress,base){
  if(stress<0.45) return base;
  const t=Math.min(1,(stress-0.45)/0.55);
  return `rgb(${Math.round(232+(212-232)*t)},${Math.round(163+(72-163)*t)},${Math.round(61+(58-61)*t)})`;
}

function drawVehicles(){
  for(const v of vehicles){
    const type=VEHICLE_TYPES[v.typeKey];
    const w=type.w,h=type.h,vx=v.x,vy=v.y-h/2-3;
    ctx.save();ctx.translate(vx,vy);
    const wR=Math.max(5,h*0.32),wY=h/2-wR*0.5;
    for(const wx of[-w/2+wR+2,w/2-wR-2]){
      ctx.save();ctx.translate(wx,wY);
      ctx.fillStyle='#1c1c1c';ctx.beginPath();ctx.arc(0,0,wR,0,Math.PI*2);ctx.fill();
      ctx.rotate(v.wheelPhase);ctx.strokeStyle='#555';ctx.lineWidth=1.5;
      for(let s=0;s<4;s++){const a=(Math.PI/2)*s;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*wR*0.8,Math.sin(a)*wR*0.8);ctx.stroke();}
      ctx.restore();
    }
    const r=Math.min(6,h*0.3);
    roundedRectPath(-w/2,-h/2,w,h,r);ctx.fillStyle=type.color;ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.55)';
    roundedRectPath(w/2-w*0.32-w*0.08,-h/2+2,w*0.32,h-4,r*0.7);ctx.fill();
    ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.arc(w/2-2,0,Math.max(2,h*0.08),0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
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
  const rem=BUD()-totalCost;
  el.spent.textContent=`$${Math.round(totalCost).toLocaleString()}`;
  el.budget.textContent=`$${Math.round(rem).toLocaleString()}`;
  el.budget.classList.toggle('over',rem<0);
  if(mode==='build'){
    el.wave.textContent=buildTimerActive?'⏱ Building...':'Ready to test';
    el.instructions.textContent=activeMaterial==='screw'
      ?'① Click a beam to place a junction dot ② Switch material ③ Drag from dot'
      :'Drag from an anchor to draw · Click a beam to delete · Ctrl+Z to undo';
  } else if(mode==='simulating'){
    el.wave.textContent=totalLoadKg>0?`Load: ${totalLoadKg.toLocaleString()} kg on span`:'Span clear — spawn a vehicle';
    el.instructions.textContent='Click any beam to inspect it · Beams turn amber→red as stress builds';
  } else if(mode==='lost'){el.wave.textContent='Bridge failed';}
  else if(mode==='won'){el.wave.textContent='Bridge survived! 🎉';}
  el.testBtn.disabled=mode!=='build';
  if(el.undoBtn) el.undoBtn.disabled=mode!=='build'||history.length===0;
  if(el.symBtn) el.symBtn.classList.toggle('active-tool',symmetryMode);
  if(el.slowBtn) el.slowBtn.classList.toggle('active-tool',slowMo);
  if(el.windBtn) el.windBtn.classList.toggle('active-tool',windActive);
  if(el.quakeBtn) el.quakeBtn.classList.toggle('active-tool',quakeActive);
  if(mode!=='lost'&&mode!=='won') hideBanner();
  renderLeaderboard();
}

function renderLeaderboard(){
  if(!el.lbPanel) return;
  const lb=getLeaderboard();
  if(!lb.length){el.lbPanel.innerHTML='<div class="lb-empty">No scores yet.</div>';return;}
  el.lbPanel.innerHTML='<div class="lb-title">🏆 Best Scores</div>'+
    lb.slice(0,5).map((s,i)=>`<div class="lb-row"><span class="lb-rank">#${i+1}</span><span class="lb-cost">$${s.cost.toLocaleString()}</span><span class="lb-grade">${s.grade}</span><span class="lb-date">${s.date}</span></div>`).join('');
}

function showBanner(title,body,won){
  el.bannerTitle.textContent=title;
  el.bannerBody.innerHTML=body.replace(/\n/g,'<br>');
  el.banner.classList.add('visible');
  el.banner.classList.toggle('banner-won',!!won);
}
function hideBanner(){el.banner.classList.remove('visible');}
function flashMessage(msg){el.instructions.textContent=msg;setTimeout(refreshHUD,2200);}

// ============================================================
// Wiring
// ============================================================
el.testBtn.addEventListener('click',startSimulation);
el.resetBtn.addEventListener('click',resetGame);
el.bannerBtn.addEventListener('click',resetGame);
if(el.undoBtn) el.undoBtn.addEventListener('click',undoAction);
if(el.symBtn) el.symBtn.addEventListener('click',()=>{symmetryMode=!symmetryMode;refreshHUD();});
if(el.slowBtn) el.slowBtn.addEventListener('click',()=>{slowMo=!slowMo;refreshHUD();});
if(el.windBtn) el.windBtn.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}windActive=true;windTimer=180;refreshHUD();});
if(el.quakeBtn) el.quakeBtn.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}quakeActive=true;quakeTimer=120;refreshHUD();});

document.querySelectorAll('.material-card').forEach(card=>{
  card.addEventListener('click',()=>{
    if(card.classList.contains('locked')) return;
    document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('active'));
    card.classList.add('active');
    activeMaterial=card.dataset.material;
    refreshHUD();
  });
});
document.querySelectorAll('.spawn-btn').forEach(btn=>{
  btn.addEventListener('click',()=>spawnVehicle(btn.dataset.type));
});

// Save/load UI
document.getElementById('btn-save')?.addEventListener('click',()=>{
  const inp=document.getElementById('save-name-input');
  const name=(inp?.value||'').trim()||'Bridge '+(getSaves().length+1);
  saveDesign(name); if(inp) inp.value=''; flashMessage('Design saved: '+name);
});

// Challenge mode exit
document.getElementById('btn-free-build')?.addEventListener('click',()=>{
  challengeMode=null;
  document.getElementById('mode-badge').style.display='none';
  document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('locked'));
  resetGame();
});

// Tutorial
document.getElementById('btn-tut-next')?.addEventListener('click',()=>showTutorialStep(tutorialStep+1));
document.getElementById('btn-tut-skip')?.addEventListener('click',()=>showTutorialStep(-1));

window.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.key==='z'){e.preventDefault();undoAction();}
  if(e.key==='s'||e.key==='S') {if(!e.ctrlKey){symmetryMode=!symmetryMode;refreshHUD();}}
  if(e.key==='m'||e.key==='M'){slowMo=!slowMo;refreshHUD();}
  if(e.key==='Escape'){showTutorialStep(-1);inspectedBeam=null;}
});

// First-time tutorial
resizeCanvasForDPR();
initJoints();
buildLevelUI();
buildChallengeUI();
renderSaves();
refreshHUD();
requestAnimationFrame(loop); // start the render loop

if(!localStorage.getItem('tutorialDone')) showTutorialStep(0);
