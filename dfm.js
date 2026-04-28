/* =======================================================
   DFM :: Digital Footprint Mirror — Main JavaScript
   Cyber Behavior Intelligence Dashboard
   ======================================================= */

"use strict";

/* ═══════════════════════════════════════════════════════
   1. GLOBAL STATE
   ═══════════════════════════════════════════════════════ */
let barChartInstance = null;
let radarChartInstance = null;
let analysisResult   = null;
let allSuggestionsDB = [];

const CATEGORIES = {
  password: { label: "Password",  icon: "🔐", max: 5 },
  social:   { label: "Social",    icon: "📡", max: 5 },
  network:  { label: "Network",   icon: "🌐", max: 5 },
  phishing: { label: "Phishing",  icon: "🎣", max: 5 },
  device:   { label: "Device",    icon: "💻", max: 5 },
};

const RISK_WEIGHTS = {
  password: 24, social: 18, network: 20, phishing: 22, device: 16
};

/* ═══════════════════════════════════════════════════════
   2. ARITHMETIC UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════ */
const RiskMath = {
  add:      (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide:   (a, b) => b !== 0 ? a / b : 0,

  // Weighted score for a category (0–100)
  categoryScore: (checked, max, weight) => {
    const ratio = RiskMath.divide(checked, max);
    return Math.round(RiskMath.multiply(ratio, weight) * RiskMath.multiply(100, RiskMath.divide(1, weight)));
  },

  // Overall risk: weighted sum, normalized to 100
  overallRisk: (scores) => {
    let totalWeight = 0, weightedSum = 0;
    Object.keys(scores).forEach(cat => {
      const w = RISK_WEIGHTS[cat];
      const s = scores[cat].score;
      weightedSum = RiskMath.add(weightedSum, RiskMath.multiply(s, w));
      totalWeight = RiskMath.add(totalWeight, w);
    });
    return Math.min(100, Math.round(RiskMath.divide(weightedSum, totalWeight)));
  },

  // Confidence rating based on how many boxes were evaluated
  confidence: (totalChecked, totalPossible) => {
    const base = Math.round(RiskMath.multiply(RiskMath.divide(totalChecked + 1, totalPossible), 85));
    return Math.min(98, RiskMath.add(base, 13));
  },

  // Attack chain probability
  chainProb: (pwdScore, phishScore) => {
    const combined = RiskMath.multiply(RiskMath.divide(pwdScore, 100), RiskMath.divide(phishScore, 100));
    return Math.round(RiskMath.multiply(combined, 100));
  }
};

/* ═══════════════════════════════════════════════════════
   3. DATE & STRING UTILITIES
   ═══════════════════════════════════════════════════════ */
const DFMDate = {
  now: () => new Date(),

  format: (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  },

  dayOfWeek: (d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],

  elapsed: (start, end) => {
    const ms = RiskMath.subtract(end.getTime(), start.getTime());
    return RiskMath.multiply(ms, 0.001).toFixed(2);
  }
};

const DFMString = {
  capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  upper:      (s) => s.toUpperCase(),
  truncate:   (s, n) => s.length > n ? s.slice(0, n) + '…' : s,
  pad:        (s, w) => String(s).padStart(w, '0'),
  slugify:    (s) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
  scoreLabel: (score) => {
    if (score >= 80) return "CRITICAL";
    if (score >= 60) return "HIGH";
    if (score >= 35) return "MODERATE";
    if (score >= 15) return "LOW";
    return "MINIMAL";
  }
};

/* ═══════════════════════════════════════════════════════
   4. DOM READY
   ═══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTimestamp();
  initNavbar();
  initRevealObserver();
  animateHeroStats();
  initResizeHandler();
  updateTimestamp();
  buildSuggestionsDB();

  // Update total count on any checkbox change
  document.querySelectorAll('.check-input').forEach(cb => {
    cb.addEventListener('change', updateTotalSelected);
  });
});

/* ═══════════════════════════════════════════════════════
   5. TIMESTAMP
   ═══════════════════════════════════════════════════════ */
function initTimestamp() {
  updateTimestamp();
  setInterval(updateTimestamp, 1000);
}

function updateTimestamp() {
  const el = document.getElementById('analysisTimestamp');
  if (el) el.textContent = DFMDate.format(DFMDate.now());
}

/* ═══════════════════════════════════════════════════════
   6. NAVBAR
   ═══════════════════════════════════════════════════════ */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const toggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  // Scroll → sticky shadow + active link
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
    updateActiveNavLink();
  });

  // Mobile toggle
  if (toggle) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // Smooth scroll on nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.section);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      navLinks.classList.remove('open');
    });
  });
}

function updateActiveNavLink() {
  const sections = ['home','analyzer','dashboard','suggestions'];
  const offsets  = sections.map(id => {
    const el = document.getElementById(id);
    return el ? el.getBoundingClientRect().top : Infinity;
  });

  let activeIdx = 0;
  offsets.forEach((off, i) => { if (off <= 80) activeIdx = i; });

  document.querySelectorAll('.nav-link').forEach((link, i) => {
    link.classList.toggle('active', i === activeIdx);
  });
}

