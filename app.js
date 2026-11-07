// Must match PROJECT_ID in wokwi/sketch.ino.
const PROJECT_ID = "hackathon-2026-demo";
const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
const commandTopic = `smartwrite/${PROJECT_ID}/command`;
const statusTopic = `smartwrite/${PROJECT_ID}/status`;
const $ = (id) => document.getElementById(id);
const state = { client:null, connected:false, deviceOnline:false, pending:new Map(), lastText:"", toastTimer:null };
const pixels = [];
for(let i=0;i<256;i++){const p=document.createElement("i");p.className="pixel";$("matrixPreview").appendChild(p);pixels.push(p);}
function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>t.classList.remove("show"),2600);}
function log(stateName,message,good=false,bad=false){const empty=$("activityLog").querySelector(".log-empty");if(empty)empty.remove();const row=document.createElement("div");row.className="log-item";const time=document.createElement("span");time.className="log-time";time.textContent=new Date().toLocaleTimeString();const s=document.createElement("span");s.className="log-state "+(good?"good":bad?"bad":"");s.textContent=stateName;const m=document.createElement("span");m.textContent=message;row.append(time,s,m);$("activityLog").prepend(row);while($("activityLog").children.length>12)$("activityLog").lastChild.remove();}
function setConnection(connected){state.connected=connected;$("statusDot").className="dot "+(connected?"connected":"error");$("connectionText").textContent=connected?"MQTT connected":"Disconnected";handleMqttConnectionChange(connected);}
function connectMqtt(){
 if(!window.mqtt){setConnection(false);toast("MQTT.js failed to load. Check your internet connection.");return;}
 $("connectionText").textContent="Connecting";
 const clientId="smartwrite-web-"+Math.random().toString(16).slice(2,10);
 state.client=mqtt.connect(BROKER_URL,{clientId,clean:true,connectTimeout:10000,reconnectPeriod:3000,keepalive:30});
 state.client.on("connect",()=>{setConnection(true);state.client.subscribe(statusTopic,{qos:0},err=>{if(err)log("ERROR","Could not subscribe to device status",false,true);else{log("CONNECTED","Browser connected to MQTT broker");if(motion.active)resyncMotion("MQTT reconnected");}});});
 state.client.on("reconnect",()=>$("connectionText").textContent="Reconnecting");
 state.client.on("offline",()=>{setConnection(false);$("deviceText").textContent="Device not acknowledged";});
 state.client.on("close",()=>setConnection(false));
 state.client.on("error",err=>{setConnection(false);log("MQTT ERROR",err.message,false,true);});
 state.client.on("message",(topic,payload)=>{if(topic!==statusTopic)return;let msg;try{msg=JSON.parse(payload.toString());}catch{return;}handleDeviceStatus(msg);});
}
function handleDeviceStatus(msg){
 if(msg.state==="motion_sync"||msg.state==="motion_ready"||msg.state==="motion_exit"){handleMotionDeviceStatus(msg);return;}
 if(msg.state==="online"){const wasOnline=state.deviceOnline;state.deviceOnline=true;$("deviceText").textContent="ESP32 online";$("ackBadge").textContent="DEVICE ONLINE";if(!wasOnline){log("DEVICE ONLINE",msg.message||"ESP32 connected",true);if(motion.active)resyncMotion("device online");}return;}
 if(msg.state==="offline"){state.deviceOnline=false;$("deviceText").textContent="Device offline";setMotionAckState("device-offline");return;}
 const id=msg.commandId; if(id&&state.pending.has(id)){const pending=state.pending.get(id);state.pending.delete(id);if(msg.state==="delivered"||msg.state==="result_ready"){pending.resolve(msg);$("deviceText").textContent="Device acknowledged";$("ackBadge").textContent="ACKNOWLEDGED";log(msg.state,msg.message||"Command accepted by ESP32",true);if(msg.state==="result_ready"&&msg.message)drawPreview(msg.message);if(msg.message==="Display stopped")clearHardwarePreview();}else if(msg.state==="error"){pending.reject(new Error(msg.message||"Device error"));$("ackBadge").textContent="DEVICE ERROR";log("ERROR",msg.message||"ESP32 reported an error",false,true);}else if(msg.state==="received"||msg.state==="processing"){log(msg.state,msg.message||"Device is processing");}}
 else {log(msg.state||"STATUS",msg.message||"Device status update",msg.state==="online",msg.state==="error");}
}
function sendCommand(command){
 if(motion.active)leaveMotionMode();
 if(!state.client||!state.connected){toast("MQTT is disconnected. Wait for reconnection.");return Promise.reject(new Error("MQTT disconnected"));}
 const commandId="sw-"+Date.now()+"-"+Math.random().toString(16).slice(2,6);
 const payload={...command,commandId};
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{state.pending.delete(commandId);reject(new Error("No ESP32 acknowledgement received. Check that Wokwi is running."));$("ackBadge").textContent="ACK TIMEOUT";log("TIMEOUT","No device acknowledgement received",false,true);},9000);
  state.pending.set(commandId,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
  state.client.publish(commandTopic,JSON.stringify(payload),{qos:0},err=>{if(err){clearTimeout(timer);state.pending.delete(commandId);reject(err);}else log("SENT","Published to MQTT; waiting for ESP32 acknowledgement");});
 });
}
function clearHardwarePreview(){pixels.forEach(p=>p.classList.remove("on"));motion.lastDomBits="";const label=$("previewLabel");if(label&&!motion.active){label.textContent="PREVIEW CLEARED";label.className="";}}
function drawPreview(text){if(motion.active)return;const chars=String(text||"").toUpperCase();const pattern={A:["01110","10001","10001","11111","10001","10001","10001"],B:["11110","10001","10001","11110","10001","10001","11110"],C:["01111","10000","10000","10000","10000","10000","01111"],D:["11110","10001","10001","10001","10001","10001","11110"],E:["11111","10000","10000","11110","10000","10000","11111"],F:["11111","10000","10000","11110","10000","10000","10000"],G:["01111","10000","10000","10111","10001","10001","01111"],H:["10001","10001","10001","11111","10001","10001","10001"],I:["111","010","010","010","010","010","111"],J:["00111","00010","00010","00010","10010","10010","01100"],K:["10001","10010","10100","11000","10100","10010","10001"],L:["10000","10000","10000","10000","10000","10000","11111"],M:["10001","11011","10101","10101","10001","10001","10001"],N:["10001","11001","10101","10011","10001","10001","10001"],O:["01110","10001","10001","10001","10001","10001","01110"],P:["11110","10001","10001","11110","10000","10000","10000"],Q:["01110","10001","10001","10001","10101","10010","01101"],R:["11110","10001","10001","11110","10100","10010","10001"],S:["01111","10000","10000","01110","00001","00001","11110"],T:["11111","00100","00100","00100","00100","00100","00100"],U:["10001","10001","10001","10001","10001","10001","01110"],V:["10001","10001","10001","10001","10001","01010","00100"],W:["10001","10001","10001","10101","10101","10101","01010"],X:["10001","10001","01010","00100","01010","10001","10001"],Y:["10001","10001","01010","00100","00100","00100","00100"],Z:["11111","00001","00010","00100","01000","10000","11111"],"0":["01110","10001","10011","10101","11001","10001","01110"],"1":["00100","01100","00100","00100","00100","00100","01110"],"2":["01110","10001","00001","00010","00100","01000","11111"],"3":["11110","00001","00001","01110","00001","00001","11110"],"4":["00010","00110","01010","10010","11111","00010","00010"],"5":["11111","10000","10000","11110","00001","00001","11110"],"6":["01110","10000","10000","11110","10001","10001","01110"],"7":["11111","00001","00010","00100","01000","01000","01000"],"8":["01110","10001","10001","01110","10001","10001","01110"],"9":["01110","10001","10001","01111","00001","00001","01110"],"-":["00000","00000","00000","11111","00000","00000","00000"],"+":["00000","00100","00100","11111","00100","00100","00000"],".":["00000","00000","00000","00000","00000","00110","00110"]," ":["000","000","000","000","000","000","000"]};
 const rows=Array.from({length:8},()=>Array(32).fill(0));let x=0;
 for(const ch of chars){const glyph=pattern[ch]||pattern[" "];const w=Math.max(...glyph.map(r=>r.length));if(x+w>32)break;glyph.forEach((r,y)=>[...r].forEach((bit,k)=>{if(y<7)rows[y][x+k]=bit==="1"?1:0;}));x+=w+1;if(x>=32)break;}
 rows.forEach((r,y)=>r.forEach((v,x)=>pixels[y*32+x].classList.toggle("on",!!v)));
 motion.lastDomBits="";
 const label=$("previewLabel");
 if(label){label.textContent=chars?`PREVIEW · ${chars.slice(0,32)}`:"PREVIEW ONLY · NOT DEVICE CONFIRMATION";label.className="";}
}
function updateTextMeta(){$("charCount").textContent=`${$("textInput").value.length} / 120`;drawPreview($("textInput").value);}
$("textInput").addEventListener("input",updateTextMeta);
$("speedInput").addEventListener("input",e=>$("speedValue").textContent=e.target.value);
document.querySelectorAll(".mode-tab").forEach(btn=>btn.addEventListener("click",()=>setMode(btn.dataset.mode)));
$("displayBtn").addEventListener("click",async()=>{const value=$("textInput").value.trim();if(!value)return toast("Enter a message first.");if(value.length>120)return toast("Maximum 120 characters.");state.lastText=value;try{await sendCommand({type:"text",value,speed:Number($("speedInput").value),action:"display"});toast("ESP32 acknowledged your message.");}catch(e){toast(e.message);}});
$("clearBtn").addEventListener("click",()=>{$("textInput").value="";updateTextMeta();});
$("stopBtn").addEventListener("click",async()=>{try{await sendCommand({type:"control",action:"stop"});toast("Display stopped by ESP32.");}catch(e){toast(e.message);}});
$("replayBtn").addEventListener("click",async()=>{try{await sendCommand({type:"control",action:"replay"});toast("Replay acknowledged.");}catch(e){toast(e.message);}});
let expression="";
function setExpression(v){expression=v;$("calcExpression").textContent=v||"0";$("calcResult").textContent="Result appears here";drawPreview(v||"");}
$("keypad").addEventListener("click",e=>{const key=e.target.closest("button")?.dataset.key;if(!key)return;if(key==="C")return setExpression("");if(key==="⌫")return setExpression(expression.slice(0,-1));if(key==="="){try{$("calcResult").textContent="= "+evaluate(expression);}catch(err){$("calcResult").textContent=err.message;}return;}if(expression.length<100)setExpression(expression+key);});
function evaluate(input){
 if(!input.trim())throw Error("Enter an expression");
 if(!/^[0-9+\-*/().\s]+$/.test(input))throw Error("Invalid character");
 let i=0;function ws(){while(/\s/.test(input[i]||"")&&i<input.length)i++;}
 function expr(){let v=term();while(true){ws();if(input[i]==="+"){i++;v+=term();}else if(input[i]==="-"){i++;v-=term();}else break;}return v;}
 function term(){let v=unary();while(true){ws();if(input[i]==="*"){i++;v*=unary();}else if(input[i]==="/"){i++;const d=unary();if(Math.abs(d)<1e-12)throw Error("Cannot divide by zero");v/=d;}else break;}return v;}
 function unary(){ws();if(input[i]==="+"){i++;return unary();}if(input[i]==="-"){i++;return -unary();}return primary();}
 function primary(){ws();if(input[i]==="("){i++;const v=expr();ws();if(input[i]!==")")throw Error("Missing closing parenthesis");i++;return v;}const m=input.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!m)throw Error("Invalid expression");i+=m[0].length;return Number(m[0]);}
 const value=expr();ws();if(i!==input.length||!Number.isFinite(value)||Math.abs(value)>1e12)throw Error("Invalid expression or overflow");return Number.isInteger(value)?String(value):String(Number(value.toPrecision(8)));
}
$("calculateBtn").addEventListener("click",async()=>{let result;try{result=evaluate(expression);}catch(e){$("calcResult").textContent=e.message;toast(e.message);return;}drawPreview(String(result));$("calcResult").textContent="= "+result;try{await sendCommand({type:"calculator",value:expression,action:"calculate"});$("calcResult").textContent="Sent · result "+result;toast("Calculation acknowledged by ESP32.");}catch(e){toast(e.message);}});
/* Motion engine and final application boot are defined below. */

