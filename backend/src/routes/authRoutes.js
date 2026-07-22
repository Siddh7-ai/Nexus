const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Session = require("../models/Session");
const { sendEmail } = require("../utils/mailer");
const { 
    isValidEmail, 
    isValidUsername, 
    isValidPassword, 
    hashToken, 
    validateAllowedFields 
} = require("../utils/validators");
const { createRateLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "myrefreshsecretkey";
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12");
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

// Helper to generate cryptographically secure random token
function generateSecureToken() {
    return crypto.randomBytes(32).toString("hex");
}

// 1. REGISTER ENDPOINT
router.post(
    "/register",
    createRateLimiter(60 * 1000 * 10, 5), // 5 requests per 10 mins
    validateAllowedFields([
        "username",
        "email",
        "password",
        "identityPublicKey",
        "signedPrekey",
        "oneTimePrekeys",
        "encryptedIdentityPrivateKey",
        "encryptedSignedPrekeyPrivateKey",
        "encryptedOneTimePrekeys"
    ]),
    async (req, res) => {
        try {
            const { 
                username, 
                email, 
                password, 
                identityPublicKey, 
                signedPrekey, 
                oneTimePrekeys,
                encryptedIdentityPrivateKey,
                encryptedSignedPrekeyPrivateKey,
                encryptedOneTimePrekeys
            } = req.body;

            // Trim inputs
            const trimmedUsername = (username || "").trim();
            const trimmedEmail = (email || "").trim().toLowerCase();

            // Validate inputs
            if (!isValidUsername(trimmedUsername)) {
                return res.status(400).json({
                    success: false,
                    message: "Username must be 3-20 characters long and contain only letters, numbers, underscores, or periods."
                });
            }

            if (!isValidEmail(trimmedEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid email format."
                });
            }

            if (!isValidPassword(password)) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be 8-128 characters long, with at least one uppercase letter, one lowercase letter, one number, and one special character."
                });
            }

            // Uniqueness check for email
            const existingEmail = await User.findOne({ email: trimmedEmail });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Email already registered"
                });
            }

            // Uniqueness check for username (case-insensitive)
            const existingUsername = await User.findOne({ 
                username: { $regex: new RegExp(`^${trimmedUsername}$`, "i") } 
            });
            if (existingUsername) {
                return res.status(400).json({
                    success: false,
                    message: "Username already taken"
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

            // Generate email verification token (hashed before storage)
            const rawVerificationToken = generateSecureToken();
            const hashedVerificationToken = hashToken(rawVerificationToken);
            const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

            const user = await User.create({
                username: trimmedUsername,
                email: trimmedEmail,
                password: hashedPassword,
                isVerified: false,
                verificationToken: hashedVerificationToken,
                verificationTokenExpires: tokenExpiry,
                identityPublicKey: identityPublicKey || null,
                signedPrekey: signedPrekey ? {
                    publicKey: signedPrekey.publicKey,
                    signature: signedPrekey.signature,
                    createdAt: new Date()
                } : undefined,
                oneTimePrekeys: Array.isArray(oneTimePrekeys) ? oneTimePrekeys.map(k => ({
                    keyId: k.keyId,
                    publicKey: k.publicKey
                })) : [],
                encryptedIdentityPrivateKey: encryptedIdentityPrivateKey || undefined,
                encryptedSignedPrekeyPrivateKey: encryptedSignedPrekeyPrivateKey || undefined,
                encryptedOneTimePrekeys: encryptedOneTimePrekeys || undefined
            });

            // Send Verification Email
            const host = req.get("host");
            const protocol = req.protocol;
            const verificationUrl = `${protocol}://${host}/api/auth/verify-email?token=${rawVerificationToken}`;

            await sendEmail({
                to: trimmedEmail,
                subject: "Verify your email address - Nexus",
                text: `Welcome to Nexus, @${trimmedUsername}!\n\nPlease verify your email address by clicking on the link below:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.`,
                html: `<p>Welcome to Nexus, @${trimmedUsername}!</p><p>Please verify your email address by clicking the link below:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link will expire in 24 hours.</p>`
            });

            console.log(`[Auth Register] User registered successfully: ${trimmedUsername}`);

            // Evict any active guest socket using this username
            const io = req.app.get("io");
            if (io) {
                io.to(`user_${trimmedUsername.toLowerCase()}`).emit("guestUsernameTaken", {
                    username: trimmedUsername,
                    message: "This username is permanently taken to registered user create new one"
                });
            }

            res.status(201).json({
                success: true,
                message: "Registration successful. Please check your email to verify your account.",
                data: {
                    username: user.username,
                    email: user.email
                }
            });

        } catch (error) {
            console.error("[Auth Register Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

// 2. LOGIN ENDPOINT
router.post(
    "/login",
    createRateLimiter(60 * 1000 * 15, 10), // 10 attempts per 15 mins
    validateAllowedFields(["email", "password", "captchaToken"]),
    async (req, res) => {
        try {
            const { email, password } = req.body;

            const trimmedEmailOrUsername = (email || "").trim();

            if (!trimmedEmailOrUsername || !password) {
                return res.status(400).json({ success: false, message: "Invalid email or password." });
            }

            // Find user by email or username
            let user;
            if (trimmedEmailOrUsername.includes("@")) {
                user = await User.findOne({ email: trimmedEmailOrUsername.toLowerCase() });
            } else {
                user = await User.findOne({ username: trimmedEmailOrUsername });
            }

            if (!user) {
                console.log(`[Auth Login Failed] Account not found: ${trimmedEmailOrUsername}`);
                return res.status(400).json({ success: false, message: "Invalid email or password." });
            }

            // Check if account is locked
            if (user.lockUntil && user.lockUntil > Date.now()) {
                const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
                console.log(`[Auth Login Blocked] Locked account attempt: ${user.username}`);
                return res.status(423).json({
                    success: false,
                    message: `Account is temporarily locked. Please try again in ${minutesLeft} minutes.`
                });
            }

            // Verify password
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
                user.lastFailedLogin = new Date();

                const maxAttempts = parseInt(process.env.LOGIN_RATE_LIMIT || "5");
                if (user.failedLoginAttempts >= maxAttempts) {
                    const lockDuration = parseInt(process.env.LOCK_TIME || "15"); // 15 mins default
                    user.lockUntil = new Date(Date.now() + lockDuration * 60 * 1000);
                    console.log(`[Auth Account Locked] User locked out: ${user.username} for ${lockDuration} mins`);
                }

                await user.save();
                return res.status(400).json({ success: false, message: "Invalid email or password." });
            }

            // Enforce email verification if configured
            if (REQUIRE_EMAIL_VERIFICATION && !user.isVerified) {
                console.log(`[Auth Login Blocked] Unverified account attempt: ${user.username}`);
                return res.status(403).json({
                    success: false,
                    message: "Please verify your email address before logging in."
                });
            }

            // Login success: Reset failed attempts & lockouts
            user.failedLoginAttempts = 0;
            user.lockUntil = null;
            user.lastSuccessfulLogin = new Date();
            await user.save();

            // Access Token (short-lived)
            const token = jwt.sign(
                { userId: user._id, username: user.username },
                JWT_SECRET,
                { expiresIn: ACCESS_TOKEN_EXPIRY }
            );

            // Refresh Token (longer-lived)
            const familyId = generateSecureToken();
            const rawRefreshToken = generateSecureToken();
            const hashedRefreshToken = hashToken(rawRefreshToken);

            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            // Save session (supports future device management, IP details, and MFA info)
            await Session.create({
                userId: user._id,
                token: hashedRefreshToken,
                familyId,
                ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
                userAgent: req.headers["user-agent"] || "unknown",
                expiresAt
            });

            console.log(`[Auth Login Success] User logged in: ${user.username}`);

            res.status(200).json({
                success: true,
                message: "Login successful",
                token,
                refreshToken: rawRefreshToken,
                username: user.username,
                email: user.email
            });

        } catch (error) {
            console.error("[Auth Login Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

// 3. EMAIL VERIFICATION ENDPOINT
router.get("/verify-email", async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host").split(":")[0]}:5173`;

    try {
        const { token } = req.query;
        if (!token) {
            return res.redirect(`${frontendUrl}/verify-email?status=error&message=${encodeURIComponent("Verification token is missing.")}`);
        }

        const hashed = hashToken(token);
        const user = await User.findOne({
            verificationToken: hashed,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.redirect(`${frontendUrl}/verify-email?status=error&message=${encodeURIComponent("Invalid or expired verification token.")}`);
        }

        user.isVerified = true;
        user.verificationToken = null;
        user.verificationTokenExpires = null;
        await user.save();

        console.log(`[Auth Verification] Verified user: ${user.username}`);
        return res.redirect(`${frontendUrl}/verify-email?status=success`);

    } catch (error) {
        console.error("[Auth Verification Error] Details:", error.message);
        return res.redirect(`${frontendUrl}/verify-email?status=error&message=${encodeURIComponent("Internal server error")}`);
    }
});

// 4. RESEND VERIFICATION EMAIL
router.post(
    "/resend-verification",
    createRateLimiter(60 * 1000 * 5, 2), // 2 requests per 5 mins
    validateAllowedFields(["email"]),
    async (req, res) => {
        try {
            const { email } = req.body;
            const trimmedEmail = (email || "").trim().toLowerCase();

            // Safe response to prevent user enumeration
            const safeResponse = {
                success: true,
                message: "If an account exists with this email, we've sent a new verification link."
            };

            if (!isValidEmail(trimmedEmail)) {
                return res.json(safeResponse);
            }

            const user = await User.findOne({ email: trimmedEmail });
            if (!user) {
                return res.json(safeResponse);
            }

            if (user.isVerified) {
                return res.status(400).json({
                    success: false,
                    message: "This email address is already verified."
                });
            }

            // Regenerate verification token
            const rawVerificationToken = generateSecureToken();
            user.verificationToken = hashToken(rawVerificationToken);
            user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
            await user.save();

            const host = req.get("host");
            const protocol = req.protocol;
            const verificationUrl = `${protocol}://${host}/api/auth/verify-email?token=${rawVerificationToken}`;

            await sendEmail({
                to: trimmedEmail,
                subject: "Verify your email address - Nexus",
                text: `Please verify your email address by clicking on the link below:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.`,
                html: `<p>Please verify your email address by clicking the link below:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link will expire in 24 hours.</p>`
            });

            console.log(`[Auth Resend] Verification token resent for: ${user.username}`);
            res.json(safeResponse);

        } catch (error) {
            console.error("[Auth Resend Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

// 5. FORGOT PASSWORD ENDPOINT
router.post(
    "/forgot-password",
    createRateLimiter(60 * 1000 * 15, 3), // 3 requests per 15 mins
    validateAllowedFields(["email"]),
    async (req, res) => {
        try {
            const { email } = req.body;
            const trimmedEmail = (email || "").trim().toLowerCase();

            const safeResponse = {
                success: true,
                message: "If an account exists, we've sent password reset instructions."
            };

            if (!isValidEmail(trimmedEmail)) {
                return res.json(safeResponse);
            }

            const user = await User.findOne({ email: trimmedEmail });
            if (!user) {
                return res.json(safeResponse);
            }

            // Generate reset token (15 mins expiry)
            const rawResetToken = generateSecureToken();
            user.passwordResetToken = hashToken(rawResetToken);
            user.passwordResetExpires = Date.now() + 15 * 60 * 1000;
            await user.save();

            // Send Reset Link to Frontend Client
            const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host").split(":")[0]}:5173`;
            const resetUrl = `${frontendUrl}/reset-password?token=${rawResetToken}`;

            await sendEmail({
                to: trimmedEmail,
                subject: "Reset your password - Nexus",
                text: `You requested a password reset. Please click on the link below to set a new password:\n\n${resetUrl}\n\nThis link is valid for 15 minutes. If you did not request this, please ignore this email.`,
                html: `<p>You requested a password reset. Please click on the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link is valid for 15 minutes.</p><p>If you did not request this, please ignore this email.</p>`
            });

            console.log(`[Auth Forgot] Password reset token generated for: ${user.username}`);
            res.json(safeResponse);

        } catch (error) {
            console.error("[Auth Forgot Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

// 6. RESET PASSWORD ENDPOINT
router.post(
    "/reset-password",
    createRateLimiter(60 * 1000 * 15, 3), // 3 requests per 15 mins
    validateAllowedFields(["token", "password"]),
    async (req, res) => {
        try {
            const { token, password } = req.body;

            if (!token || !password) {
                return res.status(400).json({ success: false, message: "Token and password are required." });
            }

            if (!isValidPassword(password)) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be 8-128 characters long, with at least one uppercase letter, one lowercase letter, one number, and one special character."
                });
            }

            const hashedTokenVal = hashToken(token);
            const user = await User.findOne({
                passwordResetToken: hashedTokenVal,
                passwordResetExpires: { $gt: Date.now() }
            });

            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired password reset token."
                });
            }

            // Hash new password using strict rounds
            const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

            // Invalidate/clear reset token fields
            user.password = hashedPassword;
            user.passwordResetToken = null;
            user.passwordResetExpires = null;
            await user.save();

            // Revoke all active sessions (requirement: "revoke all active sessions after a password reset")
            await Session.deleteMany({ userId: user._id });

            console.log(`[Auth Reset] Password successfully reset and all sessions invalidated for: ${user.username}`);

            res.json({
                success: true,
                message: "Password reset successful. All active sessions have been signed out. Please log in with your new password."
            });

        } catch (error) {
            console.error("[Auth Reset Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

// 7. REFRESH TOKEN ENDPOINT (Rotation and reuse detection)
router.post(
    "/refresh-token",
    validateAllowedFields(["refreshToken"]),
    async (req, res) => {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({ success: false, message: "Refresh token is required." });
            }

            const hashed = hashToken(refreshToken);
            const session = await Session.findOne({ token: hashed });

            if (!session) {
                // If we don't find the token, it could be a malicious reuse. But without the record, we can't find the family.
                return res.status(401).json({ success: false, message: "Invalid session." });
            }

            // REUSE DETECTION: If the session was already revoked, someone is reusing an old token!
            if (session.isRevoked) {
                console.warn(`[Security Alert] Refresh token reuse detected! Revoking family: ${session.familyId}`);
                // Invalidate all tokens in this family immediately to protect the user
                await Session.deleteMany({ familyId: session.familyId });
                return res.status(401).json({ success: false, message: "Session expired due to security alert. Please log in again." });
            }

            // Check expiry
            if (session.expiresAt < Date.now()) {
                await Session.deleteOne({ _id: session._id });
                return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
            }

            // Fetch user
            const user = await User.findById(session.userId);
            if (!user) {
                return res.status(401).json({ success: false, message: "User not found." });
            }

            // Mark current token as revoked (used)
            session.isRevoked = true;
            await session.save();

            // Create a new rotated refresh token in the same family
            const rawNewRefreshToken = generateSecureToken();
            const hashedNewRefreshToken = hashToken(rawNewRefreshToken);
            const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            await Session.create({
                userId: user._id,
                token: hashedNewRefreshToken,
                familyId: session.familyId,
                ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
                userAgent: req.headers["user-agent"] || "unknown",
                expiresAt: newExpiresAt
            });

            // Generate new short-lived access token
            const token = jwt.sign(
                { userId: user._id, username: user.username },
                JWT_SECRET,
                { expiresIn: ACCESS_TOKEN_EXPIRY }
            );

            console.log(`[Auth Rotation] Rotated token for: ${user.username}`);

            res.json({
                success: true,
                token,
                refreshToken: rawNewRefreshToken
            });

        } catch (error) {
            console.error("[Auth Refresh Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

// 8. LOGOUT ENDPOINT
router.post(
    "/logout",
    validateAllowedFields(["refreshToken"]),
    async (req, res) => {
        try {
            const { refreshToken } = req.body;
            if (refreshToken) {
                const hashed = hashToken(refreshToken);
                // Revoke session completely by deleting it or marking it revoked
                await Session.deleteOne({ token: hashed });
            }

            console.log("[Auth Logout] User logged out successfully");
            res.json({
                success: true,
                message: "Logged out successfully"
            });

        } catch (error) {
            console.error("[Auth Logout Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

// Username check endpoint
router.post(
    "/check-username",
    validateAllowedFields(["username"]),
    async (req, res) => {
        try {
            const { username } = req.body;
            const trimmed = (username || "").trim();
            if (!trimmed) {
                return res.status(400).json({ success: false, message: "Username is required" });
            }
            const existingUser = await User.findOne({ 
                username: { $regex: new RegExp(`^${trimmed}$`, "i") } 
            });
            res.json({ reserved: !!existingUser });
        } catch (error) {
            console.error("[Check Username Error] Details:", error.message);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }
);

module.exports = router;