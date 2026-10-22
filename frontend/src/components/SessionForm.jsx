import React from "react";
import { apiRequest } from "../api.js";

const EMPTY_SESSION = {
  title: "",
  scheduled_at: "",
  mode: "online",
  location: "",
  description: "",
};

// Cria uma sessão nova ou edita a sessão recebida em "session".
function SessionForm({ campaignId, session, onSaved, onCancel }) {
  const [fields, setFields] = React.useState(() =>
    session
      ? {
          title: session.title,
          scheduled_at: session.scheduled_at,
          mode: session.mode,
          location: session.location,
          description: session.description,
        }
      : EMPTY_SESSION
  );
  const [message, setMessage] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  function updateField(event) {
    setFields({ ...fields, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    try {
      if (session) {
        await apiRequest(`/api/sessions/${session.id}`, {
          method: "PUT",
          body: fields,
        });
      } else {
        await apiRequest(`/api/campaigns/${campaignId}/sessions`, {
          method: "POST",
          body: fields,
        });
      }

      onSaved();
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

      <label>
        Data e horário
        <input
          name="scheduled_at"
          type="datetime-local"
          value={fields.scheduled_at}
          onChange={updateField}
          required
        />
      </label>

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
