import { useMemo, useState, useRef, useEffect } from 'react';
import { scaleLinear } from '@visx/scale';
import { AreaClosed, LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { LinearGradient } from '@visx/gradient';
import { AxisBottom, AxisLeft, AxisRight } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '../utils/logger';
import type { Dive, TankPressure, DiveTank } from '../types';
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

// Colors for multiple tanks
const TANK_COLORS = [
  'var(--pressure-color)',      // Primary green
  '#ff9800',                    // Orange
  '#9c27b0',                    // Purple
  '#00bcd4',                    // Cyan
];

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
  const [tankPressures, setTankPressures] = useState<TankPressure[]>([]);
  const [diveTanks, setDiveTanks] = useState<DiveTank[]>([]);

  // Fetch tank pressures and dive tanks from database
  useEffect(() => {
    async function fetchTankData() {
      try {
        const [pressures, tanks] = await Promise.all([
          invoke<TankPressure[]>('get_tank_pressures', { diveId: dive.id }),
          invoke<DiveTank[]>('get_dive_tanks', { diveId: dive.id }),
        ]);
        setTankPressures(pressures);
        setDiveTanks(tanks);
      } catch (e) {
        logger.error('Failed to fetch tank data:', e);
      }
    }
    fetchTankData();
  }, [dive.id]);

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

  // Group tank pressures by sensor
  const tanksBySensor = useMemo(() => {
    const grouped = new Map<string, TankPressure[]>();
    for (const tp of tankPressures) {
      const key = String(tp.sensor_id);
      const existing = grouped.get(key) || [];
      existing.push(tp);
      grouped.set(key, existing);
    }
    // Sort each tank's readings by time
    for (const readings of grouped.values()) {
      readings.sort((a, b) => a.time_seconds - b.time_seconds);
    }
    return grouped;
  }, [tankPressures]);

  const { width, height } = dimensions;
  
  // Check if we have data for each metric - use tankPressures if available, fall back to samples
  const hasTankPressures = tanksBySensor.size > 0;
  const hasSamplePressure = samples.some(s => s.pressure_bar != null);
  const hasPressure = hasTankPressures || hasSamplePressure;
  const hasTemp = samples.some(s => s.temp_c != null);
  
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

  const { xScale, yScale, pressureScale, tempScale } = useMemo(() => {
    // Guard against empty samples or invalid dimensions
    const maxTime = samples.length > 0 ? Math.max(...samples.map((s) => s.time_seconds)) : 1;
    const maxDepth = samples.length > 0 ? Math.max(...samples.map((s) => s.depth_m)) : 1;
    const safeInnerWidth = Math.max(innerWidth, 1);
    const safeInnerHeight = Math.max(innerHeight, 1);

    const xScale = scaleLinear({
      domain: [0, maxTime || 1],
      range: [0, safeInnerWidth],
    });

    // Y scale is inverted (depth increases downward)
    const yScale = scaleLinear({
      domain: [0, (maxDepth || 1) * 1.1],
      range: [0, safeInnerHeight],
    });

    // Pressure scale (right axis) - starts high, goes low
    // Use tank pressures if available, otherwise fall back to sample pressures
    let allPressures: number[] = [];
    if (hasTankPressures) {
      allPressures = tankPressures.map(tp => tp.pressure_bar);
    } else {
      allPressures = samples.filter(s => s.pressure_bar != null).map(s => s.pressure_bar!);
    }
    const maxPressure = allPressures.length > 0 ? Math.max(...allPressures) : 200;
    const minPressure = allPressures.length > 0 ? Math.min(...allPressures) : 0;
    const pressureScale = scaleLinear({
      domain: [maxPressure * 1.05, Math.max(0, minPressure - 10)],
      range: [0, safeInnerHeight],
    });

    // Temperature scale - overlaid on depth area
    const temps = samples.filter(s => s.temp_c != null).map(s => s.temp_c!);
    const maxTemp = temps.length > 0 ? Math.max(...temps) : 30;
    const minTemp = temps.length > 0 ? Math.min(...temps) : 20;
    const tempRange = maxTemp - minTemp || 5;
    const tempScale = scaleLinear({
      domain: [minTemp - tempRange * 0.2, maxTemp + tempRange * 0.2],
      range: [safeInnerHeight, 0],
    });

    return { xScale, yScale, pressureScale, tempScale };
  }, [samples, tankPressures, hasTankPressures, innerWidth, innerHeight]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    return `${mins}min`;
  };

  // Filter samples with valid data for each line
  const pressureSamples = samples.filter(s => s.pressure_bar != null);
  const tempSamples = samples.filter(s => s.temp_c != null);

  // Detect safety stop at ~5m near the end of the dive
  const safetyStop = useMemo(() => {
    if (samples.length < 3) return null;
    
    const SAFETY_DEPTH_MIN = 3.0; // meters - lower bound of safety stop zone
    const SAFETY_DEPTH_MAX = 6.0; // meters - upper bound of safety stop zone
    const SPIKE_DEPTH_MAX = 8.0;  // meters - allow brief spikes up to this depth
    const SHALLOW_DIP_MIN = 1.0;  // meters - allow brief shallow dips down to this depth
    const MAX_OOZ_SECONDS = 60;   // max consecutive seconds out-of-zone before breaking
    const FULL_STOP_SECONDS = 180; // 3 minutes = full safety stop
    
    // Find the last sample actually in the safety zone (3-6m), searching backward from end
    let endIdx = samples.length - 1;
    while (endIdx > 0 && (samples[endIdx].depth_m < SAFETY_DEPTH_MIN || samples[endIdx].depth_m > SAFETY_DEPTH_MAX)) {
      endIdx--;
    }
    
    if (endIdx <= 0) return null;
    
    // Safety stop should be near the end of the dive (last 50% by time)
    const maxTime = samples[samples.length - 1].time_seconds;
    if (samples[endIdx].time_seconds < maxTime * 0.5) return null;
    
    // Walk backwards, allowing brief excursions outside the zone (time-based tolerance)
    let startIdx = endIdx;
    let oozStartTime: number | null = null; // time when out-of-zone streak began
    while (startIdx > 0) {
      const prevDepth = samples[startIdx - 1].depth_m;
      const inZone = prevDepth >= SAFETY_DEPTH_MIN && prevDepth <= SAFETY_DEPTH_MAX;
      const isSmallSpike = prevDepth > SAFETY_DEPTH_MAX && prevDepth <= SPIKE_DEPTH_MAX;
      const isShallowDip = prevDepth < SAFETY_DEPTH_MIN && prevDepth >= SHALLOW_DIP_MIN;
      
      if (inZone) {
        oozStartTime = null;
        startIdx--;
      } else if (isSmallSpike || isShallowDip) {
        // Track time-based out-of-zone duration
        if (oozStartTime === null) {
          oozStartTime = samples[startIdx].time_seconds;
        }
        const oozDuration = oozStartTime - samples[startIdx - 1].time_seconds;
        if (oozDuration > MAX_OOZ_SECONDS) break;
        startIdx--;
      } else {
        break;
      }
    }
    
    // If we ended on a spike, move startIdx forward to the first in-zone sample
    while (startIdx < endIdx && (samples[startIdx].depth_m < SAFETY_DEPTH_MIN || samples[startIdx].depth_m > SAFETY_DEPTH_MAX)) {
      startIdx++;
    }
    
    const startTime = samples[startIdx].time_seconds;
    const endTime = samples[endIdx].time_seconds;
    const durationSeconds = endTime - startTime;
    
    // Need at least some meaningful time in the zone (>15 seconds) to count
    if (durationSeconds < 15) return null;
    
    // Color: green at >=3min, interpolates through yellow to red as time decreases
    let color: string;
    if (durationSeconds >= FULL_STOP_SECONDS) {
      color = 'rgba(76, 175, 80, 0.18)'; // green
    } else {
      // Ratio from 0 (no time) to 1 (full 3 min)
      const ratio = durationSeconds / FULL_STOP_SECONDS;
      // Interpolate: red(0) -> yellow(0.5) -> green(1)
      let r: number, g: number, b: number;
      if (ratio < 0.5) {
        // Red to yellow (0 -> 0.5)
        const t = ratio / 0.5;
        r = 244;
        g = Math.round(67 + (180 - 67) * t); // 67 -> 180
        b = Math.round(54 + (0 - 54) * t);   // 54 -> 0
      } else {
        // Yellow to green (0.5 -> 1)
        const t = (ratio - 0.5) / 0.5;
        r = Math.round(244 + (76 - 244) * t);  // 244 -> 76
        g = Math.round(180 + (175 - 180) * t); // 180 -> 175
        b = Math.round(0 + (80 - 0) * t);      // 0 -> 80
      }
      color = `rgba(${r}, ${g}, ${b}, 0.18)`;
    }
    
    return { startTime, endTime: samples[samples.length - 1].time_seconds, durationSeconds, color };
  }, [samples]);

  // Calculate air consumption stats - use primary tank (most readings) if tank pressures available
  const airUsed = useMemo(() => {
    if (hasTankPressures && tanksBySensor.size > 0) {
      // Find tank with most readings (primary tank)
      let primaryTank: TankPressure[] = [];
      for (const readings of tanksBySensor.values()) {
        if (readings.length > primaryTank.length) {
          primaryTank = readings;
        }
      }
      if (primaryTank.length >= 2) {
        const start = primaryTank[0].pressure_bar;
        const end = primaryTank[primaryTank.length - 1].pressure_bar;
        return start - end;
      }
    }
    // Fall back to sample pressures
    const startPressure = pressureSamples[0]?.pressure_bar;
    const endPressure = pressureSamples[pressureSamples.length - 1]?.pressure_bar;
    return startPressure && endPressure ? startPressure - endPressure : null;
  }, [hasTankPressures, tanksBySensor, pressureSamples]);
  
  // Tank sensor array for rendering multiple lines
  const tankSensors = useMemo(() => {
    return Array.from(tanksBySensor.entries()).map(([sensorId, readings], index) => ({
      sensorId,
      readings,
      color: TANK_COLORS[index % TANK_COLORS.length],
      name: readings[0]?.sensor_name || `Tank ${index + 1}`,
    }));
  }, [tanksBySensor]);

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
        {diveTanks.length > 0 && diveTanks.some(t => t.o2_percent && t.o2_percent !== 21) && (
          <div className="stat">
            <span className="stat-value">
              {diveTanks.map(t => {
                if (!t.o2_percent || t.o2_percent === 21) return null;
                if (t.he_percent && t.he_percent > 0) {
                  return `TX${t.o2_percent}/${t.he_percent}`;
                }
                return `EAN${t.o2_percent}`;
              }).filter(Boolean).join(', ')}
            </span>
            <span className="stat-label">Gas</span>
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
        {/* Show individual tank legends if multiple tanks, otherwise generic "Tank Pressure" */}
        {hasTankPressures && tankSensors.length > 1 ? (
          tankSensors.map((tank) => (
            <span key={tank.sensorId} className="legend-item" style={{ color: tank.color }}>
              <span className="legend-line" style={{ backgroundColor: tank.color }}></span> {tank.name}
            </span>
          ))
        ) : hasPressure && (
          <span className="legend-item legend-pressure">
            <span className="legend-line"></span> Tank Pressure
          </span>
        )}
        {hasTemp && (
          <span className="legend-item legend-temp">
            <span className="legend-line"></span> Temperature
          </span>
        )}
        {safetyStop && (
          <span className="legend-item">
            <span className="legend-line" style={{ backgroundColor: safetyStop.color.replace('0.18', '0.6'), height: 10, borderRadius: 2 }}></span> Safety Stop ({Math.floor(safetyStop.durationSeconds / 60)}:{String(safetyStop.durationSeconds % 60).padStart(2, '0')})
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
        
        <g transform={`translate(${margin.left}, ${margin.top})`}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border-color)"
            strokeOpacity={0.4}
            numTicks={5}
          />
          
          {/* Safety stop band */}
          {safetyStop && (
            <rect
              x={xScale(safetyStop.startTime)}
              y={0}
              width={Math.max(0, xScale(safetyStop.endTime) - xScale(safetyStop.startTime))}
              height={innerHeight}
              fill={safetyStop.color}
              rx={2}
            />
          )}
          
          {/* Depth area fill - only render if we have samples */}
          {samples.length > 0 && (
            <AreaClosed
              data={samples}
              x={(d) => xScale(d.time_seconds)}
              y={(d) => yScale(d.depth_m)}
              yScale={yScale}
              curve={curveMonotoneX}
              fill="url(#depth-gradient)"
            />
          )}
          
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
          
          {/* Depth line - only render if we have samples */}
          {samples.length > 0 && (
            <LinePath
              data={samples}
              x={(d) => xScale(d.time_seconds)}
              y={(d) => yScale(d.depth_m)}
              stroke="var(--depth-primary)"
              strokeWidth={2.5}
              curve={curveMonotoneX}
            />
          )}
          
          {/* Tank pressure lines - render each tank with its own color */}
          {hasTankPressures && tankSensors.map((tank) => (
            <LinePath
              key={tank.sensorId}
              data={tank.readings}
              x={(d) => xScale(d.time_seconds)}
              y={(d) => pressureScale(d.pressure_bar)}
              stroke={tank.color}
              strokeWidth={2}
              curve={curveMonotoneX}
              strokeOpacity={0.9}
            />
          ))}
          
          {/* Fallback: Pressure line from samples (for non-tank-pressure data) */}
          {!hasTankPressures && hasSamplePressure && pressureSamples.length > 1 && (
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
