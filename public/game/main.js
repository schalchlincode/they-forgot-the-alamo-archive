import * as THREE from './vendor/three.module.js';
import {ps1Settings, internalSize} from './ps1-settings.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const canvas = document.querySelector('#game');
const ammoLabel = document.querySelector('#ammo');
const stateLabel = document.querySelector('#state');
const crosshair = document.querySelector('#crosshair');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'default'});
} catch (error) {
  document.querySelector('#error').style.display = 'grid';
  throw error;
}
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const lowResTarget = new THREE.WebGLRenderTarget(240, 240, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  depthBuffer: true, samples: 0,
});
const displayScene = new THREE.Scene();
const displayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const displayUniforms = {
  source: {value: lowResTarget.texture},
  sourceResolution: {value: new THREE.Vector2(240, 240)},
  ditherEnabled: {value: 1},
};
const displayMaterial = new THREE.ShaderMaterial({
  uniforms: displayUniforms,
  depthTest: false,
  depthWrite: false,
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D source;
    uniform vec2 sourceResolution;
    uniform float ditherEnabled;
    varying vec2 vUv;
    float bayer4(vec2 p) {
      float x = mod(p.x, 4.0), y = mod(p.y, 4.0);
      if (y < 1.0) return x == 0.0 ? 0.0 : (x == 1.0 ? 8.0 : (x == 2.0 ? 2.0 : 10.0));
      if (y < 2.0) return x == 0.0 ? 12.0 : (x == 1.0 ? 4.0 : (x == 2.0 ? 14.0 : 6.0));
      if (y < 3.0) return x == 0.0 ? 3.0 : (x == 1.0 ? 11.0 : (x == 2.0 ? 1.0 : 9.0));
      return x == 0.0 ? 15.0 : (x == 1.0 ? 7.0 : (x == 2.0 ? 13.0 : 5.0));
    }
    void main() {
      vec4 color = texture2D(source, vUv);
      if (ditherEnabled > 0.5) {
        float threshold = (bayer4(floor(vUv * sourceResolution)) + 0.5) / 16.0 - 0.5;
        color.rgb = floor(clamp(color.rgb + threshold / 62.0, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
      }
      gl_FragColor = color;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
displayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), displayMaterial));
const resolutionToggle = document.querySelector('#resolutionToggle');
const vertexToggle = document.querySelector('#vertexToggle');
const ditherToggle = document.querySelector('#ditherToggle');
const fogToggle = document.querySelector('#fogToggle');
const snapUniforms = {
  grid: {value: new THREE.Vector2(240, 240)},
  enabled: {value: 1},
};
function setLowResolution(enabled) {
  ps1Settings.lowResolution = enabled;
  resolutionToggle.textContent = `Pixel resolution: ${enabled ? 'On' : 'Off'}`;
  resolutionToggle.setAttribute('aria-pressed', String(enabled));
  try { localStorage.setItem('alamo-low-resolution', enabled ? 'on' : 'off'); } catch {}
  resize();
}
resolutionToggle.addEventListener('click', () => setLowResolution(!ps1Settings.lowResolution));
function setVertexSnap(enabled) {
  ps1Settings.vertexSnap = enabled;
  snapUniforms.enabled.value = enabled ? 1 : 0;
  vertexToggle.textContent = `Vertex snap: ${enabled ? 'On' : 'Off'}`;
  vertexToggle.setAttribute('aria-pressed', String(enabled));
  try { localStorage.setItem('alamo-vertex-snap', enabled ? 'on' : 'off'); } catch {}
}
vertexToggle.addEventListener('click', () => setVertexSnap(!ps1Settings.vertexSnap));
function setColorDither(enabled) {
  ps1Settings.colorDither = enabled;
  displayUniforms.ditherEnabled.value = enabled ? 1 : 0;
  ditherToggle.textContent = `Color dither: ${enabled ? 'On' : 'Off'}`;
  ditherToggle.setAttribute('aria-pressed', String(enabled));
  try { localStorage.setItem('alamo-color-dither', enabled ? 'on' : 'off'); } catch {}
}
ditherToggle.addEventListener('click', () => setColorDither(!ps1Settings.colorDither));
function setDistanceFog(enabled) {
  ps1Settings.distanceFog = enabled;
  scene.fog = enabled ? new THREE.Fog(ps1Settings.fogColor, ps1Settings.fogNear, ps1Settings.fogFar) : null;
  fogToggle.textContent = `Distance fog: ${enabled ? 'On' : 'Off'}`;
  fogToggle.setAttribute('aria-pressed', String(enabled));
  try { localStorage.setItem('alamo-distance-fog', enabled ? 'on' : 'off'); } catch {}
}
fogToggle.addEventListener('click', () => setDistanceFog(!ps1Settings.distanceFog));
const scene = new THREE.Scene();
scene.background = new THREE.Color(ps1Settings.fogColor);
const camera = new THREE.PerspectiveCamera(54, 16/9, 0.1, 60);
const hemi = new THREE.HemisphereLight(0xffe3b2, 0x302b37, 2.15);
scene.add(hemi);
const lamp = new THREE.DirectionalLight(0xffcb83, 3.2);
lamp.position.set(-3,9,4); lamp.castShadow = true;
lamp.shadow.mapSize.set(2048,2048);
Object.assign(lamp.shadow.camera,{left:-12,right:12,top:12,bottom:-12});
scene.add(lamp);
function mat(color, extra={}) {
  const material = new THREE.MeshLambertMaterial({color, flatShading:true, ...extra});
  material.onBeforeCompile = shader => {
    shader.uniforms.ps1Grid = snapUniforms.grid;
    shader.uniforms.ps1Snap = snapUniforms.enabled;
    shader.vertexShader = 'uniform vec2 ps1Grid;\nuniform float ps1Snap;\n' +
      shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n' +
        'if (ps1Snap > 0.5 && gl_Position.w > 0.0) {\n' +
        '  vec2 grid = max(ps1Grid, vec2(1.0));\n' +
        '  gl_Position.xy = floor(gl_Position.xy / gl_Position.w * grid * 0.5 + 0.5) * 2.0 / grid * gl_Position.w;\n' +
        '}');
  };
  return material;
}
const wood=mat(0x704534), edge=mat(0x342b2a), plaster=mat(0x937762), stone=mat(0x655b5b), brass=mat(0xb7a06b);
function mesh(geometry, material, parent=scene, pos=[0,0,0]) {
  const m=new THREE.Mesh(geometry,material); m.position.set(...pos);
  m.castShadow=true; m.receiveShadow=true; parent.add(m); return m;
}
function box(w,h,d,material,parent=scene,pos=[0,0,0]) { return mesh(new THREE.BoxGeometry(w,h,d),material,parent,pos); }
function cyl(rTop,rBottom,h,material,parent,pos=[0,0,0],sides=7) { return mesh(new THREE.CylinderGeometry(rTop,rBottom,h,sides),material,parent,pos); }

// The room is intentionally small so collisions and the reload silhouette are easy to inspect.
const floor=box(17,.28,17,stone,scene,[0,-.15,0]);
for(let x=-8;x<=8;x+=2) box(.045,.015,17,edge,scene,[x,.005,0]);
for(let z=-8;z<=8;z+=2) box(17,.015,.045,edge,scene,[0,.008,z]);
const wallTiles=[];
for(const z of [-8.2,8.2]) for(let col=0;col<17;col++) for(let row=0;row<4;row++){
  const x=col-8,y=.425+row*.85;
  if(z<0 && y>1.1 && ((x>-4.5&&x<-1.5)||(x>3&&x<5)))continue;
  const tile=box(.99,.84,.25,plaster,scene,[x,y,z]);
  wallTiles.push({mesh:tile,x,z,y,halfX:.5,halfZ:.13,type:'wall'});
}
for(const x of [-8.2,8.2]) for(let col=0;col<17;col++) for(let row=0;row<4;row++){
  const z=col-8,y=.425+row*.85;
  const tile=box(.25,.84,.99,plaster,scene,[x,y,z]);
  wallTiles.push({mesh:tile,x,z,y,halfX:.13,halfZ:.5,type:'wall'});
}
for(const z of [-7.98,7.98]) {
  box(17,.22,.12,wood,scene,[0,.18,z]);
  box(17,.16,.15,wood,scene,[0,3.05,z]);
}
for(const x of [-7.98,7.98]) {
  box(.12,.22,17,wood,scene,[x,.18,0]);
  box(.15,.16,17,wood,scene,[x,3.05,0]);
}
// Blue night through a shuttered window and a painted door make direction readable.
box(2.8,1.6,.05,edge,scene,[-3,2.0,-7.98]);
box(2.45,1.25,.06,mat(0x3d6170,{emissive:0x12222b}),scene,[-3,2.0,-7.94]);
box(.10,1.5,.1,wood,scene,[-3,2,-7.87]);
box(2.6,.10,.1,wood,scene,[-3,2,-7.86]);
box(1.8,2.8,.07,wood,scene,[4,1.4,-7.97]);
mesh(new THREE.SphereGeometry(.055,6,4),brass,scene,[4.58,1.35,-7.85]);
const blockers=[...wallTiles];
function crate(x,z,size=1.4){
  const parts=[box(size,size,size,wood,scene,[x,size/2,z])];
  for(const s of [-1,1]){
    parts.push(box(size+.03,.10,.12,edge,scene,[x,size*.3,z+s*size*.505]));
    parts.push(box(size+.03,.10,.12,edge,scene,[x,size*.7,z+s*size*.505]));
  }
  blockers.push({x,z,halfX:size/2,halfZ:size/2,y:size/2,type:'crate',parts,size});
}
crate(-4.8,3.6);crate(4.8,4.2,1.25);crate(5.0,-3.8,.95);
box(2.3,.2,1.2,wood,scene,[5,-.0,1]);

// Davy's low-poly silhouette uses human proportions: longer legs, a tapered torso,
// narrower shoulders and a smaller head. Keep the limb groups as animation pivots.
const player = new THREE.Group(); scene.add(player);
const body = new THREE.Group(); player.add(body);
const leather=mat(0x9b6945), trim=mat(0xd2b487), pants=mat(0x73543e), boots=mat(0x47382c), skin=mat(0xc59972), fur=mat(0x6b5845), darkFur=mat(0x342e2b);
const torso=cyl(.29,.205,.83,leather,body,[0,1.73,0],10);torso.scale.z=.75;
cyl(.21,.20,.15,pants,body,[0,1.28,0],9);
box(.07,.70,.025,trim,body,[0,1.72,.185]);
for(const s of [-1,1]){
  // Jacket panels hang beside the narrow waist instead of widening the hips.
  const panel=box(.10,.30,.12,leather,body,[s*.19,1.32,.015]);panel.rotation.z=-s*.08;
  const leg=new THREE.Group();body.add(leg);leg.position.set(s*.13,1.27,0);
  cyl(.115,.095,.59,pants,leg,[0,-.29,0],9);
  mesh(new THREE.IcosahedronGeometry(.095,0),pants,leg,[0,-.63,0]);
  cyl(.09,.065,.46,pants,leg,[0,-.89,0],9);
  box(.16,.24,.25,boots,leg,[0,-1.14,.055]);
  leg.userData.side=s;
  (body.userData.legs??=[]).push(leg);
  const arm=new THREE.Group();body.add(arm);arm.position.set(s*.29,2.07,0);
  const upper=cyl(.105,.085,.43,leather,arm,[s*.045,-.21,0],9);upper.rotation.z=s*.10;
  const elbow=new THREE.Vector3(s*.09,-.43,0);
  const hand=new THREE.Vector3(s<0?.39:.10,-.54,s<0?.59:.38);
  mesh(new THREE.IcosahedronGeometry(.085,0),leather,arm,elbow.toArray());
  const forearm=cyl(.085,.065,elbow.distanceTo(hand),leather,arm,elbow.clone().add(hand).multiplyScalar(.5).toArray(),9);
  forearm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),hand.clone().sub(elbow).normalize());
  mesh(new THREE.IcosahedronGeometry(.075,0),skin,arm,hand.toArray());
  (body.userData.arms??=[]).push(arm);
}
cyl(.075,.075,.13,skin,body,[0,2.20,0],8);
const face=mesh(new THREE.IcosahedronGeometry(.18,1),skin,body,[0,2.43,0]);face.scale.set(.93,1.13,.88);
const jaw=cyl(.12,.085,.13,skin,body,[0,2.27,.025],8);jaw.scale.z=.8;
box(.085,.028,.025,darkFur,body,[0,2.35,.167]);
mesh(new THREE.ConeGeometry(.045,.10,5),skin,body,[0,2.43,.18]).rotation.x=Math.PI/2;
for(const s of [-1,1]){
  box(.052,.025,.025,darkFur,body,[s*.085,2.48,.16]);
}
// Hair stays on Davy's head when the coonskin cap comes off in raccoon view.
const hair=mat(0x382a22);
for(const side of [-1,1]){
  // Side locks show below the cap band and frame the face without it.
  cyl(.052,.07,.31,hair,body,[side*.157,2.39,.005],6);
  box(.07,.10,.08,hair,body,[side*.15,2.46,.10]);
}
// A short fringe and back hair make the uncovered head read as hair from all angles.
for(let i=0;i<4;i++) box(.065,.06,.06,hair,body,[(i-1.5)*.058,2.56,.135]);
cyl(.16,.18,.13,hair,body,[0,2.53,-.055],8);
// The crown, band and segmented tail make the coonskin cap unmistakable from above.
const coonskinCap=new THREE.Group();body.add(coonskinCap);
cyl(.22,.215,.17,fur,coonskinCap,[0,2.67,0],9);
cyl(.24,.24,.055,darkFur,coonskinCap,[0,2.59,0],9);
for(let i=0;i<6;i++){
  const seg=cyl(.09-i*.007,.095-i*.007,.16,i%2?fur:darkFur,coonskinCap,[-.18-i*.053,2.64-i*.11,-.14-i*.055],6);
  seg.rotation.z=-.36;
}
// Receiver stays in the hands; the barrels pivot visibly around the breech.
const gun=new THREE.Group();body.add(gun);gun.position.set(.35,1.63,.29);
box(.29,.21,.32,brass,gun,[0,0,.08]);
const stock=box(.17,.16,.62,wood,gun,[0,-.055,-.39]);stock.rotation.x=-.12;
box(.22,.22,.045,edge,gun,[0,-.02,-.72]);
box(.20,.035,.29,edge,gun,[0,-.17,.04]); // trigger guard
box(.12,.12,.43,wood,gun,[0,-.12,.50]); // fore-end
const barrels=new THREE.Group();gun.add(barrels);barrels.position.set(0,0,.24);
for(const s of [-1,1]){
  const tube=cyl(.062,.062,.92,edge,barrels,[s*.07,0,.46],10);tube.rotation.x=Math.PI/2;
  const rim=cyl(.067,.067,.02,brass,barrels,[s*.07,0,.92],10);rim.rotation.x=Math.PI/2;
  const bore=cyl(.039,.039,.021,mat(0x14151a),barrels,[s*.07,0,.935],10);bore.rotation.x=Math.PI/2;
}
box(.025,.025,.76,brass,barrels,[0,.056,.50]);
mesh(new THREE.SphereGeometry(.025,6,4),brass,barrels,[0,.077,.90]);
const shells=[];
for(const s of [-1,1]){
  const sh=new THREE.Group();body.add(sh);
  cyl(.048,.048,.20,mat(0xb33b2c),sh,[0,0,0],6);
  cyl(.052,.052,.035,brass,sh,[0,-.105,0],6);
  sh.visible=false;shells.push(sh);
}
let shotgunModelLoaded=false;
async function loadShotgunModel(){
  try{
    const asset=await new GLTFLoader().loadAsync('assets/models/shotgun.glb');
    const receiver=asset.scene.getObjectByName('ReceiverRoot');
    const moving=asset.scene.getObjectByName('BreakBarrels');
    if(!receiver||!moving||!receiver.children.length||!moving.children.length)
      throw new Error('Shotgun GLB is missing ReceiverRoot or BreakBarrels geometry');
    ps1Materials(asset.scene);
    for(const child of [...gun.children])if(child!==barrels)gun.remove(child);
    for(const child of [...barrels.children])barrels.remove(child);
    gun.add(receiver);
    for(const child of [...moving.children])barrels.add(child);
    shotgunModelLoaded=true;
  }catch(err){console.warn('Failed to load shotgun model, keeping procedural gun:',err);}
}

