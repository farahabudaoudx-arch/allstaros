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

float aura(float distanceFromWave, float radius) {
  return 1.0 - smoothstep(0.0, radius, distanceFromWave);
}

void main() {
  vec2 uv = vUv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = u_time;

  float primaryWave = 0.5
    + sin(uv.x * 5.2 - t * 0.18) * 0.115
    + sin(uv.x * 10.5 + t * 0.08) * 0.025;
  float secondaryWave = 0.49
    + sin(uv.x * 4.1 + t * 0.13 + 2.1) * 0.14;

  float primaryDistance = abs(uv.y - primaryWave);
  float secondaryDistance = abs(uv.y - secondaryWave);
  float primaryHalo = aura(primaryDistance, 0.24);
  float primaryCore = aura(primaryDistance, 0.07);
  float secondaryHalo = aura(secondaryDistance, 0.18);

  vec3 col = u_bg;
  col += u_colors[2] * secondaryHalo * 0.2;
  col += u_colors[1] * primaryHalo * 0.36;
  col += u_colors[0] * primaryCore * 0.24;

  float centerQuiet = smoothstep(0.0, 0.29, length(vec2(p.x * 0.52, p.y - 0.01)));
  col *= mix(0.62, 1.0, centerQuiet);
  float vignette = 1.0 - smoothstep(0.45, 1.25, length(p));
  col *= mix(0.58, 1.0, vignette);
  float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + u_time);
  col += (grain - 0.5) * u_grain * 0.018;
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
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-[1.06] blur-xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/20" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
