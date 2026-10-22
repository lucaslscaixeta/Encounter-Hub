import React from "react";
import { apiRequest } from "../api.js";
import { formatSessionDate } from "../formatacao.js";

function CampaignsPage({ onOpenCampaign, onOpenTable }) {
  const [campaigns, setCampaigns] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [inviteCode, setInviteCode] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const loadCampaigns = React.useCallback(async () => {
    try {
      const data = await apiRequest("/api/campaigns");
      setCampaigns(data.campaigns);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  async function handleCreate(event) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    try {
      const data = await apiRequest("/api/campaigns", {
        method: "POST",
        body: { name, description },
      });

      setName("");
      setDescription("");
      setShowCreate(false);
      onOpenCampaign(data.campaign.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleJoin(event) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    try {
      const data = await apiRequest("/api/campaigns/join", {
        method: "POST",
        body: { invite_code: inviteCode },
      });

      setInviteCode("");
      onOpenCampaign(data.campaign.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  const createForm = (
    <form className="panel-form" onSubmit={handleCreate}>
      <h2>Nova campanha</h2>

      <label>
        Nome
        <input
          type="text"
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>

      <label>
        Descrição (opcional)
        <textarea
          rows={3}
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="form-actions">
        <button
          className="create-campaign-button"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "Criando..." : "Criar campanha"}
        </button>

        <button
          className="text-button"
          type="button"
          onClick={() => setShowCreate(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );

  return (
    <section className="campaigns-panel">
      <div className="panel-header">
        <h1>Suas campanhas</h1>

        {campaigns.length > 0 && !showCreate && (
          <button
            className="create-campaign-button"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            Criar campanha
          </button>
        )}
      </div>

      <form className="join-form" onSubmit={handleJoin}>
        <label htmlFor="invite-code">Recebeu um convite?</label>
        <input
          id="invite-code"
          type="text"
          placeholder="Código de convite"
          maxLength={20}
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          required
        />
        <button className="text-button" type="submit" disabled={isSaving}>
          Entrar na campanha
        </button>
      </form>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      {showCreate && createForm}

      {isLoading && <p className="muted">Carregando campanhas...</p>}
      {loadError && (
        <p className="form-message" role="alert">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && campaigns.length === 0 && !showCreate && (
        <div className="campaigns-empty">
          <h2>Nenhuma campanha por enquanto</h2>

          <p>
            Crie sua primeira campanha e reúna seu grupo de aventureiros.
          </p>

          <button
            className="create-campaign-button"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            Criar primeira campanha
          </button>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="sessions-grid">
          {campaigns.map((campaign) => (
            <article className="session-card" key={campaign.id}>
              <div className="session-card-header">
                <h2>{campaign.name}</h2>
                <span className="status-badge">
                  {campaign.role === "gm" ? "Mestre" : "Jogador"}
                </span>
              </div>

              <p>Mestre: {campaign.owner_name}</p>
              <p>
                {campaign.member_count}{" "}
                {campaign.member_count === 1 ? "participante" : "participantes"}
              </p>
              <p>
                Próxima sessão:{" "}
                {campaign.next_session_at
                  ? formatSessionDate(campaign.next_session_at)
                  : "nenhuma marcada"}
              </p>

              <div className="session-card-actions">
                <button
                  className="create-campaign-button"
                  type="button"
                  onClick={() => onOpenTable(campaign.id)}
                >
                  Abrir mesa
                </button>

                <button
                  className="text-button"
                  type="button"
                  onClick={() => onOpenCampaign(campaign.id)}
                >
                  Detalhes
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default CampaignsPage;
