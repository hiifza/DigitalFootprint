/* DigitalFootprint Mirror — JS Engine */
'use strict';

// ── CHART DEFAULTS (top-level, always available) ──────────────
const CD = {
  tick:    { color: 'rgba(220,224,248,.38)', font: { size: 10 } },
  grid:    { color: 'rgba(255,255,255,.05)' },
  tooltip: {
    backgroundColor: 'rgba(8,11,20,.95)',
    titleColor: '#9b5fff',
    bodyColor:  '#eef0f8',
    borderColor:'rgba(155,95,255,.22)',
    borderWidth: 1
  }
};

// ── API BASE ───────────────────────────────────────────────────
const API_BASE = window.location.protocol === 'file:'
  ? 'http://localhost:5000'
  : '';

async function api(path, opts) {
  opts = opts || {};
  const res = await fetch(API_BASE + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res;
}

// ── STATE ─────────────────────────────────────────────────────
const S = {
  screen: 'land',
  tab:    'risk',
  user:   null,
  streak: 0,
  risks:  { pw:0, soc:0, net:0, phi:0, dev:0, total:0 },
  history:[],
  ci:     {},   // charts inited
  ch:     {},   // chart instances
  simOn:  false,
  simFr:  null,
  ethical:false,
  simNodes:[], simParts:[]
};

// ── HELPERS ───────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const cb = id => $( id) ? $(id).checked : false;
const sl = id => $(id) ? (parseInt($(id).value) || 0) : 0;
const clamp = (v, lo, hi) => Math.max(lo||0, Math.min(hi||100, v));

function setBtn(id, loading, txt) {
  const el = $(id); if (!el) return;
  el.disabled = loading;
  el.innerHTML = loading ? '<span class="spin"></span> ' + txt : txt;
}

function showMsg(id, txt, type) {
  const el = $(id); if (!el) return;
  el.className = 'al ' + (type === 'ok' ? 'al-s show' : 'al-e show');
  el.textContent = txt;
}
function clearMsg(id) {
  const el = $(id); if (!el) return;
  el.className = el.className.includes('al-s') ? 'al al-s' : 'al al-e';
  el.textContent = '';
}

// ── SCREEN NAV ────────────────────────────────────────────────
function goTo(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $('s-' + name);
  if (!el) return;
  el.classList.add('active');
  S.screen = name;
  if (name === 'dash') {
    setTimeout(function() { initCharts(); loadHistory(); loadMe(); }, 100);
  }
}

// ── AUTH TABS ─────────────────────────────────────────────────
function switchTab(t) {
  $('at-login').classList.toggle('on', t === 'login');
  $('at-reg').classList.toggle('on',   t === 'register');
  $('fp-login').classList.toggle('on', t === 'login');
  $('fp-reg').classList.toggle('on',   t === 'register');
  ['l-err','l-ok','r-err','r-ok'].forEach(clearMsg);
}

// ── LOGIN ─────────────────────────────────────────────────────
async function doLogin() {
  ['l-err','l-ok'].forEach(clearMsg);
  const u = ($('l-user').value || '').trim();
  const p = $('l-pass').value || '';
  if (!u || !p) { showMsg('l-err', 'Please fill in all fields'); return; }
  setBtn('btn-li', true, 'Signing in...');
  try {
    const res = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (!res.ok) { showMsg('l-err', data.error || 'Login failed'); return; }
    S.user = data.username;
    showMsg('l-ok', 'Welcome back, ' + data.username + '!', 'ok');
    setTimeout(function() { goTo('dash'); }, 700);
  } catch (e) {
    showMsg('l-err', 'Cannot reach server. Run: python dfm.py — then open http://localhost:5000');
  } finally {
    setBtn('btn-li', false, 'Sign In →');
  }
}

// ── REGISTER ─────────────────────────────────────────────────
async function doRegister() {
  ['r-err','r-ok'].forEach(clearMsg);
  const u = ($('r-user').value || '').trim();
  const p = $('r-pass').value || '';
  const c = $('r-conf').value || '';
  if (!u || !p || !c) { showMsg('r-err', 'Please fill in all fields'); return; }
  if (p !== c)         { showMsg('r-err', 'Passwords do not match'); return; }
  if (p.length < 8)    { showMsg('r-err', 'Password must be at least 8 characters'); return; }
  setBtn('btn-reg', true, 'Creating...');
  try {
    const res = await api('/register', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (!res.ok) { showMsg('r-err', data.error || 'Registration failed'); return; }
    S.user = data.username;
    showMsg('r-ok', 'Account created! Loading dashboard...', 'ok');
    setTimeout(function() { goTo('dash'); }, 800);
  } catch (e) {
    showMsg('r-err', 'Cannot reach server. Run: python dfm.py — then open http://localhost:5000');
  } finally {
    setBtn('btn-reg', false, 'Create Account →');
  }
}

// ── LOGOUT ───────────────────────────────────────────────────
async function doLogout() {
  try { await api('/logout'); } catch(e) {}
  S.user = null;
  goTo('land');
}

// ── LOAD ME ──────────────────────────────────────────────────
async function loadMe() {
  try {
    const res = await api('/me');
    if (!res.ok) { goTo('auth'); return; }
    const d = await res.json();
    S.user   = d.username;
    S.streak = d.streak || 0;
    $('nav-u').textContent      = d.username;
    $('nav-streak').textContent = '🔥 ' + S.streak;
    if (d.username === 'admin') $('adm-tab').classList.remove('hidden');
  } catch(e) {}
}

// ── DASH TABS ────────────────────────────────────────────────
function switchDashTab(t) {
  S.tab = t;
  document.querySelectorAll('.ntab').forEach(function(el) {
    el.classList.toggle('on', el.dataset.tab === t);
  });
  document.querySelectorAll('.tab-p').forEach(function(el) {
    el.classList.remove('on');
  });
  const panel = $('tab-' + t);
  if (panel) panel.classList.add('on');

  if (t === 'tl')  loadHistory();
  if (t === 'adm') loadAdmin();
  if (t === 'br')  renderBreach();
  if (t === 'bp')  renderBlueprint();
  if (t === 'sim') initSim();
}

// ── RISK CALCS ───────────────────────────────────────────────
function calcPW() {
  const reuse = sl('sl-reuse');
  $('v-reuse').textContent = reuse;
  let s = reuse * 2;
  if (cb('c-email')) s += 15;
  if (cb('c-bank'))  s += 25;
  if (cb('c-2fa'))   s -= 20;
  return clamp(s);
}

function calcSoc() {
  let s = 0;
  if (cb('c-pub'))   s += 20;
  if (cb('c-bday'))  s += 15;
  if (cb('c-phone')) s += 25;
  if (cb('c-loc'))   s += 20;
  const posts = sl('sl-posts');
  $('v-posts').textContent = posts;
  s += posts > 10 ? 20 : posts > 5 ? 10 : posts > 2 ? 5 : 0;
  return clamp(s);
}

function calcNet() {
  let s = 0;
  if (cb('c-wifi'))  s += 20;
  if (cb('c-bwifi')) s += 35;
  if (cb('c-auto'))  s += 15;
  if (cb('c-vpn'))   s -= 20;
  return clamp(s);
}

function calcPhi() {
  let s = 0;
  if (cb('c-lnk')) s += 25;
  if (cb('c-urg')) s += 20;
  if (cb('c-att')) s += 30;
  if (cb('c-url')) s -= 20;
  return clamp(s);
}

function calcDev() {
  let s = 0;
  if (cb('c-lock')) s += 20;
  if (cb('c-upd'))  s += 25;
  if (cb('c-av'))   s += 30;
  if (cb('c-unk'))  s += 20;
  if (cb('c-enc'))  s += 25;
  return clamp(s);
}

function recalc() {
  const pw  = calcPW();
  const soc = calcSoc();
  const net = calcNet();
  const phi = calcPhi();
  const dev = calcDev();
  const total = clamp(pw*0.35 + soc*0.20 + net*0.15 + phi*0.15 + dev*0.15);
  S.risks = { pw, soc, net, phi, dev, total };

  updMod('pw',  pw);
  updMod('soc', soc);
  updMod('net', net);
  updMod('phi', phi);
  updMod('dev', dev);

  $('gauge-n').textContent = Math.round(total);
  updGauge(total);

  const arch = getArch(total);
  const ab = $('arch-badge');
  ab.textContent = arch.icon + ' ' + arch.name;
  ab.className = 'badge b' + arch.bc;

  updBarChart();
  updRadarChart();
  renderNarrative();
  updSliderFill('sl-reuse', 20);
  updSliderFill('sl-posts', 30);
  S.ethical = cb('eth-tog');
}

function updMod(id, val) {
  const sc  = $('sc-' + id);
  const bar = $('bar-' + id);
  if (!sc) return;
  sc.textContent = Math.round(val);
  const c = val < 30 ? 'var(--mint)' : val < 60 ? 'var(--amber)' : 'var(--red)';
  sc.style.color = c;
  if (bar) {
    bar.style.width = val + '%';
    bar.style.background = 'linear-gradient(90deg,' + c + ',' + c + '88)';
  }
}

function updSliderFill(id, max) {
  const el = $(id); if (!el) return;
  const pct = (parseInt(el.value) / max) * 100;
  el.style.background = 'linear-gradient(90deg,var(--violet) ' + pct + '%,rgba(155,95,255,.18) ' + pct + '%)';
}

// ── ARCHETYPE ────────────────────────────────────────────────
function getArch(t) {
  if (t < 20) return { name:'Cyber Minimalist',       icon:'🛡️', bc:'m' };
  if (t < 40) return { name:'Casual Digital User',    icon:'💻', bc:'b' };
  if (t < 60) return { name:'Exposure Explorer',      icon:'🌐', bc:'v' };
  if (t < 80) return { name:'Credential Risk Carrier',icon:'⚠️', bc:'a' };
  return       { name:'Critical Threat Surface',      icon:'🔥', bc:'r' };
}

function getMaturity(t) {
  if (t < 20) return 5;
  if (t < 40) return 4;
  if (t < 55) return 3;
  if (t < 70) return 2;
  return 1;
}

// ── CHARTS ───────────────────────────────────────────────────
function initCharts() {
  // GAUGE
  if (!S.ci.gauge) {
    const ctx = $('cv-gauge'); if (!ctx) return;
    S.ch.gauge = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [0, 100],
          backgroundColor: ['rgba(155,95,255,.9)', 'rgba(255,255,255,.06)'],
          borderWidth: 0, borderRadius: 3
        }]
      },
      options: {
        cutout: '74%', circumference: 270, rotation: -135,
        animation: { animateRotate: true, duration: 500 },
        plugins: { legend:{ display:false }, tooltip:{ enabled:false } },
        responsive: true, maintainAspectRatio: true
      }
    });
    S.ci.gauge = true;
  }

  // BAR
  if (!S.ci.bar) {
    const ctx = $('cv-bar'); if (!ctx) return;
    S.ch.bar = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['Password','Social','Network','Phishing','Device'],
        datasets: [{
          data: [0,0,0,0,0],
          backgroundColor: [
            'rgba(155,95,255,.7)','rgba(0,229,168,.7)',
            'rgba(56,182,255,.7)','rgba(255,179,71,.7)','rgba(255,77,106,.7)'
          ],
          borderRadius: 5, borderWidth: 0
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { min:0, max:100, grid: CD.grid, ticks: CD.tick },
          x: { grid:{ display:false }, ticks: CD.tick }
        },
        plugins: { legend:{ display:false }, tooltip: CD.tooltip }
      }
    });
    S.ci.bar = true;
  }

  // RADAR
  if (!S.ci.radar) {
    const ctx = $('cv-radar'); if (!ctx) return;
    S.ch.radar = new Chart(ctx.getContext('2d'), {
      type: 'radar',
      data: {
        labels: ['Password','Social','Network','Phishing','Device'],
        datasets: [{
          data: [0,0,0,0,0],
          backgroundColor:    'rgba(155,95,255,.15)',
          borderColor:        'rgba(155,95,255,.8)',
          pointBackgroundColor:'rgba(0,229,168,.9)',
          pointBorderColor:   'transparent',
          borderWidth: 1.5, pointRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          r: {
            min:0, max:100,
            grid:        { color:'rgba(255,255,255,.07)' },
            angleLines:  { color:'rgba(255,255,255,.07)' },
            pointLabels: { color:'rgba(220,224,248,.5)', font:{ size:9 } },
            ticks:       { display:false }
          }
        },
        plugins: { legend:{ display:false } }
      }
    });
    S.ci.radar = true;
  }
}

