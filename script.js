/* ============================================================
   LOAD LIMIT — Bridge Engineering Lab  v4.0
   ============================================================ */

// ---------- Canvas ----------
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const W = 900, H = 600;
const GROUND_Y = 440;
const METERS_PER_PIXEL = 0.05;
const SNAP_RADIUS = 30;
const TOWER_H = 170;
let dpr = 1;

// ---------- Camera (zoom/pan) ----------
let zoom = 1, panX = 0, panY = 0;

// ---------- Stars (generated once) ----------
const STARS = Array.from({length:90},()=>({
  x:Math.random()*W, y:Math.random()*(GROUND_Y-60),
  r:0.4+Math.random()*1.6, phase:Math.random()*Math.PI*2
}));

// ---------- Rain ----------
let rainDrops = Array.from({length:90},()=>({
  x:Math.random()*W*1.5, y:Math.random()*H, spd:9+Math.random()*5, len:14+Math.random()*10
}));

// ---------- Audio ----------
let audioCtx=null;
function getAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();return audioCtx;}
function playSnap(){try{const ac=getAudio(),t=ac.currentTime,buf=ac.createBuffer(1,ac.sampleRate*.15,ac.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(ac.sampleRate*.03));const src=ac.createBufferSource();src.buffer=buf;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=800;const g=ac.createGain();g.gain.setValueAtTime(.5,t);src.connect(f);f.connect(g);g.connect(ac.destination);src.start(t);}catch(e){}}
function playSplash(){try{const ac=getAudio(),t=ac.currentTime,o=ac.createOscillator();o.type='sine';o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(40,t+.4);const g=ac.createGain();g.gain.setValueAtTime(.4,t);g.gain.exponentialRampToValueAtTime(.001,t+.5);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.5);}catch(e){}}
let creakInt=null;
function startCreak(){stopCreak();creakInt=setInterval(()=>{try{const ac=getAudio(),t=ac.currentTime,o=ac.createOscillator();o.type='sawtooth';o.frequency.value=80+Math.random()*40;const g=ac.createGain();g.gain.setValueAtTime(.06,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=400;o.connect(f);f.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.3);}catch(e){}},600);}
function stopCreak(){if(creakInt){clearInterval(creakInt);creakInt=null;}}

// ---------- Levels ----------
const LEVELS = [
  {id:0,name:'Narrow Gorge',  chasmLeft:288,chasmRight:612,budget:120000,pier:false,desc:'Short span — master the basics on a tight budget.'},
  {id:1,name:'River Crossing',chasmLeft:234,chasmRight:666,budget:300000,pier:false,desc:'Standard span. Bracing is key for heavy trucks.'},
  {id:2,name:'Grand Canyon',  chasmLeft:162,chasmRight:738,budget:500000,pier:true, desc:'Wide gap with a mid-span pier. Steel trusses only.'},
];
let currentLevel=1;
let challengeMode=null;

const CHALLENGES=[
  // Narrow Gorge
  {id:0,level:0,name:'Speed Run',     desc:'Survive 3 sedans — built in under 90 seconds',budget:120000,timeLimit:90, noScrews:false,materialLock:null,     objective:{vehicle:'sedan',count:3}},
  {id:1,level:0,name:'No Screws',     desc:'Survive a van — no junction screws allowed',  budget:80000, timeLimit:0,  noScrews:true, materialLock:null,     objective:{vehicle:'van'}},
  {id:2,level:0,name:'Budget Master', desc:'Survive a box truck for under $8,000',         budget:8000,  timeLimit:180,noScrews:false,materialLock:null,     objective:{vehicle:'truck',maxCost:8000}},
  {id:3,level:0,name:'Wood Only',     desc:'Survive a sedan using only Wood',              budget:50000, timeLimit:180,noScrews:false,materialLock:['wood'], objective:{vehicle:'sedan'}},
  // River Crossing
  {id:4,level:1,name:'Rush Hour',     desc:'Get 5 vehicles across the span',               budget:300000,timeLimit:300,noScrews:false,materialLock:null,     objective:{vehicle:'van',count:5}},
  {id:5,level:1,name:'Truck Stop',    desc:'Survive 3 box trucks in a row',                budget:200000,timeLimit:240,noScrews:false,materialLock:null,     objective:{vehicle:'truck',count:3}},
  {id:6,level:1,name:'Semi Boss',     desc:'Survive a semi for under $100,000',            budget:100000,timeLimit:300,noScrews:false,materialLock:null,     objective:{vehicle:'semi',maxCost:100000}},
  {id:7,level:1,name:'Wood Semi',     desc:'Survive a semi using only Wood. Seriously.',   budget:150000,timeLimit:0,  noScrews:false,materialLock:['wood'], objective:{vehicle:'semi'}},
  // Grand Canyon
  {id:8,level:2,name:'Steel Only',    desc:'Survive 2 semis using Steel only, under $400k',budget:400000,timeLimit:0, noScrews:false,materialLock:['steel'],objective:{vehicle:'semi',count:2}},
  {id:9,level:2,name:'Budget Canyon', desc:'Survive a box truck for under $50,000',         budget:50000, timeLimit:240,noScrews:false,materialLock:null,    objective:{vehicle:'truck',maxCost:50000}},
  {id:10,level:2,name:'The Impossible',desc:'Survive the Tank. Budget capped at $200k.',   budget:200000,timeLimit:0, noScrews:false,materialLock:null,     objective:{vehicle:'tank'}},
  {id:11,level:2,name:'Semi Rush',    desc:'3 semis must cross — then a tank. All in.',    budget:500000,timeLimit:0, noScrews:false,materialLock:null,     objective:{vehicle:'semi',count:3,thenTank:true}},
];

function lvl(){return LEVELS[currentLevel];}
function CL(){return lvl().chasmLeft;}
function CR(){return lvl().chasmRight;}
function BUD(){return challengeMode?challengeMode.budget:lvl().budget;}
function getAnchors(){
  const a=[
    {x:CL(),  y:GROUND_Y+5,  label:'road'},{x:CL(),  y:GROUND_Y+55,label:'road'},
    {x:CR(),  y:GROUND_Y+5,  label:'road'},{x:CR(),  y:GROUND_Y+55,label:'road'},
    {x:CL()-18,y:GROUND_Y-TOWER_H,  label:'tower'},{x:CL()-18,y:GROUND_Y-TOWER_H/2,label:'tower'},
    {x:CR()+18,y:GROUND_Y-TOWER_H,  label:'tower'},{x:CR()+18,y:GROUND_Y-TOWER_H/2,label:'tower'},
  ];
  if(lvl().pier){const cx=(CL()+CR())/2;a.push({x:cx,y:GROUND_Y+5,label:'road'},{x:cx,y:GROUND_Y+55,label:'road'},{x:cx,y:GROUND_Y+110,label:'road'});}
  return a;
}

// ---------- Materials ----------
const MATERIALS={
  wood:    {key:'wood',    name:'Wood',    color:'#c89a64',dark:'#8a6239',costPerMeter:14, thickness:8, sagBreak:2.5, tensionOnly:false,note:'Cheap & light. Snaps under heavy loads.'},
  steel:   {key:'steel',  name:'Steel',   color:'#a9bdce',dark:'#5d6e7c',costPerMeter:135,thickness:7, sagBreak:22,  tensionOnly:false,note:'Strongest by far. Expensive and heavy.'},
  concrete:{key:'concrete',name:'Concrete',color:'#b3b1a6',dark:'#76746c',costPerMeter:68, thickness:11,sagBreak:9,   tensionOnly:false,note:'Decent strength, very heavy on long spans.'},
  cable:   {key:'cable',  name:'Cable',   color:'#f0c040',dark:'#c08010',costPerMeter:45, thickness:3, sagBreak:35,  tensionOnly:true, note:'Tension only — perfect for suspension bridges.'},
};

