const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "mysecretkey";

router.post("/register", async (req, res) => {

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

        const existingEmail = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, "i") } });
        if (existingEmail) {
            return res.status(400).json({
                message: "Email already registered"
            });
        }

        const existingUsername = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, "i") } });
        if (existingUsername) {
            return res.status(400).json({
                message: "Username already taken"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            username,
            email,
            password: hashedPassword,
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

        res.status(201).json({
            message: "User registered successfully",
            user
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" });
    }

});

router.post("/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        // Support login by email (case-insensitive) or username (case-sensitive)
        let user;
        if (email.includes("@")) {
            user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, "i") } });
        } else {
            // Case-sensitive exact match for username
            user = await User.findOne({ username: email });
        }

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid Password" });
        }

        // ✅ username now included in JWT payload
        const token = jwt.sign(
            {
                userId: user._id,
                username: user.username
            },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            username: user.username,
            email: user.email
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error", error: error.message, stack: error.stack });
    }

});

router.post("/check-username", async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ message: "Username is required" });
        }
        const existingUser = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });
        res.json({ reserved: !!existingUser });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;