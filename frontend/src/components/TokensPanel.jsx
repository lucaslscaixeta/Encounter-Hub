import React from "react";

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
}) {
  const [name, setName] = React.useState(currentUser.name);
  const [color, setColor] = React.useState(TOKEN_COLORS[0]);
  // "" = sem dono (NPC/monstro), só o mestre pode escolher.
  const [ownerId, setOwnerId] = React.useState(String(currentUser.id));
  const [error, setError] = React.useState("");

  const memberNames = Object.fromEntries(
    members.map((member) => [member.id, member.name])
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await onCreate({
        name,
        color,
        owner_id: ownerId === "" ? null : Number(ownerId),
      });
    } catch (createError) {
      setError(createError.message);
    }
  }

  async function handleDelete(tokenId) {
    setError("");

    try {
      await onDelete(tokenId);
    } catch (deleteError) {
      setError(deleteError.message);
    }
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

        <button className="create-campaign-button" type="submit">
          Colocar no mapa
        </button>
      </form>

      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}

      <h2 className="section-title">No mapa</h2>

      {tokens.length === 0 && <p className="muted">Nenhum token no mapa.</p>}

      <ul className="token-list">
        {tokens.map((token) => (
          <li key={token.id}>
            <span className="token-dot" style={{ background: token.color }} />
            <span className="token-name">
              {token.name}
              <small>
                {token.owner_id
                  ? memberNames[token.owner_id] || "Ex-membro"
                  : "Mestre"}
              </small>
            </span>

            {(isGameMaster || token.owner_id === currentUser.id) && (
              <button
                className="text-button danger"
                type="button"
                onClick={() => handleDelete(token.id)}
              >
                Remover
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TokensPanel;
