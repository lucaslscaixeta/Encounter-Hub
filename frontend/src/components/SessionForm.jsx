import React from "react";
import { apiRequest } from "../api.js";

const EMPTY_SESSION = {
  title: "",
  scheduled_at: "",
  mode: "online",
  location: "",
  description: "",
};

// Horários de 30 em 30 minutos no formato de 24 horas ("00:00" a "23:30").
// O campo nativo datetime-local segue o idioma do sistema e pode mostrar AM/PM.
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hour}:${index % 2 ? "30" : "00"}`;
});

// Cria uma sessão nova ou edita a sessão recebida em "session".
// "initialValues" preenche uma sessão nova (ex.: horário vindo da enquete).
function SessionForm({ campaignId, session, initialValues, onSaved, onCancel }) {
  const [fields, setFields] = React.useState(() =>
    session
      ? {
          title: session.title,
          scheduled_at: session.scheduled_at,
          mode: session.mode,
          location: session.location,
          description: session.description,
        }
      : { ...EMPTY_SESSION, ...initialValues }
  );
  const [message, setMessage] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  // scheduled_at fica como "2026-11-20T19:00", dividido em data e hora na tela.
  const scheduledDate = fields.scheduled_at.slice(0, 10);
  const scheduledTime = fields.scheduled_at.slice(11, 16);
  const timeOptions =
    scheduledTime && !TIME_OPTIONS.includes(scheduledTime)
      ? [...TIME_OPTIONS, scheduledTime].sort()
      : TIME_OPTIONS;

  function updateField(event) {
    setFields({ ...fields, [event.target.name]: event.target.value });
  }

  function updateSchedule(date, time) {
    setFields({ ...fields, scheduled_at: `${date}T${time}` });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    try {
      let data;

      if (session) {
        data = await apiRequest(`/api/sessions/${session.id}`, {
          method: "PUT",
          body: fields,
        });
      } else {
        data = await apiRequest(`/api/campaigns/${campaignId}/sessions`, {
          method: "POST",
          body: fields,
        });
      }

      await onSaved(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      <h2>{session ? "Editar sessão" : "Marcar nova sessão"}</h2>

      <label>
        Título
        <input
          name="title"
          type="text"
          maxLength={80}
          value={fields.title}
          onChange={updateField}
          placeholder="Ex.: Sessão 3 - A cripta"
          required
        />
      </label>

      <div className="form-row">
        <label>
          Data
          <input
            type="date"
            value={scheduledDate}
            onChange={(event) => updateSchedule(event.target.value, scheduledTime)}
            required
          />
        </label>

        <label>
          Horário
          <select
            value={scheduledTime}
            onChange={(event) => updateSchedule(scheduledDate, event.target.value)}
            required
          >
            <option value="" disabled>
              Escolha
            </option>
            {timeOptions.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="mode-options">
        <legend>Formato</legend>

        <label>
          <input
            type="radio"
            name="mode"
            value="online"
            checked={fields.mode === "online"}
            onChange={updateField}
          />
          Online (mesa virtual)
        </label>

        <label>
          <input
            type="radio"
            name="mode"
            value="presencial"
            checked={fields.mode === "presencial"}
            onChange={updateField}
          />
          Presencial
        </label>
      </fieldset>

      {fields.mode === "presencial" && (
        <label>
          Local
          <input
            name="location"
            type="text"
            maxLength={200}
            value={fields.location}
            onChange={updateField}
            placeholder="Endereço ou nome do local"
            required
          />
        </label>
      )}

      <label>
        Descrição (opcional)
        <textarea
          name="description"
          maxLength={1000}
          rows={3}
          value={fields.description}
          onChange={updateField}
        />
      </label>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      <div className="form-actions">
        <button
          className="create-campaign-button"
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "Salvando..." : session ? "Salvar" : "Marcar sessão"}
        </button>

        <button className="text-button" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default SessionForm;