// ---- B4 Davy and raccoon GLB models. The procedural Davy above is the fallback if loading fails.
const DAVY_HEIGHT=1.8;            // metres
const RACCOON_WORLD_SCALE=.7;     // raccoon GLB is ~0.5 m long unscaled; ~0.35 m perched on a 1.8 m Davy
const GUN_CARRY_POS=new THREE.Vector3(.12,1.25,.05); // receiver at chest height, stock against the shoulder
let davyModel=null,davyMixer=null,davyActions={},davyClip=null,davyScale=1;
let davyIdle='idle',davyWalk='walk',davyRun='run';
let raccoonGLBModel=null,raccoonGLBMixer=null,raccoonClip=null;
let gunHold=null,gunRestZ=.31,perchY=2.60,pivotY=1.5;
function ps1Materials(root){
  root.traverse(o=>{
    if(!o.isMesh)return;
    o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    const old=o.material;
    if(old.map){old.map.magFilter=THREE.NearestFilter;old.map.minFilter=THREE.NearestFilter;}
    o.material=mat(0xffffff,{color:old.color.clone(),map:old.map||null,side:old.side});
  });
}
function setDavyClip(name){
  const next=davyActions[name];
  if(!next||davyClip===name)return;
  const prev=davyActions[davyClip];
  next.reset().play();
  if(prev)prev.crossFadeTo(next,.2,false);
  davyClip=name;
}
function solveArmToWorldGoal(side,goal){
  if(!davyModel)return false;
  const upper=davyModel.getObjectByName(`${side}_upper_arm`);
  const lower=davyModel.getObjectByName(`${side}_forearm`);
  const hand=davyModel.getObjectByName(`${side}_hand`);
  if(!upper||!lower||!hand)return false;
  davyModel.updateMatrixWorld(true);
  const shoulder=upper.getWorldPosition(new THREE.Vector3());
  const elbow=lower.getWorldPosition(new THREE.Vector3());
  const wrist=hand.getWorldPosition(new THREE.Vector3());
  const upperLength=shoulder.distanceTo(elbow),forearmLength=elbow.distanceTo(wrist);
  const reach=shoulder.distanceTo(goal);
  if(reach<1e-4||reach>upperLength+forearmLength-.002)return false;
  const direction=goal.clone().sub(shoulder).normalize();
  const pole=new THREE.Vector3(side==='L'?-1:1,-.65,0);
  pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const along=(upperLength*upperLength-forearmLength*forearmLength+reach*reach)/(2*reach);
  const bend=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
  const elbowGoal=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,bend);
  const rotateBone=(bone,from,to)=>{
    const worldTurn=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
    const parentWorld=bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const boneWorld=bone.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentWorld.invert().multiply(worldTurn).multiply(boneWorld));
    bone.updateMatrixWorld(true);
  };
  rotateBone(upper,elbow.clone().sub(shoulder),elbowGoal.clone().sub(shoulder));
  const movedElbow=lower.getWorldPosition(new THREE.Vector3());
  const movedWrist=hand.getWorldPosition(new THREE.Vector3());
  rotateBone(lower,movedWrist.sub(movedElbow),goal.clone().sub(movedElbow));
  return hand.getWorldPosition(new THREE.Vector3()).distanceTo(goal)<.025;
}
async function loadDavyModels(){
  const loader=new GLTFLoader();
  let gltf;
  try{gltf=await loader.loadAsync('assets/models/davy-b4.glb');}
  catch(err){console.warn('Failed to load B4 model, keeping procedural Davy:',err.message);return;}
  davyModel=gltf.scene;ps1Materials(davyModel);
  // Replace the procedural body; the shotgun and shells are re-parented below
  for(const child of [...body.children])if(child!==gun&&!shells.includes(child))body.remove(child);
  player.add(davyModel);
  // Scale Davy to DAVY_HEIGHT and stand him on the floor
  davyModel.updateMatrixWorld(true);
  const box3=new THREE.Box3().setFromObject(davyModel,true);
  davyScale=DAVY_HEIGHT/(box3.max.y-box3.min.y);
  davyModel.scale.setScalar(davyScale);
  davyModel.position.y=-box3.min.y*davyScale;
  perchY=DAVY_HEIGHT;pivotY=DAVY_HEIGHT*.55;
  davyModel.updateMatrixWorld(true);
  davyMixer=new THREE.AnimationMixer(davyModel);
  (gltf.animations||[]).forEach(clip=>{davyActions[clip.name]=davyMixer.clipAction(clip);});
  // Davy carries the shotgun raised: prefer the aim_* stance clips when the model has them
  if(davyActions.aim_idle)davyIdle='aim_idle';
  if(davyActions.aim_walk){davyWalk='aim_walk';davyRun='aim_walk';}
  if(davyActions[davyIdle]){davyActions[davyIdle].play();davyClip=davyIdle;}
  davyMixer.update(0);davyModel.updateMatrixWorld(true);
  // Keep the receiver independent of the animated wrist so both hands can reach stable grips.
  const gunSocket=davyModel.getObjectByName('gun_socket');
  if(gunSocket){
    player.add(gun);
    gun.scale.setScalar(davyScale);
    gun.position.copy(GUN_CARRY_POS);
    gunRestZ=gun.position.z;
    shells.forEach(sh=>davyModel.add(sh));
  }else console.warn('gun_socket not found in B4 model');
  // Raccoon GLB rides on Davy's head
  try{
    const raccoonGltf=await new GLTFLoader().loadAsync('assets/models/raccoon.glb');
    raccoonGLBModel=raccoonGltf.scene;ps1Materials(raccoonGLBModel);
    raccoonGLBMixer=new THREE.AnimationMixer(raccoonGLBModel);
    const actions={};
    (raccoonGltf.animations||[]).forEach(clip=>{actions[clip.name]=raccoonGLBMixer.clipAction(clip);});
    raccoonClip=actions.perched_idle?'perched_idle':(actions.idle?'idle':null);
    if(raccoonClip)actions[raccoonClip].play();
    const socket=davyModel.getObjectByName('raccoon_socket');
    if(socket){
      socket.add(raccoonGLBModel);
      raccoonGLBModel.scale.setScalar(RACCOON_WORLD_SCALE/davyScale);
      raccoonGLBModel.visible=!raccoonView&&!raccoonTransition;
    }else console.warn('raccoon_socket not found, raccoon GLB will not be positioned');
  }catch(err){console.warn('Failed to load raccoon GLB model:',err.message);}
}
const modelLoadPromise=loadDavyModels();
const shotgunLoadPromise=loadShotgunModel();