// ---------- Vehicles ----------
const VEHICLE_TYPES={
  sedan:{label:'Sedan',    kg:1400, force:0.8, w:46, h:20,color:'#3b6ea5',speed:2.8,emoji:'🚗'},
  van:  {label:'Van',      kg:2800, force:1.6, w:56, h:26,color:'#3b8a5a',speed:2.5,emoji:'🚐'},
  truck:{label:'Box Truck',kg:9000, force:4.5, w:76, h:36,color:'#c97a2b',speed:2.1,emoji:'🚚'},
  semi: {label:'Semi',     kg:18000,force:9.0, w:104,h:42,color:'#a23b3b',speed:1.7,emoji:'🚛'},
  tank: {label:'Tank',     kg:60000,force:28.0,w:120,h:48,color:'#5a4a2a',speed:1.2,emoji:'🪖'},
};

// ---------- Physics ----------
const GRAVITY=.2,DAMPING=.96,ITERATIONS=8,SETTLE_TOTAL=120;

// ---------- Build state ----------
let joints=[],beams=[],nextId=1,totalCost=0,activeMaterial='wood';
let history=[];

// ---------- Sim state ----------
let simJoints=[],simBeams=[],vehicles=[];
let settleFrames=0,totalLoadKg=0;
let mode='build';
let drag=null,pressDownPos=null;
let symmetryMode=false,slowMo=false,nightMode=false;
let windActive=false,quakeActive=false,windTimer=0,quakeTimer=0;
let rainActive=false,rainTimer=0;
let vehiclesCrossed=0,maxLoadSurvived=0,challengeVehicleCount=0;
let debrisParticles=[],splashParticles=[],fallingBeams=[];
let frameCount=0;
let buildTimer=0,buildTimerActive=false;
let inspectedBeam=null;
let hoverBeam=null; // for delete mode hover highlight
let tutorialStep=-1;
let autoSaveData=null;
let tanksSpawned=false; // for semi rush bonus

const TUTORIAL_STEPS=[
  {title:'Welcome to Load Limit!',body:'Build a bridge to get vehicles across the chasm. Let\'s walk through the basics.'},
  {title:'Anchor Points',body:'Amber dots = road anchors. Blue diamonds = suspension tower anchors (cable only). Beams must connect here.'},
  {title:'Drawing Beams',body:'Select a material, then drag from one anchor or joint to another to draw a beam.'},
  {title:'Junction Screws',body:'The ⚙️ Screw adds connection dots along beams so you can build complex trusses.'},
  {title:'Delete Mode',body:'Select 🗑 Delete from Build Tools and click any beam to remove it without accidental deletions.'},
  {title:'Test & Stress',body:'Click "Test Bridge" then spawn vehicles. Beams turn amber → red → snap under load!'},
];

// ---------- Leaderboard / saves ----------
function lbKey(){return `lb_${currentLevel}_${challengeMode?challengeMode.id:'free'}`;}
function getLeaderboard(){try{return JSON.parse(localStorage.getItem(lbKey())||'[]');}catch(e){return[];}}
function saveScore(cost,maxKg,grade){const lb=getLeaderboard();lb.push({cost,maxKg,grade,date:new Date().toLocaleDateString()});lb.sort((a,b)=>a.cost-b.cost);localStorage.setItem(lbKey(),JSON.stringify(lb.slice(0,10)));}
function getSaves(){try{return JSON.parse(localStorage.getItem('saves')||'[]');}catch(e){return[];}}
function saveDesign(name){const saves=getSaves();saves.unshift({name,level:currentLevel,joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost,date:new Date().toLocaleDateString()});localStorage.setItem('saves',JSON.stringify(saves.slice(0,20)));renderSaves();}
function loadDesign(idx){const s=getSaves()[idx];if(!s)return;currentLevel=s.level;initJoints();joints=s.joints;beams=s.beams;totalCost=s.totalCost;nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id))+1;buildLevelUI();refreshHUD();}
function deleteDesign(idx){const saves=getSaves();saves.splice(idx,1);localStorage.setItem('saves',JSON.stringify(saves));renderSaves();}
function renderSaves(){const el=document.getElementById('saves-list');if(!el)return;const saves=getSaves();if(!saves.length){el.innerHTML='<div class="lb-empty">No saved designs yet.</div>';return;}el.innerHTML=saves.map((s,i)=>`<div class="save-row"><div class="save-name">${s.name}</div><div class="save-meta">${LEVELS[s.level]?.name||''} · $${s.totalCost?.toLocaleString()||0}</div><div class="save-actions"><button onclick="loadDesign(${i})" class="save-act-btn">Load</button><button onclick="deleteDesign(${i})" class="save-act-btn del">✕</button></div></div>`).join('');}
function autoSave(){autoSaveData={level:currentLevel,joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost};localStorage.setItem('autosave',JSON.stringify(autoSaveData));}
function restoreAutoSave(){const d=JSON.parse(localStorage.getItem('autosave')||'null');if(!d){flashMessage('No auto-save found.');return;}currentLevel=d.level;joints=d.joints;beams=d.beams;totalCost=d.totalCost;nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id))+1;buildLevelUI();resetGame();}

// ============================================================
// Init
// ============================================================
function initJoints(){joints=getAnchors().map(a=>({id:nextId++,x:a.x,y:a.y,fixed:true,isTower:a.label==='tower'}));beams=[];totalCost=0;history=[];}

function resizeCanvasForDPR(){dpr=window.devicePixelRatio||1;canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';}

function buildLevelUI(){const wrap=document.getElementById('level-tabs');if(!wrap)return;wrap.innerHTML='';LEVELS.forEach((lv,i)=>{const btn=document.createElement('button');btn.className='level-tab'+(i===currentLevel?' active':'');btn.textContent=lv.name;btn.addEventListener('click',()=>{currentLevel=i;challengeMode=null;resetGame();buildLevelUI();buildChallengeUI();});wrap.appendChild(btn);});const desc=document.getElementById('level-desc');if(desc)desc.textContent=lvl().desc;}
function buildChallengeUI(){const wrap=document.getElementById('challenge-list');if(!wrap)return;const rel=CHALLENGES.filter(c=>c.level===currentLevel);wrap.innerHTML=rel.map(c=>`<button class="challenge-btn" data-cid="${c.id}"><span class="ch-name">${c.name}</span><span class="ch-desc">${c.desc}</span></button>`).join('');wrap.querySelectorAll('.challenge-btn').forEach(btn=>btn.addEventListener('click',()=>startChallenge(parseInt(btn.dataset.cid))));}
function startChallenge(id){const ch=CHALLENGES.find(c=>c.id===id);if(!ch)return;currentLevel=ch.level;challengeMode=ch;resetGame();buildLevelUI();if(ch.timeLimit>0){buildTimer=ch.timeLimit*60;buildTimerActive=true;}document.getElementById('mode-badge').textContent='🎯 '+ch.name;document.getElementById('mode-badge').style.display='block';document.querySelectorAll('.material-card').forEach(card=>{card.classList.toggle('locked',!!(ch.materialLock&&!ch.materialLock.includes(card.dataset.material)&&card.dataset.material!=='screw'&&card.dataset.material!=='delete'));});refreshHUD();}

// ============================================================
// Tutorial
// ============================================================
function showTutorialStep(s){tutorialStep=s;const el=document.getElementById('tutorial-overlay');if(!el)return;if(s<0||s>=TUTORIAL_STEPS.length){el.style.display='none';tutorialStep=-1;localStorage.setItem('tutorialDone','1');return;}const step=TUTORIAL_STEPS[s];document.getElementById('tut-title').textContent=step.title;document.getElementById('tut-body').textContent=step.body;document.getElementById('tut-step').textContent=`${s+1} / ${TUTORIAL_STEPS.length}`;el.style.display='flex';}

// ============================================================
// Undo
// ============================================================
function pushHistory(){history.push({joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost});if(history.length>60)history.shift();}
function undoAction(){if(!history.length){flashMessage('Nothing to undo.');return;}const snap=history.pop();joints=snap.joints;beams=snap.beams;totalCost=snap.totalCost;nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id),nextId)+1;refreshHUD();}

