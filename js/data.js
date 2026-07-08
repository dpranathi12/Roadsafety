// ============================================================
//  RoadWatch — Mock Data Layer  (Enhanced v2)
//  Potholes around Hyderabad / Almasguda area
// ============================================================

const SEVERITY = { MINOR: 'minor', MEDIUM: 'medium', DANGEROUS: 'dangerous' };
const STATUS   = { PENDING: 'pending', IN_PROGRESS: 'in_progress', REPAIRED: 'repaired', COMMUNITY_VERIFIED: 'community_verified' };
const SOURCE   = { MANUAL: 'manual', AI: 'ai', COMMUNITY: 'community_verified' };

// Colour palette per severity
const SEVERITY_COLORS = {
  [SEVERITY.MINOR]:     '#22c55e',   // green
  [SEVERITY.MEDIUM]:    '#eab308',   // yellow
  [SEVERITY.DANGEROUS]: '#ef4444',   // red
};

const SEVERITY_LABELS = {
  [SEVERITY.MINOR]:     'Minor',
  [SEVERITY.MEDIUM]:    'Medium',
  [SEVERITY.DANGEROUS]: 'Dangerous',
};

const STATUS_LABELS = {
  [STATUS.PENDING]:            'Pending',
  [STATUS.IN_PROGRESS]:        'In Progress',
  [STATUS.REPAIRED]:           'Repaired',
  [STATUS.COMMUNITY_VERIFIED]: 'Community Verified',
};

const SOURCE_LABELS = {
  [SOURCE.MANUAL]:    'User Reported',
  [SOURCE.AI]:        'AI Detected',
  [SOURCE.COMMUNITY]: 'Community Verified',
};

// ---------- routes (mock) ----------
// Each route has waypoints [lat,lng] and a pothole_proximity_score (lower = safer)
const MOCK_ROUTES = [
  {
    id: 'route-a',
    name: 'Route A (Safer)',
    color: '#22c55e',
    waypoints: [
      [17.326, 78.448],
      [17.328, 78.450],
      [17.330, 78.453],
      [17.332, 78.455],
      [17.336, 78.458],
      [17.340, 78.461],
      [17.344, 78.463],
      [17.346, 78.464],
    ],
    danger_score: 2,
    label: '2 potholes nearby — Safer',
  },
  {
    id: 'route-b',
    name: 'Route B (Riskier)',
    color: '#ef4444',
    waypoints: [
      [17.326, 78.448],
      [17.328, 78.451],
      [17.331, 78.452],
      [17.334, 78.452],
      [17.337, 78.453],
      [17.340, 78.455],
      [17.343, 78.460],
      [17.346, 78.464],
    ],
    danger_score: 7,
    label: '7 potholes nearby — Avoid',
  },
];

