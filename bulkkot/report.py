"""자립형 HTML 관측도 생성.

외부 타일 서버나 CDN 없이 혼자 열리는 파일 하나를 만든다. 지도는 계산에 쓴
바로 그 좌표를 SVG로 그린 것이라, 화면에 보이는 것과 점수가 같은 데이터에서
나온다. 시간 스크러버를 움직이면 프로그램의 각 구간에서 어느 자리가 살아나고
어느 자리가 죽는지가 색으로 바뀐다 — 이 도구의 핵심 주장이 그 움직임이다.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Sequence

from . import datasets, geo
from .model import LaunchSite, Obstacle, Show, Viewpoint
from .scoring import SpotScore
from .visibility import ObstacleField, sight_profile

TITLE = "한강 불꽃 관측도"


def build_payload(
    scores: Sequence[SpotScore],
    sites: Sequence[LaunchSite],
    obstacles: Sequence[Obstacle],
    show: Show,
    field: ObstacleField,
    profile_site_id: str | None = None,
    grid: Sequence[SpotScore] = (),
    data_note: str = "",
) -> dict:
    site_by_id = {s.id: s for s in sites}
    if profile_site_id is None:
        weight: dict[str, float] = {}
        for eff in show.effects:
            weight[eff.site_id] = weight.get(eff.site_id, 0.0) + eff.weight
        profile_site_id = max(weight, key=weight.get) if weight else sites[0].id
    profile_site = site_by_id[profile_site_id]

    spots = []
    for sc in scores:
        entry = sc.to_dict()
        profile = sight_profile(sc.viewpoint, profile_site, field, samples=90)
        entry["profile"] = {
            "site_id": profile_site.id,
            "site_name": profile_site.name,
            "base_elev_m": profile_site.base_elev_m,
            "eye_elev_m": round(sc.viewpoint.eye_elev_m, 1),
            "points": [[round(s), round(z, 1)] for s, z in profile],
        }
        spots.append(entry)

    river = datasets.load_json(datasets.DATA_DIR / "hangang.json")

    return {
        "title": TITLE,
        "show": {
            "name": show.name,
            "date": show.date,
            "start_time": show.start_time,
            "duration_min": show.duration_min,
            "effects": [
                {
                    "id": e.id,
                    "name": e.name,
                    "site_id": e.site_id,
                    "start_min": e.start_min,
                    "end_min": e.end_min,
                    "alt_min_m": e.alt_min_m,
                    "alt_max_m": e.alt_max_m,
                    "weight": e.weight,
                    "spread_m": e.spread_m,
                }
                for e in show.effects
            ],
        },
        "sites": [
            {
                "id": s.id, "name": s.name, "lat": s.lat, "lon": s.lon,
                "base_elev_m": s.base_elev_m, "kind": s.kind, "note": s.note,
            }
            for s in sites
        ],
        "obstacles": [
            {
                "id": o.id, "name": o.name, "kind": o.kind,
                "top_elev_m": o.top_elev_m,
                "outline": [[round(p[0], 6), round(p[1], 6)] for p in o.outline],
            }
            for o in obstacles
        ],
        "river": river,
        "spots": spots,
        "grid": [
            {
                "lat": g.viewpoint.lat, "lon": g.viewpoint.lon,
                "total": round(g.total, 3), "sky": round(g.parts["sky"], 3),
            }
            for g in grid
        ],
        "data_note": data_note,
    }


def render(payload: dict) -> str:
    return _HTML.replace("/*__PAYLOAD__*/null", json.dumps(payload, ensure_ascii=False))


def write(path: str | Path, payload: dict) -> Path:
    out = Path(path)
    out.write_text(render(payload), encoding="utf-8")
    return out


_HTML = r"""<title>한강 불꽃 관측도</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@300;400;600&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
/* 야간 해도(海圖) 한 장. 단일 테마로 의도적으로 고정한다. */
:root{
  --ink:#0e1a24; --ink-2:#152532; --panel:#182936; --line:#28404f;
  --paper:#e9e2d3; --paper-dim:#9fb0bd; --paper-faint:#6d8595;
  --river:#12303d; --signal:#ff6f5b;
  --e0:#33444f; --e1:#7a5540; --e2:#c07a38; --e3:#e8a13f; --e4:#f7d070;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--paper);
  font-family:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;
  font-weight:300;line-height:1.65;-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:"Gowun Batang","Nanum Myeongjo",Georgia,serif;font-weight:700;
  text-wrap:balance;margin:0}