function updGauge(v) {
  if (!S.ch.gauge) return;
  const c = v < 30 ? 'rgba(0,229,168,.9)' : v < 60 ? 'rgba(255,179,71,.9)' : 'rgba(255,77,106,.9)';
  S.ch.gauge.data.datasets[0].data = [v, 100 - v];
  S.ch.gauge.data.datasets[0].backgroundColor[0] = c;
  S.ch.gauge.update('none');
  $('gauge-n').style.color = c;
}

function updBarChart() {
  if (!S.ch.bar) return;
  const r = S.risks;
  S.ch.bar.data.datasets[0].data = [r.pw, r.soc, r.net, r.phi, r.dev];
  S.ch.bar.update('none');
}

function updRadarChart() {
  if (!S.ch.radar) return;
  const r = S.risks;
  S.ch.radar.data.datasets[0].data = [r.pw, r.soc, r.net, r.phi, r.dev];
  S.ch.radar.update('none');
}

// ── NARRATIVE ────────────────────────────────────────────────
function renderNarrative() {
  const r = S.risks;
  var txt;
  if (r.total === 0) {
    txt = 'Complete the modules above to generate your behavioral risk narrative.';
  } else if (r.pw > 60 && r.phi > 40) {
    txt = 'Critical convergence: high credential reuse (' + Math.round(r.pw) + '/100) combined with phishing susceptibility (' + Math.round(r.phi) + '/100) creates an exponential cascade. A single phishing email targeting your reused credentials could unlock multiple identities simultaneously.';
  } else if (r.pw > 60) {
    txt = 'Password practices (' + Math.round(r.pw) + '/100) expose you to credential stuffing. With ' + sl('sl-reuse') + ' reused passwords, a single breach cascades across all linked services within minutes of a data dump.';
  } else if (r.soc > 60) {
    txt = 'Social exposure (' + Math.round(r.soc) + '/100) gives attackers a rich intelligence target. Public birthday, location and phone data enables social engineering and identity verification bypass.';
  } else if (r.dev > 60) {
    txt = 'Device hygiene (' + Math.round(r.dev) + '/100) indicates significant endpoint risk. Unpatched systems and absent antivirus are primary ransomware and data exfiltration vectors.';
  } else if (r.net > 50) {
    txt = 'Network behavior (' + Math.round(r.net) + '/100) exposes traffic to man-in-the-middle interception. Public WiFi usage for sensitive operations enables passive credential harvesting.';
  } else if (r.total < 25) {
    txt = 'Excellent posture. Risk of ' + Math.round(r.total) + '/100 places you in the top tier of security practitioners. Maintain these standards and reassess regularly.';
  } else {
    txt = 'Overall risk of ' + Math.round(r.total) + '/100 reflects a moderate exposure surface. Address the highest-scoring modules first — small behavioral changes produce measurable breach probability reduction.';
  }
  $('nar-txt').textContent = txt;
}