/* ═══════════════════════════════════════════════════════
   7. REVEAL ON SCROLL
   ═══════════════════════════════════════════════════════ */
function initRevealObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

/* ═══════════════════════════════════════════════════════
   8. HERO STATS COUNTER ANIMATION
   ═══════════════════════════════════════════════════════ */
function animateHeroStats() {
  animateCount('statThreats',    0, 142,  1800);
  animateCount('statUsers',      0, 8314, 2200);
}

function animateCount(id, from, to, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const steps = 60;
  const stepVal = RiskMath.divide(RiskMath.subtract(to, from), steps);
  let current = from;
  let step = 0;
  const interval = setInterval(() => {
    step++;
    current = RiskMath.add(current, stepVal);
    el.textContent = Math.round(current).toLocaleString();
    if (step >= steps) {
      el.textContent = to.toLocaleString();
      clearInterval(interval);
    }
  }, RiskMath.divide(duration, steps));
}

/* ═══════════════════════════════════════════════════════
   9. RESIZE HANDLER (onresize event)
   ═══════════════════════════════════════════════════════ */
function initResizeHandler() {
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  const w = window.innerWidth;
  const statusEl = document.getElementById('navStatusText');
  if (statusEl) {
    statusEl.textContent = w < 640 ? `MOBILE ${w}px` : 'SYSTEM READY';
  }
  // Re-render charts responsively if they exist
  if (barChartInstance)   barChartInstance.resize();
  if (radarChartInstance) radarChartInstance.resize();
}

/* ═══════════════════════════════════════════════════════
   10. TABLE ROW EVENTS (onmouseover / onmouseout)
   ═══════════════════════════════════════════════════════ */
function highlightRow(row) {
  row.classList.add('row-hover');
}

function unhighlightRow(row) {
  row.classList.remove('row-hover');
}

/* ═══════════════════════════════════════════════════════
   11. BADGE COUNTER (per category)
   ═══════════════════════════════════════════════════════ */
function updateBadge(category) {
  const checks = document.querySelectorAll(`input[name="${category}"]:checked`);
  const badge  = document.getElementById(`badge-${category}`);
  if (!badge) return;
  const count = checks.length;
  badge.textContent = count;
  badge.classList.toggle('has-checks', count > 0);
  updateTotalSelected();
}

function updateTotalSelected() {
  const total = document.querySelectorAll('.check-input:checked').length;
  const el = document.getElementById('totalSelected');
  if (el) el.textContent = total;
}

/* ═══════════════════════════════════════════════════════
   12. INPUT SELECT EVENT
   ═══════════════════════════════════════════════════════ */
function onInputSelect(input) {
  // Highlight selected text behavior — visual feedback
  input.style.borderColor = 'var(--accent2)';
  setTimeout(() => { input.style.borderColor = ''; }, 800);
}

/* ═══════════════════════════════════════════════════════
   13. SEARCH / FILTER (onsearch event)
   ═══════════════════════════════════════════════════════ */
function handleSearch(query) {
  const q = DFMString.upper(query.trim());
  document.querySelectorAll('.suggestion-item').forEach(item => {
    const text = DFMString.upper(item.textContent);
    item.classList.toggle('hidden', q.length > 0 && !text.includes(q));
  });
}

/* ═══════════════════════════════════════════════════════
   14. SCROLL TO ANALYZER
   ═══════════════════════════════════════════════════════ */
