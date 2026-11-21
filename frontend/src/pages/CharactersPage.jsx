import React from "react";
import { apiRequest } from "../api.js";
import { CharacterSheetModal } from "../components/CharacterSheet.jsx";
import { downloadText, sheetToText } from "../ficha5e.js";

const BLANK_SHEET = [
  "ENCOUNTER HUB",
  "FICHA DE PERSONAGEM",
  "",
  "Nome: ",
  "Jogador: ",
  "Classe: ",
  "Raça: ",
  "Nível: 1",
  "Pontos de vida: ",
  "Classe de armadura: ",
  "Atributos: ",
  "Habilidades: ",
  "Equipamentos: ",
  "História: ",
].join("\n");

// "Suas Fichas": as fichas do usuário em todas as campanhas.
function CharactersPage({ onGoToCampaigns }) {
  const [characters, setCharacters] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [openId, setOpenId] = React.useState(null);

  const loadCharacters = React.useCallback(async () => {
    try {
      const data = await apiRequest("/api/characters");
      setCharacters(data.characters);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  async function handleDownload(characterId) {
    try {
      const data = await apiRequest(`/api/characters/${characterId}`);
      downloadText(`ficha-${data.character.name}.txt`, sheetToText(data.character));
    } catch (error) {
      setMessage(error.message);
    }
  }

  // Agrupa por campanha, na ordem que vem do servidor.
  const groups = [];

  for (const character of characters) {
    const group = groups.find((item) => item.id === character.campaign_id);

    if (group) {
      group.characters.push(character);
    } else {
      groups.push({
        id: character.campaign_id,
        name: character.campaign_name,
        characters: [character],
      });
    }
  }

  return (
    <section className="campaigns-panel">
      <div className="panel-header">
        <h1>Suas fichas</h1>
        <button
          className="text-button"
          type="button"
          onClick={() => downloadText("ficha-personagem.txt", BLANK_SHEET)}
        >
          Baixar ficha em branco
        </button>
      </div>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      {isLoading && <p className="muted">Carregando fichas...</p>}

      {!isLoading && characters.length === 0 && (
        <div className="campaigns-empty">
          <h2>Nenhuma ficha por enquanto</h2>
          <p>
            As fichas de D&D 5e são criadas dentro de uma campanha. Abra uma
            campanha e use "Criar personagem".
          </p>
          <button className="create-campaign-button" type="button" onClick={onGoToCampaigns}>
            Ver campanhas
          </button>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="character-group">
          <h2 className="section-title">{group.name}</h2>
          <ul className="character-list">
            {group.characters.map((character) => (
              <li key={character.id} className="character-list-row">
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
                    </span>
                  </span>
                  <span className="character-hp">
                    PV {character.hp_current}/{character.hp_max}
                  </span>
                </button>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => handleDownload(character.id)}
                >
                  Baixar
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

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
    </section>
  );
}

export default CharactersPage;
