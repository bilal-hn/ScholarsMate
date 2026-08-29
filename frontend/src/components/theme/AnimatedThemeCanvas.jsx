import React, { useEffect, useRef } from 'react';

export default function AnimatedThemeCanvas({ theme = 'odysseus' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (theme !== 'blaze' && theme !== 'aurora') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // =========================================================================
    // 1. BLAZE: Rising Fire & Embers Engine
    // =========================================================================
    const emberCount = Math.min(55, Math.floor(width / 25));
    const embers = [];

    const createEmber = (initial = false) => {
      const size = Math.random() * 2.5 + 1.2;
      return {
        x: Math.random() * width,
        y: initial ? Math.random() * height : height + Math.random() * 20,
        size,
        speedY: Math.random() * 1.2 + 0.6,
        speedX: (Math.random() - 0.5) * 0.8,
        opacity: Math.random() * 0.7 + 0.3,
        flicker: Math.random() * 0.05 + 0.01,
        // Color variation between fiery crimson, warm orange, and gold sparks
        colorType: Math.random() > 0.6 ? 'gold' : Math.random() > 0.3 ? 'orange' : 'crimson',
        swayOffset: Math.random() * Math.PI * 2,
        swaySpeed: Math.random() * 0.02 + 0.01,
      };
    };

    if (theme === 'blaze') {
      for (let i = 0; i < emberCount; i++) {
        embers.push(createEmber(true));
      }
    }

    // =========================================================================
    // 2. AURORA: Celestial Starlight Engine
    // =========================================================================
    const starCount = Math.min(65, Math.floor(width / 20));
    const stars = [];

    const createStar = () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.8 + 0.2,
      delta: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
      color: Math.random() > 0.5 ? '#818cf8' : '#38bdf8',
    });

    if (theme === 'aurora') {
      for (let i = 0; i < starCount; i++) {
        stars.push(createStar());
      }
    }

    let frame = 0;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      // Render Blaze Embers
      if (theme === 'blaze') {
        embers.forEach((ember, idx) => {
          ember.y -= ember.speedY;
          ember.x += Math.sin(frame * ember.swaySpeed + ember.swayOffset) * 0.6 + ember.speedX;
          ember.opacity += Math.sin(frame * ember.flicker) * 0.02;
          ember.opacity = Math.max(0.1, Math.min(0.9, ember.opacity));

          // Draw Glowing Ember Particle
          ctx.beginPath();
          ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);

          let fillCol = `rgba(239, 68, 68, ${ember.opacity})`;
          let shadowCol = 'rgba(239, 68, 68, 0.6)';

          if (ember.colorType === 'gold') {
            fillCol = `rgba(251, 191, 36, ${ember.opacity})`;
            shadowCol = 'rgba(245, 158, 11, 0.6)';
          } else if (ember.colorType === 'orange') {
            fillCol = `rgba(249, 115, 22, ${ember.opacity})`;
            shadowCol = 'rgba(234, 88, 12, 0.6)';
          }

          ctx.shadowBlur = 8;
          ctx.shadowColor = shadowCol;
          ctx.fillStyle = fillCol;
          ctx.fill();

          // Reset when particle drifts off the top or sides
          if (ember.y < -10 || ember.x < -20 || ember.x > width + 20) {
            embers[idx] = createEmber(false);
          }
        });
      }

      // Render Aurora Stars
      if (theme === 'aurora') {
        stars.forEach((star) => {
          star.alpha += star.delta;
          if (star.alpha <= 0.1 || star.alpha >= 0.9) {
            star.delta = -star.delta;
          }

          ctx.beginPath();
          ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          ctx.shadowBlur = 6;
          ctx.shadowColor = star.color;
          ctx.fillStyle = star.color;
          ctx.globalAlpha = star.alpha;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  if (theme !== 'blaze' && theme !== 'aurora') {
    return null;
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* Ambient Radial Gradient Overlays for Blaze */}
      {theme === 'blaze' && (
        <>
          {/* Bottom fiery horizon glow */}
          <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-red-600/10 via-orange-600/5 to-transparent pointer-events-none" />
          {/* Subtle top ambient red vignette */}
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
        </>
      )}

      {/* Ambient Gradient Overlays for Aurora */}
      {theme === 'aurora' && (
        <>
          <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-indigo-900/10 via-cyan-900/5 to-transparent pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />
        </>
      )}

      {/* Dynamic Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block opacity-70"
      />
    </div>
  );
}