/* =========================================================================
   SMARTWRITE MOTION PARTICLES
   -------------------------------------------------------------------------
   One authoritative particle array (32 particles, unique IDs) is shared by
   both canvases and the MQTT bitmap. A particle is in exactly one place:
   "mobile" (continuous 2D chamber) or "matrix" (discrete 32 x 8 grid).
   ========================================================================= */
const MOTION_CONFIG = Object.freeze({
  TOTAL: 32,
  COLS: 32,
  ROWS: 8,
  FIXED_DT: 1 / 60,
  MOBILE_GRAVITY: 1450,
  MOBILE_FRICTION: 1.05,
  MOBILE_RESTITUTION: 0.38,
  MOBILE_RADIUS: 4.2,
  MOBILE_MAX_SPEED: 2600,
  MOBILE_STIR: 190,
  TRANSFER_PRESSURE: 0.3,
  TRANSFER_SPEED: 240,
  TRANSFER_HOLD: 0.1,
  MATRIX_GRAVITY: 30,
  MATRIX_FRICTION: 2.45,
  MATRIX_RESTITUTION: 0.28,
  MATRIX_MAX_SPEED: 16,
  MATRIX_STIR: 5,
  MIN_GRAVITY: 0.035,
  MAX_GRAVITY: 1.3,
  SYNC_HZ: 12,
  SYNC_MS: 1000 / 12,
  ACK_TIMEOUT_MS: 3000
});

const MOTION_HEART = [
  ".##..##.",
  "########",
  "########",
  ".######.",
  "..####..",
  "...##..."
];

let motionSensitivity = 1;

const motion = {
  active: false,
  initialized: false,
  experience: "gravity",
  particles: [],
  world: { w: 0, h: 0 },
  gravity: { x: 0, y: 0 },
  spin: 0,
  accumulator: 0,
  lastFrame: 0,
  effects: [],
  matrixDirty: true,
  previewDirty: true,
  lastMatrixVisualAt: 0,
  lastStatsAt: 0,
  lastPublishAt: 0,
  lastResyncAt: 0,
  lastPublishedBits: null,
  lastPublishedSeq: 0,
  lastAckSeq: 0,
  lastAckAt: 0,
  ackState: "idle",
  session: "sw-" + Date.now().toString(36) + "-" + Math.random().toString(16).slice(2, 8),
  sequence: 0,
  syncStamps: [],
  publishErrorLogged: false,
  transferCount: 0,
  ctx: null,
  matrixCtx: null,
  spriteMobile: null,
  spriteMatrix: null,
  background: null,
  backgroundKey: "",
  canvasDpr: 1,
  matrixLayout: null,
  lastDomBits: "",
  sensorHealthAt: 0
};

const motionSensor = {
  supported: typeof DeviceMotionEvent !== "undefined" || typeof DeviceOrientationEvent !== "undefined",
  enabled: false,
  paused: false,
  status: "idle",
  source: "none",
  angle: 0,
  motionSeen: false,
  orientationSeen: false,
  lastMotionAt: 0,
  lastOrientationAt: 0,
  lastSampleAt: 0,
  rawScreen: { x: 0, y: 0, z: 0 },
  smoothed: { x: 0, y: 0 },
  baseline: { x: 0, y: 0 },
  calibrated: false,
  calibration: null,
  autoCalibrationTried: false,
  spinTarget: 0,
  spin: 0,
  touchOverride: false,
  touchGravity: { x: 0, y: 0 },
  touchLogged: false,
  watchdog: null,
  listening: false,
  lastAlpha: null,
  errorMessage: "",
  lastLogState: "",
  calibrationTimer: null,
  permissionTimer: null
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function clamp01(value) { return clamp(value, 0, 1); }
function signed(value) { return (value < 0 ? "−" : "+") + Math.abs(value).toFixed(2); }

function createMotionParticles() {
  const list = [];
  for (let i = 0; i < MOTION_CONFIG.TOTAL; i++) {
    list.push({
      id: i + 1,
      loc: "matrix",
      x: 0, y: 0,
      vx: 0, vy: 0,
      ax: 0, ay: 0,
      mx: 0, my: 0,
      accX: 0, accY: 0,
      rest: 0,
      flash: 0,
      holds: { left: 0, right: 0, top: 0, bottom: 0 }
    });
  }
  return list;
}

function motionHeartCells() {
  const cells = [];
  const offsetX = Math.floor((MOTION_CONFIG.COLS - 8) / 2);
  const offsetY = 1;
  MOTION_HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "#") cells.push({ x: offsetX + x, y: offsetY + y });
    }
  });
  return cells;
}

function motionMobileSpawnPositions(width, height) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const cell = Math.max(9, Math.min(30, Math.min(w / 14, h / 9)));
  const gridWidth = cell * 8;
  const gridHeight = cell * 6;
  const originX = (w - gridWidth) / 2;
  const originY = Math.max(8, h - gridHeight - 14);
  const positions = [];
  MOTION_HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "#") positions.push({ x: originX + (x + 0.5) * cell, y: originY + (y + 0.5) * cell });
    }
  });
  return positions;
}

function motionCounts() {
  let mobile = 0;
  let matrix = 0;
  for (const particle of motion.particles) {
    if (particle.loc === "mobile") mobile++;
    else matrix++;
  }
  return { total: motion.particles.length, mobile, matrix };
}

function assertParticleConservation(where) {
  const counts = motionCounts();
  const ids = new Set(motion.particles.map((particle) => particle.id));
  if (counts.total !== MOTION_CONFIG.TOTAL || counts.mobile + counts.matrix !== counts.total || ids.size !== counts.total) {
    console.error("[SmartWrite] particle conservation violation", where, counts, ids.size);
  }
  const occupied = new Set();
  for (const particle of motion.particles) {
    if (particle.loc !== "matrix") continue;
    const key = particle.mx + "," + particle.my;
    if (occupied.has(key)) console.error("[SmartWrite] duplicate matrix cell", key, where);
    occupied.add(key);
  }
}

function computeMatrixRows() {
  const rows = Array.from({ length: MOTION_CONFIG.ROWS }, () => Array(MOTION_CONFIG.COLS).fill("0"));
  for (const particle of motion.particles) {
    if (particle.loc !== "matrix") continue;
    if (particle.my < 0 || particle.my >= MOTION_CONFIG.ROWS || particle.mx < 0 || particle.mx >= MOTION_CONFIG.COLS) continue;
    rows[particle.my][particle.mx] = "1";
  }
  return rows.map((row) => row.join(""));
}

