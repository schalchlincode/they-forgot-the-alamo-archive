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
  if(z<0 && ((y>1.1&&x>-4.5&&x<-1.5)||x===4))continue;
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
// The first room is a ward, not an anonymous shooting gallery. The chart and
// damaged ambulance outside connect David's crash to his confused awakening.
const bedFrame=mat(0x717b78),sheet=mat(0xb9aa91),monitorGreen=mat(0x8dc7a1,{emissive:0x28533c});
box(1.25,.18,2.4,bedFrame,scene,[-5,.48,2.7]);
box(1.12,.12,2.1,sheet,scene,[-5,.64,2.7]);
box(1.25,.72,.12,bedFrame,scene,[-5,.85,3.88]);
box(.9,.24,.44,sheet,scene,[-5,.76,3.35]);
for(const z of [1.75,3.65])for(const x of [-5.53,-4.47])cyl(.04,.04,.45,bedFrame,scene,[x,.24,z],6);
box(.07,2.0,.07,bedFrame,scene,[-6.55,1.02,2.3]);
box(.52,.06,.06,bedFrame,scene,[-6.55,2.02,2.3]);
box(.42,.43,.1,edge,scene,[-6.7,1.55,1.6]);
box(.32,.15,.012,monitorGreen,scene,[-6.7,1.58,1.54]);
const chartCanvas=document.createElement('canvas');chartCanvas.width=256;chartCanvas.height=128;
const chartContext=chartCanvas.getContext('2d');
chartContext.fillStyle='#ddd4b6';chartContext.fillRect(0,0,256,128);
chartContext.fillStyle='#322b28';chartContext.font='bold 20px monospace';
chartContext.fillText('DAVID CROCKETT',12,30);
chartContext.font='16px monospace';chartContext.fillText('CRASH / COMA: 11 DAYS',12,62);
chartContext.fillText('COUNTY WARD  /  03',12,92);
const chartTexture=new THREE.CanvasTexture(chartCanvas);chartTexture.colorSpace=THREE.SRGBColorSpace;
const chart=mesh(new THREE.PlaneGeometry(1.3,.65),new THREE.MeshBasicMaterial({map:chartTexture,side:THREE.DoubleSide}),scene,[-5.6,1.65,4.8]);
chart.rotation.y=Math.PI;
// Outside the ward, the modern wreck is visible before Davy names his mission.
box(.82,.48,.58,mat(0x9c3d32),scene,[-3,1.63,-8.3]).rotation.z=.18;
box(.39,.29,.54,mat(0x7c2b26),scene,[-3.25,2.03,-8.3]).rotation.z=.18;
for(const x of [-3.38,-2.62])cyl(.13,.13,.09,edge,scene,[x,1.42,-8.3],7).rotation.z=Math.PI/2;
const serviceDoor=box(1.8,2.8,.07,wood,scene,[4,1.4,-7.97]);
mesh(new THREE.SphereGeometry(.055,6,4),brass,scene,[4.58,1.35,-7.85]);
// A short hospital service corridor makes the exit a place Davy can reach.
const corridorFloor=box(3.6,.28,8,stone,scene,[4,-.15,-12]);
for(const x of [2.15,5.85])box(.25,3.4,8,plaster,scene,[x,1.7,-12]);
const wardOrderly=new THREE.Group();scene.add(wardOrderly);wardOrderly.position.set(4,0,-12.6);
const orderlyScrubs=mat(0x718b82),orderlySkin=mat(0xb58d6e);
box(.7,.9,.4,orderlyScrubs,wardOrderly,[0,1.25,0]);
box(.34,.34,.34,orderlySkin,wardOrderly,[0,1.9,0]);
for(const side of [-1,1]){
  box(.18,.7,.2,orderlyScrubs,wardOrderly,[side*.47,1.22,0]);
  box(.23,.7,.25,orderlyScrubs,wardOrderly,[side*.19,.42,0]);
}
const wardOrderlyBlocker={x:4,y:1.25,z:-12.6,halfX:.46,halfZ:.38,type:'enemy'};
let wardOrderlyAlive=true,wardOrderlyAttackCooldown=0,wardOrderlyWindup=0;
const wardOrderlyWarning=new THREE.Mesh(new THREE.RingGeometry(1.85,2,32),mat(0xffcc44,{emissive:0x886611,side:THREE.DoubleSide}));
wardOrderlyWarning.rotation.x=-Math.PI/2;
wardOrderlyWarning.position.y=.055;
wardOrderlyWarning.visible=false;
wardOrderly.add(wardOrderlyWarning);
// The emergency exit opens onto the road. Solid sides frame a walkable gap.
for(const x of [2.32,5.68])box(.34,3.4,.25,plaster,scene,[x,1.7,-16]);
box(3.7,.55,.25,plaster,scene,[4,3.12,-16]);
for(const z of [-9,-12,-15])box(.65,.08,.4,mat(0xc8d5b1,{emissive:0x48533c}),scene,[4,3.15,z]);
box(1.9,.9,.07,edge,scene,[4,2.1,-15.83]);
box(1.75,.74,.08,mat(0x6e2722,{emissive:0x290805}),scene,[4,2.1,-15.77]);
// Mile Marker 13 begins quietly, with evidence of a crash beyond the pumps.
const roadside=box(24,.24,29,mat(0x75644c),scene,[4,-.16,-31]);
const asphalt=box(7,.035,29,mat(0x343638),scene,[4,-.02,-31]);
for(const z of [-20,-25,-30,-35,-40])box(.13,.012,2,mat(0xbcb48b),scene,[4,.006,z]);
for(const x of [-.1,8.1])box(.18,.35,29,mat(0x4d4336),scene,[x,.02,-31]);
// The station is a walkable room. A low service vent admits the raccoon;
// its switch raises the shutter at the main entrance for Davy.
const stationWall=mat(0x8b7564),stationInterior=mat(0x554b3e);
box(7,.2,4.2,stationInterior,scene,[10,-.1,-34]);
box(.25,3.1,4.2,stationWall,scene,[13.4,1.55,-34]);
box(7,3.1,.24,stationWall,scene,[10,1.55,-36.1]);
box(7,3.1,.24,stationWall,scene,[10,1.55,-31.9]);
box(.25,3.1,1.05,stationWall,scene,[6.6,1.55,-35.58]);
box(.25,3.1,.75,stationWall,scene,[6.6,1.55,-33.55]);
box(.25,2.2,.9,stationWall,scene,[6.6,2.0,-32.45]);
const stationShutter=box(.12,2.7,1.3,mat(0x57636a),scene,[6.6,1.35,-34.5]);
const stationRecorder=box(.38,.18,.25,mat(0xc8aa72,{emissive:0x33220a}),scene,[12.2,.4,-35.25]);
let stationRecordingFound=false;
let roadsideFoamActive=false;
const forecourtFoam=new THREE.Group();scene.add(forecourtFoam);forecourtFoam.visible=false;
for(const [x,z,r] of [[4,-30,2.2],[3,-33,1.8],[5,-27,1.5]]){
  const patch=new THREE.Mesh(new THREE.CircleGeometry(r,12),mat(0xdde4d9));
  patch.rotation.x=-Math.PI/2;patch.position.set(x,.015,z);forecourtFoam.add(patch);
}
const stationSwitch=box(.34,.2,.32,mat(0x9e3b35,{emissive:0x33100c}),scene,[9,.22,-32.5]);
box(2.1,1.0,.6,stationInterior,scene,[10.8,.5,-35.1]);
box(7.8,.25,5.2,mat(0x452d28),scene,[10,3.2,-34]);
box(2.2,1.25,.09,mat(0x49616b,{emissive:0x0a151a}),scene,[7.95,1.55,-34]);
for(const z of [-26,-29]){
  box(.7,1.35,.65,mat(0xb7a990),scene,[7.7,.7,z]);
  box(.52,.18,.48,mat(0x8f3527),scene,[7.7,1.5,z]);
}
box(.12,1.55,.12,edge,scene,[.8,.78,-24]);
box(.1,.7,1.15,mat(0x8b9a78),scene,[.8,1.55,-24]);
const wreck=box(2.5,.7,1.45,mat(0x5b715c),scene,[.8,.48,-38]);wreck.rotation.y=.43;
box(1.2,.75,1.3,mat(0x5b715c),scene,[.2,1.05,-38.2]).rotation.y=.43;
for(const x of [-.25,1.75])for(const z of [-37.4,-38.6])cyl(.34,.34,.12,edge,scene,[x,.34,z],8).rotation.z=Math.PI/2;
// The motel is a weathered roadside building. Davy finds his room key there.
const motelExterior=mat(0x8b6f47),motelTrim=mat(0xa89a8e);
box(12,.35,7,motelExterior,scene,[4,-.15,-42]);
box(4.5,3.2,.2,motelExterior,scene,[.25,1.6,-38.9]);
box(4.5,3.2,.2,motelExterior,scene,[7.75,1.6,-38.9]);
box(3,1,.2,motelExterior,scene,[4,2.7,-38.9]);
box(.2,3.2,7,motelTrim,scene,[-.1,1.6,-42]);
box(.2,3.2,7,motelTrim,scene,[8.1,1.6,-42]);
box(12,.2,7,motelTrim,scene,[4,3.15,-42]);
for(const x of [-.6,1.0,2.6,4.2,5.8,7.4,8.95])box(.35,1.45,.15,mat(0x2a2a2a),scene,[x,1.3,-39.1]);
for(const x of [-.6,1.0,2.6,4.2,5.8,7.4,8.95])box(.35,1.45,.15,mat(0x2a2a2a),scene,[x,1.3,-44.9]);
box(1.2,.8,.08,mat(0xc8aa72),scene,[4.0,.9,-39.0]);
const motelSignPost=box(.12,2.2,.12,mat(0x8b6347),scene,[9.5,1.1,-42]);
box(1.4,.3,.25,mat(0xcc6644),scene,[9.5,2.3,-42]);motelSignPost.visible=false;
const motelDoor=box(.5,2.0,.08,mat(0x6b4423),scene,[10.2,1.0,-42]);motelDoor.visible=false;
// Optional cash register in the office. A discovery for players who explore.
const motelRegister=box(.3,.35,.2,mat(0xb8860b),scene,[5.5,1.0,-42]);
let motelRegisterFound=false;
// A tangible room key releases the motel courtyard exit.
const motelKey=new THREE.Group();scene.add(motelKey);motelKey.position.set(4,1,-42);
const motelKeyMetal=mat(0xe8bc55);motelKeyMetal.emissive.setHex(0x665000);
mesh(new THREE.TorusGeometry(.12,.035,4,8),motelKeyMetal,motelKey,[0,0,0]);
box(.045,.24,.045,motelKeyMetal,motelKey,[0,-.19,0]);
box(.12,.045,.045,motelKeyMetal,motelKey,[.04,-.27,0]);
box(.7,.65,.5,mat(0x6b4423),scene,[4,.325,-42]);
const motelExitGate=box(8,1.8,.12,mat(0x655f58),scene,[4,.9,-45.6]);
let motelKeyFound=false;
// Evacuation vehicles wait outside the motel, then depart one at a time.
const convoy=new THREE.Group();scene.add(convoy);
const convoyVehicles=[],convoyBeacons=[];
let convoyTime=0,convoyRadioPlayed=false,convoyReleased=false,convoyCrossingOpen=false;
const convoyRelease=box(.5,.28,.35,mat(0xffad36,{emissive:0x774400}),scene,[4,.18,-48]);
const convoyBarrier=box(16,1.5,.15,mat(0xc99836),scene,[4,.75,-49]);
for(let x=-3;x<12;x+=1)box(.4,.9,.17,mat(0x282b2b),convoyBarrier,[x-4,0,0]);
for(let i=0;i<3;i++){
  const vehicle=new THREE.Group();vehicle.position.set(4+i*5,0,-51);convoy.add(vehicle);
  const body=mat(i===0?0xd5ccb0:0x526756),glass=mat(0x243d49),rubber=mat(0x202124);
  box(3.8,.8,1.7,body,vehicle,[0,.85,0]);
  box(2.1,.8,1.65,body,vehicle,[-.35,1.65,0]);
  box(.05,.5,1.4,glass,vehicle,[.73,1.7,0]);
  for(const z of [-.84,.84]){
    box(1.6,.45,.04,glass,vehicle,[-.35,1.7,z]);
    for(const x of [-1.15,1.15]){
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.22,8),rubber);
      wheel.rotation.x=Math.PI/2;wheel.position.set(x,.4,z);vehicle.add(wheel);
    }
  }
  for(const z of [-.55,.55])box(.05,.22,.3,mat(0xffedba),vehicle,[1.92,.95,z]);
  const beacon=box(.45,.18,.5,mat(0xffa52f),vehicle,[-.35,2.14,0]);
  convoyBeacons.push(beacon);convoyVehicles.push(vehicle);
}
// The Republic of Yesterday is a modern frontier tourist attraction built over older ground.
// The entry passage shows off the frontier aesthetic while maintaining motel-era convenience.
const museumEntry=mat(0xdaa520),museumWall=mat(0xc19a6b);
box(4,.4,8,museumEntry,scene,[4,-.15,-58]);
box(1.1,3.5,.25,museumWall,scene,[2.45,1.75,-54.1]);
box(1.1,3.5,.25,museumWall,scene,[5.55,1.75,-54.1]);
box(1.8,1,.25,museumWall,scene,[4,3,-54.1]);
box(.25,3.5,8,museumWall,scene,[1.9,1.75,-58]);
box(.25,3.5,8,museumWall,scene,[6.1,1.75,-58]);
box(4,.25,8,museumWall,scene,[4,3.5,-58]);
box(2.0,1.8,.08,mat(0x8b4513),scene,[4,1.9,-54.0]);
// First exhibit: "Cowboys & Cattlemen" room. Wood interior, wall signage, display items.
const exhibitA=mat(0x704214),exhibitFloor=mat(0x8b7355);
box(7,.35,6,exhibitFloor,scene,[7.5,-.16,-65]);
box(1.8,3.2,.2,exhibitA,scene,[6,1.6,-62.1]);
box(1.8,3.2,.2,exhibitA,scene,[9,1.6,-62.1]);
box(1.8,1,.2,exhibitA,scene,[7.5,2.7,-62.1]);
box(.2,3.2,1.6,exhibitA,scene,[5.1,1.6,-62.8]);
box(.2,3.2,1.6,exhibitA,scene,[5.1,1.6,-67.2]);
box(.2,1,2.8,exhibitA,scene,[5.1,2.7,-65]);
box(.2,3.2,6,exhibitA,scene,[9.9,1.6,-65]);
box(7,.2,6,exhibitA,scene,[7.5,3.4,-65]);
for(const z of [-62,-65,-68])box(.4,.6,.15,mat(0xa0826d),scene,[6.2,.8,z]);
for(const z of [-62,-65,-68])box(.4,.6,.15,mat(0xa0826d),scene,[8.8,.8,z]);
box(1.0,1.8,.12,mat(0xd3a574),scene,[4.5,1.9,-65]);
// Costumer dressing area. An old cowboy hat and vest hang conspicuously.
box(.6,.1,.4,mat(0x4a4a4a),scene,[9.5,.8,-62.5]);
box(.35,.8,.25,mat(0x8b6f47),scene,[9.8,1.1,-62.8]);
const hatOnStand=box(.4,.08,.35,mat(0x2d2d2d),scene,[9.5,1.5,-62.5]);
const vestOnHook=box(.45,.6,.2,mat(0x704214,{emissive:0x3a2410}),scene,[9.8,1.6,-62.8]);
// A misplaced modern incident card hints that the museum staff know David.
const museumIncidentCard=box(.42,.025,.3,mat(0xd9d3ba,{emissive:0x302a1c}),scene,[7.5,.84,-66.1]);
let museumIncidentFound=false;
// Second exhibit: "Alamo Legacy" room. Display cases and historical markers.
const exhibitB=mat(0x5d4a3a),exhibitBFloor=mat(0x7a6b5a);
box(6,.35,6,exhibitBFloor,scene,[7,-.16,-75]);
box(2,3.2,.2,exhibitB,scene,[5,1.6,-72.1]);
box(2,3.2,.2,exhibitB,scene,[9,1.6,-72.1]);
box(2,1,.2,exhibitB,scene,[7,2.7,-72.1]);
box(.2,3.2,6,exhibitB,scene,[4.1,1.6,-75]);
box(.2,3.2,6,exhibitB,scene,[9.9,1.6,-75]);
box(6,.2,6,exhibitB,scene,[7,3.4,-75]);
// Display cases with artifacts
box(.8,1.5,.5,mat(0x8b6f47),scene,[4.8,1.0,-72.5]);
box(.8,1.5,.5,mat(0x8b6f47),scene,[9.2,1.0,-72.5]);
box(.8,1.5,.5,mat(0x8b6f47),scene,[4.8,1.0,-77.5]);
box(.8,1.5,.5,mat(0x8b6f47),scene,[9.2,1.0,-77.5]);
// Placard with glowing effect
box(1.2,.08,.3,mat(0xc0c0c0,{emissive:0x333333}),scene,[7,2.0,-72.2]);
const exhibitBTitle=box(.9,.05,.2,mat(0xffd700,{emissive:0x664400}),scene,[7,2.15,-72.1]);
// A staged rifle volley is wired to the red exhibit floor strip. The low
// maintenance switch gives the raccoon a safe alternative to taking the hit.
const museumTrapStrip=box(3.6,.035,.9,mat(0xb64426,{emissive:0x662211}),scene,[6.1,.035,-75]);
const museumTrapSwitch=box(.35,.24,.3,mat(0xc86428,{emissive:0x442211}),scene,[4.7,.18,-73.5]);
let museumTrapDisarmed=false,museumTrapTriggered=false,museumTrapWindup=0;
// The museum's security grille leaves a low animal gap. Its release is beyond
// the exhibit, so Davy has to send the raccoon ahead before reaching the stairs.
const museumGate=box(16,2.1,.25,mat(0x536067),scene,[0,1.65,-79]);
const museumGateBlocker={x:0,y:1.8,z:-79,halfX:8,halfZ:.125,type:'raccoonGap'};
const museumGateSwitch=box(.34,.22,.3,mat(0x9e3b35,{emissive:0x33100c}),scene,[7,.2,-80.8]);
const blockers=[...wallTiles];
blockers.push(wardOrderlyBlocker);
blockers.push(museumGateBlocker);
blockers.push({x:4,y:1.4,z:-7.97,halfX:.9,halfZ:.08,type:'door'});
for(const [x,z,hx,hz] of [[13.4,-34,.13,2.1],[10,-36.1,3.5,.12],[10,-31.9,3.5,.12],[6.6,-35.58,.13,.525],[6.6,-33.55,.13,.375]])
  blockers.push({x,y:1.55,z,halfX:hx,halfZ:hz,type:'station'});
