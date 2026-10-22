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
  Transformer,
} from "react-konva";
import { assetUrl } from "../api.js";

// Grade usada quando o mestre ainda não escolheu um mapa.
const DEFAULT_CELL = 50;
const DEFAULT_COLUMNS = 30;
const DEFAULT_ROWS = 20;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const MAX_TOKEN_SIZE = 10;
const MIN_MAP_DIMENSION = 20;

function useLoadedImage(url) {
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

function setCursor(event, cursor) {
  event.target.getStage().container().style.cursor = cursor;
}

function TokenNode({
  token,
  cell,
  isMine,
  movable,
  nodeRef,
  onSelect,
  onDragEnd,
  onTransformEnd,
}) {
  const image = useLoadedImage(token.image_url ? assetUrl(token.image_url) : null);
  const side = token.size * cell;
  const radius = side * 0.45;

  // O grupo externo arrasta o token inteiro; as alças de tamanho ficam
  // só no corpo (nodeRef), para não incluírem o nome escrito embaixo.
  return (
    <Group
      x={token.x * cell}
      y={token.y * cell}
      draggable={movable}
      onMouseDown={movable ? onSelect : undefined}
      onTap={movable ? onSelect : undefined}
      onDragEnd={onDragEnd}
      onMouseEnter={(event) => movable && setCursor(event, "grab")}
      onMouseLeave={(event) => setCursor(event, "")}
    >
     <Group ref={nodeRef} onTransformEnd={onTransformEnd}>
      {/* Área invisível que define o tamanho do token para as alças. */}
      <Rect width={side} height={side} fill="transparent" />

      {image ? (
        <Group
          clipFunc={(context) => {
            context.arc(side / 2, side / 2, radius, 0, Math.PI * 2);
          }}
          listening={false}
        >
          <KonvaImage
            image={image}
            x={side / 2 - radius}
            y={side / 2 - radius}
            width={radius * 2}
            height={radius * 2}
          />
        </Group>
      ) : (
        <>
          <Circle
            x={side / 2}
            y={side / 2}
            radius={radius}
            fill={token.color}
            listening={false}
          />
          <Text
            width={side}
            height={side}
            align="center"
            verticalAlign="middle"
            text={getInitials(token.name)}
            fontSize={side * 0.32}
            fontStyle="bold"
            fill="#061440"
            listening={false}
          />
        </>
      )}

      {/* Borda na cor do token; branca para os tokens do próprio usuário. */}
      <Circle
        x={side / 2}
        y={side / 2}
        radius={radius}
        stroke={image ? token.color : isMine ? "#ffffff" : "#061440"}
        strokeWidth={Math.max(2, cell * 0.06)}
        shadowColor="#000000"
        shadowBlur={6}
        shadowOpacity={0.5}
        listening={false}
      />
     </Group>

      <Text
        y={side - cell * 0.05}
        x={-cell / 2}
        width={side + cell}
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
}

function MapBoard({
  map,
  tokens,
  currentUserId,
  canEditMap,
  canMoveToken,
  onUpdateToken,
  onUpdateMap,
}) {
  const containerRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const tokenRefs = React.useRef(new Map());
  const transformerRef = React.useRef(null);
  const { width, height } = useElementSize(containerRef);
  const image = useLoadedImage(map ? assetUrl(map.url) : null);
  const [view, setView] = React.useState({ scale: 1, x: 0, y: 0 });
  // "map", o id de um token ou null.
  const [selected, setSelected] = React.useState(null);

  const cell = map?.grid_size || DEFAULT_CELL;
  const mapBox = image
    ? {
        x: map.x,
        y: map.y,
        width: map.width ?? image.naturalWidth,
        height: map.height ?? image.naturalHeight,
      }
    : null;

  // Grade definida pelo mestre (em quadrados) ou, sem isso, a que cobre
  // o mapa inteiro (ou a área padrão quando não há mapa).
  const hasCustomGrid = Boolean(map?.grid_columns && map?.grid_rows);
  let columns;
  let rows;

  if (hasCustomGrid) {
    columns = map.grid_columns;
    rows = map.grid_rows;
  } else if (mapBox) {
    columns = Math.ceil(Math.max(cell, mapBox.x + mapBox.width) / cell);
    rows = Math.ceil(Math.max(cell, mapBox.y + mapBox.height) / cell);
  } else {
    columns = DEFAULT_COLUMNS;
    rows = DEFAULT_ROWS;
  }

  const boardWidth = columns * cell;
  const boardHeight = rows * cell;

  const selectedToken =
    typeof selected === "number"
      ? tokens.find((token) => token.id === selected)
      : null;
  const isMapSelected = selected === "map" && canEditMap && mapBox;

  // Esquece a seleção se o item sumir ou deixar de ser editável.
  const activeSelection = isMapSelected
    ? "map"
    : selectedToken && canMoveToken(selectedToken)
      ? selectedToken.id
      : null;

  React.useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    const node =
      activeSelection === "map"
        ? mapRef.current
        : tokenRefs.current.get(activeSelection);

    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [activeSelection, tokens, map, image]);

  React.useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSelected(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // Reenquadra só quando o mapa muda ou a área da mesa aparece,
  // não a cada redimensionamento feito pelo mestre.
  const fitKey = [
    map?.id ?? "none",
    Boolean(image),
    hasCustomGrid ? `${columns}x${rows}x${cell}` : "auto",
    width > 0 && height > 0,
  ].join(":");
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

  function handleStageMouseDown(event) {
    // Clicar no fundo (fora do mapa e dos tokens) desfaz a seleção.
    if (event.target === event.target.getStage()) {
      setSelected(null);
    }
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

  function snapToken(token, node, size) {
    const x = clamp(Math.round(node.x() / cell), 0, columns - 1);
    const y = clamp(Math.round(node.y() / cell), 0, rows - 1);

    // Encaixa o token na grade.
    node.position({ x: x * cell, y: y * cell });

    if (x !== token.x || y !== token.y || size !== token.size) {
      onUpdateToken(token.id, { x, y, size });
    }
  }

  function handleTokenTransformEnd(token, event) {
    // As alças mexem só no corpo; passamos o deslocamento para o grupo
    // externo (que guarda a posição) e o tamanho volta a vir das props.
    const body = event.target;
    const group = body.getParent();
    const size = clamp(
      Math.round(token.size * body.scaleX()),
      1,
      MAX_TOKEN_SIZE
    );

    group.position({ x: group.x() + body.x(), y: group.y() + body.y() });
    body.setAttrs({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
    snapToken(token, group, size);
  }

  function handleMapTransformEnd() {
    const node = mapRef.current;
    const box = {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.round(Math.max(MIN_MAP_DIMENSION, node.width() * node.scaleX())),
      height: Math.round(Math.max(MIN_MAP_DIMENSION, node.height() * node.scaleY())),
    };

    node.setAttrs({ ...box, scaleX: 1, scaleY: 1 });
    onUpdateMap(box);
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
          onMouseDown={handleStageMouseDown}
          onTouchStart={handleStageMouseDown}
          onDragEnd={handleStageDragEnd}
        >
          <Layer>
            {/* Fundo da área da grade, visível onde a imagem não cobre. */}
            <Rect
              width={boardWidth}
              height={boardHeight}
              fill="#0b1b4a"
              listening={false}
            />

            {mapBox && (
              <KonvaImage
                ref={mapRef}
                image={image}
                x={mapBox.x}
                y={mapBox.y}
                width={mapBox.width}
                height={mapBox.height}
                listening={canEditMap}
                onMouseDown={() => setSelected("map")}
                onTap={() => setSelected("map")}
                onTransformEnd={handleMapTransformEnd}
              />
            )}
          </Layer>

          <Layer listening={false}>
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
            {tokens.map((token) => (
              <TokenNode
                key={token.id}
                token={token}
                cell={cell}
                isMine={token.owner_id === currentUserId}
                movable={canMoveToken(token)}
                nodeRef={(node) => {
                  if (node) {
                    tokenRefs.current.set(token.id, node);
                  } else {
                    tokenRefs.current.delete(token.id);
                  }
                }}
                onSelect={() => setSelected(token.id)}
                onDragEnd={(event) => snapToken(token, event.target, token.size)}
                onTransformEnd={(event) => handleTokenTransformEnd(token, event)}
              />
            ))}

            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              flipEnabled={false}
              keepRatio={activeSelection !== "map"}
              enabledAnchors={
                activeSelection === "map"
                  ? undefined
                  : ["top-left", "top-right", "bottom-left", "bottom-right"]
              }
              borderStroke="#ffb82e"
              anchorStroke="#ffb82e"
              anchorFill="#061440"
              anchorSize={10}
              boundBoxFunc={(oldBox, newBox) => {
                const minimum =
                  activeSelection === "map"
                    ? MIN_MAP_DIMENSION
                    : (cell / 2) * view.scale;

                return Math.abs(newBox.width) < minimum ||
                  Math.abs(newBox.height) < minimum
                  ? oldBox
                  : newBox;
              }}
            />
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

      {activeSelection !== null && (
        <p className="board-selection-hint">
          {activeSelection === "map"
            ? "Arraste as alças para redimensionar o mapa. Esc para soltar."
            : "Arraste as alças para mudar o tamanho do token. Esc para soltar."}
        </p>
      )}
    </div>
  );
}

export default MapBoard;
