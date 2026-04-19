import { useEffect, useRef } from 'react';

export interface NetworkNodeInput {
  id?: string;
  label?: string;
  type?: string;
}

export interface NetworkEdgeInput {
  source?: string;
  target?: string;
}

export interface UmapPointInput {
  x: number;
  y: number;
  cluster?: string;
  label?: string;
}

export interface MoleculeViewerProps {
  pdbId?: string;
  ligand?: string;
  pocketLabel?: string;
  highlightResidues?: string[];
}

export interface HeatmapViewerProps {
  matrix?: number[][];
  label?: string;
}

export interface NetworkGraphProps {
  nodes?: NetworkNodeInput[];
  edges?: NetworkEdgeInput[];
}

export interface UmapViewerProps {
  points?: UmapPointInput[];
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, canvas.clientWidth);
  const height = Math.max(260, canvas.clientHeight);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

export function MoleculeViewer({
  pdbId = '7BZ5',
  ligand = '6SI',
  pocketLabel = 'Switch-II pocket',
  highlightResidues = [],
}: MoleculeViewerProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let frame = 0;
    let raf = 0;
    const atoms = Array.from({ length: 48 }, (_, i) => {
      const t = (i / 48) * Math.PI * 6;
      return {
        x: Math.cos(t) * (76 + Math.sin(i * 0.3) * 28),
        y: Math.sin(t) * 48 + Math.cos(i * 0.7) * 12,
        z: Math.sin(i * 0.4) * 48,
        r: i % 5 === 0 ? 7 : i % 3 === 0 ? 6 : 4.8,
        color: i % 5 === 0 ? '#FF7043' : i % 3 === 0 ? '#4ECDC4' : '#00E5A0',
      };
    });

    const draw = () => {
      const fit = fitCanvas(canvas);
      if (!fit) return;
      const { ctx, width, height } = fit;
      frame += 0.012;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0A0F1A';
      ctx.fillRect(0, 0, width, height);

      const projected = atoms.map((atom, index) => {
        const cos = Math.cos(frame);
        const sin = Math.sin(frame);
        const x = atom.x * cos - atom.z * sin;
        const z = atom.x * sin + atom.z * cos;
        return {
          ...atom,
          index,
          px: width / 2 + x,
          py: height / 2 + atom.y,
          depth: z,
          scale: 0.75 + (z + 100) / 360,
        };
      }).sort((a, b) => a.depth - b.depth);

      ctx.strokeStyle = 'rgba(123,147,176,0.28)';
      ctx.lineWidth = 2;
      for (let i = 1; i < projected.length; i += 1) {
        const a = projected.find((p) => p.index === i - 1);
        const b = projected.find((p) => p.index === i);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();
      }

      projected.forEach((atom) => {
        const radius = atom.r * atom.scale;
        const gradient = ctx.createRadialGradient(atom.px - radius / 3, atom.py - radius / 3, 1, atom.px, atom.py, radius);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.18, atom.color);
        gradient.addColorStop(1, 'rgba(5,8,16,0.85)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(atom.px, atom.py, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.fillStyle = 'rgba(0,229,160,0.08)';
      ctx.strokeStyle = 'rgba(0,229,160,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(width / 2 + 58, height / 2 + 12, 66, 34, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#00E5A0';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillText(pocketLabel, width / 2 + 22, height / 2 + 62);
      ctx.fillStyle = '#B0C4D8';
      ctx.fillText(`PDB:${pdbId} ligand:${ligand}`, 22, 24);
      if (highlightResidues.length) {
        ctx.fillStyle = '#FFD54F';
        ctx.fillText(`residues: ${highlightResidues.slice(0, 4).join(',')}`, 22, 44);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [highlightResidues, ligand, pdbId, pocketLabel]);

  return <canvas ref={ref} className="viz-canvas" aria-label="Molecule viewer" />;
}

export function HeatmapViewer({ matrix, label = 'Top variable genes x samples' }: HeatmapViewerProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, width, height } = fit;
    ctx.fillStyle = '#0A0F1A';
    ctx.fillRect(0, 0, width, height);
    const rows = matrix?.length || 22;
    const cols = matrix?.[0]?.length || 18;
    const margin = 34;
    const cell = Math.min((width - margin * 2) / cols, (height - margin * 2) / rows);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const v = matrix?.[r]?.[c] ?? Math.sin(r * 0.75) + Math.cos(c * 0.6) + Math.sin((r + c) * 0.18);
        const color = v > 0 ? `rgba(255,112,67,${Math.min(0.95, 0.25 + v * 0.28)})` : `rgba(78,205,196,${Math.min(0.95, 0.25 - v * 0.28)})`;
        ctx.fillStyle = color;
        ctx.fillRect(margin + c * cell, margin + r * cell, cell - 2, cell - 2);
      }
    }
    ctx.fillStyle = '#B0C4D8';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.fillText(label, margin, 20);
  }, [label, matrix]);

  return <canvas ref={ref} className="viz-canvas" aria-label="Heatmap" />;
}