const targets=[];
function target(x,z){
  const group=new THREE.Group();scene.add(group);group.position.set(x,0,z);
  box(.72,1.2,.16,mat(0x7c6852),group,[0,1.2,0]);
  cyl(.34,.34,.10,mat(0xccb27f),group,[0,1.65,.12],10).rotation.x=Math.PI/2;
  cyl(.21,.21,.11,mat(0x8f3e34),group,[0,1.65,.19],10).rotation.x=Math.PI/2;
  cyl(.09,.09,.12,mat(0xe3c991),group,[0,1.65,.26],10).rotation.x=Math.PI/2;
  box(.14,.7,.14,edge,group,[0,.45,0]);
  const entry={group,hits:0,type:'target',x,z};
  targets.push(entry);
  blockers.push({x,z,halfX:.36,halfZ:.14,y:1.3,type:'target',target:entry});
}
target(-5,-5);target(0,-5.8);target(5.2,-5.4);

const controls={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',jump:'Space',reload:'KeyR',transform:'KeyQ'};
const feel={mouseSensitivity:.0025,aimSensitivity:.0014,minPitch:-1.22,maxPitch:1.05,cameraDistance:5.4,shoulderOffset:.65,aimDistance:2.9,zoomSpeed:10,followSpeed:12,turnSpeed:11,aimMoveSpeed:2.2};
const keys=new Set();
const touchUI=document.querySelector('#touchControls'),touchToggle=document.querySelector('#touchToggle');
let touchMoveX=0,touchMoveY=0,touchLookId=null,touchLookX=0,touchLookY=0,movePointerId=null;
function setTouchControls(enabled){touchUI.classList.toggle('on',enabled);touchToggle.textContent=`Touch controls: ${enabled?'On':'Off'}`;touchToggle.setAttribute('aria-pressed',String(enabled));if(!enabled){touchMoveX=touchMoveY=0;movePointerId=touchLookId=null;document.querySelector('#moveNub').style.transform='translate(0,0)';aiming=false;}}
touchToggle.addEventListener('click',()=>setTouchControls(!touchUI.classList.contains('on')));
touchToggle.addEventListener('click',()=>{try{localStorage.setItem('alamo-touch-controls',touchUI.classList.contains('on')?'on':'off');}catch{}});
const movePad=document.querySelector('#movePad'),moveNub=document.querySelector('#moveNub');
movePad.addEventListener('pointerdown',e=>{e.preventDefault();movePointerId=e.pointerId;movePad.setPointerCapture(e.pointerId);updateTouchMove(e);});
movePad.addEventListener('pointermove',e=>{if(e.pointerId===movePointerId)updateTouchMove(e);});
function updateTouchMove(e){const r=movePad.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),limit=r.width*.34,len=Math.hypot(dx,dy),scale=len>limit?limit/len:1;touchMoveX=dx*scale/limit;touchMoveY=dy*scale/limit;moveNub.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;}
function endTouchMove(e){if(e.pointerId!==movePointerId)return;movePointerId=null;touchMoveX=touchMoveY=0;moveNub.style.transform='translate(0,0)';}
movePad.addEventListener('pointerup',endTouchMove);movePad.addEventListener('pointercancel',endTouchMove);
const lookPad=document.querySelector('#lookPad');
lookPad.addEventListener('pointerdown',e=>{e.preventDefault();touchLookId=e.pointerId;touchLookX=e.clientX;touchLookY=e.clientY;lookPad.setPointerCapture(e.pointerId);});
lookPad.addEventListener('pointermove',e=>{if(e.pointerId!==touchLookId)return;e.preventDefault();const dx=e.clientX-touchLookX,dy=e.clientY-touchLookY;touchLookX=e.clientX;touchLookY=e.clientY;if(raccoonView){raccoonYaw-=dx*.008;raccoonPitch=Math.max(-1.15,Math.min(1.15,raccoonPitch-dy*.008));}else{cameraYaw-=dx*(aiming?.0045:.008);cameraPitch=Math.max(feel.minPitch,Math.min(feel.maxPitch,cameraPitch-dy*(aiming?.0045:.008)));}});
function endTouchLook(e){if(e.pointerId===touchLookId)touchLookId=null;}lookPad.addEventListener('pointerup',endTouchLook);lookPad.addEventListener('pointercancel',endTouchLook);
document.querySelector('#aimBtn').addEventListener('pointerdown',e=>{e.preventDefault();aiming=!aiming&&!raccoonView&&!raccoonTransition;aimButtonHeld=aiming;});
document.querySelector('#fireBtn').addEventListener('pointerdown',e=>{e.preventDefault();if(!raccoonView&&!raccoonTransition)fire();});
document.querySelector('#reloadBtn').addEventListener('pointerdown',e=>{e.preventDefault();beginReload();});
document.querySelector('#modeBtn').addEventListener('pointerdown',e=>{e.preventDefault();if(!raccoonTransition)beginRaccoonTransition(raccoonView?'return':'enter');});
window.addEventListener('keydown',e=>{keys.add(e.code);if([controls.jump,controls.reload,controls.transform,'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code===controls.reload)beginReload();if(e.code===controls.transform&&!e.repeat&&!raccoonTransition)beginRaccoonTransition(raccoonView?'return':'enter');});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();aiming=false;aimButtonHeld=false;});
let ammo=2,reload=0,fireCooldown=0,flash=0,walk=0,yaw=Math.PI,vertical=0,velocityY=0;
let cameraYaw=0,cameraPitch=-.28,cameraDistance=feel.cameraDistance,aiming=false,aimButtonHeld=false,aimBlockedUntilRelease=false,pendingFire=false;
try{setTouchControls(localStorage.getItem('alamo-touch-controls')==='on');}catch{setTouchControls(false);}
let raccoonView=false;
let raccoonTransition=null;
const raccoonPosition=new THREE.Vector3();
let raccoonYaw=Math.PI,raccoonPitch=0;
const raccoonModel=new THREE.Group();scene.add(raccoonModel);raccoonModel.visible=false;
const raccoonFur=mat(0x625447),raccoonMask=mat(0x332d2a),raccoonCream=mat(0xc2ad8e);
mesh(new THREE.SphereGeometry(.23,8,6),raccoonFur,raccoonModel,[0,.24,0]).scale.set(1.25,.78,1.55);
mesh(new THREE.SphereGeometry(.19,8,6),raccoonFur,raccoonModel,[0,.36,.25]).scale.set(1,.9,1);
mesh(new THREE.SphereGeometry(.115,7,5),raccoonMask,raccoonModel,[0,.39,.38]).scale.set(1.15,.65,.48);
for(const s of [-1,1]){
  mesh(new THREE.ConeGeometry(.075,.18,6),raccoonFur,raccoonModel,[s*.13,.53,.2]).rotation.z=-s*.35;
  mesh(new THREE.SphereGeometry(.035,6,4),mat(0xffd98a,{emissive:0x332200}),raccoonModel,[s*.075,.43,.47]);
  mesh(new THREE.SphereGeometry(.105,7,5),raccoonFur,raccoonModel,[s*.12,.10,-.03]).scale.set(.7,1.1,.7);
}
const raccoonTail=mesh(new THREE.CylinderGeometry(.055,.11,.58,7),raccoonFur,raccoonModel,[0,.31,-.38]);raccoonTail.rotation.x=-Math.PI/2.5;
for(let i=0;i<3;i++){
  const band=mesh(new THREE.TorusGeometry(.083-i*.008,.018,4,8),raccoonMask,raccoonModel,[0,.31-i*.06,-.43-i*.12]);band.rotation.x=Math.PI/2;
}
const transitionCameraFrom=new THREE.Vector3(),transitionLookFrom=new THREE.Vector3();
const raycaster=new THREE.Raycaster();
const aimPoint=new THREE.Vector3();
let aimValid=false;
const puff=[];
const debris=[];
const gunshot=new Audio('./audio/gunfire_cc0.wav');gunshot.volume=.5;
const triggerSound=new Audio('./audio/trigger_cc0.wav');triggerSound.volume=.42;
function play(sound){const copy=sound.cloneNode();copy.volume=sound.volume;copy.play().catch(()=>{});}
function fragment(position,color,size,velocity,depth=0){
  const piece=box(size,size*(.65+Math.random()*.7),size,mat(color),scene,position.toArray());
  piece.rotation.set(Math.random(),Math.random(),Math.random());
  const item={mesh:piece,velocity,spin:new THREE.Vector3((Math.random()-.5)*9,(Math.random()-.5)*9,(Math.random()-.5)*9),size,depth,rest:0};
  debris.push(item);
  blockers.push({x:position.x,z:position.z,halfX:size*.5,halfZ:size*.5,y:position.y,type:'debris',item});
  while(debris.length>170)removeDebris(debris[0]);
}
function removeDebris(item){
  const index=debris.indexOf(item);if(index>=0)debris.splice(index,1);
  const blocker=blockers.find(b=>b.item===item);if(blocker)blockers.splice(blockers.indexOf(blocker),1);
  scene.remove(item.mesh);item.mesh.geometry.dispose();item.mesh.material.dispose();
}
function burst(position,color,count,size,forward,depth=0){
  for(let i=0;i<count;i++)fragment(position.clone().add(new THREE.Vector3((Math.random()-.5)*size,(Math.random()-.5)*size,(Math.random()-.5)*size)),color,size*(.5+Math.random()*.7),new THREE.Vector3((Math.random()-.5)*4,2+Math.random()*4,(Math.random()-.5)*4).addScaledVector(forward,2),depth);
  impact(position);
}
function breakObject(b,forward){
  if(b.type==='wall'){
    // A clustered blast removes several neighboring tiles, leaving a visible opening.
    for(const tile of [...wallTiles]){
      if(Math.hypot(tile.x-b.x,tile.y-b.y,tile.z-b.z)>1.22)continue;
      scene.remove(tile.mesh);tile.mesh.geometry.dispose();
      wallTiles.splice(wallTiles.indexOf(tile),1);blockers.splice(blockers.indexOf(tile),1);
      burst(new THREE.Vector3(tile.x,tile.y,tile.z),0x937762,3,.24,forward);
    }
    stateLabel.textContent='Wall breached — press R';
  }else if(b.type==='target'){
    scene.remove(b.target.group);
    blockers.splice(blockers.indexOf(b),1);
    burst(new THREE.Vector3(b.x,1.4,b.z),0xccb27f,15,.24,forward);
    stateLabel.textContent='Target shattered — press R';
  }else if(b.type==='crate'){
    for(const part of b.parts){scene.remove(part);part.geometry.dispose();}
    blockers.splice(blockers.indexOf(b),1);
    burst(new THREE.Vector3(b.x,b.y,b.z),0x704534,13,b.size*.22,forward);
    stateLabel.textContent='Crate smashed — press R';
  }else if(b.type==='debris'){
    const position=b.item.mesh.position.clone(),size=b.item.size,depth=b.item.depth;
    removeDebris(b.item);
    if(depth<2)burst(position,0x927661,3,size*.48,forward,depth+1);
    else impact(position);
  }
}
function resize(){
  const scale=Math.min(window.devicePixelRatio||1,1.5);
  const width=Math.max(320,Math.round(window.innerWidth*scale));
  const height=Math.max(180,Math.round(window.innerHeight*scale));
  renderer.setSize(width,height,false);
  const internal = internalSize(window.innerWidth, window.innerHeight);
  const renderWidth = ps1Settings.lowResolution ? internal.width : width;
  const renderHeight = ps1Settings.lowResolution ? internal.height : height;
  lowResTarget.setSize(renderWidth, renderHeight);
  displayUniforms.sourceResolution.value.set(renderWidth, renderHeight);
  snapUniforms.grid.value.set(renderWidth, renderHeight);
  canvas.style.width='100%';canvas.style.height='100%';
  camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();
try { setLowResolution(localStorage.getItem('alamo-low-resolution') !== 'off'); }
catch { setLowResolution(true); }
try { setVertexSnap(localStorage.getItem('alamo-vertex-snap') !== 'off'); }
catch { setVertexSnap(true); }
try { setColorDither(localStorage.getItem('alamo-color-dither') !== 'off'); }
catch { setColorDither(true); }
try { setDistanceFog(localStorage.getItem('alamo-distance-fog') !== 'off'); }
catch { setDistanceFog(true); }
canvas.addEventListener('mousemove',e=>{
  if(document.pointerLockElement!==canvas||raccoonTransition)return;
  if(raccoonView){
    raccoonYaw-=e.movementX*.0025;
    raccoonPitch=Math.max(-1.15,Math.min(1.15,raccoonPitch-e.movementY*.002));
    return;
  }
  const sensitivity=aiming?feel.aimSensitivity:feel.mouseSensitivity;
  cameraYaw-=e.movementX*sensitivity;
  cameraPitch=Math.max(feel.minPitch,Math.min(feel.maxPitch,cameraPitch-e.movementY*sensitivity));
});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas){aiming=false;aimButtonHeld=false;aimBlockedUntilRelease=true;}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  canvas.requestPointerLock?.();
  if(e.button===2){
    e.preventDefault();
    aimButtonHeld=true;
    if(!raccoonView&&!raccoonTransition&&!aimBlockedUntilRelease)aiming=true;
  }else if(e.button===0&&!raccoonView&&!raccoonTransition)fire();
});
window.addEventListener('mouseup',e=>{if(e.button===2){aimButtonHeld=false;aiming=false;aimBlockedUntilRelease=false;}});
function beginRaccoonTransition(direction){
  aiming=false;pendingFire=false;aimBlockedUntilRelease=aimButtonHeld;cameraDistance=feel.cameraDistance;
  if(direction==='enter'){
    raccoonPosition.set(player.position.x,0,player.position.z);
    raccoonYaw=cameraYaw;raccoonPitch=cameraPitch;coonskinCap.visible=false;if(raccoonGLBModel)raccoonGLBModel.visible=false;
    raccoonModel.visible=true;raccoonModel.position.copy(player.position).add(new THREE.Vector3(0,perchY,0));
    raccoonModel.scale.setScalar(.18);
    raccoonView=false;
  }else{
    raccoonPosition.y=0;raccoonModel.visible=true;
    raccoonModel.position.set(raccoonPosition.x,0,raccoonPosition.z);
  }
  transitionCameraFrom.copy(camera.position);
  const lookTarget=new THREE.Vector3(player.position.x,1.15,player.position.z-.7);
  camera.getWorldDirection(transitionLookFrom).multiplyScalar(5).add(camera.position);
  raccoonTransition={direction,time:0,duration:direction==='enter'?1.65:2.35,from:raccoonModel.position.clone(),to:new THREE.Vector3(player.position.x,0,player.position.z),cameraFrom:camera.position.clone(),lookFrom:transitionLookFrom.clone(),lookTarget};
  keys.clear();aimValid=false;stateLabel.textContent=direction==='enter'?'The coonskin cap stirs…':'The raccoon is racing back';
}
function smoothstep(t){return t*t*(3-2*t);}
function updateRaccoonTransition(dt){
  const tr=raccoonTransition;if(!tr)return false;
  tr.time=Math.min(tr.duration,tr.time+dt);const p=tr.time/tr.duration,e=smoothstep(p);
  if(tr.direction==='enter'){
    const hop=Math.sin(Math.PI*Math.min(1,p/.62))*1.15;
    raccoonModel.position.lerpVectors(tr.from,tr.to,e);raccoonModel.position.y=perchY*(1-e)+hop;
    raccoonModel.rotation.y=raccoonYaw;raccoonModel.scale.setScalar(.18+.82*smoothstep(Math.max(0,(p-.20)/.52)));
    const target=new THREE.Vector3(raccoonPosition.x,.42,raccoonPosition.z);
    const cameraStart=tr.from.clone().add(new THREE.Vector3(0,4,7));
    camera.position.lerpVectors(cameraStart,target,e);camera.lookAt(raccoonModel.position);
    if(p>=1){raccoonModel.visible=false;raccoonModel.scale.setScalar(1);raccoonView=true;raccoonTransition=null;camera.position.set(raccoonPosition.x,.42,raccoonPosition.z);camera.rotation.order='YXZ';camera.rotation.set(raccoonPitch,raccoonYaw,0);stateLabel.textContent='Raccoon view — Q to return';canvas.requestPointerLock?.();}
  }else{
    const runEnd=.72, jumpP=Math.max(0,(p-runEnd)/(1-runEnd));
    const runEase=smoothstep(Math.min(1,p/runEnd));
    const start=tr.from,end=tr.to.clone().add(new THREE.Vector3(0,0,.22));
    raccoonPosition.lerpVectors(start,end,runEase);raccoonModel.position.copy(raccoonPosition);
    raccoonModel.position.y=perchY*jumpP+Math.sin(jumpP*Math.PI)*.75;
    raccoonModel.rotation.y=Math.atan2(end.x-start.x,end.z-start.z);
    raccoonModel.scale.setScalar(Math.max(.08,1-smoothstep(Math.max(0,(jumpP-.18)/.82))));
    const focus=raccoonModel.position.clone().add(new THREE.Vector3(0,.35,0));
    const follow=raccoonPosition.clone().add(new THREE.Vector3(0,2.1,5.2));
    const returnBlend=smoothstep(Math.max(0,(p-.82)/.18));
    const normalCamera=thirdPersonCameraTarget();
    camera.position.lerpVectors(tr.cameraFrom,follow,e).lerp(normalCamera,returnBlend);camera.lookAt(focus.clone().lerp(tr.lookTarget,returnBlend));
    if(p>=1){raccoonModel.visible=false;raccoonModel.scale.setScalar(1);raccoonTransition=null;raccoonView=false;coonskinCap.visible=true;if(raccoonGLBModel)raccoonGLBModel.visible=true;aiming=false;aimBlockedUntilRelease=aimButtonHeld;camera.position.copy(normalCamera);camera.rotation.order='YXZ';camera.rotation.set(cameraPitch,cameraYaw,0);stateLabel.textContent='Ready';canvas.requestPointerLock?.();}
  }
  return true;
}
function beginReload(){if(ammo===2||reload>0)return;reload=.001;play(triggerSound);stateLabel.textContent='Breaking the shotgun open';}
function ejectCasings(){
  player.updateMatrixWorld(true);
  for(const s of [-1,1]){
    const p=gun.localToWorld(new THREE.Vector3(s*.07,.05,.20));
    fragment(p,0xb33b2c,.12,new THREE.Vector3(s*1.4,3.2,-1.8).applyAxisAngle(new THREE.Vector3(0,1,0),yaw),2);
  }
}
function shotDistance(origin,dir,obstacle){
  // Three-dimensional slab test: a shot above a crate or below a target misses it.
  let near=0,far=14;
  const halfX=obstacle.type==='debris'?Math.max(.13,obstacle.halfX):obstacle.halfX;
  const halfZ=obstacle.type==='debris'?Math.max(.13,obstacle.halfZ):obstacle.halfZ;
  const halfY=obstacle.type==='wall'?.42:obstacle.type==='crate'?obstacle.size/2:obstacle.type==='target'?.65:Math.max(.13,obstacle.item.size/2);
  for(const [p,d,center,half] of [[origin.x,dir.x,obstacle.x,halfX],[origin.y,dir.y,obstacle.y,halfY],[origin.z,dir.z,obstacle.z,halfZ]]){
    if(Math.abs(d)<1e-8){if(p<center-half||p>center+half)return null;continue;}
    let a=(center-half-p)/d,b=(center+half-p)/d;
    if(a>b)[a,b]=[b,a];
    near=Math.max(near,a);far=Math.min(far,b);
    if(near>far)return null;
  }
  return far>=0?near:null;
}
function fire(){
  if(reload>0||fireCooldown>0)return;
  if(ammo===0){stateLabel.textContent='Empty — press R';return;}
  const wanted=Math.atan2(aimPoint.x-player.position.x,aimPoint.z-player.position.z);
  if(aimValid&&Math.abs(Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw)))>.14){pendingFire=true;return;}
  ammo=0;fireCooldown=.55;flash=.15;
  play(gunshot);play(triggerSound);
  ammoLabel.textContent='○ ○';stateLabel.textContent='Both barrels fired — press R';
  player.updateMatrixWorld(true);
  const muzzle=barrels.localToWorld(new THREE.Vector3(0,0,.94));
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(barrels.getWorldQuaternion(new THREE.Quaternion()));
  let origin=muzzle;
  let toAim=aimPoint.clone().sub(origin);
  // A surface beside Davy can sit behind the muzzle. Trace from the receiver
  // in that case so the close surface still blocks the shot.
  if(aimValid&&toAim.dot(forward)<=.05){
    origin=gun.localToWorld(new THREE.Vector3(0,0,.05));
    toAim=aimPoint.clone().sub(origin);
  }
  const dir=aimValid&&toAim.lengthSq()>1e-6&&toAim.dot(forward)>0?toAim.normalize():forward;
  const sideways=new THREE.Vector3(dir.z,0,-dir.x).normalize();
  const hits=new Set();
  // One trigger pull fires both shells as a short, reproducible pellet fan.
  // A crate between Davy and a target stops the pellet.
  for(const offset of [-.13,-.10,-.07,-.04,-.015,.015,.04,.07,.10,.13]){
    const pellet=dir.clone().addScaledVector(sideways,offset).normalize();
    let nearest=14, hit=null;
    for(const b of blockers){
      const distance=shotDistance(origin,pellet,b);
      if(distance!==null&&distance<nearest){nearest=distance;hit=b;}
    }
    if(hit)hits.add(hit);
  }
  // Resolve the closest patch per surface; stale entries are skipped after a blast.
  for(const b of hits)if(blockers.includes(b))breakObject(b,dir);
  ejectCasings();
  impact(muzzle.clone().addScaledVector(dir,.2),true);
}
function impact(position,muzzle=false){
  const color=muzzle?0xffd37b:0xc5ac83;
  for(let i=0;i<(muzzle?5:8);i++){
    const p=mesh(new THREE.TetrahedronGeometry(muzzle?.035:.055,0),mat(color),scene,position.toArray());
    puff.push({p,life:muzzle?.12:.42,velocity:new THREE.Vector3((Math.random()-.5)*2,Math.random()*1.8,(Math.random()-.5)*2)});
  }
}
function blocked(x,z){
  if(Math.abs(x)>7.55||Math.abs(z)>7.55)return true;
  // Loose fragments react to shots but never pin the player in place.
  return blockers.some(b=>b.type!=='debris'&&Math.abs(x-b.x)<b.halfX+.23&&Math.abs(z-b.z)<b.halfZ+.23);
}
function solidSurfaces(){
  return [floor,...wallTiles.map(b=>b.mesh),...blockers.filter(b=>b.type==='crate').flatMap(b=>b.parts),...targets.filter(t=>t.group.parent).flatMap(t=>t.group.children)];
}
function thirdPersonCameraTarget(){
  const pivot=new THREE.Vector3(player.position.x,player.position.y+pivotY,player.position.z);
  const back=new THREE.Vector3(Math.sin(cameraYaw)*Math.cos(cameraPitch),-Math.sin(cameraPitch),Math.cos(cameraYaw)*Math.cos(cameraPitch));
  const right=new THREE.Vector3(Math.cos(cameraYaw),0,-Math.sin(cameraYaw));
  const desired=pivot.clone().addScaledVector(back,cameraDistance).addScaledVector(right,feel.shoulderOffset);
  raycaster.set(pivot,desired.clone().sub(pivot).normalize());
  raycaster.far=pivot.distanceTo(desired);
  const hit=raycaster.intersectObjects(solidSurfaces(),false)[0];
  if(hit)desired.copy(pivot).addScaledVector(raycaster.ray.direction,Math.max(.2,hit.distance-.18));
  desired.y=Math.max(.32,desired.y);
  raycaster.far=Infinity;
  return desired;
}
function updateAimPoint(){
  raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
  raycaster.far=60;
  const hit=raycaster.intersectObjects(solidSurfaces(),false)[0];
  if(hit)aimPoint.copy(hit.point);
  else aimPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction,60);
  aimValid=true;
  raycaster.far=Infinity;
}
function turnToward(target,dt){
  const difference=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));
  yaw+=difference*Math.min(1,1-Math.exp(-feel.turnSpeed*dt));
}
function update(dt){
  if(davyMixer)davyMixer.update(dt);
  if(raccoonGLBMixer)raccoonGLBMixer.update(dt);
  if(updateRaccoonTransition(dt)){
    // Transition owns movement and camera until its completion conditions hold.
  }else if(raccoonView){
    const forward=Math.max(-1,Math.min(1,(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-touchMoveY));
    const strafe=Math.max(-1,Math.min(1,(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+touchMoveX));
    const length=Math.hypot(forward,strafe);
    if(length){
      const speed=6.8/Math.max(1,length);
      const dx=(-Math.sin(raccoonYaw)*forward+Math.cos(raccoonYaw)*strafe)*speed*dt;
      const dz=(-Math.cos(raccoonYaw)*forward-Math.sin(raccoonYaw)*strafe)*speed*dt;
      if(!blocked(raccoonPosition.x+dx,raccoonPosition.z))raccoonPosition.x+=dx;
      if(!blocked(raccoonPosition.x,raccoonPosition.z+dz))raccoonPosition.z+=dz;
    }
    camera.position.set(raccoonPosition.x,.42,raccoonPosition.z);
    camera.rotation.order='YXZ';camera.rotation.set(raccoonPitch,raccoonYaw,0);
  }else{
  const x=Math.max(-1,Math.min(1,(keys.has(controls.right)?1:0)-(keys.has(controls.left)?1:0)+touchMoveX));
  const z=Math.max(-1,Math.min(1,(keys.has(controls.forward)?1:0)-(keys.has(controls.back)?1:0)-touchMoveY));
  const moving=x!==0||z!==0;
  setDavyClip(moving?(keys.has(controls.sprint)&&davyActions[davyRun]?davyRun:davyWalk):davyIdle);
  if(moving){
    const len=Math.hypot(x,z),speed=aiming?feel.aimMoveSpeed:keys.has(controls.sprint)?5.2:3.4;
    const dx=(Math.cos(cameraYaw)*x-Math.sin(cameraYaw)*z)/len*speed*dt;
    const dz=(-Math.sin(cameraYaw)*x-Math.cos(cameraYaw)*z)/len*speed*dt;
    const nextX=player.position.x+dx;
    const nextZ=player.position.z+dz;
    if(!blocked(nextX,player.position.z))player.position.x=nextX;
    if(!blocked(player.position.x,nextZ))player.position.z=nextZ;
    walk+=dt*speed*2.5;
    if(!aiming)turnToward(Math.atan2(dx,dz),dt);
  }
  if(keys.has(controls.jump)&&vertical===0)velocityY=4.8;
  velocityY-=12*dt;vertical=Math.max(0,vertical+velocityY*dt);
  if(vertical===0)velocityY=0;
  player.position.y=vertical;
  for(const leg of body.userData.legs)leg.rotation.x=moving?Math.sin(walk+leg.userData.side*Math.PI/2)*.5:0;
  body.position.y=moving&&vertical===0?Math.abs(Math.sin(walk))*.035:0;
  cameraDistance+=( (aiming?feel.aimDistance:feel.cameraDistance)-cameraDistance)*(1-Math.exp(-feel.zoomSpeed*dt));
  camera.position.lerp(thirdPersonCameraTarget(),1-Math.exp(-feel.followSpeed*dt));
  const pivot=new THREE.Vector3(player.position.x,player.position.y+pivotY,player.position.z);
  raycaster.set(pivot,camera.position.clone().sub(pivot).normalize());
  raycaster.far=pivot.distanceTo(camera.position);
  const obstruction=raycaster.intersectObjects(solidSurfaces(),false)[0];
  if(obstruction)camera.position.copy(pivot).addScaledVector(raycaster.ray.direction,Math.max(.2,obstruction.distance-.18));
  camera.position.y=Math.max(.32,camera.position.y);
  raycaster.far=Infinity;
  camera.rotation.order='YXZ';camera.rotation.set(cameraPitch,cameraYaw,0);
  updateAimPoint();
  if(aiming||pendingFire)turnToward(Math.atan2(aimPoint.x-player.position.x,aimPoint.z-player.position.z),dt);
  const aimDirection=aimPoint.clone().sub(gun.getWorldPosition(new THREE.Vector3()));
  const flat=Math.hypot(aimDirection.x,aimDirection.z);
  if(flat>.15){
    const pitch=Math.max(-1.1,Math.min(1.1,Math.atan2(aimDirection.y,flat)));
    gun.rotation.x=-pitch;
    if(reload===0)for(const arm of body.userData.arms)arm.rotation.x=-pitch*.45;
  }
  if(pendingFire){
    const wanted=Math.atan2(aimPoint.x-player.position.x,aimPoint.z-player.position.z);
    if(Math.abs(Math.atan2(Math.sin(wanted-yaw),Math.cos(wanted-yaw)))<=.14){pendingFire=false;player.rotation.y=yaw;fire();}
  }
  }
  player.rotation.y=yaw;
  fireCooldown=Math.max(0,fireCooldown-dt);flash=Math.max(0,flash-dt);
  if(reload>0){
    reload+=dt;
    const t=reload;
    // Open; retrieve two shells in succession; seat them; snap the breech shut.
    barrels.rotation.x=t<.50?Math.min(1,t/.42)*1.15:t<2.20?1.15:Math.max(0,1-(t-2.20)/.43)*1.15;
    gun.position.z=gunRestZ+Math.sin(Math.min(1,t/2.7)*Math.PI)*.28;
    body.userData.arms[0].rotation.x=t<2.2?-.35:0;
    body.userData.arms[1].rotation.x=t<2.2?-.65:0;
    shells.forEach((sh,i)=>{
      const start=.55+i*.36,seat=1.42+i*.32;
      sh.visible=t>=start&&t<seat+.21;
      if(!sh.visible)return;
      const p=Math.min(1,Math.max(0,(t-start)/(seat-start)));
      sh.position.set((i?1:-1)*(.47-.38*p),1.05+.38*p,.05+.66*p);
      sh.rotation.x=p*.5;
    });
    stateLabel.textContent=t<.50?'Breaking the shotgun open':t<1.42?'Pulling two shells from the pocket':t<2.20?'Loading both barrels':'Closing the breech';
    if(t>=2.7){reload=0;barrels.rotation.x=0;gun.position.z=gunRestZ;body.userData.arms.forEach(arm=>arm.rotation.x=0);shells.forEach(sh=>sh.visible=false);ammo=2;ammoLabel.textContent='● ●';stateLabel.textContent='Ready';}
  }else barrels.rotation.x=flash>0?-.18:0;
  if(davyModel){
    davyModel.updateMatrixWorld(true);
    solveArmToWorldGoal('R',gun.localToWorld(new THREE.Vector3(0,-.08,-.05)));
    if(reload===0)solveArmToWorldGoal('L',gun.localToWorld(new THREE.Vector3(-.18,-.06,.28)));
  }
  for(let i=puff.length-1;i>=0;i--){
    const p=puff[i];p.life-=dt;p.p.position.addScaledVector(p.velocity,dt);p.p.scale.setScalar(Math.max(0,p.life*2));
    if(p.life<=0){scene.remove(p.p);p.p.geometry.dispose();p.p.material.dispose();puff.splice(i,1);}
  }
  for(const item of debris){
    if(item.rest>1)continue;
    item.velocity.y-=12*dt;
    item.mesh.position.addScaledVector(item.velocity,dt);
    item.mesh.rotation.x+=item.spin.x*dt;item.mesh.rotation.y+=item.spin.y*dt;item.mesh.rotation.z+=item.spin.z*dt;
    if(item.mesh.position.y<item.size*.5){
      item.mesh.position.y=item.size*.5;
      item.velocity.y=Math.abs(item.velocity.y)*.31;
      item.velocity.x*=.72;item.velocity.z*=.72;item.spin.multiplyScalar(.72);
      if(Math.abs(item.velocity.y)<.25)item.velocity.y=0;
    }
    item.mesh.position.x=Math.max(-7.9,Math.min(7.9,item.mesh.position.x));
    item.mesh.position.z=Math.max(-7.9,Math.min(7.9,item.mesh.position.z));
    if(item.velocity.lengthSq()<.045)item.rest+=dt;
    const b=blockers.find(b=>b.item===item);if(b){b.x=item.mesh.position.x;b.z=item.mesh.position.z;b.y=item.mesh.position.y;}
  }
}
let previous=performance.now();
function frame(now){
  const dt=Math.min(.04,(now-previous)/1000);previous=now;
  update(dt);
  window.game={player,body,camera,ammo,reload,fireCooldown,vertical,raccoonView,aiming,aimValid,pendingFire,yaw,aimPoint:aimPoint.toArray(),keyStates:Array.from(keys),mixer:davyMixer,davyModel,raccoonGLBModel,raccoonGLBMixer,gun,shotgunModelLoaded,davyScale,davyClip,raccoonClip};
  if (ps1Settings.lowResolution || ps1Settings.colorDither) {
    renderer.setRenderTarget(lowResTarget);
    renderer.render(scene,camera);
    renderer.setRenderTarget(null);
    renderer.render(displayScene,displayCamera);
  } else {
    renderer.render(scene,camera);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
