// ============================================================
//  RoadWatch — Automatic Pothole Detection Engine  v1
//  Simulates smartphone accelerometer + gyroscope at 50 Hz
//  Detects pothole events, clusters by GPS, grades severity
// ============================================================
window.RW_SENSOR = (function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────
  const SAMPLE_HZ   = 50;          // samples per second
  const INTERVAL_MS = 1000 / SAMPLE_HZ;
  const HISTORY     = 200;         // waveform ring buffer size
  const COOLDOWN_SAMPLES = 25;     // ~500ms lockout after a detection
  const CLUSTER_RADIUS_M = 18;     // merge detections within 18 m
  const GRAVITY          = 9.81;

  // Severity thresholds (peak g above baseline, m/s²)
  const THRESHOLDS = {
    minor:     2.2,   // jolt felt but minimal risk
    medium:    4.8,   // noticeable bump, tyre risk
    dangerous: 8.0,   // hard impact, accident risk
  };

  // ── State ─────────────────────────────────────────────────
  let running       = false;
  let usingReal     = false;
  let motionListener = null;
  let simTimer      = null;

  // Sensor physics state
  let gravityEst    = GRAVITY;   // running low-pass gravity estimate
  let cooldown      = 0;
  let simTime       = 0;
  let nextBumpAt    = 3 + Math.random() * 5;   // seconds until next simulated bump
  let bumpPhase     = 0;         // 0 = idle, >0 = actively bumping

  // Waveform ring buffer
  let waveBuffer    = new Float32Array(HISTORY).fill(0);
  let waveHead      = 0;

  // Detection store
  let detections    = [];
  let nextId        = 1000;      // start high to distinguish from manual reports

  // Current GPS position (updated externally)
  let curLat        = 17.3350;
  let curLng        = 78.4520;

  // Callbacks
  let cbSample      = null;   // fn({ az, filtered, gravity })
  let cbDetected    = null;   // fn(detection)          — new pothole found
  let cbUpdated     = null;   // fn(detection, delta)   — confidence increased

  // ── GPS helpers ───────────────────────────────────────────
  function setPosition(lat, lng) { curLat = lat; curLng = lng; }

  function haversineM(lat1, lng1, lat2, lng2) {
    const R   = 6_371_000;
    const φ1  = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δφ  = (lat2 - lat1) * Math.PI / 180;
    const Δλ  = (lng2 - lng1) * Math.PI / 180;
    const a   = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ── Severity classification ───────────────────────────────
  function classifySeverity(peak) {
    if (peak >= THRESHOLDS.dangerous) return 'dangerous';
    if (peak >= THRESHOLDS.medium)    return 'medium';
    return 'minor';
  }

  // Upgrade severity if confidence or new peak warrants it
  function upgradeSeverity(det) {
    if (det.peakAcc >= THRESHOLDS.dangerous || det.confidence >= 7)
      det.severity = 'dangerous';
    else if (det.peakAcc >= THRESHOLDS.medium || det.confidence >= 4)
      det.severity = 'medium';
  }

  // ── Core sample processor ─────────────────────────────────
  function processSample(az) {
    // ① Low-pass filter → gravity estimate
    gravityEst = gravityEst * 0.97 + az * 0.03;

    // ② High-pass: remove gravity to get dynamic motion
    const filtered = az - gravityEst;
    const peak     = Math.abs(filtered);

    // ③ Push to waveform ring buffer
    waveBuffer[waveHead] = filtered;
    waveHead = (waveHead + 1) % HISTORY;

    // ④ Fire sample callback (drives waveform canvas)
    if (cbSample) cbSample({ az, filtered, peak, gravity: gravityEst });

    // ⑤ Cooldown countdown
    if (cooldown > 0) { cooldown--; return; }

    // ⑥ Threshold check
    if (peak >= THRESHOLDS.minor) {
      cooldown = COOLDOWN_SAMPLES;
      triggerDetection(peak);
    }
  }

  // ── Detection handler ─────────────────────────────────────
  function triggerDetection(peak) {
    const severity = classifySeverity(peak);

    // Tiny GPS jitter ±10 m simulating real GPS inaccuracy
    const jLat = curLat + (Math.random() - 0.5) * 0.00018;
    const jLng = curLng + (Math.random() - 0.5) * 0.00018;

    // Find nearby existing detection to cluster
    const nearby = detections.find(d =>
      haversineM(d.lat, d.lng, jLat, jLng) <= CLUSTER_RADIUS_M);

    if (nearby) {
      nearby.confidence++;
      nearby.peakAcc    = Math.max(nearby.peakAcc, peak);
      nearby.lastSeenAt = new Date().toISOString();
      upgradeSeverity(nearby);
      if (cbUpdated) cbUpdated(nearby, peak);
    } else {
      const det = {
        id:          nextId++,
        lat:         jLat,
        lng:         jLng,
        severity,
        confidence:  1,
        peakAcc:     peak,
        detectedAt:  new Date().toISOString(),
        lastSeenAt:  new Date().toISOString(),
        source:      usingReal ? 'real' : 'simulated',
        description: `Auto-detected ${severity} pothole via accelerometer (peak ${peak.toFixed(1)} m/s²)`,
        reporter:    usingReal ? 'Accelerometer' : 'Simulated Sensor',
        rainHazard:  false,
        status:      'pending',
        reporterCount: 1,
        image:       null,
      };
      detections.unshift(det);
      if (cbDetected) cbDetected(det);
    }
  }

  // ── Simulated sensor data generator ───────────────────────
  // Models: engine vibration + road texture noise + periodic pothole events
  function simTick() {
    simTime += INTERVAL_MS / 1000;

    // Base: gravity + engine vibration + road texture
    const engine  = Math.sin(simTime * 60) * 0.15;    // ~10Hz engine vibration
    const texture = (Math.random() - 0.5) * 0.35;     // road roughness noise
    let az        = GRAVITY + engine + texture;

    // Scheduled pothole bump event
    const dt = simTime - nextBumpAt;
    if (dt >= 0 && dt < 0.25) {
      // Gaussian bump shape: sharp rise then decay
      const mag = 3.0 + Math.random() * 8.5;          // 3–11.5 m/s² spike
      az += mag * Math.exp(-dt * dt / 0.003);
    }
    if (dt >= 0.25) {
      // Schedule next bump (4–12 s from now)
      nextBumpAt = simTime + 4 + Math.random() * 8;
    }

    processSample(az);
  }

  // ── Real DeviceMotion integration ─────────────────────────
  function attachRealSensor() {
    motionListener = (e) => {
      const acc = e.accelerationIncludingGravity;
      if (acc && acc.z != null) processSample(Math.abs(acc.z));
    };
    window.addEventListener('devicemotion', motionListener);
    usingReal = true;
  }

  function tryRealSensor() {
    if (!window.DeviceMotionEvent) { return; }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      // iOS 13+: requires user gesture
      DeviceMotionEvent.requestPermission()
        .then(r => { if (r === 'granted') attachRealSensor(); })
        .catch(() => { /* stay with simulation */ });
    } else {
      attachRealSensor();
    }
  }

  // ── Public API ────────────────────────────────────────────
  function start(opts = {}) {
    if (running) return;
    running    = true;
    usingReal  = false;
    gravityEst = GRAVITY;
    cooldown   = 0;
    simTime    = 0;
    nextBumpAt = 2 + Math.random() * 4;

    cbSample   = opts.onSample    || null;
    cbDetected = opts.onDetected  || null;
    cbUpdated  = opts.onUpdated   || null;

    tryRealSensor();
    simTimer = setInterval(simTick, INTERVAL_MS);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (simTimer)       { clearInterval(simTimer); simTimer = null; }
    if (motionListener) { window.removeEventListener('devicemotion', motionListener); motionListener = null; }
    usingReal  = false;
    gravityEst = GRAVITY;
  }

  function reset() {
    detections = [];
    nextId     = 1000;
    waveBuffer.fill(0);
    waveHead   = 0;
  }

  function getDetections()    { return detections; }
  function isRunning()        { return running; }
  function isUsingReal()      { return usingReal; }
  function getWaveBuffer()    { return { buf: waveBuffer, head: waveHead, size: HISTORY }; }

  return {
    start, stop, reset,
    setPosition,
    getDetections,
    isRunning,
    isUsingReal,
    getWaveBuffer,
    THRESHOLDS,
    CLUSTER_RADIUS_M,
  };
})();
