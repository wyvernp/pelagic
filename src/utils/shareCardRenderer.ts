/**
 * Canvas 2D renderer for share cards.
 * Produces a final PNG/JPEG Blob at full resolution by drawing photos
 * and overlays onto an OffscreenCanvas.
 */

import type { ShareCardConfig, PhotoSlotState, CardThemeColors, OverlayConfig } from '../types/shareCard';
import { CARD_THEMES } from './shareCardPresets';

// ── Helpers ──

/** Load an image from a data URL or file URL. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load image: ${e}`));
    img.src = src;
  });
}

/** Format seconds to MM:SS or H:MM:SS */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format a date string nicely */
function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** Round to 1 decimal */
function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

// ── Draw Helpers ──

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draw a pill-shaped tag */
function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  fontSize: number,
  colors: CardThemeColors,
): number {
  ctx.font = `500 ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const paddingH = fontSize * 0.7;
  const paddingV = fontSize * 0.35;
  const w = metrics.width + paddingH * 2;
  const h = fontSize + paddingV * 2;
  const r = h / 2;

  // Tag background
  ctx.fillStyle = colors.tagBg;
  drawRoundedRect(ctx, x, y, w, h, r);
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 0.75;
  drawRoundedRect(ctx, x, y, w, h, r);
  ctx.stroke();

  ctx.fillStyle = colors.tagText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + paddingH, y + h / 2);

  return w;
}

/** Draw a mini dive profile chart */
function drawDiveProfile(
  ctx: CanvasRenderingContext2D,
  samples: { time: number; depth: number }[],
  x: number, y: number, w: number, h: number,
  colors: CardThemeColors,
) {
  if (samples.length < 2) return;

  const maxTime = samples[samples.length - 1].time;
  const maxDepth = Math.max(...samples.map(s => s.depth)) * 1.1;

  // Background area
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  drawRoundedRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 0.75;
  drawRoundedRect(ctx, x, y, w, h, 10);
  ctx.stroke();

  // Profile line
  ctx.beginPath();
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';

  const padX = 10;
  const padY = 10;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  for (let i = 0; i < samples.length; i++) {
    const sx = x + padX + (samples[i].time / maxTime) * innerW;
    const sy = y + padY + (samples[i].depth / maxDepth) * innerH;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();

  // Fill area under the line
  const lastSample = samples[samples.length - 1];
  ctx.lineTo(x + padX + (lastSample.time / maxTime) * innerW, y + padY + innerH);
  ctx.lineTo(x + padX, y + padY + innerH);
  ctx.closePath();
  ctx.fillStyle = colors.accent.replace(')', ', 0.15)').replace('rgb(', 'rgba(').replace('#', '');
  // Use a simpler approach for alpha fill
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = colors.accent;
  ctx.fill();
  ctx.globalAlpha = 1.0;
}

// ── Photo Drawing ──

/**
 * Draw a photo into a rectangular area of the canvas, using croppedAreaPixels
 * for non-destructive framing.
 */
async function drawPhotoSlot(
  ctx: CanvasRenderingContext2D,
  slot: PhotoSlotState,
  dx: number, dy: number, dw: number, dh: number,
  gap: number,
) {
  if (!slot.dataUrl) return;
  const img = await loadImage(slot.dataUrl);

  // Save state and clip to the slot region (with gap inset)
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx + gap, dy + gap, dw - gap * 2, dh - gap * 2);
  ctx.clip();

  if (slot.croppedAreaPixels) {
    // Use the exact cropped region from react-easy-crop
    const { x, y, width, height } = slot.croppedAreaPixels;
    ctx.drawImage(
      img,
      x, y, width, height,     // Source rect
      dx + gap, dy + gap,       // Dest position
      dw - gap * 2, dh - gap * 2, // Dest size
    );
  } else {
    // Fallback: cover the slot area (center-crop)
    const imgAspect = img.width / img.height;
    const slotAspect = (dw - gap * 2) / (dh - gap * 2);
    let sx = 0, sy = 0, sw = img.width, sh = img.height;

    if (imgAspect > slotAspect) {
      // Image wider than slot — crop sides
      sw = img.height * slotAspect;
      sx = (img.width - sw) / 2;
    } else {
      // Image taller than slot — crop top/bottom
      sh = img.width / slotAspect;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(
      img,
      sx, sy, sw, sh,
      dx + gap, dy + gap, dw - gap * 2, dh - gap * 2,
    );
  }

  ctx.restore();
}

// ── Overlay Drawing ──

/** Vector icon paths drawn at a given size */
function drawIcon(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number, y: number, size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 24; // Icons designed at 24x24
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (type) {
    case 'location':
      ctx.beginPath();
      ctx.arc(12, 10, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 2);
      ctx.arc(12, 10, 8, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.lineTo(12, 22);
      ctx.arc(12, 10, 8, Math.PI * 0.15, Math.PI * 0.85);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'calendar':
      ctx.beginPath();
      ctx.moveTo(4, 6); ctx.lineTo(20, 6); ctx.lineTo(20, 20);
      ctx.lineTo(4, 20); ctx.closePath(); ctx.stroke();
      ctx.moveTo(4, 10); ctx.lineTo(20, 10); ctx.stroke();
      ctx.moveTo(8, 3); ctx.lineTo(8, 7); ctx.stroke();
      ctx.moveTo(16, 3); ctx.lineTo(16, 7); ctx.stroke();
      break;
    case 'hash':
      ctx.beginPath();
      ctx.moveTo(4, 9); ctx.lineTo(20, 9); ctx.stroke();
      ctx.moveTo(4, 15); ctx.lineTo(20, 15); ctx.stroke();
      ctx.moveTo(10, 4); ctx.lineTo(8, 20); ctx.stroke();
      ctx.moveTo(16, 4); ctx.lineTo(14, 20); ctx.stroke();
      break;
    case 'depth':
      ctx.beginPath();
      ctx.moveTo(12, 4); ctx.lineTo(12, 20); ctx.stroke();
      ctx.moveTo(7, 15); ctx.lineTo(12, 20); ctx.lineTo(17, 15); ctx.stroke();
      ctx.moveTo(5, 4); ctx.lineTo(19, 4); ctx.stroke();
      break;
    case 'clock':
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(12, 7); ctx.lineTo(12, 12); ctx.lineTo(16, 14); ctx.stroke();
      break;
    case 'temp':
      ctx.beginPath();
      ctx.moveTo(12, 4); ctx.lineTo(12, 14); ctx.stroke();
      ctx.arc(12, 17, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.moveTo(9, 4); ctx.arc(12, 4, 3, Math.PI, 0); ctx.lineTo(15, 14); ctx.stroke();
      ctx.moveTo(9, 4); ctx.lineTo(9, 14); ctx.stroke();
      break;
    case 'dive':
      // Mask-like icon
      ctx.beginPath();
      ctx.moveTo(3, 10); ctx.quadraticCurveTo(3, 6, 7, 6);
      ctx.lineTo(10, 6); ctx.quadraticCurveTo(12, 8, 14, 6);
      ctx.lineTo(17, 6); ctx.quadraticCurveTo(21, 6, 21, 10);
      ctx.quadraticCurveTo(21, 15, 17, 15); ctx.lineTo(14, 15);
      ctx.quadraticCurveTo(12, 13, 10, 15); ctx.lineTo(7, 15);
      ctx.quadraticCurveTo(3, 15, 3, 10); ctx.closePath(); ctx.stroke();
      break;
    case 'species':
      // Simple fish
      ctx.beginPath();
      ctx.moveTo(20, 12);
      ctx.quadraticCurveTo(16, 5, 8, 6);
      ctx.quadraticCurveTo(3, 7, 3, 12);
      ctx.quadraticCurveTo(3, 17, 8, 18);
      ctx.quadraticCurveTo(16, 19, 20, 12);
      ctx.closePath(); ctx.stroke();
      // Tail
      ctx.moveTo(20, 12); ctx.lineTo(23, 8); ctx.stroke();
      ctx.moveTo(20, 12); ctx.lineTo(23, 16); ctx.stroke();
      // Eye
      ctx.beginPath(); ctx.arc(8, 11, 1.2, 0, Math.PI * 2); ctx.fill();
      break;
    default:
      break;
  }
  ctx.restore();
}

interface StatChip {
  icon: string;
  label: string;
  value: string;
}

function collectOverlayData(config: ShareCardConfig): {
  headline: string;
  subline: string;
  chips: StatChip[];
} {
  const { overlay, diveData, tripData } = config;
  let headline = '';
  let subline = '';
  const chips: StatChip[] = [];

  if (config.shareType === 'trip' && tripData) {
    if (tripData.name) headline = tripData.name;
    if (overlay.showLocation && tripData.location) {
      subline = tripData.location;
    }
    if (overlay.showDate && tripData.dateStart) {
      const start = formatDate(tripData.dateStart);
      const end = tripData.dateEnd ? formatDate(tripData.dateEnd) : '';
      const dateStr = end ? `${start} – ${end}` : start;
      if (subline) subline += `  ·  ${dateStr}`;
      else subline = dateStr;
    }
    if (tripData.diveCount != null) {
      chips.push({ icon: 'dive', label: 'Dives', value: String(tripData.diveCount) });
    }
    if (tripData.totalUnderwaterSeconds != null) {
      chips.push({ icon: 'clock', label: 'Total', value: formatDuration(tripData.totalUnderwaterSeconds) });
    }
    if (overlay.showDepth && tripData.deepestDiveM != null) {
      chips.push({ icon: 'depth', label: 'Deepest', value: `${round1(tripData.deepestDiveM)}m` });
    }
    if (overlay.showSpeciesTags && tripData.speciesCount != null && tripData.speciesCount > 0) {
      chips.push({ icon: 'species', label: 'Species', value: String(tripData.speciesCount) });
    }
  } else if (diveData) {
    // Headline: location
    if (overlay.showLocation) {
      headline = diveData.siteName || diveData.location || '';
    }
    // Subline: date + dive number
    const parts: string[] = [];
    if (overlay.showDate && diveData.date) {
      const d = formatDate(diveData.date);
      const t = diveData.time ? diveData.time.slice(0, 5) : '';
      parts.push(t ? `${d}  ·  ${t}` : d);
    }
    if (overlay.showDiveNumber && diveData.diveNumber != null) {
      parts.push(`Dive #${diveData.diveNumber}`);
    }
    subline = parts.join('  ·  ');

    // Stat chips
    if (overlay.showDepth && diveData.maxDepthM != null) {
      chips.push({ icon: 'depth', label: 'Depth', value: `${round1(diveData.maxDepthM)}m` });
    }
    if (overlay.showDuration && diveData.durationSeconds != null) {
      chips.push({ icon: 'clock', label: 'Time', value: formatDuration(diveData.durationSeconds) });
    }
    if (overlay.showTemp && diveData.waterTempC != null) {
      chips.push({ icon: 'temp', label: 'Temp', value: `${round1(diveData.waterTempC)}°C` });
    }
  }

  return { headline, subline, chips };
}