function scrollToAnalyzer() {
  document.getElementById('analyzer').scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════
   15. LEARN MORE DIALOG (alert)
   ═══════════════════════════════════════════════════════ */
function showLearnMore() {
  alert(
    "Digital Footprint Mirror — How It Works\n\n" +
    "1. You select behaviors that match your daily digital habits.\n" +
    "2. Our engine weighs each behavior across 5 risk categories.\n" +
    "3. A personalized threat profile is generated with a risk score.\n" +
    "4. Prioritized, actionable recommendations are provided.\n\n" +
    "Your data is processed locally — nothing is stored or transmitted."
  );
}

/* ═══════════════════════════════════════════════════════
   16. RESET FORM
   ═══════════════════════════════════════════════════════ */
function resetForm() {
  const confirmed = confirm("Reset all selections? This will clear your current inputs.");
  if (!confirmed) return;

  document.querySelectorAll('.check-input').forEach(cb => { cb.checked = false; });
  document.getElementById('userName').value = '';
  document.querySelectorAll('.cat-badge').forEach(b => {
    b.textContent = '0';
    b.classList.remove('has-checks');
  });
  updateTotalSelected();

  // Hide dashboard & suggestions
  document.getElementById('dashboardContent').style.display    = 'none';
  document.getElementById('dashboardPlaceholder').style.display  = 'block';
  document.getElementById('suggestionsContent').style.display   = 'none';
  document.getElementById('suggestionsPlaceholder').style.display = 'block';
}

/* ═══════════════════════════════════════════════════════
   17. MAIN ANALYSIS FLOW
   ═══════════════════════════════════════════════════════ */
function runAnalysis() {
  const total = document.querySelectorAll('.check-input:checked').length;

  // Prompt if zero selected
  if (total === 0) {
    const proceed = confirm(
      "No risk behaviors selected.\n\n" +
      "Either you have excellent security hygiene, or you haven't checked any boxes yet.\n\n" +
      "Proceed with a zero-risk analysis?"
    );
    if (!proceed) return;
  }

  // Confirm dialog (onclick confirm)
  const userName = document.getElementById('userName').value.trim() ||
    prompt("Enter a display name for your report (optional):", "Agent_X") || "Anonymous";

  const go = confirm(
    `Ready to analyze footprint for: ${userName}\n\n` +
    `Behaviors flagged: ${total} / 25\n` +
    `This will generate your personalized risk intelligence report.\n\n` +
    `Proceed?`
  );
  if (!go) return;

  // Collect data as JSON
  const payload = collectFormData(userName);

  // Show loader
  showLoading(() => {
    // Compute results
    analysisResult = computeAnalysis(payload);

    // Try backend, fallback to local
    sendToBackend(payload, analysisResult)
      .then(result => {
        renderDashboard(result);
        renderSuggestions(result);
        hideLoading();
        document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });

        // Alert if critical
        if (result.overallScore >= 70) {
          setTimeout(() => {
            alert(
              `⚠️ HIGH RISK DETECTED\n\n` +
              `Your risk score: ${result.overallScore}/100 (${result.riskLabel})\n\n` +
              `Immediate attention is recommended. Review the suggestions section for prioritized action steps.`
            );
          }, 500);
        }
      });
  });
}

/* ═══════════════════════════════════════════════════════
   18. COLLECT FORM DATA → JSON
   ═══════════════════════════════════════════════════════ */
function collectFormData(userName) {
  const data = {
    user:      userName,
    role:      document.getElementById('userRole').value,
    scope:     document.getElementById('analysisPurpose').value,
    timestamp: DFMDate.format(DFMDate.now()),
    behaviors: {}
  };

  Object.keys(CATEGORIES).forEach(cat => {
    const checked = Array.from(
      document.querySelectorAll(`input[name="${cat}"]:checked`)
    ).map(cb => cb.value);
    data.behaviors[cat] = checked;
  });

  // JSON round-trip (demonstrates JSON handling)
  const json   = JSON.stringify(data);
  const parsed = JSON.parse(json);
  return parsed;
}

/* ═══════════════════════════════════════════════════════
   19. COMPUTE ANALYSIS ENGINE
   ═══════════════════════════════════════════════════════ */
function computeAnalysis(payload) {
  const behaviors = payload.behaviors;
  const scores    = {};

  let maxScore    = 0;
  let maxCat      = 'password';
  let totalChecked = 0;

  Object.keys(CATEGORIES).forEach(cat => {
    const checked = behaviors[cat].length;
    const max     = CATEGORIES[cat].max;
    const weight  = RISK_WEIGHTS[cat];
    const rawPct  = Math.round(RiskMath.multiply(RiskMath.divide(checked, max), 100));
    const weighted = Math.round(RiskMath.multiply(rawPct, RiskMath.divide(weight, 100)));

    scores[cat] = {
      checked,
      max,
      pct:     rawPct,
      score:   rawPct,
      weight,
      weighted
    };

    if (rawPct > maxScore) { maxScore = rawPct; maxCat = cat; }
    totalChecked = RiskMath.add(totalChecked, checked);
  });

  const overallScore   = RiskMath.overallRisk(scores);
  const riskLabel      = DFMString.scoreLabel(overallScore);
  const confidence     = RiskMath.confidence(totalChecked, 25);
  const vulnCategories = Object.keys(scores).filter(c => scores[c].pct > 0).length;

  const chainProb = RiskMath.chainProb(
    scores.password.pct, scores.phishing.pct
  );

  const profileType     = deriveProfileType(overallScore, scores);
  const primaryThreat   = derivePrimaryThreat(maxCat, scores);
  const dangerousHabit  = deriveDangerousHabit(behaviors, maxCat);
  const exploitation    = deriveExploitation(overallScore, scores);
  const priority        = derivePriority(scores, maxCat);
  const summary         = deriveSummary(payload.user, overallScore, riskLabel, maxCat, scores);

  return {
    user:          payload.user,
    role:          payload.role,
    timestamp:     payload.timestamp,
    scores,
    overallScore,
    riskLabel,
    confidence,
    vulnCategories,
    maxCat,
    chainProb,
    profileType,
    primaryThreat,
    dangerousHabit,
    exploitation,
    priority,
    summary,
    totalChecked,
  };
}

/* ── Profile Type ── */
function deriveProfileType(score, scores) {
  if (score >= 80) return "HIGH-RISK DIGITAL NATIVE";
  if (score >= 60) {
    if (scores.phishing.pct > 60) return "PHISHING-SUSCEPTIBLE USER";
    if (scores.network.pct > 60)  return "OPEN-NETWORK RISK PROFILE";
    return "MULTI-VECTOR RISK PROFILE";
  }
  if (score >= 35) {
    if (scores.password.pct > 50) return "PASSWORD-WEAK MODERATE RISK";
    return "MODERATE RISK — IMPROVABLE";
  }
  if (score >= 10) return "SECURITY-AWARE LOW RISK";
  return "STRONG SECURITY POSTURE";
}