// ── SAVE ─────────────────────────────────────────────────────
async function saveAssessment() {
  if (S.ethical) { alert('Privacy Mode is on — assessment not saved to DB.'); return; }
  setBtn('btn-save', true, 'Saving...');
  try {
    const res = await api('/save_assessment', {
      method: 'POST',
      body: JSON.stringify({
        total_risk:    S.risks.total,
        password_risk: S.risks.pw,
        social_risk:   S.risks.soc,
        network_risk:  S.risks.net,
        phishing_risk: S.risks.phi,
        device_risk:   S.risks.dev
      })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Save failed'); return; }
    const ab = $('anomaly-bar');
    data.anomaly ? ab.classList.add('show') : ab.classList.remove('show');
    $('stab-badge').textContent = '⚡ ' + data.stability + '%';
    S.streak = data.streak;
    $('nav-streak').textContent = '🔥 ' + data.streak;
    setBtn('btn-save', false, '✓ Saved!');
    setTimeout(function() { setBtn('btn-save', false, '💾 Save'); }, 1800);
  } catch(e) {
    alert('Connection error — is the server running?');
    setBtn('btn-save', false, '💾 Save');
  }
}

// ── HISTORY ──────────────────────────────────────────────────
async function loadHistory() {
  try {
    const res = await api('/get_history');
    if (!res.ok) return;
    const data = await res.json();
    S.history = data.history || [];
    renderTimeline();
  } catch(e) {}
}

function lineOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    scales: {
      y: { min:0, max:100, grid: CD.grid, ticks: CD.tick },
      x: { grid:{ display:false }, ticks: { ...CD.tick, maxRotation:45 } }
    },
    plugins: { legend:{ display:false }, tooltip: CD.tooltip }
  };
}

