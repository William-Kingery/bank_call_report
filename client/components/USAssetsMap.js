import { useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import { STATE_ABBR_TO_NAME, STATE_NAME_TO_ABBR } from '../data/usStates';
import styles from '../styles/USAssetsMap.module.css';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
const SMALL_STATE_ABBRS = new Set(['CT', 'DE', 'DC', 'MA', 'MD', 'NH', 'NJ', 'RI', 'VT']);
const SMALL_STATE_LABEL_OFFSETS = {
  VT: [28, -24],
  NH: [44, -4],
  MA: [52, 6],
  RI: [64, 26],
  CT: [46, 34],
  NJ: [48, 58],
  DE: [62, 76],
  MD: [36, 86],
  DC: [56, 102],
};

const USAssetsMap = ({
  stateAssetMap,
  minAsset,
  maxAsset,
  isStateInRegion,
  formatCurrency,
  getTileFill,
}) => {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const getRelativePosition = (event) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleMouseEnter = (event, geo) => {
    const abbr = geo.properties?.postal;
    const nameFromGeo = geo.properties?.name;
    const stateName = STATE_ABBR_TO_NAME[abbr] ?? nameFromGeo;
    if (!stateName) {
      return;
    }
    const value = stateAssetMap[stateName];
    const position = getRelativePosition(event);
    setTooltip({
      stateName,
      value,
      x: position.x,
      y: position.y,
    });
  };

  const handleMouseMove = (event) => {
    setTooltip((current) => {
      if (!current) {
        return current;
      }
      const position = getRelativePosition(event);
      return {
        ...current,
        x: position.x,
        y: position.y,
      };
    });
  };

  const handleMouseLeave = () => setTooltip(null);

  const mutedFill = 'var(--terminal-map-muted)';
  const emptyFill = 'var(--terminal-map-empty)';
  const strokeColor = 'var(--terminal-map-border)';

  return (
    <div ref={containerRef} className={styles.mapWrapper}>
      <ComposableMap
        projection="geoAlbersUsa"
        width={1000}
        height={500}
        className={styles.map}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies, projection }) =>
            geographies.map((geo) => {
              const abbr = geo.properties?.postal;
              const nameFromGeo = geo.properties?.name;
              const stateName = STATE_ABBR_TO_NAME[abbr] ?? nameFromGeo;
              const labelAbbr = abbr || (stateName ? STATE_NAME_TO_ABBR[stateName] : undefined);
              const value = stateName ? stateAssetMap[stateName] : undefined;
              const inRegion = stateName ? isStateInRegion(stateName) : false;
              const fill = !inRegion
                ? mutedFill
                : Number.isFinite(value)
                  ? getTileFill(value, minAsset, maxAsset)
                  : emptyFill;
              const projectedCentroid = projection?.(geoCentroid(geo));
              const [x, y] = projectedCentroid ?? geoCentroid(geo);
              const isSmallState = labelAbbr ? SMALL_STATE_ABBRS.has(labelAbbr) : false;
              const [offsetX, offsetY] = labelAbbr
                ? SMALL_STATE_LABEL_OFFSETS[labelAbbr] ?? [0, 0]
                : [0, 0];
              const labelX = x + offsetX;
              const labelY = y + offsetY;
              return (
                <g key={geo.rsmKey}>
                  <Geography
                    geography={geo}
                    fill={fill}
                    stroke={strokeColor}
                    strokeWidth={0.75}
                    onMouseEnter={(event) => handleMouseEnter(event, geo)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  />
                  {labelAbbr ? (
                    isSmallState ? (
                      <g className={styles.labelGroup}>
                        <line
                          x1={x}
                          y1={y}
                          x2={labelX}
                          y2={labelY}
                          className={styles.labelCalloutLine}
                        />
                        <circle cx={x} cy={y} r={2.4} className={styles.labelCalloutDot} />
                        <rect
                          x={labelX - 13}
                          y={labelY - 9}
                          width={26}
                          height={18}
                          rx={9}
                          className={styles.labelPill}
                        />
                        <text
                          x={labelX}
                          y={labelY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className={styles.labelPillText}
                        >
                          {labelAbbr}
                        </text>
                      </g>
                    ) : (
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className={styles.labelGroup}
                      >
                        <tspan
                          x={x}
                          dy={0}
                          className={inRegion ? styles.labelAbbr : styles.labelAbbrMuted}
                        >
                          {labelAbbr}
                        </tspan>
                      </text>
                    )
                  ) : null}
                </g>
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {tooltip ? (
        <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }}>
          <div className={styles.tooltipTitle}>{tooltip.stateName}</div>
          <div className={styles.tooltipValue}>
            {Number.isFinite(tooltip.value)
              ? formatCurrency(tooltip.value)
              : 'No data'}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default USAssetsMap;
