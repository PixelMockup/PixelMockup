/* Boot splash progress while JS modules download (pre-React). */
(function () {
  var STATUS = document.getElementById('ms-boot-status');
  var BAR = document.getElementById('ms-boot-bar');
  var PCT = document.getElementById('ms-boot-pct');
  var ETA = document.getElementById('ms-boot-eta');
  var start = performance.now();

  // Expected critical JS payload before React can paint (Vite dev deps dominate).
  var EXPECTED_BYTES = 3200 * 1024;
  var completedBytes = 0;
  var lastCompletionAt = start;
  var seen = Object.create(null);

  function downlinkMBps() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    // downlink is Mbps; fallback ~0.4 Mbps for slower mobile links
    var mbps = c && typeof c.downlink === 'number' && c.downlink > 0 ? c.downlink : 0.4;
    return mbps;
  }

  function fmtEta(sec) {
    if (!isFinite(sec) || sec < 0) return '';
    if (sec < 5) return 'a few seconds left';
    if (sec < 60) return 'about ' + Math.round(sec) + 's left';
    return 'about ' + Math.round(sec / 60) + ' min left';
  }

  function setUI(pct, msg, etaSec) {
    var p = Math.max(0, Math.min(95, Math.round(pct)));
    if (BAR) {
      BAR.style.width = p + '%';
      BAR.style.animation = 'none';
    }
    if (PCT) PCT.textContent = p + '%';
    if (STATUS && msg) STATUS.textContent = msg;
    if (ETA) ETA.textContent = etaSec != null ? fmtEta(etaSec) : '';
  }

  function noteResource(entry) {
    if (!entry || seen[entry.name + ':' + entry.responseEnd]) return;
    seen[entry.name + ':' + entry.responseEnd] = 1;
    var size = entry.transferSize || entry.encodedBodySize || 0;
    if (size > 0) completedBytes += size;
    lastCompletionAt = performance.now();
  }

  function tick() {
    var stallSec = (performance.now() - lastCompletionAt) / 1000;
    var mbps = downlinkMBps();
    var bytesPerSec = (mbps * 1000000) / 8;
    var remaining = Math.max(EXPECTED_BYTES - completedBytes, 200 * 1024);
    // While a large file is in-flight, Resource Timing won't update until done.
    // Estimate bytes received during the stall from link speed.
    var inFlightGuess = 0;
    if (stallSec > 0.5 && completedBytes < EXPECTED_BYTES * 0.9) {
      inFlightGuess = Math.min(remaining * 0.92, bytesPerSec * stallSec);
    }
    var effectiveDone = Math.min(EXPECTED_BYTES * 0.95, completedBytes + inFlightGuess);
    var pct = (effectiveDone / EXPECTED_BYTES) * 100;
    var etaSec = Math.max(0, (EXPECTED_BYTES - effectiveDone) / bytesPerSec);

    var msg = 'Downloading app…';
    if (completedBytes > EXPECTED_BYTES * 0.55 || pct > 55) {
      msg = 'Preparing workspace…';
    } else if (stallSec > 8) {
      msg = 'Still downloading…';
    }

    setUI(pct, msg, etaSec);
  }

  if (typeof PerformanceObserver !== 'undefined') {
    try {
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(noteResource);
      });
      po.observe({ type: 'resource', buffered: true });
    } catch {
      /* older browsers */
    }
  }

  performance.getEntriesByType('resource').forEach(noteResource);

  setUI(3, 'Downloading app…', null);

  var id = window.setInterval(tick, 250);
  window.__MS_BOOT_PROGRESS__ = {
    stop: function () {
      window.clearInterval(id);
    },
  };
})();