/* ── Primary Threat ── */
function derivePrimaryThreat(maxCat, scores) {
  const vectors = {
    password: `Credential stuffing via password reuse (${scores.password.pct}% exposure)`,
    social:   `Social engineering enabled by oversharing (${scores.social.pct}% exposure)`,
    network:  `Man-in-the-middle attack via unsecured networks (${scores.network.pct}% exposure)`,
    phishing: `Spear phishing / malicious link exploitation (${scores.phishing.pct}% exposure)`,
    device:   `Malware / ransomware via unpatched endpoints (${scores.device.pct}% exposure)`,
  };
  return vectors[maxCat] || "Multiple converging threat vectors";
}

/* ── Most Dangerous Habit ── */
function deriveDangerousHabit(behaviors, maxCat) {
  const habitMap = {
    password: { reuse: "Reusing passwords across sites", weak: "Using weak (<10 char) passwords", no2fa: "No two-factor authentication", shared: "Sharing passwords with others", nomanager: "Not using a password manager" },
    social:   { overshare: "Oversharing personal details online", publicprofile: "Fully public social profiles", acceptall: "Accepting unknown connection requests", realname: "Using real full name everywhere", geotagging: "Real-time location sharing" },
    network:  { publicwifi: "Using public Wi-Fi without VPN", novpn: "No VPN at all", httpsite: "Visiting HTTP (unencrypted) sites", autoconnect: "Auto-connecting to open networks", routerdefault: "Default router password unchanged" },
    phishing: { clicklinks: "Clicking unverified email links", download: "Downloading unknown attachments", urgency: "Responding to 'urgent' email scams", noverify: "Not verifying URLs before login", popup: "Clicking suspicious pop-up ads" },
    device:   { noupdate: "Delaying security updates", noantivirus: "No antivirus installed", unlock: "Devices with no screen lock", nobackup: "No data backup routine", unknownapps: "Installing apps from unknown sources" },
  };

  const catBehaviors = behaviors[maxCat];
  if (!catBehaviors || catBehaviors.length === 0) {
    // Find any behavior
    for (const cat of Object.keys(behaviors)) {
      if (behaviors[cat].length > 0) return habitMap[cat][behaviors[cat][0]] || "Unknown habit";
    }
    return "None identified — clean profile";
  }
  return habitMap[maxCat][catBehaviors[0]] || "Multiple critical habits";
}

/* ── Exploitation Likelihood ── */
function deriveExploitation(score, scores) {
  if (score >= 80) return "VERY HIGH — Active exploitation likely within 6 months";
  if (score >= 60) return "HIGH — Elevated probability of successful attack";
  if (score >= 40) return "MODERATE — Vulnerable if targeted specifically";
  if (score >= 20) return "LOW — Hardened against most opportunistic attacks";
  return "VERY LOW — Strong defenses in place";
}

/* ── Priority Focus ── */
function derivePriority(scores, maxCat) {
  const cats = Object.keys(scores).sort((a,b) => scores[b].pct - scores[a].pct);
  const top2  = cats.slice(0, 2).map(c => CATEGORIES[c].label);
  return `Address ${top2.join(' then ')} vulnerabilities immediately`;
}

/* ── Summary ── */
function deriveSummary(user, score, label, maxCat, scores) {
  const catLabel = CATEGORIES[maxCat].label;
  const dateStr  = DFMDate.dayOfWeek(DFMDate.now());
  return `Analysis for ${user} on ${dateStr}: Your digital behavior registers a ${label} risk level (${score}/100). ` +
    `The ${catLabel} category represents your largest attack surface at ${scores[maxCat].pct}% exposure. ` +
    `${score >= 60
      ? 'Immediate remediation across flagged categories is strongly recommended before adversaries exploit these gaps.'
      : score >= 30
      ? 'Targeted improvements in your highest-risk areas will significantly harden your digital footprint.'
      : 'Continue your current security practices and consider extending good habits to the remaining areas.'}`;
}

/* ═══════════════════════════════════════════════════════
   20. BACKEND FETCH (AJAX)
   ═══════════════════════════════════════════════════════ */
