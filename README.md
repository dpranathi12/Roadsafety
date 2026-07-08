# 🛣️ RoadWatch — Live Road Safety Platform

> **AI-powered real-time road safety, pothole detection, and community hazard reporting for Indian roads.**

RoadWatch is a browser-based Progressive Web Application that uses your smartphone's camera, accelerometer, and GPS to detect potholes in real time, map them visually, alert drivers before they reach hazards, and enable community-driven road hazard reporting. It is designed to feel like a professional navigation assistant similar to Google Maps or Waze — but specialized for road surface safety and hazard avoidance.

---

## 🚀 Key Modules & Pages

The application is structured as a Single Page Application (SPA) with a dedicated navigation system. Below are the key modules and interfaces:

### 🏠 Home & Splash Screen
- **Splash Screen Loader** — An animated bootscreen showcasing simulated connection steps: Connecting to AI engine, Loading database, Calibrating GPS, and Initializing camera.
- **Hero Dashboard Stats** — Real-time analytics counters for Total Reported, Dangerous, Rain Hazards, and Repaired potholes.
- **Interactive Weather Widget** — Changes dynamically depending on the current Rain Mode setting. Displays active safety advice, temp, humidity, and visibility level.
- **Scrolling Notification Ticker** — A marquee scrolling bar displaying live warnings and coordinates for currently unresolved Dangerous hazards in the database.
- **Mini Map** — An embedded interactive preview map showcasing active regional hazards.
- **Desktop Accelerometer Simulator** — Allows developers and users to trigger synthetic motion bumps and view the response profile.

### 🚗 Drive Mode
- **Mode Selector** — Premium card-based interface allowing the driver to select between **Live Driving** or **Demo Mode**:
  - **Live Driving** — Launches the rear-facing camera feed and GPS tracker, processing frames dynamically through the AI model.
  - **Demo Mode** — Runs a pre-recorded canvas-based road animation simulating driving over a preset path in Hyderabad (no hardware required).
- **Fullscreen Navigation Layout** — Map automatically expands to fill the viewport, while the video/demo canvas feed shrinks into a floating picture-in-picture (PIP) container in the top-left corner.
- **AI-Engine Status & HUD** — Floating telemetry strip showing speed (km/h), distance to the closest non-repaired pothole, severity of nearest hazard, GPS status, and AI Engine status.

### 🤖 AI Detection Engine
- **Pre-inference Road Surface Gate** — Performs pixel-color heuristics on the lower-center region of the camera feed (sampling 40 points in a grid) to ensure it is pointing at asphalt, concrete, or lane markings.
  - If the camera is pointing away (e.g., dashboard, sky, interior), it pauses inference, alerts the user (*"🚫 Road not detected"*), and prevents false positive markers.
- **YOLO-style Object Detection** — Bounding boxes are drawn overlaying the video feed in real time with dynamic severity classification and confidence scoring.
- **Thin-lens Distance Estimation** — Approximates the distance (in meters) to each detected pothole based on camera focal length and the height of the bounding box.

### 🔔 Proximity Alerts (Web Speech API)
- **Voice Warnings** — Synthesizes spoken voice alerts (*"Warning! Dangerous pothole ahead"* or *"Warning! Multiple potholes ahead"*) using the browser's Web Speech API.
- **Proximity Gate** — Alerts are restricted to dangerous potholes lying between 20–30 meters directly in front of the vehicle.
- **Hazard Grouping & Smart Deduplication** — Groups multiple hazards within 50 meters into a single alert to avoid notification clutter. Prevents repeating voice warnings for the same hazard within a 30-second window.
- **Auto-dismissing Alert Card** — A styled caution banner overlays the driving UI and auto-fades after 3.5 seconds.

