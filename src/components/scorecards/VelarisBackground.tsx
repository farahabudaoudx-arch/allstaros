"use client";

import { useEffect, useRef, type ReactNode } from "react";

const vertexShader = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_grain;
uniform vec3 u_colors[4];
uniform vec3 u_bg;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vUv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = u_time;
  float broadWarp = snoise(vec2(uv.x * 1.15 - t * 0.035, t * 0.025)) * 0.075;
  float fineWarp = snoise(vec2(uv.x * 2.6 + t * 0.045, uv.y * 0.7)) * 0.022;

  float waveA = 0.62 + sin(uv.x * 5.4 - t * 0.22) * 0.105 + broadWarp;
  float waveB = 0.38 + sin(uv.x * 4.1 + t * 0.18 + 1.7) * 0.09 - broadWarp * 0.7;
  float waveC = 0.16 + sin(uv.x * 6.2 - t * 0.14 + 3.1) * 0.055 + fineWarp;

  float ribbonA = 1.0 - smoothstep(0.0, 0.16, abs(uv.y - waveA));
  float ribbonB = 1.0 - smoothstep(0.0, 0.105, abs(uv.y - waveB));
  float ribbonC = 1.0 - smoothstep(0.0, 0.065, abs(uv.y - waveC));
  float edgeA = 1.0 - smoothstep(0.0, 0.012, abs(uv.y - waveA));
  float edgeB = 1.0 - smoothstep(0.0, 0.009, abs(uv.y - waveB));

  vec3 col = u_bg;
  col = mix(col, u_colors[2], ribbonA * 0.72);
  col = mix(col, u_colors[1], ribbonB * 0.48);
  col = mix(col, u_colors[2], ribbonC * 0.54);
  col += u_colors[0] * edgeA * 0.18;
  col += u_colors[3] * edgeB * 0.045;

  float centerQuiet = smoothstep(0.0, 0.46, length(vec2(p.x * 0.52, p.y - 0.06)));
  col *= mix(0.56, 1.0, centerQuiet);
  float vignette = 1.0 - smoothstep(0.45, 1.25, length(p));
  col *= mix(0.48, 1.0, vignette);
  float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + u_time);
  col += (grain - 0.5) * u_grain * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;

const COLORS = ["#f6c945", "#c9a235", "#5b4300", "#f5f5f5"];

function rgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255) as [number, number, number];
}

export function VelarisBackground({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to create scorecard background shader.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(message ?? "Unable to compile scorecard background shader.");
      }
      return shader;
    };

    const program = gl.createProgram();
    if (!program) return;
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentShader);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, "u_resolution");
    const time = gl.getUniformLocation(program, "u_time");
    const grain = gl.getUniformLocation(program, "u_grain");
    const colors = gl.getUniformLocation(program, "u_colors");
    const background = gl.getUniformLocation(program, "u_bg");
    const flatColors = new Float32Array(COLORS.flatMap(rgb));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.round(container.clientWidth * dpr);
      canvas.height = Math.round(container.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    const render = (milliseconds: number) => {
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, reduceMotion ? 0 : milliseconds * 0.00045);
      gl.uniform1f(grain, 0.16);
      gl.uniform3f(background, 0, 0, 0);
      gl.uniform3fv(colors, flatColors);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduceMotion && !document.hidden) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(render);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative overflow-hidden bg-black">
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/45" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