async function sendToBackend(payload, localResult) {
  try {
    const response = await fetch('/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(4000)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const serverResult = await response.json();
    // Merge server result with local computed result
    return Object.assign({}, localResult, serverResult.analysis || {});
  } catch (err) {
    // Backend unavailable — use local computation
    console.info('DFM: Backend not reached, using local analysis.', err.message);
    return localResult;
  }
}

/* ═══════════════════════════════════════════════════════
   21. LOADING ANIMATION
   ═══════════════════════════════════════════════════════ */
function showLoading(onComplete) {
  const overlay = document.getElementById('loadingOverlay');
  const fill    = document.getElementById('loadingFill');
  const text    = document.getElementById('loadingText');
  overlay.classList.add('active');

  const steps = [
    [15,  "Initializing scan engine..."],
    [30,  "Parsing behavioral patterns..."],
    [50,  "Computing threat vectors..."],
    [65,  "Running risk algorithms..."],
    [80,  "Generating intelligence report..."],
    [95,  "Finalizing analysis..."],
    [100, "Complete."],
  ];

  let i = 0;
  function step() {
    if (i >= steps.length) {
      setTimeout(() => { onComplete(); }, 300);
      return;
    }
    const [pct, msg] = steps[i++];
    fill.style.width = pct + '%';
    text.textContent = msg;
    const delay = RiskMath.multiply(Math.random(), 300) + 180;
    setTimeout(step, delay);
  }
  step();
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('active');
}

/* ═══════════════════════════════════════════════════════
   22. RENDER DASHBOARD
   ═══════════════════════════════════════════════════════ */
function renderDashboard(result) {
  document.getElementById('dashboardPlaceholder').style.display = 'none';
  document.getElementById('dashboardContent').style.display    = 'block';

  renderMetrics(result);
  renderBarChart(result);
  renderRadarChart(result);
  renderHeatmap(result);
  renderAttackFlow(result);
  renderProfileCard(result);
}

/* ── Metrics ── */
function renderMetrics(result) {
  // Risk Score
  document.getElementById('metricRiskValue').textContent = result.overallScore;
  const fill = document.getElementById('metricRiskFill');
  fill.style.width = result.overallScore + '%';
  fill.style.background = scoreColor(result.overallScore);
  document.getElementById('metricRiskTag').textContent = result.riskLabel;
  document.getElementById('metricRiskTag').style.color = scoreColor(result.overallScore);

  // Vulnerable Categories
  document.getElementById('metricVulnValue').textContent = result.vulnCategories;
  const vulnEl = document.getElementById('vulnIcons');
  vulnEl.innerHTML = '';
  Object.keys(CATEGORIES).forEach(cat => {
    if (result.scores[cat].pct > 0) {
      const span = document.createElement('span');
      span.className = 'vuln-icon';
      span.title = CATEGORIES[cat].label + ' — ' + result.scores[cat].pct + '%';
      span.textContent = CATEGORIES[cat].icon;
      vulnEl.appendChild(span);
    }
  });
  document.getElementById('metricVulnTag').textContent =
    result.vulnCategories === 0 ? 'No vulnerabilities' :
    result.vulnCategories <= 2  ? 'Contained exposure' : 'Broad attack surface';

  // Danger
  document.getElementById('metricDangerValue').textContent =
    CATEGORIES[result.maxCat].icon + ' ' + CATEGORIES[result.maxCat].label;

  // Confidence
  document.getElementById('metricConfidence').textContent = result.confidence;
  document.getElementById('confBasis').textContent        = result.totalChecked;
}

function scoreColor(score) {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 35) return '#fbbf24';
  if (score >= 15) return '#38bdf8';
  return '#22c55e';
}

/* ── Bar Chart ── */
function renderBarChart(result) {
  if (barChartInstance) {
    barChartInstance.destroy();
    barChartInstance = null;
  }

  const ctx = document.getElementById('barChart').getContext('2d');
  const labels = Object.values(CATEGORIES).map(c => c.label);
  const data   = Object.keys(CATEGORIES).map(c => result.scores[c].pct);
  const colors = data.map(v => scoreColor(v));

  barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Risk Score (%)',
        data,
        backgroundColor: colors.map(c => c + '33'),
        borderColor:     colors,
        borderWidth:     2,
        borderRadius:    6,
        borderSkipped:   false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend:  { display: false },
        tooltip: {
          backgroundColor: '#0a0f1c',
          borderColor: '#38bdf8',
          borderWidth: 1,
          titleColor: '#7dd3fc',
          bodyColor:  '#94a3b8',
          callbacks: {
            label: ctx => ` ${ctx.parsed.y}% risk exposure`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { family: "'Rajdhani', sans-serif", size: 12 } },
          grid:  { color: 'rgba(56,189,248,0.06)' },
          border: { color: 'rgba(56,189,248,0.12)' }
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#64748b', font: { family: "'Share Tech Mono', monospace", size: 11 } },
          grid:  { color: 'rgba(56,189,248,0.06)' },
          border: { color: 'rgba(56,189,248,0.12)' }
        }
      },
      animation: { duration: 1000, easing: 'easeOutCubic' }
    }
  });
}

