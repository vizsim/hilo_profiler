const BASE_PADDING = { top: 16, right: 22, bottom: 24, left: 42 };
const Y_AXIS_LABEL_GAP = 10;
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

  const elevations = profileData.elevations.filter((value) => Number.isFinite(value));

  if (elevations.length < 2) {
    drawEmptyState(context, cssWidth, cssHeight);
    return;
  }

  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const yAxis = createNiceAxis(minElevation, maxElevation, 4);
  const xAxis = createDistanceAxis(Math.max(profileData.stats.distanceMeters, 1), 4);
  const padding = getChartPadding(context, yAxis);
  const elevationRange = Math.max(1, yAxis.max - yAxis.min);

  const graphWidth = cssWidth - padding.left - padding.right;
  const graphHeight = cssHeight - padding.top - padding.bottom;

  renderHeightgraph.lastAxes = { xAxis, yAxis, padding };

  drawBackground(context, cssWidth, cssHeight);
  drawGrid(context, graphWidth, graphHeight, yAxis, padding);

  const points = profileData.samples.map((sample, index) => {
    const x = padding.left + (graphWidth * sample.distanceMeters) / xAxis.max;
    const y = padding.top + graphHeight - ((profileData.elevations[index] - yAxis.min) / elevationRange) * graphHeight;
    return { x, y };
  });

  drawArea(context, points, graphHeight, padding);
  drawLine(context, points);
  drawDistanceLabels(context, graphWidth, graphHeight, xAxis, padding);

  if (hoverSampleIndex !== null && points[hoverSampleIndex]) {
    drawHoverIndicator(context, points[hoverSampleIndex], graphHeight, padding);
  }
}

renderHeightgraph.getHoverIndex = function getHoverIndex(profileData, canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const relativeX = event.clientX - rect.left;
  const relativeY = event.clientY - rect.top;
  const context = canvas.getContext('2d');
  const cssWidth = Math.max(280, canvas.clientWidth || 280);
  const cssHeight = 220;
  const elevations = profileData.elevations.filter((value) => Number.isFinite(value));
  const minElevation = elevations.length ? Math.min(...elevations) : 0;
  const maxElevation = elevations.length ? Math.max(...elevations) : 1;
  const yAxis = createNiceAxis(minElevation, maxElevation, 4);
  const padding = getChartPadding(context, yAxis);
  const graphWidth = cssWidth - padding.left - padding.right;
  const graphHeight = cssHeight - padding.top - padding.bottom;
  const xAxis = createDistanceAxis(Math.max(profileData.stats.distanceMeters, 1), 4);

  if (
    relativeX < padding.left ||
    relativeX > padding.left + graphWidth ||
    relativeY < padding.top ||
    relativeY > padding.top + graphHeight
  ) {
    return null;
  }

  const ratio = (relativeX - padding.left) / graphWidth;
  const targetDistance = ratio * xAxis.max;

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

if (typeof window !== 'undefined') {
  window.__heightgraphDebug = renderHeightgraph;
}

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

function drawGrid(context, graphWidth, graphHeight, yAxis, padding) {
  context.strokeStyle = HEIGHTGRAPH_COLORS.grid;
  context.fillStyle = HEIGHTGRAPH_COLORS.axisText;
  context.font = '12px IBM Plex Sans, sans-serif';
  context.textAlign = 'right';

  yAxis.ticks.forEach((value) => {
    const y = padding.top + graphHeight - ((value - yAxis.min) / (yAxis.max - yAxis.min || 1)) * graphHeight;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(padding.left + graphWidth, y);
    context.stroke();
    context.fillText(formatElevationTick(value), padding.left - Y_AXIS_LABEL_GAP, y + 4);
  });
}

function drawArea(context, points, graphHeight, padding) {
  if (!points.length) {
    return;
  }

  const gradient = context.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
  gradient.addColorStop(0, HEIGHTGRAPH_COLORS.areaTop);
  gradient.addColorStop(1, HEIGHTGRAPH_COLORS.areaBottom);
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(points[0].x, padding.top + graphHeight);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, padding.top + graphHeight);
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

function drawHoverIndicator(context, point, graphHeight, padding) {
  context.strokeStyle = HEIGHTGRAPH_COLORS.hoverLine;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(point.x, padding.top);
  context.lineTo(point.x, padding.top + graphHeight);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.strokeStyle = HEIGHTGRAPH_COLORS.hoverPoint;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawDistanceLabels(context, graphWidth, graphHeight, xAxis, padding) {
  context.fillStyle = HEIGHTGRAPH_COLORS.axisText;
  context.font = '12px IBM Plex Sans, sans-serif';
  const labelInset = 8;

  xAxis.ticks.forEach((value, index) => {
    let x = padding.left + (graphWidth * value) / xAxis.max;
    if (index === 0) {
      context.textAlign = 'left';
      x += labelInset;
    } else if (index === xAxis.ticks.length - 1) {
      context.textAlign = 'right';
      x -= labelInset;
    } else {
      context.textAlign = 'center';
    }

    context.fillText(formatDistanceTick(value, xAxis.step), x, padding.top + graphHeight + 18);
  });
}

function getChartPadding(context, yAxis) {
  context.save();
  context.font = '12px IBM Plex Sans, sans-serif';
  const maxLabelWidth = yAxis.ticks.reduce((widest, value) => {
    return Math.max(widest, context.measureText(formatElevationTick(value)).width);
  }, 0);
  context.restore();

  return {
    ...BASE_PADDING,
    left: Math.max(BASE_PADDING.left, Math.ceil(maxLabelWidth + Y_AXIS_LABEL_GAP + 2)),
  };
}

function formatElevationTick(value) {
  return `${Math.round(value)} m`;
}

function drawEmptyState(context, width, height) {
  context.fillStyle = HEIGHTGRAPH_COLORS.axisText;
  context.font = '13px IBM Plex Sans, sans-serif';
  context.textAlign = 'center';
  context.fillText('Zu wenige Höhendaten verfügbar.', width / 2, height / 2);
}

function createNiceAxis(minValue, maxValue, targetTickCount) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  }

  if (minValue === maxValue) {
    const step = niceStep(Math.max(Math.abs(maxValue) || 1, 1));
    const min = Math.floor((minValue - step) / step) * step;
    const max = Math.ceil((maxValue + step) / step) * step;
    return { min, max, step, ticks: buildTicks(min, max, step) };
  }

  const rawRange = maxValue - minValue;
  const step = niceStep(rawRange / targetTickCount);
  const min = Math.floor(minValue / step) * step;
  const max = Math.ceil(maxValue / step) * step;
  return { min, max, step, ticks: buildTicks(min, max, step) };
}

