import React from "react";
import { apiRequest } from "../api.js";
import { CharacterSheetModal } from "./CharacterSheet.jsx";

// Fichas da campanha: o jogador vê as suas; o mestre vê todas.
function CampaignCharacters({ campaignId, isGameMaster }) {
  const [characters, setCharacters] = React.useState([]);
  const [name, setName] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [openId, setOpenId] = React.useState(null);
  const [message, setMessage] = React.useState("");

  const loadCharacters = React.useCallback(async () => {
    try {
      const data = await apiRequest(`/api/campaigns/${campaignId}/characters`);
      setCharacters(data.characters);
    } catch (error) {
      setMessage(error.message);
    }
  }, [campaignId]);

  React.useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  async function handleCreate(event) {
    event.preventDefault();
    setMessage("");

    try {
      const data = await apiRequest(`/api/campaigns/${campaignId}/characters`, {
        method: "POST",
        body: { name },
      });
      setName("");
      setShowCreate(false);
      await loadCharacters();
      setOpenId(data.character.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="campaign-characters">
      <div className="panel-header">
        <h2 className="section-title">Personagens</h2>

        {!showCreate && (
          <button
            className="create-campaign-button"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            Criar personagem
          </button>
        )}
      </div>

      {showCreate && (
        <form className="panel-form" onSubmit={handleCreate}>
          <h2>Novo personagem (D&D 5e)</h2>
          <label>
            Nome do personagem
            <input
              type="text"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <div className="form-actions">
            <button className="create-campaign-button" type="submit">
              Criar e abrir ficha
            </button>
            <button className="text-button" type="button" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      {characters.length === 0 && !showCreate && (
        <div className="sessions-empty">
          <p>
            {isGameMaster
              ? "Nenhuma ficha nesta campanha ainda. Os jogadores criam as suas aqui, e você pode criar fichas de NPCs."
              : "Você ainda não tem personagem nesta campanha. Crie sua ficha de D&D 5e."}
          </p>
        </div>
      )}

      <ul className="character-list">
        {characters.map((character) => (
          <li key={character.id}>
            <button type="button" onClick={() => setOpenId(character.id)}>
              <span className="character-avatar" aria-hidden="true">
                {character.image_url ? (
                  <img src={character.image_url} alt="" />
                ) : (
                  character.name.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="character-info">
                <strong>{character.name}</strong>
                <span className="muted">
                  {character.class_level || `Nível ${character.level}`}
                  {isGameMaster && character.owner_name && ` · ${character.owner_name}`}
                </span>
              </span>
              <span className="character-hp">
                PV {character.hp_current}/{character.hp_max}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {openId !== null && (
        <CharacterSheetModal
          characterId={openId}
          onClose={() => {
            setOpenId(null);
            loadCharacters();
          }}
          onDeleted={loadCharacters}
        />
      )}
    </div>
  );
}

export default CampaignCharacters;