function renderTimeline() {
  const h = S.history;
  $('m-streak').textContent = S.streak;

  if (!h.length) {
    $('m-latest').textContent = '—';
    $('m-impr').textContent   = '—';
    return;
  }

  const latest = h[h.length-1].total_risk;
  const first  = h[0].total_risk;
  const impr   = first > 0 ? Math.round(((first - latest) / first) * 100) : 0;

  $('m-latest').textContent = Math.round(latest);
  $('m-impr').textContent   = (impr >= 0 ? '-' : '+') + Math.abs(impr) + '%';
  $('m-impr').style.color   = impr >= 0 ? 'var(--mint)' : 'var(--red)';

  const labels = h.map(function(r) { return r.timestamp.slice(0,10); });
  const vals   = h.map(function(r) { return Math.round(r.total_risk); });
  const stabs  = h.map(function(r) { return Math.round(r.stability_index); });

  // Line chart
  if (!S.ci.line) {
    const ctx = $('cv-line'); if (!ctx) return;
    S.ch.line = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: vals,
          borderColor:        'rgba(155,95,255,.9)',
          backgroundColor:    'rgba(155,95,255,.08)',
          fill: true, tension: 0.4,
          pointBackgroundColor:'rgba(0,229,168,.9)',
          pointBorderColor:   'transparent',
          pointRadius: 4, borderWidth: 1.5
        }]
      },
      options: lineOpts()
    });
    S.ci.line = true;
  } else {
    S.ch.line.data.labels = labels;
    S.ch.line.data.datasets[0].data = vals;
    S.ch.line.update();
  }

  // Stability chart
  if (!S.ci.stab) {
    const ctx = $('cv-stab'); if (!ctx) return;
    S.ch.stab = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: stabs,
          borderColor:     'rgba(0,229,168,.8)',
          backgroundColor: 'rgba(0,229,168,.07)',
          fill: true, tension: 0.4,
          pointBackgroundColor:'rgba(0,229,168,.9)',
          pointBorderColor:'transparent',
          pointRadius: 3, borderWidth: 1.5
        }]
      },
      options: lineOpts()
    });
    S.ci.stab = true;
  } else {
    S.ch.stab.data.labels = labels;
    S.ch.stab.data.datasets[0].data = stabs;
    S.ch.stab.update();
  }

  // Forecast
  renderForecast(vals, labels);
}

function renderForecast(vals, labels) {
  if (vals.length < 2) return;
  const n     = vals.length;
  const slope = (vals[n-1] - vals[0]) / (n-1);
  const last  = vals[n-1];
  const fv    = [last, clamp(last+slope), clamp(last+slope*2), clamp(last+slope*3)];
  const fl    = labels.concat(['Mo+1','Mo+2','Mo+3']);
  const hp    = vals.concat([null, null, null]);

  if (!S.ci.fore) {
    const ctx = $('cv-fore'); if (!ctx) return;
    S.ch.fore = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: fl,
        datasets: [
          {
            data: hp,
            borderColor:'rgba(155,95,255,.9)',
            fill:false, tension:0.4,
            pointRadius:3, borderWidth:1.5,
            pointBackgroundColor:'rgba(155,95,255,.8)'
          },
          {
            data: Array(n).fill(null).concat(fv),
            borderColor:     'rgba(0,229,168,.7)',
            borderDash:      [5,4],
            fill: false, tension:0.4,
            pointRadius:4, borderWidth:1.5,
            pointBackgroundColor:'rgba(0,229,168,.8)'
          }
        ]
      },
      options: lineOpts()
    });
    S.ci.fore = true;
  } else {
    S.ch.fore.data.labels = fl;
    S.ch.fore.data.datasets[0].data = hp;
    S.ch.fore.data.datasets[1].data = Array(n).fill(null).concat(fv);
    S.ch.fore.update();
  }
}

