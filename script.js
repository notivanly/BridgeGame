/* ============================================================
   LOAD LIMIT — Bridge Engineering Lab  v5.0
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

// ---------- Camera ----------
let zoom = 1, panX = 0, panY = 0;

// ---------- Stars ----------
const STARS = Array.from({length:90},()=>({x:Math.random()*W,y:Math.random()*(GROUND_Y-60),r:.4+Math.random()*1.6,phase:Math.random()*Math.PI*2}));
const clouds = Array.from({length:5},(_,i)=>({x:100+i*200,y:40+Math.sin(i)*30,w:80+i*20,speed:.15+i*.05}));

// ---------- Rain drops ----------
const rainDrops = Array.from({length:90},()=>({x:Math.random()*W*1.5,y:Math.random()*H,spd:9+Math.random()*5,len:14+Math.random()*10}));

// ---------- Audio ----------
let audioCtx=null;
function getAudio(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();return audioCtx;}
function playSnap(mat='steel'){try{const ac=getAudio(),t=ac.currentTime;const freq=mat==='wood'?400:mat==='concrete'?200:mat==='carbon'?900:700;const buf=ac.createBuffer(1,ac.sampleRate*.15,ac.sampleRate),d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-i/(ac.sampleRate*.04));const src=ac.createBufferSource();src.buffer=buf;const f=ac.createBiquadFilter();f.type='bandpass';f.frequency.value=freq;const g=ac.createGain();g.gain.setValueAtTime(.5,t);src.connect(f);f.connect(g);g.connect(ac.destination);src.start(t);}catch(e){}}
function playSplash(){try{const ac=getAudio(),t=ac.currentTime,o=ac.createOscillator();o.type='sine';o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(40,t+.4);const g=ac.createGain();g.gain.setValueAtTime(.4,t);g.gain.exponentialRampToValueAtTime(.001,t+.5);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.5);}catch(e){}}
function playAchievement(){try{const ac=getAudio(),t=ac.currentTime;[523,659,784,1047].forEach((f,i)=>{const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*.1);g.gain.linearRampToValueAtTime(.3,t+i*.1+.05);g.gain.exponentialRampToValueAtTime(.001,t+i*.1+.3);o.connect(g);g.connect(ac.destination);o.start(t+i*.1);o.stop(t+i*.1+.3);});}catch(e){}}
let creakInt=null;
function startCreak(mat='steel'){stopCreak();const freq=mat==='wood'?60:mat==='concrete'?40:mat==='carbon'?120:80;creakInt=setInterval(()=>{try{const ac=getAudio(),t=ac.currentTime,o=ac.createOscillator();o.type=mat==='wood'?'sawtooth':'square';o.frequency.value=freq+Math.random()*30;const g=ac.createGain();g.gain.setValueAtTime(.05,t);g.gain.exponentialRampToValueAtTime(.001,t+.3);const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=mat==='wood'?300:500;o.connect(f);f.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+.3);}catch(e){}},mat==='wood'?400:600);}
function stopCreak(){if(creakInt){clearInterval(creakInt);creakInt=null;}}

// ---------- Levels ----------
const LEVELS=[
  {id:0,name:'Narrow Gorge',  chasmLeft:288,chasmRight:612,budget:120000,pier:false,quake:false,desc:'Short span — master the basics on a tight budget.'},
  {id:1,name:'River Crossing',chasmLeft:234,chasmRight:666,budget:300000,pier:false,quake:false,desc:'Standard span. Bracing is key for heavy trucks.'},
  {id:2,name:'Grand Canyon',  chasmLeft:162,chasmRight:738,budget:500000,pier:true, quake:false,desc:'Wide gap with a mid-span pier. Steel trusses only.'},
  {id:3,name:'City Bridge',   chasmLeft:270,chasmRight:630,budget:180000,pier:false,quake:false,desc:'Repair a damaged bridge. Some spans are pre-built and locked.'},
  {id:4,name:'Quake Zone',    chasmLeft:220,chasmRight:680,budget:400000,pier:false,quake:true, desc:'The ground shakes every 30 seconds. Build to withstand aftershocks.'},
];
let currentLevel=1;
let challengeMode=null;

// City Bridge pre-placed locked beams (computed after level set)
function getCityPreBeams(){
  const l=LEVELS[3];const cl=l.chasmLeft,cr=l.chasmRight,mid=(cl+cr)/2;
  return[
    {aX:cl,aY:GROUND_Y+5,bX:mid-40,bY:GROUND_Y+5,mat:'concrete',locked:true},
    {aX:cl,aY:GROUND_Y+55,bX:mid-40,bY:GROUND_Y+55,mat:'concrete',locked:true},
    {aX:cr,aY:GROUND_Y+5,bX:mid+40,bY:GROUND_Y+5,mat:'concrete',locked:true},
    {aX:cr,aY:GROUND_Y+55,bX:mid+40,bY:GROUND_Y+55,mat:'concrete',locked:true},
  ];
}

const CHALLENGES=[
  {id:0,level:0,name:'Speed Run',    desc:'Survive 3 sedans — built in under 90 seconds', budget:120000,timeLimit:90, noScrews:false,materialLock:null,    objective:{vehicle:'sedan',count:3}},
  {id:1,level:0,name:'No Screws',    desc:'Survive a van — no junction screws allowed',   budget:80000, timeLimit:0,  noScrews:true, materialLock:null,    objective:{vehicle:'van'}},
  {id:2,level:0,name:'Budget Master',desc:'Survive a box truck for under $8,000',          budget:8000,  timeLimit:180,noScrews:false,materialLock:null,    objective:{vehicle:'truck',maxCost:8000}},
  {id:3,level:0,name:'Wood Only',    desc:'Survive a sedan using only Wood',               budget:50000, timeLimit:180,noScrews:false,materialLock:['wood'],objective:{vehicle:'sedan'}},
  {id:4,level:1,name:'Rush Hour',    desc:'Get 5 vehicles across the span',                budget:300000,timeLimit:300,noScrews:false,materialLock:null,    objective:{vehicle:'van',count:5}},
  {id:5,level:1,name:'Truck Stop',   desc:'Survive 3 box trucks in a row',                 budget:200000,timeLimit:240,noScrews:false,materialLock:null,    objective:{vehicle:'truck',count:3}},
  {id:6,level:1,name:'Semi Boss',    desc:'Survive a semi for under $100,000',             budget:100000,timeLimit:300,noScrews:false,materialLock:null,    objective:{vehicle:'semi',maxCost:100000}},
  {id:7,level:1,name:'Wood Semi',    desc:'Survive a semi using only Wood. Seriously.',    budget:150000,timeLimit:0,  noScrews:false,materialLock:['wood'],objective:{vehicle:'semi'}},
  {id:8,level:2,name:'Steel Only',   desc:'Survive 2 semis using Steel only, under $400k',budget:400000,timeLimit:0,  noScrews:false,materialLock:['steel'],objective:{vehicle:'semi',count:2}},
  {id:9,level:2,name:'Budget Canyon',desc:'Survive a box truck for under $50,000',         budget:50000, timeLimit:240,noScrews:false,materialLock:null,    objective:{vehicle:'truck',maxCost:50000}},
  {id:10,level:2,name:'The Impossible',desc:'Survive the Tank. Budget capped at $200k.',  budget:200000,timeLimit:0,  noScrews:false,materialLock:null,    objective:{vehicle:'tank'}},
  {id:11,level:2,name:'Semi Rush',   desc:'3 semis then a tank must cross. All in.',       budget:500000,timeLimit:0,  noScrews:false,materialLock:null,    objective:{vehicle:'semi',count:3,thenTank:true}},
  {id:12,level:3,name:'Repair Duty', desc:'Complete the city bridge and survive a semi',   budget:150000,timeLimit:240,noScrews:false,materialLock:null,    objective:{vehicle:'semi'}},
  {id:13,level:4,name:'Quake Proof', desc:'Survive 3 box trucks through aftershock quakes',budget:400000,timeLimit:0,  noScrews:false,materialLock:null,    objective:{vehicle:'truck',count:3}},
  {id:14,level:4,name:'Train Ready', desc:'Survive the Train on the Quake Zone',           budget:500000,timeLimit:0,  noScrews:false,materialLock:null,    objective:{vehicle:'train'}},
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
  wood:    {key:'wood',   name:'Wood',        color:'#c89a64',dark:'#8a6239',costPerMeter:14, thickness:8, sagBreak:2.5,tensionOnly:false,note:'Cheap & light. Snaps under heavy loads.'},
  steel:   {key:'steel', name:'Steel',        color:'#a9bdce',dark:'#5d6e7c',costPerMeter:135,thickness:7, sagBreak:22, tensionOnly:false,note:'Strongest by far. Expensive and heavy.'},
  concrete:{key:'concrete',name:'Concrete',   color:'#b3b1a6',dark:'#76746c',costPerMeter:68, thickness:11,sagBreak:9,  tensionOnly:false,note:'Decent strength, very heavy on long spans.'},
  cable:   {key:'cable', name:'Cable',        color:'#f0c040',dark:'#c08010',costPerMeter:45, thickness:3, sagBreak:35, tensionOnly:true, note:'Tension only — perfect for suspension bridges.'},
  carbon:  {key:'carbon',name:'Carbon Fiber', color:'#7a5cc0',dark:'#3a1a70',costPerMeter:400,thickness:5, sagBreak:32, tensionOnly:false,note:'Ultra-strong, ultra-light. Very expensive.'},
};

// ---------- Vehicles ----------
const VEHICLE_TYPES={
  bicycle:{label:'Bicycle',    kg:15,   force:0.02,w:22, h:12,color:'#48a868',speed:4.5,emoji:'🚲'},
  sedan:  {label:'Sedan',      kg:1400, force:0.8, w:46, h:20,color:'#3b6ea5',speed:2.8,emoji:'🚗'},
  van:    {label:'Van',        kg:2800, force:1.6, w:56, h:26,color:'#3b8a5a',speed:2.5,emoji:'🚐'},
  truck:  {label:'Box Truck',  kg:9000, force:4.5, w:76, h:36,color:'#c97a2b',speed:2.1,emoji:'🚚'},
  bus:    {label:'City Bus',   kg:12000,force:6.0, w:90, h:44,color:'#c43b8a',speed:1.9,emoji:'🚌'},
  semi:   {label:'Semi',       kg:18000,force:9.0, w:104,h:42,color:'#a23b3b',speed:1.7,emoji:'🚛'},
  tank:   {label:'Tank',       kg:60000,force:28.0,w:120,h:48,color:'#5a4a2a',speed:1.2,emoji:'🪖'},
  train:  {label:'Train',      kg:200000,force:85.0,w:200,h:46,color:'#444466',speed:1.0,emoji:'🚂'},
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
let autoQuakeTimer=0; // for Quake Zone level
let resonance=0; // 0-1 resonance accumulator
let frameCount=0;
let vehiclesCrossed=0,maxLoadSurvived=0,challengeVehicleCount=0,tanksSpawned=false;
let debrisParticles=[],splashParticles=[],fallingBeams=[];
let buildTimer=0,buildTimerActive=false;
let inspectedBeam=null,hoverBeam=null;
let tutorialStep=-1;
let replayFrames=[],replayPlaying=false,replayIdx=0;
let anchorCracks=new Map(); // anchorIndex -> crackLevel 0-3
let stressedMatKey='steel'; // for creak sound

const TUTORIAL_STEPS=[
  {title:'Welcome to Load Limit!',body:'Build a bridge across the chasm. Start by dragging from an anchor point to draw your first beam.'},
  {title:'Anchor Points',body:'Amber dots = road anchors. Blue diamonds = tower anchors (cable only). All beams must connect here.'},
  {title:'Drawing Beams',body:'Select a material, then drag from anchor to anchor. You can also connect to existing joint dots.'},
  {title:'Junction Screws',body:'⚙️ Screw mode lets you click any beam to add a connection point, enabling complex truss designs.'},
  {title:'Delete & Undo',body:'🗑 Delete mode hovers red over beams, click to remove. Ctrl+Z undoes the last action.'},
  {title:'Test & Inspect',body:'Hit Test Bridge, then spawn vehicles. Click any beam to inspect its stress. Amber→Red→Snap!'},
];

// ---------- Achievements ----------
const ACHIEVEMENTS=[
  {id:'first_test',    name:'First Test',       desc:'Test your first bridge',                    icon:'🏗️', earned:false},
  {id:'tank_survived', name:'Tank Buster',       desc:'Survive the Tank',                          icon:'🪖', earned:false},
  {id:'a_plus',        name:'Perfect Score',     desc:'Earn an A+ grade on any level',             icon:'⭐', earned:false},
  {id:'under_5k',      name:'Penny Pincher',     desc:'Survive any vehicle for under $5,000',      icon:'💰', earned:false},
  {id:'all_materials', name:'Material Expert',   desc:'Use all 5 materials in one bridge',         icon:'🔧', earned:false},
  {id:'suspension',    name:'Suspension Master', desc:'A cable bridge survives a semi',            icon:'🌉', earned:false},
  {id:'resonance',     name:'Tacoma Moment',     desc:'Witness a resonance collapse',              icon:'🌊', earned:false},
  {id:'train_survived',name:'Train Conductor',   desc:'Survive the Train',                         icon:'🚂', earned:false},
  {id:'night_owl',     name:'Night Owl',         desc:'Test a bridge in night mode',               icon:'🌙', earned:false},
  {id:'weathered',     name:'Storm Chaser',      desc:'Survive with wind, quake, and rain active', icon:'⛈️', earned:false},
  {id:'no_screws_win', name:'Pure Builder',      desc:'Win a challenge with no junction screws',   icon:'🔩', earned:false},
  {id:'bicycle_test',  name:'Two Wheels',        desc:'A bicycle crosses your bridge',             icon:'🚲', earned:false},
  {id:'city_repaired', name:'City Hero',         desc:'Complete the City Bridge level',            icon:'🏙️', earned:false},
  {id:'quake_survived',name:'Earthquake Proof',  desc:'Survive a quake during testing',            icon:'🌋', earned:false},
];
function loadAchievements(){const saved=JSON.parse(localStorage.getItem('achievements')||'{}');ACHIEVEMENTS.forEach(a=>{if(saved[a.id])a.earned=true;});}
function saveAchievements(){const s={};ACHIEVEMENTS.forEach(a=>{if(a.earned)s[a.id]=true;});localStorage.setItem('achievements',JSON.stringify(s));}
function unlockAchievement(id){const a=ACHIEVEMENTS.find(a=>a.id===id);if(!a||a.earned)return;a.earned=true;saveAchievements();playAchievement();showAchievementToast(a);}
function checkAchievements(){
  unlockAchievement('first_test');
  if(nightMode)unlockAchievement('night_owl');
  if(windActive&&quakeActive&&rainActive)unlockAchievement('weathered');
  if(vehiclesCrossed>0&&VEHICLE_TYPES[vehicles.find(v=>v.counted)?.typeKey||'']?.kg===60000)unlockAchievement('tank_survived');
  const mats=new Set(beams.map(b=>b.material));if([...Object.keys(MATERIALS)].filter(k=>k!=='cable'||true).every(k=>mats.has(k)))unlockAchievement('all_materials');
  if(quakeActive||autoQuakeTimer>0)unlockAchievement('quake_survived');
}
let achToastQueue=[];
function showAchievementToast(a){
  achToastQueue.push(a);
  if(achToastQueue.length===1)nextToast();
}
function nextToast(){
  const a=achToastQueue[0];if(!a)return;
  const el=document.getElementById('ach-toast');if(!el)return;
  el.innerHTML=`<span class="ach-icon">${a.icon}</span><div><div class="ach-name">Achievement: ${a.name}</div><div class="ach-desc">${a.desc}</div></div>`;
  el.classList.add('show');
  setTimeout(()=>{el.classList.remove('show');achToastQueue.shift();setTimeout(nextToast,400);},3200);
}
function renderAchievements(){
  const el=document.getElementById('ach-list');if(!el)return;
  el.innerHTML=ACHIEVEMENTS.map(a=>`<div class="ach-row ${a.earned?'earned':'locked'}"><span class="ach-icon-sm">${a.earned?a.icon:'🔒'}</span><div><div class="ach-n">${a.name}</div><div class="ach-d">${a.desc}</div></div></div>`).join('');
}

// ---------- Leaderboard / saves ----------
function lbKey(){return `lb_${currentLevel}_${challengeMode?challengeMode.id:'free'}`;}
function getLeaderboard(){try{return JSON.parse(localStorage.getItem(lbKey())||'[]');}catch(e){return[];}}
function saveScore(cost,maxKg,grade){const lb=getLeaderboard();lb.push({cost,maxKg,grade,date:new Date().toLocaleDateString()});lb.sort((a,b)=>a.cost-b.cost);localStorage.setItem(lbKey(),JSON.stringify(lb.slice(0,10)));}
function getSaves(){try{return JSON.parse(localStorage.getItem('saves')||'[]');}catch(e){return[];}}
function saveDesign(name){const saves=getSaves();saves.unshift({name,level:currentLevel,joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost,date:new Date().toLocaleDateString()});localStorage.setItem('saves',JSON.stringify(saves.slice(0,20)));renderSaves();}
function loadDesign(idx){const s=getSaves()[idx];if(!s)return;currentLevel=s.level;initJoints();joints=s.joints;beams=s.beams;totalCost=s.totalCost;nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id))+1;buildLevelUI();refreshHUD();}
function deleteDesign(idx){const saves=getSaves();saves.splice(idx,1);localStorage.setItem('saves',JSON.stringify(saves));renderSaves();}
function renderSaves(){const el=document.getElementById('saves-list');if(!el)return;const saves=getSaves();if(!saves.length){el.innerHTML='<div class="lb-empty">No saved designs yet.</div>';return;}el.innerHTML=saves.map((s,i)=>`<div class="save-row"><div class="save-name">${s.name}</div><div class="save-meta">${LEVELS[s.level]?.name||''} · $${s.totalCost?.toLocaleString()||0}</div><div class="save-actions"><button onclick="loadDesign(${i})" class="save-act-btn">Load</button><button onclick="deleteDesign(${i})" class="save-act-btn del">✕</button></div></div>`).join('');}

// ---------- Share bridge ----------
function shareBridge(){
  const data={v:1,level:currentLevel,joints:joints.map(j=>({id:j.id,x:Math.round(j.x),y:Math.round(j.y),fixed:j.fixed?1:0,isTower:j.isTower?1:0})),beams:beams.filter(b=>!b.locked).map(b=>({id:b.id,aId:b.aId,bId:b.bId,mat:b.material}))};
  const code=btoa(JSON.stringify(data));
  const url=window.location.origin+window.location.pathname+'#bridge='+code;
  navigator.clipboard?.writeText(url).then(()=>flashMessage('✓ Bridge link copied to clipboard!'));
}
function loadSharedBridge(){
  const hash=window.location.hash;
  if(!hash.startsWith('#bridge='))return;
  try{
    const data=JSON.parse(atob(hash.slice(8)));
    currentLevel=data.level||1;
    joints=data.joints.map(j=>({...j,fixed:!!j.fixed,isTower:!!j.isTower}));
    beams=data.beams.map(b=>({...b,material:b.mat,length:dist(joints.find(j=>j.id===b.aId)?.x||0,joints.find(j=>j.id===b.aId)?.y||0,joints.find(j=>j.id===b.bId)?.x||0,joints.find(j=>j.id===b.bId)?.y||0)}));
    totalCost=beams.reduce((s,b)=>s+b.length*METERS_PER_PIXEL*(MATERIALS[b.material]?.costPerMeter||0),0);
    nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id))+1;
    buildLevelUI();refreshHUD();
    window.location.hash='';
    flashMessage('✓ Shared bridge loaded!');
  }catch(e){window.location.hash='';}
}

// ============================================================
// Init
// ============================================================
function initJoints(){
  joints=getAnchors().map(a=>({id:nextId++,x:a.x,y:a.y,fixed:true,isTower:a.label==='tower'}));
  beams=[];totalCost=0;history=[];
  // City Bridge pre-placed beams
  if(currentLevel===3){
    const pre=getCityPreBeams();
    pre.forEach(pb=>{
      const ai=findOrCreateJointAt(pb.aX,pb.aY,true);
      const bi=findOrCreateJointAt(pb.bX,pb.bY,false);
      if(!ai||!bi)return;
      const len=dist(ai.x,ai.y,bi.x,bi.y);
      beams.push({id:nextId++,aId:ai.id,bId:bi.id,material:pb.mat,length:len,locked:true});
    });
  }
}
function findOrCreateJointAt(x,y,fixed){
  const ex=joints.find(j=>Math.abs(j.x-x)<5&&Math.abs(j.y-y)<5);
  if(ex)return ex;
  const j={id:nextId++,x,y,fixed};joints.push(j);return j;
}
function resizeCanvasForDPR(){dpr=window.devicePixelRatio||1;canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';}

function buildLevelUI(){const wrap=document.getElementById('level-tabs');if(!wrap)return;wrap.innerHTML='';LEVELS.forEach((lv,i)=>{const btn=document.createElement('button');btn.className='level-tab'+(i===currentLevel?' active':'');btn.textContent=lv.name;btn.addEventListener('click',()=>{currentLevel=i;challengeMode=null;resetGame();buildLevelUI();buildChallengeUI();});wrap.appendChild(btn);});const desc=document.getElementById('level-desc');if(desc)desc.textContent=lvl().desc;}
function buildChallengeUI(){const wrap=document.getElementById('challenge-list');if(!wrap)return;const rel=CHALLENGES.filter(c=>c.level===currentLevel);wrap.innerHTML=rel.map(c=>`<button class="challenge-btn" data-cid="${c.id}"><span class="ch-name">${c.name}</span><span class="ch-desc">${c.desc}</span></button>`).join('');wrap.querySelectorAll('.challenge-btn').forEach(btn=>btn.addEventListener('click',()=>startChallenge(parseInt(btn.dataset.cid))));}
function startChallenge(id){const ch=CHALLENGES.find(c=>c.id===id);if(!ch)return;currentLevel=ch.level;challengeMode=ch;resetGame();buildLevelUI();if(ch.timeLimit>0){buildTimer=ch.timeLimit*60;buildTimerActive=true;}document.getElementById('mode-badge').textContent='🎯 '+ch.name;document.getElementById('mode-badge').style.display='block';document.querySelectorAll('.material-card').forEach(card=>{card.classList.toggle('locked',!!(ch.materialLock&&!ch.materialLock.includes(card.dataset.material)&&card.dataset.material!=='screw'&&card.dataset.material!=='delete'));});refreshHUD();}

// ============================================================
// Tutorial
// ============================================================
function showTutorialStep(s){tutorialStep=s;const el=document.getElementById('tutorial-overlay');if(!el)return;if(s<0||s>=TUTORIAL_STEPS.length){el.style.display='none';tutorialStep=-1;localStorage.setItem('tutorialDone','1');return;}const step=TUTORIAL_STEPS[s];document.getElementById('tut-title').textContent=step.title;document.getElementById('tut-body').textContent=step.body;document.getElementById('tut-step').textContent=`${s+1} / ${TUTORIAL_STEPS.length}`;el.style.display='flex';}

// ============================================================
// Undo / Copy / Share
// ============================================================
function pushHistory(){history.push({joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost});if(history.length>60)history.shift();}
function undoAction(){if(!history.length){flashMessage('Nothing to undo.');return;}const snap=history.pop();joints=snap.joints;beams=snap.beams;totalCost=snap.totalCost;nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id),nextId)+1;refreshHUD();}
function copyLeftHalf(){
  if(mode!=='build'){flashMessage('Switch to build mode first.');return;}
  const cx=(CL()+CR())/2;
  const leftBeams=beams.filter(b=>!b.locked&&(()=>{const a=jointById(b.aId),c=jointById(b.bId);return a&&c&&a.x<=cx+5&&c.x<=cx+5;})());
  if(!leftBeams.length){flashMessage('Build beams on the left side first.');return;}
  pushHistory();const idMap=new Map();
  for(const j of joints){if(j.fixed||j.x>cx+5)continue;const mx=cx+(cx-j.x),my=j.y;const ex=findNearestJoint(mx,my,10);if(ex)idMap.set(j.id,ex.id);else{const nj=addJoint(mx,my,false);idMap.set(j.id,nj.id);}}
  for(const b of leftBeams){const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c)continue;const getM=j=>{if(j.isTower){const mx=cx+(cx-j.x);return joints.find(jj=>jj.isTower&&Math.abs(jj.x-mx)<12&&Math.abs(jj.y-j.y)<12);}if(j.fixed){const mx=cx+(cx-j.x);return joints.find(jj=>jj.fixed&&!jj.isTower&&Math.abs(jj.x-mx)<12&&Math.abs(jj.y-j.y)<12);}return joints.find(jj=>jj.id===idMap.get(j.id));};const ma=getM(a),mc=getM(c);if(ma&&mc&&ma.id!==mc.id&&!beamExists(ma.id,mc.id))addBeam(ma,mc,b.material);}
  flashMessage('✓ Left half mirrored!');
}

// ============================================================
// Input
// ============================================================
canvas.style.touchAction='none';

// Touch / pinch zoom
let lastTouches=[];
canvas.addEventListener('touchstart',e=>{e.preventDefault();lastTouches=[...e.touches];if(e.touches.length===1){const t=e.touches[0];canvas.dispatchEvent(Object.assign(new PointerEvent('pointerdown',{clientX:t.clientX,clientY:t.clientY,pointerId:1})));}},{ passive:false});
canvas.addEventListener('touchmove',e=>{e.preventDefault();if(e.touches.length===2){const[a,b]=e.touches;const dx=a.clientX-b.clientX,dy=a.clientY-b.clientY;const newDist=Math.hypot(dx,dy);if(lastTouches.length===2){const old=Math.hypot(lastTouches[0].clientX-lastTouches[1].clientX,lastTouches[0].clientY-lastTouches[1].clientY);const r=canvas.getBoundingClientRect();const cx=(a.clientX+b.clientX)/2,cy=(a.clientY+b.clientY)/2;const cssX=(cx-r.left)*(W/r.width),cssY=(cy-r.top)*(H/r.height);const factor=newDist/old;const nz=Math.max(.5,Math.min(4,zoom*factor));panX=cssX-(cssX-panX)*(nz/zoom);panY=cssY-(cssY-panY)*(nz/zoom);zoom=nz;}lastTouches=[...e.touches];}else if(e.touches.length===1){const t=e.touches[0];canvas.dispatchEvent(Object.assign(new PointerEvent('pointermove',{clientX:t.clientX,clientY:t.clientY,pointerId:1})));}},{ passive:false});
canvas.addEventListener('touchend',e=>{e.preventDefault();lastTouches=[];canvas.dispatchEvent(new PointerEvent('pointerup',{clientX:0,clientY:0,pointerId:1}));},{ passive:false});

canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();const cssX=(e.clientX-r.left)*(W/r.width);const cssY=(e.clientY-r.top)*(H/r.height);const factor=e.deltaY<0?1.15:.87;const nz=Math.max(.5,Math.min(4,zoom*factor));panX=cssX-(cssX-panX)*(nz/zoom);panY=cssY-(cssY-panY)*(nz/zoom);zoom=nz;},{passive:false});

canvas.addEventListener('pointerdown',e=>{
  getAudio();
  if(mode==='simulating'){const p=canvasPos(e);inspectedBeam=findSimBeamNear(p.x,p.y,12);return;}
  if(mode==='replay'){replayPlaying=!replayPlaying;return;}
  if(mode!=='build')return;
  const p=canvasPos(e);pressDownPos=p;
  if(activeMaterial==='delete'){const hit=findBeamNear(p.x,p.y,12);if(hit&&!hit.locked){pushHistory();removeBeam(hit.id);}else if(hit?.locked)flashMessage('Locked beams cannot be deleted.');drag=null;return;}
  if(activeMaterial==='screw'){if(challengeMode?.noScrews){flashMessage('Challenge: no junction screws allowed!');return;}const hit=findBeamNear(p.x,p.y,20);if(hit&&!hit.locked){pushHistory();const j=splitBeamAt(hit,p.x,p.y);j.isScrew=true;}else flashMessage('Click directly on a beam to place a junction.');drag=null;return;}
  drag={from:findNearestJoint(p.x,p.y,SNAP_RADIUS),x:p.x,y:p.y};
});
canvas.addEventListener('pointermove',e=>{
  if(mode==='build'&&activeMaterial==='delete'){const p=canvasPos(e);hoverBeam=findBeamNear(p.x,p.y,12);}
  if(mode!=='build'||!drag)return;const p=canvasPos(e);drag.x=p.x;drag.y=p.y;
});
canvas.addEventListener('pointerup',e=>{
  if(mode!=='build'||!drag){drag=null;return;}
  const p=canvasPos(e);const moved=dist(p.x,p.y,pressDownPos.x,pressDownPos.y)>6;
  if(!moved){const hit=findBeamNear(p.x,p.y,7);if(hit&&!hit.locked&&activeMaterial!=='delete'&&activeMaterial!=='screw'){pushHistory();removeBeam(hit.id);}drag=null;return;}
  const from=drag.from||addJoint(pressDownPos.x,pressDownPos.y,false);
  const to=findNearestJoint(p.x,p.y,SNAP_RADIUS)||addJoint(p.x,p.y,false);
  if(from.id!==to.id&&!beamExists(from.id,to.id)){pushHistory();addBeam(from,to,activeMaterial);if(symmetryMode){const cx=(CL()+CR())/2;const mf=mirrorJoint(from,cx),mt=mirrorJoint(to,cx);if(mf.id!==mt.id&&!beamExists(mf.id,mt.id))addBeam(mf,mt,activeMaterial);}}
  drag=null;
});
canvas.addEventListener('pointerleave',()=>{drag=null;hoverBeam=null;});

function mirrorJoint(j,cx){if(j.fixed){const mx=cx+(cx-j.x),my=j.y;return joints.find(jj=>jj.fixed&&Math.abs(jj.x-mx)<8&&Math.abs(jj.y-my)<8)||addJoint(mx,my,false);}const mx=cx+(cx-j.x),my=j.y;return findNearestJoint(mx,my,10)||addJoint(mx,my,false);}
function canvasPos(e){const r=canvas.getBoundingClientRect();const cssX=(e.clientX-r.left)*(W/r.width);const cssY=(e.clientY-r.top)*(H/r.height);return{x:(cssX-panX)/zoom,y:(cssY-panY)/zoom};}

// ============================================================
// Build helpers
// ============================================================
function addJoint(x,y,fixed){const s=snapToGrid(x,y);const j={id:nextId++,x:s.x,y:s.y,fixed};joints.push(j);return j;}
function addBeam(a,b,matKey){
  if(matKey==='delete'||matKey==='screw')return;
  if(challengeMode?.materialLock&&!challengeMode.materialLock.includes(matKey)){flashMessage('Challenge: only '+challengeMode.materialLock.join('/')+' allowed!');return;}
  if((a.isTower||b.isTower)&&matKey!=='cable'){flashMessage('⚠️ Tower anchors only accept Cable.');return;}
  const mat=MATERIALS[matKey];if(!mat)return;
  const len=dist(a.x,a.y,b.x,b.y);
  beams.push({id:nextId++,aId:a.id,bId:b.id,material:matKey,length:len});
  totalCost+=len*METERS_PER_PIXEL*mat.costPerMeter;refreshHUD();
}
function removeBeam(id){const b=beams.find(b=>b.id===id);if(!b||b.locked)return;totalCost-=b.length*METERS_PER_PIXEL*(MATERIALS[b.material]?.costPerMeter||0);beams=beams.filter(x=>x.id!==id);joints=joints.filter(j=>j.fixed||beams.some(bm=>bm.aId===j.id||bm.bId===j.id));refreshHUD();}
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
  // Auto-save
  localStorage.setItem('autosave',JSON.stringify({level:currentLevel,joints:JSON.parse(JSON.stringify(joints)),beams:JSON.parse(JSON.stringify(beams)),totalCost}));
  const jMap=new Map();
  simJoints=joints.map((j,i)=>{jMap.set(j.id,i);return{x:j.x,y:j.y,px:j.x,py:j.y,fixed:!!j.fixed};});
  const SEG=38;simBeams=[];
  for(const rb of beams){
    const ai=jMap.get(rb.aId),bi=jMap.get(rb.bId);if(ai===undefined||bi===undefined)continue;
    const sja=simJoints[ai],sjb=simJoints[bi];
    const n=Math.max(2,Math.ceil(Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/SEG));
    const sl=Math.hypot(sjb.x-sja.x,sjb.y-sja.y)/n;
    let prev=ai;
    for(let s=1;s<n;s++){const t=s/n,ni=simJoints.length;simJoints.push({x:sja.x+(sjb.x-sja.x)*t,y:sja.y+(sjb.y-sja.y)*t,px:sja.x+(sjb.x-sja.x)*t,py:sja.y+(sjb.y-sja.y)*t,fixed:false});simBeams.push({ai:prev,bi:ni,restLen:sl,material:MATERIALS[rb.material],broken:false,stress:0,tension:false});prev=ni;}
    simBeams.push({ai:prev,bi:bi,restLen:sl,material:MATERIALS[rb.material],broken:false,stress:0,tension:false});
  }
  vehicles=[];settleFrames=SETTLE_TOTAL;totalLoadKg=0;vehiclesCrossed=0;maxLoadSurvived=0;challengeVehicleCount=0;tanksSpawned=false;resonance=0;
  debrisParticles=[];splashParticles=[];fallingBeams=[];replayFrames=[];replayPlaying=false;anchorCracks.clear();
  buildTimerActive=false;inspectedBeam=null;
  autoQuakeTimer=lvl().quake?1800:0;
  mode='simulating';
  checkAchievements();
  flashMessage('✓ Auto-saved · Click any beam to inspect · Watch the stress colors');
  refreshHUD();
}

function rainMult(){return rainActive?1.2:1.0;}

function simulationStep(){
  frameCount++;
  if(windActive){windTimer--;if(windTimer<=0)windActive=false;}
  if(quakeActive){quakeTimer--;if(quakeTimer<=0)quakeActive=false;}
  if(rainActive){rainTimer--;if(rainTimer<=0)rainActive=false;}
  // Auto-quake on Quake Zone level
  if(autoQuakeTimer>0){autoQuakeTimer--;if(autoQuakeTimer===0){quakeActive=true;quakeTimer=180;autoQuakeTimer=1800;unlockAchievement('quake_survived');}}

  // 1. Verlet integrate
  for(const sj of simJoints){
    if(sj.fixed)continue;
    let vx=(sj.x-sj.px)*DAMPING,vy=(sj.y-sj.py)*DAMPING;
    sj.px=sj.x;sj.py=sj.y;
    if(windActive)vx+=.18*Math.sin(frameCount*.05);
    if(quakeActive){vx+=.35*(Math.random()-.5)*2;vy+=.15*(Math.random()-.5);}
    // Resonance horizontal force
    if(resonance>.1)vx+=resonance*.25*Math.sin(frameCount*.12);
    sj.x+=vx;sj.y+=vy+GRAVITY;
  }

  // 2. Vehicle load & resonance
  if(settleFrames===0){
    const vehiclesOnBridge=vehicles.filter(v=>v.x>CL()&&v.x<CR()&&v.state!=='fallen');
    if(vehiclesOnBridge.length>0){
      resonance=Math.min(1,resonance+vehiclesOnBridge.length*.0008);
      if(resonance>.85&&!resonance_warned){resonance_warned=true;flashMessage('⚠️ RESONANCE WARNING — the bridge is oscillating!');}
    } else {resonance=Math.max(0,resonance-.003);resonance_warned=false;}
    for(const v of vehicles){
      const type=VEHICLE_TYPES[v.typeKey];const aff=[];
      for(let i=0;i<simJoints.length;i++){const sj=simJoints[i];if(sj.fixed)continue;const dx=Math.abs(sj.x-v.x),dy=sj.y-(GROUND_Y+5);if(dx<type.w*.75&&dy>-10&&dy<130)aff.push({i,p:1-dx/(type.w*.75)});}
      if(aff.length){const tw=aff.reduce((s,a)=>s+a.p,0);for(const{i,p}of aff)simJoints[i].y+=type.force*(p/tw)*rainMult();}
    }
  }

  // 3. Constraints
  for(let iter=0;iter<ITERATIONS;iter++){
    for(const sb of simBeams){
      if(sb.broken)continue;
      const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
      const dx=sjb.x-sja.x,dy=sjb.y-sja.y,cur=Math.hypot(dx,dy);if(cur<.001)continue;
      sb.tension=cur>sb.restLen;
      if(sb.material.tensionOnly&&!sb.tension)continue;
      const diff=(cur-sb.restLen)/cur*.5;
      if(!sja.fixed&&!sjb.fixed){sja.x+=dx*diff;sja.y+=dy*diff;sjb.x-=dx*diff;sjb.y-=dy*diff;}
      else if(!sja.fixed){sja.x+=dx*diff*2;sja.y+=dy*diff*2;}
      else if(!sjb.fixed){sjb.x-=dx*diff*2;sjb.y-=dy*diff*2;}
    }
  }

  // 4. Break detection + tension/compression
  let maxStress=0,dominantMat='steel';
  const rainBreak=rainActive?.85:1;
  if(settleFrames>0){for(const sj of simJoints)if(!sj.fixed)sj.baseY=sj.y;settleFrames--;}
  else{
    for(const sb of simBeams){
      if(sb.broken)continue;
      const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
      const sagA=sja.fixed?0:Math.max(0,sja.y-(sja.baseY??sja.y));
      const sagB=sjb.fixed?0:Math.max(0,sjb.y-(sjb.baseY??sjb.y));
      const sag=Math.max(sagA,sagB);
      // Resonance amplifies stress
      const resFactor=1+resonance*.6;
      sb.stress=Math.min(1.4,sag/(sb.material.sagBreak*.7*rainBreak)*resFactor);
      if(sb.stress>maxStress){maxStress=sb.stress;dominantMat=sb.material.key;}
      if(sag*resFactor>sb.material.sagBreak*rainBreak){
        sb.broken=true;playSnap(sb.material.key);
        const bx=(sja.x+sjb.x)/2,by=(sja.y+sjb.y)/2;
        fallingBeams.push({x:bx,y:by,vx:(Math.random()-.5)*3,vy:-1-Math.random()*2,angle:Math.atan2(sjb.y-sja.y,sjb.x-sja.x),av:(Math.random()-.5)*.2,len:sb.restLen,mat:sb.material,life:90});
        for(let i=0;i<8;i++)debrisParticles.push({x:bx,y:by,vx:(Math.random()-.5)*5,vy:-Math.random()*4-1,life:40,color:sb.material.color});
        if(resonance>.7)unlockAchievement('resonance');
        if(bx>CL()&&bx<CR()&&mode==='simulating')triggerLoss(sb.material.name+' beam snapped');
      }
    }
    if(maxStress>.75&&!creakInt)startCreak(dominantMat);
    else if(maxStress<.5)stopCreak();
  }

  // 5. Foundation crack check (track load on fixed anchor joints)
  if(settleFrames===0){
    getAnchors().forEach((a,ai)=>{
      let totalForce=0;
      simBeams.forEach(sb=>{if(sb.broken)return;const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];if(Math.abs(sja.x-a.x)<5&&Math.abs(sja.y-a.y)<5)totalForce+=sb.stress;if(Math.abs(sjb.x-a.x)<5&&Math.abs(sjb.y-a.y)<5)totalForce+=sb.stress;});
      if(totalForce>2.5){const prev=anchorCracks.get(ai)||0;anchorCracks.set(ai,Math.min(3,prev+(totalForce-2.5)*.002));}
    });
  }

  // 6. Particles
  for(const fb of fallingBeams){fb.x+=fb.vx;fb.y+=fb.vy;fb.vy+=.4;fb.angle+=fb.av;fb.life--;if(fb.y>H-30&&fb.life>10){fb.life=10;if(fb.y>H-20){playSplash();spawnSplash(fb.x,H-30);}}}
  fallingBeams=fallingBeams.filter(f=>f.life>0);
  for(const d of debrisParticles){d.x+=d.vx;d.y+=d.vy;d.vy+=.25;d.life--;}debrisParticles=debrisParticles.filter(d=>d.life>0);
  for(const s of splashParticles){s.x+=s.vx;s.y+=s.vy;s.vy+=.15;s.r*=.95;s.life--;}splashParticles=splashParticles.filter(s=>s.life>0);

  // 7. Record replay frame (every 2 frames for performance)
  if(frameCount%2===0&&replayFrames.length<1200){replayFrames.push(simJoints.map(sj=>({x:sj.x,y:sj.y})));}

  stepVehicles();
}

let resonance_warned=false;

function spawnSplash(x,y){for(let i=0;i<12;i++){const a=-Math.PI/2+(Math.random()-.5)*Math.PI;splashParticles.push({x,y,vx:Math.cos(a)*(1+Math.random()*3),vy:Math.sin(a)*(1+Math.random()*4),r:3+Math.random()*4,life:35,color:'#4aa0d0'});}}

function getBridgeSurfaceY(vx){let sy=null;for(const sb of simBeams){if(sb.broken||sb.material.tensionOnly)continue;const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];const minX=Math.min(sja.x,sjb.x),maxX=Math.max(sja.x,sjb.x);if(vx<minX||vx>maxX)continue;const t=(vx-sja.x)/((sjb.x-sja.x)||.001);const beamY=sja.y+t*(sjb.y-sja.y);if(beamY>GROUND_Y-80&&beamY<GROUND_Y+80)if(sy===null||beamY<sy)sy=beamY;}return sy;}

function spawnVehicle(typeKey){
  if(mode!=='simulating'){flashMessage('Click "Test Bridge" first.');return;}
  if(vehicles.some(v=>v.x<120)){flashMessage('Entry busy — wait a moment.');return;}
  const type=VEHICLE_TYPES[typeKey];
  vehicles.push({x:-type.w/2,y:GROUND_Y,vy:0,typeKey,wheelPhase:0,done:false,counted:false,trail:[]});
  refreshHUD();
}

function stepVehicles(){
  totalLoadKg=0;
  for(const v of vehicles){
    const type=VEHICLE_TYPES[v.typeKey];const spd=type.speed*(slowMo?.2:1);
    v.x+=spd;v.wheelPhase+=spd*.35;
    const onL=v.x<=CL(),onR=v.x>=CR();
    if(onL||onR){v.y=GROUND_Y;v.vy=0;}
    else{const sy=getBridgeSurfaceY(v.x);if(sy!==null&&v.y>=sy){v.y=sy;v.vy=0;totalLoadKg+=type.kg;}else{v.vy+=.6;v.y+=v.vy;}}
    if(v.x>CL()&&v.x<CR()){v.trail.push({x:v.x,y:v.y,age:0});if(v.trail.length>80)v.trail.shift();}
    for(const tp of v.trail)tp.age++;
    if(v.y>H+60){v.done=true;if(v.x>CL()&&v.x<CR()&&mode==='simulating'){playSplash();spawnSplash(v.x,H-30);triggerLoss('vehicle fell into the chasm');}}
    if(v.x>CR()+20&&v.y<=GROUND_Y+5&&!v.counted){
      v.counted=true;vehiclesCrossed++;challengeVehicleCount++;maxLoadSurvived=Math.max(maxLoadSurvived,type.kg);
      if(v.typeKey==='bicycle')unlockAchievement('bicycle_test');
      if(v.typeKey==='tank')unlockAchievement('tank_survived');
      if(v.typeKey==='train')unlockAchievement('train_survived');
      if(currentLevel===3)unlockAchievement('city_repaired');
      // Check cable usage for suspension achievement
      if(beams.some(b=>b.material==='cable')&&(v.typeKey==='semi'||v.typeKey==='tank'))unlockAchievement('suspension');
      if(challengeMode){const obj=challengeMode.objective;const cnt=obj.count||1;if(obj.thenTank&&challengeVehicleCount>=cnt&&!tanksSpawned){tanksSpawned=true;setTimeout(()=>spawnVehicle('tank'),2000);}else if(!obj.thenTank&&challengeVehicleCount>=cnt){if(!obj.maxCost||totalCost<=obj.maxCost){if(challengeMode.noScrews&&!beams.some(b=>b.isScrew))unlockAchievement('no_screws_win');triggerWin();}else triggerLoss('cost exceeded $'+obj.maxCost.toLocaleString());}if(obj.thenTank&&v.typeKey==='tank')triggerWin();}
    }
    if(v.x>W+80)v.done=true;
  }
  vehicles=vehicles.filter(v=>!v.done);
}

function triggerLoss(reason){if(mode!=='simulating')return;stopCreak();mode='lost';const grade=calcGrade(false);refreshHUD();showBanner('💥 Bridge Failure',`Cause: ${reason}\n\nSurvived ${vehiclesCrossed} vehicle(s) · Max: ${maxLoadSurvived.toLocaleString()} kg\n\nCost: $${Math.round(totalCost).toLocaleString()} · Grade: ${grade}\n\nReplay available below`,false);}
function triggerWin(){if(mode!=='simulating')return;stopCreak();mode='won';const grade=calcGrade(true);saveScore(Math.round(totalCost),maxLoadSurvived,grade);if(grade==='A+')unlockAchievement('a_plus');if(totalCost<5000&&maxLoadSurvived>0)unlockAchievement('under_5k');checkAchievements();refreshHUD();showBanner('🏗️ Bridge Survived!',`All vehicles crossed!\n\nCost: $${Math.round(totalCost).toLocaleString()} · Max: ${maxLoadSurvived.toLocaleString()} kg\n\nGrade: ${grade} — ${gradeDesc(grade)}`,true);}
function calcGrade(won){if(!won)return'F';const r=totalCost/BUD();const p=simBeams.reduce((m,b)=>Math.max(m,b.stress),0);if(r<.25&&p<.6)return'A+';if(r<.35)return'A';if(r<.5)return'B';if(r<.7)return'C';if(r<.9)return'D';return'D-';}
function gradeDesc(g){return{'A+':'Masterful. Minimal material, maximum strength.','A':'Excellent. Very efficient.','B':'Good. Some room to optimize.','C':'Solid but could be leaner.','D':'Barely held. Try a truss.','D-':'Technically passed.','F':'Back to the drawing board.'}[g]||'';}

function startReplay(){if(!replayFrames.length){flashMessage('No replay recorded yet.');return;}mode='replay';replayIdx=0;replayPlaying=true;refreshHUD();}
function stepReplay(){if(!replayPlaying)return;replayIdx++;if(replayIdx>=replayFrames.length){replayPlaying=false;replayIdx=replayFrames.length-1;}const frame=replayFrames[replayIdx];simJoints.forEach((sj,i)=>{if(!sj.fixed&&frame[i]){sj.x=frame[i].x;sj.y=frame[i].y;}});}

function resetGame(){stopCreak();simJoints=[];simBeams=[];vehicles=[];debrisParticles=[];splashParticles=[];fallingBeams=[];replayFrames=[];resonance=0;resonance_warned=false;anchorCracks.clear();totalLoadKg=0;vehiclesCrossed=0;maxLoadSurvived=0;challengeVehicleCount=0;tanksSpawned=false;windActive=false;quakeActive=false;rainActive=false;slowMo=false;buildTimerActive=false;inspectedBeam=null;hoverBeam=null;zoom=1;panX=0;panY=0;mode='build';initJoints();refreshHUD();hideBanner();if(!challengeMode){document.getElementById('mode-badge').style.display='none';document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('locked'));}}

// ============================================================
// Rendering
// ============================================================
function loop(){
  if(mode==='simulating')simulationStep();
  else if(mode==='replay')stepReplay();
  if(buildTimerActive&&mode==='build'){buildTimer--;if(buildTimer<=0){buildTimerActive=false;setTimeout(startSimulation,500);}}
  draw();requestAnimationFrame(loop);
}

function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  ctx.setTransform(dpr*zoom,0,0,dpr*zoom,panX*dpr,panY*dpr);
  drawSky();drawTerrain();
  if(mode==='build'){drawSpanDimension();drawAnchors();drawBeamsBuildMode();drawJointsBuildMode();if(drag&&activeMaterial!=='delete'&&activeMaterial!=='screw')drawDragLine();if(buildTimerActive)drawTimer();}
  else{drawTrails();drawBeamsPhysics();drawFallingBeams();drawSimJoints();drawDebris();drawSplash();drawVehicles();drawOverlays();drawInspector();drawForceOverlay();if(mode==='replay')drawReplayOverlay();}
  if(rainActive)drawRain();
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

// Sky
function drawSky(){
  const g=ctx.createLinearGradient(0,0,0,GROUND_Y);g.addColorStop(0,nightMode?'#010810':'#071828');g.addColorStop(1,nightMode?'#030f1e':'#0a3158');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=1;
  for(let x=0;x<=W;x+=25){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=25){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  if(nightMode){drawStars();ctx.save();ctx.fillStyle='#fffce8';ctx.shadowBlur=30;ctx.shadowColor='#fffce8';ctx.beginPath();ctx.arc(820,60,22,0,Math.PI*2);ctx.fill();ctx.restore();}
  else{for(const c of clouds){c.x=(c.x+c.speed)%W;ctx.save();ctx.globalAlpha=.18;ctx.fillStyle='#fff';[[0,0,c.w*.6,18],[c.w*.2,-10,c.w*.5,22],[c.w*.5,-4,c.w*.5,16]].forEach(([ox,oy,cw,ch])=>{ctx.beginPath();ctx.ellipse(c.x+ox,c.y+oy,cw/2,ch/2,0,0,Math.PI*2);ctx.fill();});ctx.restore();}}
  ctx.fillStyle=nightMode?'#060e18':'#0d2a45';[[0,280,200],[150,240,220],[600,260,200],[750,230,250]].forEach(([x,py,pw])=>{ctx.beginPath();ctx.moveTo(x,GROUND_Y);ctx.lineTo(x+pw/2,py);ctx.lineTo(x+pw,GROUND_Y);ctx.closePath();ctx.fill();});
  const tc=nightMode?'#061a0e':'#0d3a25';
  [()=>drawTrees(20,GROUND_Y-5,CL()-50,8),()=>drawTrees(CR()+20,GROUND_Y-5,W-CR()-40,8)].forEach(f=>f());
}
function drawStars(){for(const s of STARS){const a=.4+.6*Math.sin(s.phase+frameCount*.02);ctx.save();ctx.globalAlpha=a;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.restore();}}
function drawTrees(startX,y,totalW,count){const sp=totalW/(count+1);for(let i=1;i<=count;i++){const x=startX+sp*i,h=20+Math.sin(i*7)*8;const tc=nightMode?'#061a0e':'#0d3a25';ctx.fillStyle=tc;[[h*.4,8],[h*.75,10],[h,7]].forEach(([ty,hw])=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-hw,y-ty);ctx.lineTo(x+hw,y-ty);ctx.closePath();ctx.fill();});}}

// Terrain
function drawTerrain(){
  const wg=ctx.createLinearGradient(0,GROUND_Y,0,H);wg.addColorStop(0,nightMode?'#020f1c':'#04203b');wg.addColorStop(1,nightMode?'#010810':'#03152a');
  ctx.fillStyle=wg;ctx.fillRect(CL(),GROUND_Y,CR()-CL(),H-GROUND_Y);
  ctx.strokeStyle=nightMode?'rgba(200,220,255,0.12)':'rgba(100,160,220,0.15)';ctx.lineWidth=1;
  for(let i=0;i<6;i++){const wy=GROUND_Y+50+i*40+Math.sin(frameCount*.025+i)*5;ctx.beginPath();ctx.moveTo(CL(),wy);ctx.lineTo(CR(),wy);ctx.stroke();}
  if(lvl().pier){const cx=(CL()+CR())/2;ctx.fillStyle='#2a3a42';ctx.fillRect(cx-12,GROUND_Y+5,24,H-GROUND_Y);ctx.fillStyle='#3a4a52';ctx.fillRect(cx-14,GROUND_Y,28,12);}
  // Tower pylons
  ctx.fillStyle='#2a3a52';
  [[CL()-18,GROUND_Y-TOWER_H],[CR()+18,GROUND_Y-TOWER_H]].forEach(([tx,ty])=>{ctx.fillRect(tx-5,ty,10,GROUND_Y-ty+5);ctx.fillRect(tx-18,ty+30,36,6);ctx.fillRect(tx-14,ty+55,28,5);ctx.save();ctx.fillStyle='#64b4ff';if(nightMode){ctx.shadowBlur=15;ctx.shadowColor='#64b4ff';}ctx.beginPath();ctx.arc(tx,ty,5,0,Math.PI*2);ctx.fill();ctx.restore();});
  ctx.fillStyle=nightMode?'#1e2e38':'#3a4a52';ctx.fillRect(0,GROUND_Y,CL(),H-GROUND_Y);ctx.fillRect(CR(),GROUND_Y,W-CR(),H-GROUND_Y);
  ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;
  for(let i=-H;i<CL()+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  for(let i=CR()-H;i<W+H;i+=14){ctx.beginPath();ctx.moveTo(i,GROUND_Y);ctx.lineTo(i+(H-GROUND_Y),H);ctx.stroke();}
  ctx.strokeStyle='#cfe3ee';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(0,GROUND_Y);ctx.lineTo(CL(),GROUND_Y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(CR(),GROUND_Y);ctx.lineTo(W,GROUND_Y);ctx.stroke();
  // Foundation crack overlay
  anchorCracks.forEach((crack,ai)=>{if(crack<.5)return;const a=getAnchors()[ai];if(!a)return;ctx.save();ctx.globalAlpha=Math.min(.8,crack*.3);ctx.strokeStyle='#d4483a';ctx.lineWidth=2;for(let c=0;c<Math.floor(crack*2);c++){const ang=Math.random()*Math.PI*2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(a.x+Math.cos(ang)*15,a.y+Math.sin(ang)*15);ctx.stroke();}ctx.restore();});
}

function drawSpanDimension(){const y=GROUND_Y+115;ctx.save();ctx.strokeStyle='#7fa8c9';ctx.fillStyle='#7fa8c9';ctx.font='12px "IBM Plex Mono",monospace';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(CL(),y);ctx.lineTo(CR(),y);ctx.stroke();[CL(),CR()].forEach(x=>{ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x,y+6);ctx.stroke();});ctx.textAlign='center';ctx.fillText(`SPAN: ${((CR()-CL())*METERS_PER_PIXEL).toFixed(0)} m`,(CL()+CR())/2,y+18);ctx.restore();}

function drawAnchors(){
  for(const a of getAnchors()){
    if(a.label==='tower'){ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.PI/4);ctx.beginPath();ctx.fillStyle='rgba(100,180,255,0.2)';ctx.rect(-10,-10,20,20);ctx.fill();ctx.beginPath();ctx.fillStyle='#64b4ff';if(nightMode){ctx.shadowBlur=10;ctx.shadowColor='#64b4ff';}ctx.rect(-6,-6,12,12);ctx.fill();ctx.strokeStyle='#16212c';ctx.lineWidth=2;ctx.stroke();ctx.restore();if(a.y<GROUND_Y-TOWER_H+20){ctx.save();ctx.font='9px "IBM Plex Mono",monospace';ctx.fillStyle='#64b4ff';ctx.textAlign='center';ctx.fillText('cable only',a.x,a.y+22);ctx.restore();}}
    else{ctx.beginPath();ctx.fillStyle='rgba(232,163,61,0.25)';ctx.arc(a.x,a.y,12,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.fillStyle='#e8a33d';if(nightMode){ctx.shadowBlur=8;ctx.shadowColor='#e8a33d';}ctx.arc(a.x,a.y,7,0,Math.PI*2);ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#16212c';ctx.stroke();ctx.shadowBlur=0;}
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
    const mat=MATERIALS[b.material]||MATERIALS.steel;
    const isHover=hoverBeam?.id===b.id&&activeMaterial==='delete';
    ctx.lineWidth=mat.thickness+(isHover?4:0);
    ctx.strokeStyle=b.locked?'rgba(180,180,180,0.7)':isHover?'#d4483a':mat.color;
    ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();
    if(!isHover&&!b.locked){ctx.lineWidth=2;ctx.strokeStyle=mat.dark;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();}
    if(b.locked){ctx.save();ctx.setLineDash([4,4]);ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();ctx.restore();}
  }
}

function drawDragLine(){
  const mat=MATERIALS[activeMaterial]||MATERIALS.wood;
  const start=drag.from?{x:drag.from.x,y:drag.from.y}:pressDownPos;
  ctx.save();ctx.setLineDash([6,5]);ctx.lineWidth=mat.thickness;ctx.strokeStyle=mat.color;ctx.globalAlpha=.75;
  ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(drag.x,drag.y);ctx.stroke();ctx.restore();
  const d=dist(start.x,start.y,drag.x,drag.y);
  if(d>20){const mx=(start.x+drag.x)/2,my=(start.y+drag.y)/2;const cost=Math.round(d*METERS_PER_PIXEL*mat.costPerMeter);ctx.save();ctx.font='11px "IBM Plex Mono",monospace';ctx.fillStyle='#cfe3ee';ctx.textAlign='center';ctx.fillText(`${(d*METERS_PER_PIXEL).toFixed(1)}m · $${cost.toLocaleString()}`,mx,my-10);ctx.restore();}
  const snap=findNearestJoint(drag.x,drag.y,SNAP_RADIUS);
  if(snap){ctx.beginPath();ctx.strokeStyle='#49b07d';ctx.lineWidth=2;ctx.arc(snap.x,snap.y,SNAP_RADIUS,0,Math.PI*2);ctx.stroke();}
}

function drawTimer(){const secs=Math.ceil(buildTimer/60);const col=secs<30?'#d4483a':secs<60?'#e8a33d':'#cfe3ee';ctx.save();ctx.font='bold 18px "IBM Plex Mono",monospace';ctx.fillStyle=col;ctx.textAlign='right';ctx.fillText(`⏱ ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`,W-14,28);ctx.restore();}

function drawTrails(){for(const v of vehicles){if(!v.trail||v.trail.length<2)continue;for(let i=1;i<v.trail.length;i++){const p=v.trail[i-1],q=v.trail[i];ctx.save();ctx.globalAlpha=Math.max(0,(80-q.age)/80)*.3;ctx.strokeStyle='#8a6239';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.restore();}}}

function drawBeamsPhysics(){
  for(const sb of simBeams){
    const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
    ctx.save();ctx.translate((sja.x+sjb.x)/2,(sja.y+sjb.y)/2);ctx.rotate(Math.atan2(sjb.y-sja.y,sjb.x-sja.x));
    const half=sb.restLen/2;
    if(sb.broken){ctx.globalAlpha=.15;ctx.fillStyle='#d4483a';}
    else{
      // Tension/compression tint at low stress
      let col;
      if(sb.stress<.2){col=sb.tension?blendColor(sb.material.color,'#88ccff',.3):blendColor(sb.material.color,'#ffaa44',.2);}
      else col=stressColor(sb.stress,sb.material.color);
      if(nightMode&&sb.stress>.3){ctx.shadowBlur=8+sb.stress*12;ctx.shadowColor=col;}
      ctx.fillStyle=col;
    }
    ctx.fillRect(-half,-sb.material.thickness/2,half*2,sb.material.thickness);
    ctx.restore();
  }
  // Resonance warning pulse
  if(resonance>.4){ctx.save();ctx.globalAlpha=resonance*.15*Math.sin(frameCount*.15);ctx.strokeStyle='#88ccff';ctx.lineWidth=3;ctx.beginPath();ctx.rect(CL()-10,GROUND_Y-200,CR()-CL()+20,210);ctx.stroke();ctx.restore();}
}

function blendColor(hex1,hex2,t){const p=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];const[r1,g1,b1]=p(hex1);const[r2,g2,b2]=p(hex2);return`rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;}
function stressColor(s,base){if(s<.45)return base;const t=Math.min(1,(s-.45)/.55);return`rgb(${Math.round(232+(212-232)*t)},${Math.round(163+(72-163)*t)},${Math.round(61+(58-61)*t)})`;}

function drawFallingBeams(){for(const fb of fallingBeams){ctx.save();ctx.globalAlpha=Math.min(1,fb.life/20);ctx.translate(fb.x,fb.y);ctx.rotate(fb.angle);ctx.fillStyle=fb.mat.color;ctx.fillRect(-fb.len/2,-fb.mat.thickness/2,fb.len,fb.mat.thickness);ctx.restore();}}
function drawSimJoints(){for(const sj of simJoints){if(sj.fixed)continue;ctx.beginPath();ctx.fillStyle='rgba(242,236,221,0.35)';ctx.arc(sj.x,sj.y,4,0,Math.PI*2);ctx.fill();}}
function drawDebris(){for(const d of debrisParticles){ctx.save();ctx.globalAlpha=d.life/40;ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(d.x,d.y,3,0,Math.PI*2);ctx.fill();ctx.restore();}}
function drawSplash(){for(const s of splashParticles){ctx.save();ctx.globalAlpha=s.life/35;ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.restore();}}
function drawRain(){ctx.save();ctx.strokeStyle='rgba(180,210,240,0.45)';ctx.lineWidth=1;for(const d of rainDrops){d.x-=1.5*(slowMo?.2:1);d.y+=d.spd*(slowMo?.2:1);if(d.y>H){d.y=-20;d.x=Math.random()*W*1.5;}if(d.x<-50){d.x=W;d.y=Math.random()*H;}ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-3,d.y+d.len);ctx.stroke();}ctx.restore();}

function drawOverlays(){
  if(windActive){ctx.save();ctx.globalAlpha=.07;ctx.fillStyle='#8fb0cc';ctx.fillRect(0,0,W,H);ctx.restore();}
  if(quakeActive||autoQuakeTimer<60){ctx.save();ctx.globalAlpha=.06;ctx.fillStyle='#d4483a';ctx.fillRect(0,0,W,H);ctx.restore();}
  if(rainActive){ctx.save();ctx.globalAlpha=.05;ctx.fillStyle='#4488aa';ctx.fillRect(0,0,W,H);ctx.restore();}
  const labs=[];if(windActive)labs.push('💨 WIND');if(quakeActive)labs.push('🌋 QUAKE');if(rainActive)labs.push('🌧 RAIN +20%');if(nightMode)labs.push('🌙 NIGHT');if(resonance>.3)labs.push(`🌊 RESONANCE ${Math.round(resonance*100)}%`);if(labs.length){ctx.save();ctx.font='bold 12px Archivo,sans-serif';ctx.fillStyle='#cfe3ee';ctx.textAlign='left';labs.forEach((l,i)=>ctx.fillText(l,12,22+i*18));ctx.restore();}
}

function drawInspector(){
  if(!inspectedBeam||inspectedBeam.broken)return;
  const sja=simJoints[inspectedBeam.ai],sjb=simJoints[inspectedBeam.bi];
  const mx=(sja.x+sjb.x)/2,my=(sja.y+sjb.y)/2;
  const stress=Math.round(inspectedBeam.stress*100/1.4);
  const mode2=inspectedBeam.tension?'TENSION':'COMPRESSION';
  const lines=[`Material: ${inspectedBeam.material.name}`,`Length: ${(inspectedBeam.restLen*METERS_PER_PIXEL).toFixed(1)}m`,`Cost: $${Math.round(inspectedBeam.restLen*METERS_PER_PIXEL*inspectedBeam.material.costPerMeter).toLocaleString()}`,`Stress: ${stress}%`,`Mode: ${mode2}`,`Status: ${inspectedBeam.stress>1?'⚠️ CRITICAL':inspectedBeam.stress>.6?'🟠 HIGH':inspectedBeam.stress>.3?'🟡 MODERATE':'🟢 OK'}`];
  const pw=200,ph=lines.length*20+22,px=Math.min(mx+10,W-pw-10),py=Math.max(my-ph-10,10);
  ctx.save();ctx.fillStyle='rgba(8,20,35,0.93)';ctx.strokeStyle='#e8a33d';ctx.lineWidth=1.5;rrPath(px,py,pw,ph,6);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e8a33d';ctx.font='bold 11px "IBM Plex Mono",monospace';ctx.textAlign='left';ctx.fillText('BEAM INSPECTOR',px+10,py+16);
  ctx.fillStyle='#cfe3ee';ctx.font='11px "IBM Plex Mono",monospace';lines.forEach((l,i)=>ctx.fillText(l,px+10,py+32+i*20));
  ctx.restore();
}

function drawReplayOverlay(){
  ctx.save();
  const pct=replayFrames.length>0?replayIdx/replayFrames.length:0;
  ctx.fillStyle='rgba(8,20,35,0.7)';ctx.fillRect(CL(),H-36,CR()-CL(),28);
  ctx.fillStyle='#e8a33d';ctx.fillRect(CL()+4,H-30,(CR()-CL()-8)*pct,16);
  ctx.fillStyle='#cfe3ee';ctx.font='bold 11px "IBM Plex Mono",monospace';ctx.textAlign='center';
  ctx.fillText(`REPLAY ${replayPlaying?'▶':'⏸'} — Click to pause/play · Esc to exit`,(CL()+CR())/2,H-10);
  ctx.restore();
}

function drawVehicles(){
  for(const v of vehicles){
    const type=VEHICLE_TYPES[v.typeKey];const w=type.w,h=type.h,vx=v.x,vy=v.y-h/2-3;
    ctx.save();ctx.translate(vx,vy);
    const wR=Math.max(4,h*.3),wY=h/2-wR*.5;
    const wheelXs=v.typeKey==='train'?[-w/2+14,-w/2+50,-w/2+86,-w/2+122,-w/2+158]:[-w/2+wR+2,w/2-wR-2];
    for(const wx of wheelXs){ctx.save();ctx.translate(wx,wY);ctx.fillStyle='#1c1c1c';ctx.beginPath();ctx.arc(0,0,wR,0,Math.PI*2);ctx.fill();ctx.rotate(v.wheelPhase);ctx.strokeStyle='#555';ctx.lineWidth=1.5;for(let s=0;s<4;s++){const a=(Math.PI/2)*s;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*wR*.8,Math.sin(a)*wR*.8);ctx.stroke();}ctx.restore();}
    rrPath(-w/2,-h/2,w,h,Math.min(6,h*.25));ctx.fillStyle=type.color;ctx.fill();ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=1.5;ctx.stroke();
    if(v.typeKey!=='bicycle'){ctx.fillStyle='rgba(255,255,255,.5)';rrPath(w/2-w*.32-w*.08,-h/2+2,w*.32,h-4,3);ctx.fill();}
    if(nightMode){ctx.save();ctx.shadowBlur=22;ctx.shadowColor='#fffce8';ctx.fillStyle='#fffce8';ctx.beginPath();ctx.arc(w/2-2,0,Math.max(2,h*.1),0,Math.PI*2);ctx.fill();ctx.restore();}
    else{ctx.fillStyle='#fff3c4';ctx.beginPath();ctx.arc(w/2-2,0,Math.max(2,h*.08),0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
}

function rrPath(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

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
  copyBtn:document.getElementById('btn-copy'),replayBtn:document.getElementById('btn-replay'),
  shareBtn:document.getElementById('btn-share'),
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
  if(mode==='build')el.wave.textContent=buildTimerActive?'⏱ Building...':'Ready to test';
  else if(mode==='simulating')el.wave.textContent=totalLoadKg>0?`Load: ${totalLoadKg.toLocaleString()} kg`:'Spawn a vehicle';
  else if(mode==='replay')el.wave.textContent=`Replay ${replayPlaying?'▶':'⏸'}`;
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
  renderLeaderboard();renderAchievements();
  ['stat-crossed','stat-maxload','stat-broken','stat-stress'].forEach(id=>{const e=document.getElementById(id);if(!e)return;if(mode==='build'){e.textContent='—';return;}if(id==='stat-crossed')e.textContent=vehiclesCrossed;else if(id==='stat-maxload')e.textContent=maxLoadSurvived?maxLoadSurvived.toLocaleString()+' kg':'—';else if(id==='stat-broken')e.textContent=simBeams.filter(b=>b.broken).length;else if(id==='stat-stress'){const p=simBeams.reduce((m,b)=>Math.max(m,b.stress),0);e.textContent=p>0?Math.round(p/1.4*100)+'%':'—';}});
}

function renderLeaderboard(){
  if(!el.lbPanel)return;const lb=getLeaderboard();
  if(!lb.length){el.lbPanel.innerHTML='<div class="lb-empty">No scores yet.</div>';return;}
  const top=lb.slice(0,5);const maxC=Math.max(...top.map(s=>s.cost));
  const bars=top.map((s,i)=>{const h=Math.round(10+((maxC-s.cost)/maxC)*55);return`<div class="lb-bar-wrap" title="$${s.cost.toLocaleString()}"><div class="lb-bar-fill" style="height:${h}px;background:${i===0?'#49b07d':'#e8a33d'}"></div></div>`;}).join('');
  el.lbPanel.innerHTML=`<div class="lb-title">🏆 Best Scores</div><div class="lb-chart">${bars}</div>`+top.map((s,i)=>`<div class="lb-row"><span class="lb-rank">#${i+1}</span><span class="lb-cost">$${s.cost.toLocaleString()}</span><span class="lb-grade">${s.grade}</span><span class="lb-date">${s.date}</span></div>`).join('');
}

function showBanner(title,body,won){el.bannerTitle.textContent=title;el.bannerBody.innerHTML=body.replace(/\n/g,'<br>');el.banner.classList.add('visible');el.banner.classList.toggle('banner-won',!!won);}
function hideBanner(){el.banner.classList.remove('visible');}
function flashMessage(msg){if(el.instructions)el.instructions.textContent=msg;setTimeout(refreshHUD,2500);}

// ============================================================
// Wiring
// ============================================================
el.testBtn?.addEventListener('click',startSimulation);
el.resetBtn?.addEventListener('click',resetGame);
el.bannerBtn?.addEventListener('click',resetGame);
el.undoBtn?.addEventListener('click',undoAction);
el.symBtn?.addEventListener('click',()=>{symmetryMode=!symmetryMode;refreshHUD();});
el.slowBtn?.addEventListener('click',()=>{slowMo=!slowMo;refreshHUD();});
el.copyBtn?.addEventListener('click',copyLeftHalf);
el.nightBtn?.addEventListener('click',()=>{nightMode=!nightMode;refreshHUD();});
el.replayBtn?.addEventListener('click',startReplay);
el.shareBtn?.addEventListener('click',shareBridge);
el.windBtn?.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}windActive=true;windTimer=180;refreshHUD();});
el.quakeBtn?.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}quakeActive=true;quakeTimer=120;refreshHUD();});
el.rainBtn?.addEventListener('click',()=>{if(mode!=='simulating'){flashMessage('Start testing first.');return;}rainActive=true;rainTimer=360;refreshHUD();});

document.querySelectorAll('.material-card').forEach(card=>{card.addEventListener('click',()=>{if(card.classList.contains('locked'))return;document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('active'));card.classList.add('active');activeMaterial=card.dataset.material;hoverBeam=null;refreshHUD();});});
document.querySelectorAll('.spawn-btn').forEach(btn=>btn.addEventListener('click',()=>spawnVehicle(btn.dataset.type)));
document.getElementById('btn-save')?.addEventListener('click',()=>{const inp=document.getElementById('save-name-input');const name=(inp?.value||'').trim()||'Bridge '+(getSaves().length+1);saveDesign(name);if(inp)inp.value='';flashMessage('✓ Saved: '+name);});
document.getElementById('btn-restore-auto')?.addEventListener('click',()=>{const d=JSON.parse(localStorage.getItem('autosave')||'null');if(!d){flashMessage('No auto-save found.');return;}if(!confirm('Restore auto-save? Current build will be lost.'))return;currentLevel=d.level;joints=d.joints;beams=d.beams;totalCost=d.totalCost;nextId=Math.max(...joints.map(j=>j.id),...beams.map(b=>b.id))+1;buildLevelUI();resetGame();});
document.getElementById('btn-free-build')?.addEventListener('click',()=>{challengeMode=null;document.getElementById('mode-badge').style.display='none';document.querySelectorAll('.material-card').forEach(c=>c.classList.remove('locked'));resetGame();});
document.getElementById('btn-tut-next')?.addEventListener('click',()=>showTutorialStep(tutorialStep+1));
document.getElementById('btn-tut-skip')?.addEventListener('click',()=>showTutorialStep(-1));

window.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.key==='z'){e.preventDefault();undoAction();}
  if(e.key==='s'&&!e.ctrlKey){symmetryMode=!symmetryMode;refreshHUD();}
  if(e.key==='m'||e.key==='M'){slowMo=!slowMo;refreshHUD();}
  if(e.key==='n'||e.key==='N'){nightMode=!nightMode;refreshHUD();}
  if(e.key==='d'||e.key==='D'){const c=document.querySelector('.material-card[data-material="delete"]');if(c)c.click();}
  if(e.key==='r'||e.key==='R'){if(mode==='replay')replayPlaying=!replayPlaying;}
  if(e.key==='Escape'){showTutorialStep(-1);inspectedBeam=null;if(mode==='replay'){mode='lost';refreshHUD();}zoom=1;panX=0;panY=0;}
});

// ============================================================
// Boot
// ============================================================
loadAchievements();
resizeCanvasForDPR();
initJoints();
buildLevelUI();
buildChallengeUI();
renderSaves();
renderAchievements();
refreshHUD();
loadSharedBridge();
requestAnimationFrame(loop);
if(!localStorage.getItem('tutorialDone'))showTutorialStep(0);

// ============================================================
// GRID SNAP
// ============================================================
let gridSnap = false;
const GRID_SIZE = 25;
function snapToGrid(x, y) {
  if (!gridSnap) return { x, y };
  return { x: Math.round(x / GRID_SIZE) * GRID_SIZE, y: Math.round(y / GRID_SIZE) * GRID_SIZE };
}

// Patch canvasPos to support grid snap
const _origCanvasPos = canvasPos;
// Override drag handling to snap
const _origPointerUp = null;

// ============================================================
// EXAMPLE BRIDGE TEMPLATES
// ============================================================
function loadTemplate(name) {
  if (mode !== 'build') { flashMessage('Switch to build mode first.'); return; }
  pushHistory();
  // Clear free joints and beams
  joints = joints.filter(j => j.fixed);
  beams = [];
  totalCost = 0;
  nextId = Math.max(...joints.map(j => j.id)) + 1;

  const cl = CL(), cr = CR(), mid = (cl + cr) / 2;
  const span = cr - cl;
  const seg = span / 4; // quarter segments

  switch (name) {
    case 'pratt': buildPrattTruss(cl, cr, seg); break;
    case 'warren': buildWarrenTruss(cl, cr, seg); break;
    case 'arch': buildArchBridge(cl, cr, seg); break;
    case 'suspension': buildSuspensionBridge(cl, cr, mid); break;
    case 'simple': buildSimpleBeam(cl, cr); break;
  }
  refreshHUD();
  flashMessage('✓ Template loaded — click Test Bridge to try it!');
}

function jAt(x, y) {
  const ex = joints.find(j => Math.abs(j.x - x) < 6 && Math.abs(j.y - y) < 6);
  if (ex) return ex;
  return addJoint(x, y, false);
}
function bMat(a, b, mat) {
  if (!beamExists(a.id, b.id)) addBeam(a, b, mat);
}

function buildSimpleBeam(cl, cr) {
  const a = joints.find(j => j.fixed && Math.abs(j.x - cl) < 6 && Math.abs(j.y - GROUND_Y + 5) < 20);
  const b = joints.find(j => j.fixed && Math.abs(j.x - cr) < 6 && Math.abs(j.y - GROUND_Y + 5) < 20);
  if (a && b) bMat(a, b, 'steel');
}

function buildPrattTruss(cl, cr, seg) {
  const ry = GROUND_Y + 5, ty = GROUND_Y - 80;
  const pts = [0, 1, 2, 3, 4].map(i => ({ bot: jAt(cl + i * seg, ry), top: jAt(cl + i * seg, ty) }));
  pts[0].bot = joints.find(j => j.fixed && Math.abs(j.x - cl) < 6 && j.y > GROUND_Y - 20) || pts[0].bot;
  pts[4].bot = joints.find(j => j.fixed && Math.abs(j.x - cr) < 6 && j.y > GROUND_Y - 20) || pts[4].bot;
  // Chords
  for (let i = 0; i < 4; i++) { bMat(pts[i].bot, pts[i+1].bot, 'steel'); bMat(pts[i].top, pts[i+1].top, 'steel'); }
  // Verticals
  for (let i = 0; i < 5; i++) bMat(pts[i].bot, pts[i].top, 'steel');
  // Diagonals (Pratt pattern: compression diagonals slope toward center)
  for (let i = 0; i < 2; i++) bMat(pts[i].top, pts[i+1].bot, 'steel');
  for (let i = 2; i < 4; i++) bMat(pts[i+1].top, pts[i].bot, 'steel');
}

function buildWarrenTruss(cl, cr, seg) {
  const ry = GROUND_Y + 5, ty = GROUND_Y - 75;
  const bots = [0, 1, 2, 3, 4].map(i => {
    if (i === 0) return joints.find(j => j.fixed && Math.abs(j.x - cl) < 6 && j.y > GROUND_Y - 20) || jAt(cl, ry);
    if (i === 4) return joints.find(j => j.fixed && Math.abs(j.x - cr) < 6 && j.y > GROUND_Y - 20) || jAt(cr, ry);
    return jAt(cl + i * seg, ry);
  });
  const tops = [0, 1, 2, 3].map(i => jAt(cl + seg * 0.5 + i * seg, ty));
  // Bottom chord
  for (let i = 0; i < 4; i++) bMat(bots[i], bots[i+1], 'steel');
  // Diagonals (Warren: alternating)
  for (let i = 0; i < 4; i++) { bMat(bots[i], tops[i], 'steel'); bMat(bots[i+1], tops[i], 'steel'); }
  // Top chord
  for (let i = 0; i < 3; i++) bMat(tops[i], tops[i+1], 'steel');
}

function buildArchBridge(cl, cr, seg) {
  const ry = GROUND_Y + 5;
  const mid = (cl + cr) / 2;
  const archH = 120;
  const bl = joints.find(j => j.fixed && Math.abs(j.x - cl) < 6 && j.y > GROUND_Y - 20);
  const br = joints.find(j => j.fixed && Math.abs(j.x - cr) < 6 && j.y > GROUND_Y - 20);
  // Deck
  const d1 = jAt(cl + seg, ry), d2 = jAt(mid, ry), d3 = jAt(cr - seg, ry);
  bMat(bl, d1, 'concrete'); bMat(d1, d2, 'concrete'); bMat(d2, d3, 'concrete'); bMat(d3, br, 'concrete');
  // Arch nodes
  const a1 = jAt(cl + seg * 0.8, GROUND_Y - archH * 0.6);
  const a2 = jAt(cl + seg * 1.6, GROUND_Y - archH);
  const a3 = jAt(mid, GROUND_Y - archH * 1.1);
  const a4 = jAt(cl + seg * 2.4, GROUND_Y - archH);
  const a5 = jAt(cl + seg * 3.2, GROUND_Y - archH * 0.6);
  // Arch ribs
  [bl, a1, a2, a3, a4, a5, br].reduce((prev, cur) => { bMat(prev, cur, 'steel'); return cur; });
  // Hangers
  [[a1, d1], [a2, d1], [a2, d2], [a3, d2], [a4, d2], [a4, d3], [a5, d3]].forEach(([a, b]) => bMat(a, b, 'steel'));
}

function buildSuspensionBridge(cl, cr, mid) {
  const ry = GROUND_Y + 5;
  const towerAnchors = joints.filter(j => j.isTower);
  if (towerAnchors.length < 4) { flashMessage('Need tower anchors — use River Crossing or Grand Canyon level.'); return; }
  const ltop = towerAnchors.find(j => j.x < mid && j.y < GROUND_Y - TOWER_H * 0.7);
  const rtop = towerAnchors.find(j => j.x > mid && j.y < GROUND_Y - TOWER_H * 0.7);
  if (!ltop || !rtop) return;
  // Main cable
  const c1 = jAt(cl + (mid - cl) * 0.3, GROUND_Y - 50);
  const c2 = jAt(mid, GROUND_Y - 20);
  const c3 = jAt(cr - (cr - mid) * 0.3, GROUND_Y - 50);
  [ltop, c1, c2, c3, rtop].reduce((p, c) => { addBeam(p, c, 'cable'); return c; });
  // Deck
  const dl = joints.find(j => j.fixed && Math.abs(j.x - cl) < 6 && j.y > GROUND_Y - 20);
  const dr = joints.find(j => j.fixed && Math.abs(j.x - cr) < 6 && j.y > GROUND_Y - 20);
  const dm = jAt(mid, ry);
  bMat(dl, dm, 'steel'); bMat(dm, dr, 'steel');
  // Hangers
  bMat(c1, jAt(cl + (mid - cl) * 0.3, ry), 'steel');
  bMat(c2, dm, 'steel');
  bMat(c3, jAt(cr - (cr - mid) * 0.3, ry), 'steel');
}

// ============================================================
// FORCE DIAGRAM OVERLAY
// ============================================================
let forceOverlay = false;
function drawForceOverlay() {
  if (!forceOverlay || mode !== 'simulating') return;
  for (const sb of simBeams) {
    if (sb.broken) continue;
    const sja = simJoints[sb.ai], sjb = simJoints[sb.bi];
    const mx = (sja.x + sjb.x) / 2, my = (sja.y + sjb.y) / 2;
    const ang = Math.atan2(sjb.y - sja.y, sjb.x - sja.x);
    const mag = Math.min(sb.stress * 20, 25);
    if (mag < 1) continue;
    const col = sb.tension ? '#64b4ff' : '#ff8844';
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
    // Arrow showing force direction
    if (sb.tension) {
      // Tension: arrows pulling outward
      [[1, 1], [-1, -1]].forEach(([s]) => {
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(ang) * s * 6, my + Math.sin(ang) * s * 6);
        ctx.lineTo(mx + Math.cos(ang) * s * (6 + mag), my + Math.sin(ang) * s * (6 + mag));
        ctx.stroke();
      });
    } else {
      // Compression: arrows pushing inward
      [[1, 1], [-1, -1]].forEach(([s]) => {
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(ang) * s * (6 + mag), my + Math.sin(ang) * s * (6 + mag));
        ctx.lineTo(mx + Math.cos(ang) * s * 6, my + Math.sin(ang) * s * 6);
        ctx.stroke();
      });
    }
    ctx.restore();
  }
}

// ============================================================
// ENGINEERING REPORT
// ============================================================
function generateReport() {
  const span = ((CR() - CL()) * METERS_PER_PIXEL).toFixed(1);
  const totalM = (beams.reduce((s, b) => s + b.length, 0) * METERS_PER_PIXEL).toFixed(1);
  const matBreakdown = {};
  beams.forEach(b => {
    const m = MATERIALS[b.material];
    if (!matBreakdown[b.material]) matBreakdown[b.material] = { meters: 0, cost: 0, count: 0 };
    matBreakdown[b.material].meters += b.length * METERS_PER_PIXEL;
    matBreakdown[b.material].cost += b.length * METERS_PER_PIXEL * m.costPerMeter;
    matBreakdown[b.material].count++;
  });

  const peakStress = simBeams.length ? simBeams.reduce((m, b) => Math.max(m, b.stress), 0) : 0;
  const brokenCount = simBeams.filter(b => b.broken).length;
  const tensionBeams = simBeams.filter(b => b.tension && !b.broken).length;
  const compressionBeams = simBeams.filter(b => !b.tension && !b.broken).length;
  const grade = mode === 'won' || mode === 'lost' ? calcGrade(mode === 'won') : 'N/A';
  const budgetPct = ((totalCost / BUD()) * 100).toFixed(1);

  const matRows = Object.entries(matBreakdown).map(([k, v]) =>
    `  ${MATERIALS[k].name.padEnd(14)} ${v.count.toString().padStart(3)} beams   ${v.meters.toFixed(1).padStart(6)}m   $${Math.round(v.cost).toLocaleString().padStart(8)}`
  ).join('\n');

  const simSummary = simBeams.length > 0 ? `
SIMULATION RESULTS
──────────────────────────────────────────────────────────────
  Test grade:          ${grade}
  Vehicles crossed:    ${vehiclesCrossed}
  Max load survived:   ${maxLoadSurvived.toLocaleString()} kg
  Beams broken:        ${brokenCount} / ${simBeams.length}
  Peak stress:         ${(peakStress / 1.4 * 100).toFixed(0)}%
  Beams in tension:    ${tensionBeams}
  Beams in compression:${compressionBeams}
  Resonance reached:   ${(resonance * 100).toFixed(0)}%

STRUCTURAL ANALYSIS
──────────────────────────────────────────────────────────────
  ${peakStress > 1.0 ? '⚠  Critical overload detected — primary members exceeded failure threshold.' :
    peakStress > 0.6 ? '⚡ High stress — structure passed but has minimal safety margin.' :
    peakStress > 0.3 ? '✓  Moderate stress — reasonable safety margin observed.' :
    '✓✓ Low stress — well over-engineered for the applied load.'}
  ${brokenCount > 0 ? `   ${brokenCount} beam(s) failed. Review diagonal bracing and span-to-depth ratio.` : '   No structural failures.'}
  ${resonance > 0.5 ? '⚠  Significant resonance detected — add damping members or vary vehicle spacing.' : ''}` : '\n  (Run a simulation to populate this section.)';

  const report = `
════════════════════════════════════════════════════════════════
  LOAD LIMIT — BRIDGE ENGINEERING ANALYSIS REPORT
  Generated: ${new Date().toLocaleString()}
════════════════════════════════════════════════════════════════

PROJECT OVERVIEW
──────────────────────────────────────────────────────────────
  Level:               ${lvl().name}
  Span length:         ${span} m
  Total beam count:    ${beams.length}
  Total beam length:   ${totalM} m
  Budget utilization:  $${Math.round(totalCost).toLocaleString()} / $${BUD().toLocaleString()} (${budgetPct}%)

MATERIAL BREAKDOWN
──────────────────────────────────────────────────────────────
  Material       Beams        Length        Cost
  ─────────────────────────────────────────────
${matRows}
  ─────────────────────────────────────────────
  TOTAL         ${beams.length.toString().padStart(4)} beams  ${totalM.padStart(7)}m  $${Math.round(totalCost).toLocaleString().padStart(8)}
${simSummary}

SIMULATION METHODOLOGY
──────────────────────────────────────────────────────────────
  This simulation uses Position-Based Dynamics (Verlet integration)
  with iterative constraint relaxation (${8} passes/frame at 60fps).
  
  Failure criterion: joint vertical sag exceeding material-specific
  threshold (wood: 2.5px, concrete: 9px, steel: 22px, carbon: 32px).
  
  Vehicle load is distributed to nearby structural nodes proportional
  to horizontal proximity (linear weight distribution model).

LIMITATIONS
──────────────────────────────────────────────────────────────
  • 2D planar analysis only (no out-of-plane effects)
  • Simplified material model (no fatigue, no plastic deformation)
  • Node masses approximated from beam geometry
  • Dynamic effects simplified (no true modal analysis)

════════════════════════════════════════════════════════════════
  Load Limit Bridge Engineering Lab  |  ${window.location.href.split('#')[0]}
════════════════════════════════════════════════════════════════
`.trim();

  // Open in new window for easy printing/saving
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Bridge Report</title>
    <style>body{font-family:"Courier New",monospace;font-size:13px;padding:32px;max-width:720px;margin:0 auto;line-height:1.6;background:#fff;color:#111;}
    pre{white-space:pre-wrap;}
    @media print{body{padding:16px;}}
    .print-btn{background:#e8a33d;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;margin-bottom:20px;}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
    <pre>${report}</pre></body></html>`);
  win.document.close();
}

// ============================================================
// CSV EXPORT
// ============================================================
function exportCSV() {
  if (!simBeams.length) { flashMessage('Run a simulation first to export data.'); return; }
  const rows = [['Beam Index', 'Material', 'Length (m)', 'Stress %', 'Mode', 'Broken', 'Cost ($)']];
  simBeams.forEach((sb, i) => {
    const lenM = (sb.restLen * METERS_PER_PIXEL).toFixed(3);
    const stressPct = (sb.stress / 1.4 * 100).toFixed(1);
    const cost = Math.round(sb.restLen * METERS_PER_PIXEL * sb.material.costPerMeter);
    rows.push([i + 1, sb.material.name, lenM, stressPct, sb.tension ? 'tension' : 'compression', sb.broken ? 'yes' : 'no', cost]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bridge_stress_data_${Date.now()}.csv`;
  a.click();
  flashMessage('✓ Stress data exported as CSV');
}

// ============================================================
// DESIGN COMPARISON
// ============================================================
let comparisonA = null;
function saveForComparison() {
  if (mode !== 'won' && mode !== 'lost') { flashMessage('Test a bridge first to save it for comparison.'); return; }
  comparisonA = {
    cost: Math.round(totalCost), grade: calcGrade(mode === 'won'),
    maxLoad: maxLoadSurvived, crossed: vehiclesCrossed,
    beams: beams.length, peakStress: simBeams.reduce((m, b) => Math.max(m, b.stress), 0),
    label: `Design A — $${Math.round(totalCost).toLocaleString()}`
  };
  flashMessage('✓ Design A saved — rebuild and test again, then click Compare');
}
function compareDesigns() {
  if (!comparisonA) { flashMessage('Save a design first with "Save for Comparison"'); return; }
  if (mode !== 'won' && mode !== 'lost') { flashMessage('Test your second design first.'); return; }
  const b = {
    cost: Math.round(totalCost), grade: calcGrade(mode === 'won'),
    maxLoad: maxLoadSurvived, crossed: vehiclesCrossed,
    beams: beams.length, peakStress: simBeams.reduce((m, sb) => Math.max(m, sb.stress), 0),
    label: `Design B — $${Math.round(totalCost).toLocaleString()}`
  };
  const a = comparisonA;
  const win = window.open('', '_blank');
  const row = (label, av, bv, betterFn) => {
    const ab = betterFn(av, bv);
    return `<tr><td>${label}</td><td class="${ab===1?'win':''}">${av}</td><td class="${ab===2?'win':''}">${bv}</td></tr>`;
  };
  win.document.write(`<html><head><title>Bridge Comparison</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;max-width:640px;margin:0 auto;background:#f5f5f5;}
    h1{color:#0a3158;}table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);}
    th{background:#0a3158;color:#fff;padding:12px 16px;text-align:left;}
    td{padding:10px 16px;border-bottom:1px solid #eee;}tr:last-child td{border:none;}
    td:first-child{font-weight:600;color:#444;}
    .win{background:#e8f5e9;color:#2e7d32;font-weight:700;}
    .print-btn{background:#e8a33d;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;margin-bottom:20px;}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">🖨 Print</button>
    <h1>Bridge Design Comparison</h1>
    <table><thead><tr><th>Metric</th><th>${a.label}</th><th>${b.label}</th></tr></thead><tbody>
    ${row('Grade', a.grade, b.grade, (x,y)=>x==='A+'?1:y==='A+'?2:x<y?1:2)}
    ${row('Total Cost', '$'+a.cost.toLocaleString(), '$'+b.cost.toLocaleString(), (x,y)=>a.cost<b.cost?1:2)}
    ${row('Max Load Survived', a.maxLoad.toLocaleString()+' kg', b.maxLoad.toLocaleString()+' kg', (x,y)=>a.maxLoad>b.maxLoad?1:2)}
    ${row('Vehicles Crossed', a.crossed, b.crossed, (x,y)=>a.crossed>b.crossed?1:2)}
    ${row('Beam Count', a.beams, b.beams, (x,y)=>a.beams<b.beams?1:2)}
    ${row('Peak Stress', (a.peakStress/1.4*100).toFixed(0)+'%', (b.peakStress/1.4*100).toFixed(0)+'%', (x,y)=>a.peakStress<b.peakStress?1:2)}
    </tbody></table></body></html>`);
  win.document.close();
  comparisonA = null;
}

// Wire up new buttons
document.getElementById('btn-grid-snap')?.addEventListener('click', () => {
  gridSnap = !gridSnap;
  document.getElementById('btn-grid-snap')?.classList.toggle('active-tool', gridSnap);
  flashMessage(gridSnap ? '✓ Grid snap ON — joints snap to 25px grid' : 'Grid snap OFF');
});
document.getElementById('btn-force-overlay')?.addEventListener('click', () => {
  forceOverlay = !forceOverlay;
  document.getElementById('btn-force-overlay')?.classList.toggle('active-tool', forceOverlay);
});
document.getElementById('btn-report')?.addEventListener('click', generateReport);
document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
document.getElementById('btn-save-compare')?.addEventListener('click', saveForComparison);
document.getElementById('btn-compare')?.addEventListener('click', compareDesigns);

document.querySelectorAll('.template-btn').forEach(btn => {
  btn.addEventListener('click', () => loadTemplate(btn.dataset.template));
});

// Patch pointerdown to apply grid snap
canvas.addEventListener('pointerdown', e => {
  if (mode !== 'build' || !gridSnap) return;
  const p = _origCanvasPos ? _origCanvasPos.call(null, e) : canvasPos(e);
  // Grid snap is applied when joints are created — handled in addJoint callers
}, true);


// ============================================================
// VISIT COUNTER
// ============================================================
(function(){
  const key='bridge_visits';
  const v=parseInt(localStorage.getItem(key)||'0')+1;
  localStorage.setItem(key,v);
  const el=document.getElementById('visit-count');
  if(el) el.textContent=v.toLocaleString()+' plays on this device';
})();

// ============================================================
// KEYBOARD SHORTCUTS MODAL
// ============================================================
function showShortcuts(){
  const el=document.getElementById('shortcuts-modal');
  if(el) el.style.display=el.style.display==='flex'?'none':'flex';
}
document.getElementById('btn-shortcuts')?.addEventListener('click',showShortcuts);
document.getElementById('shortcuts-close')?.addEventListener('click',()=>{document.getElementById('shortcuts-modal').style.display='none';});
window.addEventListener('keydown',e=>{if(e.key==='?')showShortcuts();});

// ============================================================
// NIGHT MODE — SYNC UI PANELS
// ============================================================
function applyNightUI(){
  document.body.classList.toggle('night-ui',nightMode);
}
const _origNightToggle=el.nightBtn;
el.nightBtn?.addEventListener('click',()=>{nightMode=!nightMode;applyNightUI();refreshHUD();},true);

// ============================================================
// GUIDED LESSONS
// ============================================================
const LESSONS=[
  {id:0,title:'Lesson 1: The Problem of Span',
   concept:'A horizontal beam spanning a gap experiences maximum bending moment at its center — the top surface is in compression, the bottom in tension. Without support, long beams sag and fail.',
   goal:'Build a single steel beam across the gap. Test it with a Sedan and watch what happens.',
   hint:'Draw one beam from the left amber anchor to the right amber anchor. Hit Test Bridge, then spawn a Sedan.',
   check:()=>vehiclesCrossed>=1||simBeams.some(b=>b.broken),
   explain:'The center of a simply-supported beam carries the most bending stress. This is why long unbraced spans always fail at mid-span first. The fix: triangulation.'},
  {id:1,title:'Lesson 2: The Triangle of Strength',
   concept:'Triangles are the only geometric shape that cannot deform without changing a side length. This makes triangulated structures (trusses) far stiffer than beams alone.',
   goal:'Add diagonal members to your beam to form triangles. Survive a Van.',
   hint:'Add joints below the road level using the lower anchor dots. Connect diagonals between the top chord and these lower points.',
   check:()=>vehiclesCrossed>=1&&beams.some(b=>{const a=jointById(b.aId),c=jointById(b.bId);if(!a||!c)return false;const ang=Math.abs(Math.atan2(c.y-a.y,c.x-a.x));return ang>.2&&ang<Math.PI-.2;}),
   explain:'Each triangle in a truss converts bending into pure axial force — either tension or compression along the member. Materials are roughly 10× stronger in axial loading than in bending, so trusses are vastly more efficient than solid beams.'},
  {id:2,title:'Lesson 3: Material Matters',
   concept:'Different materials have radically different strength-to-cost ratios. Efficient engineers use cheaper materials where stress is low, and premium materials only where needed.',
   goal:'Build the same basic truss with wood, then rebuild it with steel. Compare what load each survives.',
   hint:'Build a truss in Wood (sag limit: 2.5px). Note when it fails. Reset, rebuild identically in Steel (sag limit: 22px). The difference will be dramatic.',
   check:()=>vehiclesCrossed>=1&&beams.some(b=>b.material==='steel'),
   explain:'Steel tolerates 8.8× more deflection than wood before failure. But it costs 9.6× more per meter. The optimal design uses wood for low-stress members (like short verticals near supports) and steel only in the high-stress members at mid-span.'},
  {id:3,title:'Lesson 4: Tension vs Compression',
   concept:'In a truss, members either pull apart (tension) or get squeezed (compression). Cables only work in tension. Identifying member modes lets you choose the right material for each.',
   goal:'Build any truss and enable the Force Diagram during testing. Identify at least one tension and one compression member.',
   hint:'Click "Force Diagram" in Test Tools during your test. Blue arrows = tension (pulling apart). Orange = compression (squeezing). In a Pratt truss: top chord = compression, bottom chord = tension.',
   check:()=>forceOverlay&&simBeams.some(b=>b.tension&&!b.broken)&&simBeams.some(b=>!b.tension&&!b.broken),
   explain:'This is the foundation of truss design: diagonals in a Pratt truss carry tension (cable material works!), verticals carry compression (needs stiffer material). Howe trusses reverse this. Knowing which members carry which load type is what separates engineered structures from guesswork.'},
];
let activeLessonId=null;

function startLesson(id){
  const lesson=LESSONS[id];if(!lesson)return;
  activeLessonId=id;
  const el=document.getElementById('lesson-panel');if(!el)return;
  document.getElementById('lesson-title').textContent=lesson.title;
  document.getElementById('lesson-concept').textContent=lesson.concept;
  document.getElementById('lesson-goal').textContent='🎯 '+lesson.goal;
  document.getElementById('lesson-hint').textContent='💡 '+lesson.hint;
  document.getElementById('lesson-explain').style.display='none';
  document.getElementById('lesson-explain-text').textContent='';
  el.style.display='block';
  resetGame();
  flashMessage('Lesson started — '+lesson.goal);
}
function checkLessonComplete(){
  if(activeLessonId===null)return;
  const lesson=LESSONS[activeLessonId];
  if(lesson.check()){
    document.getElementById('lesson-explain').style.display='block';
    document.getElementById('lesson-explain-text').textContent=lesson.explain;
    flashMessage('✓ Lesson '+(activeLessonId+1)+' complete! Read the explanation below.');
    if(activeLessonId<LESSONS.length-1){
      document.getElementById('lesson-next').style.display='block';
    }
  }
}
document.getElementById('lesson-next')?.addEventListener('click',()=>{
  if(activeLessonId<LESSONS.length-1)startLesson(activeLessonId+1);
});
document.getElementById('lesson-close')?.addEventListener('click',()=>{
  document.getElementById('lesson-panel').style.display='none';activeLessonId=null;
});
document.querySelectorAll('.lesson-btn').forEach(btn=>{
  btn.addEventListener('click',()=>startLesson(parseInt(btn.dataset.lesson)));
});
// Hook into simulation step to check lesson completion
const _origStepV=stepVehicles;

// ============================================================
// WHY DID IT FAIL?
// ============================================================
function analyzeFailure(sb){
  const sja=simJoints[sb.ai],sjb=simJoints[sb.bi];
  const midX=(sja.x+sjb.x)/2;
  const span=CR()-CL();
  const relPos=(midX-CL())/span;
  const position=relPos<.25?'near the left support':relPos>.75?'near the right support':'at mid-span';
  const ang=Math.abs(Math.atan2(sjb.y-sja.y,sjb.x-sja.x)*180/Math.PI);
  const memberType=ang<20?'horizontal chord':ang>70?'vertical member':'diagonal brace';
  const mode=sb.tension?'tension':'compression';
  const mat=sb.material.name;
  const msgs={
    'horizontal chord':{tension:`The bottom chord ${position} failed in tension — it was being pulled apart. Common when there's no diagonal support at mid-span. Fix: add more diagonals, increase depth, or upgrade to steel/carbon fiber.`,compression:`The top chord ${position} failed in compression — it was being squeezed. Common with heavy downward loads. Fix: shorten unsupported sections, add verticals, or use a stiffer material.`},
    'diagonal brace':{tension:`A diagonal ${position} failed in tension — it was being pulled. You could use cable material here since it's already in tension. Fix: add a second parallel diagonal or use stronger material.`,compression:`A diagonal ${position} failed in compression — it was being squeezed. Cables won't work here; you need steel or concrete. Fix: shorten the diagonal (add intermediate joints) or reinforce the member.`},
    'vertical member':{tension:`A vertical member ${position} failed in tension — it's being stretched downward. This often happens in suspension systems where hangers pull upward. Fix: add lateral bracing or use stronger material.`,compression:`A vertical member ${position} failed in compression — it's being crushed. This is a column buckling scenario. Fix: add lateral support or increase the section.`},
  };
  return {position,memberType,mode,mat,msg:msgs[memberType]?.[mode]||'The member exceeded its deflection limit. Try a stronger material or add more support near this location.'};
}
function showFailureAnalysis(sb){
  if(!sb)return;
  const a=analyzeFailure(sb);
  const el=document.getElementById('failure-analysis');if(!el)return;
  document.getElementById('fa-member').textContent=`${a.mat} ${a.memberType} — ${a.mode}`;
  document.getElementById('fa-msg').textContent=a.msg;
  el.style.display='block';
}
document.getElementById('fa-close')?.addEventListener('click',()=>{document.getElementById('failure-analysis').style.display='none';});

// ============================================================
// QUIZ MODE
// ============================================================
let quizAnswers=[];
function startQuiz(){
  if(!simBeams.length){flashMessage('Run a simulation first.');return;}
  const tensionCount=simBeams.filter(b=>b.tension&&!b.broken).length;
  const compCount=simBeams.filter(b=>!b.tension&&!b.broken).length;
  const dominant=tensionCount>compCount?'tension':'compression';
  const peakMat=simBeams.reduce((m,b)=>b.stress>m.stress?b:m,simBeams[0])?.material?.name||'Steel';
  const broken=simBeams.filter(b=>b.broken).length;
  const qs=[
    {q:`Most non-broken beams in your bridge are in…`,opts:['Tension (being pulled)','Compression (being squeezed)','Equal mix'],correct:dominant==='tension'?0:1,explain:`You had ${tensionCount} tension members and ${compCount} compression members. ${dominant==='tension'?'Tension is dominant — your bridge is hanging load downward through its bottom chord.':'Compression is dominant — your top chord is taking most of the compressive load.'}`},
    {q:`Which material would handle 2× more load before breaking?`,opts:['Steel (sag limit: 22px)','Concrete (sag limit: 9px)','Wood (sag limit: 2.5px)'],correct:0,explain:'Steel tolerates 22px of joint sag before failing — 8.8× more than wood (2.5px) and 2.4× more than concrete (9px). For heavily loaded spans, steel is the only practical choice.'},
    {q:`${broken} beam(s) failed in your test. The best structural fix is…`,opts:['Use stronger material everywhere','Add diagonal bracing near failed members','Make all beams thicker'],correct:1,explain:'Failure usually indicates missing triangulation, not just weak material. Adding diagonals near failed members converts bending stress into axial force, which all materials handle far better. Upgrading material blindly costs much more for less improvement.'},
  ];
  quizAnswers=new Array(qs.length).fill(null);
  const panel=document.getElementById('quiz-panel');if(!panel)return;
  panel.style.display='block';
  panel.innerHTML='<div class="quiz-title">🧠 Quick Quiz</div>'+qs.map((q,i)=>`
    <div class="quiz-q" id="qq-${i}">
      <div class="quiz-question">Q${i+1}: ${q.q}</div>
      ${q.opts.map((o,j)=>`<button class="quiz-opt" onclick="answerQuiz(${i},${j},${q.correct},'${q.explain.replace(/'/g,"\\'")}',this)">${o}</button>`).join('')}
      <div class="quiz-explain" id="qe-${i}" style="display:none">${q.explain}</div>
    </div>`).join('')+'<button class="quiz-close" onclick="closeQuiz()">Close Quiz</button>';
}
function answerQuiz(qi,chosen,correct,explain,btn){
  const opts=document.querySelectorAll(`#qq-${qi} .quiz-opt`);
  opts.forEach((o,i)=>{o.disabled=true;if(i===correct)o.classList.add('correct');else if(i===chosen&&chosen!==correct)o.classList.add('wrong');});
  document.getElementById(`qe-${qi}`).style.display='block';
  quizAnswers[qi]=chosen===correct;
}
function closeQuiz(){const p=document.getElementById('quiz-panel');if(p)p.style.display='none';}
document.getElementById('btn-quiz')?.addEventListener('click',startQuiz);


// ============================================================
// NEW LEVELS (appended to LEVELS array at runtime)
// ============================================================
(function addNewLevels(){
  if(LEVELS.find(l=>l.id===5))return;
  LEVELS.push(
    {id:5,name:'Highway',    chasmLeft:140,chasmRight:760,budget:700000,pier:true, quake:false,desc:'Massive highway span. Only carbon fiber trusses will hold the train.'},
    {id:6,name:'Mini Gorge', chasmLeft:340,chasmRight:560,budget:25000, pier:false,quake:false,desc:'Tiny span, tiny budget. Survive a sedan for under $3,000.'}
  );
})();

// ============================================================
// NEW VEHICLES (merged into VEHICLE_TYPES at runtime)
// ============================================================
(function addNewVehicles(){
  if(VEHICLE_TYPES.ambulance)return;
  Object.assign(VEHICLE_TYPES,{
    ambulance: {label:'Ambulance',  kg:2200,  force:1.1, w:52, h:22, color:'#cc2222', speed:4.0, emoji:'🚑'},
    monster:   {label:'Monster Truck',kg:8500,force:4.8, w:90, h:44, color:'#5a3a0a', speed:1.8, emoji:'🛻'},
    rocketsled:{label:'Rocket Sled', kg:300,  force:0.1, w:60, h:16, color:'#cc4400', speed:9.0, emoji:'🚀'},
  });
})();

// ============================================================
// NEW CHALLENGES
// ============================================================
(function addNewChallenges(){
  const newOnes=[
    {id:20,level:5,name:'Highway Semi',  desc:'Survive 2 semis on the widest span',      budget:600000,timeLimit:0,  noScrews:false,materialLock:null,     objective:{vehicle:'semi',count:2}},
    {id:21,level:5,name:'Train Boss',    desc:'Survive the Train on the Highway span',    budget:700000,timeLimit:0,  noScrews:false,materialLock:null,     objective:{vehicle:'train'}},
    {id:22,level:5,name:'Carbon Only',   desc:'Survive a semi using only Carbon Fiber',   budget:700000,timeLimit:0,  noScrews:false,materialLock:['carbon'],objective:{vehicle:'semi'}},
    {id:23,level:6,name:'Budget Sprint', desc:'Survive a sedan for under $3,000',         budget:3000,  timeLimit:90, noScrews:false,materialLock:null,     objective:{vehicle:'sedan',maxCost:3000}},
    {id:24,level:6,name:'Mini Monster',  desc:'Survive the Monster Truck on the mini span',budget:25000,timeLimit:0,  noScrews:false,materialLock:null,     objective:{vehicle:'monster'}},
    {id:25,level:1,name:'Rocket Run',    desc:'Survive 3 Rocket Sleds — they are FAST',  budget:200000,timeLimit:120,noScrews:false,materialLock:null,     objective:{vehicle:'rocketsled',count:3}},
    {id:26,level:2,name:'Ambulance Rush',desc:'Survive 5 ambulances — they come in fast', budget:400000,timeLimit:180,noScrews:false,materialLock:null,     objective:{vehicle:'ambulance',count:5}},
    {id:27,level:0,name:'Monster Gorge', desc:'Survive the Monster Truck on the narrow gorge',budget:100000,timeLimit:0,noScrews:false,materialLock:null,  objective:{vehicle:'monster'}},
  ];
  newOnes.forEach(c=>{if(!CHALLENGES.find(x=>x.id===c.id))CHALLENGES.push(c);});
})();

// ============================================================
// PANEL SECTION TOGGLE
// ============================================================
function toggleSection(header){
  const section=header.closest('.panel-section');
  section.classList.toggle('open');
}

// ============================================================
// NIGHT MODE UI SYNC (patch)
// ============================================================
const _nightBtnEl=document.getElementById('btn-night');
if(_nightBtnEl){
  _nightBtnEl.addEventListener('click',()=>{
    nightMode=!nightMode;
    document.body.classList.toggle('night-ui',nightMode);
    refreshHUD();
  },true);
}