blockers.push({x:6.6,y:2,z:-32.45,halfX:.13,halfZ:.45,type:'ventTop'});
const ventBlocker={x:6.6,y:.35,z:-32.45,halfX:.13,halfZ:.45,type:'vent'};
const shutterBlocker={x:6.6,y:1.35,z:-34.5,halfX:.08,halfZ:.65,type:'shutter'};
blockers.push(ventBlocker,shutterBlocker);
const motelExitBlocker={x:4,y:.9,z:-45.6,halfX:4,halfZ:.06,type:'motel'};
blockers.push(motelExitBlocker);
const convoyBarrierBlocker={x:4,y:.75,z:-49,halfX:8,halfZ:.075,type:'motel'};
blockers.push(convoyBarrierBlocker);
// Motel blockers
for(const [x,z,hx,hz] of [[-.1,-42,0.1,3.5],[8.1,-42,0.1,3.5],[.25,-38.9,2.25,0.1],[7.75,-38.9,2.25,0.1]])
  blockers.push({x,y:1.6,z,halfX:hx,halfZ:hz,type:'motel'});
// Museum blockers
for(const [x,z,hx,hz] of [[1.9,-58,0.125,4],[6.1,-58,0.125,4],[2.45,-54.1,.55,.125],[5.55,-54.1,.55,.125]])
  blockers.push({x,y:1.75,z,halfX:hx,halfZ:hz,type:'museum'});
for(const [x,z,hx,hz] of [[5.1,-62.8,0.1,.8],[5.1,-67.2,0.1,.8],[9.9,-65,0.1,3],[6,-62.1,.9,0.1],[9,-62.1,.9,0.1]])
  blockers.push({x,y:1.6,z,halfX:hx,halfZ:hz,type:'exhibit'});
// Optional staff-room branch off the open museum hall. North and south
// doorways let the player return to the main exhibit without a dead end.
const staffRoomMat=mat(0x54716a);
box(6,.2,7,mat(0x67685c),scene,[-1,-.08,-72]);
for(const [x,z,hx,hz] of [[-4,-72,.1,3.5],[2,-72,.1,3.5],[-3,-68.5,1,.1],[1,-68.5,1,.1],[-3,-75.5,1,.1],[1,-75.5,1,.1]]){
  box(hx*2,2.8,hz*2,staffRoomMat,scene,[x,1.4,z]);
  blockers.push({x,y:1.4,z,halfX:hx,halfZ:hz,type:'museum'});
}
const museumFirstAid=box(.65,.5,.35,mat(0xe4e5ce,{emissive:0x343829}),scene,[-1,.5,-72]);
box(.36,.08,.02,mat(0xa9332e),museumFirstAid,[0,0,.19]);
box(.08,.32,.02,mat(0xa9332e),museumFirstAid,[0,0,.19]);
let museumFirstAidUsed=false;
// Low staff recall panel creates an optional nonlethal route through the hall.
const museumRecallPanel=box(.5,.28,.18,mat(0xd5a64b,{emissive:0x664211}),scene,[-1,.2,-70]);
let museumGuardRecalled=false;
// The recurring orderly controls containment from a raised, sealed booth.
const containmentShutter=box(20,3.6,.18,mat(0x697779),scene,[1,5.4,-60]);
const containmentBlocker={x:1,y:1.8,z:-60,halfX:10,halfZ:.09,type:'museum'};
const containmentLamp=box(.6,.22,.2,mat(0x50605a,{emissive:0x153320}),scene,[4,3.9,-60.2]);
const orderlyBooth=new THREE.Group();scene.add(orderlyBooth);orderlyBooth.position.set(7.5,1.8,-71);
box(2.8,.18,1.4,mat(0x424c55),orderlyBooth,[0,0,0]);
box(2.8,2.2,.15,mat(0x48555c),orderlyBooth,[0,1.1,-.7]);
for(const x of [-1.35,1.35])box(.12,2.2,1.4,mat(0x48555c),orderlyBooth,[x,1.1,0]);
box(.65,.85,.35,mat(0xc8d8cc,{emissive:0x526758}),orderlyBooth,[0,.8,0]);
box(.32,.34,.3,mat(0xb78c71,{emissive:0x684a33}),orderlyBooth,[0,1.4,0]);
box(.25,.06,.06,mat(0x252d33),orderlyBooth,[.08,1.4,.18]);
box(2.5,1.9,.03,mat(0x87b4bd,{transparent:true,opacity:.22,depthWrite:false}),orderlyBooth,[0,1.05,.69]);
// Lit frame distinguishes the raised control window from the exhibit walls.
const boothTrim=mat(0xffd68a,{emissive:0x996633});
for(const x of [-1.25,1.25])box(.07,1.9,.06,boothTrim,orderlyBooth,[x,1.05,.73]);
for(const y of [.12,2])box(2.5,.07,.06,boothTrim,orderlyBooth,[0,y,.73]);
box(.75,.12,.12,boothTrim,orderlyBooth,[0,1.9,.4]);
let museumContainmentStarted=false,museumContainmentReleased=false;
function updateMuseumContainment(dt){
  if(wakeStage===12&&!museumContainmentStarted){
    museumContainmentStarted=true;
    // Introduce the speaker on forward approach without locking look controls.
    if(!raccoonView&&Math.abs(cameraYaw)<.2&&cameraPitch<-.2)cameraPitch=.15;
    if(museumGuardAlive&&!museumGuardRecalled)blockers.push(containmentBlocker);
    containmentLamp.material.color.setHex(0xffaa44);
    containmentLamp.material.emissive.setHex(0xaa3300);
    showStoryBeat('ORDERLY, IN THE BOOTH: David. I cannot let you back onto that road. The escort will bring you downstairs. DAVY: A fort with its gates shut is still a prison.',9);
  }
  if(museumContainmentStarted&&!museumContainmentReleased&&(!museumGuardAlive||museumGuardRecalled||wakeStage>=13)){
    museumContainmentReleased=true;
    const i=blockers.indexOf(containmentBlocker);if(i>=0)blockers.splice(i,1);
    containmentLamp.material.color.setHex(0x77cc99);containmentLamp.material.emissive.setHex(0x225533);
    showStoryBeat(museumGuardRecalled?'ORDERLY, IN THE BOOTH: You redirected him? All right. Opening containment. Stay where I can see you.':'ORDERLY, IN THE BOOTH: Stand back. I am opening the shutter. No one else needs to get hurt.',8);
  }
  const closed=museumContainmentStarted&&!museumContainmentReleased&&wakeStage===12;
  const target=closed?1.8:5.4;
  containmentShutter.position.y+=Math.sign(target-containmentShutter.position.y)*Math.min(Math.abs(target-containmentShutter.position.y),dt*2.4);
}

// Second exhibit blockers
for(const [x,z,hx,hz] of [[4.1,-75,0.1,3],[9.9,-75,0.1,3],[5,-72.1,1,0.1],[9,-72.1,1,0.1]])
  blockers.push({x,y:1.6,z,halfX:hx,halfZ:hz,type:'exhibit'});
