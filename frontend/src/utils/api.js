import { getBackendUrl } from "./config";

const activeRequests = new Map();
const getCache = new Map();
const DEFAULT_CACHE_TTL = 10000; // 10 seconds cache validity

export class ApiClient {
  static abortControllers = new Map();

  /**
   * Generates a new abort signal for a specific request group name and aborts any active prior request.
   */
  static getAbortSignal(groupKey) {
    if (this.abortControllers.has(groupKey)) {
      try {
        this.abortControllers.get(groupKey).abort();
      } catch (e) {
        console.error("[Nexus API] Abort error:", e);
      }
    }
    const controller = new AbortController();
    this.abortControllers.set(groupKey, controller);
    return controller.signal;
  }

  /**
   * Explicitly cancel any active requests in a request group.
   */
  static cancelRequestGroup(groupKey) {
    if (this.abortControllers.has(groupKey)) {
      this.abortControllers.get(groupKey).abort();
      this.abortControllers.delete(groupKey);
    }
  }

  /**
   * Clear GET caches globally or for a specific matching URL substring.
   */
  static clearCache(urlPattern = null) {
    if (!urlPattern) {
      getCache.clear();
    } else {
      for (const key of getCache.keys()) {
        if (key.includes(urlPattern)) {
          getCache.delete(key);
        }
      }
    }
  }

  /**
   * Perform an API request with caching, deduplication, auto-retries, and cancellation control.
   */
  static async request(url, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const isGet = method === "GET";
    const cacheKey = `${url}:${JSON.stringify(options.headers || {})}`;

    // 1. Cache hit check
    if (isGet && !options.bypassCache) {
      const cached = getCache.get(cacheKey);
      const ttl = options.ttl || DEFAULT_CACHE_TTL;
      if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.data;
      }
    }

    // 2. Request Deduplication: prevent firing identical active requests in parallel
    const dedupeKey = `${method}:${url}:${JSON.stringify(options.body || "")}`;
    if (activeRequests.has(dedupeKey)) {
      return activeRequests.get(dedupeKey);
    }

    // 3. Setup cancellation controller
    if (options.requestGroup && !options.signal) {
      options.signal = this.getAbortSignal(options.requestGroup);
    }

    const retries = options.retries ?? 2;
    const retryDelay = options.retryDelay ?? 1000;

    const performFetch = async (attempt = 0) => {
      try {
        const response = await window.fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();

        // Write to cache
        if (isGet) {
          getCache.set(cacheKey, {
            data,
            timestamp: Date.now()
          });
        }
        return data;
      } catch (error) {
        if (error.name === "AbortError") {
          throw error;
        }
        if (attempt < retries) {
          const backoff = retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          return performFetch(attempt + 1);
        }
        throw error;
      }
    };

    const requestPromise = performFetch().finally(() => {
      activeRequests.delete(dedupeKey);
      if (options.requestGroup) {
        this.abortControllers.delete(options.requestGroup);
      }
    });

    activeRequests.set(dedupeKey, requestPromise);
    return requestPromise;
  }
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken") || sessionStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${getBackendUrl()}/api/auth/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.token && data.refreshToken) {
        sessionStorage.setItem("token", data.token);
        sessionStorage.setItem("refreshToken", data.refreshToken);
        localStorage.setItem("token", data.token);
        localStorage.setItem("refreshToken", data.refreshToken);
        return data.token;
      }
    }
  } catch (err) {
    console.error("[Token Refresh Error] Details:", err);
  }

  // Clear storage on failure
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem("username");
  sessionStorage.removeItem("nexus_master_key");
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("username");
  localStorage.removeItem("nexus_master_key");
  return null;
}
