import { useMemo, useState, useRef, useEffect } from 'react';
import { scaleLinear } from '@visx/scale';
import { AreaClosed, LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { LinearGradient } from '@visx/gradient';
import { AxisBottom, AxisLeft, AxisRight } from '@visx/axis';
import { GridRows } from '@visx/grid';
import type { Dive } from '../types';
import './DiveProfile.css';

interface DiveSample {
  time_seconds: number;
  depth_m: number;
  temp_c?: number | null;
  pressure_bar?: number | null;
  ndl_seconds?: number | null;
  rbt_seconds?: number | null;
}

interface DiveProfileProps {
  dive: Dive;
  samples?: DiveSample[];
}

// Mock samples for demo
const mockSamples: DiveSample[] = [
  { time_seconds: 0, depth_m: 0, pressure_bar: 200, temp_c: 28, ndl_seconds: 99 * 60 },
  { time_seconds: 60, depth_m: 5.2, pressure_bar: 195, temp_c: 28, ndl_seconds: 99 * 60 },
  { time_seconds: 120, depth_m: 12.4, pressure_bar: 188, temp_c: 27, ndl_seconds: 60 * 60 },
  { time_seconds: 180, depth_m: 18.2, pressure_bar: 180, temp_c: 26, ndl_seconds: 45 * 60 },
  { time_seconds: 240, depth_m: 22.1, pressure_bar: 170, temp_c: 25, ndl_seconds: 35 * 60 },
  { time_seconds: 300, depth_m: 22.8, pressure_bar: 160, temp_c: 25, ndl_seconds: 32 * 60, rbt_seconds: 45 * 60 },
  { time_seconds: 600, depth_m: 20.5, pressure_bar: 140, temp_c: 25, ndl_seconds: 28 * 60, rbt_seconds: 35 * 60 },
  { time_seconds: 900, depth_m: 18.2, pressure_bar: 120, temp_c: 26, ndl_seconds: 30 * 60, rbt_seconds: 28 * 60 },
  { time_seconds: 1200, depth_m: 15.1, pressure_bar: 105, temp_c: 26, ndl_seconds: 40 * 60, rbt_seconds: 22 * 60 },
  { time_seconds: 1500, depth_m: 12.4, pressure_bar: 90, temp_c: 27, ndl_seconds: 55 * 60, rbt_seconds: 18 * 60 },
  { time_seconds: 1800, depth_m: 10.2, pressure_bar: 78, temp_c: 27, ndl_seconds: 70 * 60, rbt_seconds: 14 * 60 },
  { time_seconds: 2100, depth_m: 8.5, pressure_bar: 68, temp_c: 27, ndl_seconds: 85 * 60, rbt_seconds: 10 * 60 },
  { time_seconds: 2400, depth_m: 6.2, pressure_bar: 60, temp_c: 28, ndl_seconds: 99 * 60, rbt_seconds: 8 * 60 },
  { time_seconds: 2700, depth_m: 5.8, pressure_bar: 55, temp_c: 28, ndl_seconds: 99 * 60, rbt_seconds: 6 * 60 },
  { time_seconds: 3000, depth_m: 5.2, pressure_bar: 52, temp_c: 28, ndl_seconds: 99 * 60, rbt_seconds: 5 * 60 },
  { time_seconds: 3300, depth_m: 5.0, pressure_bar: 50, temp_c: 28, ndl_seconds: 99 * 60, rbt_seconds: 4 * 60 },
  { time_seconds: 3600, depth_m: 3.2, pressure_bar: 48, temp_c: 28, ndl_seconds: 99 * 60 },
  { time_seconds: 3900, depth_m: 1.5, pressure_bar: 46, temp_c: 28, ndl_seconds: 99 * 60 },
  { time_seconds: 4000, depth_m: 0, pressure_bar: 45, temp_c: 28, ndl_seconds: 99 * 60 },
];

export function DiveProfile({
  dive,
  samples = mockSamples,
}: DiveProfileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 220 });

  // Responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        // Height scales proportionally with a min/max
        const height = Math.min(Math.max(width * 0.25, 180), 350);
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const { width, height } = dimensions;
  
  // Check if we have data for each metric
  const hasPressure = samples.some(s => s.pressure_bar != null);
  const hasTemp = samples.some(s => s.temp_c != null);
  const hasNdl = samples.some(s => s.ndl_seconds != null);
  const hasRbt = samples.some(s => s.rbt_seconds != null);
  
  // Count how many right axes we need
  const rightAxisCount = [hasPressure, hasTemp].filter(Boolean).length;
  
  // Adjust margins based on which axes we need
  const margin = { 
    top: 20, 
    right: rightAxisCount > 1 ? 110 : (rightAxisCount > 0 ? 60 : 20), 
    bottom: 40, 
    left: 50 
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const { xScale, yScale, pressureScale, tempScale, ndlScale } = useMemo(() => {
    const maxTime = Math.max(...samples.map((s) => s.time_seconds));
    const maxDepth = Math.max(...samples.map((s) => s.depth_m));

    const xScale = scaleLinear({
      domain: [0, maxTime],
      range: [0, innerWidth],
    });

    // Y scale is inverted (depth increases downward)
    const yScale = scaleLinear({
      domain: [0, maxDepth * 1.1],
      range: [0, innerHeight],
    });

    // Pressure scale (right axis) - starts high, goes low
    const pressures = samples.filter(s => s.pressure_bar != null).map(s => s.pressure_bar!);
    const maxPressure = pressures.length > 0 ? Math.max(...pressures) : 200;
    const minPressure = pressures.length > 0 ? Math.min(...pressures) : 0;
    const pressureScale = scaleLinear({
      domain: [maxPressure * 1.05, Math.max(0, minPressure - 10)],
      range: [0, innerHeight],
    });

    // Temperature scale - overlaid on depth area
    const temps = samples.filter(s => s.temp_c != null).map(s => s.temp_c!);
    const maxTemp = temps.length > 0 ? Math.max(...temps) : 30;
    const minTemp = temps.length > 0 ? Math.min(...temps) : 20;
    const tempRange = maxTemp - minTemp || 5;
    const tempScale = scaleLinear({
      domain: [minTemp - tempRange * 0.2, maxTemp + tempRange * 0.2],
      range: [innerHeight, 0],
    });

    // NDL scale - time in minutes, shown as a bar chart style from top
    const ndls = samples.filter(s => s.ndl_seconds != null).map(s => s.ndl_seconds!);
    const maxNdl = ndls.length > 0 ? Math.max(...ndls) : 60 * 60; // Max 60 min
    const ndlScale = scaleLinear({
      domain: [0, Math.min(maxNdl, 99 * 60)], // Cap at 99 min (often shown as 99+ on computers)
      range: [innerHeight, 0],
    });

    return { xScale, yScale, pressureScale, tempScale, ndlScale };
  }, [samples, innerWidth, innerHeight]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}min`;
  };

  // Filter samples with valid data for each line
  const pressureSamples = samples.filter(s => s.pressure_bar != null);
  const tempSamples = samples.filter(s => s.temp_c != null);
  const ndlSamples = samples.filter(s => s.ndl_seconds != null && s.ndl_seconds < 99 * 60);
  const rbtSamples = samples.filter(s => s.rbt_seconds != null);

  // Calculate air consumption stats
  const startPressure = pressureSamples[0]?.pressure_bar;
  const endPressure = pressureSamples[pressureSamples.length - 1]?.pressure_bar;
  const airUsed = startPressure && endPressure ? startPressure - endPressure : null;

  // Get minimum NDL during dive (most critical point)
  const minNdl = ndlSamples.length > 0 
    ? Math.min(...ndlSamples.map(s => s.ndl_seconds!)) 
    : null;
  
  // Get minimum RBT during dive (most critical point)
  const minRbt = rbtSamples.length > 0 
    ? Math.min(...rbtSamples.map(s => s.rbt_seconds!)) 
    : null;

  return (
    <div className="dive-profile">
      <div className="dive-profile-stats">
        <div className="stat">
          <span className="stat-value">{dive.max_depth_m.toFixed(1)}m</span>
          <span className="stat-label">Max Depth</span>
        </div>
        <div className="stat">
          <span className="stat-value">{Math.floor(dive.duration_seconds / 60)}min</span>
          <span className="stat-label">Duration</span>
        </div>
        {dive.water_temp_c && (
          <div className="stat">
            <span className="stat-value">{dive.water_temp_c.toFixed(1)}°C</span>
            <span className="stat-label">Water Temp</span>
          </div>
        )}
        {airUsed != null && (
          <div className="stat">
            <span className="stat-value">{airUsed.toFixed(0)} bar</span>
            <span className="stat-label">Air Used</span>
          </div>
        )}
        {dive.nitrox_o2_percent && dive.nitrox_o2_percent > 21 && (
          <div className="stat">
            <span className="stat-value">EAN{dive.nitrox_o2_percent.toFixed(0)}</span>
            <span className="stat-label">Gas</span>
          </div>
        )}
        {minNdl != null && (
          <div className="stat">
            <span className="stat-value">{Math.floor(minNdl / 60)}min</span>
            <span className="stat-label">Min NDL</span>
          </div>
        )}
        {hasRbt && minRbt != null && (
          <div className="stat">
            <span className="stat-value">{Math.floor(minRbt / 60)}min</span>
            <span className="stat-label">Min RBT</span>
          </div>
        )}
        {dive.cns_percent != null && dive.cns_percent > 0 && (
          <div className="stat">
            <span className="stat-value">{dive.cns_percent.toFixed(0)}%</span>
            <span className="stat-label">CNS</span>
          </div>
        )}
      </div>

      <div className="dive-profile-legend">
        <span className="legend-item legend-depth">
          <span className="legend-line"></span> Depth
        </span>
        {hasPressure && (
          <span className="legend-item legend-pressure">
            <span className="legend-line"></span> Tank Pressure
          </span>
        )}
        {hasTemp && (
          <span className="legend-item legend-temp">
            <span className="legend-line"></span> Temperature
          </span>
        )}
        {hasNdl && (
          <span className="legend-item legend-ndl">
            <span className="legend-line"></span> NDL
          </span>
        )}
      </div>
      
      <div ref={containerRef} className="dive-profile-chart-container">
        <svg width={width} height={height} className="dive-profile-chart">
        <LinearGradient
          id="depth-gradient"
          from="var(--depth-primary)"
          to="var(--depth-gradient)"
          fromOpacity={0.6}
          toOpacity={0.1}
        />
        <LinearGradient
          id="ndl-gradient"
          from="var(--ndl-color, #22c55e)"
          to="var(--ndl-color, #22c55e)"
          fromOpacity={0.3}
          toOpacity={0.1}
        />
        
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border-color)"
            strokeOpacity={0.4}
            numTicks={5}
          />
          
          {/* NDL area fill - drawn first so it's behind everything */}
          {hasNdl && ndlSamples.length > 1 && (
            <AreaClosed
              data={ndlSamples}
              x={(d) => xScale(d.time_seconds)}
              y={(d) => ndlScale(d.ndl_seconds!)}
              yScale={ndlScale}
              curve={curveMonotoneX}
              fill="url(#ndl-gradient)"
            />
          )}
          
          {/* Depth area fill */}
          <AreaClosed
            data={samples}
            x={(d) => xScale(d.time_seconds)}
            y={(d) => yScale(d.depth_m)}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="url(#depth-gradient)"
          />
          
          {/* Temperature line - drawn first so it's behind */}
          {hasTemp && tempSamples.length > 1 && (
            <LinePath
              data={tempSamples}
              x={(d) => xScale(d.time_seconds)}
              y={(d) => tempScale(d.temp_c!)}
              stroke="var(--temp-color)"
              strokeWidth={2}
              strokeDasharray="4,4"
              curve={curveMonotoneX}
              strokeOpacity={0.8}
            />
          )}
          
          {/* Depth line */}
          <LinePath
            data={samples}
            x={(d) => xScale(d.time_seconds)}
            y={(d) => yScale(d.depth_m)}
            stroke="var(--depth-primary)"
            strokeWidth={2.5}
            curve={curveMonotoneX}
          />
          
          {/* NDL line */}
          {hasNdl && ndlSamples.length > 1 && (
            <LinePath
              data={ndlSamples}
              x={(d) => xScale(d.time_seconds)}
              y={(d) => ndlScale(d.ndl_seconds!)}
              stroke="var(--ndl-color, #22c55e)"
              strokeWidth={1.5}
              strokeDasharray="2,2"
              curve={curveMonotoneX}
              strokeOpacity={0.7}
            />
          )}
          
          {/* Pressure line */}
          {hasPressure && pressureSamples.length > 1 && (
            <LinePath
              data={pressureSamples}
              x={(d) => xScale(d.time_seconds)}
              y={(d) => pressureScale(d.pressure_bar!)}
              stroke="var(--pressure-color)"
              strokeWidth={2}
              curve={curveMonotoneX}
              strokeOpacity={0.9}
            />
          )}
          
          {/* X Axis - Time */}
          <AxisBottom
            scale={xScale}
            top={innerHeight}
            stroke="var(--border-color)"
            tickStroke="var(--border-color)"
            tickLabelProps={() => ({
              fill: 'var(--text-muted)',
              fontSize: 11,
              textAnchor: 'middle',
            })}
            tickFormat={(v) => formatTime(v as number)}
            numTicks={8}
          />
          
          {/* Left Axis - Depth */}
          <AxisLeft
            scale={yScale}
            stroke="var(--border-color)"
            tickStroke="var(--border-color)"
            tickLabelProps={() => ({
              fill: 'var(--depth-primary)',
              fontSize: 11,
              textAnchor: 'end',
              dx: -4,
            })}
            tickFormat={(v) => `${v}m`}
            numTicks={5}
          />
          
          {/* Right Axis - Pressure */}
          {hasPressure && (
            <AxisRight
              scale={pressureScale}
              left={innerWidth}
              stroke="var(--border-color)"
              tickStroke="var(--border-color)"
              tickLabelProps={() => ({
                fill: 'var(--pressure-color)',
                fontSize: 11,
                textAnchor: 'start',
                dx: 4,
              })}
              tickFormat={(v) => `${v}bar`}
              numTicks={5}
            />
          )}
          
          {/* Right Axis - Temperature (offset if pressure also shown) */}
          {hasTemp && (
            <AxisRight
              scale={tempScale}
              left={innerWidth + (hasPressure ? 50 : 0)}
              stroke="var(--border-color)"
              tickStroke="var(--border-color)"
              tickLabelProps={() => ({
                fill: 'var(--temp-color)',
                fontSize: 11,
                textAnchor: 'start',
                dx: 4,
              })}
              tickFormat={(v) => `${v}°C`}
              numTicks={5}
            />
          )}
        </g>
      </svg>
      </div>
    </div>
  );
}
