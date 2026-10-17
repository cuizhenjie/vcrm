"use client";
import { useEffect, useRef } from "react";

/**
 * 零依赖 WebGL 着色器画布 —— 全站视觉背景。
 *
 * 性能策略：
 * - 页面不可见（visibilitychange）/滚出视口（IntersectionObserver）时暂停 rAF
 * - prefers-reduced-motion 时只渲染一帧静态画面
 * - devicePixelRatio 上限 1.75，超大视口按像素预算降采样
 * - WebGL 不可用或上下文丢失时静默降级到 CSS 渐变（由调用方提供兜底层）
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/* 浅色丝绸流光 —— 应用内页背景，低对比度保证内容可读 */
const SILK_FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(7.3, 3.1); a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 par = (u_mouse - 0.5) * 0.12;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) + par;
  float t = u_time * 0.05;

  // 三层错速流动的雾状波带
  float f1 = fbm(p * 1.6 + vec2(t * 0.9, -t * 0.4));
  float f2 = fbm(p * 2.2 - vec2(t * 0.5, t * 0.7) + f1 * 0.6);
  float f3 = fbm(p * 3.1 + vec2(-t * 0.3, t * 0.6) + f2 * 0.5);
  float flow = f1 * 0.55 + f2 * 0.3 + f3 * 0.15;

  vec3 base = vec3(0.953, 0.960, 0.976);            // #f3f5f9
  vec3 indigo = vec3(0.720, 0.720, 0.930);           // 靛紫
  vec3 azure = vec3(0.740, 0.850, 0.985);            // 天蓝
  vec3 rose  = vec3(0.920, 0.840, 0.940);            // 淡紫红

  vec3 col = base;
  col = mix(col, indigo, smoothstep(0.30, 0.80, flow) * 0.46);
  col = mix(col, azure,  smoothstep(0.26, 0.86, f2) * 0.32);
  col = mix(col, rose,   smoothstep(0.42, 0.92, f3) * 0.24);

  // 顶部光晕聚焦（页面视觉重心在上半区）
  col += vec3(0.040, 0.032, 0.070) * (1.0 - uv.y) * (0.6 + flow * 0.4);

  // 轻噪点抑制色带
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.006;

  gl_FragColor = vec4(col, 1.0);
}
`;

/* 深空星云 —— 登录/注册/支付收银台沉浸式背景，与深色导航同色系 */
const NEBULA_FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + vec2(5.2, 1.3); a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 par = (u_mouse - 0.5) * 0.18;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) + par;
  float t = u_time * 0.06;

  float f1 = fbm(p * 1.4 + vec2(t * 0.7, -t * 0.3));
  float f2 = fbm(p * 2.0 - vec2(t * 0.4, t * 0.5) + f1 * 0.7);
  float f3 = fbm(p * 3.4 + vec2(-t * 0.6, t * 0.8) + f2 * 0.4);

  vec3 base = mix(vec3(0.071, 0.086, 0.161), vec3(0.098, 0.114, 0.204), uv.y); // #121b29→#191d34
  vec3 indigo = vec3(0.357, 0.357, 0.839);   // #5b5bd6 primary
  vec3 azure  = vec3(0.176, 0.498, 0.976);   // #2d7ff9 accent
  vec3 cyan   = vec3(0.220, 0.740, 0.970);

  vec3 col = base;
  col = mix(col, indigo, smoothstep(0.38, 0.92, f1 * 0.7 + f2 * 0.3) * 0.52);
  col = mix(col, azure,  smoothstep(0.42, 0.95, f2) * 0.34);
  col = mix(col, cyan,   smoothstep(0.55, 1.00, f3) * 0.20);

  // 极光帷幕：竖向波纹沿时间扫过
  float curtain = sin((uv.x + f1 * 0.8) * 6.2831 + t * 2.2) * 0.5 + 0.5;
  col += indigo * curtain * smoothstep(0.9, 0.2, uv.y) * 0.14;

  // 星点（两层视差）
  vec2 sp = uv * u_res / 3.0;
  float star = step(0.9985, hash(floor(sp + t * 4.0))) + step(0.9992, hash(floor(sp * 1.7 - t * 6.0))) * 0.6;
  col += vec3(star) * 0.35;

  // 边缘暗角聚焦中央表单
  float vig = smoothstep(1.25, 0.35, length(uv - vec2(0.5, 0.45)) );
  col *= mix(0.72, 1.0, vig);

  col += (hash(gl_FragCoord.xy) - 0.5) * 0.008;
  gl_FragColor = vec4(col, 1.0);
}
`;