// ── BLUEPRINT ────────────────────────────────────────────────
var _sugs = [];

function renderBlueprint() {
  const r = S.risks;
  _sugs = [];
  if (r.pw > 30)     _sugs.push({ t:'🔑 Use a Password Manager',      w:'Password reuse creates a single point of failure. A manager enables unique credentials for every service.',       red:'~18% reduction' });
  if (!cb('c-2fa'))  _sugs.push({ t:'🔐 Enable Two-Factor Auth',       w:'2FA blocks 99.9% of automated account compromise, even when credentials are stolen.',                           red:'~12% reduction' });
  if (r.soc > 30)    _sugs.push({ t:'🔒 Audit Social Privacy',         w:'Public birthday, phone and location data enables social engineering and identity fraud. Restrict these now.',     red:'~10% reduction' });
  if (cb('c-wifi'))  _sugs.push({ t:'🛡️ Use VPN on Public Networks',   w:'Public WiFi enables passive traffic interception. A VPN encrypts all traffic, preventing credential harvesting.', red:'~8% reduction'  });
  if (r.phi > 20)    _sugs.push({ t:'🎣 Phishing Awareness Training',  w:'Phishing causes 36% of breaches. Learning to spot red flags dramatically reduces susceptibility.',               red:'~14% reduction' });
  if (cb('c-av'))    _sugs.push({ t:'🦠 Install Antivirus',            w:'Endpoint protection detects malware before it exfiltrates credentials or encrypts your data for ransom.',         red:'~12% reduction' });
  if (cb('c-upd'))   _sugs.push({ t:'🔄 Enable Automatic Updates',     w:'60% of breaches exploit vulnerabilities that already have patches available for 90+ days.',                       red:'~10% reduction' });
  if (cb('c-enc'))   _sugs.push({ t:'🔒 Enable Disk Encryption',       w:'Encryption ensures data is unreadable if your device is physically stolen or compromised.',                       red:'~8% reduction'  });
  if (!_sugs.length) _sugs.push({ t:'✅ Strong Security Posture',      w:'Your behavioral profile shows good hygiene. Continue monitoring for new threats and reassess regularly.',          red:'Maintain level'  });

  var html = '';
  _sugs.forEach(function(s, i) {
    html += '<div class="card sug" id="sug-' + i + '">' +
      '<div class="sug-h"><div class="sug-title">' + s.t + '</div>' +
      '<button class="btn btn-m btn-sm" onclick="applySug(' + i + ')" id="sug-btn-' + i + '">Simulate</button></div>' +
      '<div class="sug-why">' + s.w + '</div>' +
      '<div class="sug-foot"><span class="red-p">' + s.red + '</span>' +
      '<span class="txs d3" id="sug-st-' + i + '"></span></div>' +
      '</div>';
  });
  $('bp-list').innerHTML = html;
}

function applySug(i) {
  if (!_sugs[i]) return;
  _sugs[i]._on = !_sugs[i]._on;
  const btn  = $('sug-btn-' + i);
  const st   = $('sug-st-'  + i);
  const card = $('sug-'     + i);
  if (_sugs[i]._on) {
    btn.textContent = '↩ Undo'; btn.className = 'btn btn-g btn-sm';
    st.textContent  = '✓ Simulated'; st.style.color = 'var(--mint)';
    card.style.borderColor = 'rgba(0,229,168,.3)';
  } else {
    btn.textContent = 'Simulate'; btn.className = 'btn btn-m btn-sm';
    st.textContent  = ''; card.style.borderColor = '';
  }
}

