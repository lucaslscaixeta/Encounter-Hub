import React from "react";

// Tamanho da grade do mapa: pixels por quadrado e quantos quadrados
// de largura e altura (em branco = acompanha o tamanho da imagem).
function GridSettings({ map, onSave }) {
  const [cellSize, setCellSize] = React.useState(String(map.grid_size));
  const [columns, setColumns] = React.useState(
    map.grid_columns ? String(map.grid_columns) : ""
  );
  const [rows, setRows] = React.useState(
    map.grid_rows ? String(map.grid_rows) : ""
  );
  const [error, setError] = React.useState("");

  function readGrid() {
    const grid_size = Number(cellSize);

    if (columns === "" && rows === "") {
      return { grid_size, grid_columns: null, grid_rows: null };
    }

    if (columns === "" || rows === "") {
      setError("Preencha a largura e a altura, ou deixe as duas em branco.");
      return null;
    }

    return { grid_size, grid_columns: Number(columns), grid_rows: Number(rows) };
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const grid = readGrid();

    if (grid) {
      onSave(grid);
    }
  }

  function handleFit() {
    setError("");

    const grid = readGrid();

    if (!grid) {
      return;
    }

    if (!grid.grid_columns) {
      setError("Defina a largura e a altura da grade para encaixar o mapa.");
      return;
    }

    // Estica a imagem para cobrir exatamente a grade.
    onSave({
      ...grid,
      x: 0,
      y: 0,
      width: grid.grid_columns * grid.grid_size,
      height: grid.grid_rows * grid.grid_size,
    });
  }

  return (
    <form className="grid-settings" onSubmit={handleSubmit}>
      <fieldset>
        <legend>Grade</legend>

        <label>
          Quadrado (px)
          <input
            type="number"
            min={10}
            max={300}
            value={cellSize}
            onChange={(event) => setCellSize(event.target.value)}
            required
          />
        </label>

        <label>
          Largura
          <input
            type="number"
            min={1}
            max={200}
            placeholder="auto"
            value={columns}
            onChange={(event) => setColumns(event.target.value)}
          />
        </label>

        <label>
          Altura
          <input
            type="number"
            min={1}
            max={200}
            placeholder="auto"
            value={rows}
            onChange={(event) => setRows(event.target.value)}
          />
        </label>
      </fieldset>

      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button className="text-button" type="submit">
          Salvar grade
        </button>
        <button className="text-button" type="button" onClick={handleFit}>
          Encaixar mapa na grade
        </button>
      </div>
    </form>
  );
}

// Painel do mestre para enviar mapas e escolher o que aparece na mesa.
function MapsPanel({ maps, activeMapId, onUpload, onActivate, onUpdate, onDelete }) {
  const [file, setFile] = React.useState(null);
  const [name, setName] = React.useState("");
  const [gridSize, setGridSize] = React.useState(50);
  const [message, setMessage] = React.useState("");
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef(null);

  async function run(action) {
    setMessage("");

    try {
      await action();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!file) {
      setMessage("Selecione a imagem do mapa.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    formData.append("grid_size", String(gridSize));

    setIsUploading(true);

    await run(async () => {
      await onUpload(formData);
      setFile(null);
      setName("");
      fileInputRef.current.value = "";
    });

    setIsUploading(false);
  }

  return (
    <div className="side-section">
      <form className="panel-form compact" onSubmit={handleUpload}>
        <h2>Enviar mapa</h2>

        <label>
          Imagem (PNG, JPG, WEBP ou GIF, até 10 MB)
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => setFile(event.target.files[0] || null)}
          />
        </label>

        <label>
          Nome (opcional)
          <input
            type="text"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label>
          Tamanho de cada quadrado da grade (pixels da imagem)
          <input
            type="number"
            min={10}
            max={300}
            value={gridSize}
            onChange={(event) => setGridSize(event.target.value)}
          />
        </label>

        <button
          className="create-campaign-button"
          type="submit"
          disabled={isUploading}
        >
          {isUploading ? "Enviando..." : "Enviar mapa"}
        </button>
      </form>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      <h2 className="section-title">Mapas da campanha</h2>

      <p className="muted form-tip">
        Para alinhar o mapa com a grade, clique nele na mesa e arraste as
        alças das bordas.
      </p>

      {maps.length === 0 && <p className="muted">Nenhum mapa enviado.</p>}

      <ul className="map-list">
        {maps.map((map) => {
          const isActive = map.id === activeMapId;

          return (
            <li key={map.id} className={isActive ? "active" : ""}>
              <div className="map-list-header">
                <strong>{map.name}</strong>
                {isActive && <span className="role-tag">Na mesa</span>}
              </div>

              <GridSettings
                key={`${map.id}-${map.grid_size}-${map.grid_columns}-${map.grid_rows}`}
                map={map}
                onSave={(fields) => run(() => onUpdate(map.id, fields))}
              />

              <div className="form-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => run(() => onActivate(isActive ? null : map.id))}
                >
                  {isActive ? "Tirar da mesa" : "Mostrar na mesa"}
                </button>
                {map.width !== null && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      run(() => onUpdate(map.id, { width: null, height: null }))
                    }
                  >
                    Tamanho original
                  </button>
                )}
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() => run(() => onDelete(map.id))}
                >
                  Excluir
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default MapsPanel;
