// ============================================================
//  RoadWatch — Map Engine v6
//  Leaflet.js + MarkerCluster | Driving Mode improvements
//  - Radius-filtered potholes (default 5 km)
//  - Leaflet.markerClusterGroup clustering
//  - Distinct icons: dangerous / medium / minor / ai / community / repaired
//  - Animated entry for newly AI-detected potholes
//  - Auto-follow vehicle (GPS centering)
//  - Dangerous-ahead highlight ring
// ============================================================
(function () {
  'use strict';

  const D = window.RW_DATA;

  // ── Tile layers ─────────────────────────────────────────
  const TILES = {
    standard: {
      url:     'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attr:    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      label:   '🗺 Standard',
      maxZoom: 20,
    },
    detailed: {
      url:     'https://tile.openstreetmap.bzh/br/{z}/{x}/{y}.png',
      attr:    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      label:   '🔍 Detailed',
      maxZoom: 19,
    },
    positron: {
      url:     'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attr:    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      label:   '☀️ Minimal',
      maxZoom: 20,
    },
    satellite: {
      url:     'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attr:    '&copy; Esri &mdash; Source: Esri, USGS, NOAA',
      label:   '🛰 Satellite',
      maxZoom: 19,
    },
  };

  // ── Severity / type colours ──────────────────────────────
  const SEV_FILL = {
    dangerous: '#E53935',
    medium:    '#FB8C00',
    minor:     '#43A047',
    repaired:  '#78909C',
    ai:        '#7C3AED',
    community: '#0EA5E9',
  };

  // ── Helper: haversine distance ───────────────────────────
  function distanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Build SVG pin icon ───────────────────────────────────
  // type: 'severity' | 'ai' | 'community' | 'repaired'
  // pulse: adds animated ring (for newly added AI detections)
  function makePinIcon(severity, count, pulse = false, type = 'severity') {
    let fill;
    let badge = '';
    let innerSymbol = '';

    if (type === 'ai') {
      fill = SEV_FILL.ai;
      innerSymbol = `<text x="20" y="16" font-family="Arial" font-size="8" fill="${fill}" text-anchor="middle" opacity="0.85">🤖</text>`;
      badge = `<text x="20" y="27" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="900" fill="${fill}" text-anchor="middle">AI</text>`;
    } else if (type === 'community') {
      fill = SEV_FILL.community;
      innerSymbol = `<text x="20" y="16" font-family="Arial" font-size="8" fill="${fill}" text-anchor="middle" opacity="0.85">👥</text>`;
      const label = count > 9 ? '9+' : String(count || 1);
      badge = `<text x="20" y="27" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="900" fill="${fill}" text-anchor="middle">${label}</text>`;
    } else if (type === 'repaired') {
      fill = SEV_FILL.repaired;
      innerSymbol = `<text x="20" y="16" font-family="Arial" font-size="8" fill="${fill}" text-anchor="middle" opacity="0.85">✅</text>`;
      badge = `<text x="20" y="27" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="700" fill="${fill}" text-anchor="middle">OK</text>`;
    } else {
      fill = SEV_FILL[severity] || '#757575';
      const label = count > 9 ? '9+' : String(count || 1);
      badge = `<text x="20" y="24.5" font-family="Inter,Arial,sans-serif" font-size="${label.length > 1 ? 9 : 11}" font-weight="800" fill="${fill}" text-anchor="middle">${label}</text>`;
    }

    const size = severity === 'dangerous' ? 40 : 34;
    const half = size / 2;

    const pulseEl = pulse
      ? `<circle cx="${half}" cy="${Math.round(half * 0.85)}" r="${half - 2}" fill="none"
             stroke="${fill}" stroke-width="2.5" opacity="0.6">
             <animate attributeName="r" from="${half - 4}" to="${half + 10}" dur="1s" repeatCount="3"/>
             <animate attributeName="opacity" from="0.7" to="0" dur="1s" repeatCount="3"/>
           </circle>`
      : '';

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.35)}" viewBox="0 0 40 54">
      <defs>
        <filter id="ds${severity}${type}" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.28)"/>
        </filter>
      </defs>
      ${pulseEl}
      <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 54 20 54C20 54 40 35 40 20C40 8.95 31.05 0 20 0Z"
            fill="${fill}" filter="url(#ds${severity}${type})"/>
      <circle cx="20" cy="20" r="11" fill="white"/>
      ${innerSymbol}
      ${badge}
    </svg>`;

    return L.divIcon({
      className: '',
      html: svg,
      iconSize:   [size, Math.round(size * 1.35)],
      iconAnchor: [half, Math.round(size * 1.35)],
      popupAnchor:[0, -Math.round(size * 1.35) + 4],
    });
  }

  // ── Determine pin type from pothole data ─────────────────
  function getPinType(p) {
    if (p.status === 'repaired') return 'repaired';
    if (p.source === 'ai' || p.reporter === 'AI Camera' || p.reporter === 'AI Scanner' || (p.confidence !== undefined && !p.aiVerified)) return 'ai';
    if (p.source === 'community_verified' || p.status === 'community_verified' || (p.reporterCount && p.reporterCount >= 3)) return 'community';
    return 'severity';
  }

  // ── Blue GPS dot (Google Maps style) ────────────────────
  function makeUserIcon(isReal = true) {
    const color = isReal ? '#1A73E8' : '#9C27B0';
    const html = `
      <div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:40px;height:40px;border-radius:50%;background:${color};
                    opacity:0.18;transform:translate(-50%,-50%);top:50%;left:50%;
                    animation:gpsPulse 2s ease-out infinite"></div>
        <div style="position:absolute;width:24px;height:24px;border-radius:50%;background:${color};
                    opacity:0.12;animation:gpsPulse 2s ease-out infinite 0.6s"></div>
        <div style="width:18px;height:18px;border-radius:50%;background:${color};
                    border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);position:relative;z-index:2"></div>
      </div>`;
    return L.divIcon({
      className: '',
      html,
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
    });
  }

  // ── Car icon for driving mode vehicle ───────────────────
  function makeVehicleIcon() {
    const html = `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;width:52px;height:52px;border-radius:50%;background:#1A73E8;
                    opacity:0.15;transform:translate(-50%,-50%);top:50%;left:50%;
                    animation:gpsPulse 1.5s ease-out infinite"></div>
        <div style="width:32px;height:32px;border-radius:50%;background:#1A73E8;
                    border:3px solid #fff;box-shadow:0 3px 12px rgba(26,115,232,0.5);
                    display:flex;align-items:center;justify-content:center;
                    font-size:16px;position:relative;z-index:2">🚗</div>
      </div>`;
    return L.divIcon({
      className: '',
      html,
      iconSize:   [32, 32],
      iconAnchor: [16, 16],
    });
  }

  // ── Dangerous "ahead" highlight ring ────────────────────
  function makeDangerAheadIcon() {
    const html = `
      <div style="position:relative;width:48px;height:48px">
        <div style="position:absolute;inset:0;border-radius:50%;border:3px solid #E53935;
                    animation:dangerPulse 0.8s ease-in-out infinite alternate;
                    box-shadow:0 0 16px rgba(229,57,53,0.6)"></div>
        <div style="position:absolute;inset:6px;border-radius:50%;background:#E5393520;
                    display:flex;align-items:center;justify-content:center;font-size:20px">⚠️</div>
      </div>`;
    return L.divIcon({
      className: '',
      html,
      iconSize:   [48, 48],
      iconAnchor: [24, 24],
    });
  }

  // ── Auto-detected pothole marker ────────────────────────
  function makeAutoDetectIcon(severity, confidence) {
    const fill = SEV_FILL[severity] || '#7C3AED';
    const conf = Math.min(confidence, 9);
    const size = 36;
    const dur  = Math.max(0.6, 1.8 - conf * 0.15) + 's';
    const svg  = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size*1.4)}" viewBox="0 0 40 56">
      <defs>
        <filter id="dsa" x="-30%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.3)"/>
        </filter>
      </defs>
      <circle cx="20" cy="19" r="17" fill="none" stroke="${fill}" stroke-width="2" opacity="0.45">
        <animate attributeName="r"       from="14" to="22" dur="${dur}" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.5" to="0"  dur="${dur}" repeatCount="indefinite"/>
      </circle>
      <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 56 20 56C20 56 40 35 40 20C40 8.95 31.05 0 20 0Z"
            fill="${fill}" filter="url(#dsa)" opacity="0.92"/>
      <circle cx="20" cy="20" r="11" fill="white"/>
      <text x="20" y="16" font-family="Arial" font-size="7" fill="${fill}" text-anchor="middle" opacity="0.8">📱</text>
      <text x="20" y="26" font-family="Inter,Arial,sans-serif" font-size="9"
            font-weight="900" fill="${fill}" text-anchor="middle">${conf}x</text>
    </svg>`;
    return L.divIcon({
      className: '',
      html:       svg,
      iconSize:   [size, Math.round(size * 1.4)],
      iconAnchor: [size / 2, Math.round(size * 1.4)],
      popupAnchor:[0, -Math.round(size * 1.4) + 4],
    });
  }

  // Plot a single auto-detected pothole and return its marker
  function plotAutoDetected(map, det, opts = {}) {
    if (!map) return null;
    const icon   = makeAutoDetectIcon(det.severity, det.confidence);
    const marker = L.marker([det.lat, det.lng], {
      icon,
      zIndexOffset: 800,
      riseOnHover: true,
    }).addTo(map);

    const fill   = SEV_FILL[det.severity];
    const popup  = L.popup({ maxWidth: 280, className: 'rw-popup-clean', closeButton: true })
      .setContent(`
        <div style="font-family:'Inter',Arial,sans-serif;min-width:210px">
          <div style="height:4px;background:${fill};border-radius:4px 4px 0 0;margin:-1px -1px 12px"></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span style="background:${fill}18;color:${fill};padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase">${det.severity}</span>
            <span style="background:#E3F2FD;color:#1565C0;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700">📱 Auto-Detected</span>
          </div>
          <p style="font-size:13px;color:#212121;margin:0 0 10px;line-height:1.5">${det.description}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
            <div style="background:#F5F5F5;border-radius:7px;padding:7px 10px">
              <div style="font-size:10px;color:#777;font-weight:600;text-transform:uppercase;margin-bottom:2px">Confidence</div>
              <div style="font-size:14px;font-weight:900;color:${fill}">${det.confidence}x</div>
            </div>
            <div style="background:#F5F5F5;border-radius:7px;padding:7px 10px">
              <div style="font-size:10px;color:#777;font-weight:600;text-transform:uppercase;margin-bottom:2px">Peak G</div>
              <div style="font-size:13px;font-weight:700;color:#212121">${det.peakAcc.toFixed(1)} m/s²</div>
            </div>
          </div>
          <div style="font-size:11px;color:#1A73E8;font-weight:600">Source: ${det.source === 'real' ? '📱 Real accelerometer' : '🧪 Simulated sensor'}</div>
        </div>`);
    marker.bindPopup(popup);
    marker._rwDetId = det.id;
    if (opts.onClick) marker.on('click', () => opts.onClick(det));
    return marker;
  }

  // Update an existing auto-detect marker icon (confidence changed)
  function updateAutoMarker(marker, det) {
    if (!marker) return;
    marker.setIcon(makeAutoDetectIcon(det.severity, det.confidence));
  }

  // ── Popup HTML ───────────────────────────────────────────
  function buildPopup(p, userLat, userLng) {
    const type    = getPinType(p);
    const fill    = type === 'ai' ? SEV_FILL.ai : type === 'community' ? SEV_FILL.community : type === 'repaired' ? SEV_FILL.repaired : (SEV_FILL[p.severity] || '#757575');
    const labels  = { dangerous: '🔴 Dangerous', medium: '🟠 Medium', minor: '🟢 Minor' };
    const status  = { pending: 'Pending', in_progress: 'In Progress', repaired: '✅ Repaired', community_verified: '👥 Community Verified' };
    const dist    = userLat != null ? D.distanceMeters(userLat, userLng, p.lat, p.lng) : null;
    const distTxt = dist != null ? (dist < 1000 ? Math.round(dist) + ' m away' : (dist / 1000).toFixed(1) + ' km away') : 'Unknown';

    const typeBadge = type === 'ai' ? '🤖 AI Detected' : type === 'community' ? '👥 Community Verified' : type === 'repaired' ? '✅ Repaired' : '📝 User Reported';
    const confVal = p.confidence ? Math.round(p.confidence * 100) + '%' : (type === 'ai' ? '94%' : '—');
    const timeTxt = p.reportedAt
      ? new Date(p.reportedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    return `
      <div style="font-family:'Inter',Arial,sans-serif;min-width:220px;max-width:270px">
        <div style="height:4px;background:${fill};border-radius:4px 4px 0 0;margin:-1px -1px 12px"></div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <span style="background:${fill}22;color:${fill};padding:4px 12px;border-radius:999px;
                       font-size:11px;font-weight:700;text-transform:uppercase;border:1.5px solid ${fill}40">
            ${labels[p.severity] || p.severity}
          </span>
          <span style="background:#E3F2FD;color:#1565C0;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:600">
            ${typeBadge}
          </span>
        </div>
        <p style="font-size:13px;color:#212121;margin:0 0 10px;line-height:1.55;font-weight:500">
          ${p.description}
        </p>
        <div style="display:grid;grid-template-columns:1fr;gap:5px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;background:#f8fafc;border-radius:6px;padding:6px 10px;border:1px solid #e2e8f0;font-size:11px">
            <span style="color:#64748b;font-weight:600">Distance</span>
            <span style="color:#0f172a;font-weight:700">${distTxt}</span>
          </div>
          <div style="display:flex;justify-content:space-between;background:#f8fafc;border-radius:6px;padding:6px 10px;border:1px solid #e2e8f0;font-size:11px">
            <span style="color:#64748b;font-weight:600">Status</span>
            <span style="color:#0f172a;font-weight:700">${status[p.status] || p.status}</span>
          </div>
          <div style="display:flex;justify-content:space-between;background:#f8fafc;border-radius:6px;padding:6px 10px;border:1px solid #e2e8f0;font-size:11px">
            <span style="color:#64748b;font-weight:600">Confidence</span>
            <span style="color:#0f172a;font-weight:700">${confVal}</span>
          </div>
          <div style="display:flex;justify-content:space-between;background:#f8fafc;border-radius:6px;padding:6px 10px;border:1px solid #e2e8f0;font-size:11px">
            <span style="color:#64748b;font-weight:600">Reported</span>
            <span style="color:#0f172a;font-weight:700">${timeTxt}</span>
          </div>
          ${p.rainHazard ? `<div style="display:flex;align-items:center;gap:6px;background:#FFF3E0;border-radius:6px;padding:6px 10px;font-size:11px;color:#E65100;font-weight:600">🌧️ Hidden under rainwater — extreme caution!</div>` : ''}
        </div>
        <button onclick="window.__showDetail(${p.id})"
          style="width:100%;padding:9px;background:#0f172a;color:#fff;border:none;border-radius:8px;
                 font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s">
          View Detailed Analytics →
        </button>
      </div>`;
  }

  // Simulated GPS path (interpolated for smooth movement)
  const SIM_PATH = [];
  (function() {
    const basePoints = [
      [17.326, 78.448],
      [17.328, 78.450],
      [17.330, 78.453],
      [17.332, 78.455],
      [17.336, 78.458],
      [17.340, 78.461],
      [17.344, 78.463],
      [17.346, 78.464]
    ];
    for (let i = 0; i < basePoints.length - 1; i++) {
      const p1 = basePoints[i];
      const p2 = basePoints[i+1];
      const steps = 12;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        SIM_PATH.push([
          p1[0] + (p2[0] - p1[0]) * t,
          p1[1] + (p2[1] - p1[1]) * t
        ]);
      }
    }
    SIM_PATH.push(basePoints[basePoints.length - 1]);
  })();

  // ═══════════════════════════════════════════════════════
  //  initMap
  // ═══════════════════════════════════════════════════════
  function initMap(containerId, opts = {}) {
    const center  = opts.center && opts.center[0] != null ? opts.center  : [20.5937, 78.9629];
    const zoom    = opts.zoom    || 16;
    const tileKey = opts.tile    || 'standard';
    const t       = TILES[tileKey] || TILES.standard;

    const map = L.map(containerId, {
      center, zoom,
      zoomControl:      false,
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileLayer = L.tileLayer(t.url, {
      attribution: t.attr,
      maxZoom:     t.maxZoom,
      subdomains:  'abc',
    }).addTo(map);

    map._rwTileLayer = tileLayer;
    map._rwTileKey   = tileKey;

    map.switchTile = function (key) {
      const nt = TILES[key] || TILES.standard;
      if (map._rwTileLayer) map._rwTileLayer.remove();
      map._rwTileLayer = L.tileLayer(nt.url, {
        attribution: nt.attr,
        maxZoom:     nt.maxZoom,
        subdomains:  'abc',
      }).addTo(map);
      map._rwTileKey = key;
    };

    return map;
  }

  // ═══════════════════════════════════════════════════════
  //  plotPotholes — with clustering and radius filter
  //
  //  opts:
  //    userLat, userLng  — used for distance filtering & popup
  //    radiusKm          — show only potholes within this km (default 5)
  //    onMarkerClick     — callback(pothole)
  //    animate           — if true, newly-added markers pulse once
  //    isDriveMode       — if true, apply tighter defaults
  // ═══════════════════════════════════════════════════════
  function plotPotholes(map, potholes, opts = {}) {
    const userLat  = opts.userLat;
    const userLng  = opts.userLng;
    const radiusKm = opts.radiusKm || (opts.isDriveMode ? 3 : 5);

    // Filter by radius if we have a user location
    let filtered = potholes;
    if (userLat != null && userLng != null) {
      filtered = potholes.filter(p => distanceKm(userLat, userLng, p.lat, p.lng) <= radiusKm);
    }

    // Build cluster group
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius:    opts.isDriveMode ? 50 : 65,
      spiderfyOnMaxZoom:   true,
      disableClusteringAtZoom: 18,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount();
        const children = cluster.getAllChildMarkers();
        // Find worst severity in cluster
        let hasDangerous = false, hasMedium = false;
        children.forEach(m => {
          if (m._rwSeverity === 'dangerous') hasDangerous = true;
          else if (m._rwSeverity === 'medium') hasMedium = true;
        });
        const color = hasDangerous ? '#E53935' : hasMedium ? '#FB8C00' : '#43A047';
        const size  = count > 10 ? 44 : count > 5 ? 40 : 36;
        return L.divIcon({
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:${color};color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-weight:800;font-size:${size > 40 ? 14 : 12}px;
            border:3px solid #fff;
            box-shadow:0 3px 12px rgba(0,0,0,0.35);
            font-family:Inter,Arial,sans-serif;
          ">${count}</div>`,
          className: '',
          iconSize: [size, size],
          iconAnchor: [size/2, size/2],
        });
      }
    });

    filtered.forEach(p => {
      const type  = getPinType(p);
      const icon  = makePinIcon(p.severity, p.reporterCount || 1, opts.animate || false, type);
      const zIdx  = p.severity === 'dangerous' ? 500 : p.severity === 'medium' ? 300 : 100;

      const m = L.marker([p.lat, p.lng], {
        icon,
        zIndexOffset: zIdx,
        riseOnHover:  true,
      });

      m._rwPothole  = p;
      m._rwSeverity = p.severity;
      m._rwType     = type;

      const popup = L.popup({
        maxWidth:    280,
        className:   'rw-popup-clean',
        closeButton: true,
      }).setContent(buildPopup(p, userLat, userLng));

      m.bindPopup(popup);
      m.on('click', () => { if (opts.onMarkerClick) opts.onMarkerClick(p); });

      clusterGroup.addLayer(m);
    });

    map.addLayer(clusterGroup);
    return { clusterGroup, group: clusterGroup };
  }

  // ── Add a single new pothole with animation (for AI detections) ──
  function plotSingleAnimated(map, pothole, opts = {}) {
    if (!map) return null;
    const type = getPinType(pothole);
    const icon = makePinIcon(pothole.severity, pothole.reporterCount || 1, true /* pulse */, type);
    const m = L.marker([pothole.lat, pothole.lng], {
      icon,
      zIndexOffset: 900,
      riseOnHover:  true,
    }).addTo(map);

    m._rwPothole  = pothole;
    m._rwSeverity = pothole.severity;

    const popup = L.popup({ maxWidth: 280, className: 'rw-popup-clean', closeButton: true })
      .setContent(buildPopup(pothole, opts.userLat, opts.userLng));
    m.bindPopup(popup);

    if (opts.onMarkerClick) m.on('click', () => opts.onMarkerClick(pothole));

    // After 3 seconds remove the pulse icon and replace with a normal one
    setTimeout(() => {
      if (m && map.hasLayer(m)) {
        m.setIcon(makePinIcon(pothole.severity, pothole.reporterCount || 1, false, type));
      }
    }, 3200);

    return m;
  }

  // ── Clear markers ────────────────────────────────────────
  function clearMarkers(result) {
    if (!result) return;
    if (result.group) result.group.clearLayers();
    if (result.clusterGroup) result.clusterGroup.clearLayers();
  }

  // ── Remove a cluster group from a map ───────────────────
  function removeMarkerResult(map, result) {
    if (!result || !map) return;
    if (result.clusterGroup && map.hasLayer(result.clusterGroup)) map.removeLayer(result.clusterGroup);
    if (result.group && map.hasLayer(result.group)) map.removeLayer(result.group);
  }

  // ═══════════════════════════════════════════════════════
  //  highlightDangerousAhead — draw danger ring around
  //  any dangerous pothole within lookAheadM meters.
  //  Returns a layer that should be removed on next call.
  // ═══════════════════════════════════════════════════════
  function highlightDangerousAhead(map, userLat, userLng, lookAheadM = 200) {
    const layers = [];
    if (!map || userLat == null) return layers;

    D.getAllPotholes().forEach(p => {
      if (p.severity !== 'dangerous' || p.status === 'repaired') return;
      const d = D.distanceMeters(userLat, userLng, p.lat, p.lng);
      if (d > lookAheadM) return;

      const circle = L.circle([p.lat, p.lng], {
        radius:      d < 50 ? 30 : 60,
        color:       '#E53935',
        fillColor:   '#E53935',
        fillOpacity: 0.18,
        weight:      2.5,
        opacity:     0.7,
        dashArray:   '6,4',
      }).addTo(map);

      layers.push(circle);
    });

    return layers;
  }

  // ═══════════════════════════════════════════════════════
  //  Safe routes overlay
  // ═══════════════════════════════════════════════════════
  function drawSafeRoutes(map, routes) {
    const layers = [];
    routes.forEach(r => {
      const latlngs = r.waypoints.map(([lat, lng]) => [lat, lng]);
      const isSafe  = r.danger_score <= 3;
      const line    = L.polyline(latlngs, {
        color:   r.color,
        weight:  isSafe ? 7 : 5,
        opacity: isSafe ? 0.9 : 0.7,
        dashArray: isSafe ? null : '10, 8',
        lineCap:   'round',
        lineJoin:  'round',
      }).addTo(map);
      line.bindTooltip(
        `<b style="color:${r.color}">${r.name}</b><br><span style="font-size:12px">${r.label}</span>`,
        { sticky: true, className: 'rw-route-tip' }
      );
      layers.push(line);
    });
    return layers;
  }

  // ═══════════════════════════════════════════════════════
  //  Real GPS tracking  (with vehicle icon for drive mode)
  // ═══════════════════════════════════════════════════════
  function startRealTracking(map, opts = {}) {
    if (!navigator.geolocation) {
      opts.onError && opts.onError('Geolocation not supported');
      return null;
    }

    let marker = null, accCircle = null, firstFix = true, alerted = new Set();
    const useVehicleIcon = opts.vehicleMode === true;

    const watchId = navigator.geolocation.watchPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const spd = pos.coords.speed != null ? (pos.coords.speed * 3.6).toFixed(0) : null;

      if (!marker) {
        marker = L.marker([lat, lng], {
          icon: useVehicleIcon ? makeVehicleIcon() : makeUserIcon(true),
          zIndexOffset: 1000,
        }).addTo(map);
        if (!useVehicleIcon) {
          accCircle = L.circle([lat, lng], {
            radius:      acc,
            color:       '#1A73E8',
            fillColor:   '#1A73E8',
            fillOpacity: 0.08,
            weight:      1.5,
            opacity:     0.4,
          }).addTo(map);
        }
      } else {
        marker.setLatLng([lat, lng]);
        if (accCircle) { accCircle.setLatLng([lat, lng]); accCircle.setRadius(acc); }
      }

      // Auto-follow (always in vehicle mode, or when followUser is set)
      if (opts.vehicleMode || opts.followUser) {
        const zoom = firstFix ? 17 : (opts.vehicleMode ? 17 : map.getZoom());
        map.setView([lat, lng], zoom, { animate: true, duration: 0.8 });
        firstFix = false;
      } else if (firstFix) {
        map.flyTo([lat, lng], 17, { animate: true, duration: 1 });
        firstFix = false;
      }

      // Proximity check
      D.getAllPotholes().forEach(p => {
        if (p.status === 'repaired') return;
        const d = D.distanceMeters(lat, lng, p.lat, p.lng);
        if (d <= 50 && !alerted.has(p.id)) {
          alerted.add(p.id);
          opts.onNearbyPothole && opts.onNearbyPothole(p, d);
          setTimeout(() => alerted.delete(p.id), 30000);
        }
      });

      opts.onPositionUpdate && opts.onPositionUpdate(lat, lng, spd);
    },
    err => { opts.onError && opts.onError(err.message); },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });

    return {
      stop() {
        navigator.geolocation.clearWatch(watchId);
        if (marker)    map.removeLayer(marker);
        if (accCircle) map.removeLayer(accCircle);
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Simulated tracking  (vehicle icon for drive mode)
  // ═══════════════════════════════════════════════════════
  function startSimulatedTracking(map, opts = {}) {
    let idx = 0, marker = null, alerted = new Set();
    const useVehicleIcon = opts.vehicleMode === true;

    function tick() {
      if (idx >= SIM_PATH.length) idx = 0;
      const [lat, lng] = SIM_PATH[idx];
      const spd = (18 + Math.random() * 25).toFixed(0);

      if (!marker) {
        marker = L.marker([lat, lng], {
          icon: useVehicleIcon ? makeVehicleIcon() : makeUserIcon(false),
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        marker.setLatLng([lat, lng]);
      }

      // Always center in vehicle mode
      if (opts.vehicleMode || opts.followUser !== false) {
        map.setView([lat, lng], map.getZoom() || 17, { animate: true, duration: 0.6 });
      }

      D.getAllPotholes().forEach(p => {
        if (p.status === 'repaired') return;
        const d = D.distanceMeters(lat, lng, p.lat, p.lng);
        if (d <= 50 && !alerted.has(p.id)) {
          alerted.add(p.id);
          opts.onNearbyPothole && opts.onNearbyPothole(p, d);
          setTimeout(() => alerted.delete(p.id), 20000);
        }
      });

      opts.onPositionUpdate && opts.onPositionUpdate(lat, lng, spd);
      idx++;
    }

    tick();
    const iv = setInterval(tick, 1000);

    return {
      stop() {
        clearInterval(iv);
        if (marker) map.removeLayer(marker);
      },
    };
  }

  // ── Exports ──────────────────────────────────────────────
  window.RW_MAP = {
    initMap,
    plotPotholes,
    plotSingleAnimated,
    clearMarkers,
    removeMarkerResult,
    drawSafeRoutes,
    startRealTracking,
    startSimulatedTracking,
    plotAutoDetected,
    updateAutoMarker,
    highlightDangerousAhead,
    makePinIcon,
    makeVehicleIcon,
    TILES,
  };

})();