// ---------- sample potholes (Hyderabad / Almasguda area) ----------
const defaultPotholes = [
  {
    id: 1,
    lat: 17.3350,
    lng: 78.4520,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Large pothole on Almasguda main road, completely filled with water during rain. Multiple two-wheeler accidents reported.',
    reportedAt: '2026-04-05T08:30:00',
    rainHazard: true,
    reporter: 'Rahul M.',
    reporterCount: 12,
    image: null,
  },
  {
    id: 2,
    lat: 17.3380,
    lng: 78.4560,
    severity: SEVERITY.MEDIUM,
    status: STATUS.IN_PROGRESS,
    description: 'Medium-sized pothole near Almasguda colony bus stop. Gets hidden under rainwater.',
    reportedAt: '2026-04-04T14:15:00',
    rainHazard: true,
    reporter: 'Priya S.',
    reporterCount: 7,
    image: null,
  },
  {
    id: 3,
    lat: 17.3310,
    lng: 78.4480,
    severity: SEVERITY.MINOR,
    status: STATUS.REPAIRED,
    description: 'Small crack in asphalt near Rajiv Gandhi Nagar junction.',
    reportedAt: '2026-04-02T10:00:00',
    rainHazard: false,
    reporter: 'Amit K.',
    reporterCount: 3,
    image: null,
  },
  {
    id: 4,
    lat: 17.3420,
    lng: 78.4440,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Deep pothole on Balapur-Almasguda stretch. Caused tyre burst for two-wheelers during monsoon.',
    reportedAt: '2026-04-06T17:45:00',
    rainHazard: true,
    reporter: 'Sneha D.',
    reporterCount: 19,
    image: null,
  },
  {
    id: 5,
    lat: 17.3290,
    lng: 78.4550,
    severity: SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: 'Uneven road surface with shallow pothole near Meerpet X-roads. Risk increases after heavy rain.',
    reportedAt: '2026-04-06T09:20:00',
    rainHazard: true,
    reporter: 'Vikram J.',
    reporterCount: 5,
    image: null,
  },
  {
    id: 6,
    lat: 17.3370,
    lng: 78.4610,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.IN_PROGRESS,
    description: 'Dangerous cavity near Jillelguda bus stand. Several near-misses reported during evening rain.',
    reportedAt: '2026-04-03T19:30:00',
    rainHazard: true,
    reporter: 'Meera P.',
    reporterCount: 23,
    image: null,
  },
  {
    id: 7,
    lat: 17.3340,
    lng: 78.4500,
    severity: SEVERITY.MINOR,
    status: STATUS.PENDING,
    description: 'Small pothole on internal colony road near Karmanghat. Minimal risk.',
    reportedAt: '2026-04-07T06:10:00',
    rainHazard: false,
    reporter: 'Arjun R.',
    reporterCount: 2,
    image: null,
  },
  {
    id: 8,
    lat: 17.3400,
    lng: 78.4490,
    severity: SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: 'Moderate pothole near school zone on Balapur main road. Invisible during waterlogging.',
    reportedAt: '2026-04-07T11:00:00',
    rainHazard: true,
    reporter: 'Kavita N.',
    reporterCount: 9,
    image: null,
  },
  {
    id: 9,
    lat: 17.3260,
    lng: 78.4580,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Collapsed section of road after drainage leak near Pahadi Shareef. Extremely hazardous in rain.',
    reportedAt: '2026-04-06T22:00:00',
    rainHazard: true,
    reporter: 'Suresh G.',
    reporterCount: 31,
    image: null,
  },
  {
    id: 10,
    lat: 17.3450,
    lng: 78.4460,
    severity: SEVERITY.MINOR,
    status: STATUS.REPAIRED,
    description: 'Patched pothole near Hasthinapuram GHMC office. Repair holding well.',
    reportedAt: '2026-03-28T13:30:00',
    rainHazard: false,
    reporter: 'Deepak L.',
    reporterCount: 4,
    image: null,
  },
  {
    id: 11,
    lat: 17.3320,
    lng: 78.4640,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Series of connected potholes forming a trench on NH44 service road. Two-wheelers reported losing control.',
    reportedAt: '2026-04-07T07:45:00',
    rainHazard: true,
    reporter: 'Ravi T.',
    reporterCount: 17,
    image: null,
  },
  {
    id: 12,
    lat: 17.3460,
    lng: 78.4530,
    severity: SEVERITY.MEDIUM,
    status: STATUS.IN_PROGRESS,
    description: 'Uneven manhole cover on Chandrayangutta road creating hazard during monsoon flooding.',
    reportedAt: '2026-04-05T16:20:00',
    rainHazard: true,
    reporter: 'Anita B.',
    reporterCount: 8,
    image: null,
  },
  {
    id: 13,
    lat: 17.3390,
    lng: 78.4475,
    severity: SEVERITY.DANGEROUS,
    status: STATUS.PENDING,
    description: 'Wide crater near Almasguda railway crossing. Vehicles swerve dangerously to avoid it. Hidden in monsoon.',
    reportedAt: '2026-04-07T15:30:00',
    rainHazard: true,
    reporter: 'Farhan S.',
    reporterCount: 26,
    image: null,
  },
  {
    id: 14,
    lat: 17.3275,
    lng: 78.4510,
    severity: SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: 'Damaged road edge near Meerpet park. Water accumulates here causing skids for bikes.',
    reportedAt: '2026-04-07T12:15:00',
    rainHazard: true,
    reporter: 'Lakshmi V.',
    reporterCount: 6,
    image: null,
  },
  {
    id: 15,
    lat: 17.3430,
    lng: 78.4590,
    severity: SEVERITY.MINOR,
    status: STATUS.REPAIRED,
    description: 'Minor road crack near Balapur market. Has been well patched by GHMC.',
    reportedAt: '2026-03-30T09:00:00',
    rainHazard: false,
    reporter: 'Sanjay K.',
    reporterCount: 1,
    image: null,
  },
];