// ============================================================
// Copy Left Half
// ============================================================
function copyLeftHalf(){
  if(mode!=='build'){flashMessage('Switch to build mode first.');return;}
  const cx=(CL()+CR())/2;
  const leftBeams=beams.filter(b=>{const a=jointById(b.aId),c=jointById(b.bId);return a&&c&&a.x<=cx+5&&c.x<=cx+5;});
  if(!leftBeams.length){flashMessage('Build beams on the left side first.');return;}
  pushHistory();
  const idMap=new Map();
  // Mirror free joints on left
  for(const j of joints){
    if(j.fixed||j.x>cx+5)continue;
    const mx=cx+(cx-j.x),my=j.y;
    const existing=findNearestJoint(mx,my,10);
    if(existing){idMap.set(j.id,existing.id);}
    else{const nj=addJoint(mx,my,false);idMap.set(j.id,nj.id);}
  }
  // Mirror beams
  for(const b of leftBeams){
    const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c)continue;
    const getM=j=>{if(j.isTower){const mx=cx+(cx-j.x);return joints.find(jj=>jj.isTower&&Math.abs(jj.x-mx)<12&&Math.abs(jj.y-j.y)<12);}if(j.fixed){const mx=cx+(cx-j.x);return joints.find(jj=>jj.fixed&&!jj.isTower&&Math.abs(jj.x-mx)<12&&Math.abs(jj.y-j.y)<12);}return joints.find(jj=>jj.id===idMap.get(j.id));};
    const ma=getM(a),mc=getM(c);
    if(ma&&mc&&ma.id!==mc.id&&!beamExists(ma.id,mc.id))addBeam(ma,mc,b.material);
  }
  flashMessage('✓ Left half mirrored to right!');
}

// ============================================================
// Input
// ============================================================
canvas.style.touchAction='none';

canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const r=canvas.getBoundingClientRect();
  const cssX=(e.clientX-r.left)*(W/r.width);
  const cssY=(e.clientY-r.top)*(H/r.height);
  const factor=e.deltaY<0?1.15:.87;
  const nz=Math.max(.5,Math.min(4,zoom*factor));
  panX=cssX-(cssX-panX)*(nz/zoom);
  panY=cssY-(cssY-panY)*(nz/zoom);
  zoom=nz;
},{passive:false});

canvas.addEventListener('pointerdown',e=>{
  getAudio();
  if(mode==='simulating'){const p=canvasPos(e);inspectedBeam=findSimBeamNear(p.x,p.y,12);return;}
  if(mode!=='build')return;
  const p=canvasPos(e);pressDownPos=p;
  if(activeMaterial==='delete'){const hit=findBeamNear(p.x,p.y,12);if(hit){pushHistory();removeBeam(hit.id);}drag=null;return;}
  if(activeMaterial==='screw'){
    if(challengeMode?.noScrews){flashMessage('Challenge: no junction screws allowed!');return;}
    const hit=findBeamNear(p.x,p.y,20);if(hit){pushHistory();const j=splitBeamAt(hit,p.x,p.y);j.isScrew=true;}else flashMessage('Click directly on a beam to place a junction.');drag=null;return;
  }
  drag={from:findNearestJoint(p.x,p.y,SNAP_RADIUS),x:p.x,y:p.y};
});
canvas.addEventListener('pointermove',e=>{
  if(mode==='build'&&activeMaterial==='delete'){const p=canvasPos(e);hoverBeam=findBeamNear(p.x,p.y,12);}
  if(mode!=='build'||!drag)return;
  const p=canvasPos(e);drag.x=p.x;drag.y=p.y;
});
canvas.addEventListener('pointerup',e=>{
  if(mode!=='build'||!drag){drag=null;return;}
  const p=canvasPos(e);
  const moved=dist(p.x,p.y,pressDownPos.x,pressDownPos.y)>6;
  if(!moved){const hit=findBeamNear(p.x,p.y,7);if(hit&&activeMaterial!=='delete'&&activeMaterial!=='screw'){pushHistory();removeBeam(hit.id);}drag=null;return;}
  const from=drag.from||addJoint(pressDownPos.x,pressDownPos.y,false);
  const to=findNearestJoint(p.x,p.y,SNAP_RADIUS)||addJoint(p.x,p.y,false);
  if(from.id!==to.id&&!beamExists(from.id,to.id)){
    pushHistory();addBeam(from,to,activeMaterial);
    if(symmetryMode){const cx=(CL()+CR())/2;const mf=mirrorJoint(from,cx),mt=mirrorJoint(to,cx);if(mf.id!==mt.id&&!beamExists(mf.id,mt.id))addBeam(mf,mt,activeMaterial);}
  }
  drag=null;
});
canvas.addEventListener('pointerleave',()=>{drag=null;hoverBeam=null;});

function mirrorJoint(j,cx){if(j.fixed){const mx=cx+(cx-j.x),my=j.y;return joints.find(jj=>jj.fixed&&Math.abs(jj.x-mx)<8&&Math.abs(jj.y-my)<8)||addJoint(mx,my,false);}const mx=cx+(cx-j.x),my=j.y;return findNearestJoint(mx,my,10)||addJoint(mx,my,false);}
function canvasPos(e){const r=canvas.getBoundingClientRect();const cssX=(e.clientX-r.left)*(W/r.width);const cssY=(e.clientY-r.top)*(H/r.height);return{x:(cssX-panX)/zoom,y:(cssY-panY)/zoom};}

// ============================================================
// Build helpers
// ============================================================
function addJoint(x,y,fixed){const j={id:nextId++,x,y,fixed};joints.push(j);return j;}
function addBeam(a,b,matKey){
  if(matKey==='delete'||matKey==='screw')return;
  if(challengeMode?.materialLock&&!challengeMode.materialLock.includes(matKey)){flashMessage('Challenge: only '+challengeMode.materialLock.join('/')+' allowed!');return;}
  if((a.isTower||b.isTower)&&matKey!=='cable'){flashMessage('⚠️ Tower anchors only accept Cable.');return;}
  const mat=MATERIALS[matKey],len=dist(a.x,a.y,b.x,b.y);
  beams.push({id:nextId++,aId:a.id,bId:b.id,material:matKey,length:len});
  totalCost+=len*METERS_PER_PIXEL*mat.costPerMeter;
  refreshHUD();
}
function removeBeam(id){const b=beams.find(b=>b.id===id);if(!b)return;totalCost-=b.length*METERS_PER_PIXEL*MATERIALS[b.material].costPerMeter;beams=beams.filter(x=>x.id!==id);joints=joints.filter(j=>j.fixed||beams.some(bm=>bm.aId===j.id||bm.bId===j.id));refreshHUD();}
function beamExists(aId,bId){return beams.some(b=>(b.aId===aId&&b.bId===bId)||(b.aId===bId&&b.bId===aId));}
function findNearestJoint(x,y,r){let best=null,bestD=r;for(const j of joints){const d=dist(x,y,j.x,j.y);if(d<bestD){best=j;bestD=d;}}return best;}
function findBeamNear(x,y,tol){let best=null,bestD=tol;for(const b of beams){const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c)continue;const d=distToSegment(x,y,a.x,a.y,c.x,c.y);if(d<bestD){best=b;bestD=d;}}return best;}
function findSimBeamNear(x,y,tol){let best=null,bestD=tol;for(const sb of simBeams){if(sb.broken)continue;const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];const d=distToSegment(x,y,sja.x,sja.y,sjb.x,sjb.y);if(d<bestD){best=sb;bestD=d;}}return best;}
function jointById(id){return joints.find(j=>j.id===id);}
function dist(x1,y1,x2,y2){return Math.hypot(x2-x1,y2-y1);}
function distToSegment(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy||1;const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/l2));return dist(px,py,x1+t*dx,y1+t*dy);}
function splitBeamAt(beam,x,y){const a=jointById(beam.aId),b=jointById(beam.bId);const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1;const t=Math.max(.08,Math.min(.92,((x-a.x)*dx+(y-a.y)*dy)/l2));const mat=beam.material;removeBeam(beam.id);const nj=addJoint(a.x+t*dx,a.y+t*dy,false);addBeam(a,nj,mat);addBeam(nj,b,mat);return nj;}