function rowsToHex(rows) {
  const bytes = new Uint8Array((MOTION_CONFIG.COLS * MOTION_CONFIG.ROWS) / 8);
  for (let y = 0; y < MOTION_CONFIG.ROWS; y++) {
    const row = rows[y] || "";
    for (let x = 0; x < MOTION_CONFIG.COLS; x++) {
      if (row[x] === "1") bytes[y * 4 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToRows(hex) {
  if (typeof hex !== "string" || hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const rows = Array.from({ length: MOTION_CONFIG.ROWS }, () => Array(MOTION_CONFIG.COLS).fill("0"));
  for (let y = 0; y < MOTION_CONFIG.ROWS; y++) {
    for (let x = 0; x < MOTION_CONFIG.COLS; x++) {
      const byte = parseInt(hex.slice((y * 4 + (x >> 3)) * 2, (y * 4 + (x >> 3)) * 2 + 2), 16);
      if (byte & (0x80 >> (x & 7))) rows[y][x] = "1";
    }
  }
  return rows.map((row) => row.join(""));
}

function resetMotionState(experience = motion.experience, silent = false) {
  motion.experience = experience;
  motion.effects.length = 0;
  motion.transferCount = 0;
  motion.matrixDirty = true;
  motion.previewDirty = true;
  motion.lastDomBits = "";

  if (experience === "gravity") {
    const cells = motionHeartCells();
    motion.particles.forEach((particle, index) => {
      const cell = cells[index] || { x: index % MOTION_CONFIG.COLS, y: 1 + Math.floor(index / MOTION_CONFIG.COLS) };
      particle.loc = "matrix";
      particle.mx = cell.x;
      particle.my = cell.y;
      particle.x = 0;
      particle.y = 0;
      particle.vx = 0;
      particle.vy = 0;
      particle.ax = 0;
      particle.ay = 0;
      particle.accX = 0;
      particle.accY = 0;
      particle.rest = 0;
      particle.holds.left = 0;
      particle.holds.right = 0;
      particle.holds.top = 0;
      particle.holds.bottom = 0;
    });
  } else {
    const positions = motionMobileSpawnPositions(motion.world.w, motion.world.h);
    motion.particles.forEach((particle, index) => {
      const position = positions[index] || { x: motion.world.w / 2, y: motion.world.h / 2 };
      particle.loc = "mobile";
      particle.x = position.x;
      particle.y = position.y;
      particle.mx = 0;
      particle.my = 0;
      particle.vx = 0;
      particle.vy = 0;
      particle.ax = 0;
      particle.ay = 0;
      particle.accX = 0;
      particle.accY = 0;
      particle.rest = 0;
      particle.holds.left = 0;
      particle.holds.right = 0;
      particle.holds.top = 0;
      particle.holds.bottom = 0;
    });
    motion.gravity.x = 0;
    motion.gravity.y = 0;
  }

  assertParticleConservation("reset");
  updateMotionMatrixVisuals(true);
  updateMotionStats(true);

  if (!silent) {
    const counts = motionCounts();
    log("RESET", experience === "gravity"
      ? `${counts.matrix} particles placed in the matrix`
      : `${counts.mobile} particles settled in the phone chamber`, true);
  }

  if (motion.active) {
    publishMotionControl("enter");
    motion.lastPublishedBits = null;
    publishMotionFrame(true);
  }
}

/* -------------------------------------------------------------------------
   Sensor pipeline: DeviceMotionEvent / DeviceOrientationEvent
   ------------------------------------------------------------------------- */

function getScreenAngle() {
  if (typeof screen !== "undefined" && screen.orientation && typeof screen.orientation.angle === "number") {
    return ((screen.orientation.angle % 360) + 360) % 360;
  }
  if (typeof window.orientation === "number") return ((window.orientation % 360) + 360) % 360;
  return 0;
}

/**
 * Convert the device-frame accelerometer "up" vector to screen-space gravity.
 * Screen coordinates: +x right, +y down. Device coordinates: +x right, +y up.
 * The screen angle is applied so a rotated phone keeps screen-relative motion.
 */
function screenGravityFromAccel(ax, ay, angleDegrees) {
  const radians = (angleDegrees || 0) * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: (-ax * cos + ay * sin) / 9.80665,
    y: (ax * sin + ay * cos) / 9.80665
  };
}

function setMotionGravity(x, y) {
  motion.gravity.x = Number.isFinite(x) ? x : 0;
  motion.gravity.y = Number.isFinite(y) ? y : 0;
}

function applyCalibratedGravity() {
  if (motionSensor.touchOverride) return;
  if (motionSensor.paused || !motionSensor.calibrated) {
    setMotionGravity(0, 0);
    return;
  }
  let gx = (motionSensor.smoothed.x - motionSensor.baseline.x) * motionSensitivity;
  let gy = (motionSensor.smoothed.y - motionSensor.baseline.y) * motionSensitivity;
  const magnitude = Math.hypot(gx, gy);
  if (magnitude < MOTION_CONFIG.MIN_GRAVITY) {
    gx = 0;
    gy = 0;
  } else if (magnitude > MOTION_CONFIG.MAX_GRAVITY) {
    gx = gx / magnitude * MOTION_CONFIG.MAX_GRAVITY;
    gy = gy / magnitude * MOTION_CONFIG.MAX_GRAVITY;
  }
  setMotionGravity(gx, gy);
}

function setMotionSensorStatus(status, detail) {
  const previous = motionSensor.status;
  motionSensor.status = status;
  if (detail !== undefined) motionSensor.errorMessage = detail || "";

  if (status !== "active" && status !== "waiting" && status !== "calibrating" && status !== "paused") {
    setMotionGravity(0, 0);
    motion.spin = 0;
    motionSensor.spinTarget = 0;
  }

  updateSensorUI();

  const logKey = status + ":" + (detail || "");
  if (previous !== status && motionSensor.lastLogState !== logKey) {
    motionSensor.lastLogState = logKey;
    const messages = {
      active: ["SENSOR ACTIVE", "Real motion input is driving the particles", true, false],
      calibrating: ["CALIBRATING", "Hold still while neutral gravity is sampled", false, false],
      paused: ["SENSOR PAUSED", "Gravity input frozen; particles coast and settle", false, false],
      unavailable: ["SENSOR UNAVAILABLE", detail || "No usable motion events", false, true],
      denied: ["PERMISSION DENIED", detail || "Motion permission was denied", false, true],
      error: ["SENSOR ERROR", detail || "Motion sensor error", false, true]
    };
    const message = messages[status];
    if (message) log(message[0], message[1], message[2], message[3]);
  }
}

function updateSensorUI() {
  if (!document.getElementById("sensorStatus")) return;
  const displayStatus = motionSensor.touchOverride ? "touch" : motionSensor.paused ? "paused" : motionSensor.status;
  const labels = {
    idle: "SENSOR IDLE",
    requesting: "REQUESTING PERMISSION",
    waiting: "WAITING FOR SENSOR",
    calibrating: "CALIBRATING",
    active: "SENSOR ACTIVE",
    paused: "SENSOR PAUSED",
    unavailable: "SENSOR UNAVAILABLE",
    denied: "PERMISSION DENIED",
    error: "SENSOR ERROR",
    touch: "TOUCH TEST INPUT"
  };
  $("sensorStatus").textContent = labels[displayStatus] || "SENSOR IDLE";
  $("sensorDot").className = "sensor-dot " + (displayStatus === "touch" ? "touch" : displayStatus);

  let detail = "";
  if (motionSensor.touchOverride) {
    detail = "Manual gravity input · not sensor data";
  } else if (motionSensor.paused) {
    detail = "Gravity input frozen · tap Resume to continue";
  } else {
    switch (motionSensor.status) {
      case "idle": detail = "Tap Enable motion to request access"; break;
      case "requesting": detail = "Waiting for browser permission…"; break;
      case "waiting": detail = "Permission granted · waiting for the first sample"; break;
      case "calibrating": detail = "Hold still · capturing the neutral pose"; break;
      case "active": detail = `${motionSensor.source === "orientation" ? "Orientation fallback" : "Accelerometer"} · screen ${Math.round(motionSensor.angle)}°`; break;
      case "unavailable": detail = motionSensor.errorMessage || "No usable sensor events · use the touch test controller"; break;
      case "denied": detail = motionSensor.errorMessage || "Permission denied · use the touch test controller"; break;
      case "error": detail = motionSensor.errorMessage || "Sensor error"; break;
      default: detail = "";
    }
  }
  $("sensorSource").textContent = detail;

  const usable = motionSensor.enabled && ["active", "calibrating", "waiting", "paused"].includes(motionSensor.status);
  $("enableMotionBtn").disabled = motionSensor.status === "requesting" || usable;
  $("enableMotionBtn").querySelector("span").textContent = usable
    ? "Motion enabled"
    : motionSensor.enabled && motionSensor.status === "unavailable"
      ? "Retry sensors"
      : "Enable motion";
  $("calibrateBtn").disabled = !motionSensor.enabled || motionSensor.paused || motionSensor.status === "calibrating" || motionSensor.status === "requesting";
  $("pauseMotionBtn").disabled = !motionSensor.enabled || motionSensor.status === "requesting" || motionSensor.status === "calibrating";
  $("pauseMotionBtn").textContent = motionSensor.paused ? "Resume" : "Pause";
}

function consumeGravitySample(sample, dt, now) {
  if (!motionSensor.enabled) return;

  if (motionSensor.calibration) {
    motionSensor.calibration.samples.push({ x: sample.x, y: sample.y, t: now });
    if (now >= motionSensor.calibration.until) finishCalibration();
    else {
      setMotionGravity(0, 0);
      return;
    }
  }

  if (!motionSensor.calibrated && !motionSensor.calibration && !motionSensor.paused && !motionSensor.autoCalibrationTried) {
    startCalibration(true);
    if (motionSensor.calibration) {
      motionSensor.calibration.samples.push({ x: sample.x, y: sample.y, t: now });
      return;
    }
  }

  if (motionSensor.paused) {
    setMotionGravity(0, 0);
    motion.spin = 0;
    return;
  }
  if (!motionSensor.calibrated) {
    setMotionGravity(0, 0);
    return;
  }
  if (motionSensor.touchOverride) return;

  const smoothing = 1 - Math.exp(-dt / 0.085);
  motionSensor.smoothed.x += (sample.x - motionSensor.smoothed.x) * smoothing;
  motionSensor.smoothed.y += (sample.y - motionSensor.smoothed.y) * smoothing;
  const spinSmoothing = 1 - Math.exp(-dt / 0.12);
  motionSensor.spin += (motionSensor.spinTarget - motionSensor.spin) * spinSmoothing;
  motion.spin = motionSensor.spin;
  applyCalibratedGravity();

  if (motionSensor.status === "waiting" || motionSensor.status === "unavailable") {
    setMotionSensorStatus("active");
  }
}

function handleDeviceMotion(event) {
  if (!motionSensor.enabled) return;
  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration || acceleration.x == null || acceleration.y == null) return;
  const ax = Number(acceleration.x) || 0;
  const ay = Number(acceleration.y) || 0;
  const az = Number(acceleration.z) || 0;
  if (Math.hypot(ax, ay, az) < 0.6) return;

  const now = performance.now();
  const dt = Math.min(0.12, Math.max(0.001, (now - (motionSensor.lastSampleAt || now)) / 1000));
  motionSensor.lastSampleAt = now;
  motionSensor.lastMotionAt = now;
  motionSensor.motionSeen = true;
  motionSensor.source = "accelerometer";
  motionSensor.angle = getScreenAngle();

  const sample = screenGravityFromAccel(ax, ay, motionSensor.angle);
  const z = az / 9.80665;
  motionSensor.rawScreen.x = sample.x;
  motionSensor.rawScreen.y = sample.y;
  motionSensor.rawScreen.z = z;

  let spinTarget = 0;
  if (event.rotationRate && Number.isFinite(event.rotationRate.alpha)) {
    spinTarget = clamp(event.rotationRate.alpha / 240, -1, 1);
  }
  motionSensor.spinTarget = spinTarget;

  if (motionSensor.watchdog) {
    clearTimeout(motionSensor.watchdog);
    motionSensor.watchdog = null;
  }
  consumeGravitySample(sample, dt, now);
}

function handleDeviceOrientation(event) {
  if (!motionSensor.enabled) return;
  const now = performance.now();
  if (now - motionSensor.lastMotionAt < 900) return;
  if (event.beta == null || event.gamma == null) return;

  motionSensor.orientationSeen = true;
  motionSensor.lastOrientationAt = now;
  motionSensor.source = "orientation";
  motionSensor.angle = getScreenAngle();

  const beta = event.beta * Math.PI / 180;
  const gamma = event.gamma * Math.PI / 180;
  const upX = -Math.sin(gamma) * Math.cos(beta);
  const upY = Math.sin(beta);
  const sample = screenGravityFromAccel(upX * 9.80665, upY * 9.80665, motionSensor.angle);

  const dt = Math.min(0.12, Math.max(0.001, (now - (motionSensor.lastSampleAt || now)) / 1000));
  motionSensor.lastSampleAt = now;
  motionSensor.rawScreen.x = sample.x;
  motionSensor.rawScreen.y = sample.y;
  motionSensor.rawScreen.z = 0;

  let spinTarget = 0;
  if (event.alpha != null && motionSensor.lastAlpha != null) {
    let delta = event.alpha - motionSensor.lastAlpha;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    spinTarget = clamp(delta / 5, -1, 1);
  }
  if (event.alpha != null) motionSensor.lastAlpha = event.alpha;
  motionSensor.spinTarget = spinTarget;

  if (motionSensor.watchdog) {
    clearTimeout(motionSensor.watchdog);
    motionSensor.watchdog = null;
  }
  consumeGravitySample(sample, dt, now);
}

function attachMotionListeners() {
  if (!motionSensor.listening) {
    window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
    window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
    motionSensor.listening = true;
  }
  motionSensor.angle = getScreenAngle();
}

async function enableMotionSensors() {
  if (motionSensor.status === "requesting") return;
  if (motionSensor.enabled && ["active", "calibrating", "waiting", "paused"].includes(motionSensor.status)) {
    toast("Motion is already enabled.");
    return;
  }
  if (!motionSensor.supported) {
    motionSensor.enabled = false;
    setMotionSensorStatus("unavailable", "This browser does not expose motion sensors");
    $("touchFallback").open = true;
    toast("Motion sensors are not available in this browser. Use the touch test controller.");
    return;
  }

  motionSensor.enabled = true;
  motionSensor.errorMessage = "";
  setMotionGravity(0, 0);
  motion.spin = 0;
  motionSensor.spinTarget = 0;
  motionSensor.motionSeen = false;
  motionSensor.orientationSeen = false;
  motionSensor.lastMotionAt = 0;
  motionSensor.lastOrientationAt = 0;
  motionSensor.lastSampleAt = 0;
  motionSensor.autoCalibrationTried = false;
  setMotionSensorStatus("requesting");
  clearTimeout(motionSensor.permissionTimer);
  motionSensor.permissionTimer = setTimeout(() => {
    if (motionSensor.status !== "requesting") return;
    motionSensor.enabled = false;
    setMotionSensorStatus("unavailable", "Permission request did not complete");
    $("touchFallback").open = true;
    toast("The motion permission request did not complete. Use the touch test controller.");
  }, 8000);

  try {
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      const result = await DeviceMotionEvent.requestPermission();
      if (!motionSensor.enabled) return;
      if (result !== "granted") {
        motionSensor.enabled = false;
        clearTimeout(motionSensor.permissionTimer);
        setMotionSensorStatus("denied", "Permission was not granted");
        $("touchFallback").open = true;
        toast("Motion permission denied. The touch test controller is available below.");
        return;
      }
    }
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      try { await DeviceOrientationEvent.requestPermission(); } catch (error) { /* orientation fallback is optional */ }
    }
    if (!motionSensor.enabled) return;

    clearTimeout(motionSensor.permissionTimer);
    attachMotionListeners();
    setMotionSensorStatus("waiting");
    clearTimeout(motionSensor.watchdog);
    motionSensor.watchdog = setTimeout(() => {
      if (!motionSensor.enabled) return;
      if (!motionSensor.motionSeen && !motionSensor.orientationSeen) {
        setMotionSensorStatus("unavailable", "No sensor events received");
        $("touchFallback").open = true;
        toast("No motion sensor events received. Use the touch test controller.");
      }
    }, 3200);
  } catch (error) {
    motionSensor.enabled = false;
    clearTimeout(motionSensor.permissionTimer);
    motionSensor.errorMessage = error && error.message ? error.message : "Permission request failed";
    setMotionSensorStatus("error", motionSensor.errorMessage);
    $("touchFallback").open = true;
    toast("Could not start motion sensors. Use the touch test controller.");
  }
}

function startCalibration(auto = false) {
  if (!motionSensor.enabled) {
    toast("Enable motion first.");
    return;
  }
  if (!motionSensor.motionSeen && !motionSensor.orientationSeen) {
    toast("Waiting for the first sensor sample.");
    return;
  }
  if (motionSensor.paused) {
    toast("Resume the sensor before calibrating.");
    return;
  }
  if (motionSensor.status === "calibrating") return;

  const now = performance.now();
  motionSensor.calibration = { samples: [], until: now + 900, auto: Boolean(auto) };
  motionSensor.autoCalibrationTried = true;
  setMotionGravity(0, 0);
  motion.spin = 0;
  motionSensor.spinTarget = 0;
  setMotionSensorStatus("calibrating");
  clearTimeout(motionSensor.calibrationTimer);
  motionSensor.calibrationTimer = setTimeout(() => finishCalibration(), 960);
  if (!auto) log("CALIBRATE", "Hold still · sampling neutral gravity for 0.9 s");
}

function finishCalibration() {
  const calibration = motionSensor.calibration;
  if (!calibration) return;
  motionSensor.calibration = null;
  clearTimeout(motionSensor.calibrationTimer);
  motionSensor.calibrationTimer = null;

  if (calibration.samples.length < 3) {
    setMotionSensorStatus("unavailable", "Not enough sensor samples to calibrate");
    $("touchFallback").open = true;
    toast("Calibration failed: not enough sensor samples.");
    return;
  }

  let x = 0;
  let y = 0;
  for (const sample of calibration.samples) {
    x += sample.x;
    y += sample.y;
  }
  x /= calibration.samples.length;
  y /= calibration.samples.length;
  motionSensor.baseline.x = x;
  motionSensor.baseline.y = y;
  motionSensor.calibrated = true;
  motionSensor.smoothed.x = motionSensor.rawScreen.x;
  motionSensor.smoothed.y = motionSensor.rawScreen.y;
  setMotionSensorStatus("active");
  applyCalibratedGravity();
  toast(calibration.auto ? "Motion ready. Neutral holding pose captured." : "Calibration saved.");
  log("CALIBRATED", `Baseline X ${x.toFixed(2)} · Y ${y.toFixed(2)}`, true);
}

function toggleSensorPause() {
  if (!motionSensor.enabled) return;
  motionSensor.paused = !motionSensor.paused;
  if (motionSensor.paused) {
    motionSensor.touchOverride = false;
    motionSensor.touchLogged = false;
    const knob = $("touchKnob");
    if (knob) {
      knob.style.left = "50%";
      knob.style.top = "50%";
    }
    setMotionGravity(0, 0);
    motion.spin = 0;
    motionSensor.spinTarget = 0;
    setMotionSensorStatus("paused");
  } else {
    motionSensor.lastSampleAt = 0;
    setMotionSensorStatus(motionSensor.calibrated ? "active" : "waiting");
    if (motionSensor.calibrated) applyCalibratedGravity();
  }
  updateSensorUI();
}

function refreshScreenAngle() {
  motionSensor.angle = getScreenAngle();
  updateSensorUI();
}

function checkSensorHealth(now) {
  if (!motionSensor.enabled || motionSensor.paused) return;
  if (now - motion.lastSensorHealthAt < 1000) return;
  motion.lastSensorHealthAt = now;
  const last = Math.max(motionSensor.lastMotionAt, motionSensor.lastOrientationAt);
  if (!last) return;
  if (now - last > 3500) {
    if (motionSensor.status === "active" || motionSensor.status === "waiting") {
      setMotionSensorStatus("unavailable", "No sensor events for 3.5 s");
    }
  } else if (now - last < 1200 && motionSensor.status === "unavailable" && motionSensor.calibrated) {
    setMotionSensorStatus("active");
  }
}

/* -------------------------------------------------------------------------
   Touch test controller (manually labelled; never presented as sensor data)
   ------------------------------------------------------------------------- */

function setTouchGravity(x, y) {
  if (!motion.active) return;
  if (motionSensor.paused) {
    toast("Resume the sensor before using gravity input.");
    return;
  }
  const magnitude = Math.hypot(x, y);
  if (magnitude < 0.06) {
    centerTouchGravity();
    return;
  }
  motionSensor.touchOverride = true;
  motionSensor.touchGravity.x = x;
  motionSensor.touchGravity.y = y;
  const scale = motionSensitivity;
  setMotionGravity(
    clamp(x * scale, -MOTION_CONFIG.MAX_GRAVITY, MOTION_CONFIG.MAX_GRAVITY),
    clamp(y * scale, -MOTION_CONFIG.MAX_GRAVITY, MOTION_CONFIG.MAX_GRAVITY)
  );
  motion.spin = 0;
  if (!motionSensor.touchLogged) {
    motionSensor.touchLogged = true;
    log("TOUCH INPUT", "Manual gravity test input active · not sensor data");
  }
  updateSensorUI();
  updateMotionStats(true);
}

function centerTouchGravity() {
  motionSensor.touchOverride = false;
  motionSensor.touchGravity.x = 0;
  motionSensor.touchGravity.y = 0;
  motionSensor.touchLogged = false;
  const knob = $("touchKnob");
  if (knob) {
    knob.style.left = "50%";
    knob.style.top = "50%";
  }
  if (motionSensor.calibrated && !motionSensor.paused) applyCalibratedGravity();
  else setMotionGravity(0, 0);
  updateSensorUI();
  updateMotionStats(true);
}

function initTouchController() {
  const pad = $("touchPad");
  const knob = $("touchKnob");
  if (!pad || !knob) return;
  let pointerId = null;

  const updateFromEvent = (event) => {
    const rect = pad.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    let nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    let ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    const magnitude = Math.hypot(nx, ny);
    if (magnitude > 1) {
      nx /= magnitude;
      ny /= magnitude;
    }
    knob.style.left = (50 + nx * 36) + "%";
    knob.style.top = (50 + ny * 36) + "%";
    setTouchGravity(nx, ny);
  };

  pad.addEventListener("pointerdown", (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    try { pad.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    updateFromEvent(event);
    event.preventDefault();
  });
  pad.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    updateFromEvent(event);
    event.preventDefault();
  });
  const endPointer = (event) => {
    if (event.pointerId === pointerId) pointerId = null;
  };
  pad.addEventListener("pointerup", endPointer);
  pad.addEventListener("pointercancel", endPointer);
  pad.addEventListener("lostpointercapture", endPointer);
  $("touchCenterBtn").addEventListener("click", centerTouchGravity);
}