// ── BREACH ───────────────────────────────────────────────────
function renderBreach() {
  const r = S.risks;
  const breach = clamp(r.pw*0.4 + r.soc*0.3 + r.phi*0.3);

  $('br-n').textContent = Math.round(breach) + '%';
  $('br-f').style.width = breach + '%';
  $('br-f').className   = 'bf';

  var level, cls, desc;
  if (breach < 25) {
    level='LOW RISK';    cls='b-low'; desc='Low breach probability. Maintain your security hygiene.';
  } else if (breach < 50) {
    level='MODERATE';    cls='b-mod'; desc='Moderate exposure. Targeted changes in password and phishing behavior will reduce this.';
  } else if (breach < 75) {
    level='HIGH RISK';   cls='b-hi';  desc='High breach probability. Change reused passwords, enable 2FA, and avoid phishing triggers now.';
  } else {
    level='SEVERE RISK'; cls='b-sev'; desc='Severe threat surface. Immediate security overhaul required across all risk categories.';
  }

  $('br-l').textContent = level;
  $('br-l').className   = 'bl ' + cls;
  $('br-n').className   = 'bn ' + cls;
  $('br-f').classList.add(cls);
  $('br-desc').textContent = desc;

  // Maturity
  const ml = getMaturity(r.total);
  var mhtml = '';
  [5,4,3,2,1].forEach(function(i) {
    var names  = ['','Reactive','Aware','Managed','Controlled','Hardened'];
    var ranges = ['','80–100','60–80','40–60','20–40','0–20'];
    var cls2   = i === ml ? 'cur' : i > ml ? 'past' : '';
    mhtml += '<div class="ms ' + cls2 + '">' +
      '<span class="msn">' + i + '</span>' +
      '<div><div class="msname">' + names[i] + '</div><div class="msrng">Risk ' + ranges[i] + '</div></div>' +
      '<div class="msdot"></div></div>';
  });
  $('mat-list').innerHTML = mhtml;

  // Archetype
  const arch = getArch(r.total);
  $('arch-detail').innerHTML =
    '<div class="row" style="gap:12px">' +
    '<span style="font-size:1.6rem">' + arch.icon + '</span>' +
    '<div><span class="badge b' + arch.bc + '" style="font-size:.72rem">' + arch.name + '</span>' +
    '<div class="txs d3 mt4">Risk: ' + Math.round(r.total) + '/100</div></div></div>';

  // Badges
  var badges = [
    { i:'🛡️', n:'Defender',   on: r.total < 30 },
    { i:'🔐', n:'2FA Master', on: cb('c-2fa') },
    { i:'🔄', n:'Patched',    on: !cb('c-upd') },
    { i:'🕵️', n:'VPN User',   on: cb('c-vpn') },
    { i:'🔥', n:'Streak',     on: S.streak >= 3 },
    { i:'📊', n:'Analyst',    on: S.history.length >= 3 }
  ];
  $('game-bd').innerHTML = badges.map(function(b) {
    return '<div class="card gb ' + (b.on ? '' : 'locked') + '">' +
      '<div class="gbi">' + b.i + '</div>' +
      '<div class="gbn">' + b.n + '</div></div>';
  }).join('');
}

// ── ATTACK SIMULATION ────────────────────────────────────────
var simCV, simCtx;

function initSim() {
  var cv = $('atk-cv'); if (!cv) return;
  var box = cv.parentElement;
  cv.width  = box.clientWidth  || 600;
  cv.height = 440;
  simCV  = cv;
  simCtx = cv.getContext('2d');
  drawSimIdle();
}

function drawSimIdle() {
  if (!simCtx) return;
  simCtx.clearRect(0,0,simCV.width,simCV.height);
  simCtx.fillStyle = 'rgba(8,11,20,.9)';
  simCtx.fillRect(0,0,simCV.width,simCV.height);
  simCtx.fillStyle = 'rgba(155,95,255,.4)';
  simCtx.font = '13px monospace';
  simCtx.textAlign = 'center';
  simCtx.fillText('▶  Press Run Simulation', simCV.width/2, simCV.height/2);
}

function buildSimNodes() {
  var w  = simCV.width;
  var cx = Math.round(w / 2);
  return [
    { id:0, lbl:'📧 Email',     x:cx,      y:55,  col:'#38b6ff', hit:false },
    { id:1, lbl:'🐦 Twitter',   x:cx-170,  y:155, col:'#9b5fff', hit:false },
    { id:2, lbl:'📘 Facebook',  x:cx,      y:155, col:'#9b5fff', hit:false },
    { id:3, lbl:'📸 Instagram', x:cx+170,  y:155, col:'#9b5fff', hit:false },
    { id:4, lbl:'🛒 Amazon',    x:cx-140,  y:270, col:'#ffb347', hit:false },
    { id:5, lbl:'🛍️ eBay',      x:cx+140,  y:270, col:'#ffb347', hit:false },
    { id:6, lbl:'🏦 Bank',      x:cx,      y:360, col:'#ff4d6a', hit:false },
    { id:7, lbl:'💀 ID Theft',  x:cx,      y:430, col:'#ff0022', hit:false }
  ];
}

function runSim() {
  if (!simCV) initSim();
  S.simOn = true;
  S.simNodes = buildSimNodes();
  S.simParts = [];
  cancelAnimationFrame(S.simFr);

  var emailReused = cb('c-email');
  var risk = S.risks.total;
  var spd  = risk > 70 ? 0.5 : risk > 40 ? 1 : 2;

  var simEmail = $('sim-email');
  simEmail.textContent = emailReused ? 'REUSED' : 'UNIQUE';
  simEmail.className   = emailReused ? 'badge br' : 'badge bm';
  $('sim-risk').textContent = Math.round(risk) + '/100';
  $('sim-spd').textContent  = risk > 70 ? 'RAPID' : risk > 40 ? 'MODERATE' : 'SLOW';

  var order  = emailReused ? [0,1,2,3,4,5,6,7] : [0,1,2,6];
  var delays = emailReused ? [0,1800,3000,4200,5400,6200,7400,8600] : [0,2500,4500,6500];

  order.forEach(function(ni, idx) {
    setTimeout(function() {
      if (S.simNodes[ni]) {
        S.simNodes[ni].hit = true;
        spawnSimParts(ni);
      }
    }, delays[idx] * spd);
  });

  function loop() {
    drawSim();
    S.simParts = S.simParts.filter(function(p) { return p.life > 0; });
    S.simParts.forEach(function(p) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.025;
    });
    if (S.simOn) S.simFr = requestAnimationFrame(loop);
  }
  loop();
}