/* ── Radar Chart ── */
function renderRadarChart(result) {
  if (radarChartInstance) {
    radarChartInstance.destroy();
    radarChartInstance = null;
  }

  const ctx    = document.getElementById('radarChart').getContext('2d');
  const labels = Object.values(CATEGORIES).map(c => c.label);
  const data   = Object.keys(CATEGORIES).map(c => result.scores[c].pct);

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Exposure',
        data,
        backgroundColor: 'rgba(239,68,68,0.12)',
        borderColor:     '#ef4444',
        borderWidth:     2,
        pointBackgroundColor: '#ef4444',
        pointBorderColor:     '#ef4444',
        pointRadius:          5,
        pointHoverRadius:     8,
      }, {
        label: 'Baseline (50%)',
        data: [50, 50, 50, 50, 50],
        backgroundColor: 'rgba(56,189,248,0.05)',
        borderColor:     'rgba(56,189,248,0.2)',
        borderWidth:     1,
        pointRadius:     0,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#64748b',
            font:  { family: "'Exo 2', sans-serif", size: 11 }
          }
        },
        tooltip: {
          backgroundColor: '#0a0f1c',
          borderColor:     '#38bdf8',
          borderWidth:     1,
          titleColor:      '#7dd3fc',
          bodyColor:       '#94a3b8',
        }
      },
      scales: {
        r: {
          min: 0, max: 100,
          ticks: {
            color:           '#334155',
            backdropColor:   'transparent',
            stepSize:        25,
            font:            { size: 9 }
          },
          grid:        { color: 'rgba(56,189,248,0.08)' },
          angleLines:  { color: 'rgba(56,189,248,0.08)' },
          pointLabels: { color: '#94a3b8', font: { family: "'Rajdhani', sans-serif", size: 13, weight: '600' } }
        }
      },
      animation: { duration: 1200, easing: 'easeOutElastic' }
    }
  });
}

/* ── Heatmap ── */
function renderHeatmap(result) {
  const grid = document.getElementById('heatmapGrid');
  grid.innerHTML = '';

  Object.keys(CATEGORIES).forEach(cat => {
    const pct  = result.scores[cat].pct;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';

    const alpha = Math.max(0.05, RiskMath.divide(pct, 100));
    const col   = scoreColor(pct);
    cell.style.background = col + Math.round(alpha * 255).toString(16).padStart(2, '0');
    cell.style.border     = `1px solid ${col}44`;

    cell.innerHTML = `
      <span class="heat-cat-icon">${CATEGORIES[cat].icon}</span>
      <span class="heat-cat-name" style="color:${col}">${CATEGORIES[cat].label}</span>
      <span class="heat-cat-score" style="color:${col}">${pct}%</span>
    `;
    grid.appendChild(cell);
  });
}

/* ── Attack Flow ── */
function renderAttackFlow(result) {
  const pwdScore  = result.scores.password.pct;
  const phishScore = result.scores.phishing.pct;
  const chainProb  = result.chainProb;

  // Node 1: Password
  const n1Risk = pwdScore > 50 ? 'HIGH' : pwdScore > 20 ? 'MED' : 'LOW';
  setFlowNode('flowNode1', 'nodeRisk1', n1Risk, pwdScore);

  // Node 2: Email (password + phishing combined)
  const emailScore = Math.round(RiskMath.divide(RiskMath.add(pwdScore, phishScore), 2));
  const n2Risk = emailScore > 50 ? 'HIGH' : emailScore > 20 ? 'MED' : 'LOW';
  setFlowNode('flowNode2', 'nodeRisk2', n2Risk, emailScore);

  // Node 3: Banking
  const bankScore = Math.round(RiskMath.multiply(RiskMath.divide(chainProb, 100), 90));
  const n3Risk = bankScore > 50 ? 'HIGH' : bankScore > 20 ? 'MED' : 'LOW';
  setFlowNode('flowNode3', 'nodeRisk3', n3Risk, bankScore);

  // Node 4: Identity Theft
  const identityScore = Math.round(RiskMath.multiply(RiskMath.divide(result.overallScore, 100), 95));
  const n4Risk = identityScore > 60 ? 'CRITICAL' : identityScore > 30 ? 'HIGH' : 'LOW';
  setFlowNode('flowNode4', 'nodeRisk4', n4Risk, identityScore);

  // Activate danger arrows
  document.querySelectorAll('.flow-arrow').forEach(el => {
    el.classList.toggle('danger-arrow', chainProb > 50);
  });

  document.getElementById('flowNote').textContent =
    chainProb > 60
      ? `⚠️ High cascade probability (${chainProb}%). A compromised password could expose your email, banking, and identity in sequence.`
      : chainProb > 30
      ? `Attack chain risk is moderate (${chainProb}%). Closing password and phishing gaps reduces cascade probability significantly.`
      : `Low attack chain probability (${chainProb}%). Your current behaviors limit cascading breach scenarios.`;
}

function setFlowNode(nodeId, riskId, label, score) {
  const node = document.getElementById(nodeId);
  const risk = document.getElementById(riskId);
  if (!node || !risk) return;

  node.classList.toggle('activated', score > 50);
  risk.textContent = label;
  const col = label === 'CRITICAL' ? '#ef4444' : label === 'HIGH' ? '#f97316' : label === 'MED' ? '#fbbf24' : '#22c55e';
  risk.style.cssText = `background:${col}22;color:${col};border:1px solid ${col}55;`;
}

