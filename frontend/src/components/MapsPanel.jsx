import React from "react";

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

              <label className="grid-size-field">
                Grade
                <input
                  type="number"
                  min={10}
                  max={300}
                  defaultValue={map.grid_size}
                  onBlur={(event) => {
                    const value = Number(event.target.value);

                    if (value !== map.grid_size) {
                      run(() => onUpdate(map.id, { grid_size: value }));
                    }
                  }}
                />
                px
              </label>

              <div className="form-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => run(() => onActivate(isActive ? null : map.id))}
                >
                  {isActive ? "Tirar da mesa" : "Mostrar na mesa"}
                </button>
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
