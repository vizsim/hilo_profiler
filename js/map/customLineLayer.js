// Custom MapLibre layer that renders a thick polyline as triangles in screen
// space, always on top of the map (no depth test, no terrain RTT drape).
//
// Each vertex is a lng/lat pair, projected per frame via
// `map.transform.locationPoint(lngLat)` — the same Mercator pipeline as
// `map.project`, but without the terrain-elevation adjustment. This keeps the
// rendered line on the ground plane (no terrain zigzag) while still
// respecting camera pitch/zoom — perspective foreshortening lands every
// sample at the correct screen position, so per-segment color boundaries
// align with what is rendered on the map at the same lng/lat.
//
// Per-frame allocations are avoided: scratch buffers (screen coords, miters,
// mesh) live in the layer closure and grow only when the input gets bigger.
// Segment colors are accepted pre-parsed as `[r, g, b]` floats so the render
// loop can write them straight into the vertex buffer without string parsing.

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
const EPSILON = 1e-4;

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

  // Persistent scratch buffers — grown on demand, never shrunk. Reused every
  // frame to avoid GC churn during pan/zoom/pitch animations.
  let positions = new Float32Array(0);
  let screenX = new Float32Array(0);
  let screenY = new Float32Array(0);
  let miterX = new Float32Array(0);
  let miterY = new Float32Array(0);

  return {
    id,
    type: 'custom',
    renderingMode: '3d',

    setData(data) {
      const vertices = data?.vertices;
      if (!Array.isArray(vertices) || vertices.length < 2) {
        lineData = null;
      } else {
        lineData = {
          vertices,
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
      const vertices = lineData.vertices;
      const segmentColors = lineData.segmentColors;
      const vertexCount = vertices.length;
      const segmentCount = vertexCount - 1;
      if (segmentCount < 1) {
        return;
      }

      // Grow scratch buffers if the input got bigger than what we've seen so
      // far. ensureCapacity returns a (possibly reallocated) Float32Array.
      screenX = ensureCapacity(screenX, vertexCount);
      screenY = ensureCapacity(screenY, vertexCount);
      miterX = ensureCapacity(miterX, vertexCount);
      miterY = ensureCapacity(miterY, vertexCount);
      const meshFloats = segmentCount * VERTICES_PER_SEGMENT * FLOATS_PER_VERTEX;
      positions = ensureCapacity(positions, meshFloats);

      // Project each sample with terrain-agnostic projection so the rendered
      // line lives on the Mercator ground plane (no terrain elevation), while
      // still picking up camera pitch/zoom/bearing through the pixelMatrix.
      // Falls back to map.project if transform.locationPoint is unavailable.
      const transform = mapRef.transform;
      const useTransformLocationPoint = transform && typeof transform.locationPoint === 'function';
      const lngLatScratch = { lng: 0, lat: 0 };
      for (let index = 0; index < vertexCount; index += 1) {
        const coord = vertices[index];
        lngLatScratch.lng = coord[0];
        lngLatScratch.lat = coord[1];
        const projected = useTransformLocationPoint
          ? transform.locationPoint(lngLatScratch)
          : mapRef.project(lngLatScratch);
        screenX[index] = Number.isFinite(projected.x) ? projected.x : 0;
        screenY[index] = Number.isFinite(projected.y) ? projected.y : 0;
      }

      computeMitersInPlace(screenX, screenY, vertexCount, halfWidth, miterX, miterY);

      // Build the triangle mesh straight into the persistent positions buffer.
      let writeOffset = 0;
      for (let index = 0; index < segmentCount; index += 1) {
        const p0x = screenX[index];
        const p0y = screenY[index];
        const p1x = screenX[index + 1];
        const p1y = screenY[index + 1];
        const m0x = miterX[index];
        const m0y = miterY[index];
        const m1x = miterX[index + 1];
        const m1y = miterY[index + 1];

        const segColor = (segmentColors && segmentColors[index]) || defaultColorRgb;
        const r = segColor[0];
        const g = segColor[1];
        const b = segColor[2];

        // Triangle 1: p0L, p0R, p1L
        positions[writeOffset] = p0x + m0x;
        positions[writeOffset + 1] = p0y + m0y;
        positions[writeOffset + 2] = r;
        positions[writeOffset + 3] = g;
        positions[writeOffset + 4] = b;

        positions[writeOffset + 5] = p0x - m0x;
        positions[writeOffset + 6] = p0y - m0y;
        positions[writeOffset + 7] = r;
        positions[writeOffset + 8] = g;
        positions[writeOffset + 9] = b;

        positions[writeOffset + 10] = p1x + m1x;
        positions[writeOffset + 11] = p1y + m1y;
        positions[writeOffset + 12] = r;
        positions[writeOffset + 13] = g;
        positions[writeOffset + 14] = b;

        // Triangle 2: p1L, p0R, p1R
        positions[writeOffset + 15] = p1x + m1x;
        positions[writeOffset + 16] = p1y + m1y;
        positions[writeOffset + 17] = r;
        positions[writeOffset + 18] = g;
        positions[writeOffset + 19] = b;

        positions[writeOffset + 20] = p0x - m0x;
        positions[writeOffset + 21] = p0y - m0y;
        positions[writeOffset + 22] = r;
        positions[writeOffset + 23] = g;
        positions[writeOffset + 24] = b;

        positions[writeOffset + 25] = p1x - m1x;
        positions[writeOffset + 26] = p1y - m1y;
        positions[writeOffset + 27] = r;
        positions[writeOffset + 28] = g;
        positions[writeOffset + 29] = b;

        writeOffset += VERTICES_PER_SEGMENT * FLOATS_PER_VERTEX;
      }

      const drawVertexCount = writeOffset / FLOATS_PER_VERTEX;
      if (drawVertexCount < MIN_VERTEX_COUNT_FOR_DRAW) {
        return;
      }

      const canvas = mapRef.getCanvas();
      const cssWidth = canvas.clientWidth || canvas.width;
      const cssHeight = canvas.clientHeight || canvas.height;

      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      // subarray creates a tiny view object (no data copy) so the driver only
      // uploads the bytes we actually wrote.
      gl.bufferData(gl.ARRAY_BUFFER, positions.subarray(0, writeOffset), gl.DYNAMIC_DRAW);

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

      gl.drawArrays(gl.TRIANGLES, 0, drawVertexCount);

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

function ensureCapacity(buffer, needed) {
  if (buffer.length >= needed) {
    return buffer;
  }
  let capacity = buffer.length || 64;
  while (capacity < needed) {
    capacity *= 2;
  }
  return new Float32Array(capacity);
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

function computeMitersInPlace(screenX, screenY, count, halfWidth, miterX, miterY) {
  for (let index = 0; index < count; index += 1) {
    let n1x = 0;
    let n1y = 0;
    let has1 = false;
    if (index > 0) {
      const dx = screenX[index] - screenX[index - 1];
      const dy = screenY[index] - screenY[index - 1];
      const length = Math.hypot(dx, dy);
      if (length >= EPSILON) {
        n1x = -dy / length;
        n1y = dx / length;
        has1 = true;
      }
    }

    let n2x = 0;
    let n2y = 0;
    let has2 = false;
    if (index < count - 1) {
      const dx = screenX[index + 1] - screenX[index];
      const dy = screenY[index + 1] - screenY[index];
      const length = Math.hypot(dx, dy);
      if (length >= EPSILON) {
        n2x = -dy / length;
        n2y = dx / length;
        has2 = true;
      }
    }

    if (has1 && has2) {
      let mx = n1x + n2x;
      let my = n1y + n2y;
      const mlen = Math.hypot(mx, my);
      if (mlen < EPSILON) {
        miterX[index] = n1x * halfWidth;
        miterY[index] = n1y * halfWidth;
        continue;
      }
      mx /= mlen;
      my /= mlen;
      const dot = mx * n1x + my * n1y;
      const scale = halfWidth / Math.max(MITER_DOT_FLOOR, dot);
      miterX[index] = mx * scale;
      miterY[index] = my * scale;
    } else if (has1) {
      miterX[index] = n1x * halfWidth;
      miterY[index] = n1y * halfWidth;
    } else if (has2) {
      miterX[index] = n2x * halfWidth;
      miterY[index] = n2y * halfWidth;
    } else {
      miterX[index] = 0;
      miterY[index] = 0;
    }
  }
}
