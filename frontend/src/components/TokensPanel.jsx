import React from "react";
import { assetUrl } from "../api.js";

const IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

const TOKEN_COLORS = [
  "#ffb82e",
  "#e74c3c",
  "#2ecc71",
  "#3498db",
  "#9b59b6",
  "#ecf0f1",
];

function TokensPanel({
  tokens,
  members,
  currentUser,
  isGameMaster,
  onCreate,
  onDelete,
  onUploadImage,
  onRemoveImage,
}) {
  const [name, setName] = React.useState(currentUser.name);
  const [color, setColor] = React.useState(TOKEN_COLORS[0]);
  // "" = sem dono (NPC/monstro), só o mestre pode escolher.
  const [ownerId, setOwnerId] = React.useState(String(currentUser.id));
  const [imageFile, setImageFile] = React.useState(null);
  const [error, setError] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const imageInputRef = React.useRef(null);

  const memberNames = Object.fromEntries(
    members.map((member) => [member.id, member.name])
  );

  async function run(action) {
    setError("");
    setIsSaving(true);

    try {
      await action();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    run(async () => {
      await onCreate(
        {
          name,
          color,
          owner_id: ownerId === "" ? null : Number(ownerId),
        },
        imageFile
      );

      setImageFile(null);
      imageInputRef.current.value = "";
    });
  }

  return (
    <div className="side-section">
      <form className="panel-form compact" onSubmit={handleSubmit}>
        <h2>Adicionar token</h2>

        <label>
          Nome
          <input
            type="text"
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>

        <fieldset className="color-options">
          <legend>Cor</legend>
          {TOKEN_COLORS.map((option) => (
            <label key={option} className="color-option">
              <input
                type="radio"
                name="token-color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
              />
              <span style={{ background: option }} aria-label={option} />
            </label>
          ))}
        </fieldset>

        {isGameMaster && (
          <label>
            Quem controla
            <select
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Só o mestre (NPC/monstro)</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Imagem (opcional, até 5 MB)
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_TYPES}
            onChange={(event) => setImageFile(event.target.files[0] || null)}
          />
        </label>

        <button
          className="create-campaign-button"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "Salvando..." : "Colocar no mapa"}
        </button>

        <p className="muted form-tip">
          No mapa, clique no token e arraste as alças dos cantos para mudar
          o tamanho.
        </p>
      </form>

      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}

      <h2 className="section-title">No mapa</h2>

      {tokens.length === 0 && <p className="muted">Nenhum token no mapa.</p>}

      <ul className="token-list">
        {tokens.map((token) => {
          const canEdit = isGameMaster || token.owner_id === currentUser.id;

          return (
            <li key={token.id}>
              <div className="token-row">
                {token.image_url ? (
                  <img
                    className="token-dot"
                    src={assetUrl(token.image_url)}
                    alt=""
                    style={{ borderColor: token.color }}
                  />
                ) : (
                  <span
                    className="token-dot"
                    style={{ background: token.color }}
                  />
                )}

                <span className="token-name">
                  {token.name}
                  <small>
                    {token.owner_id
                      ? memberNames[token.owner_id] || "Ex-membro"
                      : "Mestre"}
                    {" · "}
                    {token.size}×{token.size}
                  </small>
                </span>
              </div>

              {canEdit && (
                <div className="form-actions">
                  <label className="text-button file-button">
                    {token.image_url ? "Trocar imagem" : "Imagem"}
                    <input
                      type="file"
                      accept={IMAGE_TYPES}
                      disabled={isSaving}
                      onChange={(event) => {
                        const file = event.target.files[0];
                        event.target.value = "";

                        if (file) {
                          run(() => onUploadImage(token.id, file));
                        }
                      }}
                    />
                  </label>

                  {token.image_url && (
                    <button
                      className="text-button"
                      type="button"
                      disabled={isSaving}
                      onClick={() => run(() => onRemoveImage(token.id))}
                    >
                      Tirar imagem
                    </button>
                  )}

                  <button
                    className="text-button danger"
                    type="button"
                    disabled={isSaving}
                    onClick={() => run(() => onDelete(token.id))}
                  >
                    Remover
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default TokensPanel;
