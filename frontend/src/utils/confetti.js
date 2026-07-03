export function triggerConfetti() {
    try {
        const canvas = document.createElement("canvas");
        canvas.style.position = "fixed";
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = "99999";
        document.body.appendChild(canvas);

        const ctx = canvas.getContext("2d");
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resizeCanvas();

        const colors = ["#f43f5e", "#3b82f6", "#10b981", "#fbbf24", "#8b5cf6", "#12c7bd"];
        const particles = [];

        // Spawn particles shooting up from bottom corners
        for (let i = 0; i < 75; i++) {
            // Left corner
            particles.push({
                x: 0,
                y: canvas.height * 0.9,
                vx: Math.random() * 12 + 4,
                vy: -Math.random() * 20 - 10,
                size: Math.random() * 8 + 6,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rSpeed: (Math.random() - 0.5) * 8
            });
            // Right corner
            particles.push({
                x: canvas.width,
                y: canvas.height * 0.9,
                vx: -Math.random() * 12 - 4,
                vy: -Math.random() * 20 - 10,
                size: Math.random() * 8 + 6,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rSpeed: (Math.random() - 0.5) * 8
            });
        }

        function update() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let hasVisibleParticles = false;

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.45; // gravity
                p.vx *= 0.98; // air resistance
                p.rotation += p.rSpeed;

                if (p.y < canvas.height + 50 && p.x > -50 && p.x < canvas.width + 50) {
                    hasVisibleParticles = true;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rotation * Math.PI) / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                    ctx.restore();
                }
            });

            if (hasVisibleParticles) {
                requestAnimationFrame(update);
            } else {
                canvas.remove();
            }
        }

        update();
    } catch (err) {
        console.warn("Confetti animation failed:", err);
    }
}
