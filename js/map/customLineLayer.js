// Custom MapLibre layer that renders a thick polyline as triangles in screen
// space, always on top of the map (no depth test, no terrain RTT drape).
//
// Input is an anchor list (lng/lat waypoints) and per-vertex parametric `t`
// values (0..1) along the cumulative anchor distance. Only the anchors are
// projected via map.project(); intermediate vertices are interpolated in
// screen space. This keeps the rendered line straight between anchors no
// matter the camera pitch or terrain elevation, while still allowing
// per-segment coloring (e.g. green vs orange where the line crosses
// buildings).

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec3 a_color;
  uniform vec2 u_viewport;
  varying vec3 v_color;
  void main() {
    vec2 ndc = vec2(
      2.0 * a_position.x / u_viewport.x - 1.0,
      1.0 - 2.0 * a_position.y / u_viewport.y
    );
    gl_Position = vec4(ndc, 0.0, 1.0);
    v_color = a_color;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  varying vec3 v_color;
  uniform float u_opacity;
  void main() {
    gl_FragColor = vec4(v_color * u_opacity, u_opacity);
  }
`;

const FLOATS_PER_VERTEX = 5;
const VERTICES_PER_SEGMENT = 6;
const MITER_DOT_FLOOR = 0.2;
const MIN_VERTEX_COUNT_FOR_DRAW = 3;
const EARTH_RADIUS_METERS = 6378137;

export function createCustomLineLayer({ id, defaultColor, widthPixels = 4, opacity = 1 }) {
  const defaultColorRgb = parseHexColor(defaultColor);
  let lineData = null;
  let mapRef = null;
  let glRef = null;
  let program = null;
  let positionBuffer = null;
  let positionLocation = -1;
  let colorLocation = -1;
  let viewportLocation = null;
  let opacityLocation = null;

  return {
    id,
    type: 'custom',
    renderingMode: '3d',

    setData(data) {
      const anchors = data?.anchors;
      if (!Array.isArray(anchors) || anchors.length < 2) {
        lineData = null;
      } else {
        const anchorCumT = computeAnchorCumulativeT(anchors);
        const vertexT = Array.isArray(data.vertexT) && data.vertexT.length >= 2
          ? data.vertexT
          : [0, 1];
        lineData = {
          anchors,
          anchorCumT,
          vertexT,
          segmentColors: Array.isArray(data.segmentColors) ? data.segmentColors : null,
        };
      }
      if (mapRef) {
        mapRef.triggerRepaint();
      }
    },

    onAdd(map, gl) {
      mapRef = map;
      glRef = gl;

      const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        program = null;
        throw new Error(`Custom line layer link failed: ${info}`);
      }

      gl.deleteShader(vs);
      gl.deleteShader(fs);

      positionLocation = gl.getAttribLocation(program, 'a_position');
      colorLocation = gl.getAttribLocation(program, 'a_color');
      viewportLocation = gl.getUniformLocation(program, 'u_viewport');
      opacityLocation = gl.getUniformLocation(program, 'u_opacity');

      positionBuffer = gl.createBuffer();
    },

    onRemove() {
      if (glRef) {
        if (positionBuffer) {
          glRef.deleteBuffer(positionBuffer);
        }
        if (program) {
          glRef.deleteProgram(program);
        }
      }

      positionBuffer = null;
      program = null;
      glRef = null;
      mapRef = null;
    },

    render(gl) {
      if (!program || !lineData || !mapRef) {
        return;
      }

      const halfWidth = Math.max(0.5, widthPixels / 2);
      const vertices = buildLineMesh(lineData, mapRef, halfWidth, defaultColorRgb);
      const vertexCount = vertices.length / FLOATS_PER_VERTEX;
      if (vertexCount < MIN_VERTEX_COUNT_FOR_DRAW) {
        return;
      }

      const canvas = mapRef.getCanvas();
      const cssWidth = canvas.clientWidth || canvas.width;
      const cssHeight = canvas.clientHeight || canvas.height;

      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);

      const stride = FLOATS_PER_VERTEX * 4;
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(colorLocation);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, 8);

      gl.uniform2f(viewportLocation, cssWidth, cssHeight);
      gl.uniform1f(opacityLocation, opacity);

      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

      gl.disableVertexAttribArray(positionLocation);
      gl.disableVertexAttribArray(colorLocation);
      gl.depthMask(true);
    },
  };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Custom line layer shader compile failed: ${info}`);
  }
  return shader;
}