// ============================================================
// Simulation
// ============================================================
function startSimulation(){
  if(!beams.length){flashMessage('Build at least one beam first.');return;}
  autoSave(); // snapshot before test
  const jMap=new Map();
  simJoints=joints.map((j,i)=>{jMap.set(j.id,i);return{x:j.x,y:j.y,px:j.x,py:j.y,fixed:!!j.fixed};});
  const SEG=38;simBeams=[];
  for(const rb of beams){
    const ai=jMap.get(rb.aId),bi=jMap.get(rb.bId);
    const sja=simJoints[ai],sjb=simJoints[bi];
    const n=Math.max(2,Math.ceil(Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/SEG));
    const sl=Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/n;
    let prev=ai;
    for(let s=1;s<n;s++){const t=s/n,ni=simJoints.length;simJoints.push({x:sja.x+(sjb.x-sja.x)*t,y:sja.y+(sjb.y-sja.y)*t,px:sja.x+(sjb.x-sja.x)*t,py:sja.y+(sjb.y-sja.y)*t,fixed:false});simBeams.push({ai:prev,bi:ni,restLen:sl,material:MATERIALS[rb.material],broken:false,stress:0});prev=ni;}
    simBeams.push({ai:prev,bi:bi,restLen:sl,material:MATERIALS[rb.material],broken:false,stress:0});
  }
  vehicles=[];settleFrames=SETTLE_TOTAL;totalLoadKg=0;vehiclesCrossed=0;maxLoadSurvived=0;challengeVehicleCount=0;tanksSpawned=false;
  debrisParticles=[];splashParticles=[];fallingBeams=[];buildTimerActive=false;inspectedBeam=null;
  mode='simulating';flashMessage('✓ Auto-saved before test — use "Restore Auto-Save" to get it back');refreshHUD();
}

function rainMult(){return rainActive?1.2:1.0;}

function simulationStep(){
  frameCount++;
  if(windActive){windTimer--;if(windTimer<=0)windActive=false;}
  if(quakeActive){quakeTimer--;if(quakeTimer<=0)quakeActive=false;}
  if(rainActive){rainTimer--;if(rainTimer<=0)rainActive=false;}

  for(const sj of simJoints){
    if(sj.fixed)continue;
    let vx=(sj.x-sj.px)*DAMPING,vy=(sj.y-sj.py)*DAMPING;
    sj.px=sj.x;sj.py=sj.y;
    if(windActive)vx+=.18*Math.sin(frameCount*.05);
    if(quakeActive){vx+=.35*(Math.random()-.5)*2;vy+=.15*(Math.random()-.5);}
    sj.x+=vx;sj.y+=vy+GRAVITY;
  }

  if(settleFrames===0){
    for(const v of vehicles){
      const type=VEHICLE_TYPES[v.typeKey];
      const aff=[];
      for(let i=0;i<simJoints.length;i++){const sj=simJoints[i];if(sj.fixed)continue;const dx=Math.abs(sj.x-v.x),dy=sj.y-(GROUND_Y+5);if(dx<type.w*.75&&dy>-10&&dy<130)aff.push({i,p:1-dx/(type.w*.75)});}
      if(aff.length){const tw=aff.reduce((s,a)=>s+a.p,0);for(const{i,p}of aff)simJoints[i].y+=type.force*(p/tw)*rainMult();}
    }
  }

  for(let iter=0;iter<ITERATIONS;iter++){
    for(const sb of simBeams){
      if(sb.broken)continue;
      const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
      const dx=sjb.x-sja.x,dy=sjb.y-sja.y,cur=Math.hypot(dx,dy);if(cur<.001)continue;
      if(sb.material.tensionOnly&&cur<=sb.restLen)continue;
      const diff=(cur-sb.restLen)/cur*.5;
      if(!sja.fixed&&!sjb.fixed){sja.x+=dx*diff;sja.y+=dy*diff;sjb.x-=dx*diff;sjb.y-=dy*diff;}
      else if(!sja.fixed){sja.x+=dx*diff*2;sja.y+=dy*diff*2;}
      else if(!sjb.fixed){sjb.x-=dx*diff*2;sjb.y-=dy*diff*2;}
    }
  }

  let maxStress=0;
  const rainBreak=rainActive?.85:1;
  if(settleFrames>0){for(const sj of simJoints)if(!sj.fixed)sj.baseY=sj.y;settleFrames--;}
  else{
    for(const sb of simBeams){
      if(sb.broken)continue;
      const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
      const sagA=sja.fixed?0:Math.max(0,sja.y-(sja.baseY??sja.y));
      const sagB=sjb.fixed?0:Math.max(0,sjb.y-(sjb.baseY??sjb.y));
      const sag=Math.max(sagA,sagB);
      sb.stress=Math.min(1.4,sag/(sb.material.sagBreak*.7*rainBreak));
      maxStress=Math.max(maxStress,sb.stress);
      if(sag>sb.material.sagBreak*rainBreak){
        sb.broken=true;playSnap();
        const bx=(sja.x+sjb.x)/2,by=(sja.y+sjb.y)/2;
        fallingBeams.push({x:bx,y:by,vx:(Math.random()-.5)*3,vy:-1-Math.random()*2,angle:Math.atan2(sjb.y-sja.y,sjb.x-sja.x),av:(Math.random()-.5)*.2,len:sb.restLen,mat:sb.material,life:90});
        for(let i=0;i<8;i++)debrisParticles.push({x:bx,y:by,vx:(Math.random()-.5)*5,vy:-Math.random()*4-1,life:40,color:sb.material.color});
        if(bx>CL()&&bx<CR()&&mode==='simulating')triggerLoss(sb.material.name+' beam snapped');
      }
    }
    if(maxStress>.75&&!creakInt)startCreak();
    else if(maxStress<.5)stopCreak();
  }

  for(const fb of fallingBeams){fb.x+=fb.vx;fb.y+=fb.vy;fb.vy+=.4;fb.angle+=fb.av;fb.life--;if(fb.y>H-30&&fb.life>10){fb.life=10;if(fb.y>H-20){playSplash();spawnSplash(fb.x,H-30);}}}
  fallingBeams=fallingBeams.filter(f=>f.life>0);
  for(const d of debrisParticles){d.x+=d.vx;d.y+=d.vy;d.vy+=.25;d.life--;}
  debrisParticles=debrisParticles.filter(d=>d.life>0);
  for(const s of splashParticles){s.x+=s.vx;s.y+=s.vy;s.vy+=.15;s.r*=.95;s.life--;}
  splashParticles=splashParticles.filter(s=>s.life>0);

  stepVehicles();
}

function spawnSplash(x,y){for(let i=0;i<12;i++){const a=-Math.PI/2+(Math.random()-.5)*Math.PI;splashParticles.push({x,y,vx:Math.cos(a)*(1+Math.random()*3),vy:Math.sin(a)*(1+Math.random()*4),r:3+Math.random()*4,life:35,color:'#4aa0d0'});}}