function spawnSimParts(ni) {
  var n = S.simNodes[ni]; if (!n) return;
  for (var i = 0; i < 10; i++) {
    S.simParts.push({
      x:n.x, y:n.y,
      vx:(Math.random()-.5)*4,
      vy:(Math.random()-.5)*4,
      life:1, col:n.col,
      sz:Math.random()*3+2
    });
  }
}

function drawSim() {
  if (!simCtx || !simCV) return;
  simCtx.clearRect(0,0,simCV.width,simCV.height);
  simCtx.fillStyle = 'rgba(8,11,20,.92)';
  simCtx.fillRect(0,0,simCV.width,simCV.height);

  var edges = [[0,1],[0,2],[0,3],[1,4],[2,4],[2,5],[3,5],[4,6],[5,6],[6,7]];
  edges.forEach(function(e) {
    var na = S.simNodes[e[0]], nb = S.simNodes[e[1]];
    if (!na||!nb) return;
    simCtx.beginPath(); simCtx.moveTo(na.x,na.y); simCtx.lineTo(nb.x,nb.y);
    var both = na.hit && nb.hit;
    simCtx.strokeStyle = both ? 'rgba(255,77,106,.65)' : 'rgba(155,95,255,.18)';
    simCtx.lineWidth   = both ? 1.5 : 1;
    simCtx.setLineDash(both ? [] : [3,4]);
    simCtx.stroke();
    simCtx.setLineDash([]);
  });

  S.simNodes.forEach(function(n) {
    simCtx.beginPath(); simCtx.arc(n.x,n.y,22,0,Math.PI*2);
    simCtx.fillStyle = n.hit ? n.col+'bb' : 'rgba(255,255,255,.05)';
    if (n.hit) { simCtx.shadowBlur=14; simCtx.shadowColor=n.col; }
    simCtx.fill();
    simCtx.strokeStyle = n.hit ? n.col : 'rgba(155,95,255,.3)';
    simCtx.lineWidth = n.hit ? 2 : 1;
    simCtx.stroke();
    simCtx.shadowBlur = 0;
    simCtx.fillStyle = '#eef0f8';
    simCtx.font = '10px sans-serif';
    simCtx.textAlign = 'center';
    simCtx.fillText(n.lbl, n.x, n.y+36);
  });

  S.simParts.forEach(function(p) {
    simCtx.globalAlpha = p.life;
    simCtx.beginPath(); simCtx.arc(p.x,p.y,p.sz,0,Math.PI*2);
    simCtx.fillStyle = p.col; simCtx.fill();
  });
  simCtx.globalAlpha = 1;
}

function resetSim() {
  S.simOn = false;
  cancelAnimationFrame(S.simFr);
  S.simNodes = []; S.simParts = [];
  if (simCtx && simCV) drawSimIdle();
}

// ── ADMIN ────────────────────────────────────────────────────
async function loadAdmin() {
  try {
    const res = await api('/admin/stats');
    if (!res.ok) {
      $('tab-adm').innerHTML = '<div class="card" style="padding:24px;text-align:center"><div class="d2 tsm">Access restricted to admin users only.</div></div>';
      return;
    }
    const d = await res.json();
    $('adm-u').textContent = d.total_users;
    $('adm-a').textContent = d.total_assessments;
    $('adm-r').textContent = d.averages.total;

    if (!S.ci.adist) {
      var dist = d.distribution;
      S.ch.adist = new Chart($('cv-adist').getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['<20','20-40','40-60','60-80','>80'],
          datasets: [{
            data: [dist.low||0,dist.moderate||0,dist.elevated||0,dist.high||0,dist.critical||0],
            backgroundColor:['rgba(0,229,168,.7)','rgba(56,182,255,.7)','rgba(155,95,255,.7)','rgba(255,179,71,.7)','rgba(255,77,106,.7)'],
            borderRadius:5, borderWidth:0
          }]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip: CD.tooltip },
          scales:{ y:{grid: CD.grid,ticks: CD.tick}, x:{grid:{display:false},ticks: CD.tick} }
        }
      });
      S.ci.adist = true;
    }

    if (!S.ci.acat) {
      var a = d.averages;
      S.ch.acat = new Chart($('cv-acat').getContext('2d'), {
        type: 'radar',
        data: {
          labels:['Password','Social','Network','Phishing','Device'],
          datasets:[{
            data:[a.password,a.social,a.network,a.phishing,a.device],
            backgroundColor:'rgba(155,95,255,.15)',
            borderColor:'rgba(155,95,255,.8)',
            pointBackgroundColor:'rgba(0,229,168,.9)',
            borderWidth:1.5
          }]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          scales:{ r:{min:0,max:100,grid:{color:'rgba(255,255,255,.07)'},angleLines:{color:'rgba(255,255,255,.07)'},pointLabels:{color:'rgba(220,224,248,.5)',font:{size:9}},ticks:{display:false}} },
          plugins:{legend:{display:false}}
        }
      });
      S.ci.acat = true;
    }
  } catch(e) {}
}

