import React from "react";
import { apiRequest } from "../api.js";
import SessionCard from "../components/SessionCard.jsx";
import SessionForm from "../components/SessionForm.jsx";

function CampaignDetailPage({ campaignId, currentUser, onBack, onOpenTable }) {
  const [details, setDetails] = React.useState(null);
  const [sessions, setSessions] = React.useState([]);
  const [loadError, setLoadError] = React.useState("");
  const [message, setMessage] = React.useState("");
  // null = formulário fechado, "new" = nova sessão, objeto = edição.
  const [editingSession, setEditingSession] = React.useState(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      const [campaignData, sessionsData] = await Promise.all([
        apiRequest(`/api/campaigns/${campaignId}`),
        apiRequest(`/api/campaigns/${campaignId}/sessions`),
      ]);

      setDetails(campaignData);
      setSessions(sessionsData.sessions);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    }
  }, [campaignId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  async function run(action) {
    setMessage("");

    try {
      await action();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function handleRegenerateCode() {
    run(async () => {
      await apiRequest(`/api/campaigns/${campaignId}/invite-code`, {
        method: "POST",
      });
      await loadData();
    });
  }

  function handleRemoveMember(userId) {
    run(async () => {
      await apiRequest(`/api/campaigns/${campaignId}/members/${userId}`, {
        method: "DELETE",
      });

      if (userId === currentUser.id) {
        onBack();
      } else {
        await loadData();
      }
    });
  }

  function handleDeleteCampaign() {
    run(async () => {
      await apiRequest(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      onBack();
    });
  }

  if (loadError) {
    return (
      <section className="campaigns-panel">
        <p className="form-message" role="alert">
          {loadError}
        </p>
        <button className="text-button" type="button" onClick={onBack}>
          Voltar
        </button>
      </section>
    );
  }

  if (!details) {
    return (
      <section className="campaigns-panel">
        <p className="muted">Carregando campanha...</p>
      </section>
    );
  }

  const { campaign, role, members } = details;
  const isGameMaster = role === "gm";
  const openSessions = sessions.filter((item) => item.status === "agendada");
  const pastSessions = sessions.filter((item) => item.status !== "agendada");

  return (
    <section className="campaigns-panel">
      <button className="text-button back-button" type="button" onClick={onBack}>
        ← Campanhas
      </button>

      <div className="panel-header">
        <div>
          <h1>{campaign.name}</h1>
          {campaign.description && (
            <p className="muted">{campaign.description}</p>
          )}
        </div>

        <button
          className="create-campaign-button"
          type="button"
          onClick={() => onOpenTable(campaign.id)}
        >
          Abrir mesa virtual
        </button>
      </div>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      <div className="campaign-layout">
        <div className="campaign-main">
          <div className="panel-header">
            <h2 className="section-title">Sessões marcadas</h2>

            {isGameMaster && editingSession === null && (
              <button
                className="create-campaign-button"
                type="button"
                onClick={() => setEditingSession("new")}
              >
                Marcar sessão
              </button>
            )}
          </div>

          {editingSession !== null && (
            <SessionForm
              key={editingSession === "new" ? "new" : editingSession.id}
              campaignId={campaign.id}
              session={editingSession === "new" ? null : editingSession}
              onCancel={() => setEditingSession(null)}
              onSaved={() => {
                setEditingSession(null);
                loadData();
              }}
            />
          )}

          {openSessions.length === 0 && editingSession === null && (
            <div className="sessions-empty">
              <p>
                {isGameMaster
                  ? "Nenhuma sessão marcada. Marque a próxima para o grupo confirmar presença."
                  : "Nenhuma sessão marcada. Assim que o mestre marcar, ela aparece aqui."}
              </p>
            </div>
          )}

          <div className="sessions-list">
            {openSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isGameMaster={isGameMaster}
                onChanged={loadData}
                onEdit={setEditingSession}
                onOpenTable={onOpenTable}
              />
            ))}
          </div>

          {pastSessions.length > 0 && (
            <>
              <h2 className="section-title">Sessões anteriores</h2>
              <div className="sessions-list">
                {pastSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isGameMaster={isGameMaster}
                    onChanged={loadData}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="campaign-side">
          {isGameMaster && (
            <div className="side-card">
              <h2 className="section-title">Convite</h2>
              <p className="muted">
                Envie este código para os jogadores entrarem na campanha.
              </p>
              <p className="invite-code">{campaign.invite_code}</p>
              <button
                className="text-button"
                type="button"
                onClick={handleRegenerateCode}
              >
                Gerar novo código
              </button>
            </div>
          )}

          <div className="side-card">
            <h2 className="section-title">Participantes</h2>

            <ul className="member-list">
              {members.map((member) => (
                <li key={member.id}>
                  <span>
                    {member.name}
                    {member.role === "gm" && (
                      <span className="role-tag">Mestre</span>
                    )}
                  </span>

                  {isGameMaster && member.role !== "gm" && (
                    <button
                      className="text-button danger"
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                    >
                      Remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="side-card">
            {isGameMaster ? (
              confirmDelete ? (
                <>
                  <p>
                    Excluir a campanha apaga sessões, mapas e o histórico do
                    chat. Tem certeza?
                  </p>
                  <div className="form-actions">
                    <button
                      className="text-button danger"
                      type="button"
                      onClick={handleDeleteCampaign}
                    >
                      Sim, excluir
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="text-button danger"
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                >
                  Excluir campanha
                </button>
              )
            ) : (
              <button
                className="text-button danger"
                type="button"
                onClick={() => handleRemoveMember(currentUser.id)}
              >
                Sair da campanha
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default CampaignDetailPage;