// Under the Mission: stone stairway descent and tunnel entrance.
const stoneMat=mat(0x4a4a4a),darkStoneMat=mat(0x2d2d2d);
// Stairway steps descending from -78 to -85.
for(let i=0;i<8;i++){
  const stepZ=-78-(i*0.875);
  const stepSize=0.3;
  box(6,stepSize,.5,stoneMat,scene,[7,1.2-i*0.4,stepZ]);
}
// Tunnel entrance chamber with industrial arch.
const tunnelFloor=box(8,.35,6,darkStoneMat,scene,[7,-.16,-88]);
box(2.5,3.8,.3,darkStoneMat,scene,[4.75,1.6,-85.2]);
box(2.5,3.8,.3,darkStoneMat,scene,[9.25,1.6,-85.2]);
box(3,1,.3,darkStoneMat,scene,[7,3.2,-85.2]);
box(0.3,3.8,6,darkStoneMat,scene,[3.5,1.6,-88]);
box(0.3,3.8,6,darkStoneMat,scene,[10.5,1.6,-88]);
box(8,.4,6,darkStoneMat,scene,[7,3.8,-88]);
// Tunnel arch suggestion with recessed lighting.
box(6,.15,.3,mat(0x6b6b6b),scene,[7,3.5,-85.8]);
const tunnelPlaque=box(1.5,.1,.25,mat(0x8b7355,{emissive:0x2d2410}),scene,[7,2.2,-85.3]);
// The orderly's dropped pager is an optional clue off the direct tunnel path.
const orderlyPager=box(.22,.08,.14,mat(0x87918b,{emissive:0x28342e}),scene,[7.8,.12,-89.6]);
let orderlyPagerFound=false;
// Entrance blockers
for(const [x,z,hx,hz] of [[3.5,-88,0.15,3],[10.5,-88,0.15,3],[4.75,-85.2,1.25,0.15],[9.25,-85.2,1.25,0.15]])
  blockers.push({x,y:1.75,z,halfX:hx,halfZ:hz,type:'tunnel'});
// Deep tunnel exploration: industrial machinery and service conduits.
const deepTunnelFloor=box(8,.35,20,darkStoneMat,scene,[7,-.16,-103]);
// Leave a narrow opening in the west wall for the raccoon-controlled maintenance gate.
box(0.3,4.2,12,darkStoneMat,scene,[3.5,1.6,-99]);
box(0.3,4.2,3,darkStoneMat,scene,[3.5,1.6,-111.5]);
// East service room: a quiet, optional detour before the sentry.
box(0.3,4.2,2,darkStoneMat,scene,[10.5,1.6,-94]);
box(0.3,4.2,16,darkStoneMat,scene,[10.5,1.6,-105]);
box(4,.35,4,darkStoneMat,scene,[12.5,-.16,-96]);
box(4,.3,4,darkStoneMat,scene,[12.5,3.8,-96]);
for(const [x,z,hx,hz] of [[14.5,-96,.15,2],[12.5,-94,2,.15],[12.5,-98,2,.15]]){
  box(hx*2,3.8,hz*2,stoneMat,scene,[x,1.7,z]);
  blockers.push({x,y:1.7,z,halfX:hx,halfZ:hz,type:'tunnel'});
}
box(.12,.6,.8,mat(0x719882,{emissive:0x426b52}),scene,[10.3,1.8,-95]);
const serviceLog=box(.4,.1,.3,mat(0xb8ad81,{emissive:0x453d20}),scene,[13.6,.35,-96]);
const serviceAid=box(.5,.35,.4,mat(0xeeeecc,{emissive:0x334433}),scene,[12.8,.35,-97.2]);
box(.3,.04,.09,mat(0xcc3333),serviceAid,[0,.19,0]);
box(.09,.04,.3,mat(0xcc3333),serviceAid,[0,.19,0]);
let serviceLogFound=false,serviceAidUsed=false;
box(8,.5,20,darkStoneMat,scene,[7,4.0,-103]);
// Industrial machinery: pipes and conduits.
for(let i=0;i<4;i++){
  const pipeZ=-92-(i*5);
  cyl(.12,.12,8,mat(0x6b6347),scene,[4.5,2.5,pipeZ],8);
  cyl(.12,.12,8,mat(0x6b6347),scene,[9.5,2.5,pipeZ],8);
  cyl(.08,.08,8,mat(0x8b7564),scene,[7,1.2,pipeZ],8);
}
// Utility conduit box with details.
box(2.5,1.2,.6,mat(0x4a4a4a),scene,[7,2.3,-107.5]);
box(2.3,.2,.4,mat(0x8b6347,{emissive:0x2a1a0a}),scene,[7,3.1,-107.5]);
// Conduit vent access for raccoon to reach maintenance control switch.
blockers.push({x:7,y:3.0,z:-107.5,halfX:.4,halfZ:.25,type:'ventTop'});
const conduitVentBlocker={x:7,y:1.2,z:-107.5,halfX:.4,halfZ:.25,type:'vent'};
blockers.push(conduitVentBlocker);
// Maintenance side passage (initially closed by blocker, opens when conduit switch is activated).
const maintenancePassage=box(.18,2.6,5,mat(0x4a4a4a),scene,[3.5,1.3,-107.5]);
const maintenanceBlocker={x:3.5,y:1.3,z:-107.5,halfX:.09,halfZ:2.5,type:'passage'};
blockers.push(maintenanceBlocker);
// Conduit control switch: raccoon-accessible at top of utility box area.
const conduitSwitch=box(.3,.18,.26,mat(0x9e3b35,{emissive:0x33100c}),scene,[7,3.5,-107.5]);
// The tunnel fight becomes an escape: a ceiling fall seals the cleared route.
const tunnelCollapse=new THREE.Group();scene.add(tunnelCollapse);
tunnelCollapse.position.set(7,4,-99);
for(const [x,y,w,h] of [[-2.5,.8,2,1.6],[0,1,3,2],[2.5,.7,2,1.4]]){
  const slab=box(w,h,1.2,darkStoneMat,tunnelCollapse,[x,y,0]);
  slab.rotation.z=x*.08;
}
tunnelCollapse.visible=false;
let tunnelCollapsed=false;
let tunnelSteamTime=0,tunnelSteamHit=false;
const tunnelSteam=new THREE.Group();scene.add(tunnelSteam);
const steamWarning=box(2.4,.025,2.6,mat(0xffbb33,{emissive:0x775511}),tunnelSteam,[7,.055,-104.5]);
const steamJets=[];
for(const z of [-105.3,-104.5,-103.7])steamJets.push(box(.22,1.3,.22,mat(0xdce5df,{transparent:true,opacity:.65}),tunnelSteam,[7,1.5,z]));
tunnelSteam.visible=false;
// The maintenance passage opens into a distorted mission plaza. A low gap in
// its inner barricade is passable only in raccoon view; the switch opens Davy's route.
const lastStandFloor=box(7,.35,16,mat(0x625447),scene,[0,-.16,-119]);
for(const x of [-3.5,3.5])box(.25,3.4,16,mat(0x55473e),scene,[x,1.65,-119]);
box(2.5,.25,5,mat(0x78644e),scene,[-1.8,-.0,-118]);
for(const x of [-2.3,2.3]){
  box(2.4,2.8,.25,mat(0x6c5946),scene,[x,1.4,-121]);
  blockers.push({x,y:1.4,z:-121,halfX:1.2,halfZ:.125,type:'lastStandWall'});
}
box(2.2,.25,.25,mat(0x6c5946),scene,[0,2.68,-121]);
box(2.2,.55,.25,mat(0x6c5946),scene,[0,2.85,-121]);
const lastStandGate=box(2.2,2.1,.25,mat(0x704534),scene,[0,1.65,-121]);
const lastStandGateBlocker={x:0,y:1.8,z:-121,halfX:1.1,halfZ:.125,type:'raccoonGap'};
blockers.push(lastStandGateBlocker);
const lastStandSwitch=box(.34,.22,.3,mat(0x9e3b35,{emissive:0x33100c}),scene,[-2.35,.2,-122.4]);
const lastStandAltar=box(1.5,.7,.9,mat(0x8b7355),scene,[0,.35,-128]);
// The final objective has a physical radio, distinct from the optional recorder.
const finalRadio=new THREE.Group();scene.add(finalRadio);
finalRadio.position.set(0,.7,-128);
box(.95,.48,.48,mat(0x34453c),finalRadio,[0,.24,0]);
box(.38,.25,.025,mat(0x171e19),finalRadio,[-.2,.26,.255]);
for(let i=0;i<4;i++)box(.32,.018,.035,mat(0x788573),finalRadio,[-.2,.17+i*.055,.27]);
box(.22,.09,.03,mat(0xc0bd8a,{emissive:0x454220}),finalRadio,[.24,.34,.26]);
box(.09,.09,.06,mat(0x222724),finalRadio,[.25,.17,.28]);
box(.025,1.1,.025,mat(0x9aa59d),finalRadio,[-.35,1.01,-.12]);
const finalRadioLamp=box(.09,.07,.04,mat(0x68e8b2,{emissive:0x225c3b}),finalRadio,[.24,.45,.26]);
const finalRadioBeacon=new THREE.Mesh(new THREE.RingGeometry(.95,1.08,40),mat(0x68e8b2,{emissive:0x225c3b,side:THREE.DoubleSide}));
finalRadioBeacon.rotation.x=-Math.PI/2;finalRadioBeacon.position.set(0,.05,-128);
finalRadioBeacon.visible=false;scene.add(finalRadioBeacon);
const lastStandRecorder=box(.36,.16,.28,mat(0x4d514b,{emissive:0x252b22}),scene,[-2.5,.16,-125.7]);
let lastStandRecordingFound=false;
// The radio's last pursuer waits beyond the inner gate.
const finalPursuer=new THREE.Group();scene.add(finalPursuer);
finalPursuer.position.set(0,0,-125.5);
const finalCoat=mat(0x373e43),finalSkin=mat(0x9d8069);
box(.76,.96,.45,finalCoat,finalPursuer,[0,1.2,0]);
box(.35,.35,.33,finalSkin,finalPursuer,[0,1.88,0]);
box(.55,.16,.46,finalCoat,finalPursuer,[0,2.12,0]);
for(const side of [-1,1]){
  box(.2,.78,.22,finalCoat,finalPursuer,[side*.47,1.17,0]);
  box(.23,.75,.26,finalCoat,finalPursuer,[side*.2,.4,0]);
}
const finalPursuerBlocker={x:0,y:1.25,z:-125.5,halfX:.49,halfZ:.4,type:'enemy'};
blockers.push(finalPursuerBlocker);
let finalPursuerAlive=true,finalPursuerAttackCooldown=0;
let finalChargeWindup=0,finalChargeTime=0;
let finalConfrontationTime=0,finalConfrontationBeat=-1;
function updateFinalConfrontation(dt){
  if(finalConfrontationTime<=0)return false;
  const beat=Math.min(2,Math.floor((12-finalConfrontationTime)/4));
  if(beat!==finalConfrontationBeat){
    finalConfrontationBeat=beat;
    const lines=[
      museumGuardRecalled?'ORDERLY, ON RADIO: Your escort is outside, David. You found a way past him without firing. You can still come back.':'ORDERLY, ON RADIO: David, I lost the museum escort. I am still here. Put the gun down and listen.',
      'DAVY: Then tell your man to stand aside. ORDERLY: What man? David, who are you looking at?',
      'RACCOON: He is lowering his shoulder. Move when he commits. We can argue with the radio afterward.'
    ];
    showStoryBeat(lines[beat],4);
  }
  finalConfrontationTime=Math.max(0,finalConfrontationTime-dt);
  return true;
}
const finalChargeTarget=new THREE.Vector3(),finalChargeStart=new THREE.Vector3();
const finalChargeWarning=new THREE.Mesh(new THREE.RingGeometry(.8,1.2,32),mat(0xff5544,{emissive:0x992211,side:THREE.DoubleSide}));
finalChargeWarning.rotation.x=-Math.PI/2;
finalChargeWarning.visible=false;scene.add(finalChargeWarning);
box(.12,2.8,.12,mat(0x483d38),scene,[-2.8,1.4,-127]);
box(.12,2.8,.12,mat(0x483d38),scene,[2.8,1.4,-127]);
let lastStandChoice=null;
const endingChoices=document.querySelector('#endingChoices');
const epilogue=document.querySelector('#epilogue');
let epilogueBeat=0,epilogueLines=[];
function advanceEpilogue(){
  document.querySelector('#epilogueText').textContent=epilogueLines[epilogueBeat];
  document.querySelector('#epilogueNext').hidden=epilogueBeat===epilogueLines.length-1;
  document.querySelector('#epilogueReplay').hidden=epilogueBeat!==epilogueLines.length-1;
  document.querySelector('#epilogueProgress').textContent=`${epilogueBeat+1} / ${epilogueLines.length}`;
  epilogue.scrollTop=0;
}
document.querySelector('#epilogueNext').addEventListener('click',()=>{epilogueBeat=Math.min(epilogueBeat+1,epilogueLines.length-1);advanceEpilogue();if(epilogueBeat===epilogueLines.length-1)document.querySelector('#epilogueReplay').focus({preventScroll:true});});
document.querySelector('#epilogueReplay').addEventListener('click',()=>{clearResume();location.reload();});
function chooseEnding(choice){
  if(wakeStage<22||raccoonView||campaignEnded)return;
  campaignEnded=true;
  finalRadioBeacon.visible=false;
  finalRadioLamp.material.emissiveIntensity=choice===2?2:0;
  clearResume();
  lastStandChoice=choice===1?'leave the mission behind':'answer the radio';
  if(!campaignRecord.endings.includes(choice)){campaignRecord.endings.push(choice);updateCampaignRecord();}
  showStoryBeat(choice===1?'DAVY: The Alamo can wait. I have to find out who I was before I woke up.':'DAVY: If anyone is still out there, they get one last warning. Then I come home.',9);
  stateLabel.textContent='THE LAST STAND — END';
  endingChoices.hidden=true;
  epilogue.dataset.choice=String(choice);
  document.querySelector('#epilogueTitle').textContent=choice===1?'THE ROAD OUT':'ONE LAST TRANSMISSION';
  epilogueLines=choice===1?[
    'Davy lowers the shotgun. Beyond the mission walls, a county road runs toward pale morning light. The raccoon is already waiting at the verge.',
    museumGuardRecalled?'A security van idles beyond the fence. The man from the museum raises an empty hand. Davy keeps walking.':'A radio calls for a missing museum escort. Davy turns the volume down. The road does not answer for him.',
    'RACCOON: What do I call you now? DAVY: Ask me when we get home. Behind them, the mission bell rings once. Neither looks back.'
  ]:[
    'Davy sets the shotgun beside the radio and presses TRANSMIT. DAVY: Anyone still out there? This is... David. I think.',
    museumGuardRecalled?'ORDERLY: Your escort made it outside. We can come for you, too. Leave the weapon where it is.':'ORDERLY: I can hear you, David. Leave the weapon where it is. Tell me what you can see.',
    'DAVY: A road. A mission. A raccoon stealing something off your desk. A laugh cuts through the static, or a cough. Then a voice says: Stay with me.'
  ];
  epilogueBeat=0;epilogue.hidden=false;advanceEpilogue();
  document.querySelector('#epilogueNext').focus({preventScroll:true});
  document.exitPointerLock?.();
}
document.querySelector('#leaveChoice').addEventListener('click',()=>chooseEnding(1));
document.querySelector('#radioChoice').addEventListener('click',()=>chooseEnding(2));
// Deep tunnel blockers
for(const [x,z,hx,hz] of [[3.5,-99,0.15,6],[3.5,-111.5,0.15,1.5],[10.5,-94,0.15,1],[10.5,-105,0.15,8],[7,-113,4,0.15]])
  blockers.push({x,y:1.75,z,halfX:hx,halfZ:hz,type:'tunnel'});
