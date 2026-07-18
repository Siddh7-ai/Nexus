/**
 * Production-Grade Client-Side Monitoring Utility
 * Measures Core Web Vitals, catches unhandled rejections, and monitors API latency.
 */

// 1. Initialize Global Error & Promise Rejection Handlers
export function initErrorMonitoring() {
  window.addEventListener("error", (event) => {
    console.error("[Nexus Monitor] Uncaught runtime exception:", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error ? event.error.stack : null
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[Nexus Monitor] Unhandled Promise Rejection:", {
      reason: event.reason ? (event.reason.stack || event.reason.message || event.reason) : "Unknown reason"
    });
  });
}

// 2. Wrap global fetch to log slow API requests (> 500ms)
export function initApiPerformanceMonitoring() {
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const startTime = performance.now();
    const url = typeof input === "string" ? input : (input && input.url) ? input.url : "Unknown URL";
    
    try {
      const response = await originalFetch.apply(this, arguments);
      const duration = performance.now() - startTime;
      
      if (duration > 500) {
        console.warn(`[Nexus Monitor] Slow API Request: ${url} took ${duration.toFixed(2)}ms (Limit: 500ms)`);
      }
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[Nexus Monitor] Failed API Request: ${url} failed after ${duration.toFixed(2)}ms. Error:`, error);
      throw error;
    }
  };
}

// 3. Measure Core Web Vitals
export function initWebVitalsMonitoring() {
  // Largest Contentful Paint (LCP)
  try {
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log(`[Nexus Monitor] LCP (Largest Contentful Paint): ${lastEntry.startTime.toFixed(2)}ms`);
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {
    console.warn("[Nexus Monitor] LCP tracking not supported in this browser");
  }

  // Cumulative Layout Shift (CLS)
  try {
    let clsValue = 0;
    let logTimeout = null;
    const clsObserver = new PerformanceObserver((entryList) => {
      let updated = false;
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          updated = true;
        }
      }
      if (updated) {
        if (logTimeout) clearTimeout(logTimeout);
        logTimeout = setTimeout(() => {
          console.log(`[Nexus Monitor] CLS (Cumulative Layout Shift): ${clsValue.toFixed(4)}`);
        }, 1000);
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch (e) {
    console.warn("[Nexus Monitor] CLS tracking not supported in this browser");
  }

  // First Input Delay (FID)
  try {
    const fidObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      for (const entry of entries) {
        const delay = entry.processingStart - entry.startTime;
        console.log(`[Nexus Monitor] FID (First Input Delay): ${delay.toFixed(2)}ms`);
      }
    });
    fidObserver.observe({ type: "first-input", buffered: true });
  } catch (e) {
    console.warn("[Nexus Monitor] FID tracking not supported in this browser");
  }

  // Measure initial page paint metrics
  window.addEventListener("load", () => {
    setTimeout(() => {
      try {
        const paintEntries = performance.getEntriesByType("paint");
        paintEntries.forEach((entry) => {
          console.log(`[Nexus Monitor] Paint Event (${entry.name}): ${entry.startTime.toFixed(2)}ms`);
        });
      } catch (e) {
        console.warn("[Nexus Monitor] Paint metrics not supported");
      }
    }, 1000);
  });
}

// Initialize all monitors
export function initAllMonitors() {
  if (process.env.NODE_ENV === "production" || window.location.hostname !== "localhost") {
    // Optional filter to restrict logging in dev if needed, but we always run in production-grade setups
  }
  initErrorMonitoring();
  initApiPerformanceMonitoring();
  initWebVitalsMonitoring();
}