function getBridgeSurfaceY(vx){
  let sy=null;
  for(const sb of simBeams){
    if(sb.broken||sb.material.tensionOnly)continue;
    const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
    const minX=Math.min(sja.x,sjb.x),maxX=Math.max(sja.x,sjb.x);
    if(vx<minX||vx>maxX)continue;
    const t=(vx-sja.x)/((sjb.x-sja.x)||.001);
    const beamY=sja.y+t*(sjb.y-sja.y);
    if(beamY>GROUND_Y-80&&beamY<GROUND_Y+80)if(sy===null||beamY<sy)sy=beamY;
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
    const spd=type.speed*(slowMo?.2:1);
    v.x+=spd;v.wheelPhase+=spd*.35;
    const onL=v.x<=CL(),onR=v.x>=CR();
    if(onL||onR){v.y=GROUND_Y;v.vy=0;}
    else{const sy=getBridgeSurfaceY(v.x);if(sy!==null&&v.y>=sy){v.y=sy;v.vy=0;totalLoadKg+=type.kg;}else{v.vy+=.6;v.y+=v.vy;}}
    if(v.x>CL()&&v.x<CR()){v.trail.push({x:v.x,y:v.y,age:0});if(v.trail.length>60)v.trail.shift();}
    for(const tp of v.trail)tp.age++;
    if(v.y>H+60){v.done=true;if(v.x>CL()&&v.x<CR()&&mode==='simulating'){playSplash();spawnSplash(v.x,H-30);triggerLoss('vehicle fell into the chasm');}}
    if(v.x>CR()+20&&v.y<=GROUND_Y+5&&!v.counted){
      v.counted=true;vehiclesCrossed++;challengeVehicleCount++;maxLoadSurvived=Math.max(maxLoadSurvived,type.kg);
      if(challengeMode){
        const obj=challengeMode.objective;
        const cnt=obj.count||1;
        if(obj.thenTank&&challengeVehicleCount>=cnt&&!tanksSpawned){tanksSpawned=true;setTimeout(()=>spawnVehicle('tank'),2000);}
        else if(!obj.thenTank&&challengeVehicleCount>=cnt){
          if(!obj.maxCost||totalCost<=obj.maxCost)triggerWin();
          else triggerLoss('cost $'+Math.round(totalCost).toLocaleString()+' exceeded $'+obj.maxCost.toLocaleString());
        }
        if(obj.thenTank&&v.typeKey==='tank'&&v.counted)triggerWin();
      }
    }
    if(v.x>W+80)v.done=true;
  }
  vehicles=vehicles.filter(v=>!v.done);
}

function triggerLoss(reason){if(mode!=='simulating')return;stopCreak();mode='lost';const grade=calcGrade(false);refreshHUD();showBanner('💥 Bridge Failure',`Cause: ${reason}\n\nSurvived ${vehiclesCrossed} vehicle(s) · Max: ${maxLoadSurvived.toLocaleString()} kg\n\nCost: $${Math.round(totalCost).toLocaleString()} · Grade: ${grade}`,false);}
function triggerWin(){if(mode!=='simulating')return;stopCreak();mode='won';const grade=calcGrade(true);saveScore(Math.round(totalCost),maxLoadSurvived,grade);refreshHUD();showBanner('🏗️ Bridge Survived!',`All vehicles crossed safely!\n\nCost: $${Math.round(totalCost).toLocaleString()} · Max load: ${maxLoadSurvived.toLocaleString()} kg\n\nGrade: ${grade} — ${gradeDesc(grade)}`,true);}
function calcGrade(won){if(!won)return'F';const r=totalCost/BUD();const p=simBeams.reduce((m,sb)=>Math.max(m,sb.stress),0);if(r<.25&&p<.6)return'A+';if(r<.35)return'A';if(r<.5)return'B';if(r<.7)return'C';if(r<.9)return'D';return'D-';}
function gradeDesc(g){return{'A+':'Masterful. Minimal material, maximum strength.','A':'Excellent. Very cost-efficient.','B':'Good. Some room to trim the budget.','C':'Solid but could be leaner.','D':'Barely held. Try a truss next time.','D-':'Technically passed.','F':'Back to the drawing board.'}[g]||'';}

function resetGame(){stopCreak();simJoints=[];simBeams=[];vehicles=[];debrisParticles=[];splashParticles=[];fallingBeams=[];totalLoadKg=0;vehiclesCrossed=0;maxLoadSurvived=0;challengeVehicleCount=0;tanksSpawned=false;windActive=false;quakeActive=false;rainActive=false;slowMo=false;buildTimerActive=false;inspectedBeam=null;hoverBeam=null;zoom=1;panX=0;panY=0;mode='build';initJoints();refreshHUD();hideBanner();if(!challengeMode){document.getElementById('mode-badge').style.display='none';document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('locked'));}}

// ============================================================
// Rendering
// ============================================================
function loop(){
  if(mode==='simulating')simulationStep();
  if(buildTimerActive&&mode==='build'){buildTimer--;if(buildTimer<=0){buildTimerActive=false;flashMessage('⏱ Time\'s up! Testing now...');setTimeout(startSimulation,500);}}
  draw();
  requestAnimationFrame(loop);
}