// Tunnel enemy in deep section.
const tunnelEnemy=new THREE.Group();scene.add(tunnelEnemy);
tunnelEnemy.position.set(7,0,-105);
const tunnelEnemyCoat=mat(0x3d4f4a),tunnelEnemySkin=mat(0x9d7b5d),tunnelEnemyCap=mat(0x2a3032);
box(.68,.88,.38,tunnelEnemyCoat,tunnelEnemy,[0,1.22,0]);
box(.34,.34,.32,tunnelEnemySkin,tunnelEnemy,[0,1.86,0]);
box(.46,.12,.42,tunnelEnemyCap,tunnelEnemy,[0,2.08,0]);
for(const side of [-1,1]){
  box(.18,.74,.22,tunnelEnemyCoat,tunnelEnemy,[side*.45,1.2,0]);
  box(.22,.72,.25,tunnelEnemyCoat,tunnelEnemy,[side*.18,.40,0]);
}
const tunnelEnemyBlocker={x:7,y:1.25,z:-105,halfX:.45,halfZ:.35,type:'enemy'};
blockers.push(tunnelEnemyBlocker);
let tunnelEnemyAlive=true;
let tunnelEnemyAttackCooldown=1.5;
let tunnelAttackWindup=0;
let tunnelVolleyShots=0;
const tunnelAttackTarget=new THREE.Vector3();
const tunnelWarning=new THREE.Mesh(new THREE.RingGeometry(.72,1.05,24),mat(0xff7722,{emissive:0x994411,side:THREE.DoubleSide}));
tunnelWarning.rotation.x=-Math.PI/2;
tunnelWarning.visible=false;
scene.add(tunnelWarning);
// Maintenance welder: stationary area denial at the west exit, distinct from the sentry volley.
const tunnelWelder=new THREE.Group();scene.add(tunnelWelder);
tunnelWelder.position.set(1.2,0,-109.2);
const welderCoat=mat(0x987037),welderMask=mat(0x263238);
box(.78,.95,.48,welderCoat,tunnelWelder,[0,1.15,0]);
box(.46,.46,.38,welderMask,tunnelWelder,[0,1.88,0]);
box(.30,.10,.03,mat(0xffb744,{emissive:0xcc6622}),tunnelWelder,[0,1.9,.21]);
for(const side of [-1,1])box(.24,.7,.28,welderCoat,tunnelWelder,[side*.22,.4,0]);
box(.18,.18,.85,welderMask,tunnelWelder,[.5,1.05,.5]);
const tunnelWelderBlocker={x:1.2,y:1.25,z:-109.2,halfX:.5,halfZ:.4,type:'enemy'};
blockers.push(tunnelWelderBlocker);
let tunnelWelderAlive=true,welderPhase='idle',welderTimer=1.2,welderHit=false,welderIntroduced=false;
const welderSweep=box(3,.035,2,mat(0xffbb33,{emissive:0x885511,transparent:true,opacity:.5}),scene,[1.2,.07,-107.5]);
welderSweep.visible=false;
// A costumed museum guard closes on Davy through the exhibit hall. His modern
// earpiece leaves it unclear whether this is a reenactment or a real pursuit.
const museumGuard=new THREE.Group();scene.add(museumGuard);
// Start inside the staff doorway, clear of its inflated collision jamb.
museumGuard.position.set(-1,0,-69);
const guardCoat=mat(0x6b4938),guardSkin=mat(0xb18b69),guardHat=mat(0x352b27);
box(.72,.9,.42,guardCoat,museumGuard,[0,1.2,0]);
box(.34,.34,.32,guardSkin,museumGuard,[0,1.86,0]);
box(.8,.12,.55,guardHat,museumGuard,[0,2.07,0]);
box(.45,.3,.42,guardHat,museumGuard,[0,2.25,0]);
box(.13,.1,.08,mat(0xb4b8bf,{emissive:0x292e36}),museumGuard,[.23,1.87,0]);
for(const side of [-1,1]){
  box(.2,.75,.22,guardCoat,museumGuard,[side*.46,1.18,0]);
  box(.22,.72,.25,guardCoat,museumGuard,[side*.2,.4,0]);
}
const museumGuardBlocker={x:-1,y:1.25,z:-69,halfX:.48,halfZ:.38,type:'enemy'};
blockers.push(museumGuardBlocker);
let museumGuardAlive=true,museumGuardAttackCooldown=0,museumGuardWindup=0;
const museumBaton=box(.12,.9,.12,mat(0x252c35),museumGuard,[.52,1.2,.2]);
const museumGuardWarning=new THREE.Mesh(new THREE.RingGeometry(2.05,2.2,32),mat(0xffcc44,{emissive:0x886611,side:THREE.DoubleSide}));
museumGuardWarning.rotation.x=-Math.PI/2;
museumGuardWarning.position.y=.055;
museumGuardWarning.visible=false;
museumGuard.add(museumGuardWarning);
// First mission beat: destruction exposes a reason to use the raccoon.
const objectiveLabel=document.querySelector('#objective');
// A small, versioned record survives reloads without restoring a half-mutated scene.
const recordKey='alamo-campaign-record-v1';
const recordLabel=document.createElement('div');
recordLabel.id='campaignRecord';
document.querySelector('#chapter').after(recordLabel);
const clueIds=['ward','station','motel','museum','pager','service','lastStand'];
let campaignRecord={chapter:1,clues:[],endings:[]};
try{
  const saved=JSON.parse(localStorage.getItem(recordKey));
  if(saved&&typeof saved==='object'){
    campaignRecord.chapter=Number.isInteger(saved.chapter)?Math.max(1,Math.min(5,saved.chapter)):1;
    campaignRecord.clues=Array.isArray(saved.clues)?clueIds.filter(id=>saved.clues.includes(id)):[];
    campaignRecord.endings=Array.isArray(saved.endings)?[1,2].filter(id=>saved.endings.includes(id)):[];
  }
}catch{}
function updateCampaignRecord(){
  recordLabel.textContent=`RECORD ${campaignRecord.chapter}/5 · CLUES ${campaignRecord.clues.length}/${clueIds.length} · ENDINGS ${campaignRecord.endings.length}/2`;
  try{localStorage.setItem(recordKey,JSON.stringify(campaignRecord));}catch{}
}
function recordClue(id){
  if(!campaignRecord.clues.includes(id)){campaignRecord.clues.push(id);updateCampaignRecord();}
}
updateCampaignRecord();
let wakeStage=0;
let shotgunRecovered=false;
const wardShotgun=new THREE.Group();scene.add(wardShotgun);
wardShotgun.position.set(0,.75,-1.8);
box(.2,.16,.62,mat(0x725038),wardShotgun,[0,0,.24]);
for(const side of [-1,1])box(.075,.075,.9,mat(0xa6adb4),wardShotgun,[side*.045,.04,-.42]);
const shotgunPickupRing=new THREE.Mesh(new THREE.RingGeometry(.48,.58,24),mat(0xffd36a,{emissive:0x775522,side:THREE.DoubleSide}));
shotgunPickupRing.rotation.x=-Math.PI/2;shotgunPickupRing.position.set(0,.045,-1.8);scene.add(shotgunPickupRing);
objectiveLabel.textContent='Recover the shotgun in the gold circle ahead. Walk with WASD or the left touch pad.';
let wardChartFound=false;
let campaignEnded=false;
const storyLabel=document.querySelector('#storyBeat');
let storyTime=0,storyIndex=0,storyHideAt=0;
const prologue=document.querySelector('#prologue');
let prologuePhase=-1;
function updatePrologue(){
  if(prologue.hidden)return;
  const phase=storyTime<1.4?0:storyTime<1.85?1:storyTime<2.8?2:3;
  if(phase!==prologuePhase){
    prologuePhase=phase;
    prologue.className=['','impact','blackout','waking'][phase];
    prologue.querySelector('.caption').textContent=[
      'COUNTY ROAD 13 · BEFORE THE WAKE',
      'BRAKES. GLASS. A SECOND SHAPE IN THE SEAT.',
      'DAVY: Where did you go?',
      'COUNTY WARD · ELEVEN DAYS LATER'
    ][phase];
  }
  if(storyTime>=3.5)prologue.hidden=true;
}
function skipPrologue(){prologue.hidden=true;}
window.addEventListener('keydown',skipPrologue,{once:true});
window.addEventListener('pointerdown',skipPrologue,{once:true});
const awakeningBeats=[
  {at:4.0,line:'COUNTY PA: Patient David Crockett, awake after eleven days.'},
  {at:7.8,line:'DAVY: Eleven days? Then we best make up some ground.'},
  {at:11.6,line:'COUNTY PA: Evacuate the east wing. Do not use the north lift.'},
];
function showStoryBeat(line,duration=3.3){
  storyLabel.textContent=line;storyLabel.classList.add('visible');storyHideAt=storyTime+duration;
}
const serviceSwitch=box(.35,.22,.3,mat(0x9e3b35,{emissive:0x33100c}),scene,[-6.4,.18,-6.4]);
const wardSwitchRing=new THREE.Mesh(new THREE.RingGeometry(.42,.54,24),mat(0xffd36a,{emissive:0x775522,side:THREE.DoubleSide}));
wardSwitchRing.rotation.x=-Math.PI/2;wardSwitchRing.position.set(-6.4,.045,-6.4);wardSwitchRing.visible=false;scene.add(wardSwitchRing);
const exitLamp=box(.6,.14,.12,mat(0x66563c,{emissive:0x1b150a}),scene,[4,2.96,-7.83]);
function advanceWake(stage,line){
  if(stage<=wakeStage)return;
  wakeStage=stage;
  if(stage>0)storyIndex=awakeningBeats.length;
  objectiveLabel.textContent=line;
  const chapter=stage>=19?5:stage>=14?4:stage>=11?3:stage>=5?2:1;
  if(chapter>campaignRecord.chapter){campaignRecord.chapter=chapter;updateCampaignRecord();}
  if(stage===5)document.querySelector('#chapter').textContent='MILE MARKER 13 / 02';
  if(stage===11)document.querySelector('#chapter').textContent='THE REPUBLIC / 03';
  if(stage===14)document.querySelector('#chapter').textContent='UNDER THE MISSION / 04';
  if(stage===15)document.querySelector('#chapter').textContent='UNDER THE MISSION / 04';
  if(stage===19)document.querySelector('#chapter').textContent='THE LAST STAND / 05';
  if(stage===2){serviceSwitch.material.color.setHex(0x4a9665);exitLamp.material.color.setHex(0x7bdb9c);}
  if(stage===3){serviceDoor.visible=false;blockers.splice(blockers.findIndex(b=>b.type==='door'),1);}
  if(stage===7){stationSwitch.material.color.setHex(0x4a9665);stationShutter.visible=false;blockers.splice(blockers.indexOf(shutterBlocker),1);}
  if(stage===9){motelSignPost.visible=true;motelDoor.visible=true;}
  if(stage===12){showStoryBeat('ORDERLY, OVER PA: David. We met in the ward. Stay in the exhibit; I am coming down. DAVY: That voice again.',8);hatOnStand.material.emissive.setHex(0xffcc00);vestOnHook.material.emissive.setHex(0xffcc00);}
  if(stage===13){exhibitBTitle.material.emissive.setHex(0xffaa00);}
  if(stage===14){museumGateSwitch.material.color.setHex(0x4a9665);museumGate.visible=false;blockers.splice(blockers.indexOf(museumGateBlocker),1);}
  if(stage===14){tunnelPlaque.material.emissive.setHex(0xcc8800);showStoryBeat(museumGuardRecalled?'ORDERLY, OVER PA: You sent my escort outside. He is safe. David, the stairs are not an exit.':'ORDERLY, OVER PA: My escort is not answering. David, stop. Those stairs go under the mission.',8);}
  if(stage===16){stateLabel.textContent='Deep tunnel passage secured — press R';}
  if(stage===17){conduitSwitch.material.color.setHex(0x4a9665);maintenancePassage.visible=false;blockers.splice(blockers.indexOf(maintenanceBlocker),1);}
  if(stage===18){stateLabel.textContent='Maintenance passage clear — press R';}
  if(stage===21){finalConfrontationTime=12;finalConfrontationBeat=-1;}
  if(stage===20){lastStandSwitch.material.color.setHex(0x4a9665);lastStandGate.visible=false;blockers.splice(blockers.indexOf(lastStandGateBlocker),1);}
  if([5,11,14,19].includes(stage)&&!restoringCheckpoint)saveCheckpoint(stage);
  if(stage===22){stateLabel.textContent='Choose what Davy does next (1 or 2)';endingChoices.hidden=false;document.exitPointerLock?.();}
}
function crate(x,z,size=1.4,missionBarricade=false){
  const parts=[box(size,size,size,wood,scene,[x,size/2,z])];
  for(const s of [-1,1]){
    parts.push(box(size+.03,.10,.12,edge,scene,[x,size*.3,z+s*size*.505]));
    parts.push(box(size+.03,.10,.12,edge,scene,[x,size*.7,z+s*size*.505]));
  }
  blockers.push({x,z,halfX:size/2,halfZ:size/2,y:size/2,type:'crate',parts,size,missionBarricade});
}
crate(0,-3.5,1.4,true);crate(4.8,4.2,1.25);crate(5.0,-3.8,.95);
// Forecourt supply crate: optional destructible cover beside the main route.
crate(2,-30,1.8);
// Break the supply barricade before the raccoon can release the final gate.
crate(0,-120,2.2);
const finalBarricade=blockers[blockers.length-1];
let finalBarricadeCleared=false;
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