function drawOverlayStats(
  ctx: CanvasRenderingContext2D,
  config: ShareCardConfig,
  colors: CardThemeColors,
  cardW: number,
  cardH: number,
  infoPanel?: { x: number; y: number; width: number; height: number },
) {
  const data = collectOverlayData(config);
  const hasContent = data.headline || data.subline || data.chips.length > 0 ||
    config.overlay.customText ||
    (config.overlay.showSpeciesTags && config.speciesTags?.length) ||
    (config.overlay.showGeneralTags && config.generalTags?.length);
  if (!hasContent) return;

  const scale = cardW / 1080;
  const pad = Math.round(28 * scale);
  const headlineSize = Math.round(32 * scale);
  const sublineSize = Math.round(18 * scale);
  const chipFontSize = Math.round(17 * scale);
  const chipH = Math.round(34 * scale);
  const chipRadius = chipH / 2;
  const chipIconSize = Math.round(16 * scale);
  const chipGap = Math.round(8 * scale);
  const tagFontSize = Math.round(15 * scale);
  const sectionGap = Math.round(12 * scale);

  if (infoPanel) {
    // ── Dedicated info panel ──
    const px = infoPanel.x * cardW;
    const py = infoPanel.y * cardH;
    const pw = infoPanel.width * cardW;
    const ph = infoPanel.height * cardH;

    ctx.fillStyle = colors.overlayBg;
    ctx.fillRect(px, py, pw, ph);

    let curY = py + pad;

    // Headline
    if (data.headline) {
      ctx.font = `700 ${headlineSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = colors.textPrimary;
      ctx.textBaseline = 'top';
      ctx.fillText(data.headline, px + pad, curY, pw - pad * 2);
      curY += headlineSize + Math.round(6 * scale);
    }
    // Subline
    if (data.subline) {
      ctx.font = `400 ${sublineSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = colors.textSecondary;
      ctx.fillText(data.subline, px + pad, curY, pw - pad * 2);
      curY += sublineSize + sectionGap;
    }

    // Accent line
    if (data.headline || data.subline) {
      ctx.fillStyle = colors.accent;
      ctx.fillRect(px + pad, curY, Math.round(40 * scale), Math.round(3 * scale));
      curY += Math.round(3 * scale) + sectionGap;
    }

    // Stat chips
    if (data.chips.length > 0) {
      curY = drawStatChips(ctx, data.chips, px + pad, curY, pw - pad * 2, chipH, chipRadius, chipFontSize, chipIconSize, chipGap, colors, scale);
      curY += sectionGap;
    }

    // Tags
    drawTagRow(ctx, config, colors, px + pad, curY, pw - pad * 2, tagFontSize);
    curY += (config.speciesTags?.length || config.generalTags?.length) ? Math.round(28 * scale) : 0;

    // Custom text
    if (config.overlay.customText) {
      ctx.font = `italic 400 ${Math.round(18 * scale)}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = colors.textSecondary;
      ctx.fillText(`"${config.overlay.customText}"`, px + pad, curY, pw - pad * 2);
    }

    // Dive profile
    if (config.overlay.showDiveProfile && config.diveSamples && config.diveSamples.length > 1) {
      const profileH = Math.round(80 * scale);
      drawDiveProfile(ctx, config.diveSamples, px + pad, py + ph - profileH - pad, pw - pad * 2, profileH, colors);
    }
  } else {
    // ── Bottom overlay with glass panel ──

    // Measure content height
    let contentH = pad * 2;
    if (data.headline) contentH += headlineSize + Math.round(6 * scale);
    if (data.subline) contentH += sublineSize + sectionGap;
    if (data.headline || data.subline) contentH += Math.round(3 * scale) + sectionGap; // accent line
    if (data.chips.length > 0) contentH += chipH + sectionGap;
    const hasTagRow = (config.overlay.showSpeciesTags && config.speciesTags?.length) ||
                      (config.overlay.showGeneralTags && config.generalTags?.length);
    if (hasTagRow) contentH += Math.round(28 * scale) + sectionGap;
    if (config.overlay.customText) contentH += Math.round(24 * scale) + sectionGap;
    if (config.overlay.showDiveProfile && config.diveSamples?.length) contentH += Math.round(80 * scale) + sectionGap;

    const panelMargin = Math.round(16 * scale);
    const panelW = cardW - panelMargin * 2;
    const panelX = panelMargin;
    const panelY = cardH - contentH - panelMargin;
    const panelR = Math.round(16 * scale);

    // Gradient fade above panel for blending
    const fadeH = Math.round(60 * scale);
    const fadeGrad = ctx.createLinearGradient(0, panelY - fadeH, 0, panelY);
    fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    fadeGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, panelY - fadeH, cardW, fadeH);

    // Glass panel background
    ctx.save();
    drawRoundedRect(ctx, panelX, panelY, panelW, contentH, panelR);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    // Subtle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    let curY = panelY + pad;
    const textX = panelX + pad;
    const textMaxW = panelW - pad * 2;

    // Headline
    if (data.headline) {
      ctx.font = `700 ${headlineSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(data.headline, textX, curY, textMaxW);
      curY += headlineSize + Math.round(6 * scale);
    }

    // Subline
    if (data.subline) {
      ctx.font = `400 ${sublineSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fillText(data.subline, textX, curY, textMaxW);
      curY += sublineSize + sectionGap;
    }

    // Accent line
    if (data.headline || data.subline) {
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 0.8;
      drawRoundedRect(ctx, textX, curY, Math.round(44 * scale), Math.round(3 * scale), 1.5);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      curY += Math.round(3 * scale) + sectionGap;
    }

    // Stat chips
    if (data.chips.length > 0) {
      curY = drawStatChips(ctx, data.chips, textX, curY, textMaxW, chipH, chipRadius, chipFontSize, chipIconSize, chipGap, colors, scale);
      curY += sectionGap;
    }

    // Tags
    if (hasTagRow) {
      drawTagRow(ctx, config, colors, textX, curY, textMaxW, tagFontSize);
      curY += Math.round(28 * scale) + sectionGap;
    }

    // Custom text
    if (config.overlay.customText) {
      ctx.font = `italic 400 ${Math.round(18 * scale)}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.textBaseline = 'top';
      ctx.fillText(`"${config.overlay.customText}"`, textX, curY, textMaxW);
      curY += Math.round(24 * scale) + sectionGap;
    }

    // Dive profile
    if (config.overlay.showDiveProfile && config.diveSamples && config.diveSamples.length > 1) {
      const chartH = Math.round(80 * scale);
      drawDiveProfile(ctx, config.diveSamples, textX, curY, textMaxW, chartH, colors);
    }
  }
}

/** Draw a horizontal row of stat chips, returns the Y after the row */
function drawStatChips(
  ctx: CanvasRenderingContext2D,
  chips: StatChip[],
  x: number, y: number, _maxW: number,
  chipH: number, chipR: number,
  fontSize: number, iconSize: number, gap: number,
  colors: CardThemeColors,
  scale: number,
): number {
  let curX = x;
  const chipPadH = Math.round(12 * scale);
  const iconMargin = Math.round(6 * scale);

  for (const chip of chips) {
    // Measure text
    ctx.font = `600 ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
    const valueW = ctx.measureText(chip.value).width;
    ctx.font = `400 ${Math.round(fontSize * 0.85)}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
    const labelW = ctx.measureText(chip.label).width;
    const totalTextW = labelW + Math.round(4 * scale) + valueW;
    const chipW = chipPadH + iconSize + iconMargin + totalTextW + chipPadH;

    // Chip background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    drawRoundedRect(ctx, curX, y, chipW, chipH, chipR);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 0.75;
    drawRoundedRect(ctx, curX, y, chipW, chipH, chipR);
    ctx.stroke();

    // Icon
    const iconY = y + (chipH - iconSize) / 2;
    drawIcon(ctx, chip.icon, curX + chipPadH, iconY, iconSize, colors.accent);

    // Label + value
    const textY = y + chipH / 2;
    const textStartX = curX + chipPadH + iconSize + iconMargin;
    ctx.textBaseline = 'middle';

    ctx.font = `400 ${Math.round(fontSize * 0.85)}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(chip.label, textStartX, textY);

    ctx.font = `600 ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(chip.value, textStartX + labelW + Math.round(4 * scale), textY);

    curX += chipW + gap;
  }

  return y + chipH;
}

function drawTagRow(
  ctx: CanvasRenderingContext2D,
  config: ShareCardConfig,
  colors: CardThemeColors,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
) {
  let curX = x;
  const gap = fontSize * 0.4;
  const allTags: string[] = [];

  if (config.overlay.showSpeciesTags && config.speciesTags) {
    allTags.push(...config.speciesTags.slice(0, 6));
  }
  if (config.overlay.showGeneralTags && config.generalTags) {
    allTags.push(...config.generalTags.slice(0, 4));
  }

  for (const tag of allTags) {
    if (curX - x > maxWidth - 60) break;
    const w = drawTag(ctx, tag, curX, y, fontSize, colors);
    curX += w + gap;
  }
}

/** Draw optional watermark in bottom-right */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  cardW: number,
  cardH: number,
  scale: number,
) {
  const fontSize = Math.round(13 * scale);
  const px = Math.round(14 * scale);
  const py = Math.round(10 * scale);
  const mx = cardW - Math.round(12 * scale);
  const my = cardH - Math.round(8 * scale);

  ctx.font = `600 ${fontSize}px 'Inter', 'Segoe UI', system-ui, sans-serif`;
  const text = 'PELAGIC';
  const tw = ctx.measureText(text).width;
  const bw = tw + px * 2;
  const bh = fontSize + py * 2;

  // Small pill background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  drawRoundedRect(ctx, mx - bw, my - bh, bw, bh, bh / 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.letterSpacing = `${Math.round(2 * scale)}px`;
  ctx.fillText(text, mx - bw / 2, my - bh / 2);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left'; // Reset
}

// ── Main Render Function ──

export interface RenderResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Render a share card to a Blob and data URL.
 * @param config - Full share card configuration with loaded photo data URLs
 * @param format - Output format ('png' or 'jpeg')
 * @param quality - JPEG quality (0–1), ignored for PNG
 */
export async function renderShareCard(
  config: ShareCardConfig,
  format: 'png' | 'jpeg' = 'jpeg',
  quality: number = 0.92,
): Promise<RenderResult> {
  const { preset, layout, slots, theme, overlay } = config;
  const { width: cardW, height: cardH } = preset;
  const colors = CARD_THEMES[theme];
  const scale = cardW / 1080;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = cardW;
  canvas.height = cardH;
  const ctx = canvas.getContext('2d')!;

  // Fill background
  ctx.fillStyle = colors.cardBg;
  ctx.fillRect(0, 0, cardW, cardH);

  // Gap between photo slots in pixels
  const gapPx = Math.round(cardW * 0.005);

  // Draw each photo slot
  const photoPromises = layout.slots.map(async (layoutSlot, i) => {
    const slot = slots[i];
    if (!slot) return;

    const dx = Math.round(layoutSlot.x * cardW);
    const dy = Math.round(layoutSlot.y * cardH);
    const dw = Math.round(layoutSlot.width * cardW);
    const dh = Math.round(layoutSlot.height * cardH);

    await drawPhotoSlot(ctx, slot, dx, dy, dw, dh, gapPx);
  });

  await Promise.all(photoPromises);

  // Draw overlay stats
  const hasOverlay = anyOverlayEnabled(overlay) || overlay.customText;
  if (hasOverlay) {
    drawOverlayStats(
      ctx,
      config,
      colors,
      cardW,
      cardH,
      layout.hasInfoPanel ? layout.infoPanel : undefined,
    );
  }

  // Watermark
  if (overlay.showWatermark) {
    drawWatermark(ctx, cardW, cardH, scale);
  }

  // Export
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, quality);

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b!),
      mimeType,
      quality,
    );
  });

  return { blob, dataUrl, width: cardW, height: cardH };
}

/**
 * Render a low-resolution preview for the live preview pane.
 * Uses the same pipeline but at quarter resolution for speed.
 */
export async function renderShareCardPreview(
  config: ShareCardConfig,
): Promise<string> {
  const previewScale = 0.35;
  const previewConfig: ShareCardConfig = {
    ...config,
    preset: {
      ...config.preset,
      width: Math.round(config.preset.width * previewScale),
      height: Math.round(config.preset.height * previewScale),
    },
  };
  const result = await renderShareCard(previewConfig, 'jpeg', 0.75);
  return result.dataUrl;
}

/** Check if any overlay is enabled */
function anyOverlayEnabled(overlay: OverlayConfig): boolean {
  return (
    overlay.showLocation ||
    overlay.showDate ||
    overlay.showDepth ||
    overlay.showDuration ||
    overlay.showTemp ||
    overlay.showDiveNumber ||
    overlay.showSpeciesTags ||
    overlay.showGeneralTags ||
    overlay.showDiveProfile
  );
}