function draw(){
  // Clear
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  // Apply zoom/pan
  ctx.setTransform(dpr*zoom,0,0,dpr*zoom,panX*dpr,panY*dpr);

  drawSky();
  drawTerrain();
  if(mode==='build'){
    drawSpanDimension();drawAnchors();drawBeamsBuildMode();drawJointsBuildMode();
    if(drag&&activeMaterial!=='delete'&&activeMaterial!=='screw')drawDragLine();
    if(buildTimerActive)drawTimer();
  } else {
    drawTrails();drawBeamsPhysics();drawFallingBeams();drawSimJoints();drawDebris();drawSplash();drawVehicles();drawOverlays();drawInspector();
  }
  if(rainActive)drawRain();
  // Reset transform
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

// ---- Sky ----
function drawSky(){
  const dark=nightMode?'#010810':'#071828';
  const mid=nightMode?'#030f1e':'#0a3158';
  const grad=ctx.createLinearGradient(0,0,0,GROUND_Y);
  grad.addColorStop(0,dark);grad.addColorStop(1,mid);
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;
  for(let x=0;x<=W;x+=25){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  if(nightMode)drawStars();
  // Clouds (only in day mode)
  if(!nightMode){
    for(const c of clouds){c.x=(c.x+c.speed)%W;ctx.save();ctx.globalAlpha=.18;ctx.fillStyle='#fff';[[0,0,c.w*.6,18],[c.w*.2,-10,c.w*.5,22],[c.w*.5,-4,c.w*.5,16]].forEach(([ox,oy,cw,ch])=>{ctx.beginPath();ctx.ellipse(c.x+ox,c.y+oy,cw/2,ch/2,0,0,Math.PI*2);ctx.fill();});ctx.restore();}
  }
  // Moon in night mode
  if(nightMode){ctx.save();ctx.fillStyle='#fffce8';ctx.shadowBlur=30;ctx.shadowColor='#fffce8';ctx.beginPath();ctx.arc(820,60,22,0,Math.PI*2);ctx.fill();ctx.restore();}
  // Mountains
  ctx.fillStyle=nightMode?'#060e18':'#0d2a45';
  [[0,280,200],[150,240,220],[600,260,200],[750,230,250]].forEach(([x,py,pw])=>{ctx.beginPath();ctx.moveTo(x,GROUND_Y);ctx.lineTo(x+pw/2,py);ctx.lineTo(x+pw,GROUND_Y);ctx.closePath();ctx.fill();});
  // Trees
  drawTrees(20,GROUND_Y-5,CL()-50,8);
  drawTrees(CR()+20,GROUND_Y-5,W-CR()-40,8);
}

function drawStars(){
  for(const s of STARS){
    const alpha=.4+.6*Math.sin(s.phase+frameCount*.02);
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

const clouds=Array.from({length:5},(_,i)=>({x:100+i*200,y:40+Math.sin(i)*30,w:80+i*20,speed:.15+i*.05}));

function drawTrees(startX,y,totalW,count){const sp=totalW/(count+1);for(let i=1;i<=count;i++){const x=startX+sp*i,h=20+Math.sin(i*7)*8;const tc=nightMode?'#061a0e':'#0d3a25';ctx.fillStyle=tc;[[0,h*.4,8],[0,h*.75,10],[0,h,7]].forEach(([oy,ty,hw])=>{ctx.beginPath();ctx.moveTo(x,y-oy);ctx.lineTo(x-hw,y-ty);ctx.lineTo(x+hw,y-ty);ctx.closePath();ctx.fill();});}}

// ---- Terrain ----
function drawTerrain(){
  // Water
  const wg=ctx.createLinearGradient(0,GROUND_Y,0,H);
  wg.addColorStop(0,nightMode?'#020f1c':'#04203b');wg.addColorStop(1,nightMode?'#010810':'#03152a');
  ctx.fillStyle=wg;ctx.fillRect(CL(),GROUND_Y,CR()-CL(),H-GROUND_Y);
  // Water shimmer / moonlight
  ctx.strokeStyle=nightMode?'rgba(200,220,255,0.12)':'rgba(100,160,220,0.15)';ctx.lineWidth=1;
  for(let i=0;i<6;i++){const wy=GROUND_Y+50+i*40+Math.sin(frameCount*.025+i)*5;ctx.beginPath();ctx.moveTo(CL(),wy);ctx.lineTo(CR(),wy);ctx.stroke();}
  // Pier
  if(lvl().pier){const cx=(CL()+CR())/2;ctx.fillStyle='#2a3a42';ctx.fillRect(cx-12,GROUND_Y+5,24,H-GROUND_Y);ctx.fillStyle='#3a4a52';ctx.fillRect(cx-14,GROUND_Y,28,12);}
  // Tower pylons
  ctx.fillStyle='#2a3a52';
  [[CL()-18,GROUND_Y-TOWER_H],[CR()+18,GROUND_Y-TOWER_H]].forEach(([tx,ty])=>{
    ctx.fillRect(tx-5,ty,10,GROUND_Y-ty+5);
    ctx.fillRect(tx-18,ty+30,36,6);ctx.fillRect(tx-14,ty+55,28,5);
    ctx.save();ctx.fillStyle='#64b4ff';if(nightMode){ctx.shadowBlur=15;ctx.shadowColor='#64b4ff';}
    ctx.beginPath();ctx.arc(tx,ty,5,0,Math.PI*2);ctx.fill();ctx.restore();
  });
  // Cliffs
  ctx.fillStyle=nightMode?'#1e2e38':'#3a4a52';
  ctx.fillRect(0,GROUND_Y,CL(),H-GROUND_Y);ctx.fillRect(CR(),GROUND_Y,W-CR(),H-GROUND_Y);
  ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;
  for(let i=-H;i<CL()+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  for(let i=CR()-H;i<W+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  ctx.strokeStyle='#cfe3ee';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,GROUND_Y);ctx.lineTo(CL(),GROUND_Y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(CR(),GROUND_Y);ctx.lineTo(W,GROUND_Y);ctx.stroke();
}

function drawSpanDimension(){
  const y=GROUND_Y+115;ctx.save();ctx.strokeStyle='#7fa8c9';ctx.fillStyle='#7fa8c9';
  ctx.font='12px "IBM Plex Mono",monospace';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(CL(),y);ctx.lineTo(CR(),y);ctx.stroke();
  [CL(),CR()].forEach(x=>{ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x,y+6);ctx.stroke();});
  ctx.textAlign='center';ctx.fillText(`SPAN: ${((CR()-CL())*METERS_PER_PIXEL).toFixed(0)} m`,(CL()+CR())/2,y+18);
  ctx.restore();
}

function drawAnchors(){
  for(const a of getAnchors()){
    if(a.label==='tower'){
      ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.PI/4);
      ctx.beginPath();ctx.fillStyle='rgba(100,180,255,0.2)';ctx.rect(-10,-10,20,20);ctx.fill();
      ctx.beginPath();ctx.fillStyle='#64b4ff';if(nightMode){ctx.shadowBlur=10;ctx.shadowColor='#64b4ff';}ctx.rect(-6,-6,12,12);ctx.fill();
      ctx.strokeStyle='#16212c';ctx.lineWidth=2;ctx.stroke();ctx.restore();
      if(a.y<GROUND_Y-TOWER_H+20){ctx.save();ctx.font='9px "IBM Plex Mono",monospace';ctx.fillStyle='#64b4ff';ctx.textAlign='center';ctx.fillText('cable only',a.x,a.y+22);ctx.restore();}
    } else {
      ctx.beginPath();ctx.fillStyle='rgba(232,163,61,0.25)';ctx.arc(a.x,a.y,12,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.fillStyle='#e8a33d';if(nightMode){ctx.shadowBlur=8;ctx.shadowColor='#e8a33d';}ctx.arc(a.x,a.y,7,0,Math.PI*2);ctx.fill();
      ctx.lineWidth=2;ctx.strokeStyle='#16212c';ctx.stroke();ctx.shadowBlur=0;
    }
  }
  if(symmetryMode){const cx=(CL()+CR())/2;ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle='rgba(232,163,61,0.4)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,GROUND_Y);ctx.stroke();ctx.restore();}
}

function drawJointsBuildMode(){
  for(const j of joints){
    if(j.fixed)continue;
    const nm=getAnchors().some(a=>dist(j.x,j.y,a.x,a.y)<45);
    if(nm){ctx.beginPath();ctx.strokeStyle='#d4483a';ctx.lineWidth=2;ctx.setLineDash([3,3]);ctx.arc(j.x,j.y,14,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    ctx.beginPath();ctx.fillStyle=j.isScrew?'#e8a33d':'#f2ecdd';ctx.arc(j.x,j.y,j.isScrew?7:5,0,Math.PI*2);ctx.fill();
    ctx.lineWidth=j.isScrew?2:1.5;ctx.strokeStyle='#16212c';ctx.stroke();
    if(j.isScrew){ctx.beginPath();ctx.strokeStyle='rgba(232,163,61,0.35)';ctx.lineWidth=1;ctx.arc(j.x,j.y,14,0,Math.PI*2);ctx.stroke();}
  }
}

function drawBeamsBuildMode(){
  for(const b of beams){
    const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c)continue;
    const mat=MATERIALS[b.material];
    const isHover=(hoverBeam?.id===b.id&&activeMaterial==='delete');
    ctx.lineWidth=mat.thickness+(isHover?4:0);
    ctx.strokeStyle=isHover?'#d4483a':mat.color;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
    if(!isHover){ctx.lineWidth=2;ctx.strokeStyle=mat.dark;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();}
  }
}

function drawDragLine(){
  const mat=MATERIALS[activeMaterial];
  const start=drag.from?{x:drag.from.x,y:drag.from.y}:pressDownPos;
  ctx.save();ctx.setLineDash([6,5]);ctx.lineWidth=mat.thickness;ctx.strokeStyle=mat.color;ctx.globalAlpha=.75;
  ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(drag.x,drag.y);ctx.stroke();ctx.restore();
  const d=dist(start.x,start.y,drag.x,drag.y);
  if(d>20){const mx=(start.x+drag.x)/2,my=(start.y+drag.y)/2;const cost=Math.round(d*METERS_PER_PIXEL*mat.costPerMeter);ctx.save();ctx.font='11px "IBM Plex Mono",monospace';ctx.fillStyle='#cfe3ee';ctx.textAlign='center';ctx.fillText(`${(d*METERS_PER_PIXEL).toFixed(1)}m · $${cost.toLocaleString()}`,mx,my-10);ctx.restore();}
  const snap=findNearestJoint(drag.x,drag.y,SNAP_RADIUS);
  if(snap){ctx.beginPath();ctx.strokeStyle='#49b07d';ctx.lineWidth=2;ctx.arc(snap.x,snap.y,SNAP_RADIUS,0,Math.PI*2);ctx.stroke();}
}

function drawTimer(){const secs=Math.ceil(buildTimer/60);const col=secs<30?'#d4483a':secs<60?'#e8a33d':'#cfe3ee';ctx.save();ctx.font='bold 18px "IBM Plex Mono",monospace';ctx.fillStyle=col;ctx.textAlign='right';ctx.fillText(`⏱ ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`,W-14,28);ctx.restore();}

function drawTrails(){
  for(const v of vehicles){if(!v.trail||v.trail.length<2)continue;for(let i=1;i<v.trail.length;i++){const p=v.trail[i-1],q=v.trail[i];ctx.save();ctx.globalAlpha=Math.max(0,(60-q.age)/60)*.3;ctx.strokeStyle='#8a6239';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.restore();}}
}

function drawBeamsPhysics(){
  for(const sb of simBeams){
    const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
    ctx.save();ctx.translate((sja.x+sjb.x)/2,(sja.y+sjb.y)/2);ctx.rotate(Math.atan2(sjb.y-sja.y,sjb.x-sja.x));
    const half=sb.restLen/2;
    if(sb.broken){ctx.globalAlpha=.15;ctx.fillStyle='#d4483a';}
    else{
      const col=stressColor(sb.stress,sb.material.color);
      if(nightMode&&sb.stress>.3){ctx.shadowBlur=8+sb.stress*12;ctx.shadowColor=col;}
      ctx.fillStyle=col;
    }
    ctx.fillRect(-half,-sb.material.thickness/2,half*2,sb.material.thickness);
    ctx.restore();
  }
}

function drawFallingBeams(){for(const fb of fallingBeams){ctx.save();ctx.globalAlpha=Math.min(1,fb.life/20);ctx.translate(fb.x,fb.y);ctx.rotate(fb.angle);ctx.fillStyle=fb.mat.color;ctx.fillRect(-fb.len/2,-fb.mat.thickness/2,fb.len,fb.mat.thickness);ctx.restore();}}
function drawSimJoints(){for(const sj of simJoints){if(sj.fixed)continue;ctx.beginPath();ctx.fillStyle='rgba(242,236,221,0.35)';ctx.arc(sj.x,sj.y,4,0,Math.PI*2);ctx.fill();}}
function drawDebris(){for(const d of debrisParticles){ctx.save();ctx.globalAlpha=d.life/40;ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(d.x,d.y,3,0,Math.PI*2);ctx.fill();ctx.restore();}}
function drawSplash(){for(const s of splashParticles){ctx.save();ctx.globalAlpha=s.life/35;ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.restore();}}

function drawOverlays(){
  if(windActive){ctx.save();ctx.globalAlpha=.07;ctx.fillStyle='#8fb0cc';ctx.fillRect(0,0,W,H);ctx.restore();}
  if(quakeActive){ctx.save();ctx.globalAlpha=.06;ctx.fillStyle='#d4483a';ctx.fillRect(0,0,W,H);ctx.restore();}
  if(rainActive){ctx.save();ctx.globalAlpha=.05;ctx.fillStyle='#4488aa';ctx.fillRect(0,0,W,H);ctx.restore();}
  const labels=[];
  if(windActive)labels.push('💨 WIND');
  if(quakeActive)labels.push('🌋 QUAKE');
  if(rainActive)labels.push('🌧 RAIN +20% load');
  if(nightMode)labels.push('🌙 NIGHT');
  if(labels.length){ctx.save();ctx.font='bold 12px Archivo,sans-serif';ctx.fillStyle='#cfe3ee';ctx.textAlign='left';labels.forEach((l,i)=>ctx.fillText(l,12,22+i*18));ctx.restore();}
}

function drawRain(){
  ctx.save();ctx.strokeStyle='rgba(180,210,240,0.45)';ctx.lineWidth=1;
  for(const d of rainDrops){d.x-=1.5*(slowMo?.2:1);d.y+=d.spd*(slowMo?.2:1);if(d.y>H){d.y=-20;d.x=Math.random()*W*1.5;}if(d.x<-50){d.x=W;d.y=Math.random()*H;}ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-3,d.y+d.len);ctx.stroke();}
  ctx.restore();
}

function drawInspector(){
  if(!inspectedBeam||inspectedBeam.broken)return;
  const sja=simJoints[inspectedBeam.ai],sjb=simJoints[inspectedBeam.bi];
  const mx=(sja.x+sjb.x)/2,my=(sja.y+sjb.y)/2;
  const stress=Math.round(inspectedBeam.stress*100/1.4);
  const lenM=(inspectedBeam.restLen*METERS_PER_PIXEL).toFixed(1);
  const cost=Math.round(inspectedBeam.restLen*METERS_PER_PIXEL*inspectedBeam.material.costPerMeter);
  const status=inspectedBeam.stress>1?'⚠️ CRITICAL':inspectedBeam.stress>.6?'🟠 HIGH':inspectedBeam.stress>.3?'🟡 MODERATE':'🟢 OK';
  const lines=[`Material: ${inspectedBeam.material.name}`,`Segment: ${lenM}m · $${cost.toLocaleString()}`,`Stress: ${stress}%`,`Status: ${status}`];
  const pw=190,ph=lines.length*20+22,px=Math.min(mx+10,W-pw-10),py=Math.max(my-ph-10,10);
  ctx.save();ctx.fillStyle='rgba(8,20,35,0.92)';ctx.strokeStyle='#e8a33d';ctx.lineWidth=1.5;rrPath(px,py,pw,ph,6);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e8a33d';ctx.font='bold 11px "IBM Plex Mono",monospace';ctx.textAlign='left';ctx.fillText('BEAM INSPECTOR',px+10,py+16);
  ctx.fillStyle='#cfe3ee';ctx.font='11px "IBM Plex Mono",monospace';lines.forEach((l,i)=>ctx.fillText(l,px+10,py+32+i*20));
  ctx.restore();
}

function drawVehicles(){
  for(const v of vehicles){
    const type=VEHICLE_TYPES[v.typeKey];
    const w=type.w,h=type.h,vx=v.x,vy=v.y-h/2-3;
    ctx.save();ctx.translate(vx,vy);
    const wR=Math.max(5,h*.32),wY=h/2-wR*.5;
    for(const wx of[-w/2+wR+2,w/2-wR-2]){ctx.save();ctx.translate(wx,wY);ctx.fillStyle='#1c1c1c';ctx.beginPath();ctx.arc(0,0,wR,0,Math.PI*2);ctx.fill();ctx.rotate(v.wheelPhase);ctx.strokeStyle='#555';ctx.lineWidth=1.5;for(let s=0;s<4;s++){const a=(Math.PI/2)*s;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*wR*.8,Math.sin(a)*wR*.8);ctx.stroke();}ctx.restore();}
    rrPath(-w/2,-h/2,w,h,Math.min(6,h*.3));ctx.fillStyle=type.color;ctx.fill();ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.55)';rrPath(w/2-w*.32-w*.08,-h/2+2,w*.32,h-4,3);ctx.fill();
    // Headlight glow in night mode
    if(nightMode){ctx.save();ctx.shadowBlur=18;ctx.shadowColor='#fffce8';ctx.fillStyle='#fffce8';ctx.beginPath();ctx.arc(w/2-2,0,Math.max(2,h*.1),0,Math.PI*2);ctx.fill();ctx.restore();}
    else{ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.arc(w/2-2,0,Math.max(2,h*.08),0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
}

function rrPath(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function stressColor(s,base){if(s<.45)return base;const t=Math.min(1,(s-.45)/.55);return `rgb(${Math.round(232+(212-232)*t)},${Math.round(163+(72-163)*t)},${Math.round(61+(58-61)*t)})`;}

// ============================================================
// HUD
// ============================================================
const el={
  budget:document.getElementById('hud-budget'),spent:document.getElementById('hud-spent'),
  wave:document.getElementById('hud-wave'),testBtn:document.getElementById('btn-test'),
  resetBtn:document.getElementById('btn-reset'),undoBtn:document.getElementById('btn-undo'),
  symBtn:document.getElementById('btn-sym'),slowBtn:document.getElementById('btn-slow'),
  windBtn:document.getElementById('btn-wind'),quakeBtn:document.getElementById('btn-quake'),
  rainBtn:document.getElementById('btn-rain'),nightBtn:document.getElementById('btn-night'),
  copyBtn:document.getElementById('btn-copy'),
  banner:document.getElementById('banner'),bannerTitle:document.getElementById('banner-title'),
  bannerBody:document.getElementById('banner-body'),bannerBtn:document.getElementById('banner-btn'),
  instructions:document.getElementById('instructions'),lbPanel:document.getElementById('lb-panel'),
  beamCount:document.getElementById('hud-beams'),beamLength:document.getElementById('hud-length'),
};

function refreshHUD(){
  const rem=BUD()-totalCost;
  el.spent.textContent=`$${Math.round(totalCost).toLocaleString()}`;
  el.budget.textContent=`$${Math.round(rem).toLocaleString()}`;
  el.budget.classList.toggle('over',rem<0);
  const totalM=(beams.reduce((s,b)=>s+b.length,0)*METERS_PER_PIXEL).toFixed(0);
  if(el.beamCount)el.beamCount.textContent=beams.length;
  if(el.beamLength)el.beamLength.textContent=totalM+'m';
  if(mode==='build'){el.wave.textContent=buildTimerActive?'⏱ Building...':'Ready to test';el.instructions.textContent=activeMaterial==='delete'?'Click any beam to delete it. Red highlight = beam under cursor.':activeMaterial==='screw'?'① Click beam ② Switch material ③ Drag from dot':'Drag from anchors to draw · Click beam to delete · Ctrl+Z undo';}
  else if(mode==='simulating'){el.wave.textContent=totalLoadKg>0?`Load: ${totalLoadKg.toLocaleString()} kg on span`:'Span clear — spawn a vehicle';el.instructions.textContent='Click any beam to inspect · Beams turn amber→red as stress builds';}
  else if(mode==='lost')el.wave.textContent='Bridge failed';
  else if(mode==='won')el.wave.textContent='Bridge survived! 🎉';
  el.testBtn.disabled=mode!=='build';
  if(el.undoBtn)el.undoBtn.disabled=mode!=='build'||!history.length;
  if(el.symBtn)el.symBtn.classList.toggle('active-tool',symmetryMode);
  if(el.slowBtn)el.slowBtn.classList.toggle('active-tool',slowMo);
  if(el.windBtn)el.windBtn.classList.toggle('active-tool',windActive);
  if(el.quakeBtn)el.quakeBtn.classList.toggle('active-tool',quakeActive);
  if(el.rainBtn)el.rainBtn.classList.toggle('active-tool',rainActive);
  if(el.nightBtn)el.nightBtn.classList.toggle('active-tool',nightMode);
  if(mode!=='lost'&&mode!=='won')hideBanner();
  renderLeaderboard();
  // Live stats
  ['stat-crossed','stat-maxload','stat-broken','stat-stress'].forEach(id=>{const e=document.getElementById(id);if(!e)return;if(mode==='build'){e.textContent='—';return;}if(id==='stat-crossed')e.textContent=vehiclesCrossed;else if(id==='stat-maxload')e.textContent=maxLoadSurvived?maxLoadSurvived.toLocaleString()+' kg':'—';else if(id==='stat-broken')e.textContent=simBeams.filter(b=>b.broken).length;else if(id==='stat-stress'){const p=simBeams.reduce((m,b)=>Math.max(m,b.stress),0);e.textContent=p>0?Math.round(p/1.4*100)+'%':'—';}});
}

function renderLeaderboard(){
  if(!el.lbPanel)return;
  const lb=getLeaderboard();
  if(!lb.length){el.lbPanel.innerHTML='<div class="lb-empty">No scores yet.</div>';return;}
  // Mini bar chart (lower cost = taller bar = better)
  const top=lb.slice(0,5);const maxC=Math.max(...top.map(s=>s.cost));
  const bars=top.map((s,i)=>{const h=Math.round(10+((maxC-s.cost)/maxC)*55);const col=i===0?'#49b07d':'#e8a33d';return `<div class="lb-bar-wrap" title="$${s.cost.toLocaleString()}"><div class="lb-bar-fill" style="height:${h}px;background:${col}"></div></div>`;}).join('');
  el.lbPanel.innerHTML=`<div class="lb-title">🏆 Best Scores</div><div class="lb-chart">${bars}</div>`+top.map((s,i)=>`<div class="lb-row"><span class="lb-rank">#${i+1}</span><span class="lb-cost">$${s.cost.toLocaleString()}</span><span class="lb-grade">${s.grade}</span><span class="lb-date">${s.date}</span></div>`).join('');
}

function showBanner(title,body,won){el.bannerTitle.textContent=title;el.bannerBody.innerHTML=body.replace(/\n/g,'<br>');el.banner.classList.add('visible');el.banner.classList.toggle('banner-won',!!won);}
function hideBanner(){el.banner.classList.remove('visible');}
function flashMessage(msg){el.instructions.textContent=msg;setTimeout(refreshHUD,2500);}

// ============================================================
// Wiring
// ============================================================
el.testBtn.addEventListener('click',startSimulation);
el.resetBtn.addEventListener('click',resetGame);
el.bannerBtn.addEventListener('click',resetGame);
if(el.undoBtn)el.undoBtn.addEventListener('click',undoAction);
if(el.symBtn)el.symBtn.addEventListener('click',()=>{symmetryMode=!symmetryMode;refreshHUD();});
if(el.slowBtn)el.slowBtn.addEventListener('click',()=>{slowMo=!slowMo;refreshHUD();});
if(el.copyBtn)el.copyBtn.addEventListener('click',copyLeftHalf);
if(el.nightBtn)el.nightBtn.addEventListener('click',()=>{nightMode=!nightMode;refreshHUD();});
if(el.windBtn)el.windBtn.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}windActive=true;windTimer=180;refreshHUD();});
if(el.quakeBtn)el.quakeBtn.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}quakeActive=true;quakeTimer=120;refreshHUD();});
if(el.rainBtn)el.rainBtn.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}rainActive=true;rainTimer=360;refreshHUD();});

