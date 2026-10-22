import React from "react";
import { apiRequest } from "../api.js";
import SessionCard from "../components/SessionCard.jsx";

function SessionsPage({ onGoToCampaigns, onOpenTable }) {
  const [sessions, setSessions] = React.useState([]);
  const [period, setPeriod] = React.useState("proximas");
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");

  const loadSessions = React.useCallback(async () => {
    try {
      const data = await apiRequest(`/api/sessions?periodo=${period}`);
      setSessions(data.sessions);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  React.useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return (
    <section className="sessions-panel">
      <div className="panel-header">
        <h1>Suas sessões marcadas:</h1>

        <div className="tab-switch" role="group" aria-label="Período">
          <button
            type="button"
            className={period === "proximas" ? "active" : ""}
            aria-pressed={period === "proximas"}
            onClick={() => setPeriod("proximas")}
          >
            Próximas
          </button>
          <button
            type="button"
            className={period === "anteriores" ? "active" : ""}
            aria-pressed={period === "anteriores"}
            onClick={() => setPeriod("anteriores")}
          >
            Anteriores
          </button>
        </div>
      </div>

      {isLoading && <p className="muted">Carregando sessões...</p>}
      {loadError && (
        <p className="form-message" role="alert">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && sessions.length > 0 && (
        <div className="sessions-grid">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              showCampaign
              onChanged={loadSessions}
              onOpenTable={onOpenTable}
            />
          ))}
        </div>
      )}

      {!isLoading && !loadError && sessions.length === 0 && (
        <div className="sessions-empty">
          {period === "proximas" ? (
            <>
              <h2>
                Você, por enquanto, não está envolvido em nenhuma aventura.
              </h2>

              <p>
                Que tal entrar em alguma campanha para participar?
                Vai que você crie sua própria aventura!
              </p>

              <button
                className="create-campaign-button"
                type="button"
                onClick={onGoToCampaigns}
              >
                Campanhas
              </button>
            </>
          ) : (
            <p>Nenhuma sessão anterior.</p>
          )}
        </div>
      )}
    </section>
  );
}

export default SessionsPage;