export function NetworkGraph({ nodes: inputNodes, edges: inputEdges }: NetworkGraphProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    let raf = 0;
    let tick = 0;
    const nodes: Array<{ id: string; label: string; type?: string }> = inputNodes?.length
      ? inputNodes.map((node, index) => ({
        id: node.id || node.label || `node-${index}`,
        label: node.label || node.id || `Node ${index + 1}`,
        type: node.type,
      }))
      : ['KRAS', 'EGFR', 'MET', 'MAPK1', 'PIK3CA', 'SOS1', 'RAF1', 'ERK'].map((label) => ({ id: label, label }));
    const indexById = new Map(nodes.map((node, index) => [node.id, index]));
    const edges = inputEdges?.length
      ? inputEdges.flatMap((edge) => {
        const source = edge.source ? indexById.get(edge.source) : undefined;
        const target = edge.target ? indexById.get(edge.target) : undefined;
        return source === undefined || target === undefined ? [] : [[source, target] as [number, number]];
      })
      : [[0, 1], [0, 2], [0, 5], [0, 6], [6, 7], [1, 4], [2, 4], [5, 6]] as [number, number][];
    const draw = () => {
      const fit = fitCanvas(canvas);
      if (!fit) return;
      const { ctx, width, height } = fit;
      tick += 0.01;
      ctx.fillStyle = '#0A0F1A';
      ctx.fillRect(0, 0, width, height);
      const positions = nodes.map((_, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 + tick;
        const radius = i === 0 ? 0 : Math.min(width, height) * 0.28 + Math.sin(tick * 2 + i) * 10;
        return {
          x: width / 2 + Math.cos(angle) * radius,
          y: height / 2 + Math.sin(angle) * radius * 0.8,
        };
      });
      ctx.strokeStyle = 'rgba(90,112,145,0.5)';
      edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(positions[a].x, positions[a].y);
        ctx.lineTo(positions[b].x, positions[b].y);
        ctx.stroke();
      });
      positions.forEach((pos, i) => {
        const color = i === 0 ? '#00E5A0' : nodes[i].type === 'drug' || i < 3 ? '#FF7043' : '#4ECDC4';
        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, i === 0 ? 34 : 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fillStyle = '#E8EDF5';
        ctx.font = i === 0 ? '700 13px DM Sans' : '11px DM Sans';
        ctx.textAlign = 'center';
        ctx.fillText(nodes[i].label.slice(0, 14), pos.x, pos.y + 4);
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [inputEdges, inputNodes]);

  return <canvas ref={ref} className="viz-canvas" aria-label="Network graph" />;
}

export function UmapViewer({ points }: UmapViewerProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, width, height } = fit;
    ctx.fillStyle = '#0A0F1A';
    ctx.fillRect(0, 0, width, height);
    if (points?.length) {
      const colors = ['#00E5A0', '#FF7043', '#4ECDC4', '#FFD54F', '#3D7AED'];
      const clusters = Array.from(new Set(points.map((point) => point.cluster || 'cluster')));
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      points.forEach((point) => {
        const color = colors[Math.max(0, clusters.indexOf(point.cluster || 'cluster')) % colors.length];
        const x = 32 + ((point.x - minX) / Math.max(1e-6, maxX - minX)) * (width - 64);
        const y = 32 + ((point.y - minY) / Math.max(1e-6, maxY - minY)) * (height - 64);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.74;
        ctx.beginPath();
        ctx.arc(x, y, 3.6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#B0C4D8';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.fillText(`UMAP ${points.length} samples`, 24, 24);
      return;
    }
    const clusters = [
      { x: 0.3, y: 0.35, color: '#00E5A0' },
      { x: 0.65, y: 0.42, color: '#FF7043' },
      { x: 0.52, y: 0.68, color: '#4ECDC4' },
      { x: 0.78, y: 0.72, color: '#FFD54F' },
    ];
    clusters.forEach((cluster, clusterIndex) => {
      for (let i = 0; i < 74; i += 1) {
        const angle = (i * 2.399) % (Math.PI * 2);
        const radius = Math.sqrt(i / 74) * 60;
        const x = width * cluster.x + Math.cos(angle) * radius * (0.8 + clusterIndex * 0.1);
        const y = height * cluster.y + Math.sin(angle) * radius * 0.65;
        ctx.fillStyle = cluster.color;
        ctx.globalAlpha = 0.62;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#B0C4D8';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.fillText('UMAP clusters', 24, 24);
  }, [points]);

  return <canvas ref={ref} className="viz-canvas" aria-label="UMAP" />;
}
