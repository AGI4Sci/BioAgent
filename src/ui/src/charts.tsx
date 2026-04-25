import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ActivityPoint {
  day: string;
  papers: number;
  eus: number;
}

export interface VolcanoPoint {
  gene: string;
  logFC: number;
  negLogP: number;
  sig: boolean;
  category?: string;
}

export interface RadarPoint {
  subject: string;
  ai: number;
  bio: number;
}

export function ActivityAreaChart({ data }: { data: ActivityPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="bioArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00E5A0" stopOpacity={0.42} />
            <stop offset="100%" stopColor="#00E5A0" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#243044" strokeDasharray="3 3" />
        <XAxis dataKey="day" tick={{ fill: '#7B93B0', fontSize: 11 }} />
        <YAxis tick={{ fill: '#7B93B0', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#1A2332', border: '1px solid #243044', borderRadius: 8 }} />
        <Area dataKey="papers" stroke="#00E5A0" fill="url(#bioArea)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function VolcanoChart({ points }: { points?: VolcanoPoint[] }) {
  const data = points ?? [];
  const categories = Array.from(new Set(data.map((point) => point.category).filter(Boolean)));
  const palette = ['#00E5A0', '#FF7043', '#4ECDC4', '#FFD54F', '#3D7AED'];
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <ScatterChart margin={{ top: 10, right: 14, bottom: 24, left: 8 }}>
        <CartesianGrid stroke="#243044" strokeDasharray="3 3" />
        <XAxis dataKey="logFC" type="number" tick={{ fill: '#7B93B0', fontSize: 10 }} label={{ value: 'log2FC', position: 'bottom', fill: '#7B93B0' }} />
        <YAxis dataKey="negLogP" type="number" tick={{ fill: '#7B93B0', fontSize: 10 }} label={{ value: '-log10(p)', angle: -90, position: 'insideLeft', fill: '#7B93B0' }} />
        <Tooltip contentStyle={{ background: '#1A2332', border: '1px solid #243044', borderRadius: 8 }} />
        <Scatter data={data}>
          {data.map((entry) => (
            <Cell key={entry.gene} fill={entry.category ? palette[Math.max(0, categories.indexOf(entry.category)) % palette.length] : entry.sig ? (entry.logFC > 0 ? '#FF7043' : '#4ECDC4') : 'rgba(123,147,176,0.35)'} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function CapabilityRadarChart({ data }: { data: RadarPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <RadarChart data={data}>
        <PolarGrid stroke="#243044" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#7B93B0', fontSize: 10 }} />
        <PolarRadiusAxis tick={{ fill: '#7B93B0', fontSize: 9 }} />
        <Radar dataKey="ai" name="AI" stroke="#4ECDC4" fill="#4ECDC4" fillOpacity={0.2} />
        <Radar dataKey="bio" name="Bio" stroke="#FF7043" fill="#FF7043" fillOpacity={0.18} />
        <Tooltip contentStyle={{ background: '#1A2332', border: '1px solid #243044', borderRadius: 8 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
