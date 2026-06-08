import { useEffect, useRef } from 'react';

// ─── Color palettes ────────────────────────────────────────────────────────────
const WARM = ['#e53935', '#ef6c00', '#f9a825', '#c62828', '#ff8f00', '#d84315'];
const COOL = ['#3949ab', '#5e35b1', '#1e88e5', '#546e7a', '#6d4c41', '#4527a0'];

// ─── Performance detector ───────────────────────────────────────────────────────
function isLowPerf() {
  if (typeof navigator === 'undefined') return false;
  return (navigator.hardwareConcurrency || 4) <= 2;
}

// ─── Single spawned particle ────────────────────────────────────────────────────
class Particle {
  constructor(x, y, isWarm) {
    // Spawn near cursor with slight spread
    this.x = x + (Math.random() - 0.5) * 10;
    this.y = y + (Math.random() - 0.5) * 10;

    // Launch in random direction with varied speed
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - Math.random() * 1.5;

    this.life = 1.0;
    this.decay = 0.0015 + Math.random() * 0.003;

    this.size = Math.random() * 1.5 + 0.7;
    this.dashLen = this.size * (2.5 + Math.random() * 3.5);

    this.color = isWarm
      ? WARM[Math.floor(Math.random() * WARM.length)]
      : COOL[Math.floor(Math.random() * COOL.length)];

    this.dashAngle = Math.random() * Math.PI;
    this.rotSpeed = (Math.random() - 0.5) * 0.022;
    this.gravity = 0.004 + Math.random() * 0.006;
  }

  update() {
    // Gravity
    this.vy += this.gravity;
    // Air resistance
    this.vx *= 0.992;
    this.vy *= 0.992;
    this.x += this.vx;
    this.y += this.vy;

    // Align angle to velocity when moving, slow rotate when settling
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > 0.35) {
      this.dashAngle = Math.atan2(this.vy, this.vx);
    } else {
      this.dashAngle += this.rotSpeed;
    }

    this.life -= this.decay;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    const half = this.dashLen / 2;
    const cos = Math.cos(this.dashAngle);
    const sin = Math.sin(this.dashAngle);

    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life) * 0.92;
    ctx.lineCap = 'round';
    ctx.lineWidth = this.size;
    ctx.strokeStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.x - cos * half, this.y - sin * half);
    ctx.lineTo(this.x + cos * half, this.y + sin * half);
    ctx.stroke();
    ctx.restore();
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Skip on touch-only devices
    if ('ontouchstart' in window && navigator.maxTouchPoints > 0) return;

    const ctx = canvas.getContext('2d');
    const low = isLowPerf();
    const MAX_PARTICLES = low ? 900 : 1800;

    let particles = [];
    let mouse = { x: -999, y: -999 };
    let lastMouse = { x: -999, y: -999 };
    let frameId;
    let idleTime = 0;

    // ── Resize handler ──────────────────────────────────────────────────────────
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // ── Spawn particles along cursor path ───────────────────────────────────────
    const spawnAlongPath = (x, y, speed) => {
      const count = Math.floor(speed * 1.6 + 2);
      const capped = Math.min(count, low ? 8 : 14);
      for (let i = 0; i < capped; i++) {
        // ~60% warm near cursor center, ~40% cool scattered
        const isWarm = Math.random() < 0.58;
        particles.push(new Particle(x, y, isWarm));
      }
    };

    // ── Mouse events ────────────────────────────────────────────────────────────
    const onMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const onMouseLeave = () => {
      mouse.x = -999;
      mouse.y = -999;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);

    // ── RAF loop ─────────────────────────────────────────────────────────────────
    const loop = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);

      // Spawn particles if mouse moved
      if (mouse.x > 0 && mouse.y > 0 && lastMouse.x > 0) {
        const dx = mouse.x - lastMouse.x;
        const dy = mouse.y - lastMouse.y;
        const speed = Math.sqrt(dx * dx + dy * dy);

        if (speed > 1.5) {
          idleTime = 0;

          const steps = Math.ceil(speed / 7);

          for (let s = 0; s <= steps; s++) {
            const t = s / steps;

            spawnAlongPath(
              lastMouse.x + dx * t,
              lastMouse.y + dy * t,
              speed / steps
            );
          }
        } else {
          idleTime++;

          // Spawn slow particles while cursor is stationary
          if (idleTime % 6 === 0) {
            for (let i = 0; i < 2; i++) {
              particles.push(
                new Particle(
                  mouse.x + (Math.random() - 0.5) * 20,
                  mouse.y + (Math.random() - 0.5) * 20,
                  Math.random() < 0.58
                )
              );
            }
          }
        }
      }

      // Update & draw all particles
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw(ctx);
        if (particles[i].life <= 0) particles.splice(i, 1);
      }

      // Hard cap to keep perf smooth
      if (particles.length > MAX_PARTICLES) {
        particles.splice(0, particles.length - MAX_PARTICLES);
      }

      lastMouse.x = mouse.x;
      lastMouse.y = mouse.y;

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}