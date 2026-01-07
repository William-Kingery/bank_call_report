import { useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import { STATE_ABBR_TO_NAME, STATE_NAME_TO_ABBR } from '../data/usStates';
import styles from '../styles/USAssetsMap.module.css';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

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

  return (
    <div ref={containerRef} className={styles.mapWrapper}>
      <ComposableMap
        projection="geoAlbersUsa"
        width={1400}
        height={880}
        className={styles.map}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const abbr = geo.properties?.postal;
              const nameFromGeo = geo.properties?.name;
              const stateName = STATE_ABBR_TO_NAME[abbr] ?? nameFromGeo;
              const labelAbbr = abbr || (stateName ? STATE_NAME_TO_ABBR[stateName] : undefined);
              const value = stateName ? stateAssetMap[stateName] : undefined;
              const inRegion = stateName ? isStateInRegion(stateName) : false;
              const fill = !inRegion
                ? '#f1f5f9'
                : Number.isFinite(value)
                  ? getTileFill(value, minAsset, maxAsset)
                  : '#e5e7eb';
              const [x, y] = geoCentroid(geo);
              return (
                <g key={geo.rsmKey}>
                  <Geography
                    geography={geo}
                    fill={fill}
                    stroke="#ffffff"
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
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={inRegion ? styles.label : styles.labelMuted}
                    >
                      {labelAbbr}
                    </text>
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