/* 极光帷幕 —— 产品宣传页 hero 专用：深空底色上青/紫/品红三色流光，更绚丽动感 */
const AURORA_FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.05 + vec2(4.7, 2.1); a *= 0.5; }
  return v;
}

/* 单条极光帷幕：竖向波纹随时间扫动，fbm 使边缘撕开成丝缕 */
float curtain(vec2 q, float phase, float freq, float t) {
  float wave = sin(q.x * freq + phase) * 0.5 + 0.5;
  float body = smoothstep(0.9, 0.0, abs(q.y - (0.30 + wave * 0.28 + fbm(q * vec2(1.8, 3.0) + t) * 0.22)));
  return body * (0.55 + 0.45 * fbm(q * vec2(3.5, 6.0) - t));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 par = (u_mouse - 0.5) * 0.22;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) + par;
  float t = u_time * 0.09;

  vec3 base = mix(vec3(0.027, 0.035, 0.090), vec3(0.055, 0.075, 0.170), uv.y); // 深空底

  float c1 = curtain(p, t * 1.4, 5.2, t);
  float c2 = curtain(p + vec2(0.33, 0.06), t * -1.1 + 2.1, 4.1, t);
  float c3 = curtain(p + vec2(-0.28, 0.12), t * 0.8 + 4.2, 6.3, t);

  vec3 teal    = vec3(0.100, 0.850, 0.780);
  vec3 violet  = vec3(0.520, 0.320, 1.000);
  vec3 magenta = vec3(1.000, 0.340, 0.720);

  vec3 col = base;
  col += teal    * c1 * 0.42 * smoothstep(0.05, 0.75, uv.y);
  col += violet  * c2 * 0.38 * smoothstep(0.02, 0.70, uv.y);
  col += magenta * c3 * 0.26 * smoothstep(0.00, 0.60, uv.y);

  // 顶部辉光汇聚（标题区）
  col += vec3(0.10, 0.16, 0.38) * pow(1.0 - uv.y, 2.2) * (0.5 + c1 * 0.5);

  // 星点两层视差
  vec2 sp = uv * u_res / 3.0;
  float star = step(0.9982, hash(floor(sp + t * 5.0))) + step(0.9990, hash(floor(sp * 1.6 - t * 7.0))) * 0.7;
  col += vec3(star) * 0.30;

  // 底部渐隐衔接下一区块
  col *= smoothstep(0.0, 0.08, uv.y);
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.008;
  gl_FragColor = vec4(col, 1.0);
}
`;

const FRAGS: Record<string, string> = { silk: SILK_FRAG, nebula: NEBULA_FRAG, aurora: AURORA_FRAG };

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("[shader] compile:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export default function ShaderCanvas({
  variant = "silk",
  className = "",
  speed = 1,
}: {
  variant?: "silk" | "nebula" | "aurora";
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // 静默降级：调用方的 CSS 渐变兜底层可见

    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAGS[variant] ?? SILK_FRAG);
    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    if (!frag || !vert) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let running = false;
    let visible = true;       //滚出视口
    let inDoc = !document.hidden;
    let t = (Date.now() / 1000) % 97; // 相位偏移，避免多实例画面完全同步（非加密用途）
    let last = performance.now();
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const sizeCanvas = () => {
      // 像素预算 ~2.6MP（约 1920×1360），超出则降采样，保证低端 GPU 流畅
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const budget = 2_600_000;
      let scale = Math.min(window.devicePixelRatio || 1, 1.75);
      if (w * h * scale * scale > budget) scale *= Math.sqrt(budget / (w * h * scale * scale));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = () => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); // 防止切页回来时间跳变
      last = now;
      t += dt * speed;
      // 鼠标视差阻尼
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      draw();
      if (running) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || reduced || !visible || !inDoc) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    sizeCanvas();
    draw(); // 首帧立即可见（reduced-motion 也保留这一帧静态画面）

    const io = new IntersectionObserver(([e]) => {
      visible = !!e.isIntersecting;
      visible ? start() : stop();
    });
    io.observe(canvas);

    const onVis = () => { inDoc = !document.hidden; inDoc ? start() : stop(); };
    const onMove = (e: PointerEvent) => {
      if (!fine) return;
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = 1 - e.clientY / window.innerHeight;
    };
    const onResize = () => { sizeCanvas(); if (!running) draw(); };
    const onLost = (e: Event) => { e.preventDefault(); stop(); };
    const onRestored = () => { sizeCanvas(); start(); };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    start();

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.deleteProgram(prog);
      gl.deleteShader(frag);
      gl.deleteShader(vert);
      gl.deleteBuffer(buf);
    };
  }, [variant, speed]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
