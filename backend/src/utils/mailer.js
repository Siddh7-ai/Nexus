const nodemailer = require("nodemailer");

async function sendEmail({ to, subject, text, html }) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromAddress = process.env.FROM_EMAIL || "no-reply@nexuschat.app";

    if (smtpHost && smtpPort && smtpUser && smtpPass) {
        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: parseInt(smtpPort),
                secure: smtpPort === "465",
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            await transporter.sendMail({
                from: fromAddress,
                to,
                subject,
                text,
                html
            });
            console.log(`[Email Sent] To: ${to}, Subject: ${subject}`);
            return true;
        } catch (err) {
            console.error("[Mailer Error] Failed to send email via SMTP:", err);
            // Fall back to console log to not block local development
        }
    }

    // Fallback console logs for development and local testing
    console.log("\n========================================================");
    console.log(`[MOCK EMAIL SENT]`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Content:\n${text}`);
    if (html) {
        console.log(`HTML Version:\n${html}`);
    }
    console.log("========================================================\n");
    return true;
}

module.exports = {
    sendEmail
};