.mono{font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  font-variant-numeric:tabular-nums}
.eyebrow{font-size:11px;letter-spacing:.02em;color:var(--paper-faint);font-weight:400}

header{padding:28px 28px 20px;border-bottom:1px solid var(--line);
  display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;justify-content:space-between}
header h1{font-size:30px;letter-spacing:-.01em}
header .sub{color:var(--paper-dim);font-size:13.5px;max-width:60ch;margin-top:6px}
.badge{border:1px solid var(--line);border-radius:2px;padding:7px 11px;font-size:11.5px;
  color:var(--paper-dim);background:var(--ink-2);max-width:44ch;line-height:1.5}

main{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.95fr);
  gap:0;align-items:stretch;min-height:0}
@media (max-width:1000px){main{grid-template-columns:1fr}}

.chart{padding:20px 24px 8px;min-width:0}
.chart svg{width:100%;height:auto;display:block}
.rail{border-left:1px solid var(--line);padding:20px 22px 40px;min-width:0}
@media (max-width:1000px){.rail{border-left:0;border-top:1px solid var(--line)}}

/* 큐시트 스크러버 */
.cue{margin:6px 0 2px;padding:14px 24px 20px;border-top:1px solid var(--line);
  border-bottom:1px solid var(--line)}
.cue-head{display:flex;justify-content:space-between;align-items:baseline;gap:14px;flex-wrap:wrap}
.cue-now{font-size:15px;color:var(--paper)}
.cue-now b{font-family:"Gowun Batang",serif}
.track{position:relative;height:44px;margin-top:12px}
.band{position:absolute;top:0;height:26px;border:1px solid var(--line);border-radius:1px;
  background:var(--ink-2);font-size:10.5px;color:var(--paper-dim);overflow:hidden;
  white-space:nowrap;padding:4px 6px;cursor:pointer}
