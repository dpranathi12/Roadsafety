// ============================================================
//  RoadWatch — AI Detection Engine  v2
//  GATE: road surface must be detected before pothole inference runs
//  Simulates YOLO-style inference with realistic confidence curves
//  Voice alerts via Web Speech API
// ============================================================
(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const FOCAL_LENGTH_PX  = 600;
  const POTHOLE_REAL_H   = 0.15;
  const ALERT_COOLDOWN   = 15000;
  const DETECT_INTERVAL  = 300;    // check every 300 ms (responsive UI)
  const MIN_CONFIDENCE   = 0.60;   // slightly higher bar for a detection to register
  const ROAD_SAMPLE_ROWS = 5;       // pixel rows to sample for road detection
  const ROAD_SAMPLE_COLS = 8;       // pixel cols to sample for road detection

  // Detection severity thresholds
  const SEV_THRESHOLDS = { dangerous: 0.82, medium: 0.65 };

  // Colours
  const SEV_COLOR = { dangerous: '#EF4444', medium: '#F59E0B', minor: '#22C55E' };

  // ── State ──────────────────────────────────────────────────
  let lastAlert    = 0;
  let isRunning    = false;
  let demoCtx      = null;
  let demoRafId    = null;
  let detectTimer  = null;
  let roadDetected = false;      // gate flag — updated each inference tick
  let isDemoMode   = false;      // set by startDetection

  // Persistent bounding boxes currently shown
  let activeBboxes = [];

  // Offscreen canvas used for pixel-reading from video frames
  let sampleCanvas = null;
  let sampleCtx    = null;

  // Demo road animation state
  const demo = {
    offset:    0,
    potholes:  [],
    nextSpawn: 0,
  };

  // ── Offscreen canvas setup ─────────────────────────────────
  function ensureSampleCanvas(w, h) {
    if (!sampleCanvas) {
      sampleCanvas = document.createElement('canvas');
      sampleCtx    = sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (sampleCanvas.width !== w || sampleCanvas.height !== h) {
      sampleCanvas.width  = w;
      sampleCanvas.height = h;
    }
  }

  // ── Road Surface Detection ─────────────────────────────────
  // Analyses pixel colours in the lower-centre region of a video frame.
  // Road surfaces (asphalt, tarmac, concrete) have characteristic colour ranges:
  //   – Asphalt/tarmac : dark grey-browns  (low saturation, value < 135)
  //   – Dry concrete   : mid-grey          (value 95-205)
  //   – Lane markings  : white / yellow stripes
  // Returns { isRoad: bool, confidence: 0-1, reason: string }
  function detectRoadSurface(videoEl) {
    // Demo mode: road canvas always shows a road — skip pixel analysis
    if (isDemoMode) {
      return { isRoad: true, confidence: 1.0, reason: 'demo_canvas' };
    }

    if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      return { isRoad: false, confidence: 0, reason: 'no_video' };
    }

    const VW = videoEl.videoWidth;
    const VH = videoEl.videoHeight;
    ensureSampleCanvas(VW, VH);

    try {
      sampleCtx.drawImage(videoEl, 0, 0, VW, VH);
    } catch (e) {
      return { isRoad: false, confidence: 0, reason: 'draw_error' };
    }

    // Sample only the lower-centre region (road surface area)
    // X: 15%–85%  Y: 45%–85%  (avoids sky, vehicle bonnet edges)
    const startX = Math.floor(VW * 0.15);
    const endX   = Math.floor(VW * 0.85);
    const startY = Math.floor(VH * 0.45);
    const endY   = Math.floor(VH * 0.85);
    const stepX  = Math.max(1, Math.floor((endX - startX) / ROAD_SAMPLE_COLS));
    const stepY  = Math.max(1, Math.floor((endY - startY) / ROAD_SAMPLE_ROWS));

    let roadVotes    = 0;
    let totalSamples = 0;
    let uniqueValues = new Set();

    for (let y = startY; y < endY; y += stepY) {
      for (let x = startX; x < endX; x += stepX) {
        const px     = sampleCtx.getImageData(x, y, 1, 1).data;
        const r = px[0], g = px[1], b = px[2];
        const maxC   = Math.max(r, g, b);
        const minC   = Math.min(r, g, b);
        const chroma = maxC - minC;
        const value  = maxC;
        const greyness = 1 - (chroma / (maxC + 1));

        // Group values into buckets of 8 to check texture variance
        uniqueValues.add(Math.round(value / 8) * 8);

        // Grey check for asphalt/concrete (relaxed for Indian roads)
        const isGrey      = greyness > 0.75 && chroma < 28;
        const isAsphalt   = isGrey && value >= 18 && value <= 120;      // dark tarmac / worn roads
        const isConcrete  = isGrey && value > 120 && value <= 210;      // bright concrete (raised threshold)
        const isWhiteMark = r > 195 && g > 195 && b > 195 && chroma < 15;
        const isYellowMark= r > 175 && g > 140 && b < 110 && chroma > 35 && r > g;
        // Indian roads: reddish-brown laterite / murrum surfaces
        const isIndianRoad = r > 80 && r < 200 && g > 55 && g < 170 && b < 130
                          && r > g && r > b && chroma < 55 && value < 200;

        // Rejection heuristics for indoor / non-road surfaces
        const isSky   = b > r + 25 && b > g + 15 && value > 130;
        // Only reject very warm (strongly orange/red like skin, wood) — NOT Indian roads
        const isWarm  = r > g + 35 && r > b + 35 && value > 80;
        const isGreen = g > r + 20 && g > b + 12;    // grass / plants
        const isTooBright = value > 240;              // reject only extreme glare / pure white

        if (!isSky && !isWarm && !isGreen && !isTooBright &&
            (isAsphalt || isConcrete || isWhiteMark || isYellowMark || isIndianRoad)) {
          roadVotes++;
        }
        totalSamples++;
      }
    }

    if (totalSamples === 0) {
      return { isRoad: false, confidence: 0, reason: 'no_samples' };
    }

    // Flat surfaces (painted walls, clean desks) have uniform values (low unique bucket count)
    const isUniform = uniqueValues.size <= 2;

    const confidence = roadVotes / totalSamples;
    const isRoad     = confidence >= 0.22 && !isUniform;   // Relaxed 22% threshold + variance gate
    return { isRoad, confidence, reason: isRoad ? 'road_pixels_found' : 'insufficient_road_pixels' };
  }

  // ── "No road" overlay message ─────────────────────────────
  function drawNoRoadMessage(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);

    const msg    = '🚫 Road not detected';
    const subMsg = 'Point the camera toward the road surface';
    const pillW  = 340, pillH = 60;
    const pillX  = (W - pillW) / 2;
    const pillY  = H * 0.62;

    ctx.globalAlpha = 0.82;
    ctx.fillStyle   = 'rgba(10,10,20,0.90)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 12);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 13px Inter, Arial, sans-serif';
    ctx.fillStyle   = '#f87171';
    ctx.fillText(msg, W / 2, pillY + 23);

    ctx.font      = '11px Inter, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(subMsg, W / 2, pillY + 43);

    ctx.textAlign = 'left';
  }

  // ── Distance estimation ────────────────────────────────────

  // Uses thin-lens pinhole model:
  //   distance = (realHeight × focalLength) / pixelHeight
  function estimateDistance(bboxH, frameH) {
    if (!bboxH || bboxH < 1) return 999;
    // Farther potholes appear smaller. Scale focal length by frame.
    const fl = FOCAL_LENGTH_PX * (frameH / 480);
    const d  = (POTHOLE_REAL_H * fl) / bboxH;
    return Math.max(3, Math.min(120, d));
  }

  // ── Severity from confidence ──────────────────────────────
  function severityFromConf(conf) {
    if (conf >= SEV_THRESHOLDS.dangerous) return 'dangerous';
    if (conf >= SEV_THRESHOLDS.medium)    return 'medium';
    return 'minor';
  }

  // ── Realistic simulated inference ─────────────────────────
  // Returns array of detections [{ x,y,w,h,conf,severity,distM }]
  // Positions are in 0-1 normalized coords relative to frame
  function runSimulatedInference(frameW, frameH) {
    const results = [];

    if (isDemoMode) {
      // Find any pothole in the demo list that is in the viewport and not yet detected by the AI
      const detectRangeMin = frameH * 0.55;
      const detectRangeMax = frameH * 0.78;
      
      const target = demo.potholes.find(ph => 
        !ph.detected && 
        ph.y >= detectRangeMin && 
        ph.y <= detectRangeMax
      );

      if (target) {
        target.detected = true;
        
        // Return a detection centered on this visual pothole's current position
        const boxW = target.w * (1.0 + (Math.random() - 0.5) * 0.15);
        const boxH = target.h * (1.0 + (Math.random() - 0.5) * 0.15);
        
        results.push({
          x: target.x,
          y: target.y,
          w: boxW,
          h: boxH,
          conf: target.conf,
          severity: target.severity,
          distM: estimateDistance(boxH, frameH)
        });
      }
      return results;
    }

    // Live mode: ~20% chance of a simulated detection per 300 ms tick
    if (Math.random() > 0.20) return results;

    const xNorm = 0.25 + Math.random() * 0.50;
    const yNorm = 0.52 + Math.random() * 0.30;

    const sizeNorm = 0.06 + Math.random() * 0.14;
    const wh_ratio = 1.2 + Math.random() * 0.5;

    const x = xNorm * frameW;
    const y = yNorm * frameH;
    const h = sizeNorm * frameH;
    const w = h * wh_ratio;

    const conf = 0.60 + Math.random() * 0.35;
    if (conf < MIN_CONFIDENCE) return results;

    const severity = severityFromConf(conf);
    const distM    = estimateDistance(h, frameH);

    results.push({ x, y, w, h, conf, severity, distM });
    return results;
  }

  // ── Draw bounding boxes on overlay canvas ─────────────────
  function drawBboxes(ctx, bboxes, frameW, frameH) {
    ctx.clearRect(0, 0, frameW, frameH);

    bboxes.forEach(b => {
      if (b.ttl <= 0) return;
      const alpha = Math.min(1, b.ttl / 8);
      const color = SEV_COLOR[b.severity] || '#EF4444';

      // Glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur  = 18 * alpha;

      // Main rectangle
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.globalAlpha = alpha;
      ctx.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);

      // Corner markers (tactical feel)
      const cL = 10;
      ctx.lineWidth = 3.5;
      const x0 = b.x - b.w / 2, y0 = b.y - b.h / 2;
      const x1 = b.x + b.w / 2, y1 = b.y + b.h / 2;
      [ // TL, TR, BL, BR corners
        [x0, y0, x0+cL, y0, x0, y0+cL],
        [x1, y0, x1-cL, y0, x1, y0+cL],
        [x0, y1, x0+cL, y1, x0, y1-cL],
        [x1, y1, x1-cL, y1, x1, y1-cL],
      ].forEach(([sx,sy,ex1,ey1,ex2,ey2]) => {
        ctx.beginPath();
        ctx.moveTo(ex1, ey1); ctx.lineTo(sx, sy); ctx.lineTo(ex2, ey2);
        ctx.stroke();
      });

      // Label background
      const label  = `⚠ ${b.severity.toUpperCase()}`;
      const confTx = `${Math.round(b.conf * 100)}%`;
      const distTx = `${Math.round(b.distM)}m`;
      ctx.shadowBlur = 0;
      ctx.font       = 'bold 11px Inter, Arial, sans-serif';

      const labelW = ctx.measureText(label).width + 8;
      const lx = b.x - b.w / 2;
      const ly = b.y - b.h / 2 - 22;

      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.9;
      roundRect(ctx, lx, Math.max(0, ly), labelW + 50, 20, 4);
      ctx.fill();

      ctx.fillStyle   = '#fff';
      ctx.globalAlpha = alpha;
      ctx.fillText(label, lx + 4, Math.max(14, ly + 14));
      ctx.font = '10px Inter, Arial, sans-serif';
      ctx.fillText(`${confTx} · ${distTx}`, lx + labelW + 2, Math.max(14, ly + 14));

      b.ttl--;
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ── Demo road canvas animation ────────────────────────────
  function startDemoRoad(canvas) {
    demoCtx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Road colours
    const ROAD_GREY = '#2a2a2e';
    const LANE_W    = W * 0.55;
    const LANE_X    = (W - LANE_W) / 2;

    function drawRoad(offset) {
      const ctx = demoCtx;
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
      sky.addColorStop(0, '#0f172a');
      sky.addColorStop(1, '#1e3a5f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.45);

      // Ground gradient (road)
      const road = ctx.createLinearGradient(0, H * 0.45, 0, H);
      road.addColorStop(0, '#1a1a1e');
      road.addColorStop(1, ROAD_GREY);
      ctx.fillStyle = road;
      ctx.fillRect(0, H * 0.45, W, H * 0.55);

      // Lane edges (white)
      ctx.strokeStyle = '#ffffffaa';
      ctx.lineWidth   = 2;
      ctx.beginPath(); ctx.moveTo(LANE_X, H * 0.45); ctx.lineTo(LANE_X - W * 0.08, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(LANE_X + LANE_W, H * 0.45); ctx.lineTo(LANE_X + LANE_W + W * 0.08, H); ctx.stroke();

      // Dashed center line
      ctx.strokeStyle = '#ffff00aa';
      ctx.lineWidth   = 3;
      ctx.setLineDash([30, 25]);
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.45);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Potholes
      demo.potholes.forEach(ph => {
        const alpha = Math.min(1, ph.life / 15);
        const col   = SEV_COLOR[ph.severity];
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle   = '#111';
        ctx.beginPath();
        ctx.ellipse(ph.x, ph.y, ph.w * 0.5, ph.h * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        // Crack detail
        ctx.strokeStyle = '#000';
        ctx.lineWidth   = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    function tick() {
      const ctx = demoCtx;
      const W   = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      drawRoad(demo.offset);
      demo.offset += 2;

      // Move potholes toward camera
      demo.potholes.forEach(ph => { ph.y += 3; ph.w += 0.5; ph.h += 0.3; ph.life--; });
      demo.potholes = demo.potholes.filter(ph => ph.life > 0 && ph.y < H + 100);

      // Spawn new potholes
      demo.nextSpawn--;
      if (demo.nextSpawn <= 0) {
        demo.nextSpawn = 40 + Math.floor(Math.random() * 60);
        const severity = Math.random() < 0.35 ? 'dangerous' : Math.random() < 0.55 ? 'medium' : 'minor';
        demo.potholes.push({
          x: LANE_X + 30 + Math.random() * (LANE_W - 60),
          y: H * 0.5,
          w: 20 + Math.random() * 30,
          h: 12 + Math.random() * 18,
          life: 55,
          severity,
          conf: severity === 'dangerous' ? 0.85 + Math.random()*0.12
              : severity === 'medium'    ? 0.67 + Math.random()*0.14
              :                            0.56 + Math.random()*0.10,
        });
      }

      demoRafId = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopDemoRoad() {
    if (demoRafId) { cancelAnimationFrame(demoRafId); demoRafId = null; }
    if (demoCtx)   { demoCtx.clearRect(0, 0, demoCtx.canvas.width, demoCtx.canvas.height); demoCtx = null; }
    demo.potholes = []; demo.offset = 0; demo.nextSpawn = 0;
  }

  // ── Voice alert ───────────────────────────────────────────
  function speakAlert(severity, distM) {
    if (!window.speechSynthesis) return;
    const now = Date.now();
    if (now - lastAlert < ALERT_COOLDOWN) return;
    lastAlert = now;

    const sev = severity === 'dangerous' ? 'Dangerous'
              : severity === 'medium'    ? 'Medium'
              : 'Minor';
    const dist = Math.round(distM);
    const msg  = `Warning! ${sev} pothole detected ${dist} meters ahead. Please slow down.`;
    const utt  = new SpeechSynthesisUtterance(msg);
    utt.rate   = 1.05;
    utt.pitch  = 0.9;
    utt.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  }

  // ── Main detection loop ───────────────────────────────────
  // videoEl  : <video> element (real camera) or null (demo mode)
  // canvasEl : overlay <canvas> for drawing bboxes
  // opts:
  //   onDetection(det)      — called for each confirmed detection
  //   onRoadStatusChange    — called with (isRoad, confidence) when status changes
  //   demoMode              — true when running demo (skips pixel road analysis)
  //   enableVoice           — bool
  function startDetection(videoEl, canvasEl, opts = {}) {
    if (isRunning) return;
    isRunning    = true;
    isDemoMode   = opts.demoMode === true || videoEl === null;
    activeBboxes = [];
    roadDetected = isDemoMode; // demo always starts as road-detected

    const ctx = canvasEl.getContext('2d');

    // Fire initial road status so UI shows correct state immediately
    if (opts.onRoadStatusChange) {
      opts.onRoadStatusChange(roadDetected, roadDetected ? 1.0 : 0);
    }

    function inferenceLoop() {
      if (!isRunning) return;

      const W = canvasEl.width  || canvasEl.offsetWidth  || 640;
      const H = canvasEl.height || canvasEl.offsetHeight || 360;
      canvasEl.width  = W;
      canvasEl.height = H;

      // ── GATE 1: Road Surface Detection ─────────────────────
      const roadResult = detectRoadSurface(videoEl);
      const prevRoad   = roadDetected;
      roadDetected     = roadResult.isRoad;

      // Fire callback whenever road status changes (or every 2 s to keep panel in sync)
      if (opts.onRoadStatusChange && roadDetected !== prevRoad) {
        opts.onRoadStatusChange(roadDetected, roadResult.confidence);
      }

      if (!roadDetected) {
        // No road: clear bboxes, show message, skip inference entirely
        activeBboxes = [];
        drawNoRoadMessage(ctx, W, H);
        detectTimer = setTimeout(inferenceLoop, DETECT_INTERVAL);
        return;
      }

      // ── GATE 2: Pothole Inference (only on confirmed road) ──
      const dets = runSimulatedInference(W, H);

      dets.forEach(d => {
        activeBboxes.push({ ...d, ttl: 8 }); // show for 8 ticks (~2.4 seconds)
        if (opts.onDetection) opts.onDetection(d);
        if (opts.enableVoice && (d.severity === 'dangerous' || d.severity === 'medium')) {
          speakAlert(d.severity, d.distM);
        }
      });

      activeBboxes = activeBboxes.filter(b => b.ttl > 0);
      drawBboxes(ctx, activeBboxes, W, H);

      detectTimer = setTimeout(inferenceLoop, DETECT_INTERVAL);
    }

    inferenceLoop();
  }

  function stopDetection() {
    isRunning    = false;
    isDemoMode   = false;
    roadDetected = false;
    if (detectTimer) { clearTimeout(detectTimer); detectTimer = null; }
    if (sampleCanvas) { sampleCtx = null; sampleCanvas = null; }
    activeBboxes = [];
  }

  // ── Exports ───────────────────────────────────────────────
  window.RW_AI = {
    startDetection,
    stopDetection,
    startDemoRoad,
    stopDemoRoad,
    speakAlert,
    estimateDistance,
    detectRoadSurface,   // exposed for debugging / testing
    SEV_COLOR,
  };

})();

