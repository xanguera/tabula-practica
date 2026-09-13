// ---------- Relatório partilhável (imagem + texto) ----------
import { getAvatar, TABLE_STATUS_LABELS } from './data.js';

const STATUS_COLORS = { forte: '#3ddc84', media: '#ffd65c', fraca: '#ff5c8d' };

function formatDate(dateISO) {
  return new Date(dateISO).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} s`;
  return `${min} min ${sec}s`;
}

export function buildShareText(profile, record) {
  const lines = [];
  lines.push(`📋 Relatório da Tabuada — ${profile.name}`);
  lines.push(formatDate(record.dateISO));
  lines.push('');
  lines.push(`Pontuação: ${record.score}/100 — ${record.level.emoji} ${record.level.label}`);
  lines.push(`Acertos: ${record.correctCount} de ${record.total}`);
  lines.push('');
  if (record.strong.length) {
    lines.push(`✅ Pontos fortes: tabuada do ${record.strong.join(', do ')}`);
  }
  if (record.weak.length) {
    lines.push(`📌 A praticar: tabuada do ${record.weak.join(', do ')}`);
  }
  lines.push('');
  lines.push('Gerado em Tabuada Divertida 🦄');
  return lines.join('\n');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderReportCanvas(profile, record) {
  const width = 800;
  const cols = 5;
  const rows = Math.ceil(record.tableStats.length / cols);
  const gridTop = 700;
  const cellW = 140;
  const cellH = 96;
  const footerLines = (record.strong.length ? 1 : 0) + (record.weak.length ? 1 : 0);
  const height = gridTop + rows * cellH + 60 + footerLines * 42 + 60;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#3a1c73');
  grad.addColorStop(1, '#1a0f38');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 42px system-ui, -apple-system, sans-serif';
  ctx.fillText('Tabuada Divertida', width / 2, 80);

  ctx.font = '400 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Relatório de Avaliação', width / 2, 116);

  const avatar = getAvatar(profile.avatar);
  ctx.font = '80px system-ui, -apple-system, sans-serif';
  ctx.fillText(avatar.emoji, width / 2, 220);

  ctx.font = '700 34px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(profile.name, width / 2, 268);

  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(formatDate(record.dateISO), width / 2, 298);

  ctx.beginPath();
  ctx.arc(width / 2, 430, 108, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.font = '700 76px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffd65c';
  ctx.fillText(String(record.score), width / 2, 452);
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('PONTOS', width / 2, 484);

  ctx.font = '700 32px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${record.level.emoji} ${record.level.label}`, width / 2, 585);

  ctx.font = '22px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`${record.correctCount} de ${record.total} respostas certas`, width / 2, 618);

  const gridWidth = cols * cellW;
  const startX = (width - gridWidth) / 2;
  record.tableStats.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = startX + col * cellW + cellW / 2;
    const cy = gridTop + row * cellH;
    const color = STATUS_COLORS[t.status];

    roundRect(ctx, cx - cellW / 2 + 8, cy - 8, cellW - 16, cellH - 16, 16);
    ctx.fillStyle = color + '26';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color + '80';
    ctx.stroke();

    ctx.font = '700 28px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`× ${t.table}`, cx, cy + 26);
    ctx.font = '600 17px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(TABLE_STATUS_LABELS[t.status], cx, cy + 52);
  });

  let ty = gridTop + rows * cellH + 44;
  ctx.textAlign = 'left';
  ctx.font = '600 23px system-ui, -apple-system, sans-serif';
  if (record.strong.length) {
    ctx.fillStyle = '#3ddc84';
    ctx.fillText(`✅ Pontos fortes: tabuada do ${record.strong.join(', ')}`, 50, ty);
    ty += 42;
  }
  if (record.weak.length) {
    ctx.fillStyle = '#ff5c8d';
    ctx.fillText(`📌 A praticar: tabuada do ${record.weak.join(', ')}`, 50, ty);
  }

  return canvas;
}

export async function shareReport(profile, record) {
  const text = buildShareText(profile, record);

  let blob = null;
  try {
    const canvas = renderReportCanvas(profile, record);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } catch (e) {
    blob = null;
  }

  const fileName = `tabuada-relatorio-${profile.name.replace(/\s+/g, '-')}-${record.dateISO.slice(0, 10)}.png`;

  if (blob && navigator.canShare && navigator.share) {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: 'Relatório da Tabuada', text, files: [file] });
        return { method: 'share-file' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { method: 'cancelled' };
      }
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Relatório da Tabuada', text });
      return { method: 'share-text' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { method: 'cancelled' };
    }
  }

  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  try {
    await navigator.clipboard.writeText(text);
    return { method: blob ? 'download+clipboard' : 'clipboard' };
  } catch (e) {
    return { method: blob ? 'download' : 'none' };
  }
}