.band.on{background:linear-gradient(180deg,#2c4453,#1d3140);border-color:var(--e3);color:var(--paper)}
.ticks{position:absolute;top:30px;left:0;right:0;height:14px;font-size:10px;color:var(--paper-faint)}
.ticks span{position:absolute;transform:translateX(-50%)}
input[type=range]{width:100%;margin-top:14px;accent-color:var(--e3)}
input[type=range]:focus-visible{outline:2px solid var(--e3);outline-offset:3px}

table{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;font-weight:600;font-size:10.5px;letter-spacing:.04em;
  color:var(--paper-faint);padding:0 6px 7px;border-bottom:1px solid var(--line)}
td{padding:7px 6px;border-bottom:1px solid #1e3340;vertical-align:middle}
tr.row{cursor:pointer}
tr.row:hover td{background:#162835}
tr.row.sel td{background:#1d3444}
td.name{max-width:150px}
.pct{display:inline-block;min-width:34px;text-align:right}
.track-mini{display:block;height:4px;border-radius:2px;margin-top:4px;background:#1f333f;
  overflow:hidden}
.track-mini i{display:block;height:100%;border-radius:2px}
.chip{display:inline-block;font-size:9.5px;letter-spacing:.06em;border:1px solid var(--line);
  border-radius:2px;padding:1px 5px;color:var(--paper-faint);margin-left:5px;vertical-align:1px}
.chip.warn{color:var(--signal);border-color:#5a3630}

.detail{margin:14px 0 8px;padding-top:16px;border-top:1px solid var(--line);
  display:grid;grid-template-columns:minmax(230px,340px) minmax(0,1fr);gap:6px 26px;
  align-items:start}
.detail > .eyebrow, .detail > h3{grid-column:1 / -1}
.detail h3{font-size:19px;margin-bottom:2px}
@media (max-width:720px){.detail{grid-template-columns:1fr}}
.kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;font-size:12.5px;margin-top:4px}
.kv dt{color:var(--paper-faint)}
.kv dd{margin:0}
.section-svg{width:100%;background:var(--ink-2);border:1px solid var(--line)}
.section-note{grid-column:2;margin-top:6px}
@media (max-width:720px){.section-note{grid-column:1}}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--paper-dim);
  padding:10px 24px 26px}
.legend i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;
  vertical-align:-1px}
footer{padding:18px 28px 34px;border-top:1px solid var(--line);color:var(--paper-faint);
  font-size:11.5px;line-height:1.7}
.toggles{display:flex;gap:16px;font-size:11.5px;color:var(--paper-dim);margin-top:12px;flex-wrap:wrap}
label.tog{cursor:pointer;user-select:none}
@media (prefers-reduced-motion:no-preference){
  .spot,.band,.pulse{transition:fill .25s ease,opacity .25s ease,r .25s ease}
}
</style>

<header>
  <div>
    <div class="eyebrow">가시선 계산 · 최소 가시 고도</div>
    <h1>한강 불꽃 관측도</h1>
    <p class="sub" id="subtitle"></p>
  </div>
  <div class="badge" id="databadge"></div>
</header>

<div class="cue">
  <div class="cue-head">
    <div class="cue-now" id="cuenow"></div>
    <div class="eyebrow mono" id="cueclock"></div>
  </div>
  <div class="track" id="track"><div class="ticks" id="ticks"></div></div>
  <input type="range" id="time" min="0" max="70" step="1" value="0" aria-label="프로그램 경과 시간(분)">
  <div class="toggles">
    <label class="tog"><input type="checkbox" id="tgFamous" checked> 이미 유명한 명당도 표시</label>
    <label class="tog"><input type="checkbox" id="tgGrid"> 격자 탐색 결과</label>
    <label class="tog"><input type="checkbox" id="tgObs" checked> 차폐물</label>
  </div>
</div>

<main>
  <div class="chart">
    <svg id="map" role="img" aria-label="한강 일대 불꽃 가시성 지도"></svg>
    <div class="legend" id="legend"></div>
    <div class="detail" id="detail"></div>
  </div>
  <aside class="rail">
    <div class="eyebrow">지금 이 순간 보이는 정도</div>
    <table>
      <thead><tr><th>자리</th><th>보임</th><th>거리</th><th>최소고도</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </aside>
</main>

<footer id="footer"></footer>

<script>
const DATA = /*__PAYLOAD__*/null;

/* ---------- 투영 ---------- */
const W = 1000, PAD = 26;
const allPts = [];
for (const s of DATA.spots) allPts.push([s.lat, s.lon]);
for (const s of DATA.sites) allPts.push([s.lat, s.lon]);
for (const p of DATA.river.centerline) allPts.push(p);
const latMin = Math.min(...allPts.map(p=>p[0])), latMax = Math.max(...allPts.map(p=>p[0]));
const lonMin = Math.min(...allPts.map(p=>p[1])), lonMax = Math.max(...allPts.map(p=>p[1]));
const midLat = (latMin+latMax)/2, kx = Math.cos(midLat*Math.PI/180);
const spanX = (lonMax-lonMin)*kx, spanY = (latMax-latMin);
const scale = (W-2*PAD)/spanX;
const H = Math.round(spanY*scale) + 2*PAD;
const offX = PAD, offY = PAD;
const px = (lat,lon)=>[offX + (lon-lonMin)*kx*scale, offY + (latMax-lat)*scale];
const metersToPx = 1/111320*scale;

/* ---------- 색 ---------- */
const RAMP = ['--e0','--e1','--e2','--e3','--e4'].map(v=>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim());
function rampColor(f){
  if (f <= 0) return RAMP[0];
  const t = Math.min(1, f) * (RAMP.length-1);
  const i = Math.min(RAMP.length-2, Math.floor(t)), k = t-i;
  return mix(RAMP[i], RAMP[i+1], k);
}
function mix(a,b,t){
  const pa=[1,3,5].map(i=>parseInt(a.substr(i,2),16));
  const pb=[1,3,5].map(i=>parseInt(b.substr(i,2),16));
  return '#'+pa.map((v,i)=>Math.round(v+(pb[i]-v)*t).toString(16).padStart(2,'0')).join('');
}

const LABELLED = new Set(
  [...DATA.spots].sort((a,b)=>b.total-a.total).slice(0,6).map(s=>s.id));

/* ---------- 상태 ---------- */
let minute = 0, selected = DATA.spots.length ? DATA.spots[0].id : null;
const spotById = Object.fromEntries(DATA.spots.map(s=>[s.id,s]));
const siteById = Object.fromEntries(DATA.sites.map(s=>[s.id,s]));

function activeEffects(m){
  return DATA.show.effects.filter(e => m >= e.start_min && m < e.end_min);
}
/* 한 자리가 지금 이 순간 얼마나 보이는가 = 진행 중인 연출들의 가중 가시율 */
function visibilityAt(spot, m){
  const acts = activeEffects(m);
  if (!acts.length) return {frac:0, effects:[]};
  let num=0, den=0;
  for (const e of acts){
    const st = spot.sights[e.site_id];
    if (!st) continue;
    const mva = st.min_visible_alt_m;
    const span = e.alt_max_m - e.alt_min_m;
    let f;
    if (span <= 0) f = mva <= e.alt_min_m ? 1 : 0;
    else f = Math.max(0, Math.min(1, (e.alt_max_m - Math.max(mva, e.alt_min_m)) / span));
    num += e.weight*f; den += e.weight;
  }
  return {frac: den ? num/den : 0, effects: acts};
}

/* ---------- 지도 ---------- */
function drawMap(){
  const svg = document.getElementById('map');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const acts = activeEffects(minute);
  const liveSites = new Set(acts.map(e=>e.site_id));
  const showObs = document.getElementById('tgObs').checked;
  const showFamous = document.getElementById('tgFamous').checked;
  const showGrid = document.getElementById('tgGrid').checked;
  let out = '';

  // 강
  const rw = Math.max(3, DATA.river.width_m * metersToPx);
  const path = DATA.river.centerline.map((p,i)=>{const [x,y]=px(p[0],p[1]);
    return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);}).join(' ');
  out += `<path d="${path}" fill="none" stroke="var(--river)" stroke-width="${rw.toFixed(1)}"
            stroke-linecap="round" stroke-linejoin="round"/>`;
  out += `<path d="${path}" fill="none" stroke="#1d4152" stroke-width="1" opacity=".7"/>`;

  // 차폐물
  if (showObs){
    for (const o of DATA.obstacles){
      const pts = o.outline.map(p=>{const [x,y]=px(p[0],p[1]); return x.toFixed(1)+','+y.toFixed(1);}).join(' ');
      if (o.kind === 'ridge'){
        out += `<polyline points="${pts}" fill="none" stroke="#3b5a58" stroke-width="2.4"
                  stroke-dasharray="1 4" stroke-linecap="round"><title>${o.name} · 정상 ${o.top_elev_m}m</title></polyline>`;
      } else {
        const a = Math.min(.5, .16 + o.top_elev_m/900);
        out += `<polygon points="${pts}" fill="rgba(150,170,185,${a.toFixed(2)})"
                  stroke="#4b6273" stroke-width=".6"><title>${o.name} · 상단 ${o.top_elev_m}m</title></polygon>`;
      }
    }
  }

  // 격자 탐색
  if (showGrid){
    for (const g of DATA.grid){
      const [x,y] = px(g.lat,g.lon);
      out += `<rect x="${(x-2.2).toFixed(1)}" y="${(y-2.2).toFixed(1)}" width="4.4" height="4.4"
                fill="${rampColor(g.sky)}" opacity=".62"/>`;
    }
  }

  // 발사 지점 + 지금 올라가는 고도대
  for (const s of DATA.sites){
    const [x,y] = px(s.lat,s.lon);
    const live = liveSites.has(s.id);
    if (live){
      const e = acts.find(a=>a.site_id===s.id);
      const r = Math.max(6, (e.spread_m/2) * metersToPx * 2.2);
      out += `<circle class="pulse" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
                fill="none" stroke="var(--e3)" stroke-width="1.1" opacity=".55"/>`;
    }
    out += `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${live?5.4:3.4}"
              fill="${live?'var(--signal)':'#7d4b45'}"/>
            <title>${s.name} · 발사면 표고 ${s.base_elev_m}m</title></g>`;
  }

  // 관람 후보지
  for (const sp of DATA.spots){
    if (sp.famous && !showFamous) continue;
    const [x,y] = px(sp.lat,sp.lon);
    const v = visibilityAt(sp, minute);
    const r = 4.5 + 5.5*sp.total;
    const sel = sp.id === selected;
    out += `<g class="spot-g" data-id="${sp.id}" style="cursor:pointer">
      <circle class="spot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"
        fill="${rampColor(v.frac)}" stroke="${sel?'var(--paper)':'#0e1a24'}" stroke-width="${sel?1.8:1}"/>
      <title>${sp.name} — 지금 ${(v.frac*100).toFixed(0)}% 보임</title></g>`;
    if (sel || LABELLED.has(sp.id)){
      out += `<text x="${(x+r+5).toFixed(1)}" y="${(y+3.5).toFixed(1)}" font-size="10.5"
                fill="${sel?'var(--paper)':'var(--paper-dim)'}"
                font-family="IBM Plex Sans KR, sans-serif">${sp.name}</text>`;
    }
  }
  svg.innerHTML = out;
  svg.querySelectorAll('.spot-g').forEach(g=>{
    g.addEventListener('click', ()=>{ selected = g.dataset.id; renderAll(); });
  });
}

/* ---------- 큐시트 ---------- */
function drawTrack(){
  const track = document.getElementById('track');
  const dur = DATA.show.duration_min;
  track.querySelectorAll('.band').forEach(b=>b.remove());
  DATA.show.effects.forEach((e,i)=>{
    const d = document.createElement('div');
    d.className = 'band' + ((minute>=e.start_min && minute<e.end_min) ? ' on' : '');
    d.style.left = (100*e.start_min/dur)+'%';
    d.style.width = (100*(e.end_min-e.start_min)/dur)+'%';
    d.style.top = (i%2 ? 0 : 0) + 'px';
    d.textContent = e.name;
    d.title = `${e.name} · ${e.start_min}~${e.end_min}분 · 고도 ${e.alt_min_m}~${e.alt_max_m}m`;
    d.addEventListener('click', ()=>{ minute = e.start_min; document.getElementById('time').value = minute; renderAll(); });
    track.appendChild(d);
  });
  const ticks = document.getElementById('ticks');
  ticks.innerHTML = '';
  for (let m=0; m<=dur; m+=10){
    const s = document.createElement('span');
    s.style.left = (100*m/dur)+'%';
    s.textContent = m+'분';
    ticks.appendChild(s);
  }
}

function km(m){ return m < 1000 ? `${Math.round(m)}m` : `${(m/1000).toFixed(2)}km`; }

function hhmm(startTime, addMin){
  const [h,m] = startTime.split(':').map(Number);
  const t = h*60+m+addMin;
  return String(Math.floor(t/60)%24).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
}

/* ---------- 표 ---------- */
function drawRows(){
  const showFamous = document.getElementById('tgFamous').checked;
  const rows = DATA.spots
    .filter(s=>showFamous || !s.famous)
    .map(s=>({s, v:visibilityAt(s, minute)}))
    .sort((a,b)=> b.v.frac - a.v.frac || b.s.total - a.s.total);
  document.getElementById('rows').innerHTML = rows.map(({s,v})=>{
    const thin = Object.values(s.sights).some(x=>x.data_thin);
    const main = s.sights[s.profile.site_id] || Object.values(s.sights)[0];
    return `<tr class="row ${s.id===selected?'sel':''}" data-id="${s.id}">
      <td class="name">${s.name}${s.famous?'<span class="chip">알려진 곳</span>':''}
        ${thin?'<span class="chip warn">데이터 밖</span>':''}</td>
      <td><span class="pct mono">${(v.frac*100).toFixed(0)}%</span>
        <span class="track-mini"><i style="width:${(v.frac*100).toFixed(0)}%;background:${rampColor(v.frac)}"></i></span></td>
      <td class="mono">${(s.distance_m/1000).toFixed(1)}km</td>
      <td class="mono">${main ? main.min_visible_alt_m.toFixed(0)+'m' : '—'}</td>
    </tr>`;
  }).join('');
  document.querySelectorAll('tr.row').forEach(tr=>{
    tr.addEventListener('click', ()=>{ selected = tr.dataset.id; renderAll(); });
  });
}

/* ---------- 시선 단면도 ---------- */
function drawDetail(){
  const sp = spotById[selected];
  const el = document.getElementById('detail');
  if (!sp){ el.innerHTML = ''; return; }
  const pr = sp.profile;
  const st = sp.sights[pr.site_id];
  const acts = activeEffects(minute);
  const act = acts.find(e=>e.site_id===pr.site_id) || acts[0];

  const w = 460, h = 190, pad = {l:34,r:10,t:12,b:22};
  const total = pr.points.length ? pr.points[pr.points.length-1][0] : 1;
  const topZ = Math.max(st.min_visible_alt_m + pr.base_elev_m, ...pr.points.map(p=>p[1]),
                        act ? act.alt_max_m + pr.base_elev_m : 0) * 1.15 + 20;
  const X = s => pad.l + (w-pad.l-pad.r) * (s/total);
  const Y = z => h - pad.b - (h-pad.t-pad.b) * (z/topZ);

  let g = `<rect x="0" y="0" width="${w}" height="${h}" fill="none"/>`;
  for (let i=0;i<=4;i++){
    const z = topZ*i/4;
    g += `<line x1="${pad.l}" y1="${Y(z).toFixed(1)}" x2="${w-pad.r}" y2="${Y(z).toFixed(1)}"
            stroke="#233b49" stroke-width=".7"/>
          <text x="4" y="${(Y(z)+3.5).toFixed(1)}" font-size="9" fill="#6d8595"
            font-family="IBM Plex Mono, monospace">${z.toFixed(0)}</text>`;
  }
  // 차폐 단면
  const area = pr.points.map(p=>`${X(p[0]).toFixed(1)},${Y(Math.max(p[1],0)).toFixed(1)}`).join(' ');
  g += `<polyline points="${X(0).toFixed(1)},${Y(0).toFixed(1)} ${area} ${X(total).toFixed(1)},${Y(0).toFixed(1)}"
          fill="#22384a" stroke="#3f5b6d" stroke-width=".8"/>`;
  // 시선 (최소 가시 고도)
  const zEnd = pr.base_elev_m + st.min_visible_alt_m;
  g += `<line x1="${X(0).toFixed(1)}" y1="${Y(pr.eye_elev_m).toFixed(1)}"
          x2="${X(total).toFixed(1)}" y2="${Y(zEnd).toFixed(1)}"
          stroke="var(--e3)" stroke-width="1.4" stroke-dasharray="5 3"/>`;
  // 지금 연출의 고도대와, 그 대역 한가운데를 향한 시선
  if (act){
    const y1 = Y(pr.base_elev_m + act.alt_max_m), y2 = Y(pr.base_elev_m + act.alt_min_m);
    g += `<rect x="${(X(total)-13).toFixed(1)}" y="${y1.toFixed(1)}" width="13"
            height="${Math.max(2,(y2-y1)).toFixed(1)}" fill="var(--signal)" opacity=".45"/>`;
    const mid = pr.base_elev_m + (act.alt_min_m + act.alt_max_m)/2;
    const clear = mid >= zEnd;
    g += `<line x1="${X(0).toFixed(1)}" y1="${Y(pr.eye_elev_m).toFixed(1)}"
            x2="${X(total).toFixed(1)}" y2="${Y(mid).toFixed(1)}"
            stroke="${clear ? 'var(--e4)' : 'var(--signal)'}" stroke-width="1.6" opacity=".9"/>`;
  }
  g += `<circle cx="${X(0).toFixed(1)}" cy="${Y(pr.eye_elev_m).toFixed(1)}" r="3" fill="var(--paper)"/>`;

  const blocker = st.limiting
    ? `${st.limiting.name} (${km(st.limiting.distance_m)} 앞, 상단 ${st.limiting.top_elev_m.toFixed(0)}m)`
    : '없음 — 시선이 트여 있음';
  el.innerHTML = `
    <div class="eyebrow">선택한 자리 — 지도나 표에서 다른 자리를 누르면 바뀝니다</div>
    <h3>${sp.name}</h3>
    <div><dl class="kv">
      <dt>최소 가시 고도</dt><dd class="mono">${st.min_visible_alt_m.toFixed(0)} m 이상에서 터져야 보임</dd>
      <dt>시선을 막는 것</dt><dd>${blocker}</dd>
      <dt>거리 · 방위</dt><dd class="mono">${(sp.distance_m/1000).toFixed(2)} km · ${sp.compass} (${sp.bearing_deg.toFixed(0)}°)</dd>
      <dt>정점 올려각</dt><dd class="mono">${sp.apex_angle_deg.toFixed(1)}°</dd>
      <dt>종합 점수</dt><dd class="mono">${(sp.total*100).toFixed(0)} / 100</dd>
      ${sp.note?`<dt>메모</dt><dd>${sp.note}</dd>`:''}
    </dl></div>
    <div><svg class="section-svg" viewBox="0 0 ${w} ${h}" role="img"
      aria-label="${sp.name}에서 ${pr.site_name}까지의 시선 단면">${g}</svg>
    <div class="eyebrow section-note">${pr.site_name}까지의 시선 단면 · 세로축 표고(m) ·
      점선 = 이 자리에서 겨우 보이기 시작하는 높이, 실선 = 지금 터지는 높이</div></div>`;
}

/* ---------- 헤더/범례 ---------- */
function drawStatic(){
  document.getElementById('subtitle').textContent =
    `${DATA.show.name} — 발사 지점의 고도와 앞을 막은 건물·능선만으로, 각 자리에서 "몇 m 위에서 터져야 보이는지"를 계산했다.`;
  document.getElementById('databadge').textContent = DATA.data_note;
  document.getElementById('legend').innerHTML =
    [[0,'안 보임'],[0.25,'일부만'],[0.5,'절반'],[0.8,'대부분'],[1,'전부']]
      .map(([f,l])=>`<span><i style="background:${rampColor(f)}"></i>${l}</span>`).join('')
    + `<span><i style="background:var(--signal)"></i>발사 지점</span>`
    + `<span style="color:var(--paper-faint)">원 크기 = 종합 점수</span>`;
  document.getElementById('footer').innerHTML =
    `계산 근거: 관람자의 눈높이에서 발사 지점 상공으로 시선을 그은 뒤, 그 위에 걸친 건물·능선이 요구하는
     최소 도착 표고를 모두 구해 그 최댓값을 취한다. 지구 곡률과 대기 굴절(k=0.13)을 반영한다.
     · 데이터를 바꾸면 결과가 바뀐다 — 좌표·높이·프로그램은 모두 JSON 파일 한 벌이다.`;
  document.getElementById('time').max = DATA.show.duration_min;
}

function renderAll(){
  const acts = activeEffects(minute);
  document.getElementById('cuenow').innerHTML = acts.length
    ? `<b>${acts.map(e=>e.name).join(' + ')}</b> · 고도 ${Math.min(...acts.map(e=>e.alt_min_m))}~${Math.max(...acts.map(e=>e.alt_max_m))}m`
    : '<b>대기</b> · 발사 없음';
  document.getElementById('cueclock').textContent =
    `${hhmm(DATA.show.start_time, minute)} · 시작 후 ${minute}분`;
  drawTrack(); drawMap(); drawRows(); drawDetail();
}

document.getElementById('time').addEventListener('input', e=>{
  minute = Number(e.target.value); renderAll();
});
['tgFamous','tgGrid','tgObs'].forEach(id=>
  document.getElementById(id).addEventListener('change', renderAll));

drawStatic();
renderAll();
</script>
"""