/* ── Profile Card ── */
function renderProfileCard(result) {
  document.getElementById('profileType').textContent      = result.profileType;
  document.getElementById('profileThreat').textContent    = result.primaryThreat;
  document.getElementById('profileLikelihood').textContent = result.exploitation;
  document.getElementById('profileDanger').textContent    = result.dangerousHabit;
  document.getElementById('profilePriority').textContent  = result.priority;
  document.getElementById('profileSummary').textContent   = result.summary;
}

/* ═══════════════════════════════════════════════════════
   23. SUGGESTIONS DATABASE
   ═══════════════════════════════════════════════════════ */
function buildSuggestionsDB() {
  allSuggestionsDB = [
    {
      id: 'pwd-manager',
      category: 'password',
      icon: '🔑',
      title: 'Use a Password Manager',
      desc: 'Tools like Bitwarden or 1Password generate and store unique, strong passwords for every account — eliminating reuse risk entirely.',
      priority: 'p-critical',
      priorityLabel: 'CRITICAL',
      keywords: 'password manager reuse credential'
    },
    {
      id: 'enable-2fa',
      category: 'password',
      icon: '🛡️',
      title: 'Enable Two-Factor Authentication',
      desc: 'Add a second layer of verification (authenticator app preferred over SMS) to all critical accounts — email, banking, and social.',
      priority: 'p-critical',
      priorityLabel: 'CRITICAL',
      keywords: 'two factor 2fa authentication'
    },
    {
      id: 'strong-passwords',
      category: 'password',
      icon: '🔒',
      title: 'Enforce Strong Password Policies',
      desc: 'Use 16+ character passwords combining random words, numbers, and symbols. Never base passwords on personal information.',
      priority: 'p-high',
      priorityLabel: 'HIGH',
      keywords: 'strong password length complex'
    },
    {
      id: 'vpn-usage',
      category: 'network',
      icon: '🌐',
      title: 'Always Use a VPN on Public Networks',
      desc: 'A reputable VPN (Mullvad, ProtonVPN) encrypts all traffic on untrusted networks, preventing man-in-the-middle interception.',
      priority: 'p-critical',
      priorityLabel: 'CRITICAL',
      keywords: 'vpn network public wifi encrypt'
    },
    {
      id: 'https-only',
      category: 'network',
      icon: '🔐',
      title: 'Use HTTPS-Only Mode',
      desc: 'Enable HTTPS-Only mode in your browser settings to prevent connections to unencrypted HTTP pages automatically.',
      priority: 'p-high',
      priorityLabel: 'HIGH',
      keywords: 'https secure connection browser'
    },
    {
      id: 'router-security',
      category: 'network',
      icon: '📡',
      title: 'Secure Your Home Router',
      desc: 'Change the default admin password, disable WPS, update firmware, and use WPA3 encryption on your home network.',
      priority: 'p-medium',
      priorityLabel: 'MEDIUM',
      keywords: 'router wifi home security firmware'
    },
    {
      id: 'phishing-awareness',
      category: 'phishing',
      icon: '🎣',
      title: 'Verify Before You Click',
      desc: 'Hover over links to preview URLs. Check sender email domains carefully. When in doubt, navigate directly to the site instead of clicking links.',
      priority: 'p-critical',
      priorityLabel: 'CRITICAL',
      keywords: 'phishing email link verify sender'
    },
    {
      id: 'email-filter',
      category: 'phishing',
      icon: '📧',
      title: 'Enable Advanced Email Filtering',
      desc: 'Use email providers with built-in phishing detection (ProtonMail, Gmail with enhanced safe browsing). Review spam folder regularly.',
      priority: 'p-high',
      priorityLabel: 'HIGH',
      keywords: 'email filter spam phishing detection'
    },
    {
      id: 'social-privacy',
      category: 'social',
      icon: '🔏',
      title: 'Audit Social Media Privacy Settings',
      desc: 'Set profiles to private, restrict who can see your posts, remove unnecessary personal info (phone, address, birthday) from public profiles.',
      priority: 'p-high',
      priorityLabel: 'HIGH',
      keywords: 'social media privacy settings public profile'
    },
    {
      id: 'geo-tagging',
      category: 'social',
      icon: '📍',
      title: 'Disable Location Tagging',
      desc: 'Turn off geotagging in camera settings and avoid posting real-time location updates. Delay travel posts until after you return.',
      priority: 'p-medium',
      priorityLabel: 'MEDIUM',
      keywords: 'location geotag privacy tracking'
    },
    {
      id: 'device-updates',
      category: 'device',
      icon: '⚙️',
      title: 'Enable Automatic Security Updates',
      desc: 'Enable auto-updates for OS and critical apps. Security patches fix known exploits — delayed updates leave known doors open.',
      priority: 'p-high',
      priorityLabel: 'HIGH',
      keywords: 'update patch security firmware os'
    },
    {
      id: 'antivirus',
      category: 'device',
      icon: '🛡️',
      title: 'Install Reputable Security Software',
      desc: 'Use a trusted antivirus/anti-malware solution (Malwarebytes, Windows Defender) and run full system scans weekly.',
      priority: 'p-high',
      priorityLabel: 'HIGH',
      keywords: 'antivirus malware security software scan'
    },
    {
      id: 'device-lock',
      category: 'device',
      icon: '🔐',
      title: 'Enforce Device Lock Screens',
      desc: 'Use a strong PIN (6+ digits) or biometric lock on all devices. Enable auto-lock after 30 seconds of inactivity.',
      priority: 'p-medium',
      priorityLabel: 'MEDIUM',
      keywords: 'device lock screen pin biometric'
    },
    {
      id: 'data-backup',
      category: 'device',
      icon: '💾',
      title: 'Implement a 3-2-1 Backup Strategy',
      desc: 'Keep 3 copies of data on 2 different media types with 1 offsite/cloud copy. Test restores quarterly to confirm backup integrity.',
      priority: 'p-medium',
      priorityLabel: 'MEDIUM',
      keywords: 'backup data restore cloud storage'
    },
  ];
}

