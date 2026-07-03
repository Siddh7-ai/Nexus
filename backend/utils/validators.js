const crypto = require("crypto");

/**
 * Validate email format.
 */
function isValidEmail(email) {
    if (typeof email !== "string") return false;
    // Standard robust email regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) && email.length <= 128;
}

/**
 * Validate username format.
 * Allowed: a-z, A-Z, 0-9, underscore (_), period (.)
 * Length: 3-20 characters.
 */
function isValidUsername(username) {
    if (typeof username !== "string") return false;
    const usernameRegex = /^[a-zA-Z0-9_.]+$/;
    return username.length >= 3 && username.length <= 20 && usernameRegex.test(username);
}

/**
 * Validate password requirements.
 * Minimum 8, Maximum 128 characters.
 * At least one uppercase, one lowercase, one number, and one special character.
 */
function isValidPassword(password) {
    if (typeof password !== "string") return false;
    if (password.length < 8 || password.length > 128) return false;
    
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    return hasUpper && hasLower && hasDigit && hasSpecial;
}

/**
 * Hash a string (token) using sha256.
 */
function hashToken(token) {
    if (!token) return null;
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Middleware/helper to reject any unexpected fields in the request body.
 */
function validateAllowedFields(allowedFields) {
    return (req, res, next) => {
        // Enforce JSON Content-Type for payloads
        if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
            const contentType = req.headers["content-type"] || "";
            if (!contentType.includes("application/json")) {
                return res.status(415).json({
                    success: false,
                    message: "Content-Type must be application/json"
                });
            }
        }

        const keys = Object.keys(req.body);
        const unexpectedKeys = keys.filter(k => !allowedFields.includes(k));
        
        if (unexpectedKeys.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Unexpected fields: ${unexpectedKeys.join(", ")}`
            });
        }
        next();
    };
}

module.exports = {
    isValidEmail,
    isValidUsername,
    isValidPassword,
    hashToken,
    validateAllowedFields
};