### 🗺️ Live Map (Risk Map)
- **Leaflet.js Mapping Engine** — Utilizes CARTO Dark tiles and custom leaflet styling rules.
- **Marker Cluster Support** — Groups high-density hazard areas into interactive cluster groups using `Leaflet.markercluster`.
- **Safe Route Planning Overlay** — Toggleable route guidance drawing **Route A (Safer)** in green (minimal potholes) and **Route B (Riskier)** in red (multiple potholes), with interactive tooltips showing warning metrics.
- **Detailed Marker Tooltips** — Clicking a marker displays the reporter, severity, current repair status, timestamp, coordinates, and description.

### 📈 Dashboard
- **Telemetry Overview** — Displays current statistics of the road database.
- **Severity Distribution Chart** — Renders an interactive Chart.js donut chart mapping out the proportions of Minor, Medium, and Dangerous potholes.
- **Recent Reports Table** — Shows historical hazard data with search filters, statuses, and custom icons.

### 🔍 Detect Page (Motion Bump Profiler)
- **Raw Sensor Profiler** — Subscribes to `DeviceMotionEvent` at **50 Hz** to capture raw acceleration vectors.
- **Live Waveform Graph** — Plots dynamic acceleration on a canvas graph. Includes low-pass filter logic to separate static gravity (9.81 m/s²) and capture dynamic jolts.
- **Severity Threshold Calibration**:
  - 🟢 **Minor Bump**: Dynamic acceleration $\ge 2.2 \text{ m/s}^2$
  - 🟡 **Medium Bump**: Dynamic acceleration $\ge 4.8 \text{ m/s}^2$
  - 🔴 **Dangerous Impact**: Dynamic acceleration $\ge 8.0 \text{ m/s}^2$
- **GPS Clustering** — Clusters multiple detected motion bumps within 18 meters together to prevent duplicate pins.

### 📝 Report Page
- **Community Submission form** — Enables reporting of new hazards with automated GPS coordinate lookup, description text box, severity rating, and an image attachment mockup.

---

## 🗂️ Project Structure

```
RoadWatch/
├── index.html            # Main SPA: Navigation, page placeholders, loading logic
├── README.md             # This documentation file
├── css/
│   └── style.css         # Modular CSS Design System & styles (~4,200 lines)
└── js/
    ├── data.js           # Database, Haversine formulas, mock routes, helper functions
    ├── sensor.js         # Accelerometer bump detector engine (50 Hz, clustering)
    ├── ai-detect.js      # YOLO simulation, road classification gate, distance formulas
    ├── map.js            # Leaflet map configuration, route overlays, cluster logic
    ├── drive.js          # Legacy drive module (retained for backward compatibility)
    └── app.js            # Router, state controller, page renderers, session controller
```

---

## 🏗️ Architecture & Data Flow

```
+-------------------------------------------------------------+
|                     Browser (SPA Router)                    |
|  [Home]   [Drive]   [Detect]   [Report]   [Live Map]   [Dash]   |
+-------------------------------------------------------------+
                               |
       +-----------------------+-----------------------+
       |                       |                       |
+--------------+       +---------------+       +---------------+
|  js/data.js  |       |  js/sensor.js |       |  js/map.js    |
|  Pothole DB  |       | Accelerometer |       |  Leaflet Map  |
|  & Routes    |       | Bump Profiler |       |  Cluster Layer|
+--------------+       +---------------+       +---------------+
                               |                       |
                               +-----------+-----------+
                                           |
                                   +---------------+
                                   |  js/app.js    |
                                   | State Machine |
                                   +---------------+
                                           |
                              +------------+------------+
                              |                         |
                      +---------------+         +---------------+
                      |   Camera/GPS  |         |  ai-detect.js |
                      | Hardware APIs |         |  Road Gate &  |
                      +---------------+         |  Inference    |
                                                +---------------+
```