// The first roadside threat waits beyond the pumps until Davy leaves the ward.
// Keep its collision and shotgun bounds together as it moves.
const roadsideEnemy=new THREE.Group();scene.add(roadsideEnemy);
roadsideEnemy.position.set(4,0,-34);
const enemyCoat=mat(0x465b55),enemySkin=mat(0xb18b69),enemyCap=mat(0x353b39);
box(.68,.88,.38,enemyCoat,roadsideEnemy,[0,1.22,0]);
box(.34,.34,.32,enemySkin,roadsideEnemy,[0,1.86,0]);
box(.46,.12,.42,enemyCap,roadsideEnemy,[0,2.08,0]);
for(const side of [-1,1]){
  box(.18,.74,.22,enemyCoat,roadsideEnemy,[side*.45,1.2,0]);
  box(.22,.72,.25,enemyCoat,roadsideEnemy,[side*.18,.40,0]);
}
const enemyBlocker={x:4,y:1.25,z:-34,halfX:.45,halfZ:.35,type:'enemy'};
blockers.push(enemyBlocker);
let enemyAlive=true;
// A damaged fuel drum gives the roadside fight a destructible hazard.
const fuelDrum=new THREE.Group();scene.add(fuelDrum);
fuelDrum.position.set(6.35,0,-29.5);
const drumPaint=mat(0x9b5035),drumRim=mat(0x3b3633);
cyl(.4,.4,1.15,drumPaint,fuelDrum,[0,.58,0],10);
cyl(.42,.42,.09,drumRim,fuelDrum,[0,.12,0],10);
cyl(.42,.42,.09,drumRim,fuelDrum,[0,1.06,0],10);
const fuelDrumBlocker={x:6.35,y:.58,z:-29.5,halfX:.42,halfZ:.42,type:'hazard'};
blockers.push(fuelDrumBlocker);
const fuelBlastRadius=3.5;
const fuelWarning=new THREE.Mesh(new THREE.RingGeometry(fuelBlastRadius-.12,fuelBlastRadius,40),mat(0xff7733,{emissive:0x773311,side:THREE.DoubleSide}));
fuelWarning.rotation.x=-Math.PI/2;fuelWarning.position.set(6.35,.04,-29.5);scene.add(fuelWarning);
// Keep the low station vent clear while retaining cover inside the blast radius.
crate(6.35,-30.8,1.1);
let health=100,enemyAttackCooldown=0,defeated=false;
const healthLabel=document.querySelector('#health');
const retryButton=document.querySelector('#retryBtn');
retryButton.addEventListener('click',()=>location.reload());
function takeHit(){
  if(defeated)return;
  health=Math.max(0,health-25);
  healthLabel.textContent=`HEALTH ${health}`;
  healthLabel.style.color=health<=25?'#ff7777':'#fff1ca';
  if(health===0){
    defeated=true;
    stateLabel.textContent='Davy is down';
    objectiveLabel.textContent='Press Enter to return to your last chapter checkpoint.';
    retryButton.style.display='block';
    document.exitPointerLock?.();
  }else{
    stateLabel.textContent='Hit! Back away or blast the attacker.';
    showStoryBeat('DAVY: That smarts more than it ought to.',1.5);
  }
}