function parseHexColor(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) {
    return [1, 1, 1];
  }

  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function haversineMeters(a, b) {
  const lng1 = (a[0] * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lng2 = (b[0] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLng * sinHalfLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function computeAnchorCumulativeT(anchors) {
  const cumulative = [0];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    cumulative.push(cumulative[index] + haversineMeters(anchors[index], anchors[index + 1]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) {
    return anchors.map((_, index) => index / Math.max(1, anchors.length - 1));
  }
  return cumulative.map((value) => value / total);
}

function buildLineMesh(data, map, halfWidth, defaultColorRgb) {
  const { anchors, anchorCumT, vertexT, segmentColors } = data;

  const anchorScreens = anchors.map((coord) => {
    const projected = map.project({ lng: coord[0], lat: coord[1] });
    return {
      x: Number.isFinite(projected.x) ? projected.x : 0,
      y: Number.isFinite(projected.y) ? projected.y : 0,
    };
  });

  const screenPoints = vertexT.map((t) => interpolateAnchorScreenPoint(anchorScreens, anchorCumT, t));
  if (screenPoints.length < 2) {
    return new Float32Array(0);
  }

  const miters = computeMiterOffsets(screenPoints, halfWidth);
  const totalSegments = screenPoints.length - 1;
  const positions = new Float32Array(totalSegments * VERTICES_PER_SEGMENT * FLOATS_PER_VERTEX);

  let writeOffset = 0;
  for (let index = 0; index < totalSegments; index += 1) {
    const p0 = screenPoints[index];
    const p1 = screenPoints[index + 1];
    const m0 = miters[index];
    const m1 = miters[index + 1];

    const segmentColor = (segmentColors && segmentColors[index])
      ? parseHexColor(segmentColors[index])
      : defaultColorRgb;
    const r = segmentColor[0];
    const g = segmentColor[1];
    const b = segmentColor[2];

    writeOffset = writeVertex(positions, writeOffset, p0.x + m0.x, p0.y + m0.y, r, g, b);
    writeOffset = writeVertex(positions, writeOffset, p0.x - m0.x, p0.y - m0.y, r, g, b);
    writeOffset = writeVertex(positions, writeOffset, p1.x + m1.x, p1.y + m1.y, r, g, b);
    writeOffset = writeVertex(positions, writeOffset, p1.x + m1.x, p1.y + m1.y, r, g, b);
    writeOffset = writeVertex(positions, writeOffset, p0.x - m0.x, p0.y - m0.y, r, g, b);
    writeOffset = writeVertex(positions, writeOffset, p1.x - m1.x, p1.y - m1.y, r, g, b);
  }

  return positions;
}

function interpolateAnchorScreenPoint(anchorScreens, anchorCumT, t) {
  const clampedT = Math.max(0, Math.min(1, t));

  if (anchorScreens.length === 0) {
    return { x: 0, y: 0 };
  }
  if (anchorScreens.length === 1) {
    return { ...anchorScreens[0] };
  }

  let segIndex = 0;
  while (segIndex < anchorCumT.length - 2 && anchorCumT[segIndex + 1] < clampedT) {
    segIndex += 1;
  }

  const segStart = anchorCumT[segIndex];
  const segEnd = anchorCumT[segIndex + 1];
  const span = Math.max(1e-9, segEnd - segStart);
  const localT = (clampedT - segStart) / span;

  const A = anchorScreens[segIndex];
  const B = anchorScreens[segIndex + 1];
  return {
    x: A.x + localT * (B.x - A.x),
    y: A.y + localT * (B.y - A.y),
  };
}

function writeVertex(buffer, offset, x, y, r, g, b) {
  buffer[offset] = x;
  buffer[offset + 1] = y;
  buffer[offset + 2] = r;
  buffer[offset + 3] = g;
  buffer[offset + 4] = b;
  return offset + FLOATS_PER_VERTEX;
}

function computeMiterOffsets(points, halfWidth) {
  const miters = new Array(points.length);
  for (let index = 0; index < points.length; index += 1) {
    const prev = index > 0 ? points[index - 1] : null;
    const next = index < points.length - 1 ? points[index + 1] : null;
    miters[index] = computeMiter(prev, points[index], next, halfWidth);
  }
  return miters;
}

function computeMiter(prev, current, next, halfWidth) {
  const incoming = prev ? perpendicularUnitVector(prev, current) : null;
  const outgoing = next ? perpendicularUnitVector(current, next) : null;

  if (incoming && outgoing) {
    let mx = incoming.x + outgoing.x;
    let my = incoming.y + outgoing.y;
    const length = Math.hypot(mx, my);

    if (length < 1e-4) {
      return { x: incoming.x * halfWidth, y: incoming.y * halfWidth };
    }

    mx /= length;
    my /= length;

    const dot = mx * incoming.x + my * incoming.y;
    const scale = halfWidth / Math.max(MITER_DOT_FLOOR, dot);

    return { x: mx * scale, y: my * scale };
  }

  if (incoming) {
    return { x: incoming.x * halfWidth, y: incoming.y * halfWidth };
  }

  if (outgoing) {
    return { x: outgoing.x * halfWidth, y: outgoing.y * halfWidth };
  }

  return { x: 0, y: 0 };
}

function perpendicularUnitVector(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-4) {
    return null;
  }
  return { x: -dy / length, y: dx / length };
}
