const rateLimits = new Map();

/**
 * Basic in-memory rate limiting middleware.
 * @param {number} windowMs - Time window in milliseconds
 * @param {number} maxRequests - Max number of requests allowed per IP in the window
 */
function createRateLimiter(windowMs = 15 * 60 * 1000, maxRequests = 100) {
    // Configurable via env variables
    const envWindow = process.env.RATE_LIMIT_WINDOW_MS;
    const envMax = process.env.RATE_LIMIT_MAX_REQUESTS;
    
    const limitWindow = envWindow ? parseInt(envWindow) : windowMs;
    const limitMax = envMax ? parseInt(envMax) : maxRequests;

    return (req, res, next) => {
        const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
        const key = `${req.path}:${ip}`;

        const now = Date.now();
        if (!rateLimits.has(key)) {
            rateLimits.set(key, [now]);
            return next();
        }

        const timestamps = rateLimits.get(key);
        // Filter out timestamps outside the current window
        const activeTimestamps = timestamps.filter(t => now - t < limitWindow);
        
        if (activeTimestamps.length >= limitMax) {
            return res.status(429).json({
                success: false,
                message: "Too many requests. Please try again later."
            });
        }

        activeTimestamps.push(now);
        rateLimits.set(key, activeTimestamps);
        next();
    };
}

module.exports = {
    createRateLimiter
};
