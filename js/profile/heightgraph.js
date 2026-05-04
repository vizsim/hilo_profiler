const PADDING = { top: 16, right: 12, bottom: 24, left: 42 };
const HEIGHTGRAPH_COLORS = {
  backgroundTop: '#f4fbff',
  backgroundBottom: '#dfeff7',
  grid: 'rgba(48, 84, 104, 0.12)',
  axisText: '#466072',
  areaTop: 'rgba(16, 185, 129, 0.42)',
  areaBottom: 'rgba(37, 99, 235, 0.08)',
  line: '#0f766e',
  hoverLine: 'rgba(37, 99, 235, 0.45)',
  hoverPoint: '#2563eb',
};

export function renderHeightgraph(profileData, hoverSampleIndex = null) {
  const canvas = document.getElementById('heightgraph-canvas');
  const context = canvas.getContext('2d');
  const devicePixelRatio = window.devicePixelRatio || 1;
  const cssWidth = Math.max(280, canvas.clientWidth || 280);
  const cssHeight = 220;

  canvas.width = Math.floor(cssWidth * devicePixelRatio);
  canvas.height = Math.floor(cssHeight * devicePixelRatio);
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const graphWidth = cssWidth - PADDING.left - PADDING.right;
  const graphHeight = cssHeight - PADDING.top - PADDING.bottom;
  const elevations = profileData.elevations.filter((value) => Number.isFinite(value));

  if (elevations.length < 2) {
    drawEmptyState(context, cssWidth, cssHeight);
    return;
  }

  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const paddedMin = minElevation - 10;
  const paddedMax = maxElevation + 10;
  const elevationRange = Math.max(1, paddedMax - paddedMin);

  drawBackground(context, cssWidth, cssHeight);
  drawGrid(context, graphWidth, graphHeight, paddedMin, paddedMax);

  const distanceMeters = Math.max(profileData.stats.distanceMeters, 1);
  const points = profileData.samples.map((sample, index) => {
    const x = PADDING.left + (graphWidth * sample.distanceMeters) / distanceMeters;
    const y = PADDING.top + graphHeight - ((profileData.elevations[index] - paddedMin) / elevationRange) * graphHeight;
    return { x, y };
  });

  drawArea(context, points, graphHeight);
  drawLine(context, points);
  drawDistanceLabels(context, graphWidth, graphHeight, distanceMeters);

  if (hoverSampleIndex !== null && points[hoverSampleIndex]) {
    drawHoverIndicator(context, points[hoverSampleIndex], graphHeight);
  }
}

renderHeightgraph.getHoverIndex = function getHoverIndex(profileData, canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const relativeX = event.clientX - rect.left;
  const relativeY = event.clientY - rect.top;
  const cssWidth = Math.max(280, canvas.clientWidth || 280);
  const cssHeight = 220;
  const graphWidth = cssWidth - PADDING.left - PADDING.right;
  const graphHeight = cssHeight - PADDING.top - PADDING.bottom;

  if (
    relativeX < PADDING.left ||
    relativeX > PADDING.left + graphWidth ||
    relativeY < PADDING.top ||
    relativeY > PADDING.top + graphHeight
  ) {
    return null;
  }

  const distanceMeters = Math.max(profileData.stats.distanceMeters, 1);
  const ratio = (relativeX - PADDING.left) / graphWidth;
  const targetDistance = ratio * distanceMeters;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  profileData.samples.forEach((sample, index) => {
    const delta = Math.abs(sample.distanceMeters - targetDistance);
    if (delta < nearestDistance) {
      nearestDistance = delta;
      nearestIndex = index;
    }
  });

  return nearestIndex;
};

function drawBackground(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, HEIGHTGRAPH_COLORS.backgroundTop);
  gradient.addColorStop(1, HEIGHTGRAPH_COLORS.backgroundBottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.22, height * 0.12, 0, width * 0.22, height * 0.12, width * 0.65);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.72)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawGrid(context, graphWidth, graphHeight, minElevation, maxElevation) {
  context.strokeStyle = HEIGHTGRAPH_COLORS.grid;
  context.fillStyle = HEIGHTGRAPH_COLORS.axisText;
  context.font = '12px IBM Plex Sans, sans-serif';
  context.textAlign = 'right';

  const ticks = 4;
  for (let index = 0; index <= ticks; index += 1) {
    const y = PADDING.top + (graphHeight / ticks) * index;
    const value = maxElevation - ((maxElevation - minElevation) / ticks) * index;
    context.beginPath();
    context.moveTo(PADDING.left, y);
    context.lineTo(PADDING.left + graphWidth, y);
    context.stroke();
    context.fillText(`${Math.round(value)} m`, PADDING.left - 8, y + 4);
  }
}

function drawArea(context, points, graphHeight) {
  if (!points.length) {
    return;
  }

  const gradient = context.createLinearGradient(0, PADDING.top, 0, PADDING.top + graphHeight);
  gradient.addColorStop(0, HEIGHTGRAPH_COLORS.areaTop);
  gradient.addColorStop(1, HEIGHTGRAPH_COLORS.areaBottom);
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(points[0].x, PADDING.top + graphHeight);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, PADDING.top + graphHeight);
  context.closePath();
  context.fill();
}

function drawLine(context, points) {
  context.strokeStyle = HEIGHTGRAPH_COLORS.line;
  context.lineWidth = 2.5;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
      return;
    }
    context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function drawHoverIndicator(context, point, graphHeight) {
  context.strokeStyle = HEIGHTGRAPH_COLORS.hoverLine;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(point.x, PADDING.top);
  context.lineTo(point.x, PADDING.top + graphHeight);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.strokeStyle = HEIGHTGRAPH_COLORS.hoverPoint;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawDistanceLabels(context, graphWidth, graphHeight, distanceMeters) {
  context.fillStyle = HEIGHTGRAPH_COLORS.axisText;
  context.font = '12px IBM Plex Sans, sans-serif';
  context.textAlign = 'center';

  const distanceKm = distanceMeters / 1000;
  const ticks = 4;

  for (let index = 0; index <= ticks; index += 1) {
    const x = PADDING.left + (graphWidth / ticks) * index;
    const value = (distanceKm / ticks) * index;
    context.fillText(`${value.toFixed(value >= 10 ? 0 : 1)} km`, x, PADDING.top + graphHeight + 18);
  }
}

function drawEmptyState(context, width, height) {
  context.fillStyle = HEIGHTGRAPH_COLORS.axisText;
  context.font = '13px IBM Plex Sans, sans-serif';
  context.textAlign = 'center';
  context.fillText('Zu wenige Hoehendaten verfuegbar.', width / 2, height / 2);
}