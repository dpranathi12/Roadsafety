// drive.js – AI-powered real‑time pothole detection while driving
// Exposes a global RW_AI namespace with startDriving()/stopDriving()

(function () {
  'use strict';
  const AI = {};
  // Force demo mode (no real camera) – useful for environments without camera access or for demo presentations
  window.RW_AI = AI;
  let videoEl = null, canvasEl = null, ctx = null, model = null, stream = null;
  const FORCE_DEMO = true; // Set true to bypass real camera
  let processing = false, demoMode = false, detectionInterval = null, lastAlertTime = 0;
  const statusPanel = document.getElementById('driving-status-panel');
  const modeSpan = document.getElementById('ai-mode');
  const speedSpan = document.getElementById('current-speed');
  const alertDiv = document.getElementById('ai-alert');
  function showPanel() { if (statusPanel) statusPanel.style.display = 'block'; }
  function hidePanel() { if (statusPanel) statusPanel.style.display = 'none'; }
  async function loadModel() {
    if (model) return model;
    await import('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.13.0/dist/tf.min.js');
    const modelUrl = 'js/model/model.json';
    try { model = await tf.loadGraphModel(modelUrl); console.log('RoadWatch AI model loaded'); return model; }
    catch (e) { console.warn('Failed to load AI model, entering demo mode', e); demoMode = true; }
  }
  function createOverlay() {
    // In demo mode we only need the detection overlay canvas; hide the video element.
    videoEl = document.createElement('video');
    videoEl.autoplay = true; videoEl.playsInline = true;
    Object.assign(videoEl.style, {position:'absolute',top:0,left:0,width:'100%',height:'100%',objectFit:'cover',zIndex:1000,display:'none'});
    document.body.appendChild(videoEl);
    canvasEl = document.createElement('canvas');
    Object.assign(canvasEl.style, {position:'absolute',top:0,left:0,width:'100%',height:'100%',zIndex:1001,pointerEvents:'none'});
    document.body.appendChild(canvasEl);
    ctx = canvasEl.getContext('2d');
  }
  function resizeOverlay(){
    if (videoEl && canvasEl) {
      // Ensure the canvas matches the actual video dimensions for crisp overlays
      canvasEl.width = videoEl.videoWidth || window.innerWidth;
      canvasEl.height = videoEl.videoHeight || window.innerHeight;
    }
  }
  function estimateDistance(boxHeightPx){ const focalPx=700; const realHeightM=0.2; return (realHeightM*focalPx)/boxHeightPx; }
  function detectWeatherMode(imageData){ const data=imageData.data; let sum=0; const step=4*Math.max(1, Math.floor(data.length/5000)); for(let i=0;i<data.length;i+=step){ sum+=data[i]; } const avg=sum/(data.length/4); if(avg<80) return 'night'; if(avg>180) return 'day'; return 'day'; }
  async function processFrame(){ if(!processing) return; if(!videoEl||videoEl.readyState<2){ requestAnimationFrame(processFrame); return; } resizeOverlay(); ctx.clearRect(0,0,canvasEl.width,canvasEl.height);
    const tfImg=tf.browser.fromPixels(videoEl);
    const expanded=tfImg.expandDims(0).toFloat().div(255);
    const preds=await model.executeAsync(expanded);
    const [boxes,scores,classes]=preds;
    const boxesData=boxes.arraySync()[0]; const scoresData=scores.arraySync()[0]; const classesData=classes.arraySync()[0];
    tfImg.dispose(); expanded.dispose(); boxes.dispose(); scores.dispose(); classes.dispose();
    for(let i=0;i<scoresData.length;i++){
      if(scoresData[i]<0.6) continue; const cls=classesData[i]; if(cls!==0) continue; const [y1,x1,y2,x2]=boxesData[i]; const w=canvasEl.width, h=canvasEl.height;
      const bx=x1*w, by=y1*h, bw=(x2-x1)*w, bh=(y2-y1)*h;
      ctx.strokeStyle='#FF1744'; ctx.lineWidth=3; ctx.strokeRect(bx,by,bw,bh);
      const distance=estimateDistance(bh);
      const label=`Pothole ${Math.round(scoresData[i]*100)}% ${distance.toFixed(1)}m`;
      ctx.fillStyle='rgba(255,23,68,0.8)'; ctx.font='16px Inter,Arial,sans-serif'; ctx.fillText(label,bx+4,by-6);
      if(distance<20 && Date.now()-lastAlertTime>12000){ lastAlertTime=Date.now(); showDriverAlert(distance,scoresData[i]); AI.pendingDetections=AI.pendingDetections||[]; AI.pendingDetections.push({id:`ai-${Date.now()}`,lat:null,lng:null,severity:'dangerous',confidence:Math.round(scoresData[i]*100),description:`AI detected pothole ${distance.toFixed(1)} m ahead`}); }
    }
    requestAnimationFrame(processFrame);
  }
  function showDriverAlert(distance,confidence){ if(alertDiv){ alertDiv.textContent=`⚠ Dangerous Pothole Ahead (${distance.toFixed(0)} m, ${Math.round(confidence*100)}% confidence)`; alertDiv.style.display='block'; setTimeout(()=>{alertDiv.style.display='none';},8000); } if(window.driveVoiceEnabled && 'speechSynthesis' in window){ const utter=new SpeechSynthesisUtterance(`Warning! Dangerous pothole detected ${Math.round(distance)} meters ahead.`); utter.pitch=1; utter.rate=1; window.speechSynthesis.speak(utter); } }
  function attachGpsTracker(){ if(!navigator.geolocation) return; const watchId=navigator.geolocation.watchPosition(pos=>{ const {latitude,longitude,speed}=pos.coords; if(speed!=null){ const kmh=(speed*3.6).toFixed(0); if(speedSpan) speedSpan.textContent=`${kmh} km/h`; }
      if(AI.pendingDetections){ AI.pendingDetections.forEach(det=>{ det.lat=latitude; det.lng=longitude; if(window.RW_MAP&&typeof window.RW_MAP.plotAutoDetected==='function'){ window.RW_MAP.plotAutoDetected(null,det,{}); } }); AI.pendingDetections=[]; }
    }, err=>console.warn('GPS error',err),{enableHighAccuracy:true,maximumAge:2000,timeout:10000}); AI.gpsWatchId=watchId; }
  AI.startDriving=async function(){
    showPanel();
    modeSpan.textContent='Initializing…';
    const mapEl = document.getElementById('home-map');
    if (mapEl) mapEl.style.display='none';
    const demoCanvas = document.getElementById('demo-road-canvas');
    if (demoCanvas) demoCanvas.style.display='block';
    
    const demoToggle = document.getElementById('demo-mode-toggle');
    const isDemo = demoToggle ? demoToggle.checked : true;
    
    if (isDemo) {
      console.log('Demo mode enabled via navbar toggle – using simulated road video');
      demoMode = true;
      const demoVideo = document.createElement('video');
      demoVideo.src = 'assets/demo-driving.mp4';
      demoVideo.loop = true;
      demoVideo.autoplay = true;
      demoVideo.muted = true;
      stream = demoVideo.captureStream();
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        demoMode = false;
      } catch (e) {
        console.warn('Camera not accessible, falling back to demo mode', e);
        demoMode = true;
        const demoVideo = document.createElement('video');
        demoVideo.src = 'assets/demo-driving.mp4';
        demoVideo.loop = true;
        demoVideo.autoplay = true;
        demoVideo.muted = true;
        stream = demoVideo.captureStream();
        const demoToggleElem = document.getElementById('demo-mode-toggle');
        if (demoToggleElem) {
          demoToggleElem.checked = true;
          if (window.updateDemoStatus) window.updateDemoStatus(true);
        }
      }
    }
    createOverlay();
    videoEl.srcObject=stream;
    await videoEl.play();
    await loadModel();
    attachGpsTracker();
    processing=true;
    requestAnimationFrame(processFrame);
    modeSpan.textContent=demoMode?'Demo Mode':'Active';
    
    if (demoMode && demoCanvas) {
      window.RW_AI.startDemoRoad(demoCanvas);
    }
    
    document.getElementById('status-ai')?.classList.add('active');
    document.getElementById('status-gps')?.classList.add('active');
    document.getElementById('status-camera')?.classList.add('active');
    
    // Update drive button UI via central helper
    if (window.updateDriveButton) window.updateDriveButton(true);
    // Switch to drive page view
    if (window.__nav) window.__nav('drive');
    
    setTimeout(()=>{
      if(!videoEl) return;
      ctx.drawImage(videoEl,0,0,canvasEl.width,canvasEl.height);
      const imgData=ctx.getImageData(0,0,canvasEl.width,canvasEl.height);
      const weather=detectWeatherMode(imgData);
      modeSpan.textContent=weather.charAt(0).toUpperCase()+weather.slice(1)+' Mode';
      if(weather==='night') videoEl.style.filter='brightness(0.7) contrast(1.2)';
      if(weather==='rain') videoEl.style.filter='saturate(1.3) contrast(1.1)';
    },1500);
  };
  
  AI.stopDriving=function(){
    processing=false;
    const demoCanvas = document.getElementById('demo-road-canvas');
    if (demoCanvas) demoCanvas.style.display='none';
    const mapEl = document.getElementById('home-map');
    if (mapEl) mapEl.style.display='block';
    if (videoEl){ videoEl.pause(); videoEl.srcObject=null; videoEl.remove(); videoEl=null; }
    if (canvasEl){ canvasEl.remove(); canvasEl=null; ctx=null; }
    if (demoCanvas) { window.RW_AI.stopDemoRoad(); }
    if(stream){ if(stream.getTracks) stream.getTracks().forEach(t=>t.stop()); stream=null; }
    if(AI.gpsWatchId){ navigator.geolocation.clearWatch(AI.gpsWatchId); AI.gpsWatchId=null; }
    hidePanel();
    
    document.getElementById('status-ai')?.classList.remove('active');
    document.getElementById('status-gps')?.classList.remove('active');
    document.getElementById('status-camera')?.classList.remove('active');
    
    // Reset drive button UI via central helper
    if (window.updateDriveButton) window.updateDriveButton(false);
  };
  
  document.getElementById('start-driving-btn')?.addEventListener('click',()=>{
    if(processing){
      AI.stopDriving();
    } else {
      AI.startDriving();
    }
  });
})();
