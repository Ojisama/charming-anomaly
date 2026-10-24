// The page the Ophan's painters were written on: the approved mock-up's globals (src2.html:257-285), as imports, and
// the registries the painter files fill in (OPHAN[look], OPHAN_HANDS[look]). Render-side only: it touches the DOM at
// module scope, so sim imports rig.js and hit.js and never this.
import RIG from './rig.js'
export { hh } from './rig.js'
export const OPHAN_RIG = RIG
export const OPHAN = {}, OPHAN_HANDS = {}, OPHAN_HANDKIT = {}
export const STY = [
  { id:'macro',  ch:'Topsoil', name:'Macro lens',    col:'#c08552' },
  { id:'holo',   ch:'Geode',   name:'Holo foil',     col:'#9b8cff' },
  { id:'ascii',  ch:'Mine',    name:'ASCII',         col:'#e8b04a' },
  { id:'pixel',  ch:'Magma',   name:'Pixel CRT',     col:'#ff6a1a' },
  { id:'toon',   ch:'Mantle',  name:'Rubber-hose',   col:'#d8452a' },
  { id:'liquid', ch:'Core',    name:'Liquid chrome', col:'#9fb4c8' },
];

export const TAU = Math.PI*2, W = 360, H = 600, PX = 4, INK = '#120b08';
export const mk = (w,h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w|0); c.height = Math.max(1, h|0); return c; };
export const grain = mk(128,128); { const g = grain.getContext('2d'); g.fillStyle = '#4a2f1f'; g.fillRect(0,0,128,128);
  for (let k=0;k<1400;k++){ const l=Math.random(); g.fillStyle = l<.5 ? `rgba(25,14,8,${.2+.5*Math.random()})` : `rgba(${150+70*l|0},${98+50*l|0},${60+30*l|0},${.1+.3*Math.random()})`; g.beginPath(); g.arc(Math.random()*128, Math.random()*128, .3+Math.random()*2, 0, TAU); g.fill(); } }
export const paper = mk(128,128); { const g = paper.getContext('2d'); g.fillStyle = '#efe0bf'; g.fillRect(0,0,128,128);
  for (let k=0;k<900;k++){ g.fillStyle = `rgba(90,60,30,${Math.random()*.12})`; g.fillRect(Math.random()*128, Math.random()*128, 1, 1); } }

// ---------- colour helpers ----------
export const rgb = hex => { const n = parseInt(hex.slice(1),16); return [n>>16, n>>8&255, n&255]; };
export function shade(hex, k){ let [r,g,b] = rgb(hex); const f = k<0 ? 1+k : 1, a = k>0 ? k : 0;
  r = r*f + (255-r)*a; g = g*f + (255-g)*a; b = b*f + (255-b)*a; return `rgb(${r|0},${g|0},${b|0})`; }
export function mix(a, b, k){ const A = rgb(a), B = rgb(b); return `rgb(${A.map((v,i) => v + (B[i]-v)*k | 0).join(',')})`; }
export const tone = (col, s) => shade(col, Math.max(-.85, Math.min(.85, (s - .6)*1.3)));
export function hue(hex){ const [r,g,b] = rgb(hex).map(v => v/255), mx = Math.max(r,g,b), mn = Math.min(r,g,b); if (mx===mn) return 0;
  const h = mx===r ? (g-b)/(mx-mn) : mx===g ? 2+(b-r)/(mx-mn) : 4+(r-g)/(mx-mn); return (h*60+360)%360; }
export function sheen(c, x0, y0, x1, y1, t, a){ const g = c.createLinearGradient(x0, y0, x1, y1);
  for (let k=0;k<=6;k++) g.addColorStop(k/6, `hsla(${(k*60 + t*60)%360},90%,65%,${a})`); return g; }
