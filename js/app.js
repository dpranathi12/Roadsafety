// ============================================================
//  RoadWatch — Main Application v9
//  Leaflet.js + OpenStreetMap  |  AI Driving Mode + Community Verification
// ============================================================
(function () {
  'use strict';

  const D = window.RW_DATA;
  const M = window.RW_MAP;

  // ─── App State ─────────────────────────────────────────
  let currentPage   = 'home';
  let mainMap       = null;
  let markerResult  = null;
  let gpsTracker    = null;
  let simTracker    = null;
  let userLat       = null;
  let userLng       = null;
  let rainMode      = false;
  let rainAnimId    = null;
  let rainCtrl      = null;
  let alertsEnabled = false;
  let lastAlertedId = null;
  let bumpCooldown  = false;

  // Sensor (auto-detect) state
  const S = window.RW_SENSOR;
  let sensorRunning     = false;
  let autoMarkers       = {};         // id → Leaflet marker
  let waveCtx           = null;       // canvas 2D context for oscilloscope
  let waveRaf           = null;       // requestAnimationFrame id
  let waveHistory       = new Array(200).fill(0);  // ring buffer copy for drawing
  let waveHistHead      = 0;

  // Drive Mode state
  const AI = window.RW_AI;
  let driveActive       = false;
  let driveMap          = null;
  let driveGpsTracker   = null;
  let driveAiMarkers    = {};          // id → Leaflet marker
  let driveDetCount     = 0;
  let driveVoiceEnabled = true;
  let driveLastAlert    = 0;
  let driveDemoMode     = false;
  let driveStream       = null;        // MediaStream from camera
  let driveNearestDist  = null;
  let driveNearestSev   = null;
  let driveSpeed        = '--';
  let onDemoModeToggleChange = null;
  let drivePotholeDistanceHistory = {};

  function updateFloatingStatusPanel() {
    const panel = document.getElementById('driving-status-panel');
    if (!panel) return;
    
    let html = '';
    if (!driveDemoMode) {
      html += `<div class="panel-mode-badge mode-live">● LIVE CAMERA</div>`;
    } else {
      html += `<div class="panel-mode-badge mode-demo">▶ DEMO MODE</div>`;
    }
    
    html += `
      <div class="panel-stat">
        <span class="panel-stat-label">Speed</span>
        <span class="panel-stat-value">${driveSpeed || '--'} km/h</span>
      </div>
      <div class="panel-stat">
        <span class="panel-stat-label">GPS Status</span>
        <span class="panel-stat-value" style="color: ${driveGpsTracker ? 'var(--green)' : 'var(--text-dim)'};">
          ${driveDemoMode ? 'Simulated' : (driveGpsTracker ? 'Connected' : 'Disconnected')}
        </span>
      </div>
      <div class="panel-stat">
        <span class="panel-stat-label">AI Status</span>
        <span class="panel-stat-value" style="color: ${driveActive ? (window.driveRoadDetected ? 'var(--green)' : '#f87171') : 'var(--text-dim)'};">
          ${driveActive ? (window.driveRoadDetected ? 'Active (Scanning)' : 'No Road Detected') : 'Inactive'}
        </span>
      </div>
      <div class="panel-stat">
        <span class="panel-stat-label">Camera</span>
        <span class="panel-stat-value">
          ${driveDemoMode ? 'Simulated Feed' : (driveStream ? 'Active (Rear)' : 'Inactive')}
        </span>
      </div>
      <div class="panel-stat">
        <span class="panel-stat-label">Rain Mode</span>
        <span class="panel-stat-value" style="color: ${rainMode ? 'var(--blue)' : 'var(--text-dim)'};">
          ${rainMode ? 'ON (Rain AI)' : 'OFF'}
        </span>
      </div>
    `;
    
    panel.innerHTML = html;
  }
  window.updateFloatingStatusPanel = updateFloatingStatusPanel;

  // ─── Router ────────────────────────────────────────────
  function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.nav-link').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page));
    document.body.classList.toggle('fullmap-mode', page === 'risk-map');
    if (page !== 'risk-map') window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  }

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function timeAgo(d) {
    const m = Math.floor((Date.now() - new Date(d)) / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function fmtDate(s) {
    return new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function animCount(el, target, dur = 1200) {
    const t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round((1 - (1 - p) ** 3) * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Rain mode ──────────────────────────────────────────
  function initRain() {
    const cv = document.getElementById('rain-canvas');
    if (!cv) return { start() {}, stop() {} };
    const ctx = cv.getContext('2d');
    let drops = [];
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const mk = () => ({ x: Math.random() * cv.width, y: Math.random() * -cv.height,
      spd: 5 + Math.random() * 9, len: 12 + Math.random() * 22,
      op: .08 + Math.random() * .22, w: .5 + Math.random() * 1.2 });
    for (let i = 0; i < 220; i++) { const d = mk(); d.y = Math.random() * cv.height; drops.push(d); }
    function draw() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = '#88c4f5'; ctx.lineCap = 'round';
      drops.forEach(d => {
        ctx.beginPath(); ctx.lineWidth = d.w; ctx.globalAlpha = d.op;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 1.5, d.y + d.len); ctx.stroke();
        d.y += d.spd; d.x += .6;
        if (d.y > cv.height) Object.assign(d, mk());
      });
      ctx.globalAlpha = 1; rainAnimId = requestAnimationFrame(draw);
    }
    return {
      start() { cv.classList.add('active'); document.body.classList.add('rain-mode'); draw(); },
      stop()  { cv.classList.remove('active'); document.body.classList.remove('rain-mode');
                if (rainAnimId) { cancelAnimationFrame(rainAnimId); rainAnimId = null; }
                ctx.clearRect(0, 0, cv.width, cv.height); },
    };
  }

  // ══════════════════════════════════════════════════════
  //  SHARED SNIPPETS
  // ══════════════════════════════════════════════════════
  function weatherHTML() {
    return rainMode
      ? `<div class="weather-widget rainy"><div class="weather-icon">🌧️</div>
          <div class="weather-info"><div class="weather-temp">24°C — Heavy Rain</div>
          <div class="weather-condition">Hyderabad · Humidity 94% · Visibility low</div></div>
          <div class="weather-alert"><span>⚠️</span> Pothole risk HIGH</div></div>`
      : `<div class="weather-widget"><div class="weather-icon">☀️</div>
          <div class="weather-info"><div class="weather-temp">35°C — Clear</div>
          <div class="weather-condition">Hyderabad · Humidity 58% · Visibility good</div></div></div>`;
  }

  function tickerHTML() {
    const dangerous = D.getAllPotholes().filter(p => p.severity === 'dangerous' && p.status !== 'repaired');
    const msgs = dangerous.map(p => `⚠️ ${p.description.substring(0, 48)}… (${p.lat.toFixed(3)}, ${p.lng.toFixed(3)})`);
    const t = (msgs.join('  ·  ') + '  ·  ' + msgs.join('  ·  '));
    return `<div class="notif-ticker"><div class="notif-ticker-icon">🔴</div>
      <div class="notif-ticker-text"><span>${t}</span></div></div>`;
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: HOME
  // ══════════════════════════════════════════════════════
  function renderHome() {
    const s = D.getStats();
    return `<section class="page page--home fade-in">
      <div class="hero-banner"><div class="hero-content">
        <div class="hero-badge">🛡️ Live Road Safety Platform</div>
        <h1>RoadWatch</h1>
        <p class="hero-sub">Real-time pothole detection powered by OpenStreetMap.<br>Your safety co-pilot for Indian roads.</p>
        <div class="hero-stats">
          <div class="stat-card"><span class="stat-num" data-count="${s.total}">0</span><span class="stat-label">Reported</span></div>
          <div class="stat-card stat-card--danger"><span class="stat-num" data-count="${s.dangerous}">0</span><span class="stat-label">Dangerous</span></div>
          <div class="stat-card stat-card--rain"><span class="stat-num" data-count="${s.rainHazards}">0</span><span class="stat-label">Rain Hazards</span></div>
          <div class="stat-card stat-card--fixed"><span class="stat-num" data-count="${s.repaired}">0</span><span class="stat-label">Repaired</span></div>
        </div>
        <div class="hero-actions">
          <button class="btn btn--primary btn--lg" onclick="window.__nav('risk-map')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            Open Live Map
          </button>
          <button class="btn btn--secondary" onclick="window.__nav('report')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Report Pothole
          </button>
        </div>
        ${rainMode ? `<div class="rain-warning-banner">🌧️ <strong>Rain Mode Active</strong> — ${s.rainHazards} potholes currently invisible. Drive with extreme caution!</div>` : ''}
      </div></div>
      ${weatherHTML()} ${tickerHTML()}
      <div class="home-map-section">
        <div class="section-header">
          <h2>📍 Live Road Map</h2>
          <div class="section-legend">
            <span class="leg-dot leg-dot--green"></span>Minor
            <span class="leg-dot leg-dot--yellow"></span>Medium
            <span class="leg-dot leg-dot--red"></span>Dangerous
          </div>
        </div>
        <div id="home-map" class="map-container"></div>
      </div>
      <div class="bump-detector" id="bump-detector">
        <div class="bump-icon">📱</div>
        <div class="bump-info"><div class="bump-title">Motion Sensor Active</div>
          <div class="bump-sub" id="bump-sub">Monitoring for road bumps…</div></div>
        <div class="bump-indicator"><div class="bump-bar" id="bump-bar" style="width:5%"></div></div>
        <button class="bump-btn" id="bump-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Simulate Bump</button>
      </div>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon feature-icon--blue"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg></div>
          <h3>Real-Time GPS Tracking</h3>
          <p>Live blue dot tracks your location. Proximity alerts fire within 50 m of any pothole.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon feature-icon--amber"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
          <h3>Severity Markers</h3>
          <p>Google-style drop pins — 🔴 Red = Dangerous · 🟠 Orange = Medium · 🟢 Green = Minor</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon feature-icon--green"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg></div>
          <h3>OpenStreetMap</h3>
          <p>Roads, street names, shops, hospitals, landmarks — all visible. No API key needed.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon feature-icon--rose"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
          <h3>Bump Detection</h3>
          <p>Motion sensor concept — accelerometer auto-detects jolts and marks potholes.</p>
        </div>
      </div>
    </section>`;
  }

  function setupHome() {
    // Animate counters
    $$('[data-count]').forEach(el => animCount(el, +el.dataset.count));

    // CartoDB Voyager — full road detail, works from file://
    mainMap = M.initMap('home-map', { center: [20.5937, 78.9629], zoom: 5, tile: 'standard' });
    if (!mainMap) return;
    markerResult = M.plotPotholes(mainMap, D.getAllPotholes(), {
      userLat, userLng,
      onMarkerClick: p => showDetail(p),
    });
    window.__showDetail = id => { const p = D.getPotholeById(id); if (p) showDetail(p); };

    if (navigator.geolocation) {
      showToast('📍 Requesting location access...', 'info');
      gpsTracker = M.startRealTracking(mainMap, {
        followUser: true,
        onPositionUpdate(lat, lng) { 
          userLat = lat; userLng = lng; 
          mainMap.setView([lat, lng], 17);
          D.fetchRealOrGeneratePotholes(lat, lng, (didLoad) => {
            if (markerResult) M.clearMarkers(markerResult);
            markerResult = M.plotPotholes(mainMap, D.getAllPotholes(), {
              userLat, userLng,
              onMarkerClick: p => showDetail(p),
            });
          });
        },
        onNearbyPothole(p, dist) {
          if (lastAlertedId === p.id) return;
          lastAlertedId = p.id;
          showAlert(p, Math.round(dist));
          setTimeout(() => { lastAlertedId = null; }, 12000);
        },
      });
    }

    setupBump();
  }

  function setupBump() {
    const btn = document.getElementById('bump-btn');
    const sub = document.getElementById('bump-sub');
    const bar = document.getElementById('bump-bar');
    if (!btn) return;
    const idle = setInterval(() => {
      if (!document.getElementById('bump-bar')) { clearInterval(idle); return; }
      bar.style.width = (4 + Math.random() * 10) + '%';
      bar.style.background = 'linear-gradient(90deg,#43A047,#66BB6A)';
    }, 200);
    btn.addEventListener('click', () => {
      if (bumpCooldown) return;
      bumpCooldown = true; btn.disabled = true;
      let f = 0;
      const iv = setInterval(() => {
        if (!document.getElementById('bump-bar')) { clearInterval(iv); return; }
        const v = f < 5 ? 20 + f * 16 : Math.max(5, 100 - (f - 5) * 18);
        bar.style.width = v + '%';
        bar.style.background = `linear-gradient(90deg,${v > 70 ? '#E53935' : v > 40 ? '#FB8C00' : '#43A047'},${v > 70 ? '#EF9A9A' : '#FFF9C4'})`;
        f++;
        if (f > 12) {
          clearInterval(iv);
          bar.style.width = '5%'; bar.style.background = 'linear-gradient(90deg,#43A047,#66BB6A)';
          const np = D.addPothole({ lat: userLat + (Math.random() - .5) * .001, lng: userLng + (Math.random() - .5) * .001,
            severity: D.SEVERITY.MEDIUM, rainHazard: rainMode, reporter: 'AutoSensor',
            description: `Auto-detected bump at (${userLat.toFixed(4)},${userLng.toFixed(4)}) via motion sensor.` });
          if (sub) sub.textContent = `⚠️ Bump detected! Auto-reported as #${np.id}`;
          showToast(`📱 Bump detected! Auto-reported pothole #${np.id}`, 'success');
          setTimeout(() => { bumpCooldown = false; btn.disabled = false;
            if (sub) sub.textContent = 'Monitoring for road bumps…'; }, 4000);
        }
      }, 80);
    });
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: DETECT
  // ══════════════════════════════════════════════════════
  function renderDetect() {
    return `<section class="page page--detect fade-in">
      <div class="page-header"><h2>📱 Motion Sensor Detection</h2>
        <p>Simulate automatic bump detection using mobile accelerometer</p></div>
      <div class="sensor-layout">
        <div class="sensor-panel">
          <div class="sensor-header">
            <div class="sensor-status-dot" id="sensor-dot"></div>
            <h3>Accelerometer Feed</h3>
            <span class="sensor-badge" id="sensor-badge">INACTIVE</span>
          </div>
          <div class="accel-display" id="accel-display">
            <div class="accel-axis"><span class="axis-label">X</span>
              <div class="axis-bar-track"><div class="axis-bar axis-bar--x" id="axis-x" style="width:50%"></div></div>
              <span class="axis-val" id="axis-x-val">0.0</span></div>
            <div class="accel-axis"><span class="axis-label">Y</span>
              <div class="axis-bar-track"><div class="axis-bar axis-bar--y" id="axis-y" style="width:50%"></div></div>
              <span class="axis-val" id="axis-y-val">0.0</span></div>
            <div class="accel-axis"><span class="axis-label">Z (Vertical)</span>
              <div class="axis-bar-track"><div class="axis-bar axis-bar--z" id="axis-z" style="width:50%"></div></div>
              <span class="axis-val" id="axis-z-val">9.8</span></div>
          </div>
          <div class="bump-threshold"><span>Bump threshold: <strong>±3.5 m/s²</strong></span></div>
        </div>
        <div class="sensor-panel">
          <div class="sensor-header"><h3>Detection Log</h3><span class="sensor-badge sensor-badge--live">LIVE</span></div>
          <div class="detect-log" id="detect-log"><div class="log-empty">🛣️ Start simulation to see bump events…</div></div>
        </div>
      </div>
      <div class="sensor-controls">
        <button class="btn btn--primary btn--lg" id="start-sensor-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16 10,8"/></svg>Start Simulation</button>
        <button class="btn btn--outline btn--lg" id="trigger-bump-btn" disabled>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Trigger Bump</button>
      </div>
      <div class="ai-detect-section">
        <div class="section-header" style="margin-top:40px">
          <h2>🔍 AI Image Analysis</h2><span class="section-hint">Upload a road photo for severity classification</span></div>
        <div class="detect-layout">
          <div class="upload-area" id="upload-area">
            <div class="upload-placeholder" id="upload-placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <p>Drag &amp; drop an image<br>or <span class="upload-browse">browse files</span></p><small>JPG, PNG up to 10 MB</small>
            </div>
            <img id="upload-preview" class="upload-preview hidden" alt="Preview"/>
            <input type="file" id="file-input" accept="image/*" hidden/>
          </div>
          <div class="detect-result hidden" id="detect-result"><h3>Analysis Result</h3><div class="result-card" id="result-card"></div></div>
        </div>
        <div class="analysis-progress hidden" id="analysis-progress">
          <div class="progress-steps" id="progress-steps">
            <div class="progress-step" data-step="1"><div class="step-dot">1</div><span class="step-label">Upload</span></div>
            <div class="progress-step" data-step="2"><div class="step-dot">2</div><span class="step-label">Processing</span></div>
            <div class="progress-step" data-step="3"><div class="step-dot">3</div><span class="step-label">Analysis</span></div>
            <div class="progress-step" data-step="4"><div class="step-dot">4</div><span class="step-label">Result</span></div>
          </div>
          <div class="progress-bar-track"><div class="progress-bar-fill" id="progress-bar" style="width:0%"></div></div>
        </div>
        <button class="btn btn--primary btn--lg" id="detect-btn" disabled style="margin-top:16px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Analyze Image</button>
      </div>
    </section>`;
  }

  function setupDetect() {
    // Sensor sim
    const startBtn = document.getElementById('start-sensor-btn');
    const trigBtn  = document.getElementById('trigger-bump-btn');
    const dot      = document.getElementById('sensor-dot');
    const badge    = document.getElementById('sensor-badge');
    if (!startBtn) return;
    let running = false, sv = null, lc = 0;
    const ua = (x, y, z) => {
      ['x','y','z'].forEach((a, i) => {
        const v = [x,y,z][i], el = document.getElementById(`axis-${a}`), ve = document.getElementById(`axis-${a}-val`);
        if (!el) return;
        el.style.width = Math.min(100, Math.max(0, 50 + v * 5)) + '%';
        if (ve) ve.textContent = v.toFixed(2);
        el.style.background = (a === 'z' ? Math.abs(v - 9.8) : Math.abs(v)) > 3.5 ? '#E53935' : '#1A73E8';
      });
    };
    const addLog = (type, x, y, z) => {
      const el = document.getElementById('detect-log'); if (!el) return;
      el.querySelector('.log-empty')?.remove();
      const item = document.createElement('div'); item.className = `log-item log-item--${type}`;
      const now  = new Date().toLocaleTimeString('en-IN', { hour12: false });
      item.innerHTML = `<span class="log-dot log-dot--${type}"></span><span class="log-time">${now}</span>
        <span class="log-msg">${type === 'bump' ? '🚨 BUMP DETECTED' : '✅ Road smooth'}</span>
        <span class="log-vals">x=${x.toFixed(1)} y=${y.toFixed(1)} z=${z.toFixed(1)}</span>`;
      el.insertBefore(item, el.firstChild);
      if (++lc > 12) el.lastChild?.remove();
    };
    startBtn.addEventListener('click', () => {
      if (running) {
        clearInterval(sv); running = false;
        dot.classList.remove('active'); badge.textContent = 'INACTIVE'; badge.className = 'sensor-badge'; trigBtn.disabled = true;
        startBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16 10,8"/></svg> Start Simulation`;
      } else {
        running = true; dot.classList.add('active'); badge.textContent = 'ACTIVE'; badge.className = 'sensor-badge sensor-badge--live'; trigBtn.disabled = false;
        startBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg> Stop`;
        sv = setInterval(() => { const x = (Math.random() - .5) * 1.2, y = (Math.random() - .5) * 1.0, z = 9.8 + (Math.random() - .5) * .6; ua(x, y, z); if (Math.random() < .08) addLog('smooth', x, y, z); }, 150);
      }
    });
    trigBtn.addEventListener('click', () => {
      if (!running) return;
      const x = (Math.random() > .5 ? 1 : -1) * (4 + Math.random() * 4), y = (Math.random() > .5 ? 1 : -1) * (3.5 + Math.random() * 3), z = 9.8 + (Math.random() > .5 ? 1 : -1) * (4.5 + Math.random() * 4);
      ua(x, y, z); addLog('bump', x, y, z);
      const ad = document.getElementById('accel-display');
      if (ad) { ad.style.borderColor = '#E53935'; ad.style.boxShadow = '0 0 20px rgba(229,57,53,.4)'; setTimeout(() => { ad.style.borderColor = ''; ad.style.boxShadow = ''; }, 600); }
      showToast('📱 Bump detected via accelerometer!', 'success');
    });
    // Image detect
    const input = document.getElementById('file-input'), preview = document.getElementById('upload-preview'),
          ph    = document.getElementById('upload-placeholder'), area = document.getElementById('upload-area'),
          btn   = document.getElementById('detect-btn'), rd = document.getElementById('detect-result'),
          rc    = document.getElementById('result-card'), pw = document.getElementById('analysis-progress'),
          pb    = document.getElementById('progress-bar'), steps = document.querySelectorAll('.progress-step');
    if (!area) return;
    area.addEventListener('click', () => input.click());
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', e => { e.preventDefault(); area.classList.remove('dragover'); if (e.dataTransfer.files.length) hf(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files.length) hf(input.files[0]); });
    let uf = null;
    function hf(f) { uf = f; const r = new FileReader(); r.onload = e => { preview.src = e.target.result; preview.classList.remove('hidden'); ph.classList.add('hidden'); btn.disabled = false; }; r.readAsDataURL(f); }
    function ss(n) { steps.forEach((s, i) => { s.classList.remove('active', 'done'); if (i + 1 < n) s.classList.add('done'); else if (i + 1 === n) s.classList.add('active'); }); pb.style.width = ((n - 1) / (steps.length - 1) * 100) + '%'; }
    btn.addEventListener('click', () => {
      if (!uf) return; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Analyzing…`;
      rd.classList.add('hidden'); pw.classList.remove('hidden');
      ss(1); setTimeout(() => ss(2), 600); setTimeout(() => ss(3), 1400); setTimeout(() => ss(4), 2200);
      setTimeout(() => {
        pb.style.width = '100%'; steps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
        const svs = [D.SEVERITY.MINOR, D.SEVERITY.MEDIUM, D.SEVERITY.DANGEROUS],
              sv  = svs[Math.floor(Math.random() * svs.length)],
              conf = (70 + Math.random() * 28).toFixed(1),
              col  = { minor: '#43A047', medium: '#FB8C00', dangerous: '#E53935' }[sv];
        const det = { minor: { depth: '2-3 cm', width: '15-20 cm', risk: 'Low risk.' },
                      medium: { depth: '5-8 cm', width: '30-50 cm', risk: 'Moderate risk. Can cause tyre damage.' },
                      dangerous: { depth: '10-15 cm', width: '60-100 cm', risk: 'High risk! Can cause accidents.' } };
        rc.innerHTML = `<div class="result-severity" style="--sev-color:${col}">
          <div class="result-sev-badge" style="background:${col}">${D.SEVERITY_LABELS[sv]}</div>
          <div class="result-confidence">${conf}% confidence</div></div>
          <div class="result-details">
            <div class="result-detail"><strong>Depth:</strong> ${det[sv].depth}</div>
            <div class="result-detail"><strong>Width:</strong> ${det[sv].width}</div>
            <div class="result-detail"><strong>Risk:</strong> ${det[sv].risk}</div>
            ${sv === 'dangerous' ? '<div class="result-rain-warn">🌧️ Extremely dangerous during rain!</div>' : ''}
          </div>
          <button class="btn btn--primary btn--sm" onclick="window.__nav('report')">Report This Pothole →</button>`;
        rd.classList.remove('hidden'); btn.disabled = false;
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Analyze Again`;
      }, 2800);
    });
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: REPORT
  // ══════════════════════════════════════════════════════
  function renderReport() {
    return `<section class="page page--report fade-in">
      <div class="page-header"><h2>📝 Report a Pothole</h2><p>Help make roads safer by reporting potholes in your area</p></div>
      <form class="report-form" id="report-form">
        <div class="form-grid">
          <div class="form-group form-group--full">
            <label>Upload Photo</label>
            <div class="report-upload" id="report-upload-area">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Click or drag to upload</span>
              <img id="report-preview" class="report-preview hidden" alt="Preview"/>
            </div>
            <input type="file" id="report-image" accept="image/*" hidden/>
          </div>
          <div class="form-group">
            <label for="report-severity">Severity</label>
            <select id="report-severity">
              <option value="minor">🟢 Minor</option>
              <option value="medium" selected>🟠 Medium</option>
              <option value="dangerous">🔴 Dangerous</option>
            </select>
          </div>
          <div class="form-group">
            <label>Rain Hazard?</label>
            <label class="toggle-label"><input type="checkbox" id="report-rain" checked/>
              <span class="toggle-slider"></span><span>Hidden during rain</span></label>
          </div>
          <div class="form-group form-group--full">
            <label for="report-desc">Description <small>(optional)</small></label>
            <textarea id="report-desc" rows="3" placeholder="Describe the pothole location, size, road conditions…"></textarea>
          </div>
          <div class="form-group form-group--full">
            <label>GPS Location</label>
            <div class="gps-display">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
              <span id="gps-coords">Acquiring location…</span>
            </div>
          </div>
          <div class="form-group form-group--full">
            <label>Pin Location on Map</label>
            <div id="report-map" class="map-container map-container--small"></div>
            <small class="map-hint">Tap on map to mark pothole location</small>
          </div>
        </div>
        <button type="submit" class="btn btn--primary btn--lg">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Submit Report
        </button>
      </form>
    </section>`;
  }

  function setupReport() {
    let rLat = userLat || 20.5937, rLng = userLng || 78.9629;
    const coordsEl = document.getElementById('gps-coords');

    // Report map
    const rMap = M.initMap('report-map', { center: [rLat, rLng], zoom: 17 });
    if (!rMap) return;

    // Custom Layer Control
    if (rMap._rwTileLayer) rMap.removeLayer(rMap._rwTileLayer);
    
    const normalMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(rMap);
    const satMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' });

    L.control.layers({
      "Normal Map": normalMap,
      "Satellite View": satMap
    }).addTo(rMap);

    // Draggable pin marker with clear highlighted red drop pin
    const pinSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="54" viewBox="0 0 40 54">
      <defs><filter id="dsr" x="-30%" y="-20%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="rgba(0,0,0,0.35)"/></filter></defs>
      <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 54 20 54C20 54 40 35 40 20C40 8.95 31.05 0 20 0Z" fill="#E53935" filter="url(#dsr)"/>
      <circle cx="20" cy="20" r="10" fill="white"/>
      <circle cx="20" cy="20" r="4" fill="#E53935"/>
    </svg>`;

    const pinMarker = L.marker([rLat, rLng], {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: pinSVG,
        iconSize: [40, 54], iconAnchor: [20, 54],
      }),
    }).addTo(rMap);

    const update = latlng => {
      rLat = latlng.lat; rLng = latlng.lng;
      if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)}`;
    };
    pinMarker.on('dragend', () => update(pinMarker.getLatLng()));
    rMap.on('click', e => { 
      pinMarker.setLatLng(e.latlng); 
      update(e.latlng); 
      rMap.panTo(e.latlng, { animate: true, duration: 0.5 });
    });

    // Try real GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        rLat = pos.coords.latitude; rLng = pos.coords.longitude;
        rMap.setView([rLat, rLng], 17);
        pinMarker.setLatLng([rLat, rLng]);
        if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)}`;
      }, () => {
        if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)} (default)`;
      }, { timeout: 5000 });
    } else {
      if (coordsEl) coordsEl.textContent = `${rLat.toFixed(6)}, ${rLng.toFixed(6)} (default)`;
    }

    // Image upload
    const imgInput  = document.getElementById('report-image');
    const uploadArea = document.getElementById('report-upload-area');
    const imgPrev   = document.getElementById('report-preview');
    let reportImg = null;
    uploadArea.addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', () => {
      if (!imgInput.files.length) return;
      const r = new FileReader();
      r.onload = e => { imgPrev.src = e.target.result; imgPrev.classList.remove('hidden'); reportImg = e.target.result; };
      r.readAsDataURL(imgInput.files[0]);
    });

    document.getElementById('report-form').addEventListener('submit', e => {
      e.preventDefault();
      const entry = D.addPothole({
        lat: rLat, lng: rLng,
        severity:   document.getElementById('report-severity').value,
        rainHazard: document.getElementById('report-rain').checked,
        description: document.getElementById('report-desc').value || 'Pothole reported via RoadWatch',
        reporter: 'You', image: reportImg,
      });
      showToast(`✅ Pothole #${entry.id} reported! Complaint forwarded to: ${entry.authority}`, 'success');
      setTimeout(() => navigate('risk-map'), 1500);
    });
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: LIVE MAP  (full-screen, Google Maps-style UI)
  // ══════════════════════════════════════════════════════
  function renderRiskMap() {
    const active = D.getAllPotholes().filter(p => p.status !== 'repaired').length;
    return `<section class="page page--risk page--fullmap fade-in">
      <div class="gmap-shell" id="gmap-shell">

        <!-- Full-screen map -->
        <div id="risk-map" class="gmap-canvas"></div>

        <!-- Top overlay bar -->
        <div class="gmap-topbar">
          <div class="gmap-topbar-left">
            <div class="gmap-brand-pill">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
              RoadWatch Live Map
            </div>
            ${rainMode ? `<div class="gmap-rain-badge">🌧 Rain Mode</div>` : ''}
          </div>
          <div class="gmap-legend-bar">
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#E53935"></span>Dangerous</span>
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#FB8C00"></span>Medium</span>
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#43A047"></span>Minor</span>
            <span class="gmap-leg-item"><span class="gmap-leg-dot" style="background:#1A73E8"></span>You</span>
          </div>
        </div>

        <!-- Left FAB toolbar -->
        <div class="gmap-fab-bar">
          <button class="gmap-fab gmap-fab--gps" id="fab-gps" title="Toggle GPS">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
            <span>GPS</span>
          </button>
          <button class="gmap-fab" id="fab-center" title="Centre on me">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
            <span>Centre</span>
          </button>
          <button class="gmap-fab" id="fab-route" title="Show safe routes">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <span>Route</span>
          </button>
          <button class="gmap-fab" id="fab-alerts" title="Toggle proximity alerts">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span>Alerts</span>
          </button>
        </div>

        <!-- Map tile switcher -->
        <div class="gmap-style-switcher">
          <button class="gmap-style-btn active" data-tile="standard">🗺 Standard</button>
          <button class="gmap-style-btn" data-tile="detailed">🔍 Detailed</button>
          <button class="gmap-style-btn" data-tile="positron">☀️ Minimal</button>
          <button class="gmap-style-btn" data-tile="satellite">🛰 Satellite</button>
        </div>

        <!-- GPS HUD -->
        <div class="gmap-hud" id="gmap-hud">
          <div class="gmap-hud-row">
            <div class="gmap-hud-dot" id="hud-dot"></div>
            <span class="gmap-hud-label" id="hud-status">GPS Off</span>
          </div>
          <div class="gmap-hud-coords" id="hud-coords">—</div>
          <div class="gmap-hud-speed-row">
            <span class="gmap-hud-speed" id="hud-speed">--</span>
            <span class="gmap-hud-unit">km/h</span>
          </div>
        </div>

        <!-- Pothole count chip -->
        <div class="gmap-count-badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          ${active} active potholes
        </div>

      </div>

      <!-- Detail side panel -->
      <div class="gmap-detail-panel hidden" id="gmap-detail-panel">
        <button class="gmap-detail-close" onclick="window.__closeDetail()">✕</button>
        <div id="detail-content"></div>
      </div>

      <!-- Proximity alert feed -->
      <div class="gmap-prox-feed hidden" id="gmap-prox-feed">
        <div class="gmap-prox-header">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Proximity Alerts
          <button class="gmap-prox-clear" id="prox-clear">Clear</button>
        </div>
        <div class="gmap-prox-list" id="prox-list">
          <div class="gmap-prox-empty">Enable GPS &amp; Alerts to see warnings…</div>
        </div>
      </div>

    </section>`;
  }

  function setupRiskMap() {
    // CartoDB Voyager as default — full road/shop/label detail, works from file://
    mainMap = M.initMap('risk-map', { center: [20.5937, 78.9629], zoom: 5, tile: 'standard' });
    if (!mainMap) return;

    const potholes = D.getAllPotholes().filter(p => p.status !== 'repaired');

    markerResult = M.plotPotholes(mainMap, potholes, {
      userLat, userLng,
      onMarkerClick: p => showDetail(p),
    });

    window.__showDetail = id => { const p = D.getPotholeById(id); if (p) showDetail(p); };
    window.__closeDetail = closeDetail;

    // ── Tile switcher ───────────────────────────────────
    document.querySelectorAll('.gmap-style-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.gmap-style-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        mainMap.switchTile(this.dataset.tile);
      });
    });

    // ── HUD helpers ─────────────────────────────────────
    const hudDot    = document.getElementById('hud-dot');
    const hudStatus = document.getElementById('hud-status');
    const hudCoords = document.getElementById('hud-coords');
    const hudSpeed  = document.getElementById('hud-speed');

    function updateHud(lat, lng, spd) {
      userLat = lat; userLng = lng;
      if (hudCoords) hudCoords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (hudSpeed)  hudSpeed.textContent  = spd != null ? spd : '--';
    }

    // ── GPS FAB ─────────────────────────────────────────
    const fabGps = document.getElementById('fab-gps');
    let gpsOn = false, usingReal = false;

    function startGPS() {
      fabGps.classList.add('active');
      if (hudDot)    hudDot.classList.add('active');
      if (hudStatus) hudStatus.textContent = 'Acquiring…';

      gpsTracker = M.startRealTracking(mainMap, {
        followUser: true,
        onPositionUpdate(lat, lng, spd) {
          usingReal = true;
          if (hudStatus) hudStatus.textContent = '🔵 Real GPS';
          updateHud(lat, lng, spd);
          
          D.fetchRealOrGeneratePotholes(lat, lng, (didLoad) => {
            if (markerResult) M.clearMarkers(markerResult);
            markerResult = M.plotPotholes(mainMap, D.getAllPotholes().filter(p => p.status !== 'repaired'), {
              userLat, userLng,
              onMarkerClick: p => showDetail(p),
            });
          });
        },
        onNearbyPothole(p, d) {
          if (!alertsEnabled || lastAlertedId === p.id) return;
          lastAlertedId = p.id;
          addProxItem(p, Math.round(d));
          showAlert(p, Math.round(d));
          setTimeout(() => { lastAlertedId = null; }, 15000);
        },
        onError() { if (hudStatus) hudStatus.textContent = 'GPS Error'; },
      });
    }

    function stopGPS() {
      fabGps.classList.remove('active');
      usingReal = false;
      if (gpsTracker)  { gpsTracker.stop();  gpsTracker = null; }
      if (hudDot)    hudDot.classList.remove('active');
      if (hudStatus) hudStatus.textContent = 'GPS Off';
      if (hudCoords) hudCoords.textContent = '—';
      if (hudSpeed)  hudSpeed.textContent  = '--';
    }

    fabGps.addEventListener('click', () => {
      gpsOn = !gpsOn;
      if (gpsOn) { alert("Allow location access"); startGPS(); showToast('📍 GPS activated', 'success'); }
      else       { stopGPS();  showToast('🛑 GPS stopped', 'info'); }
    });

    // Auto-start GPS
    gpsOn = true; alert("Allow location access"); startGPS();

    // ── Centre FAB ──────────────────────────────────────
    document.getElementById('fab-center').addEventListener('click', () => {
      mainMap.flyTo([userLat, userLng], 17, { animate: true, duration: 1 });
    });

    // ── Route FAB ───────────────────────────────────────
    const fabRoute = document.getElementById('fab-route');
    let routeOn = false, routeLayers = [];
    fabRoute.addEventListener('click', () => {
      if (routeOn) {
        routeLayers.forEach(l => mainMap.removeLayer(l));
        routeLayers = []; routeOn = false;
        fabRoute.classList.remove('active');
        showToast('Route hidden', 'info');
      } else {
        routeLayers = M.drawSafeRoutes(mainMap, D.getMockRoutes());
        routeOn = true; fabRoute.classList.add('active');
        showToast('✅ Safe route in green · Risky in red', 'success');
      }
    });

    // ── Alerts FAB ──────────────────────────────────────
    const fabAlerts = document.getElementById('fab-alerts');
    const proxFeed  = document.getElementById('gmap-prox-feed');
    fabAlerts.addEventListener('click', () => {
      alertsEnabled = !alertsEnabled;
      fabAlerts.classList.toggle('active', alertsEnabled);
      if (proxFeed) proxFeed.classList.toggle('hidden', !alertsEnabled);
      showToast(alertsEnabled ? '🔔 Proximity alerts ON (50 m)' : '🔕 Alerts disabled', alertsEnabled ? 'success' : 'info');
      if (alertsEnabled) {
        setTimeout(() => {
          const demo = potholes.find(p => p.severity === 'dangerous');
          if (demo) { addProxItem(demo, 42); showAlert(demo, 42); }
        }, 2000);
      }
    });

    // ── Prox clear ──────────────────────────────────────
    document.getElementById('prox-clear')?.addEventListener('click', () => {
      const l = document.getElementById('prox-list');
      if (l) l.innerHTML = '<div class="gmap-prox-empty">Feed cleared…</div>';
    });
  }

  // ── Add proximity feed item ────────────────────────────
  function addProxItem(p, dist) {
    const list = document.getElementById('prox-list'); if (!list) return;
    list.querySelector('.gmap-prox-empty')?.remove();
    const colors = { dangerous: '#E53935', medium: '#FB8C00', minor: '#43A047' };
    const item = document.createElement('div');
    item.className = 'gmap-prox-item';
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `
      <div class="gmap-prox-dot" style="background:${colors[p.severity]}"></div>
      <div class="gmap-prox-info">
        <div class="gmap-prox-title">${D.SEVERITY_LABELS[p.severity]} — <strong>${dist}m</strong></div>
        <div class="gmap-prox-desc">${p.description.substring(0, 52)}…</div>
      </div>
      <div class="gmap-prox-time">${now}</div>`;
    list.insertBefore(item, list.firstChild);
    if (list.children.length > 5) list.lastChild?.remove();
  }

  // ── Pothole detail side panel ──────────────────────────
  function showDetail(p) {
    const panel   = document.getElementById('gmap-detail-panel');
    const content = document.getElementById('detail-content');
    if (!panel || !content) return;

    const colors  = { dangerous: '#E53935', medium: '#FB8C00', minor: '#43A047' };
    const color   = colors[p.severity];
    const dist    = D.distanceMeters(userLat, userLng, p.lat, p.lng);
    const distTxt = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`;
    const status  = { pending: 'Pending', in_progress: 'In Progress', repaired: 'Repaired', community_verified: 'Community Verified' };

    const isAi = p.source === 'ai' || p.reporter === 'AI Scanner' || String(p.id).startsWith('ai') || p.confidence !== undefined;
    const statusTxt = isAi ? '📱 AI Detected' : '👥 Community Verified';
    const confVal = p.confidence ? Math.round(p.confidence * 100) + '%' : (isAi ? '94%' : 'Community Verified');

    const timeTxt = p.reportedAt 
      ? new Date(p.reportedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    content.innerHTML = `
      <div class="detail-sev-stripe" style="background:${color}"></div>
      <div class="detail-body">
        <div class="detail-header">
          <span class="detail-badge detail-badge--${p.severity}">${D.SEVERITY_LABELS[p.severity]}</span>
          <span class="detail-dist">📍 ${distTxt} away</span>
        </div>
        <h3 class="detail-title">Pothole #${p.id}</h3>
        <p class="detail-desc">${p.description}</p>
        <div class="detail-meta-grid">
          <div class="detail-meta-item">
            <div class="detail-meta-label">Detection Type</div>
            <div class="detail-meta-val">${statusTxt}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Confidence</div>
            <div class="detail-meta-val">🎯 ${confVal}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Distance</div>
            <div class="detail-meta-val">📏 ${distTxt}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Detection Time</div>
            <div class="detail-meta-val">🕒 ${timeTxt}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Status</div>
            <div class="detail-meta-val">${status[p.status] || p.status}</div>
          </div>
          <div class="detail-meta-item">
            <div class="detail-meta-label">Reports</div>
            <div class="detail-meta-val">👥 ${p.reporterCount || 1}</div>
          </div>
          <div class="detail-meta-item detail-meta-item--full">
            <div class="detail-meta-label">Responsible Authority</div>
            <div class="detail-meta-val">🏛️ <strong>${p.authority || 'Unknown Local Body'}</strong></div>
          </div>
          <div class="detail-meta-item detail-meta-item--full">
            <div class="detail-meta-label">Coordinates</div>
            <div class="detail-meta-val detail-meta-val--mono">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
          </div>
        </div>
        ${p.rainHazard ? `<div class="detail-rain-warn"><span>🌧️</span> <span>Becomes <strong>invisible</strong> under rainwater — extreme caution!</span></div>` : ''}
        <div class="detail-actions">
          <button class="btn btn--primary btn--sm" onclick="window.__nav('report')">Report Similar</button>
          <button class="btn btn--outline btn--sm" onclick="window.__closeDetail()">Close</button>
        </div>
      </div>`;

    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('visible'));
  }

  function closeDetail() {
    const panel = document.getElementById('gmap-detail-panel');
    if (!panel) return;
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 300);
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: DASHBOARD
  // ══════════════════════════════════════════════════════
  function renderDashboard() {
    const potholes = D.getAllPotholes();
    const s = D.getStats();
    const activity = potholes.slice(0, 6).map(p => {
      const t = p.status === 'repaired' ? 'success' : p.status === 'in_progress' ? '' : p.severity === 'dangerous' ? 'danger' : 'warning';
      const act = p.status === 'repaired' ? 'repaired' : p.status === 'in_progress' ? 'marked in progress' : 'reported';
      return `<div class="activity-item activity-item--${t}">
        <div class="activity-content">
          <div class="activity-text"><strong>${p.reporter}</strong> ${act} a <strong>${D.SEVERITY_LABELS[p.severity]}</strong> pothole ${p.rainHazard ? '🌧' : ''} <span class="reporter-count-chip">👥 ${p.reporterCount || 1}</span></div>
          <div class="activity-time">${timeAgo(p.reportedAt)} · ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</div>
        </div></div>`;
    }).join('');
    const rows = potholes.map(p => {
      const srcLabel = D.SOURCE_LABELS ? (D.SOURCE_LABELS[p.source] || 'User Reported') : 'User Reported';
      const srcColor = p.source === 'ai' ? '#6366f1' : p.source === 'community_verified' ? '#8b5cf6' : '#64748b';
      return `<tr class="dash-row" data-source="${p.source || 'manual'}" data-status="${p.status}">
      <td>#${p.id}</td>
      <td><span style="font-size:11px;padding:2px 7px;border-radius:999px;background:${srcColor}22;color:${srcColor};font-weight:700">${srcLabel}</span></td>
      <td><span class="severity-badge severity-badge--${p.severity}">${D.SEVERITY_LABELS[p.severity]}</span>${p.rainHazard ? '<span class="rain-chip">💧</span>' : ''}${p.aiVerified ? '<span style="font-size:10px;margin-left:4px;background:#6366f122;color:#6366f1;padding:1px 5px;border-radius:4px;font-weight:700">🤖</span>' : ''}</td>
      <td class="td-desc">${p.description.substring(0, 55)}${p.description.length > 55 ? '…' : ''}</td>
      <td><span style="font-size:12px;padding:3px 6px;background:#f1f5f9;border-radius:4px;font-weight:600;color:#334155;white-space:nowrap">${p.authority || 'Unknown'}</span></td>
      <td>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</td>
      <td><span class="reporter-count-chip">👥 ${p.reporterCount || 1}</span></td>
      <td>${timeAgo(p.reportedAt)}</td>
      <td><select class="status-select status-select--${p.status}" data-id="${p.id}">
        <option value="pending"            ${p.status === 'pending'            ? 'selected' : ''}>Pending</option>
        <option value="in_progress"        ${p.status === 'in_progress'        ? 'selected' : ''}>In Progress</option>
        <option value="community_verified" ${p.status === 'community_verified' ? 'selected' : ''}>Community Verified</option>
        <option value="repaired"           ${p.status === 'repaired'           ? 'selected' : ''}>Repaired</option>
      </select></td></tr>`;
    }).join('');

    return `<section class="page page--dashboard fade-in">
      <div class="page-header"><h2>📊 Live Dashboard</h2><p>Monitor AI-detected, community-verified, and manually-reported potholes</p></div>

      <!-- Stat cards -->
      <div class="dash-stats">
        <div class="dash-stat-card">
          <span class="dash-stat-num" data-count="${s.total}">0</span>
          <span class="dash-stat-label">Total</span>
        </div>
        <div class="dash-stat-card dash-stat-card--ai">
          <span class="dash-stat-num" data-count="${s.aiDetected}">0</span>
          <span class="dash-stat-label">AI Detected</span>
        </div>
        <div class="dash-stat-card dash-stat-card--community">
          <span class="dash-stat-num" data-count="${s.communityVerified}">0</span>
          <span class="dash-stat-label">Community Verified</span>
        </div>
        <div class="dash-stat-card dash-stat-card--danger">
          <span class="dash-stat-num" data-count="${s.dangerous}">0</span>
          <span class="dash-stat-label">Dangerous</span>
        </div>
        <div class="dash-stat-card dash-stat-card--pending">
          <span class="dash-stat-num" data-count="${s.pending}">0</span>
          <span class="dash-stat-label">Pending</span>
        </div>
        <div class="dash-stat-card dash-stat-card--repaired">
          <span class="dash-stat-num" data-count="${s.repaired}">0</span>
          <span class="dash-stat-label">Repaired</span>
        </div>
      </div>

      <!-- Tab filter -->
      <div class="dash-tab-bar">
        <button class="dash-tab active" data-filter="all">All (${s.total})</button>
        <button class="dash-tab" data-filter="ai">🤖 AI Detected (${s.aiDetected})</button>
        <button class="dash-tab" data-filter="community">👥 Community Verified (${s.communityVerified})</button>
        <button class="dash-tab" data-filter="user">📝 User Reported (${s.userReported})</button>
        <button class="dash-tab" data-filter="repaired">✅ Repaired (${s.repaired})</button>
      </div>

      <!-- Charts -->
      <div class="dash-charts">
        <div class="chart-card"><h3>Severity Distribution</h3><div class="chart-container"><canvas id="chart-severity"></canvas></div></div>
        <div class="chart-card"><h3>Source Breakdown</h3><div class="chart-container"><canvas id="chart-source"></canvas></div></div>
      </div>

      <!-- Activity -->
      <div class="activity-feed"><h3>📋 Recent Activity</h3><div class="activity-list">${activity}</div></div>

      <!-- Data table -->
      <div class="table-wrapper" id="dash-table-wrap">
        <table class="dash-table" id="dash-table">
          <thead><tr>
            <th>ID</th><th>Source</th><th>Severity</th><th>Description</th>
            <th>Authority</th><th>Location</th><th>Reports</th><th>Time</th><th>Status</th>
          </tr></thead>
          <tbody id="dash-tbody">${rows}</tbody>
        </table>
      </div>
    </section>`;
  }

  function setupDashboard() {
    $$('[data-count]').forEach(el => animCount(el, +el.dataset.count));
    document.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', function () {
        D.updatePotholeStatus(+this.dataset.id, this.value);
        this.className = `status-select status-select--${this.value}`;
        showToast(`Pothole #${this.dataset.id} → ${D.STATUS_LABELS[this.value] || this.value}`, 'success');
        const row = this.closest('tr');
        if (row) row.dataset.status = this.value;
        applyDashFilter(document.querySelector('.dash-tab.active')?.dataset?.filter || 'all');
      });
    });

    // Tab filter logic
    function applyDashFilter(filter) {
      document.querySelectorAll('.dash-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
      document.querySelectorAll('#dash-tbody .dash-row').forEach(row => {
        const src    = row.dataset.source || 'manual';
        const status = row.dataset.status || '';
        let show = false;
        switch (filter) {
          case 'all':       show = true; break;
          case 'ai':        show = src === 'ai' || row.querySelector('.ai-badge') !== null; break;
          case 'community': show = src === 'community_verified' || status === 'community_verified'; break;
          case 'user':      show = src === 'manual' || !src || src === 'undefined'; break;
          case 'repaired':  show = status === 'repaired'; break;
        }
        row.style.display = show ? '' : 'none';
      });
    }

    document.querySelectorAll('.dash-tab').forEach(tab => {
      tab.addEventListener('click', () => applyDashFilter(tab.dataset.filter));
    });

    setupCharts();
  }

  function setupCharts() {
    if (typeof Chart === 'undefined') return;
    const p = D.getAllPotholes();
    const minor     = p.filter(x => x.severity === 'minor').length,
          medium    = p.filter(x => x.severity === 'medium').length,
          dangerous = p.filter(x => x.severity === 'dangerous').length;
    const s = D.getStats();

    Chart.defaults.color = '#8891ab'; Chart.defaults.borderColor = 'rgba(255,255,255,.06)';

    // Severity donut
    const sc = document.getElementById('chart-severity');
    if (sc) new Chart(sc, { type: 'doughnut', data: { labels: ['Minor','Medium','Dangerous'],
      datasets: [{ data: [minor,medium,dangerous], backgroundColor: ['#43A047','#FB8C00','#E53935'],
      borderColor: 'rgba(12,15,26,.8)', borderWidth: 3, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 12, family: 'Inter' } } } },
        animation: { animateRotate: true, duration: 1400 } } });

    // Source breakdown donut
    const src = document.getElementById('chart-source');
    if (src) new Chart(src, { type: 'doughnut',
      data: { labels: ['User Reported','AI Detected','Community Verified'],
        datasets: [{ data: [s.userReported, s.aiDetected, s.communityVerified],
          backgroundColor: ['#1A73E8','#6366f1','#8b5cf6'],
          borderColor: 'rgba(12,15,26,.8)', borderWidth: 3, hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 12, family: 'Inter' } } } },
        animation: { animateRotate: true, duration: 1400, delay: 300 } } });
  }

  // ══════════════════════════════════════════════════════
  //  PAGE: DRIVE MODE
  // ══════════════════════════════════════════════════════
  function renderDrive() {
    return `<section class="page page--drive fade-in" id="drive-page">

      <!-- ── TOP: Camera + AI Detection ─────────────────────── -->
      <div class="drive-cam-wrap" id="drive-cam-wrap">

        <!-- Demo mode road canvas -->
        <canvas id="drive-road-canvas" class="drive-road-canvas"></canvas>

        <!-- Real camera video (hidden until available) -->
        <video id="drive-video" class="drive-video" autoplay muted playsinline></video>

        <!-- AI detection overlay canvas -->
        <canvas id="drive-overlay-canvas" class="drive-overlay-canvas"></canvas>

        <!-- Active mode badge -->
        <div class="drive-active-badge hidden" id="drive-active-badge"></div>

        <!-- Status bar top -->
        <div class="drive-status-bar">
          <div class="drive-status-left">
            <div class="drive-ai-badge" id="drive-ai-badge">
              <span class="drive-ai-dot" id="drive-ai-dot"></span>
              <span id="drive-ai-label">AI STANDBY</span>
            </div>
          </div>
          <div class="drive-status-right">
            <div class="drive-speed-chip">
              <span id="drive-speed-val">--</span>
              <span class="drive-speed-unit">km/h</span>
            </div>
          </div>
        </div>

        <!-- Detection count chip -->
        <div class="drive-det-count" id="drive-det-count">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <span id="drive-det-num">0</span> AI detections
        </div>

        <!-- Start / Stop button overlay (shown when not active) -->
        <div class="drive-start-overlay" id="drive-start-overlay">
          <div class="drive-mode-selector">
            <div class="mode-option" id="mode-opt-live">
              <span class="mode-bullet">●</span>
              <div class="mode-opt-meta">
                <div class="mode-opt-title">Live Driving Mode</div>
                <div class="mode-opt-desc">Rear camera + real GPS tracking</div>
              </div>
            </div>
            <div class="mode-option active" id="mode-opt-demo">
              <span class="mode-bullet">▶</span>
              <div class="mode-opt-meta">
                <div class="mode-opt-title">Demo Mode</div>
                <div class="mode-opt-desc">Pre-recorded video + simulated route</div>
              </div>
            </div>
          </div>
          <button class="drive-start-btn" id="drive-start-btn">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Launch Session
          </button>
        </div>
      </div>

      <!-- ── ALERT BANNER ────────────────────────────────── -->
      <div class="drive-alert-banner hidden" id="drive-alert-banner">
        <div class="drive-alert-icon">⚠</div>
        <div class="drive-alert-body">
          <div class="drive-alert-title" id="drive-alert-title">Pothole Detected</div>
          <div class="drive-alert-meta" id="drive-alert-meta"></div>
        </div>
        <div class="drive-alert-badge" id="drive-alert-badge">SLOW DOWN</div>
      </div>

      <!-- ── HUD STRIP ───────────────────────────────────── -->
      <div class="drive-hud-strip">
        <div class="drive-hud-item">
          <div class="drive-hud-val" id="hud-speed">--</div>
          <div class="drive-hud-label">km/h</div>
        </div>
        <div class="drive-hud-divider"></div>
        <div class="drive-hud-item">
          <div class="drive-hud-val" id="hud-nearest">--</div>
          <div class="drive-hud-label">Nearest (m)</div>
        </div>
        <div class="drive-hud-divider"></div>
        <div class="drive-hud-item">
          <div class="drive-hud-val drive-hud-val--sev" id="hud-severity">--</div>
          <div class="drive-hud-label">Severity</div>
        </div>
        <div class="drive-hud-divider"></div>
        <div class="drive-hud-item">
          <div class="drive-hud-val" id="hud-gps-status">--</div>
          <div class="drive-hud-label">GPS Status</div>
        </div>
        <div class="drive-hud-divider"></div>
        <div class="drive-hud-item">
          <div class="drive-hud-val" id="hud-ai-status">Active</div>
          <div class="drive-hud-label">AI Status</div>
        </div>
      </div>

      <!-- ── BOTTOM: Mini Live Map ────────────────────────── -->
      <div class="drive-map-section">
        <div class="drive-map-header">
          <span class="drive-map-title">📍 Live Map — AI Detections</span>
          <div class="drive-map-legend">
            <span class="drive-leg"><span class="drive-leg-dot" style="background:#EF4444"></span>Dangerous</span>
            <span class="drive-leg"><span class="drive-leg-dot" style="background:#F59E0B"></span>Medium</span>
            <span class="drive-leg"><span class="drive-leg-dot" style="background:#22C55E"></span>Minor</span>
            <span class="drive-leg"><span class="drive-leg-dot" style="background:#A78BFA"></span>AI Auto</span>
          </div>
          <label class="drive-voice-toggle" title="Toggle voice alerts">
            <input type="checkbox" id="drive-voice-chk" checked>
            <span class="drive-voice-icon">🔊</span> Voice
          </label>
        </div>
        <div id="drive-map" class="drive-map-canvas"></div>
      </div>

    </section>`;
  }

  // ── Stop all drive-mode resources ─────────────────────────
  function stopDrive() {
    if (!driveActive) return;
    driveActive = false;
    if (AI) { AI.stopDetection(); AI.stopDemoRoad(); }
    if (driveGpsTracker) { driveGpsTracker.stop(); driveGpsTracker = null; }
    if (driveStream) { driveStream.getTracks().forEach(t => t.stop()); driveStream = null; }
    document.getElementById('drive-start-overlay')?.classList.remove('hidden');
    const badge = document.getElementById('drive-ai-badge');
    if (badge) badge.classList.remove('active');
    const dot = document.getElementById('drive-ai-dot');
    if (dot)   dot.classList.remove('active');
    const lbl = document.getElementById('drive-ai-label');
    if (lbl)   lbl.textContent = 'AI STANDBY';
    document.getElementById('drive-alert-banner')?.classList.add('hidden');
    document.title = 'RoadWatch — Live Road Safety Platform';

    document.getElementById('drive-page')?.classList.remove('driving-active');
    const panel = document.getElementById('driving-status-panel');
    if (panel) panel.style.display = 'none';

    const activeBadge = document.getElementById('drive-active-badge');
    if (activeBadge) {
      activeBadge.textContent = '';
      activeBadge.className = 'drive-active-badge hidden';
    }

    // Reset navbar buttons and status indicators
    if (window.updateDriveButton) window.updateDriveButton(false);
    if (window.updateStatusIndicators) window.updateStatusIndicators(false);
    onDemoModeToggleChange = null;
    drivePotholeDistanceHistory = {};
  }

  function setupDrive() {
    if (!AI) { console.warn('RW_AI not loaded'); return; }

    driveActive     = false;
    driveAiMarkers  = {};
    driveDetCount   = 0;
    driveDemoMode   = false;
    driveStream     = null;

    // ── Init mini map ────────────────────────────────────────
    const center = (userLat && userLng) ? [userLat, userLng] : [17.3350, 78.4520];
    driveMap = M.initMap('drive-map', { center, zoom: 16, tile: 'standard' });
    if (!driveMap) return;

    // Drive map marker result reference (for refresh)
    let driveMapMarkerResult = null;
    let driveMapDangerLayers = [];

    function refreshDriveMapMarkers(lat, lng) {
      // Guard: driveMap may be null if user navigated away mid-callback
      if (!driveMap) return;
      // Clear old markers
      if (driveMapMarkerResult) M.clearMarkers(driveMapMarkerResult);
      // Clear old danger rings
      driveMapDangerLayers.forEach(l => { if (driveMap.hasLayer(l)) driveMap.removeLayer(l); });
      driveMapDangerLayers = [];

      // Plot potholes within 3 km
      driveMapMarkerResult = M.plotPotholes(driveMap, D.getAllPotholes().filter(p => p.status !== 'repaired'), {
        userLat: lat, userLng: lng,
        radiusKm: 3,
        isDriveMode: true,
        onMarkerClick: () => {},
      });

      // Highlight dangerous potholes ahead (within 200 m)
      driveMapDangerLayers = M.highlightDangerousAhead(driveMap, lat, lng, 200);
    }

    // Initial plot
    refreshDriveMapMarkers(
      userLat || 17.3350,
      userLng || 78.4520
    );

    // ── Canvas sizing ────────────────────────────────────────
    const camWrap      = document.getElementById('drive-cam-wrap');
    const roadCanvas   = document.getElementById('drive-road-canvas');
    const overlayCanvas= document.getElementById('drive-overlay-canvas');

    function sizeCanvases() {
      const W = camWrap.offsetWidth  || 640;
      const H = camWrap.offsetHeight || 360;
      roadCanvas.width    = W; roadCanvas.height    = H;
      overlayCanvas.width = W; overlayCanvas.height = H;
    }
    sizeCanvases();
    window.addEventListener('resize', sizeCanvases);

    // ── Voice toggle ─────────────────────────────────────────
    document.getElementById('drive-voice-chk')?.addEventListener('change', e => {
      driveVoiceEnabled = e.target.checked;
      showToast(driveVoiceEnabled ? '🔊 Voice alerts ON' : '🔇 Voice alerts OFF', 'info');
    });

    // ── On each AI detection ──────────────────────────────────
    function onDetection(det) {
      if (!driveActive) return;
      driveDetCount++;

      // Update HUD
      const hudDet = document.getElementById('hud-det-count');
      if (hudDet) hudDet.textContent = driveDetCount;
      const detNum = document.getElementById('drive-det-num');
      if (detNum) detNum.textContent = driveDetCount;

      // Update nearest distance
      if (driveNearestDist === null || det.distM < driveNearestDist) {
        driveNearestDist = det.distM;
        driveNearestSev  = det.severity;
      }
      const hudNear = document.getElementById('hud-nearest');
      if (hudNear) hudNear.textContent = Math.round(driveNearestDist);
      const hudSev  = document.getElementById('hud-severity');
      if (hudSev) {
        hudSev.textContent = det.severity.charAt(0).toUpperCase() + det.severity.slice(1);
        hudSev.style.color = AI.SEV_COLOR[det.severity] || '#fff';
      }

      // Trigger warning notification if dangerous and within 30 meters
      if (det.severity === 'dangerous' && det.distM <= 30) {
        const tempP = {
          id: 'ai-new-' + Date.now(),
          severity: det.severity,
          confidence: det.conf,
          lat: userLat || 17.335,
          lng: userLng || 78.452,
          reporterCount: 1,
          description: `AI camera detected dangerous pothole on route.`,
          isNewRoutePothole: true
        };
        showAlert(tempP, Math.round(det.distM));
      }

      // Auto-map the detection (or merge with existing)
      const lat = userLat ? userLat + (Math.random() - 0.5) * 0.0008 : 17.335 + (Math.random() - 0.5) * 0.002;
      const lng = userLng ? userLng + (Math.random() - 0.5) * 0.0008 : 78.452 + (Math.random() - 0.5) * 0.002;

      const merged = D.mergeDetection(lat, lng, 15, det.conf);
      if (!merged) {
        // New pothole — add to data + map
        const entry = D.addPothole({
          lat, lng,
          severity:    det.severity,
          rainHazard:  false,
          reporter:    'AI Camera',
          reporterCount: 1,
          description: `AI detected ${det.severity} pothole. Confidence: ${Math.round(det.conf * 100)}%. Distance: ${Math.round(det.distM)}m ahead.`,
          source:      'ai',
          confidence:  det.conf,
          aiVerified:  true,
        });

        if (driveMap) {
          // Use animated single-marker plot for newly detected potholes
          const m = M.plotSingleAnimated(driveMap, entry, {
            userLat, userLng, onMarkerClick: () => {},
          });
          if (m) driveAiMarkers[entry.id] = m;
        }
      }
      // Update page title for hackathon demo visibility
      document.title = `⚠ ${det.severity.toUpperCase()} POTHOLE ${Math.round(det.distM)}m — RoadWatch AI`;
    }

    // ── Start driving (camera path) ───────────────────────────
    async function startCameraMode() {
      try {
        driveStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const video = document.getElementById('drive-video');
        if (!video) return;
        video.srcObject = driveStream;
        video.classList.remove('hidden');
        roadCanvas.classList.add('hidden');
        
        const activeBadge = document.getElementById('drive-active-badge');
        if (activeBadge) {
          activeBadge.textContent = '● LIVE CAMERA';
          activeBadge.className = 'drive-active-badge active-live';
        }
        
        startActiveMode(false);
      } catch (err) {
        showToast('📷 Camera unavailable — switching to Demo Mode', 'info');
        const liveOpt = document.getElementById('mode-opt-live');
        const demoOpt = document.getElementById('mode-opt-demo');
        if (liveOpt) liveOpt.classList.remove('active');
        if (demoOpt) demoOpt.classList.add('active');
        startDemoMode();
      }
    }

    // ── Start demo mode ───────────────────────────────────────
    function startDemoMode() {
      driveDemoMode = true;
      document.getElementById('drive-video')?.classList.add('hidden');
      roadCanvas.classList.remove('hidden');
      
      const activeBadge = document.getElementById('drive-active-badge');
      if (activeBadge) {
        activeBadge.textContent = '▶ DEMO MODE';
        activeBadge.className = 'drive-active-badge active-demo';
      }
      
      AI.startDemoRoad(roadCanvas);
      startActiveMode(true);
    }

    function startActiveMode(isDemo) {
      driveActive     = true;
      driveDetCount   = 0;
      driveNearestDist= null;
      driveNearestSev = null;
      window.driveRoadDetected = isDemo; // Demo starts with road detected, live camera waits for first check

      document.getElementById('drive-start-overlay')?.classList.add('hidden');
      document.getElementById('drive-active-badge')?.classList.remove('hidden');
      document.getElementById('drive-page')?.classList.add('driving-active');

      // Initialize HUD indicators
      const hudAi = document.getElementById('hud-ai-status');
      if (hudAi) hudAi.textContent = '🟢 ACTIVE';

      // Activate AI badge
      const badge = document.getElementById('drive-ai-badge');
      const dot   = document.getElementById('drive-ai-dot');
      const lbl   = document.getElementById('drive-ai-label');
      if (badge) badge.classList.add('active');
      if (dot)   dot.classList.add('active');
      if (lbl)   lbl.textContent = 'AI ACTIVE';

      // Update navbar buttons and status indicators
      if (window.updateDriveButton) window.updateDriveButton(true);
      if (window.updateStatusIndicators) window.updateStatusIndicators(true);

      // Helper to update nearest pothole in the bottom HUD continuously
      function updateNearestPotholeHUD(lat, lng) {
        let nearestDist = null;
        let nearestSev = null;
        D.getAllPotholes().forEach(p => {
          if (p.status === 'repaired') return;
          const d = D.distanceMeters(lat, lng, p.lat, p.lng);
          if (nearestDist === null || d < nearestDist) {
            nearestDist = d;
            nearestSev = p.severity;
          }
        });

        const elNear = document.getElementById('hud-nearest');
        if (elNear) {
          elNear.textContent = nearestDist !== null ? Math.round(nearestDist) : '--';
        }
        const elSev = document.getElementById('hud-severity');
        if (elSev) {
          if (nearestSev) {
            elSev.textContent = nearestSev.charAt(0).toUpperCase() + nearestSev.slice(1);
            elSev.style.color = AI.SEV_COLOR[nearestSev] || '#fff';
          } else {
            elSev.textContent = '--';
            elSev.style.color = '#fff';
          }
        }
      }

      // Start AI detection loop
      AI.startDetection(isDemo ? null : document.getElementById('drive-video'), overlayCanvas, {
        demoMode:    isDemo,
        onDetection,
        enableVoice: driveVoiceEnabled,
        onRoadStatusChange(isRoad, conf) {
          window.driveRoadDetected = isRoad;
          updateFloatingStatusPanel();
          const el = document.getElementById('hud-ai-status');
          if (el) {
            if (isRoad) {
              el.textContent = '🟢 ACTIVE';
              el.style.color = '';
            } else {
              el.textContent = '⚠️ NO ROAD';
              el.style.color = '#f87171';
            }
          }
        },
      });

      // Start GPS
      if (isDemo) {
        driveGpsTracker = M.startSimulatedTracking(driveMap, {
          vehicleMode: true,   // keep vehicle centered
          onPositionUpdate(lat, lng, spd) {
            userLat = lat; userLng = lng;
            driveSpeed = spd || '--';
            const el = document.getElementById('drive-speed-val');
            if (el) el.textContent = driveSpeed;
            const el2 = document.getElementById('hud-speed');
            if (el2) el2.textContent = driveSpeed;
            const el3 = document.getElementById('hud-gps-status');
            if (el3) el3.textContent = '🟢 SIM';
            
            D.fetchRealOrGeneratePotholes(lat, lng, (didLoad) => {
              refreshDriveMapMarkers(lat, lng);
              updateNearestPotholeHUD(lat, lng);
              updateFloatingStatusPanel();
            });
          },
          onNearbyPothole(p, d) {
            if (lastAlertedId === p.id) return;
            lastAlertedId = p.id;
            showAlert(p, Math.round(d));
            setTimeout(() => { lastAlertedId = null; }, 15000);
          }
        });
      } else {
        driveGpsTracker = M.startRealTracking(driveMap, {
          vehicleMode: true,   // keep vehicle centered
          onPositionUpdate(lat, lng, spd) {
            userLat = lat; userLng = lng;
            driveSpeed = spd || '--';
            const el = document.getElementById('drive-speed-val');
            if (el) el.textContent = driveSpeed;
            const el2 = document.getElementById('hud-speed');
            if (el2) el2.textContent = driveSpeed;
            const el3 = document.getElementById('hud-gps-status');
            if (el3) el3.textContent = '🟢 ON';
            
            D.fetchRealOrGeneratePotholes(lat, lng, (didLoad) => {
              refreshDriveMapMarkers(lat, lng);
              updateNearestPotholeHUD(lat, lng);
              updateFloatingStatusPanel();
            });
          },
          onNearbyPothole(p, d) {
            if (lastAlertedId === p.id) return;
            lastAlertedId = p.id;
            showAlert(p, Math.round(d));
            setTimeout(() => { lastAlertedId = null; }, 15000);
          },
          onError() {
            const el = document.getElementById('hud-gps-status');
            if (el) el.textContent = '🔴 ERR';
          }
        });
      }

      // Display floating status panel
      const panel = document.getElementById('driving-status-panel');
      if (panel) panel.style.display = 'block';
      updateFloatingStatusPanel();

      showToast('🚗 Driving Mode activated! AI scanning road ahead…', 'success');
    }

    // ── Button handlers & Mode selectors ──────────────────────
    const liveOpt = document.getElementById('mode-opt-live');
    const demoOpt = document.getElementById('mode-opt-demo');
    
    if (liveOpt && demoOpt) {
      liveOpt.addEventListener('click', () => {
        liveOpt.classList.add('active');
        demoOpt.classList.remove('active');
      });
      demoOpt.addEventListener('click', () => {
        demoOpt.classList.add('active');
        liveOpt.classList.remove('active');
      });
    }

    document.getElementById('drive-start-btn')?.addEventListener('click', () => {
      const isDemo = demoOpt && demoOpt.classList.contains('active');
      if (isDemo) {
        startDemoMode();
      } else {
        startCameraMode();
      }
    });
  }

  // ══════════════════════════════════════════════════════
  //  RENDER ENGINE
  // ══════════════════════════════════════════════════════
  const pages = {
    home:      { render: renderHome,      setup: setupHome },
    drive:     { render: renderDrive,     setup: setupDrive },
    detect:    { render: renderDetect,    setup: setupDetect },
    report:    { render: renderReport,    setup: setupReport },
    'risk-map':{ render: renderRiskMap,   setup: setupRiskMap },
    dashboard: { render: renderDashboard, setup: setupDashboard },
  };

  function render() {
    // Teardown previous map/trackers
    if (driveActive)  stopDrive();
    if (gpsTracker)   { gpsTracker.stop();  gpsTracker  = null; }
    if (simTracker)   { simTracker.stop();   simTracker  = null; }
    if (markerResult) { M.clearMarkers(markerResult); markerResult = null; }
    if (mainMap)      { mainMap.remove(); mainMap = null; }
    if (driveMap && currentPage !== 'drive') { driveMap.remove(); driveMap = null; }

    const main = document.getElementById('main-content');
    if (!main) return;
    const pg = pages[currentPage];
    main.innerHTML = pg.render();
    requestAnimationFrame(() => pg.setup());
  }

  // ══════════════════════════════════════════════════════
  //  ALERT POPUP & TOAST
  // ══════════════════════════════════════════════════════
  function showAlert(p, dist) {
    if (p.severity !== 'dangerous') {
      return;
    }

    const prevDist = drivePotholeDistanceHistory[p.id];
    drivePotholeDistanceHistory[p.id] = dist;
    const isApproaching = prevDist === undefined || dist < prevDist;

    const isNewRoute = p.isNewRoutePothole === true;
    const isWithinAlertRange = dist >= 20 && dist <= 30;

    if (!isNewRoute && (!isWithinAlertRange || !isApproaching)) {
      return;
    }

    const nearbyHazards = D.getAllPotholes().filter(other => {
      if (other.id === p.id) return false;
      if (other.status === 'repaired') return false;
      const d = D.distanceMeters(p.lat, p.lng, other.lat, other.lng);
      return d <= 50;
    });

    const isGrouped = nearbyHazards.length > 0;
    const hazardCount = 1 + nearbyHazards.length;

    if (driveVoiceEnabled && ('speechSynthesis' in window)) {
      if (!window.driveSpokenPotholes) window.driveSpokenPotholes = new Set();
      if (!window.driveSpokenPotholes.has(p.id)) {
        window.driveSpokenPotholes.add(p.id);
        const speakText = isGrouped 
          ? "Warning! Multiple potholes ahead." 
          : "Warning! Dangerous pothole ahead.";
        const utt = new SpeechSynthesisUtterance(speakText);
        utt.rate = 1.05;
        window.speechSynthesis.speak(utt);
        setTimeout(() => { window.driveSpokenPotholes.delete(p.id); }, 30000);
      }
    }

    if (currentPage === 'drive') {
      const banner = document.getElementById('drive-alert-banner');
      if (banner) {
        banner.classList.remove('hidden');
        banner.className = `drive-alert-banner drive-alert-banner--dangerous`;
        
        const title = document.getElementById('drive-alert-title');
        const meta  = document.getElementById('drive-alert-meta');
        const badge = document.getElementById('drive-alert-badge');
        
        if (isGrouped) {
          if (title) title.innerHTML = `⚠️ Multiple Potholes`;
          if (meta)  meta.innerHTML  = `${hazardCount} hazards within 50m`;
          if (badge) badge.textContent = `SLOW DOWN`;
        } else {
          if (title) title.innerHTML = `⚠️ Dangerous Pothole`;
          if (meta)  meta.innerHTML  = `${dist}m Ahead<br>Confidence: ${Math.round((p.confidence || 0.95) * 100)}%`;
          if (badge) badge.textContent = `BRAKE NOW`;
        }
        
        clearTimeout(banner._hideTimer);
        clearTimeout(banner._hideTimer2);
        banner.classList.remove('banner-fade');
        
        banner._hideTimer = setTimeout(() => banner.classList.add('banner-fade'), 3500);
        banner._hideTimer2 = setTimeout(() => { 
          banner.classList.add('hidden'); 
          banner.classList.remove('banner-fade'); 
        }, 4000);
      }
      return;
    }

    document.querySelector('.rw-alert-overlay')?.remove();
    const colors = { dangerous: '#E53935', medium: '#FB8C00', minor: '#43A047' };
    const color  = colors[p.severity];
    const el = document.createElement('div');
    el.className = 'rw-alert-overlay';
    el.innerHTML = `
      <div class="rw-alert-card" style="--alert-color:${color}">
        <div class="alert-icon-wrap" style="background:${color}20;border-color:${color}">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 style="color:${color}">⚠️ Pothole Ahead!</h3>
        ${dist ? `<div class="alert-distance"><strong>${dist}m</strong> ahead</div>` : ''}
        <p class="alert-severity"><strong>${D.SEVERITY_LABELS[p.severity]}</strong> · 👥 ${p.reporterCount || 1} reports</p>
        ${p.rainHazard ? `<p class="alert-rain">🌧️ <strong>Hidden under water</strong> — invisible to drivers!</p>` : ''}
        <p class="alert-desc">${p.description}</p>
        <div class="alert-actions">
          <button class="btn btn--primary" onclick="this.closest('.rw-alert-overlay').remove()">✓ Got it — Drive Safe</button>
          <button class="btn btn--outline btn--sm" onclick="this.closest('.rw-alert-overlay').remove()">Dismiss</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    setTimeout(() => { if (el.parentNode) el.remove(); }, 10000);
  }

  function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `rw-toast rw-toast--${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  // ══════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════
  function init() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', e => { e.preventDefault(); navigate(link.dataset.page); });
    });

    const burger  = document.getElementById('burger');
    const navMenu = document.getElementById('nav-links');
    if (burger) {
      burger.addEventListener('click', () => { navMenu.classList.toggle('open'); burger.classList.toggle('open'); });
      navMenu.addEventListener('click', () => { navMenu.classList.remove('open'); burger.classList.remove('open'); });
    }

    function updateRainStatus(isOn) {
      const rainStatus = document.getElementById('rain-status');
      if (rainStatus) {
        rainStatus.innerHTML = `<span class="label-long">🌧 Rain Mode </span><span class="label-short">🌧 </span><span class="status-state">${isOn ? 'ON' : 'OFF'}</span>`;
      }
    }
    window.updateRainStatus = updateRainStatus;

    rainCtrl = initRain();
    const rainToggle = document.getElementById('rain-mode-toggle');
    const rainStatus = document.getElementById('rain-status');
    if (rainToggle && rainStatus) {
      rainToggle.addEventListener('change', () => {
        rainMode = rainToggle.checked;
        updateRainStatus(rainMode);
        rainMode ? rainCtrl.start() : rainCtrl.stop();
        showToast(rainMode ? '🌧️ Rain Mode activated!' : '☀️ Rain Mode deactivated', 'info');
        if (currentPage !== 'drive') {
          render();
        } else {
          updateFloatingStatusPanel();
        }
      });
    }

    function updateDriveButton(isDriving) {
      const startBtn = document.getElementById('start-driving-btn');
      const activeGroup = document.getElementById('driving-active-status');
      if (!startBtn || !activeGroup) return;
      if (isDriving) {
        startBtn.style.display = 'none';
        activeGroup.style.display = 'flex';
      } else {
        startBtn.style.display = 'inline-flex';
        activeGroup.style.display = 'none';
      }
    }
    window.updateDriveButton = updateDriveButton;

    function updateStatusIndicators(isActive) {}
    window.updateStatusIndicators = updateStatusIndicators;

    const startDrivingBtn = document.getElementById('start-driving-btn');
    if (startDrivingBtn) {
      startDrivingBtn.addEventListener('click', () => {
        if (currentPage !== 'drive') {
          navigate('drive');
        }
        // Trigger Launch on the Drive page start overlay
        setTimeout(() => {
          const launchBtn = document.getElementById('drive-start-btn');
          if (launchBtn) launchBtn.click();
        }, 80);
      });
    }

    const stopDrivingBtn = document.getElementById('stop-driving-btn');
    if (stopDrivingBtn) {
      stopDrivingBtn.addEventListener('click', () => {
        stopDrive();
      });
    }

    window.__nav = navigate;
    render();
  }

  document.addEventListener('DOMContentLoaded', init);

})();