// Local Storage keys
const STORAGE_KEYS = {
  USER: 'rw_user_potholes',
  GENERATED: 'rw_generated_potholes',
  LOADED_REGIONS: 'rw_loaded_regions'
};

// Global persistence arrays
let userPotholes = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '[]');
let generatedPotholes = JSON.parse(localStorage.getItem(STORAGE_KEYS.GENERATED) || '[]');
let loadedRegions = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOADED_REGIONS) || '[]');
let potholeData = [];

// Combine standard mock data, user reported data, and dynamically generated local data
function rebuildActiveDatabase() {
  potholeData = [...userPotholes, ...generatedPotholes];
  
  // If we haven't loaded any external regions yet, keep the default Hyderabad dummy data
  if (generatedPotholes.length === 0) {
    potholeData = [...potholeData, ...defaultPotholes];
  }
  
  // Assign authorities
  potholeData.forEach(p => {
    if (!p.authority) p.authority = identifyAuthority(p.lat, p.lng);
  });
}

let nextId = 10000;
rebuildActiveDatabase();

// Simulate road authority based on coordinate hash
function identifyAuthority(lat, lng) {
  const hash = Math.abs(Math.sin(lat * 97.4 + lng * 31.2));
  if (hash > 0.85) return 'NHAI / PWD (Highway)';
  if (hash < 0.3) return 'Local Panchayat (Local Road)';
  return 'Municipal Corporation (City Road)';
}

// Fetch real road coordinates via OSM Overpass API or generate fallback potholes near current location
async function fetchRealOrGeneratePotholes(lat, lng, callback) {
  // Check if we already loaded this region (within ~800m grid)
  const gridKey = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
  if (loadedRegions.includes(gridKey)) {
    if (callback) callback();
    return;
  }

  // If user is far from Hyderabad default center, clear the dummy Hyderabad data by building database without defaultPotholes
  const distToHyd = distanceKm(lat, lng, 17.335, 78.452);
  const isFarFromHyd = distToHyd > 10;

  try {
    // Attempt to query OSM Overpass API for actual streets within 800m
    const query = `[out:json][timeout:6];way(around:800,${lat},${lng})[highway];out geom;`;
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Overpass network error');
    
    const data = await response.json();
    const ways = data.elements || [];
    
    let newPotholes = [];
    let localId = Date.now();

    if (ways.length > 0) {
      // We have actual road coordinates! Let's place potholes directly on real roads.
      ways.forEach((way, wIdx) => {
        const geom = way.geometry || [];
        if (geom.length < 2) return;
        
        // Spawn 1-2 potholes per road way randomly along the path nodes
        const spawns = Math.random() < 0.4 ? 1 : Math.random() < 0.7 ? 2 : 0;
        for (let s = 0; s < spawns; s++) {
          const node = geom[Math.floor(Math.random() * geom.length)];
          // Ensure we don't spawn directly on top of the user (at least 35m away)
          if (distanceMeters(lat, lng, node.lat, node.lon) < 35) continue;
          
          const severity = Math.random() < 0.25 ? SEVERITY.DANGEROUS : Math.random() < 0.6 ? SEVERITY.MEDIUM : SEVERITY.MINOR;
          
          newPotholes.push({
            id: localId++,
            lat: node.lat,
            lng: node.lon,
            severity,
            status: STATUS.PENDING,
            description: `Pothole on ${way.tags.name || 'local street'} (${way.tags.highway || 'road'}).`,
            reportedAt: new Date(Date.now() - Math.random() * 86400000 * 5).toISOString(),
            rainHazard: Math.random() < 0.65,
            reporter: `${['Amit', 'Priya', 'Rohan', 'Sneha', 'Vikram', 'Meera'][Math.floor(Math.random() * 6)]} S.`,
            reporterCount: Math.floor(Math.random() * 8) + 1,
            image: null,
            source: SOURCE.COMMUNITY
          });
        }
      });
    }

    // If Overpass returned no ways, or we generated fewer than 5 potholes, fall back to procedural generation
    if (newPotholes.length < 5) {
      newPotholes = generateProceduralPotholes(lat, lng, localId);
    }

    // Merge new potholes into generated list
    generatedPotholes = [...generatedPotholes, ...newPotholes];
    localStorage.setItem(STORAGE_KEYS.GENERATED, JSON.stringify(generatedPotholes));
    
    // Mark region as loaded
    loadedRegions.push(gridKey);
    localStorage.setItem(STORAGE_KEYS.LOADED_REGIONS, JSON.stringify(loadedRegions));
    
    rebuildActiveDatabase();
    if (callback) callback(true);
    
  } catch (err) {
    console.warn('Overpass API failed or timed out. Falling back to local procedural generation.', err);
    // Fallback procedural generation
    const newPotholes = generateProceduralPotholes(lat, lng, Date.now());
    generatedPotholes = [...generatedPotholes, ...newPotholes];
    localStorage.setItem(STORAGE_KEYS.GENERATED, JSON.stringify(generatedPotholes));
    
    loadedRegions.push(gridKey);
    localStorage.setItem(STORAGE_KEYS.LOADED_REGIONS, JSON.stringify(loadedRegions));
    
    rebuildActiveDatabase();
    if (callback) callback(true);
  }
}