document.querySelectorAll('.material-card').forEach(card=>{
  card.addEventListener('click',()=>{
    if(card.classList.contains('locked'))return;
    document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('active'));
    card.classList.add('active');activeMaterial=card.dataset.material;
    hoverBeam=null;refreshHUD();
  });
});
document.querySelectorAll('.spawn-btn').forEach(btn=>btn.addEventListener('click',()=>spawnVehicle(btn.dataset.type)));

document.getElementById('btn-save')?.addEventListener('click',()=>{const inp=document.getElementById('save-name-input');const name=(inp?.value||'').trim()||'Bridge '+(getSaves().length+1);saveDesign(name);if(inp)inp.value='';flashMessage('✓ Saved: '+name);});
document.getElementById('btn-restore-auto')?.addEventListener('click',()=>{if(confirm('Restore the last auto-save? Current build will be lost.'))restoreAutoSave();});
document.getElementById('btn-free-build')?.addEventListener('click',()=>{challengeMode=null;document.getElementById('mode-badge').style.display='none';document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('locked'));resetGame();});
document.getElementById('btn-tut-next')?.addEventListener('click',()=>showTutorialStep(tutorialStep+1));
document.getElementById('btn-tut-skip')?.addEventListener('click',()=>showTutorialStep(-1));

window.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.key==='z'){e.preventDefault();undoAction();}
  if(e.key==='s'&&!e.ctrlKey){symmetryMode=!symmetryMode;refreshHUD();}
  if(e.key==='m'||e.key==='M'){slowMo=!slowMo;refreshHUD();}
  if(e.key==='n'||e.key==='N'){nightMode=!nightMode;refreshHUD();}
  if(e.key==='d'||e.key==='D'){const card=document.querySelector('.material-card[data-material="delete"]');if(card)card.click();}
  if(e.key==='Escape'){showTutorialStep(-1);inspectedBeam=null;zoom=1;panX=0;panY=0;}
});

// ============================================================
// Boot
// ============================================================
resizeCanvasForDPR();
initJoints();
buildLevelUI();
buildChallengeUI();
renderSaves();
refreshHUD();
requestAnimationFrame(loop);
if(!localStorage.getItem('tutorialDone'))showTutorialStep(0);