// ── PDF ──────────────────────────────────────────────────────
async function exportPDF() {
  var ov = $('pdf-ov');
  ov.classList.add('show');
  await new Promise(function(r){ setTimeout(r, 300); });
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const r = S.risks;
    doc.setFillColor(8,11,20); doc.rect(0,0,210,297,'F');
    doc.setTextColor(155,95,255); doc.setFontSize(18); doc.setFont('helvetica','bold');
    doc.text('DigitalFootprint Mirror', 20, 22);
    doc.setFontSize(9); doc.setTextColor(150,160,200);
    doc.text('Report — ' + new Date().toLocaleString() + ' — User: ' + (S.user||'—'), 20, 30);
    doc.setDrawColor(155,95,255); doc.setLineWidth(.4); doc.line(20,34,190,34);
    doc.setFontSize(28); doc.setTextColor(155,95,255);
    doc.text(Math.round(r.total) + '/100', 20, 50);
    const arch = getArch(r.total);
    doc.setFontSize(10); doc.setTextColor(0,229,168);
    doc.text(arch.name, 20, 58);
    doc.setFontSize(10); doc.setTextColor(0,229,168); doc.text('RISK BREAKDOWN', 20, 72);
    var cats = [['Password',r.pw],['Social',r.soc],['Network',r.net],['Phishing',r.phi],['Device',r.dev]];
    var y = 80;
    cats.forEach(function(cat) {
      doc.setTextColor(200,210,240); doc.setFontSize(9); doc.text(cat[0] + ':', 20, y);
      doc.setTextColor(155,95,255); doc.text(Math.round(cat[1]) + '/100', 72, y);
      doc.setFillColor(30,30,60); doc.rect(90,y-4,80,4,'F');
      doc.setFillColor(155,95,255); doc.rect(90,y-4,(cat[1]/100)*80,4,'F');
      y += 10;
    });
    var breach = clamp(r.pw*.4 + r.soc*.3 + r.phi*.3);
    doc.setTextColor(0,229,168); doc.setFontSize(10); doc.text('BREACH PROBABILITY', 20, y+8);
    doc.setFontSize(22); doc.setTextColor(255,77,106); doc.text(Math.round(breach)+'%', 20, y+20);
    doc.setFontSize(9); doc.setTextColor(0,229,168); doc.text('INSIGHT', 20, y+34);
    doc.setTextColor(180,190,220);
    var lines = doc.splitTextToSize($('nar-txt').textContent, 170);
    doc.text(lines, 20, y+44);
    doc.setFontSize(7); doc.setTextColor(80,90,120);
    doc.text('DigitalFootprint Mirror — Educational security awareness tool', 20, 287);
    doc.save('DFM-' + (S.user||'report') + '-' + Date.now() + '.pdf');
  } catch(err) {
    console.error('PDF error:', err);
  } finally {
    ov.classList.remove('show');
  }
}

// ── TYPEWRITER ───────────────────────────────────────────────
function typewriter() {
  var el = $('type-t'); if (!el) return;
  var phrases = ['Know Your Risk.','Own Your Security.','See Your Exposure.'];
  var pi=0, ci=0, del=false;
  function tick() {
    var ph = phrases[pi];
    if (!del) {
      el.textContent = ph.slice(0, ci+1); ci++;
      if (ci === ph.length) { del=true; setTimeout(tick, 1800); return; }
    } else {
      el.textContent = ph.slice(0, ci-1); ci--;
      if (ci === 0) { del=false; pi=(pi+1) % phrases.length; }
    }
    setTimeout(tick, del ? 55 : 95);
  }
  tick();
}

// ── CHECK SESSION ────────────────────────────────────────────
async function checkSession() {
  try {
    var res = await api('/me');
    if (res.ok) {
      var d = await res.json();
      S.user = d.username;
      goTo('dash');
    }
  } catch(e) { /* not logged in, stay on landing */ }
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  typewriter();
  checkSession();

  // Enter key on auth forms
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    if (S.screen === 'auth') {
      var loginActive = $('fp-login').classList.contains('on');
      if (loginActive) doLogin(); else doRegister();
    }
  });

  // Ethical toggle
  var et = $('eth-tog');
  if (et) et.addEventListener('change', function(e) { S.ethical = e.target.checked; });

  // Init slider fills
  updSliderFill('sl-reuse', 20);
  updSliderFill('sl-posts', 30);
});

// ── GLOBAL BINDINGS (called from HTML onclick) ────────────────
window.goTo          = goTo;
window.switchTab     = switchTab;
window.doLogin       = doLogin;
window.doRegister    = doRegister;
window.doLogout      = doLogout;
window.switchDashTab = switchDashTab;
window.recalc        = recalc;
window.saveAssessment= saveAssessment;
window.exportPDF     = exportPDF;
window.runSim        = runSim;
window.resetSim      = resetSim;
window.applySug      = applySug;