// Generates procedural potholes around a coordinate within 600 meters
function generateProceduralPotholes(lat, lng, startId) {
  const potholes = [];
  const count = 10 + Math.floor(Math.random() * 12); // Generate 10-21 potholes
  
  for (let i = 0; i < count; i++) {
    // Generate random offset within ~600m, but at least 35m away (approx 0.00035 degrees)
    const r = 0.00035 + Math.random() * 0.00565;
    const theta = Math.random() * Math.PI * 2;
    const pLat = lat + r * Math.sin(theta);
    const pLng = lng + r * Math.cos(theta);
    
    const severity = Math.random() < 0.3 ? SEVERITY.DANGEROUS : Math.random() < 0.65 ? SEVERITY.MEDIUM : SEVERITY.MINOR;
    
    potholes.push({
      id: startId + i,
      lat: pLat,
      lng: pLng,
      severity,
      status: STATUS.PENDING,
      description: `${severity.charAt(0).toUpperCase() + severity.slice(1)} pothole detected near coordinate block.`,
      reportedAt: new Date(Date.now() - Math.random() * 86400000 * 4).toISOString(),
      rainHazard: Math.random() < 0.5,
      reporter: 'RoadWatch Sensor',
      reporterCount: Math.floor(Math.random() * 4) + 1,
      image: null,
      source: SOURCE.AI
    });
  }
  return potholes;
}

// ---------- helpers ----------
function getAllPotholes() {
  return [...potholeData];
}

function getPotholeById(id) {
  return potholeData.find(p => p.id === id) || null;
}

function addPothole(pothole) {
  const entry = {
    id: nextId++,
    lat: pothole.lat,
    lng: pothole.lng,
    severity: pothole.severity || SEVERITY.MEDIUM,
    status: STATUS.PENDING,
    description: pothole.description || '',
    reportedAt: new Date().toISOString(),
    rainHazard: pothole.rainHazard ?? true,
    reporter: pothole.reporter || 'Anonymous',
    reporterCount: pothole.reporterCount || 1,
    image: pothole.image || null,
    authority: identifyAuthority(pothole.lat, pothole.lng),
    source: pothole.source || SOURCE.MANUAL,
    confidence: pothole.confidence || null,
    aiVerified: pothole.aiVerified || false,
  };
  
  userPotholes.unshift(entry);
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userPotholes));
  
  rebuildActiveDatabase();
  return entry;
}