/* ═══════════════════════════════════════════════════════
   24. RENDER SUGGESTIONS
   ═══════════════════════════════════════════════════════ */
function renderSuggestions(result) {
  document.getElementById('suggestionsPlaceholder').style.display = 'none';
  document.getElementById('suggestionsContent').style.display     = 'block';

  // Prioritize suggestions based on highest-risk categories
  const sortedCats = Object.keys(result.scores).sort((a,b) =>
    result.scores[b].pct - result.scores[a].pct
  );

  const prioritized = [];
  sortedCats.forEach(cat => {
    allSuggestionsDB.filter(s => s.category === cat).forEach(s => {
      if (!prioritized.find(p => p.id === s.id)) prioritized.push(s);
    });
  });

  // Top 3
  const top3 = prioritized.slice(0, 3);
  renderTop3(top3);

  // All suggestions list
  renderAllSuggestions(prioritized);
}

function renderTop3(items) {
  const grid = document.getElementById('top3Grid');
  grid.innerHTML = '';

  const rankLabels = ['#1 — MOST CRITICAL', '#2 — HIGH PRIORITY', '#3 — IMPORTANT'];
  const actionSteps = {
    'pwd-manager':       ['Download Bitwarden (free)', 'Import existing passwords', 'Enable browser extension'],
    'enable-2fa':        ['Install Authy or Google Authenticator', 'Enable on email first', 'Work through all critical accounts'],
    'vpn-usage':         ['Sign up for ProtonVPN or Mullvad', 'Install on all devices', 'Set to auto-connect on untrusted networks'],
    'phishing-awareness':['Practice URL inspection daily', 'Install uBlock Origin', 'Enable email warning banners'],
    'strong-passwords':  ['Audit existing passwords now', 'Replace all weak passwords this week', 'Set calendar reminder to audit quarterly'],
    'https-only':        ['Enable in browser settings', 'Install HTTPS Everywhere extension', 'Bookmark frequently-used sites directly'],
    'social-privacy':    ['Review each platform\'s privacy settings', 'Remove personal contact info', 'Audit friend/follower lists'],
    'email-filter':      ['Review spam filter settings', 'Subscribe to breach alerts (HaveIBeenPwned)', 'Enable suspicious login alerts'],
    'device-updates':    ['Enable auto-updates now', 'Run pending updates today', 'Schedule weekly check reminder'],
    'antivirus':         ['Download Malwarebytes Free', 'Run full scan immediately', 'Schedule weekly automated scans'],
  };

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = `top3-card rank-${idx + 1}`;
    const steps = actionSteps[item.id] || ['Review this area', 'Apply best practices', 'Monitor for improvements'];

    card.innerHTML = `
      <div class="top3-rank">${rankLabels[idx]}</div>
      <div class="top3-icon">${item.icon}</div>
      <div class="top3-title">${item.title}</div>
      <div class="top3-why">${item.desc}</div>
      <div class="top3-steps">
        <p>ACTION STEPS</p>
        <ul>
          ${steps.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderAllSuggestions(items) {
  const container = document.getElementById('allSuggestions');
  container.innerHTML = '';

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = `suggestion-item`;
    div.dataset.keywords = item.keywords;

    div.innerHTML = `
      <span class="sugg-icon">${item.icon}</span>
      <div class="sugg-body">
        <div class="sugg-title">${item.title}</div>
        <div class="sugg-desc">${item.desc}</div>
      </div>
      <span class="sugg-priority ${item.priority}">${item.priorityLabel}</span>
    `;
    container.appendChild(div);
  });
}

/* ═══════════════════════════════════════════════════════
   25. MATH FUNCTIONS DEMO (used in score computation)
   Math.sqrt, Math.abs, Math.floor, Math.ceil used below
   ═══════════════════════════════════════════════════════ */
function applyMathUtils(score) {
  const sqrtFactor  = Math.sqrt(score);
  const floorScore  = Math.floor(score);
  const ceilScore   = Math.ceil(score);
  const absScore    = Math.abs(score - 50);
  const piAdjust    = Math.round(Math.PI * score / 100);
  return Math.min(100, floorScore + piAdjust);
}

/* ═══════════════════════════════════════════════════════
   END OF DFM SCRIPT
   ======================================================= */
