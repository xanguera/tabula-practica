// ---------- Confetti simples em canvas, sem dependências ----------

const COLORS = ['#ff5c8d', '#ffd65c', '#3ddc84', '#4fc3ff', '#7b4fff', '#ff914d'];

function getCanvas() {
  let canvas = document.getElementById('confetti-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);
  }
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  return canvas;
}

let activeAnimation = null;

export function celebrate(intensity = 'stage') {
  const canvas = getCanvas();
  const ctx2d = canvas.getContext('2d');
  const count = intensity === 'grand' ? 220 : intensity === 'world' ? 140 : 70;
  const duration = intensity === 'grand' ? 4200 : 2600;

  const particles = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.5,
      size: 6 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      speedY: 2 + Math.random() * 3.5,
      speedX: -2 + Math.random() * 4,
      rotation: Math.random() * 360,
      spin: -8 + Math.random() * 16,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }

  const start = performance.now();
  if (activeAnimation) cancelAnimationFrame(activeAnimation);

  function frame(now) {
    const elapsed = now - start;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rotation += p.spin;
      ctx2d.save();
      ctx2d.translate(p.x, p.y);
      ctx2d.rotate((p.rotation * Math.PI) / 180);
      ctx2d.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx2d.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx2d.beginPath();
        ctx2d.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx2d.fill();
      }
      ctx2d.restore();
    });

    if (elapsed < duration) {
      activeAnimation = requestAnimationFrame(frame);
    } else {
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      activeAnimation = null;
    }
  }
  activeAnimation = requestAnimationFrame(frame);
}