function createDistanceAxis(maxValue, targetTickCount) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  }

  const step = niceStep(maxValue / targetTickCount);
  return { min: 0, max: maxValue, step, ticks: buildDistanceTicks(maxValue, step) };
}

function niceStep(rawStep) {
  const exponent = Math.floor(Math.log10(rawStep || 1));
  const magnitude = 10 ** exponent;
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return 1 * magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}

function buildTicks(minValue, maxValue, step) {
  const ticks = [];
  for (let value = minValue; value <= maxValue + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

function buildDistanceTicks(maxValue, step) {
  if (maxValue <= step) {
    return [0, Number(maxValue.toFixed(6))];
  }

  const ticks = [0];
  for (let value = step; value < maxValue; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  const lastTick = ticks[ticks.length - 1];
  const roundedMax = Number(maxValue.toFixed(6));
  const remainingDistance = maxValue - lastTick;

  if (Math.abs(remainingDistance) <= step * 0.05) {
    ticks[ticks.length - 1] = roundedMax;
    return ticks;
  }

  if (ticks.length > 2 && remainingDistance < step * 0.35) {
    ticks[ticks.length - 1] = roundedMax;
    return ticks;
  }

  ticks.push(roundedMax);
  return ticks;
}

function formatDistanceTick(distanceMeters, step = 0) {
  if (distanceMeters >= 1000) {
    const distanceKm = distanceMeters / 1000;
    const stepKm = step / 1000;
    const decimals = stepKm >= 1 || Number.isInteger(distanceKm)
      ? 0
      : stepKm >= 0.5 || distanceKm >= 10
        ? 1
        : 2;
    return `${distanceKm.toFixed(decimals)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}