const controls={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',jump:'Space',reload:'KeyR',transform:'KeyQ'};
const feel={mouseSensitivity:.0025,aimSensitivity:.0014,minPitch:-1.22,maxPitch:1.05,cameraDistance:5.4,shoulderOffset:.65,aimDistance:2.9,zoomSpeed:10,followSpeed:12,turnSpeed:11,aimMoveSpeed:2.2};
const keys=new Set();
const touchUI=document.querySelector('#touchControls'),touchToggle=document.querySelector('#touchToggle');
let touchMoveX=0,touchMoveY=0,touchLookId=null,touchLookX=0,touchLookY=0,movePointerId=null;
function museumGuardBlocked(x,z){
  return blockers.some(b=>b!==museumGuardBlocker&&b.type!=='debris'&&
    Math.abs(x-b.x)<b.halfX+.45&&Math.abs(z-b.z)<b.halfZ+.45);
}
function museumGuardClear(ax,az,bx,bz){
  const steps=Math.ceil(Math.hypot(bx-ax,bz-az)/.2);
  for(let i=1;i<=steps;i++)if(museumGuardBlocked(ax+(bx-ax)*i/steps,az+(bz-az)*i/steps))return false;
  return true;
}
let museumPathTimer=0,museumPath=[],museumPathGoal={x:0,z:0};
function museumGuardRoute(){
  // Bounded half-metre grid routes through the actual exhibit/staff doorways.
  const sx=museumGuard.position.x,sz=museumGuard.position.z;
  const queue=[{x:sx,z:sz,parent:-1}],seen=new Set(['0,0']);
  for(let i=0;i<queue.length&&i<3000;i++){
    const n=queue[i];
    if(Math.hypot(n.x-player.position.x,n.z-player.position.z)<1&&
       museumGuardClear(n.x,n.z,player.position.x,player.position.z)){
      const path=[];for(let j=i;j>0;j=queue[j].parent)path.unshift(queue[j]);return path;
    }
    for(const [dx,dz] of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){
      const x=n.x+dx,z=n.z+dz,key=Math.round((x-sx)*2)+','+Math.round((z-sz)*2);
      if(x< -5||x>11||z< -80||z> -60||seen.has(key))continue;
      seen.add(key);if(!museumGuardClear(n.x,n.z,x,z))continue;
      queue.push({x,z,parent:i});
    }
  }
  return [];
}

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
window.addEventListener('keydown',e=>{if(resumePending)return;if(defeated){if(e.code==='Enter')location.reload();return;}if(e.code==='Digit1'||e.code==='Digit2'){chooseEnding(e.code==='Digit1'?1:2);return;}keys.add(e.code);if([controls.jump,controls.reload,controls.transform,'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code===controls.reload)beginReload();if(e.code===controls.transform&&!e.repeat&&!raccoonTransition)beginRaccoonTransition(raccoonView?'return':'enter');});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();aiming=false;aimButtonHeld=false;});
let ammo=0,reload=0,fireCooldown=0,flash=0,walk=0,yaw=Math.PI,vertical=0,velocityY=0;
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
  if(b===fuelDrumBlocker){
    if(!blockers.includes(b))return;
    blockers.splice(blockers.indexOf(b),1);
    scene.remove(fuelDrum);scene.remove(fuelWarning);
    burst(new THREE.Vector3(b.x,.7,b.z),0xe89136,24,.22,forward);
    stateLabel.textContent='Fuel drum burst — press R';
    if(enemyAlive&&Math.hypot(enemyBlocker.x-b.x,enemyBlocker.z-b.z)<fuelBlastRadius)
      breakObject(enemyBlocker,forward);
    for(const cover of [...blockers]){
      if(cover.type==='crate'&&Math.hypot(cover.x-b.x,cover.z-b.z)<fuelBlastRadius)breakObject(cover,forward);
    }
    if(Math.hypot(player.position.x-b.x,player.position.z-b.z)<fuelBlastRadius)takeHit();
    if(!defeated)showStoryBeat('RADIO: Fuel fire! Keep outside the orange perimeter.',4);
  }else if(b.type==='enemy'){
    if(b===wardOrderlyBlocker){
      wardOrderlyAlive=false;
      blockers.splice(blockers.indexOf(b),1);
      scene.remove(wardOrderly);
      burst(new THREE.Vector3(b.x,1.35,b.z),0xa52c2c,14,.17,forward);
      showStoryBeat('ORDERLY: David, stay in the ward. The road is not safe.',5);
      stateLabel.textContent='Hospital corridor clear — press R';
    }else if(b===enemyBlocker){
      enemyAlive=false;
      blockers.splice(blockers.indexOf(b),1);
      scene.remove(roadsideEnemy);
      burst(new THREE.Vector3(b.x,1.35,b.z),0xa52c2c,18,.19,forward);
      for(const side of [-1,1])fragment(new THREE.Vector3(b.x+side*.25,1.4,b.z),0x465b55,.28,new THREE.Vector3(side*3,3,-2));
      stateLabel.textContent='Roadside attacker down — press R';
      if(wakeStage===5){
        advanceWake(6,'The station shutter is down. Send the raccoon through the low vent beside it (Q).');
        if(roadsideFoamActive)advanceWake(7,'The forecourt is clear. The raccoon already opened the station; go inside.');
      }
    }else if(b===tunnelWelderBlocker){
      tunnelWelderAlive=false;welderSweep.visible=false;welderPhase='idle';
      blockers.splice(blockers.indexOf(b),1);scene.remove(tunnelWelder);
      burst(new THREE.Vector3(b.x,1.35,b.z),0x987037,14,.17,forward);
      showStoryBeat('RACCOON: Hot work permit revoked.',3);
    }else if(b===tunnelEnemyBlocker){
      tunnelEnemyAlive=false;
      tunnelWarning.visible=false;tunnelAttackWindup=0;tunnelVolleyShots=0;
      blockers.splice(blockers.indexOf(b),1);
      scene.remove(tunnelEnemy);
      burst(new THREE.Vector3(b.x,1.35,b.z),0xa52c2c,18,.19,forward);
      for(const side of [-1,1])fragment(new THREE.Vector3(b.x+side*.25,1.4,b.z),0x465b55,.28,new THREE.Vector3(side*3,3,-2));
      advanceWake(16,'Deep tunnel secured. Industrial passage ahead.');
    }else if(b===museumGuardBlocker){
      museumGuardAlive=false;museumGuardWindup=0;museumGuardWarning.visible=false;
      blockers.splice(blockers.indexOf(b),1);
      scene.remove(museumGuard);
      burst(new THREE.Vector3(b.x,1.35,b.z),0xa52c2c,16,.18,forward);
      for(const side of [-1,1])fragment(new THREE.Vector3(b.x+side*.25,1.4,b.z),0x6b4938,.26,new THREE.Vector3(side*3,3,-2));
      stateLabel.textContent='Museum pursuer down — press R';
      showStoryBeat('RADIO: Escort lost in the exhibit hall. Seal the lower stairs.',4);
    }else if(b===finalPursuerBlocker){
      finalPursuerAlive=false;finalConfrontationTime=0;finalChargeWindup=0;finalChargeTime=0;finalChargeWarning.visible=false;
      blockers.splice(blockers.indexOf(b),1);
      scene.remove(finalPursuer);
      burst(new THREE.Vector3(b.x,1.35,b.z),0x943333,18,.19,forward);
      showStoryBeat('RADIO: David, the exit is yours. What happens next is your call.',5);
      stateLabel.textContent='Final pursuer down — press R';
    }
  }else if(b.type==='wall'){
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
    if(b===finalBarricade){
      finalBarricadeCleared=true;
      if(wakeStage===19){
        objectiveLabel.textContent='Gap cleared. Reload, then send the raccoon under the gate to its left-hand switch.';
        showStoryBeat('RADIO: That was the last supply crate. DAVY: Then we travel light.',7);
      }
    }
    if(wakeStage===0&&b.missionBarricade)advanceWake(1,'The north service door needs power. Send the raccoon to the floor switch in the northwest corner (Q).');
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
  if(!touchUI.classList.contains('on'))canvas.requestPointerLock?.();
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
    if(p>=1){raccoonModel.visible=false;raccoonModel.scale.setScalar(1);raccoonView=true;raccoonTransition=null;camera.position.set(raccoonPosition.x,.42,raccoonPosition.z);camera.rotation.order='YXZ';camera.rotation.set(raccoonPitch,raccoonYaw,0);stateLabel.textContent='Raccoon view — Q to return';if(!touchUI.classList.contains('on'))canvas.requestPointerLock?.();}
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
    if(p>=1){raccoonModel.visible=false;raccoonModel.scale.setScalar(1);raccoonTransition=null;raccoonView=false;coonskinCap.visible=true;if(raccoonGLBModel)raccoonGLBModel.visible=true;aiming=false;aimBlockedUntilRelease=aimButtonHeld;camera.position.copy(normalCamera);camera.rotation.order='YXZ';camera.rotation.set(cameraPitch,cameraYaw,0);stateLabel.textContent='Ready';if(!touchUI.classList.contains('on'))canvas.requestPointerLock?.();}
  }
  return true;
}
function beginReload(){if(!shotgunRecovered)return;if(ammo===2||reload>0)return;reload=.001;play(triggerSound);stateLabel.textContent='Breaking the shotgun open';}
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
  const halfY=obstacle.type==='wall'?.42:obstacle.type==='crate'?obstacle.size/2:obstacle.type==='target'?.65:obstacle.type==='door'?1.4:obstacle.type==='enemy'?1.05:obstacle.type==='hazard'?.58:obstacle.type==='station'?1.55:obstacle.type==='motel'?1.6:obstacle.type==='museum'?1.75:obstacle.type==='exhibit'?1.6:obstacle.type==='tunnel'?1.75:obstacle.type==='passage'?1.3:obstacle.type==='shutter'?1.35:obstacle.type==='vent'?.35:obstacle.type==='ventTop'?1.1:obstacle.type==='lastStandWall'?1.4:obstacle.type==='raccoonGap'?1.8:Math.max(.13,obstacle.item.size/2);
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
  if(!shotgunRecovered){stateLabel.textContent='Recover the shotgun from the gold circle first';return;}
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
function blocked(x,z,raccoon=false){
  if(wakeStage===3&&wardOrderlyAlive&&!raccoon&&x>=2.45&&x<=5.55&&z< -13.3&&z>=-15.55)return true;
  if(z<-113&&z>=-127&&(Math.abs(x)>3.35))return true;
  const inRoom=Math.abs(x)<=7.55&&z<=7.55&&z>=-7.55;
  const inCorridor=x>=2.45&&x<=5.55&&z<-7.55&&z>=-15.55;
  const onRoad=x>=.2&&x<=7.8&&z<-15.55&&z>=-54.1;
  const inStation=x>6.5&&x<=13.2&&z>=-35.8&&z<=-32.2;
  const inMuseum=Math.abs(x)<=8&&z<-54.1&&z>=-83;
  const inTunnels=(Math.abs(x)<=8&&z<-83)||(x>=7&&x<=14.25&&z>-97.75&&z< -94.25);
  if(!inRoom&&!inCorridor&&!onRoad&&!inStation&&!inMuseum&&!inTunnels)return true;
  // Loose fragments react to shots but never pin the player in place.
  return blockers.some(b=>b.type!=='debris'&&!(raccoon&&(b.type==='vent'||b.type==='ventTop'||b.type==='raccoonGap'))&&Math.abs(x-b.x)<b.halfX+(raccoon?.12:.23)&&Math.abs(z-b.z)<b.halfZ+(raccoon?.12:.23));
}
function solidSurfaces(){
  return [floor,corridorFloor,...wallTiles.map(b=>b.mesh),...blockers.filter(b=>b.type==='crate').flatMap(b=>b.parts),...targets.filter(t=>t.group.parent).flatMap(t=>t.group.children),...(fuelDrum.parent?fuelDrum.children:[]),...(wardOrderlyAlive?wardOrderly.children:[]),...(enemyAlive?roadsideEnemy.children:[]),...(tunnelEnemyAlive?tunnelEnemy.children:[]),...(tunnelWelderAlive?tunnelWelder.children:[]),...(museumGuardAlive&&!museumGuardRecalled?museumGuard.children:[]),...(finalPursuerAlive?finalPursuer.children:[])];
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
  if(resumePending)return;
  if(!tunnelCollapsed&&wakeStage>=16&&wakeStage<19&&!raccoonView&&player.position.z<-101){
    tunnelCollapsed=true;tunnelCollapse.visible=true;
    blockers.push({x:7,y:1.3,z:-99,halfX:3.4,halfZ:.6,type:'tunnel'});
    burst(new THREE.Vector3(7,3,-99),0x847b68,18,.2,new THREE.Vector3(0,-1,0));
    objectiveLabel.textContent='Steam line ruptured! Avoid the amber floor strip. The raccoon fits below the jets; use the conduit switch to shut them off (Q).';
    showStoryBeat('RADIO: Structural failure. David, the maintenance release is still powered. Find the low conduit.',6);
  }
  if(tunnelCollapsed&&tunnelCollapse.position.y>0)tunnelCollapse.position.y=Math.max(0,tunnelCollapse.position.y-dt*6);
  if(defeated||campaignEnded)return;
  // A ruptured overhead line is the second tunnel phase. Its low clearance
  // lets the raccoon reach the shutoff while Davy can sidestep the marked strip.
  tunnelSteam.visible=tunnelCollapsed&&wakeStage===16;
  if(tunnelSteam.visible){
    tunnelSteamTime+=dt;
    const phase=tunnelSteamTime%3.6,venting=phase>=2.2;
    steamWarning.material.color.setHex(venting?0xff5533:0xffbb33);
    for(const jet of steamJets)jet.visible=venting;
    if(!venting)tunnelSteamHit=false;
    if(venting&&!tunnelSteamHit&&!raccoonView&&Math.abs(player.position.x-7)<1.2&&Math.abs(player.position.z+104.5)<1.3){
      tunnelSteamHit=true;takeHit();
      if(!defeated)objectiveLabel.textContent='Scalding steam! Step outside the marked strip or send the raccoon below the jets to the shutoff.';
    }
  }
  storyTime+=dt;
  gun.visible=shotgunRecovered;
  if(!shotgunRecovered){
    wardShotgun.rotation.y=Math.sin(storyTime)*.15;
    ammoLabel.textContent='UNARMED';
    if(prologue.hidden&&!raccoonView&&!raccoonTransition&&Math.hypot(player.position.x,player.position.z+1.8)<.85){
      shotgunRecovered=true;wardShotgun.visible=false;shotgunPickupRing.visible=false;gun.visible=true;ammo=2;
      ammoLabel.textContent='? ?';
      objectiveLabel.textContent='Aim at the wooden barricade ahead. Click or tap Fire to discharge both barrels; R or Reload loads two more shells.';
      showStoryBeat('DAVY: There you are, old friend. RACCOON: That was in an evidence bag.',6);
    }
  }
  updatePrologue();
  wardSwitchRing.visible=wakeStage===1;
  wardSwitchRing.scale.setScalar(1+.08*Math.sin(storyTime*4));
  if(wakeStage===1&&!defeated)objectiveLabel.textContent=raccoonView
    ? 'As the raccoon, follow the gold ring to the floor switch in the northwest corner. Walk onto it to restore power.'
    : 'The service door needs power. Press Q or tap Raccoon, then reach the gold ring in the northwest corner.';
  if(wakeStage<5&&!wardChartFound){
    const listener=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(listener.x+5.6,listener.z-4.8)<1.15){
      wardChartFound=true;
      recordClue('ward');
      showStoryBeat(raccoonView?'CHART: David Crockett. Vehicle collision. Found alone. Patient insists a companion rode with him.':'CHART: David Crockett. Eleven days unconscious. Someone wrote “Davy” beside his name.',8);
    }
  }
  if(wakeStage===10&&!convoyReleased&&raccoonView&&!raccoonTransition&&Math.hypot(raccoonPosition.x-4,raccoonPosition.z+48)<.7){
    convoyReleased=true;convoyRelease.material.color.setHex(0x55bb77);convoyRelease.material.emissive.setHex(0x114422);
    showStoryBeat('RADIO: Manual override received. Moving the evacuation queue. Stay behind the crossing barrier. DAVY: Our scout has cleared their retreat.',8);
    objectiveLabel.textContent='Return to Davy. Wait behind the striped barrier while the evacuation vehicles clear the crossing.';
  }
  if(wakeStage>=10&&convoyReleased&&convoy.visible){
    convoyTime+=dt;
    convoyBeacons.forEach((beacon,i)=>{beacon.visible=Math.sin(convoyTime*12+i*2)>0;});
    convoyVehicles.forEach((vehicle,i)=>{
      const travel=Math.max(0,convoyTime-3-(2-i)*.9);
      vehicle.position.x=4+i*5+Math.min(8,travel)*travel;
    });
    if(convoyTime>=3&&!convoyRadioPlayed){
      convoyRadioPlayed=true;
      showStoryBeat('RADIO: Last transport is leaving. Stay by the motel. DAVY: Reinforcements, retreating? RACCOON: The doors were never open.',7);
      objectiveLabel.textContent='Evacuation traffic is crossing. Wait for the striped barrier to open.';
    }
    if(!convoyCrossingOpen&&convoyVehicles[0].position.x>12){
      convoyCrossingOpen=true;convoyBarrier.visible=false;
      const crossingIndex=blockers.indexOf(convoyBarrierBlocker);if(crossingIndex>=0)blockers.splice(crossingIndex,1);
      objectiveLabel.textContent='The crossing is clear. Follow the road north into the museum entrance.';
      showStoryBeat('RADIO: Crossing clear. That museum is not a shelter. DAVY: Then we shall make it one. RACCOON: They keep telling you where not to go.',8);
    }
    if(convoyTime>10)convoy.visible=false;
  }
  if(prologue.hidden&&wakeStage===0&&storyIndex<awakeningBeats.length&&storyTime>=awakeningBeats[storyIndex].at&&(!storyHideAt||storyTime>=storyHideAt+.8)){
    showStoryBeat(awakeningBeats[storyIndex].line);storyIndex++;
  }
  if(storyHideAt&&storyTime>=storyHideAt){storyLabel.classList.remove('visible');storyHideAt=0;}
  if(wakeStage===1&&raccoonView&&Math.hypot(raccoonPosition.x+6.4,raccoonPosition.z+6.4)<.65)
    advanceWake(2,'The latch clicks. Return to Davy (Q), then reach the lit north door.');
  if(wakeStage===2&&!raccoonView&&!raccoonTransition&&Math.hypot(player.position.x-4,player.position.z+7)<.85)
    advanceWake(3,'The service door opens. An orderly bars the hospital corridor. Clear the way to the exit.');
  if(wakeStage===3&&!raccoonView&&!wardOrderlyAlive&&player.position.z<-14)
    advanceWake(4,'A radio orders the county evacuated. Go through the exit to Mile Marker 13.');
  if(wakeStage===4&&!raccoonView&&player.position.z<-18)
    advanceWake(5,'Mile Marker 13. Fight the attacker, or send the raccoon through the station vent to trigger the foam system.');
  if((wakeStage===5||wakeStage===6)&&raccoonView&&Math.hypot(raccoonPosition.x-9,raccoonPosition.z+32.5)<.55){
    if(!roadsideFoamActive){
      roadsideFoamActive=true;forecourtFoam.visible=true;
      stationSwitch.material.color.setHex(0x4a9665);
      enemyCoat.color.setHex(0xa7b1a4);
      showStoryBeat('RACCOON: Fire suppression. DAVY: Winter has joined our cause. The foamed attacker moves and strikes more slowly.',6);
    }
    if(wakeStage===6)advanceWake(7,'The station shutter rattles open. Return to Davy (Q) and go inside.');
  }
  if(wakeStage===7&&!raccoonView&&player.position.x>8&&player.position.z<-32.2&&player.position.z>-35.8)
    advanceWake(8,'Inside the station. The county evacuation notice points toward the motel.');
  if(wakeStage>=7&&!stationRecordingFound){
    const listener=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(listener.x-12.2,listener.z+35.25)<1.1){
      stationRecordingFound=true;
      recordClue('station');
      stationRecorder.material.emissive.setHex(0x000000);
      showStoryBeat(raccoonView?'RECORDER: Room thirteen is paid through Sunday. No pets. He arrived alone.':'RECORDER: Mr. Crockett left his room key. Said he was expecting company. No one else came.',8);
    }
  }
  if(wakeStage===8&&!raccoonView&&player.position.z<-38.9)
    advanceWake(9,'The County Motel. Collect the brass room key on the center desk to unlock the courtyard exit.');
  if(wakeStage===9&&!motelKeyFound){
    motelKey.rotation.y+=dt*1.8;
    if(!raccoonView&&Math.hypot(player.position.x-4,player.position.z+42)<1.0){
      motelKeyFound=true;motelKey.visible=false;motelExitGate.visible=false;
      const gateIndex=blockers.indexOf(motelExitBlocker);
      if(gateIndex>=0)blockers.splice(gateIndex,1);
      objectiveLabel.textContent='Room 13 key collected. The courtyard exit is unlocked; reach the convoy beyond the motel.';
      showStoryBeat('RADIO: That key was in your pocket when they brought you in. DAVY: Then who left it here?',8);
    }
  }
  if(wakeStage>=9&&!motelRegisterFound){
    const listener=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(listener.x-5.5,listener.z+42)<1.0){
      motelRegisterFound=true;
      recordClue('motel');
      motelRegister.material.emissive.setHex(0x000000);
      showStoryBeat(raccoonView?'REGISTER: Room 13 marked paid. Check-out was 11:00 AM yesterday.':'REGISTER: Room 13. Paid through the 15th. No forwarding address on file.');
    }
  }
  if(wakeStage===9&&motelKeyFound&&!raccoonView&&player.position.z<-47)
    advanceWake(10,'The evacuation queue is stalled. Send the raccoon to the low amber override straight ahead, before the striped crossing barrier.');
  if(wakeStage===10&&convoyCrossingOpen&&!raccoonView&&player.position.z<-54.1)
    advanceWake(11,'The Republic of Yesterday. Follow the hall north, then turn right into Cowboys & Cattlemen through the side opening.');
  if(wakeStage===11&&!raccoonView&&player.position.z<-61.9&&player.position.x>6.2)
    advanceWake(12,'Cowboys & Cattlemen exhibit. A costumed guard closes in from the next hall. Stop him, or send the raccoon to the low amber recall panel in the green staff room across the hall. First aid is inside.');
  updateMuseumContainment(dt);
  if(wakeStage===12&&(!museumGuardAlive||museumGuardRecalled)&&!raccoonView&&player.position.z<-72)
    advanceWake(13,'Alamo Legacy: red floor strip triggers a staged volley. Send the raccoon to the low orange switch on the left to disarm it, then through the grille to the stair release.');
  if(wakeStage>=13&&wakeStage<=14&&!museumTrapDisarmed&&!museumTrapTriggered){
    if(raccoonView&&Math.hypot(raccoonPosition.x-4.7,raccoonPosition.z+73.5)<.65){
      museumTrapDisarmed=true;museumTrapWindup=0;
      museumTrapSwitch.material.color.setHex(0x4a9665);
      museumTrapStrip.material.color.setHex(0x4a9665);
      museumTrapStrip.material.emissive.setHex(0x102b16);
      showStoryBeat('MAINTENANCE: Compressed-air reenactment disabled. DAVY: Fine work. Their artillery is silenced.',7);
    }else if(museumTrapWindup===0&&!raccoonView&&!raccoonTransition&&player.position.x>4.2&&player.position.x<8&&Math.abs(player.position.z+75)<.65&&player.position.y<.5){
      museumTrapWindup=1.2;
      museumTrapStrip.material.color.setHex(0xffcc44);
      museumTrapStrip.material.emissive.setHex(0x886611);
      showStoryBeat('An exhibit relay clicks. RADIO: Off the amber strip, David. Now!',3);
    }
    if(museumTrapWindup>0){
      museumTrapWindup=Math.max(0,museumTrapWindup-dt);
      museumTrapStrip.material.emissiveIntensity=1+.5*Math.sin(museumTrapWindup*25);
      if(museumTrapWindup===0){
        museumTrapTriggered=true;
        museumTrapStrip.material.color.setHex(0x42372d);
        museumTrapStrip.material.emissive.setHex(0x000000);
        for(const x of [4.8,7,9.2])burst(new THREE.Vector3(x,1,-75),0xffcc88,12,.09,new THREE.Vector3(0,1,0));
        if(!raccoonView&&!raccoonTransition&&player.position.x>4.2&&player.position.x<8&&Math.abs(player.position.z+75)<.65&&player.position.y<.5)takeHit();
        if(!defeated)showStoryBeat('A staged rifle volley erupts from the exhibit. RADIO: Those effects were supposed to be disconnected.',7);
      }
    }
  }

  if(wakeStage===13&&raccoonView&&Math.hypot(raccoonPosition.x-7,raccoonPosition.z+80.8)<.65)
    advanceWake(14,'The museum grille opens. Return to Davy (Q) and descend into the service tunnels.');
  if(wakeStage===12&&museumGuardAlive&&!museumGuardRecalled){
    const visitor=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(visitor.x+1,visitor.z+70)<.75){
      if(raccoonView){
        museumGuardRecalled=true;
        museumGuardWindup=0;museumGuardWarning.visible=false;
        museumGuard.visible=false;
        const guardIndex=blockers.indexOf(museumGuardBlocker);
        if(guardIndex>=0)blockers.splice(guardIndex,1);
        museumRecallPanel.material.color.setHex(0x4a9665);
        museumRecallPanel.material.emissive.setHex(0x102b16);
        objectiveLabel.textContent='Escort recalled outside. Return to Davy and continue north to the lower stairs.';
        showStoryBeat('SECURITY: Exterior assistance requested. Escort returning to convoy. ORDERLY: Who touched that panel? DAVY: Our scout has forged new orders.',8);
      }else stateLabel.textContent='Low security recall panel. Send the raccoon to redirect the escort.';
    }
  }
  if(wakeStage>=12&&wakeStage<=14&&!museumFirstAidUsed){
    const visitor=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(visitor.x+1,visitor.z+72)<1){
      if(!raccoonView&&health<100){
        health=Math.min(100,health+25);
        healthLabel.textContent=`HEALTH ${health}`;
        healthLabel.style.color=health<=25?'#ff7777':'#fff1ca';
        museumFirstAidUsed=true;
        museumFirstAid.visible=false;
        showStoryBeat('DAVY: A field hospital. They knew we were coming. RADIO: Staff first aid. Please leave the dressings on.',8);
      }else if(raccoonView){
        stateLabel.textContent='Staff first-aid kit. Bring Davy here if he is hurt.';
      }
    }
  }
  if(wakeStage>=12&&!museumIncidentFound){
    const listener=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(listener.x-7.5,listener.z+66.1)<.9){
      museumIncidentFound=true;
      recordClue('museum');
      museumIncidentCard.material.emissive.setHex(0x000000);
      showStoryBeat(raccoonView?'INCIDENT CARD: David Crockett. County patient. Escort requested before opening.':'INCIDENT CARD: Davy Crockett. Hold him here until the orderly arrives.',8);
    }
  }
  if(wakeStage===14){
    const visitor=raccoonView?raccoonPosition:player.position;
    if(!serviceLogFound&&Math.hypot(visitor.x-13.6,visitor.z+96)<.8){
      serviceLogFound=true;recordClue('service');serviceLog.material.emissive.setHex(0);
      showStoryBeat(raccoonView?'SERVICE LOG: Replica mission. Steam-line inspection overdue. Evacuation drill cancelled at 02:13.':'DAVY: A siege engineer\'s ledger. They knew the walls would fall. RADIO: That is a maintenance room, David.',9);
    }
    if(!serviceAidUsed&&Math.hypot(visitor.x-12.8,visitor.z+97.2)<.85){
      if(!raccoonView&&health<100){
        health=Math.min(100,health+25);healthLabel.textContent=`HEALTH ${health}`;
        healthLabel.style.color=health<=25?'#ff7777':'#fff1ca';
        serviceAidUsed=true;serviceAid.visible=false;
        showStoryBeat('RADIO: Take a breath. Fresh dressings in the service kit. The machinery can wait.',6);
      }else if(raccoonView)stateLabel.textContent='Service first aid. Bring Davy here if he is hurt.';
    }
  }
  if(wakeStage===14&&!raccoonView&&player.position.z<-100)
    advanceWake(15,'Industrial conduits. Machinery hums in the darkness. A figure emerges from the shadows.');
  if(wakeStage>=14&&!orderlyPagerFound){
    const listener=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(listener.x-7.8,listener.z+89.6)<.7){
      orderlyPagerFound=true;
      recordClue('pager');
      orderlyPager.material.emissive.setHex(0x000000);
      showStoryBeat(raccoonView?'PAGER: County orderly. Patient search moved below the replica at 02:13.':'PAGER: Keep David away from the mission doors. He thinks the evacuation is for him.',8);
    }
  }
  if(wakeStage===16&&raccoonView&&Math.hypot(raccoonPosition.x-7,raccoonPosition.z+107.5)<.55)
    advanceWake(17,'Steam pressure released. Maintenance passage activated; return to Davy and take the west exit.');
  if(wakeStage===17&&!raccoonView&&Math.hypot(player.position.x-1.2,player.position.z+107.5)<.9)
    advanceWake(18,'Deep tunnel passage secured. Industrial machinery ahead.');
  if(wakeStage===18&&!raccoonView&&player.position.z<-113)
    advanceWake(19,'The Last Stand. Shoot the wooden supply barricade across the inner gate, then send the raccoon through the low gap.');
  if(wakeStage===19&&finalBarricadeCleared&&raccoonView&&Math.hypot(raccoonPosition.x+2.35,raccoonPosition.z+122.4)<.65)
    advanceWake(20,'The inner gate releases. Return to Davy (Q) and cross the plaza.');
  if(wakeStage===20&&!raccoonView&&player.position.z<-123)
    advanceWake(21,'The radio sent one last pursuer. Stop him before reaching the radio.');
  if(wakeStage>=19&&!lastStandRecordingFound){
    const listener=raccoonView?raccoonPosition:player.position;
    if(Math.hypot(listener.x+2.5,listener.z+125.7)<.8){
      lastStandRecordingFound=true;
      recordClue('lastStand');
      lastStandRecorder.material.emissive.setHex(0x000000);
      showStoryBeat(raccoonView?'RECORDER: The evacuation bus left at dawn. One patient remained in the ward.':'RECORDER: Dispatch called this a drill. The orderly asked why the doors were locked.',8);
    }
  }
  finalRadioBeacon.visible=wakeStage===21&&!finalPursuerAlive;
  finalRadioLamp.material.emissiveIntensity=wakeStage>=21?1+.5*Math.sin(performance.now()*.006):.3;
  if(wakeStage===21&&!finalPursuerAlive&&!raccoonView)
    objectiveLabel.textContent='The plaza is clear. Approach the green-lit radio on the altar.';
  if(wakeStage===21&&!finalPursuerAlive&&!raccoonView&&Math.hypot(player.position.x,player.position.z+128)<1.8)
    advanceWake(22,'Choose Davy’s next step: press 1 to leave, or 2 to answer the radio.');
  if(wakeStage===3&&wardOrderlyAlive&&!raccoonView&&health>0){
    const distance=Math.hypot(player.position.x-4,player.position.z+12.6);
    if(wardOrderlyWindup>0){
      wardOrderlyWindup=Math.max(0,wardOrderlyWindup-dt);
      wardOrderlyWarning.material.emissiveIntensity=1+.5*Math.sin(wardOrderlyWindup*24);
      if(wardOrderlyWindup===0){
        wardOrderlyWarning.visible=false;
        if(distance<2)takeHit();
        wardOrderlyAttackCooldown=1.6;
      }
    }else{
      wardOrderlyAttackCooldown=Math.max(0,wardOrderlyAttackCooldown-dt);
      if(distance<2&&wardOrderlyAttackCooldown===0){
        wardOrderlyWindup=1.1;wardOrderlyWarning.visible=true;
        showStoryBeat('The orderly reaches for you. Back out of the amber circle, then fire while he recovers.',2);
      }
    }
  }else if(wardOrderlyWindup>0){
    wardOrderlyWindup=0;wardOrderlyWarning.visible=false;wardOrderlyAttackCooldown=1.6;
  }
  // A committed charge rewards stepping aside, then attacking during recovery.
  if(wakeStage>=21&&finalPursuerAlive&&!raccoonView&&health>0&&!campaignEnded){
    const dx=player.position.x-finalPursuer.position.x,dz=player.position.z-finalPursuer.position.z;
    const distance=Math.hypot(dx,dz);
    if(updateFinalConfrontation(dt)){
      // Keep movement and firing available while the radio confrontation plays.
    }else if(finalChargeWindup>0){
      finalChargeWindup=Math.max(0,finalChargeWindup-dt);
      finalChargeWarning.material.emissiveIntensity=1+.5*Math.sin(finalChargeWindup*24);
      if(finalChargeWindup===0){finalChargeStart.copy(finalPursuer.position);finalChargeTime=.35;}
    }else if(finalChargeTime>0){
      finalChargeTime=Math.max(0,finalChargeTime-dt);
      finalPursuer.position.lerpVectors(finalChargeStart,finalChargeTarget,1-finalChargeTime/.35);
      finalPursuer.position.y=0;
      finalPursuerBlocker.x=finalPursuer.position.x;finalPursuerBlocker.z=finalPursuer.position.z;
      if(finalChargeTime===0){
        finalChargeWarning.visible=false;
        if(Math.hypot(player.position.x-finalChargeTarget.x,player.position.z-finalChargeTarget.z)<1.2)takeHit();
        burst(finalChargeTarget.clone(),0xb49878,10,.12,new THREE.Vector3(0,1,0));
        finalPursuerAttackCooldown=2.4;
      }
    }else{
      finalPursuerAttackCooldown=Math.max(0,finalPursuerAttackCooldown-dt);
      if(distance<9&&finalPursuerAttackCooldown===0){
        finalChargeTarget.set(player.position.x,.06,player.position.z);
        finalChargeWarning.position.copy(finalChargeTarget);finalChargeWarning.visible=true;
        finalPursuer.rotation.y=Math.atan2(dx,dz);finalChargeWindup=1.1;
        showStoryBeat('The pursuer braces to charge. Step aside, then fire while he recovers.',1.5);
      }
    }
  }else if(finalChargeWindup>0||finalChargeTime>0){
    finalChargeWindup=0;finalChargeTime=0;finalChargeWarning.visible=false;finalPursuerAttackCooldown=2.4;
  }
  if(wakeStage>=5&&enemyAlive&&!raccoonView){
    const dx=player.position.x-roadsideEnemy.position.x,dz=player.position.z-roadsideEnemy.position.z;
    const distance=Math.hypot(dx,dz);
    if(distance>4&&distance<20){
      const step=Math.min(distance-4,dt*(roadsideFoamActive?.45:1.35));
      const blocked=(x,z)=>blockers.some(b=>b!==enemyBlocker&&b.type!=='debris'&&
        Math.abs(x-b.x)<b.halfX+.45&&Math.abs(z-b.z)<b.halfZ+.35);
      const nextX=roadsideEnemy.position.x+dx/distance*step;
      const nextZ=roadsideEnemy.position.z+dz/distance*step;
      if(!blocked(nextX,roadsideEnemy.position.z))roadsideEnemy.position.x=nextX;
      if(!blocked(roadsideEnemy.position.x,nextZ))roadsideEnemy.position.z=nextZ;
      enemyBlocker.x=roadsideEnemy.position.x;enemyBlocker.z=roadsideEnemy.position.z;
      roadsideEnemy.rotation.y=Math.atan2(dx,dz);
    }
    enemyAttackCooldown=Math.max(0,enemyAttackCooldown-dt);
    const attackOrigin=roadsideEnemy.position.clone().add(new THREE.Vector3(0,1.25,0));
    const attackDirection=new THREE.Vector3(dx,0,dz).normalize();
    const protectedByCover=distance<2.2&&blockers.some(b=>{
      if(b===enemyBlocker||b.type==='debris')return false;
      const hit=shotDistance(attackOrigin,attackDirection,b);
      return hit!==null&&hit<distance;
    });
    if(distance<2.2&&enemyAttackCooldown===0&&!protectedByCover){
      takeHit();
      enemyAttackCooldown=roadsideFoamActive?2.7:1.35;
    }
  }
  // The tunnel sentry marks a fixed impact point: strafe during the warning.
  if(wakeStage===15&&tunnelEnemyAlive&&!raccoonView&&!raccoonTransition&&health>0){
    const dx=player.position.x-tunnelEnemy.position.x,dz=player.position.z-tunnelEnemy.position.z;
    const distance=Math.hypot(dx,dz);
    tunnelEnemy.rotation.y=Math.atan2(dx,dz);
    if(tunnelAttackWindup>0){
      tunnelAttackWindup=Math.max(0,tunnelAttackWindup-dt);
      tunnelWarning.scale.setScalar(1+.12*Math.sin(tunnelAttackWindup*24));
      if(tunnelAttackWindup===0){
        tunnelWarning.visible=false;
        burst(tunnelAttackTarget.clone(),0xffaa44,8,.1,new THREE.Vector3(0,1,0));
        if(Math.hypot(player.position.x-tunnelAttackTarget.x,player.position.z-tunnelAttackTarget.z)<1.05)takeHit();
        tunnelVolleyShots--;
        if(tunnelVolleyShots>0){
          tunnelAttackTarget.set(player.position.x,.06,player.position.z);
          tunnelWarning.position.copy(tunnelAttackTarget);
          tunnelWarning.visible=true;tunnelAttackWindup=1.2;
          showStoryBeat('Second shot marked. Keep moving, then strike while the sentry reloads.',1.8);
        }else{
          tunnelEnemyAttackCooldown=3.2;
          showStoryBeat('The sentry is reloading. Your opening.',2);
        }
      }
    }else{
      tunnelEnemyAttackCooldown=Math.max(0,tunnelEnemyAttackCooldown-dt);
      if(distance<8&&tunnelEnemyAttackCooldown===0){
        tunnelAttackTarget.set(player.position.x,.06,player.position.z);
        tunnelWarning.position.copy(tunnelAttackTarget);
        tunnelWarning.visible=true;tunnelAttackWindup=1.2;tunnelVolleyShots=2;
        showStoryBeat('Two-shot volley. Dodge each floor marker; attack during the reload.',1.2);
      }
    }
  }else if(tunnelAttackWindup>0){
    tunnelAttackWindup=0;tunnelVolleyShots=0;tunnelWarning.visible=false;tunnelEnemyAttackCooldown=1.5;
  }
  if((wakeStage===17||wakeStage===18)&&tunnelWelderAlive&&!raccoonView&&!raccoonTransition&&health>0){
    welderTimer=Math.max(0,welderTimer-dt);
    if(welderTimer===0){
      if(welderPhase==='idle'){
        welderPhase='warning';welderTimer=1.4;welderSweep.visible=true;
        welderSweep.material.color.setHex(0xffbb33);welderSweep.material.opacity=.5;
        if(!welderIntroduced){
          welderIntroduced=true;
          showStoryBeat('RADIO: Welder at the west exit. Let the flame sweep pass, or take him down.',3);
        }
      }else if(welderPhase==='warning'){
        welderPhase='flame';welderTimer=1.2;welderHit=false;
        welderSweep.material.color.setHex(0xff4422);welderSweep.material.opacity=.9;
        burst(new THREE.Vector3(1.2,.5,-107.5),0xff8833,16,.12,new THREE.Vector3(0,1,0));
      }else{welderPhase='idle';welderTimer=2.4;welderSweep.visible=false;}
    }
    if(welderPhase==='flame'&&!welderHit&&Math.abs(player.position.x-1.2)<1.5&&Math.abs(player.position.z+107.5)<1){
      welderHit=true;takeHit();
    }
  }else{
    welderPhase='idle';welderTimer=1.2;welderSweep.visible=false;
  }
  if(wakeStage===12&&museumGuardAlive&&!museumGuardRecalled&&!raccoonView){
    const dx=player.position.x-museumGuard.position.x,dz=player.position.z-museumGuard.position.z;
    const distance=Math.hypot(dx,dz);
    museumGuardAttackCooldown=Math.max(0,museumGuardAttackCooldown-dt);
    if(museumGuardWindup>0){
      museumGuardWindup=Math.max(0,museumGuardWindup-dt);
      museumBaton.rotation.x=-1.3;
      museumGuardWarning.material.emissiveIntensity=1+.5*Math.sin(museumGuardWindup*24);
      if(museumGuardWindup===0){
        museumGuardWarning.visible=false;
        museumBaton.rotation.x=.8;
        if(distance<2.2&&museumGuardClear(museumGuard.position.x,museumGuard.position.z,player.position.x,player.position.z))takeHit();
        museumGuardAttackCooldown=1.6;
      }
    }else if(museumGuardAttackCooldown===0){
      museumBaton.rotation.x=0;
      const clear=museumGuardClear(museumGuard.position.x,museumGuard.position.z,player.position.x,player.position.z);
      if((distance>1.8||!clear)&&distance<15){
        museumPathTimer-=dt;
        if(!clear&&museumPathTimer<=0&&(!museumPath.length||Math.hypot(player.position.x-museumPathGoal.x,player.position.z-museumPathGoal.z)>1)){museumPath=museumGuardRoute();museumPathTimer=.6;museumPathGoal={x:player.position.x,z:player.position.z};}
        if(clear)museumPath=[];
        while(museumPath.length&&Math.hypot(museumPath[0].x-museumGuard.position.x,museumPath[0].z-museumGuard.position.z)<.00001)museumPath.shift();
        const target=clear?player.position:museumPath[0];
        if(target){
          const mx=target.x-museumGuard.position.x,mz=target.z-museumGuard.position.z,length=Math.hypot(mx,mz);
          const step=Math.min(clear?distance-1.8:length,dt*1.45);
          const nx=museumGuard.position.x+mx/length*step,nz=museumGuard.position.z+mz/length*step;
          if(length>0&&museumGuardClear(museumGuard.position.x,museumGuard.position.z,nx,nz))museumGuard.position.set(nx,museumGuard.position.y,nz);
          else {museumPath=[];museumPathTimer=0;}
        }
        museumGuardBlocker.x=museumGuard.position.x;
        museumGuardBlocker.z=museumGuard.position.z;
        museumGuard.rotation.y=Math.atan2(dx,dz);
      }
      if(distance<2.2&&museumGuardClear(museumGuard.position.x,museumGuard.position.z,player.position.x,player.position.z)){
        museumGuardWindup=.95;
        museumGuardWarning.visible=true;
      }
    }
  }else if(museumGuardWindup>0){
    museumGuardWindup=0;museumGuardWarning.visible=false;
    museumBaton.rotation.x=0;museumGuardAttackCooldown=1.6;
  }

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
      if(!blocked(raccoonPosition.x+dx,raccoonPosition.z,true))raccoonPosition.x+=dx;
      if(!blocked(raccoonPosition.x,raccoonPosition.z+dz,true))raccoonPosition.z+=dz;
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
// Chapter checkpoints rebuild a clean scene, never a half-finished animation.
const resumeKey='alamo-chapter-checkpoint-v1';
let restoringCheckpoint=false,resumePending=false;
const checkpointNames={5:'Mile Marker 13',11:'The Republic',14:'Under the Mission',19:'The Last Stand'};
function clearResume(){try{localStorage.removeItem(resumeKey);}catch{}}
function saveCheckpoint(stage){
  try{
    localStorage.setItem(resumeKey,JSON.stringify({version:1,stage,health,museumGuardRecalled}));
    stateLabel.textContent='Chapter checkpoint saved on this browser';
  }catch{stateLabel.textContent='Checkpoint unavailable: browser storage is blocked';}
}
function restoreCheckpoint(saved){
  restoringCheckpoint=true;
  museumGuardRecalled=saved.museumGuardRecalled===true;
  // Apply each gate transition once in the newly loaded world.
  for(let stage=1;stage<=saved.stage;stage++)advanceWake(stage,'');
  const removeBlocker=b=>{const i=blockers.indexOf(b);if(i>=0)blockers.splice(i,1);};
  for(const b of [...blockers])if(b.missionBarricade){b.parts.forEach(p=>scene.remove(p));removeBlocker(b);}
  wardOrderlyAlive=false;wardOrderly.visible=false;
  shotgunRecovered=true;wardShotgun.visible=false;shotgunPickupRing.visible=false;gun.visible=true;ammo=2;
  if(saved.stage>=11){
    enemyAlive=false;roadsideEnemy.visible=false;removeBlocker(enemyBlocker);
    motelKeyFound=true;motelKey.visible=false;motelExitGate.visible=false;removeBlocker(motelExitBlocker);convoy.visible=false;convoyReleased=true;convoyCrossingOpen=true;convoyBarrier.visible=false;removeBlocker(convoyBarrierBlocker);
  }
  if(saved.stage>=14){museumGuardAlive=museumGuardRecalled;museumGuard.visible=false;removeBlocker(museumGuardBlocker);}
  if(saved.stage>=19){tunnelWelderAlive=false;tunnelWelder.visible=false;removeBlocker(tunnelWelderBlocker);tunnelEnemyAlive=false;tunnelEnemy.visible=false;removeBlocker(tunnelEnemyBlocker);}
  const positions={5:[4,-19],11:[4,-55],14:[7,-82],19:[1.2,-114]};
  const [x,z]=positions[saved.stage];player.position.set(x,0,z);
  health=saved.health;healthLabel.textContent=`HEALTH ${health}`;
  healthLabel.style.color=health<=25?'#ff7777':'#fff1ca';
  storyIndex=awakeningBeats.length;prologue.hidden=true;storyLabel.classList.remove('visible');
  objectiveLabel.textContent={5:'Follow the road north. Watch for the attacker near the station.',11:'Follow the hall north, then turn right into Cowboys & Cattlemen.',14:'Follow the stairs below the mission. Explore the service room before the deep tunnel.',19:'Shoot the supply barricade, then send the raccoon through the low gate gap.'}[saved.stage];
  stateLabel.textContent='Chapter resumed';restoringCheckpoint=false;
}
try{
  const saved=JSON.parse(localStorage.getItem(resumeKey));
  if(saved?.version===1&&Object.hasOwn(checkpointNames,saved.stage)&&Number.isInteger(saved.stage)&&Number.isFinite(saved.health)&&saved.health>0&&saved.health<=100){
    resumePending=true;
    const menu=document.createElement('div');menu.id='resumeMenu';
    menu.style.cssText='position:absolute;inset:0;z-index:30;background:#151a20;display:grid;place-items:center;color:#f5e6c7;padding:20px;box-sizing:border-box;text-align:center';
    const panel=document.createElement('section');menu.append(panel);
    const title=document.createElement('h2');title.textContent='Continue your journey';panel.append(title);
    const description=document.createElement('p');description.textContent=checkpointNames[saved.stage]+' - chapter start, '+saved.health+' health. Saved on this browser.';panel.append(description);
    for(const [id,label,action] of [['continueJourney','Continue',()=>restoreCheckpoint(saved)],['newJourney','New journey',()=>clearResume()]]){
      const button=document.createElement('button');button.id=id;button.textContent=label;button.type='button';
      button.style.cssText='padding:16px;margin:8px;background:#342b2a;color:#fff4ce;border:1px solid #d8bd86;font:18px monospace;touch-action:manipulation';
      button.onclick=()=>{action();resumePending=false;menu.remove();};panel.append(button);
    }
    const note=document.createElement('p');note.textContent='New journey replaces the chapter checkpoint. Discoveries and endings stay in your record.';panel.append(note);
    document.body.append(menu);
  }
}catch{/* Invalid or unavailable storage starts a fresh journey. */}
let previous=performance.now();
function frame(now){
  const dt=Math.min(.04,(now-previous)/1000);previous=now;
  update(dt);
  window.game={player,body,camera,ammo,reload,fireCooldown,vertical,raccoonView,aiming,aimValid,pendingFire,yaw,aimPoint:aimPoint.toArray(),keyStates:Array.from(keys),mixer:davyMixer,davyModel,raccoonGLBModel,raccoonGLBMixer,gun,shotgunModelLoaded,davyScale,davyClip,raccoonClip,wakeStage,health,defeated};
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
