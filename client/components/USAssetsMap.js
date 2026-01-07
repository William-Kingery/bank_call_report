import { useRef, useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { geoCentroid } from 'd3-geo';
import { STATE_ABBR_TO_NAME, STATE_NAME_TO_ABBR } from '../data/usStates';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const tooltipStyles = {
  position: 'absolute',
  padding: '10px 12px',
  background: 'rgba(15, 23, 42, 0.9)',
  color: '#f8fafc',
  borderRadius: '8px',
  fontSize: '13px',
  pointerEvents: 'none',
  transform: 'translate(-50%, -120%)',
  whiteSpace: 'nowrap',
  zIndex: 2,
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

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <ComposableMap
        projection="geoAlbersUsa"
        width={1200}
        height={760}
        style={{ width: '100%', height: 'auto', maxWidth: '1200px', margin: '0 auto' }}
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
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        fill: inRegion ? '#1f2937' : '#94a3b8',
                        pointerEvents: 'none',
                      }}
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
        <div style={{ ...tooltipStyles, left: tooltip.x, top: tooltip.y }}>
          <div style={{ fontWeight: 600 }}>{tooltip.stateName}</div>
          <div>
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
