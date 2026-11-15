import React, { useEffect, useRef } from 'react';

interface ProceduralCanvasReelProps {
  theme: 'aurora' | 'sunset' | 'kinetic';
  isPlaying: boolean;
  playbackRate: number;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
}

export const ProceduralCanvasReel: React.FC<ProceduralCanvasReelProps> = ({
  theme,
  isPlaying,
  playbackRate,
  currentTime,
  duration,
  onTimeUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeRef = useRef(currentTime);
  const lastTickRef = useRef<number>(performance.now());

  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    lastTickRef.current = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.1, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      if (isPlaying) {
        timeRef.current = (timeRef.current + dt * playbackRate) % duration;
        onTimeUpdate(timeRef.current);
      }

      const t = timeRef.current;
      const w = canvas.width;
      const h = canvas.height;

      if (theme === 'aurora') {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#070b14');
        bg.addColorStop(0.55, '#0f172a');
        bg.addColorStop(1, '#111827');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        for (let band = 0; band < 4; band++) {
          ctx.beginPath();
          const baseY = h * (0.28 + band * 0.13);
          ctx.moveTo(0, baseY);
          for (let x = 0; x <= w; x += 16) {
            const wave =
              Math.sin(x * 0.012 + t * (1.1 + band * 0.25) + band) * 56 +
              Math.cos(x * 0.02 - t * 0.7) * 26;
            ctx.lineTo(x, baseY + wave);
          }
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();

          const grad = ctx.createLinearGradient(0, baseY - 90, 0, baseY + 260);
          if (band % 2 === 0) {
            grad.addColorStop(0, 'rgba(20, 184, 166, 0.34)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
          } else {
            grad.addColorStop(0, 'rgba(56, 189, 248, 0.26)');
            grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
          }
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Subtle drifting stars
        for (let i = 0; i < 36; i++) {
          const sx = ((i * 97 + t * 8) % w + w) % w;
          const sy = (i * 137) % (h * 0.6);
          const alpha = 0.25 + 0.55 * Math.abs(Math.sin(t * 1.4 + i));
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, (i % 3) + 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (theme === 'sunset') {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#1e1024');
        bg.addColorStop(0.45, '#7c2d12');
        bg.addColorStop(0.75, '#ea580c');
        bg.addColorStop(1, '#18181b');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Glowing sun disc
        const sunY = h * 0.44 + Math.sin(t * 0.6) * 18;
        const sunGrad = ctx.createRadialGradient(w / 2, sunY, 16, w / 2, sunY, 165);
        sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
        sunGrad.addColorStop(0.45, 'rgba(251, 146, 60, 0.55)');
        sunGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(w / 2, sunY, 165, 0, Math.PI * 2);
        ctx.fill();

        // Horizon silhouette ridges
        for (let r = 0; r < 3; r++) {
          ctx.beginPath();
          const ridgeY = h * (0.58 + r * 0.09);
          ctx.moveTo(0, ridgeY);
          for (let x = 0; x <= w; x += 20) {
            const offset = Math.sin(x * 0.015 + r * 2.1 + t * 0.25) * 24;
            ctx.lineTo(x, ridgeY + offset);
          }
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.fillStyle = r === 0 ? '#431407' : r === 1 ? '#27120b' : '#120b0d';
          ctx.fill();
        }
      } else {
        // Kinetic minimal studio
        ctx.fillStyle = '#0c0c10';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h * 0.45;
        for (let ring = 1; ring <= 6; ring++) {
          const radius = 38 + ring * 34 + Math.sin(t * 1.8 - ring * 0.6) * 14;
          ctx.strokeStyle =
            ring % 2 === 0
              ? 'rgba(255, 45, 85, 0.35)'
              : 'rgba(244, 244, 245, 0.16)';
          ctx.lineWidth = ring % 2 === 0 ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, t * 0.4 + ring, t * 0.4 + ring + Math.PI * 1.45);
          ctx.stroke();
        }

        // Orbiting light orb
        const angle = t * 1.3;
        const ox = cx + Math.cos(angle) * 120;
        const oy = cy + Math.sin(angle * 1.2) * 145;
        const orb = ctx.createRadialGradient(ox, oy, 2, ox, oy, 64);
        orb.addColorStop(0, 'rgba(255, 45, 85, 0.85)');
        orb.addColorStop(1, 'rgba(255, 45, 85, 0)');
        ctx.fillStyle = orb;
        ctx.beginPath();
        ctx.arc(ox, oy, 64, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isPlaying) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [theme, isPlaying, playbackRate, duration, onTimeUpdate]);

  return (
    <canvas
      ref={canvasRef}
      width={540}
      height={960}
      className="h-full w-full object-cover"
    />
  );
};
