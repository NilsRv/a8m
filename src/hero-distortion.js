// Local displacement of the background texture; the wordmark stays in the DOM.
export function initHeroDistortion(hero) {
  const background = hero.querySelector('.hero-image');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 761px) and (any-pointer: fine)');
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-distortion';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return;

  const vertex = `attribute vec2 position;
    varying vec2 uv;
    void main() { uv = position * .5 + .5; gl_Position = vec4(position, 0., 1.); }`;
  const fragment = `precision mediump float;
    varying vec2 uv;
    uniform sampler2D image;
    uniform vec2 size;
    uniform vec2 crop;
    uniform sampler2D field;
    uniform vec2 fieldSize;
    uniform vec2 backgroundOrigin;
    void main() {
      vec2 point = vec2(uv.x, 1. - uv.y) * size;
      vec2 heroPoint = point + backgroundOrigin;
      vec2 fieldUV = (floor(heroPoint / 8.) + .5) / fieldSize;
      vec2 velocity = (texture2D(field, fieldUV).rg * 255. - 128.) / 16.;
      vec2 localUV = point / size;
      float edgeX = min(1., 4. * (1. - min(1., abs(localUV.x * 2. - 1.))));
      float edgeY = min(1., 4. * (1. - min(1., abs(localUV.y * 2. - 1.))));
      vec2 offset = velocity * (.14 * edgeX * edgeY + .03);
      vec2 originalUV = localUV * crop + (1. - crop) * vec2(.5, .4);
      vec4 original = texture2D(image, clamp(originalUV, .001, .999));
      vec4 displaced = texture2D(image, clamp(originalUV - offset, .001, .999));
      // Keep bright parts of the photo from flashing through the red trail.
      // These weights match the grayscale filter applied to the background.
      vec3 luminance = vec3(.2126, .7152, .0722);
      float originalLight = dot(original.rgb, luminance);
      float displacedLight = dot(displaced.rgb, luminance);
      displaced.rgb *= min(1., originalLight / max(displacedLight, .0001));
      gl_FragColor = displaced;
    }`;
  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      gl.deleteShader(result);
      return null;
    }
    return result;
  }
  const vs = shader(gl.VERTEX_SHADER, vertex);
  const fs = shader(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = Object.fromEntries(['size', 'crop', 'fieldSize', 'backgroundOrigin'].map(name => [name, gl.getUniformLocation(program, name)]));
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  background.append(canvas);
  const image = new Image();
  let ready = false;
  let lost = false;
  const fieldTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, 'field'), 1);
  gl.activeTexture(gl.TEXTURE0);
  function reset() {
    canvas.style.opacity = '0';
  }
  function resize() {
    reset();
    const width = background.clientWidth;
    const height = background.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (!ready || lost) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.size, width, height);
    const scale = Math.max(width / image.width, height / image.height);
    gl.uniform2f(uniforms.crop, width / (image.width * scale), height / (image.height * scale));
  }
  let fieldData;
  function renderField(vx, vy, columns, rows) {
    if (!ready || lost || motion.matches || !desktop.matches) return;
    if (fieldData?.length !== vx.length * 4) fieldData = new Uint8Array(vx.length * 4);
    for (let i = 0; i < vx.length; i++) {
      fieldData[i * 4] = Math.max(0, Math.min(255, Math.round(vx[i] * 16 + 128)));
      fieldData[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(vy[i] * 16 + 128)));
      fieldData[i * 4 + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, columns, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, fieldData);
    gl.uniform2f(uniforms.fieldSize, columns, rows);
    gl.uniform2f(uniforms.backgroundOrigin, background.offsetLeft, background.offsetTop);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    canvas.style.opacity = '1';
  }
  image.onload = () => {
    if (lost) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    ready = true;
    resize();
  };
  image.src = '/media/doberman.webp';
  window.addEventListener('scroll', reset, { passive: true });
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  motion.addEventListener('change', reset);
  desktop.addEventListener('change', resize);
  canvas.addEventListener('webglcontextlost', () => { lost = true; reset(); });
  new ResizeObserver(resize).observe(background);
  resize();
  return { renderField, reset };
}
