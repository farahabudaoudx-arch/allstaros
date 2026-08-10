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

float lineGrid(float value, float frequency, float thickness) {
  float distanceToLine = abs(fract(value * frequency) - 0.5);
  return smoothstep(thickness, thickness + 0.055, distanceToLine);
}

float meshRibbon(vec2 uv, float center, float halfWidth, float phase) {
  float normalizedY = (uv.y - center) / halfWidth;
  float surface = 1.0 - smoothstep(0.88, 1.0, abs(normalizedY));
  float contours = lineGrid(normalizedY + sin(uv.x * 8.0 + phase) * 0.035, 13.0, 0.445);
  float crossLines = lineGrid(uv.x + normalizedY * 0.028 + sin(normalizedY * 2.4 + phase) * 0.006, 68.0, 0.43);
  float boundary = 1.0 - smoothstep(0.012, 0.04, abs(abs(normalizedY) - 1.0));
  return surface * max(max(contours, crossLines * 0.74), boundary);
}

void main() {
  vec2 uv = vUv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = u_time;

  float centerA = 0.49 + sin(uv.x * 6.0 - t * 0.24) * 0.13 + sin(uv.x * 13.0 + t * 0.11) * 0.025;
  float centerB = 0.51 + sin(uv.x * 4.5 + t * 0.19 + 2.2) * 0.17 + sin(uv.x * 10.0 - t * 0.08) * 0.035;
  float centerC = 0.48 + sin(uv.x * 7.4 - t * 0.14 + 4.0) * 0.095;
  float widthA = 0.12 + (sin(uv.x * 5.0 + 0.7) + 1.0) * 0.025;
  float widthB = 0.095 + (sin(uv.x * 6.5 + 2.0) + 1.0) * 0.018;
  float widthC = 0.065 + (sin(uv.x * 8.0 + 4.2) + 1.0) * 0.014;

  float ribbonA = meshRibbon(uv, centerA, widthA, 0.5);
  float ribbonB = meshRibbon(uv, centerB, widthB, 2.3);
  float ribbonC = meshRibbon(uv, centerC, widthC, 4.6);

  vec3 col = u_bg;
  col += u_colors[2] * ribbonA * 1.05;
  col += u_colors[1] * ribbonB * 0.92;
  col += u_colors[0] * ribbonC * 0.68;

  float centerQuiet = smoothstep(0.0, 0.34, length(vec2(p.x * 0.48, p.y - 0.02)));
  col *= mix(0.68, 1.0, centerQuiet);
  float vignette = 1.0 - smoothstep(0.45, 1.25, length(p));
  col *= mix(0.58, 1.0, vignette);
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
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/15" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
