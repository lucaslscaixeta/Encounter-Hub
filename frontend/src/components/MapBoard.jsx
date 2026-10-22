import React from "react";
import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from "react-konva";
import { assetUrl } from "../api.js";

// Grade usada quando o mestre ainda não escolheu um mapa.
const DEFAULT_CELL = 50;
const DEFAULT_COLUMNS = 30;
const DEFAULT_ROWS = 20;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;

function useMapImage(url) {
  const [loaded, setLoaded] = React.useState({ url: null, image: null });

  React.useEffect(() => {
    if (!url) {
      return undefined;
    }

    const image = new window.Image();
    image.onload = () => setLoaded({ url, image });
    image.src = url;

    return () => {
      image.onload = null;
    };
  }, [url]);

  return url && loaded.url === url ? loaded.image : null;
}

function useElementSize(ref) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const element = ref.current;

    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function MapBoard({ map, tokens, currentUserId, canMoveToken, onMoveToken }) {
  const containerRef = React.useRef(null);
  const { width, height } = useElementSize(containerRef);
  const image = useMapImage(map ? assetUrl(map.url) : null);
  const [view, setView] = React.useState({ scale: 1, x: 0, y: 0 });

  const cell = map?.grid_size || DEFAULT_CELL;
  const boardWidth = image ? image.naturalWidth : DEFAULT_COLUMNS * cell;
  const boardHeight = image ? image.naturalHeight : DEFAULT_ROWS * cell;
  const columns = Math.ceil(boardWidth / cell);
  const rows = Math.ceil(boardHeight / cell);

  const fitToScreen = React.useCallback(() => {
    if (!width || !height) {
      return;
    }

    const scale = clamp(
      Math.min(width / boardWidth, height / boardHeight),
      MIN_SCALE,
      1
    );

    setView({
      scale,
      x: (width - boardWidth * scale) / 2,
      y: (height - boardHeight * scale) / 2,
    });
  }, [width, height, boardWidth, boardHeight]);

  // Reenquadra quando o mapa muda ou a área da mesa aparece.
  const fitKey = `${boardWidth}x${boardHeight}:${width > 0 && height > 0}`;
  const lastFitKey = React.useRef(null);

  React.useEffect(() => {
    if (lastFitKey.current !== fitKey && width && height) {
      lastFitKey.current = fitKey;
      fitToScreen();
    }
  }, [fitKey, fitToScreen, width, height]);

  function zoomAt(point, factor) {
    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE);
      const boardPoint = {
        x: (point.x - current.x) / current.scale,
        y: (point.y - current.y) / current.scale,
      };

      return {
        scale,
        x: point.x - boardPoint.x * scale,
        y: point.y - boardPoint.y * scale,
      };
    });
  }

  function handleWheel(event) {
    event.evt.preventDefault();
    const pointer = event.target.getStage().getPointerPosition();
    zoomAt(pointer, event.evt.deltaY > 0 ? 1 / 1.1 : 1.1);
  }

  function handleStageDragEnd(event) {
    // O dragend dos tokens também chega aqui; só o arrasto do fundo conta.
    if (event.target === event.target.getStage()) {
      setView((current) => ({
        ...current,
        x: event.target.x(),
        y: event.target.y(),
      }));
    }
  }

  function handleTokenDragEnd(token, event) {
    const node = event.target;
    const x = clamp(Math.round(node.x() / cell), 0, columns - 1);
    const y = clamp(Math.round(node.y() / cell), 0, rows - 1);

    // Encaixa o token no centro da célula.
    node.position({ x: x * cell, y: y * cell });

    if (x !== token.x || y !== token.y) {
      onMoveToken(token.id, x, y);
    }
  }

  const gridLines = React.useMemo(() => {
    const lines = [];

    for (let column = 0; column <= columns; column += 1) {
      lines.push([column * cell, 0, column * cell, rows * cell]);
    }

    for (let row = 0; row <= rows; row += 1) {
      lines.push([0, row * cell, columns * cell, row * cell]);
    }

    return lines;
  }, [columns, rows, cell]);

  const center = { x: width / 2, y: height / 2 };

  return (
    <div className="map-board" ref={containerRef}>
      {width > 0 && height > 0 && (
        <Stage
          width={width}
          height={height}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          draggable
          onWheel={handleWheel}
          onDragEnd={handleStageDragEnd}
        >
          <Layer listening={false}>
            {image ? (
              <KonvaImage image={image} width={boardWidth} height={boardHeight} />
            ) : (
              <Rect width={boardWidth} height={boardHeight} fill="#0b1b4a" />
            )}

            {gridLines.map((points, index) => (
              <Line
                key={index}
                points={points}
                stroke="rgba(255, 255, 255, 0.18)"
                strokeWidth={1 / view.scale}
              />
            ))}
          </Layer>

          <Layer>
            {tokens.map((token) => {
              const movable = canMoveToken(token);
              const isMine = token.owner_id === currentUserId;

              return (
                <Group
                  key={token.id}
                  x={token.x * cell}
                  y={token.y * cell}
                  draggable={movable}
                  onDragEnd={(event) => handleTokenDragEnd(token, event)}
                  onMouseEnter={(event) => {
                    if (movable) {
                      event.target.getStage().container().style.cursor = "grab";
                    }
                  }}
                  onMouseLeave={(event) => {
                    event.target.getStage().container().style.cursor = "";
                  }}
                >
                  <Circle
                    x={cell / 2}
                    y={cell / 2}
                    radius={cell * 0.4}
                    fill={token.color}
                    stroke={isMine ? "#ffffff" : "#061440"}
                    strokeWidth={Math.max(2, cell * 0.06)}
                    shadowColor="#000000"
                    shadowBlur={6}
                    shadowOpacity={0.5}
                  />
                  <Text
                    width={cell}
                    height={cell}
                    align="center"
                    verticalAlign="middle"
                    text={getInitials(token.name)}
                    fontSize={cell * 0.32}
                    fontStyle="bold"
                    fill="#061440"
                    listening={false}
                  />
                  <Text
                    y={cell * 0.9}
                    x={-cell / 2}
                    width={cell * 2}
                    align="center"
                    text={token.name}
                    fontSize={Math.max(10, cell * 0.22)}
                    fill="#ffffff"
                    stroke="#061440"
                    strokeWidth={0.4}
                    listening={false}
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>
      )}

      <div className="map-controls" role="group" aria-label="Zoom do mapa">
        <button type="button" onClick={() => zoomAt(center, 1.2)} aria-label="Aproximar">
          +
        </button>
        <button type="button" onClick={() => zoomAt(center, 1 / 1.2)} aria-label="Afastar">
          −
        </button>
        <button type="button" onClick={fitToScreen}>
          Ajustar
        </button>
      </div>
    </div>
  );
}

export default MapBoard;