/* -------------------------------------------------------------------------
   Physics engine
   ------------------------------------------------------------------------- */

function stepMotionPhysics(dt) {
  const gravity = motion.gravity;
  const spin = motion.spin;

  if (motion.experience === "transfer") {
    const mobileParticles = motion.particles.filter((particle) => particle.loc === "mobile");
    for (const particle of mobileParticles) stepMobileParticle(particle, gravity, spin, dt);
    resolveMobileCollisions();
    for (const particle of mobileParticles) {
      if (particle.loc === "mobile") handleMobileBoundary(particle, gravity, dt);
    }
  }

  stepMatrixParticles(gravity, spin, dt);
}

function stepMobileParticle(particle, gravity, spin, dt) {
  const world = motion.world;
  if (world.w < 2 || world.h < 2) return;
  let ax = gravity.x * MOTION_CONFIG.MOBILE_GRAVITY;
  let ay = gravity.y * MOTION_CONFIG.MOBILE_GRAVITY;
  particle.ax = ax;
  particle.ay = ay;

  if (Math.abs(spin) > 0.03) {
    const dx = particle.x - world.w / 2;
    const dy = particle.y - world.h / 2;
    const distance = Math.hypot(dx, dy) || 1;
    const force = spin * MOTION_CONFIG.MOBILE_STIR;
    ax += (-dy / distance) * force;
    ay += (dx / distance) * force;
  }

  particle.vx += ax * dt;
  particle.vy += ay * dt;
  const damping = Math.exp(-MOTION_CONFIG.MOBILE_FRICTION * dt);
  particle.vx *= damping;
  particle.vy *= damping;

  const speed = Math.hypot(particle.vx, particle.vy);
  if (speed > MOTION_CONFIG.MOBILE_MAX_SPEED) {
    particle.vx = particle.vx / speed * MOTION_CONFIG.MOBILE_MAX_SPEED;
    particle.vy = particle.vy / speed * MOTION_CONFIG.MOBILE_MAX_SPEED;
  }

  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
}

