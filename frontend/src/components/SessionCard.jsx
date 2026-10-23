import React from "react";
import { apiRequest } from "../api.js";
import {
  ATTENDANCE_LABELS,
  SESSION_STATUS_LABELS,
  formatSessionDate,
} from "../formatacao.js";

function SessionCard({
  session,
  isGameMaster,
  showCampaign = false,
  onChanged,
  onEdit,
  onOpenTable,
}) {
  const [message, setMessage] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const isOpen = session.status === "agendada";

  async function run(action) {
    setMessage("");
    setIsSaving(true);

    try {
      await action();
      onChanged?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  function handleAttendance(status) {
    run(() =>
      apiRequest(`/api/sessions/${session.id}/attendance`, {
        method: "PUT",
        body: { status },
      })
    );
  }

  function handleStatus(status) {
    run(() =>
      apiRequest(`/api/sessions/${session.id}`, {
        method: "PUT",
        body: { status },
      })
    );
  }

  function handleDelete() {
    run(() =>
      apiRequest(`/api/sessions/${session.id}`, { method: "DELETE" })
    );
  }

  return (
    <article className={`session-card ${isOpen ? "" : "session-card-closed"}`}>
      <div className="session-card-header">
        <h2>{session.title}</h2>
        <span className={`status-badge status-${session.status}`}>
          {SESSION_STATUS_LABELS[session.status]}
        </span>
      </div>

      {showCampaign && <p>Campanha: {session.campaign_name}</p>}
      <p>Data: {formatSessionDate(session.scheduled_at)}</p>
      <p>
        {session.mode === "presencial"
          ? `Presencial: ${session.location}`
          : "Online, na mesa virtual"}
      </p>
      {session.description && (
        <p className="session-description">{session.description}</p>
      )}

      <div className="attendance-list">
        <span className="attendance-summary">
          {session.confirmed_count} de {session.attendance.length} confirmados
        </span>

        <ul>
          {session.attendance.map((person) => (
            <li
              key={person.user_id}
              className={`attendance-chip attendance-${person.status || "pendente"}`}
              title={ATTENDANCE_LABELS[person.status] || "Sem resposta"}
            >
              {person.name}
              {person.role === "gm" && " (mestre)"}
            </li>
          ))}
        </ul>
      </div>

      {isOpen && (
        <div className="attendance-actions" role="group" aria-label="Presença">
          {Object.entries(ATTENDANCE_LABELS).map(([status, label]) => (
            <button
              key={status}
              type="button"
              className={session.my_status === status ? "selected" : ""}
              aria-pressed={session.my_status === status}
              disabled={isSaving}
              onClick={() => handleAttendance(status)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="session-card-actions">
        {onOpenTable && session.mode === "online" && isOpen && (
          <button
            className="create-campaign-button"
            type="button"
            onClick={() => onOpenTable(session.campaign_id)}
          >
            Entrar na mesa
          </button>
        )}

        {isGameMaster && (
          <>
            {isOpen && (
              <button
                className="text-button"
                type="button"
                onClick={() => onEdit?.(session)}
              >
                Editar
              </button>
            )}
            {isOpen && (
              <button
                className="text-button"
                type="button"
                disabled={isSaving}
                onClick={() => handleStatus("concluida")}
              >
                Concluir
              </button>
            )}
            {isOpen && (
              <button
                className="text-button"
                type="button"
                disabled={isSaving}
                onClick={() => handleStatus("cancelada")}
              >
                Cancelar
              </button>
            )}
            <button
              className="text-button danger"
              type="button"
              disabled={isSaving}
              onClick={handleDelete}
            >
              Excluir
            </button>
          </>
        )}
      </div>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}
    </article>
  );
}

export default SessionCard;
