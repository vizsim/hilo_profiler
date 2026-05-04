const PADDING = { top: 16, right: 12, bottom: 24, left: 42 };

export function renderHeightgraph(profileData) {
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
}

function drawBackground(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#fffaf0');
  gradient.addColorStop(1, '#efe4cd');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawGrid(context, graphWidth, graphHeight, minElevation, maxElevation) {
  context.strokeStyle = 'rgba(60, 52, 40, 0.12)';
  context.fillStyle = '#6a6154';
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
  gradient.addColorStop(0, 'rgba(20, 94, 75, 0.48)');
  gradient.addColorStop(1, 'rgba(20, 94, 75, 0.08)');
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(points[0].x, PADDING.top + graphHeight);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, PADDING.top + graphHeight);
  context.closePath();
  context.fill();
}

function drawLine(context, points) {
  context.strokeStyle = '#124e3d';
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

function drawDistanceLabels(context, graphWidth, graphHeight, distanceMeters) {
  context.fillStyle = '#6a6154';
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
  context.fillStyle = '#6a6154';
  context.font = '13px IBM Plex Sans, sans-serif';
  context.textAlign = 'center';
  context.fillText('Zu wenige Hoehendaten verfuegbar.', width / 2, height / 2);
}