function resolveMobileCollisions() {
  const mobileParticles = motion.particles.filter((particle) => particle.loc === "mobile");
  const minimum = MOTION_CONFIG.MOBILE_RADIUS * 2;
  for (let i = 0; i < mobileParticles.length; i++) {
    for (let j = i + 1; j < mobileParticles.length; j++) {
      const a = mobileParticles[i];
      const b = mobileParticles[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= minimum) continue;
      if (distance < 0.001) {
        dx = 0.5;
        dy = 0.1;
        distance = Math.hypot(dx, dy);
      }
      const nx = dx / distance;
      const ny = dy / distance;
      const overlap = (minimum - distance) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const relativeX = b.vx - a.vx;
      const relativeY = b.vy - a.vy;
      const normalVelocity = relativeX * nx + relativeY * ny;
      if (normalVelocity < 0) {
        const impulse = -(1 + MOTION_CONFIG.MOBILE_RESTITUTION) * normalVelocity / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }
}

function handleMobileBoundary(particle, gravity, dt) {
  const radius = MOTION_CONFIG.MOBILE_RADIUS;
  const width = motion.world.w;
  const height = motion.world.h;
  if (width < 2 || height < 2) return;

  const contacts = [];
  if (particle.x < radius) contacts.push("left");
  if (particle.x > width - radius) contacts.push("right");
  if (particle.y < radius) contacts.push("top");
  if (particle.y > height - radius) contacts.push("bottom");

  for (const edge of ["left", "right", "top", "bottom"]) {
    if (!contacts.includes(edge)) particle.holds[edge] = 0;
  }

  if (motion.experience === "transfer" && contacts.length) {
    let chosenEdge = null;
    let bestScore = -Infinity;
    for (const edge of contacts) {
      const pressure = edge === "left" ? -gravity.x : edge === "right" ? gravity.x : edge === "top" ? -gravity.y : gravity.y;
      const outwardSpeed = edge === "left" ? -particle.vx : edge === "right" ? particle.vx : edge === "top" ? -particle.vy : particle.vy;
      const active = pressure > MOTION_CONFIG.TRANSFER_PRESSURE || outwardSpeed > MOTION_CONFIG.TRANSFER_SPEED;
      if (active) particle.holds[edge] += dt;
      else particle.holds[edge] = 0;
      if (active && particle.holds[edge] >= MOTION_CONFIG.TRANSFER_HOLD) {
        const score = pressure * 2 + Math.min(outwardSpeed / MOTION_CONFIG.TRANSFER_SPEED, 2) + particle.holds[edge];
        if (score > bestScore) {
          bestScore = score;
          chosenEdge = edge;
        }
      }
    }
    if (chosenEdge && transferMobileToMatrix(particle, chosenEdge)) return;
  }

  if (particle.x < radius) {
    particle.x = radius;
    if (particle.vx < 0) particle.vx = -particle.vx * MOTION_CONFIG.MOBILE_RESTITUTION;
  } else if (particle.x > width - radius) {
    particle.x = width - radius;
    if (particle.vx > 0) particle.vx = -particle.vx * MOTION_CONFIG.MOBILE_RESTITUTION;
  }
  if (particle.y < radius) {
    particle.y = radius;
    if (particle.vy < 0) particle.vy = -particle.vy * MOTION_CONFIG.MOBILE_RESTITUTION;
  } else if (particle.y > height - radius) {
    particle.y = height - radius;
    if (particle.vy > 0) particle.vy = -particle.vy * MOTION_CONFIG.MOBILE_RESTITUTION;
  }

  if (Math.hypot(particle.vx, particle.vy) < 2 && Math.hypot(gravity.x, gravity.y) < 0.03) {
    particle.vx = 0;
    particle.vy = 0;
  }
}

/**
 * 180-degree spatial mapping between the phone chamber and the matrix:
 * right -> left, left -> right, bottom -> top, top -> bottom.
 * Every boundary exit therefore lands on the opposite matrix corner.
 */
function transferMobileToMatrix(particle, edge) {
  const width = Math.max(1, motion.world.w);
  const height = Math.max(1, motion.world.h);
  const xNorm = clamp01(particle.x / width);
  const yNorm = clamp01(particle.y / height);

  let baseCol;
  let baseRow;
  let inwardX = 0;
  let inwardY = 0;
  if (edge === "left") {
    baseCol = MOTION_CONFIG.COLS - 1;
    baseRow = Math.round((1 - yNorm) * (MOTION_CONFIG.ROWS - 1));
    inwardX = -1;
  } else if (edge === "right") {
    baseCol = 0;
    baseRow = Math.round((1 - yNorm) * (MOTION_CONFIG.ROWS - 1));
    inwardX = 1;
  } else if (edge === "top") {
    baseRow = MOTION_CONFIG.ROWS - 1;
    baseCol = Math.round((1 - xNorm) * (MOTION_CONFIG.COLS - 1));
    inwardY = -1;
  } else {
    baseRow = 0;
    baseCol = Math.round((1 - xNorm) * (MOTION_CONFIG.COLS - 1));
    inwardY = 1;
  }

  const cell = findFreeMatrixCell(baseCol, baseRow, inwardX, inwardY);
  if (!cell) return false;

  motion.effects.push({ space: "mobile", x: particle.x, y: particle.y, life: 0.42, max: 0.42, type: "exit" });
  motion.effects.push({ space: "matrix", mx: cell.x, my: cell.y, life: 0.55, max: 0.55, type: "arrive" });

  particle.loc = "matrix";
  particle.mx = cell.x;
  particle.my = cell.y;
  particle.accX = 0;
  particle.accY = 0;
  particle.rest = 0;
  particle.holds.left = 0;
  particle.holds.right = 0;
  particle.holds.top = 0;
  particle.holds.bottom = 0;
  particle.vx = clamp(particle.vx / width * MOTION_CONFIG.COLS * 0.9, -MOTION_CONFIG.MATRIX_MAX_SPEED, MOTION_CONFIG.MATRIX_MAX_SPEED);
  particle.vy = clamp(particle.vy / height * MOTION_CONFIG.ROWS * 0.9, -MOTION_CONFIG.MATRIX_MAX_SPEED, MOTION_CONFIG.MATRIX_MAX_SPEED);

  motion.matrixDirty = true;
  motion.previewDirty = true;
  motion.transferCount++;
  const counts = motionCounts();
  if (motion.transferCount === 1) {
    log("TRANSFER", `${edge} exit → matrix (${cell.x}, ${cell.y})`, true);
  }
  if (counts.mobile === 0) {
    log("TRANSFER", "All particles are on the LED matrix", true);
  }
  assertParticleConservation("transfer");
  return true;
}

function findFreeMatrixCell(baseCol, baseRow, inwardX, inwardY) {
  const occupied = new Set();
  for (const particle of motion.particles) {
    if (particle.loc === "matrix") occupied.add(particle.mx + "," + particle.my);
  }
  let best = null;
  let bestScore = Infinity;
  for (let y = 0; y < MOTION_CONFIG.ROWS; y++) {
    for (let x = 0; x < MOTION_CONFIG.COLS; x++) {
      if (occupied.has(x + "," + y)) continue;
      const dx = x - baseCol;
      const dy = y - baseRow;
      const distance = Math.abs(dx) + Math.abs(dy);
      const inward = dx * inwardX + dy * inwardY;
      const score = distance + (inward < 0 ? 40 : 0) + (inward === 0 ? 1.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

function stepMatrixParticles(gravity, spin, dt) {
  const matrixParticles = motion.particles.filter((particle) => particle.loc === "matrix");
  if (!matrixParticles.length) return;
  const occupied = new Map();
  for (const particle of matrixParticles) occupied.set(particle.mx + "," + particle.my, particle.id);

  const signX = Math.abs(gravity.x) > 0.03 ? Math.sign(gravity.x) : 0;
  const signY = Math.abs(gravity.y) > 0.03 ? Math.sign(gravity.y) : 0;
  const sorted = matrixParticles.slice().sort((a, b) => {
    const scoreA = a.mx * signX + a.my * signY * MOTION_CONFIG.COLS;
    const scoreB = b.mx * signX + b.my * signY * MOTION_CONFIG.COLS;
    return scoreB - scoreA || a.id - b.id;
  });

  const gravityMagnitude = Math.hypot(gravity.x, gravity.y);
  for (const particle of sorted) {
    let ax = gravity.x * MOTION_CONFIG.MATRIX_GRAVITY;
    let ay = gravity.y * MOTION_CONFIG.MATRIX_GRAVITY;
    if (Math.abs(spin) > 0.05) {
      ax += -gravity.y * spin * MOTION_CONFIG.MATRIX_STIR;
      ay += gravity.x * spin * MOTION_CONFIG.MATRIX_STIR;
    }
    particle.vx += ax * dt;
    particle.vy += ay * dt;

    const damping = Math.exp(-MOTION_CONFIG.MATRIX_FRICTION * dt);
    particle.vx *= damping;
    particle.vy *= damping;
    const speed = Math.hypot(particle.vx, particle.vy);
    if (speed > MOTION_CONFIG.MATRIX_MAX_SPEED) {
      particle.vx = particle.vx / speed * MOTION_CONFIG.MATRIX_MAX_SPEED;
      particle.vy = particle.vy / speed * MOTION_CONFIG.MATRIX_MAX_SPEED;
    }

    if (gravityMagnitude < 0.025 && speed < 0.35) {
      particle.vx = 0;
      particle.vy = 0;
      particle.accX = 0;
      particle.accY = 0;
      continue;
    }

    particle.accX += particle.vx * dt;
    particle.accY += particle.vy * dt;

    const moves = [];
    if (Math.abs(particle.accX) >= 1) moves.push(["x", particle.accX]);
    if (Math.abs(particle.accY) >= 1) moves.push(["y", particle.accY]);
    moves.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

    for (const [axis, amount] of moves) {
      if (axis === "x") {
        const direction = Math.sign(amount);
        particle.accX -= direction;
        const nextX = particle.mx + direction;
        if (nextX < 0 || nextX >= MOTION_CONFIG.COLS) {
          particle.vx = -particle.vx * MOTION_CONFIG.MATRIX_RESTITUTION;
          if (Math.abs(particle.vx) < 0.3) particle.vx = 0;
          particle.accX = 0;
          continue;
        }
        const key = nextX + "," + particle.my;
        if (occupied.has(key) && occupied.get(key) !== particle.id) {
          particle.vx = 0;
          particle.accX = 0;
          particle.rest += dt;
          continue;
        }
        occupied.delete(particle.mx + "," + particle.my);
        occupied.set(key, particle.id);
        particle.mx = nextX;
        particle.rest = 0;
        motion.matrixDirty = true;
        motion.previewDirty = true;
      } else {
        const direction = Math.sign(amount);
        particle.accY -= direction;
        const nextY = particle.my + direction;
        if (nextY < 0 || nextY >= MOTION_CONFIG.ROWS) {
          particle.vy = -particle.vy * MOTION_CONFIG.MATRIX_RESTITUTION;
          if (Math.abs(particle.vy) < 0.3) particle.vy = 0;
          particle.accY = 0;
          continue;
        }
        const key = particle.mx + "," + nextY;
        if (occupied.has(key) && occupied.get(key) !== particle.id) {
          particle.vy = 0;
          particle.accY = 0;
          particle.rest += dt;
          continue;
        }
        occupied.delete(particle.mx + "," + particle.my);
        occupied.set(key, particle.id);
        particle.my = nextY;
        particle.rest = 0;
        motion.matrixDirty = true;
        motion.previewDirty = true;
      }
    }

    particle.accX = clamp(particle.accX, -1.5, 1.5);
    particle.accY = clamp(particle.accY, -1.5, 1.5);
    if (particle.rest > 0.25 && gravityMagnitude < 0.15) {
      particle.vx = 0;
      particle.vy = 0;
      particle.accX = 0;
      particle.accY = 0;
    }
    if (Math.abs(particle.vx) < 0.05 && Math.abs(particle.vy) < 0.05 && gravityMagnitude < 0.015) {
      particle.vx = 0;
      particle.vy = 0;
    }
  }
}

/* -------------------------------------------------------------------------
   MQTT synchronization
   ------------------------------------------------------------------------- */

function handleMqttConnectionChange(connected) {
  if (connected) {
    if (motion.active) setMotionAckState(motion.lastAckSeq >= motion.lastPublishedSeq ? "acked" : "awaiting");
  } else {
    setMotionAckState("mqtt-offline");
  }
}

function setMotionAckState(state) {
  motion.ackState = state;
  updateMotionAckUI();
}

function updateMotionAckUI() {
  const element = $("motionAckState");
  if (!element) return;
  const states = {
    idle: { label: "LOCAL · NOT SYNCED", cls: "local", stat: "waiting" },
    awaiting: { label: `LOCAL · AWAITING ACK ${motion.lastPublishedSeq}`, cls: "local", stat: `seq ${motion.lastPublishedSeq} …` },
    acked: { label: `DEVICE ACK · SEQ ${motion.lastAckSeq}`, cls: "acked", stat: `seq ${motion.lastAckSeq} ✓` },
    timeout: { label: "LOCAL ONLY · NO ACK", cls: "error", stat: "no ack" },
    "mqtt-offline": { label: "MQTT OFFLINE", cls: "error", stat: "offline" },
    "device-offline": { label: "DEVICE OFFLINE", cls: "error", stat: "offline" },
    "publish-error": { label: "PUBLISH ERROR", cls: "error", stat: "error" }
  };
  const info = states[motion.ackState] || states.idle;
  element.textContent = info.label;
  element.className = "ack-state " + info.cls;
  const statAck = $("statAck");
  if (statAck) statAck.textContent = info.stat;
  if (motion.active) {
    const badge = $("ackBadge");
    if (badge) badge.textContent = info.cls === "acked" ? "MOTION SYNCED" : info.cls === "error" ? "MOTION NOT ACKED" : "AWAITING MOTION ACK";
  }
  updateMotionPreviewLabel();
}

function updateMotionPreviewLabel() {
  if (!motion.active) return;
  const label = $("previewLabel");
  if (!label) return;
  if (motion.ackState === "acked") {
    label.textContent = `ESP32 ACK · SEQ ${motion.lastAckSeq}`;
    label.className = "ack";
  } else {
    const counts = motionCounts();
    const suffix = motion.ackState === "timeout" || motion.ackState === "mqtt-offline" || motion.ackState === "device-offline" || motion.ackState === "publish-error"
      ? " · " + motion.ackState.replace("-", " ").toUpperCase()
      : " · NOT DEVICE ACK";
    label.textContent = `LOCAL STATE · ${counts.matrix} LIT${suffix}`;
    label.className = "local";
  }
  $("previewMode").textContent = "MOTION";
}

function publishMotionControl(action) {
  if (!state.client || !state.connected) return false;
  motion.sequence += 1;
  const payload = {
    type: "motion",
    action,
    session: motion.session,
    sequence: motion.sequence,
    experience: motion.experience
  };
  state.client.publish(commandTopic, JSON.stringify(payload), { qos: 0 });
  return true;
}

function publishMotionFrame(force = false) {
  if (!motion.active) return;
  if (!state.client || !state.connected) {
    setMotionAckState("mqtt-offline");
    return;
  }
  const now = performance.now();
  if (!force && now - motion.lastPublishAt < MOTION_CONFIG.SYNC_MS) return;

  const rows = computeMatrixRows();
  const bits = rowsToHex(rows);
  if (!force && bits === motion.lastPublishedBits) {
    motion.matrixDirty = false;
    return;
  }

  motion.sequence += 1;
  const sequence = motion.sequence;
  motion.lastPublishedBits = bits;
  motion.lastPublishedSeq = sequence;
  motion.lastPublishAt = now;
  motion.matrixDirty = false;
  motion.publishErrorLogged = false;
  const counts = motionCounts();
  const payload = {
    type: "motion",
    action: "update",
    session: motion.session,
    sequence,
    particleCount: MOTION_CONFIG.TOTAL,
    mobileCount: counts.mobile,
    matrixCount: counts.matrix,
    matrix: bits
  };

  setMotionAckState("awaiting");
  state.client.publish(commandTopic, JSON.stringify(payload), { qos: 0 }, (error) => {
    if (error && !motion.publishErrorLogged) {
      motion.publishErrorLogged = true;
      setMotionAckState("publish-error");
      log("MOTION", "Motion update publish failed", false, true);
    }
  });

  motion.syncStamps.push(now);
  while (motion.syncStamps.length && now - motion.syncStamps[0] > 2000) motion.syncStamps.shift();
  updateMotionStats(true);
}

function maybePublishMotion(now) {
  if (!motion.active || !motion.matrixDirty) return;
  if (!state.client || !state.connected) return;
  if (now - motion.lastPublishAt < MOTION_CONFIG.SYNC_MS) return;
  publishMotionFrame(false);
}

function resyncMotion(reason) {
  if (!motion.active) return;
  if (!state.client || !state.connected) return;
  const now = performance.now();
  if (now - motion.lastResyncAt < 800) return;
  motion.lastResyncAt = now;
  publishMotionControl("enter");
  motion.lastPublishedBits = null;
  setMotionAckState("awaiting");
  publishMotionFrame(true);
  log("RESYNC", `Full motion state sent (${reason})`);
}

function handleMotionDeviceStatus(message) {
  state.deviceOnline = true;
  $("deviceText").textContent = "ESP32 online";

  if (message.state === "motion_sync") {
    if (message.session && message.session !== motion.session) return;
    const sequence = Number(message.sequence);
    if (Number.isFinite(sequence) && sequence >= motion.lastAckSeq) {
      motion.lastAckSeq = sequence;
      motion.lastAckAt = performance.now();
      setMotionAckState(sequence >= motion.lastPublishedSeq ? "acked" : "awaiting");
    }
  } else if (message.state === "motion_ready") {
    setMotionAckState(motion.lastAckSeq >= motion.lastPublishedSeq ? "acked" : "awaiting");
  } else if (message.state === "motion_exit") {
    setMotionAckState("idle");
  }
  updateMotionAckUI();
}

function motionAckWatchdog(now) {
  if (!motion.active) return;
  if (motion.lastPublishedSeq <= 0) return;
  if (motion.lastPublishedSeq <= motion.lastAckSeq) return;
  if (motion.ackState === "mqtt-offline" || motion.ackState === "device-offline" || motion.ackState === "publish-error") return;
  if (now - motion.lastPublishAt > MOTION_CONFIG.ACK_TIMEOUT_MS) {
    if (motion.ackState !== "timeout") setMotionAckState("timeout");
  }
}

/* -------------------------------------------------------------------------
   Canvas rendering
   ------------------------------------------------------------------------- */

function makeGlowSprite(rgb) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.14, `rgba(${rgb},1)`);
  gradient.addColorStop(0.38, `rgba(${rgb},0.62)`);
  gradient.addColorStop(0.68, `rgba(${rgb},0.18)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

function roundRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function resizeMotionCanvas() {
  const canvas = $("motionCanvas");
  if (!canvas || !motion.ctx) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const width = rect.width;
  const height = rect.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  motion.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const previous = motion.world;
  if (previous.w > 0 && previous.h > 0 && (Math.abs(previous.w - width) > 0.5 || Math.abs(previous.h - height) > 0.5)) {
    const scaleX = width / previous.w;
    const scaleY = height / previous.h;
    for (const particle of motion.particles) {
      if (particle.loc === "mobile") {
        particle.x *= scaleX;
        particle.y *= scaleY;
      }
    }
  }
  motion.world = { w: width, h: height };
  motion.canvasDpr = dpr;
  motion.backgroundKey = "";
  ensureMotionBackground();
}

function ensureMotionBackground() {
  const width = motion.world.w;
  const height = motion.world.h;
  if (width < 2 || height < 2) return;
  const key = `${motion.experience}:${width.toFixed(1)}:${height.toFixed(1)}:${motion.canvasDpr}`;
  if (key === motion.backgroundKey && motion.background) return;
  motion.backgroundKey = key;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * motion.canvasDpr);
  canvas.height = Math.round(height * motion.canvasDpr);
  const context = canvas.getContext("2d");
  context.setTransform(motion.canvasDpr, 0, 0, motion.canvasDpr, 0, 0);
  if (motion.experience === "gravity") drawGravityBackground(context, width, height);
  else drawTransferBackground(context, width, height);
  motion.background = canvas;
}

function drawGravityBackground(context, width, height) {
  context.clearRect(0, 0, width, height);
  const glow = context.createRadialGradient(width / 2, height / 2, 8, width / 2, height / 2, Math.max(width, height) / 2);
  glow.addColorStop(0, "#1b1021");
  glow.addColorStop(0.62, "#0b0c13");
  glow.addColorStop(1, "#070a11");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  const padding = 14;
  const cell = Math.max(4, Math.min((width - padding * 2) / MOTION_CONFIG.COLS, (height - padding * 2) / MOTION_CONFIG.ROWS));
  const gridWidth = cell * MOTION_CONFIG.COLS;
  const gridHeight = cell * MOTION_CONFIG.ROWS;
  const originX = (width - gridWidth) / 2;
  const originY = (height - gridHeight) / 2;
  motion.matrixLayout = { x: originX, y: originY, cell };

  context.strokeStyle = "rgba(74, 55, 69, 0.55)";
  context.lineWidth = 1;
  roundRectPath(context, originX - 7, originY - 7, gridWidth + 14, gridHeight + 14, 9);
  context.stroke();

  const dot = Math.max(1.5, cell * 0.53);
  for (let y = 0; y < MOTION_CONFIG.ROWS; y++) {
    for (let x = 0; x < MOTION_CONFIG.COLS; x++) {
      const centerX = originX + (x + 0.5) * cell;
      const centerY = originY + (y + 0.5) * cell;
      context.beginPath();
      context.arc(centerX, centerY, dot / 2, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 82, 107, 0.075)";
      context.fill();
    }
  }

  context.strokeStyle = "rgba(255, 82, 107, 0.09)";
  context.lineWidth = 1;
  for (let x = 8; x < MOTION_CONFIG.COLS; x += 8) {
    const lineX = originX + x * cell;
    context.beginPath();
    context.moveTo(lineX, originY - 2);
    context.lineTo(lineX, originY + gridHeight + 2);
    context.stroke();
  }

  const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.48)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawTransferBackground(context, width, height) {
  context.clearRect(0, 0, width, height);
  const background = context.createRadialGradient(width / 2, height * 0.45, 20, width / 2, height / 2, Math.max(width, height) * 0.7);
  background.addColorStop(0, "#111a2a");
  background.addColorStop(0.62, "#0a0f19");
  background.addColorStop(1, "#060910");
  context.fillStyle = background;
  roundRectPath(context, 2, 2, width - 4, height - 4, 13);
  context.fill();
  context.strokeStyle = "rgba(72, 91, 120, 0.5)";
  context.lineWidth = 1;
  context.stroke();

  context.save();
  roundRectPath(context, 3, 3, width - 6, height - 6, 12);
  context.clip();

  context.strokeStyle = "rgba(97, 119, 156, 0.075)";
  context.lineWidth = 1;
  for (let x = 22; x < width; x += 26) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 22; y < height; y += 26) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  const glow = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.55);
  glow.addColorStop(0, "rgba(102, 217, 232, 0.06)");
  glow.addColorStop(1, "rgba(102, 217, 232, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(166, 155, 255, 0.35)";
  context.lineWidth = 2;
  const corner = 16;
  const inset = 10;
  const corners = [
    [inset, inset, 1, 1],
    [width - inset, inset, -1, 1],
    [inset, height - inset, 1, -1],
    [width - inset, height - inset, -1, -1]
  ];
  for (const [x, y, dx, dy] of corners) {
    context.beginPath();
    context.moveTo(x + dx * corner, y);
    context.lineTo(x, y);
    context.lineTo(x, y + dy * corner);
    context.stroke();
  }

  context.font = '8px "DM Mono", monospace';
  context.fillStyle = "rgba(102, 217, 232, 0.45)";
  context.textAlign = "center";
  context.fillText("MOBILE PARTICLE CHAMBER", width / 2, 20);
  context.fillStyle = "rgba(140, 155, 180, 0.45)";
  context.fillText("EXIT EDGE → OPPOSITE MATRIX EDGE", width / 2, height - 14);
  context.restore();

  const vignette = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.78);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.4)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawGlow(context, sprite, x, y, size, alpha = 1) {
  if (!sprite) return;
  context.globalAlpha = alpha;
  context.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  context.globalAlpha = 1;
}

function drawMobileParticles(context, now) {
  context.globalCompositeOperation = "lighter";
  for (const particle of motion.particles) {
    if (particle.loc !== "mobile") continue;
    const pulse = 1 + Math.sin(now / 280 + particle.id * 0.7) * 0.08;
    const size = 27 * pulse;
    drawGlow(context, motion.spriteMobile, particle.x, particle.y, size, 0.95);
    context.beginPath();
    context.arc(particle.x, particle.y, MOTION_CONFIG.MOBILE_RADIUS * 0.72, 0, Math.PI * 2);
    context.fillStyle = "rgba(228, 253, 255, 0.9)";
    context.fill();
  }
  context.globalCompositeOperation = "source-over";
}

function drawMatrixParticlesLarge(context, now) {
  const layout = motion.matrixLayout;
  if (!layout) return;
  context.globalCompositeOperation = "lighter";
  for (const particle of motion.particles) {
    if (particle.loc !== "matrix") continue;
    const x = layout.x + (particle.mx + 0.5) * layout.cell;
    const y = layout.y + (particle.my + 0.5) * layout.cell;
    const pulse = 1 + Math.sin(now / 260 + particle.id * 0.65) * 0.1;
    drawGlow(context, motion.spriteMatrix, x, y, layout.cell * 2.35 * pulse, 0.92);
    context.beginPath();
    context.arc(x, y, Math.max(1.2, layout.cell * 0.2), 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 230, 235, 0.95)";
    context.fill();
  }
  context.globalCompositeOperation = "source-over";
}

function drawMobileEffects(context) {
  for (const effect of motion.effects) {
    if (effect.space !== "mobile") continue;
    const progress = 1 - effect.life / effect.max;
    const radius = 5 + progress * 20;
    context.beginPath();
    context.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(102, 217, 232, ${(1 - progress) * 0.8})`;
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawMatrixEffects(context, layout) {
  if (!layout) return;
  for (const effect of motion.effects) {
    if (effect.space !== "matrix") continue;
    const progress = 1 - effect.life / effect.max;
    const x = layout.x + (effect.mx + 0.5) * layout.cell;
    const y = layout.y + (effect.my + 0.5) * layout.cell;
    context.beginPath();
    context.arc(x, y, 2 + progress * layout.cell * 1.5, 0, Math.PI * 2);
    context.strokeStyle = `rgba(255, 82, 107, ${(1 - progress) * 0.9})`;
    context.lineWidth = 2;
    context.stroke();
  }
}

function drawTransferEdgeGlow(context) {
  const width = motion.world.w;
  const height = motion.world.h;
  const gx = motion.gravity.x;
  const gy = motion.gravity.y;
  const threshold = 0.2;
  context.save();
  roundRectPath(context, 3, 3, width - 6, height - 6, 12);
  context.clip();

  if (gx > threshold) {
    const gradient = context.createLinearGradient(width - 54, 0, width, 0);
    gradient.addColorStop(0, "rgba(102, 217, 232, 0)");
    gradient.addColorStop(1, `rgba(102, 217, 232, ${0.17 * Math.min(1, gx)})`);
    context.fillStyle = gradient;
    context.fillRect(width - 54, 0, 54, height);
  } else if (gx < -threshold) {
    const gradient = context.createLinearGradient(54, 0, 0, 0);
    gradient.addColorStop(0, "rgba(102, 217, 232, 0)");
    gradient.addColorStop(1, `rgba(102, 217, 232, ${0.17 * Math.min(1, -gx)})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 54, height);
  }
  if (gy > threshold) {
    const gradient = context.createLinearGradient(0, height - 54, 0, height);
    gradient.addColorStop(0, "rgba(166, 155, 255, 0)");
    gradient.addColorStop(1, `rgba(166, 155, 255, ${0.13 * Math.min(1, gy)})`);
    context.fillStyle = gradient;
    context.fillRect(0, height - 54, width, 54);
  } else if (gy < -threshold) {
    const gradient = context.createLinearGradient(0, 54, 0, 0);
    gradient.addColorStop(0, "rgba(166, 155, 255, 0)");
    gradient.addColorStop(1, `rgba(166, 155, 255, ${0.13 * Math.min(1, -gy)})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, 54);
  }
  context.restore();
}

function drawGravityHud(context, width, height) {
  const gx = motion.gravity.x;
  const gy = motion.gravity.y;
  const magnitude = Math.hypot(gx, gy);
  const centerX = width - 32;
  const centerY = 32;
  if (width < 180) return;
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, 19, 0, Math.PI * 2);
  context.fillStyle = "rgba(6, 10, 17, 0.72)";
  context.fill();
  context.strokeStyle = "rgba(126, 140, 166, 0.35)";
  context.lineWidth = 1;
  context.stroke();

  context.beginPath();
  context.arc(centerX, centerY, 2, 0, Math.PI * 2);
  context.fillStyle = "rgba(166, 155, 255, 0.9)";
  context.fill();
  if (magnitude > 0.04) {
    const nx = gx / magnitude;
    const ny = gy / magnitude;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + nx * 11, centerY + ny * 11);
    context.strokeStyle = "rgba(166, 155, 255, 0.95)";
    context.lineWidth = 2;
    context.stroke();
    context.beginPath();
    context.arc(centerX + nx * 11, centerY + ny * 11, 2.6, 0, Math.PI * 2);
    context.fillStyle = "rgba(230, 226, 255, 0.95)";
    context.fill();
  }
  context.font = '7px "DM Mono", monospace';
  context.fillStyle = "rgba(130, 143, 166, 0.8)";
  context.textAlign = "center";
  context.fillText("GRAVITY", centerX, centerY + 30);
  context.restore();
}

function renderMotionFrame(now) {
  if (!motion.active) return;
  const width = motion.world.w;
  const height = motion.world.h;
  if (width < 2 || height < 2) return;
  ensureMotionBackground();
  const context = motion.ctx;
  context.setTransform(motion.canvasDpr, 0, 0, motion.canvasDpr, 0, 0);
  context.clearRect(0, 0, width, height);
  if (motion.background) context.drawImage(motion.background, 0, 0, width, height);

  if (motion.experience === "gravity") {
    drawMatrixParticlesLarge(context, now);
    drawMatrixEffects(context, motion.matrixLayout);
  } else {
    drawMobileParticles(context, now);
    drawMobileEffects(context);
    drawTransferEdgeGlow(context);
  }
  drawGravityHud(context, width, height);
}

function drawMotionMatrix(rows) {
  const canvas = $("motionMatrixCanvas");
  if (!canvas || !motion.matrixCtx) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(rect.width * dpr);
  const pixelHeight = Math.round(rect.height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const width = rect.width;
  const height = rect.height;
  const context = motion.matrixCtx;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const pitch = Math.max(2, Math.min((width - 20) / MOTION_CONFIG.COLS, (height - 16) / MOTION_CONFIG.ROWS));
  const originX = (width - pitch * MOTION_CONFIG.COLS) / 2;
  const originY = (height - pitch * MOTION_CONFIG.ROWS) / 2;
  const dot = Math.max(1.4, pitch * 0.52);

  for (let y = 0; y < MOTION_CONFIG.ROWS; y++) {
    for (let x = 0; x < MOTION_CONFIG.COLS; x++) {
      const centerX = originX + (x + 0.5) * pitch;
      const centerY = originY + (y + 0.5) * pitch;
      context.beginPath();
      context.arc(centerX, centerY, dot / 2, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 82, 107, 0.08)";
      context.fill();
    }
  }

  context.strokeStyle = "rgba(255, 82, 107, 0.09)";
  context.lineWidth = 1;
  for (let x = 8; x < MOTION_CONFIG.COLS; x += 8) {
    const lineX = originX + x * pitch;
    context.beginPath();
    context.moveTo(lineX, originY - 2);
    context.lineTo(lineX, originY + pitch * MOTION_CONFIG.ROWS + 2);
    context.stroke();
  }

  for (let y = 0; y < MOTION_CONFIG.ROWS; y++) {
    const row = rows[y] || "";
    for (let x = 0; x < MOTION_CONFIG.COLS; x++) {
      if (row[x] !== "1") continue;
      const centerX = originX + (x + 0.5) * pitch;
      const centerY = originY + (y + 0.5) * pitch;
      context.globalCompositeOperation = "lighter";
      drawGlow(context, motion.spriteMatrix, centerX, centerY, Math.max(5, pitch * 2.5), 0.95);
      context.globalCompositeOperation = "source-over";
      context.beginPath();
      context.arc(centerX, centerY, Math.max(1, dot * 0.44), 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 232, 237, 0.98)";
      context.fill();
    }
  }

  for (const effect of motion.effects) {
    if (effect.space !== "matrix") continue;
    const progress = 1 - effect.life / effect.max;
    const centerX = originX + (effect.mx + 0.5) * pitch;
    const centerY = originY + (effect.my + 0.5) * pitch;
    context.beginPath();
    context.arc(centerX, centerY, 2 + progress * pitch * 1.8, 0, Math.PI * 2);
    context.strokeStyle = `rgba(255, 82, 107, ${(1 - progress) * 0.85})`;
    context.lineWidth = 1.5;
    context.stroke();
  }
}

function updateHardwarePreview(rows) {
  const bits = rows.join("");
  if (bits === motion.lastDomBits) return;
  motion.lastDomBits = bits;
  for (let y = 0; y < MOTION_CONFIG.ROWS; y++) {
    const row = rows[y] || "";
    for (let x = 0; x < MOTION_CONFIG.COLS; x++) {
      pixels[y * MOTION_CONFIG.COLS + x].classList.toggle("on", row[x] === "1");
    }
  }
}

function updateMotionMatrixVisuals(force = false) {
  const now = performance.now();
  if (!force && now - motion.lastMatrixVisualAt < MOTION_CONFIG.SYNC_MS) return;
  motion.lastMatrixVisualAt = now;
  const rows = computeMatrixRows();
  drawMotionMatrix(rows);
  if (motion.active) {
    updateHardwarePreview(rows);
    updateMotionPreviewLabel();
  }
  const summary = $("motionMatrixSummary");
  if (summary) summary.textContent = `32 × 8 · ${motionCounts().matrix} LEDs lit`;
}

function decayMotionEffects(dt) {
  if (!motion.effects.length) return;
  for (const effect of motion.effects) effect.life -= dt;
  motion.effects = motion.effects.filter((effect) => effect.life > 0);
}

/* -------------------------------------------------------------------------
   Stats and DOM
   ------------------------------------------------------------------------- */

function updateMotionStats(force = false) {
  const now = performance.now();
  if (!force && now - motion.lastStatsAt < 120) return;
  motion.lastStatsAt = now;
  const counts = motionCounts();
  const total = $("statTotal");
  if (!total) return;
  total.textContent = counts.total;
  $("statMobile").textContent = counts.mobile;
  $("statMatrix").textContent = counts.matrix;
  $("statGravity").textContent = `${signed(motion.gravity.x)} →  ${signed(motion.gravity.y)} ↓`;
  $("statSensor").textContent = motionSensor.touchOverride ? "touch" : motionSensor.paused ? "paused" : motionSensor.status;
  $("statMqtt").textContent = state.connected ? "online" : "offline";
  const syncEl = $("statSync");
  if (syncEl) {
    const rate = motion.syncStamps.filter((stamp) => now - stamp < 1000).length;
    syncEl.textContent = `${rate.toFixed(1)} /s`;
  }
  const summary = $("motionMatrixSummary");
  if (summary) summary.textContent = `32 × 8 · ${counts.matrix} LEDs lit`;

  const stage = $("motionStage");
  if (stage) stage.dataset.experience = motion.experience;
  const label = $("motionStageLabel");
  if (label) label.textContent = motion.experience === "gravity" ? "MATRIX GRAVITY · 32 × 8" : "MOBILE PARTICLE TRANSFER";
  const hint = $("motionStageHint");
  if (hint) {
    if (motionSensor.touchOverride) hint.textContent = "Manual touch gravity input";
    else if (motionSensor.paused) hint.textContent = "Sensor paused · tap Resume";
    else if (motionSensor.status === "calibrating") hint.textContent = "Hold still · calibrating neutral";
    else if (!motionSensor.enabled) hint.textContent = "Enable motion, then tilt the phone";
    else if (motionSensor.status !== "active") hint.textContent = "Waiting for usable sensor data";
    else if (motion.experience === "gravity") hint.textContent = "Tilt to pour gravity through the matrix";
    else if (counts.mobile === 0) hint.textContent = "All particles transferred · reset to refill the phone";
    else hint.textContent = `${counts.mobile} in phone · tilt toward an edge to transfer`;
  }
  updateSensorUI();
  updateMotionAckUI();
}

/* -------------------------------------------------------------------------
   App mode / motion lifecycle
   ------------------------------------------------------------------------- */

function setMode(mode) {
  document.querySelectorAll(".mode-tab").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $("textPanel").classList.toggle("hidden", mode !== "text");
  $("calculatorPanel").classList.toggle("hidden", mode !== "calculator");
  $("motionPanel").classList.toggle("hidden", mode !== "motion");
  $("previewMode").textContent = mode === "motion" ? "MOTION" : mode.toUpperCase();

  if (mode === "motion") {
    enterMotionMode();
  } else {
    if (motion.active) leaveMotionMode();
    $("previewLabel").textContent = "PREVIEW ONLY · NOT DEVICE CONFIRMATION";
    $("previewLabel").className = "";
    if (mode === "text") drawPreview($("textInput").value || "SMARTWRITE");
    else if (mode === "calculator") drawPreview(expression || "");
  }
}

function enterMotionMode() {
  if (motion.active) return;
  motion.active = true;
  motion.accumulator = 0;
  motion.lastFrame = performance.now();
  motion.lastPublishedBits = null;
  motion.lastDomBits = "";
  motion.previewDirty = true;
  motion.backgroundKey = "";
  $("motionStage").dataset.experience = motion.experience;
  resizeMotionCanvas();
  updateMotionMatrixVisuals(true);
  requestAnimationFrame(() => {
    resizeMotionCanvas();
    updateMotionMatrixVisuals(true);
    renderMotionFrame(performance.now());
  });
  updateMotionStats(true);
  updateSensorUI();
  setMotionAckState(state.connected ? "awaiting" : "mqtt-offline");
  publishMotionControl("enter");
  publishMotionFrame(true);
  log("MOTION", motion.experience === "gravity"
    ? "Matrix Gravity opened · 32 particles in the LED chamber"
    : "Particle Transfer opened · 32 particles in the phone chamber", true);
}

function leaveMotionMode() {
  if (!motion.active) return;
  motion.active = false;
  motion.accumulator = 0;
  publishMotionControl("exit");
  motion.ackState = "idle";
  updateMotionAckUI();
  const badge = $("ackBadge");
  if (badge) badge.textContent = "WAITING FOR DEVICE";
  log("MOTION", "Motion mode released · ESP32 exit command sent");
}

/* -------------------------------------------------------------------------
   Engine lifecycle
   ------------------------------------------------------------------------- */

function motionLoop(now) {
  const delta = Math.min(0.06, Math.max(0, (now - (motion.lastFrame || now)) / 1000));
  motion.lastFrame = now;

  if (motion.active) {
    motion.accumulator += delta;
    let iterations = 0;
    while (motion.accumulator >= MOTION_CONFIG.FIXED_DT && iterations < 4) {
      stepMotionPhysics(MOTION_CONFIG.FIXED_DT);
      motion.accumulator -= MOTION_CONFIG.FIXED_DT;
      iterations++;
    }
    if (iterations === 4) motion.accumulator = 0;

    decayMotionEffects(delta);
    renderMotionFrame(now);

    if (motion.previewDirty || motion.effects.length) {
      updateMotionMatrixVisuals(false);
      if (motion.effects.length === 0) motion.previewDirty = false;
    }
    maybePublishMotion(now);
    motionAckWatchdog(now);
    updateMotionStats(false);
    checkSensorHealth(now);
  } else {
    motion.accumulator = 0;
  }
  requestAnimationFrame(motionLoop);
}

function initMotionEngine() {
  motion.particles = createMotionParticles();
  motion.ctx = $("motionCanvas").getContext("2d");
  motion.matrixCtx = $("motionMatrixCanvas").getContext("2d");
  motion.spriteMobile = makeGlowSprite("102,217,232");
  motion.spriteMatrix = makeGlowSprite("255,82,107");
  motion.experience = "gravity";
  motion.initialized = true;
  resetMotionState("gravity", true);

  document.querySelectorAll(".experience-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const experience = button.dataset.experience;
      if (experience === motion.experience) return;
      motion.experience = experience;
      document.querySelectorAll(".experience-btn").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-selected", active ? "true" : "false");
      });
      $("motionStage").dataset.experience = experience;
      resetMotionState(experience, false);
      updateMotionStats(true);
      requestAnimationFrame(() => {
        resizeMotionCanvas();
        updateMotionMatrixVisuals(true);
      });
    });
  });

  $("enableMotionBtn").addEventListener("click", enableMotionSensors);
  const tiltPad = $("tiltPad");
  if (tiltPad) {
    tiltPad.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const parts = (button.dataset.tilt || "0,0").split(",");
      const x = Number(parts[0]) || 0;
      const y = Number(parts[1]) || 0;
      tiltPad.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button && (x || y)));
      if (!x && !y) centerTouchGravity();
      else setTouchGravity(x, y);
      updateMotionMatrixVisuals(true);
    });
  }
  $("calibrateBtn").addEventListener("click", () => startCalibration(false));
  $("pauseMotionBtn").addEventListener("click", toggleSensorPause);
  $("resetMotionBtn").addEventListener("click", () => resetMotionState(motion.experience, false));
  $("sensitivityInput").addEventListener("input", (event) => {
    motionSensitivity = Number(event.target.value) / 100;
    $("sensitivityValue").textContent = motionSensitivity.toFixed(2) + "×";
    applyCalibratedGravity();
    updateMotionStats(true);
  });
  $("sensitivityValue").textContent = motionSensitivity.toFixed(2) + "×";

  initTouchController();

  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => resizeMotionCanvas());
    observer.observe($("motionCanvas"));
  }
  window.addEventListener("resize", resizeMotionCanvas);
  window.addEventListener("orientationchange", () => setTimeout(refreshScreenAngle, 120));
  if (typeof screen !== "undefined" && screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener("change", refreshScreenAngle);
  }
  document.addEventListener("visibilitychange", () => {
    motion.lastFrame = performance.now();
    motion.accumulator = 0;
    motionSensor.lastSampleAt = 0;
  });

  updateMotionStats(true);
  updateSensorUI();
  updateMotionAckUI();
  requestAnimationFrame(motionLoop);

  window.SmartWriteMotion = Object.freeze({
    stats: () => {
      const counts = motionCounts();
      return {
        total: counts.total,
        mobile: counts.mobile,
        matrix: counts.matrix,
        experience: motion.experience,
        active: motion.active,
        uniqueIds: new Set(motion.particles.map((particle) => particle.id)).size,
        gravity: { x: motion.gravity.x, y: motion.gravity.y },
        ackState: motion.ackState,
        sequence: motion.lastPublishedSeq,
        ackSequence: motion.lastAckSeq,
        sensor: {
          status: motionSensor.status,
          enabled: motionSensor.enabled,
          paused: motionSensor.paused,
          source: motionSensor.source,
          calibrated: motionSensor.calibrated,
          touchOverride: motionSensor.touchOverride,
          angle: motionSensor.angle
        }
      };
    },
    particles: () => motion.particles.map((particle) => ({
      id: particle.id,
      loc: particle.loc,
      x: particle.x,
      y: particle.y,
      mx: particle.mx,
      my: particle.my,
      vx: particle.vx,
      vy: particle.vy
    })),
    rows: () => computeMatrixRows(),
    hex: () => rowsToHex(computeMatrixRows()),
    touch: (x, y) => setTouchGravity(Number(x) || 0, Number(y) || 0),
    center: () => centerTouchGravity(),
    open: () => setMode("motion"),
    reset: () => resetMotionState(motion.experience, false),
    selectExperience: (experience) => {
      motion.experience = experience === "transfer" ? "transfer" : "gravity";
      document.querySelectorAll(".experience-btn").forEach((button) => {
        const active = button.dataset.experience === motion.experience;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      $("motionStage").dataset.experience = motion.experience;
      resetMotionState(motion.experience, true);
      updateMotionStats(true);
      requestAnimationFrame(resizeMotionCanvas);
    },
    tick: (seconds = 1) => {
      const steps = Math.max(0, Math.min(900, Math.round(seconds / MOTION_CONFIG.FIXED_DT)));
      for (let i = 0; i < steps; i++) {
        stepMotionPhysics(MOTION_CONFIG.FIXED_DT);
        decayMotionEffects(MOTION_CONFIG.FIXED_DT);
      }
      updateMotionMatrixVisuals(true);
      updateMotionStats(true);
      return window.SmartWriteMotion.stats();
    }
  });
}

initMotionEngine();
updateTextMeta();
drawPreview("SMARTWRITE");
connectMqtt();