### Video Stream Processing Loop:
```
Camera Video Stream / Canvas Simulation
                 │
                 ▼
      [detectRoadSurface()]
                 │
                 ├─────── (No Road Detected) ───────► Show "🚫 Road not detected" overlay
                 │
                 ▼ (Road Surface Confirmed)
      [runSimulatedInference()]
                 │
                 ▼ (Draw bounding boxes + calculate distance)
      [onDetection(hazard)]
                 │
                 ├──► [updateHUD()] ────────► Bottom Status Strip
                 ├──► [showAlert()] ────────► Floating Warnings (Dangerous Only)
                 ├──► [plotAutoDetected()] ─► Draw Marker on Leaflet
                 └──► [speakUtterance()] ───► Web Speech Voice Alert
```

---

## 🛠️ Technology Stack

| Library / Web API | Role in Platform |
|---|---|
| **HTML5 / CSS3** | SPA layout, variables, flexbox, glassmorphic styling, keyframe animations |
| **Vanilla ES6 JS** | Core router, state controls, canvas math — zero frameworks |
| **Leaflet.js v1.9.4** | Interactive map tile loader and marker display |
| **Leaflet MarkerCluster** | Dynamic marker clustering for high-density safety points |
| **Chart.js v4.4.4** | Renders the severity analysis donut charts |
| **Web Speech API** | Synthesizes voice alerts for dangerous hazards |
| **Geolocation API** | Coordinates real GPS telemetry for map markers and user tracking |
| **Device Motion API** | Accelerometer capture at 50 Hz on mobile devices |
| **HTML5 Canvas 2D** | Bounding box renders, pixel color colorimetry, motion graphs |

---

## 🚀 Getting Started & Local Development

### Prerequisites
- Any modern web browser (Chrome, Edge, Safari, Firefox).
- A local static file server (due to camera/location permission constraints).

### Running Locally

```bash
# Clone the repository
git clone https://github.com/your-username/roadwatch.git
cd roadwatch

# Start a static local server
# Python 3
python -m http.server 8000
# Node.js
npx serve .
```

Open your browser and navigate to `http://localhost:8000`.

> [!WARNING]
> Web Camera and Geolocation APIs require a secure context. The application **must** be served over `http://localhost` or `https://`. Loading the project using a local filepath (`file://`) will prevent the camera and location features from working.

---

## 🔧 Tuning and Customization

### Adjusting Motion Sensor Sensitivity
In [sensor.js](file:///c:/Users/DESHMUKH/OneDrive/Dokumen/RoadWatch/js/sensor.js), locate the `THRESHOLDS` constants:
```javascript
const THRESHOLDS = {
  minor:     2.2,   // jolt felt but minimal risk (m/s^2)
  medium:    4.8,   // noticeable bump, tyre risk (m/s^2)
  dangerous: 8.0,   // hard impact, accident risk (m/s^2)
};
```
Modify these numbers to calibrate sensor response for different vehicles (e.g., lower numbers for soft-suspension cars, higher numbers for two-wheelers).

### Road Classification Tuning
In [ai-detect.js](file:///c:/Users/DESHMUKH/OneDrive/Dokumen/RoadWatch/js/ai-detect.js), you can adjust the road detection confidence index:
```javascript
const isRoad = confidence >= 0.28; // lower = more forgiving, higher = stricter road checking
```

### Static Asset Cache-Busting
When performing updates on style sheets or application logic, make sure to increment the version parameter in [index.html](file:///c:/Users/DESHMUKH/OneDrive/Dokumen/RoadWatch/index.html) to flush the client cache:
```html
<link rel="stylesheet" href="css/style.css?v=18" />
<script src="js/app.js?v=18"></script>
```

---

## 🤝 Contributing

1. Fork the repository.
2. Create a branch: `git checkout -b feature/your-feature`
3. Test locally at `http://localhost:8000`.
4. Update the cache version in `index.html`.
5. Open a pull request details page describing your enhancement.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 👨‍💻 Author

Built with ❤️ for safer Indian roads.

**RoadWatch** — *Because every pothole avoided is an accident prevented.*