// Attempt to merge an AI detection into an existing nearby pothole.
// Returns the merged pothole if found within radiusM, otherwise null.
function mergeDetection(lat, lng, radiusM = 15, confidence = 0) {
  const nearby = potholeData.find(p =>
    p.status !== STATUS.REPAIRED &&
    distanceMeters(lat, lng, p.lat, p.lng) <= radiusM
  );
  if (!nearby) return null;

  nearby.reporterCount = (nearby.reporterCount || 1) + 1;
  nearby.aiVerified    = true;
  if (confidence && (!nearby.confidence || confidence > nearby.confidence)) {
    nearby.confidence = confidence;
  }
  // Promote to community verified once 3+ detections
  if (nearby.reporterCount >= 3 && nearby.status !== STATUS.REPAIRED) {
    nearby.status = STATUS.COMMUNITY_VERIFIED;
    nearby.source = SOURCE.COMMUNITY;
  }
  return nearby;
}

function updatePotholeStatus(id, newStatus) {
  const p = potholeData.find(x => x.id === id);
  if (p) p.status = newStatus;
  return p;
}

// Compute stats
function getStats() {
  const total             = potholeData.length;
  const dangerous         = potholeData.filter(p => p.severity === SEVERITY.DANGEROUS).length;
  const pending           = potholeData.filter(p => p.status === STATUS.PENDING).length;
  const repaired          = potholeData.filter(p => p.status === STATUS.REPAIRED).length;
  const rainHazards       = potholeData.filter(p => p.rainHazard).length;
  const inProgress        = potholeData.filter(p => p.status === STATUS.IN_PROGRESS).length;
  const aiDetected        = potholeData.filter(p => p.source === SOURCE.AI || p.aiVerified).length;
  const communityVerified = potholeData.filter(p => p.source === SOURCE.COMMUNITY ||
                              p.status === STATUS.COMMUNITY_VERIFIED).length;
  const userReported      = potholeData.filter(p => p.source === SOURCE.MANUAL || !p.source).length;
  return { total, dangerous, pending, repaired, rainHazards, inProgress,
           aiDetected, communityVerified, userReported };
}

// Simple distance (haversine approximation for short distances)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  return distanceKm(lat1, lng1, lat2, lng2) * 1000;
}

// Helper: get potholes within a radius (km) from a point
function getPotholesInRadius(lat, lng, radiusKm) {
  return getAllPotholes().filter(p => {
    const d = distanceKm(lat, lng, p.lat, p.lng);
    return d <= radiusKm;
  });
}


function getNearbyPotholes(lat, lng, radiusKm = 2) {
  return potholeData
    .filter(p => distanceKm(lat, lng, p.lat, p.lng) <= radiusKm)
    .sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng));
}

// Search / filter
function searchPotholes(query) {
  const q = query.toLowerCase().trim();
  if (!q) return getAllPotholes();
  return potholeData.filter(p =>
    p.description.toLowerCase().includes(q) ||
    p.reporter.toLowerCase().includes(q) ||
    p.severity.includes(q) ||
    p.status.includes(q) ||
    `#${p.id}`.includes(q)
  );
}

function getMockRoutes() {
  return MOCK_ROUTES;
}

// Export for modules (but we use plain scripts)
window.RW_DATA = {
  SEVERITY, STATUS, SOURCE,
  SEVERITY_COLORS, SEVERITY_LABELS, STATUS_LABELS, SOURCE_LABELS,
  getAllPotholes, getPotholeById, addPothole, updatePotholeStatus,
  mergeDetection, fetchRealOrGeneratePotholes,
  getStats, getNearbyPotholes, getPotholesInRadius, distanceKm, distanceMeters, searchPotholes,
  getMockRoutes, identifyAuthority,
};
