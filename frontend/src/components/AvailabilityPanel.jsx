import React from "react";
import { apiRequest } from "../api.js";
import { formatHour, formatSessionDate } from "../formatacao.js";
import SessionForm from "./SessionForm.jsx";

const REFRESH_INTERVAL = 20000;
const SAVE_DELAY = 600;
const BEST_SLOTS = 5;

// As datas da enquete são locais ("2026-11-20"); new Date("2026-11-20")
// seria lido como UTC e poderia cair no dia anterior.
function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInput(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDay(value) {
  const date = parseLocalDate(value);
  const weekday = date
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "");
  const day = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  return { weekday, day };
}

function formatPeriod(poll) {
  const first = formatDay(poll.start_date).day;
  const last = formatDay(poll.end_date).day;
  const days = first === last ? first : `${first} a ${last}`;

  return `${days}, das ${formatHour(poll.start_hour)} às ${formatHour(poll.end_hour)}`;
}

function buildDays(poll) {
  const days = [];
  const day = parseLocalDate(poll.start_date);
  const last = parseLocalDate(poll.end_date);

  while (day <= last) {
    days.push(toDateInput(day));
    day.setDate(day.getDate() + 1);
  }

  return days;
}

function buildHours(poll) {
  const hours = [];

  for (let hour = poll.start_hour; hour < poll.end_hour; hour += 1) {
    hours.push(hour);
  }

  return hours;
}

function slotKey(day, hour) {
  return `${day}T${String(hour).padStart(2, "0")}:00`;
}

function isPast(slot) {
  return new Date(slot) < new Date();
}

// Grade dia x hora. Clicar ou arrastar pinta os blocos (modo "editable");
// no modo de leitura, cada bloco mostra quantas pessoas podem.
function SlotGrid({ days, hours, label, editable, renderCell, onPaint, onPaintEnd }) {
  const paintMode = React.useRef(null);

  function slotFromEvent(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element?.closest("[data-slot]")?.dataset.slot;
  }

  function handlePointerDown(event) {
    const slot = event.target.closest("[data-slot]")?.dataset.slot;

    if (!editable || !slot || event.target.closest("button")?.disabled) {
      return;
    }

    event.preventDefault();
    // O primeiro bloco define se o arrasto marca ou desmarca.
    paintMode.current = onPaint(slot, null);
  }

  function handlePointerMove(event) {
    if (paintMode.current === null) {
      return;
    }

    const slot = slotFromEvent(event);

    if (slot) {
      onPaint(slot, paintMode.current);
    }
  }

  function handlePointerUp() {
    if (paintMode.current !== null) {
      paintMode.current = null;
      onPaintEnd();
    }
  }

  return (
    <div className="availability-grid-scroll">
      <div
        className={`availability-grid ${editable ? "editable" : ""}`}
        style={{ gridTemplateColumns: `3.2rem repeat(${days.length}, minmax(2.6rem, 1fr))` }}
        role="group"
        aria-label={label}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <span />
        {days.map((day) => {
          const { weekday, day: date } = formatDay(day);

          return (
            <span key={day} className="availability-day">
              {weekday}
              <small>{date}</small>
            </span>
          );
        })}

        {hours.map((hour) => (
          <React.Fragment key={hour}>
            <span className="availability-hour">{formatHour(hour)}</span>
            {days.map((day) => renderCell(slotKey(day, hour), day, hour))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function PollForm({ campaignId, onCreated, onCancel }) {
  // Padrão: os próximos 7 dias, das 18h às 23h.
  const [today] = React.useState(() => toDateInput(new Date()));
  const [fields, setFields] = React.useState(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 6);

    return {
      title: "Próxima sessão",
      start_date: toDateInput(new Date()),
      end_date: toDateInput(nextWeek),
      start_hour: 18,
      end_hour: 23,
    };
  });
  const [message, setMessage] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setFields({
      ...fields,
      [name]: name.endsWith("_hour") ? Number(value) : value,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);

    try {
      const data = await apiRequest(`/api/campaigns/${campaignId}/polls`, {
        method: "POST",
        body: fields,
      });
      onCreated(data.poll);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit}>
      <h2>Nova enquete de disponibilidade</h2>

      <label>
        Título
        <input
          name="title"
          type="text"
          maxLength={80}
          value={fields.title}
          onChange={updateField}
          required
        />
      </label>

      <div className="form-row">
        <label>
          De
          <input
            name="start_date"
            type="date"
            min={today}
            value={fields.start_date}
            onChange={updateField}
            required
          />
        </label>

        <label>
          Até
          <input
            name="end_date"
            type="date"
            min={fields.start_date}
            value={fields.end_date}
            onChange={updateField}
            required
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          A partir das
          <select name="start_hour" value={fields.start_hour} onChange={updateField}>
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Até as
          <select name="end_hour" value={fields.end_hour} onChange={updateField}>
            {Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => (
              <option key={hour} value={hour}>
                {formatHour(hour)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="muted form-tip">
        Os membros marcam, em blocos de 1 hora, quando podem jogar nesse
        período (até 31 dias).
      </p>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      <div className="form-actions">
        <button className="create-campaign-button" type="submit" disabled={isSaving}>
          {isSaving ? "Criando..." : "Criar enquete"}
        </button>
        <button className="text-button" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function PollView({ pollId, currentUser, onClose, onChanged }) {
  const [data, setData] = React.useState(null);
  const [mySlots, setMySlots] = React.useState(new Set());
  const [saveState, setSaveState] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [focusedSlot, setFocusedSlot] = React.useState(null);
  const [schedulingSlot, setSchedulingSlot] = React.useState(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const saveTimer = React.useRef(null);
  const hasPendingEdits = React.useRef(false);
  // Cópia da seleção atualizada na hora: num arrasto rápido chegam vários
  // eventos antes de o React renderizar de novo.
  const mySlotsRef = React.useRef(new Set());

  const replaceMySlots = React.useCallback((slots) => {
    mySlotsRef.current = slots;
    setMySlots(slots);
  }, []);

  const loadPoll = React.useCallback(async () => {
    try {
      const result = await apiRequest(`/api/polls/${pollId}`);
      setData(result);

      // Não sobrescreve o que o usuário está marcando agora.
      if (!hasPendingEdits.current) {
        replaceMySlots(new Set(result.availability[currentUser.id] || []));
      }
    } catch (error) {
      setMessage(error.message);
    }
  }, [pollId, currentUser.id, replaceMySlots]);

  React.useEffect(() => {
    loadPoll();
    const timer = setInterval(loadPoll, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [loadPoll]);

  React.useEffect(() => () => clearTimeout(saveTimer.current), []);

  const saveSlots = React.useCallback(
    (slots) => {
      clearTimeout(saveTimer.current);
      setSaveState("Salvando...");

      saveTimer.current = setTimeout(async () => {
        try {
          await apiRequest(`/api/polls/${pollId}/availability`, {
            method: "PUT",
            body: { slots: [...slots] },
          });

          // Se a pessoa marcou mais coisas durante o envio, outro
          // salvamento já está agendado; não sobrescreve com o servidor.
          if (mySlotsRef.current === slots) {
            hasPendingEdits.current = false;
          }
          setSaveState("Salvo");
          loadPoll();
          onChanged();
        } catch (error) {
          hasPendingEdits.current = false;
          setSaveState("");
          setMessage(error.message);
          loadPoll();
        }
      }, SAVE_DELAY);
    },
    [pollId, loadPoll, onChanged]
  );

  if (!data) {
    return message ? (
      <p className="form-message" role="alert">
        {message}
      </p>
    ) : (
      <p className="muted">Carregando enquete...</p>
    );
  }

  const { poll, members, availability, role } = data;
  const isGameMaster = role === "gm";
  const isOpen = poll.status === "aberta";
  const days = buildDays(poll);
  const hours = buildHours(poll);

  // Disponibilidade do grupo, com a marcação atual (ainda não salva) do usuário.
  const groupAvailability = {
    ...availability,
    [currentUser.id]: [...mySlots],
  };
  const peopleBySlot = {};

  for (const member of members) {
    for (const slot of groupAvailability[member.id] || []) {
      (peopleBySlot[slot] ||= []).push(member);
    }
  }

  const respondents = members.filter(
    (member) => (groupAvailability[member.id] || []).length > 0
  );
  const bestSlots = Object.entries(peopleBySlot)
    .filter(([slot]) => !isPast(slot))
    .sort(([slotA, a], [slotB, b]) => b.length - a.length || slotA.localeCompare(slotB))
    .slice(0, BEST_SLOTS);

  function paint(slot, mode) {
    if (!isOpen || isPast(slot)) {
      return mode;
    }

    const current = mySlotsRef.current;
    const shouldSelect = mode ?? !current.has(slot);

    if (current.has(slot) !== shouldSelect) {
      const next = new Set(current);

      if (shouldSelect) {
        next.add(slot);
      } else {
        next.delete(slot);
      }

      hasPendingEdits.current = true;
      setSaveState("");
      replaceMySlots(next);
    }

    return shouldSelect;
  }

  function finishPainting() {
    if (hasPendingEdits.current) {
      saveSlots(mySlotsRef.current);
    }
  }

  function cellLabel(slot) {
    const date = new Date(slot);
    return date.toLocaleString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }

  async function updatePoll(fields) {
    setMessage("");

    try {
      await apiRequest(`/api/polls/${poll.id}`, { method: "PUT", body: fields });
      await loadPoll();
      onChanged();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleDelete() {
    try {
      await apiRequest(`/api/polls/${poll.id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (error) {
      setMessage(error.message);
    }
  }

  const focusedPeople = focusedSlot ? peopleBySlot[focusedSlot] || [] : [];
  const focusedIds = new Set(focusedPeople.map((member) => member.id));

  return (
    <div className="poll-view">
      <div className="panel-header">
        <div>
          <h2 className="section-title">{poll.title}</h2>
          <p className="muted">
            {formatPeriod(poll)} · {respondents.length} de {members.length}{" "}
            responderam
          </p>
        </div>

        <div className="form-actions">
          <span className={`status-badge ${isOpen ? "status-agendada" : ""}`}>
            {isOpen ? "Aberta" : "Encerrada"}
          </span>
          <button className="text-button" type="button" onClick={onClose}>
            Voltar às enquetes
          </button>
        </div>
      </div>

      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}

      <div className="availability-columns">
        <section>
          <div className="availability-heading">
            <h3>Sua disponibilidade</h3>
            <span className="muted" aria-live="polite">
              {saveState}
            </span>
          </div>

          <p className="muted form-tip">
            {isOpen
              ? "Clique ou arraste sobre os horários em que você pode jogar. Salva sozinho."
              : "A enquete foi encerrada; não é mais possível alterar."}
          </p>

          <SlotGrid
            days={days}
            hours={hours}
            label="Sua disponibilidade"
            editable={isOpen}
            onPaint={paint}
            onPaintEnd={finishPainting}
            renderCell={(slot) => {
              const selected = mySlots.has(slot);
              const past = isPast(slot);

              return (
                <button
                  key={slot}
                  type="button"
                  data-slot={slot}
                  className={`availability-cell ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  aria-label={cellLabel(slot)}
                  disabled={!isOpen || past}
                  onClick={(event) => {
                    // Mouse e toque já pintaram no pointerdown; aqui só o teclado.
                    if (event.detail === 0) {
                      paint(slot, null);
                      finishPainting();
                    }
                  }}
                />
              );
            }}
          />
        </section>

        <section>
          <div className="availability-heading">
            <h3>Disponibilidade do grupo</h3>
          </div>

          <p className="muted form-tip">
            Quanto mais forte a cor, mais gente pode. Clique em um horário
            para ver quem.
          </p>

          <SlotGrid
            days={days}
            hours={hours}
            label="Disponibilidade do grupo"
            editable={false}
            renderCell={(slot) => {
              const count = (peopleBySlot[slot] || []).length;
              const share = members.length ? count / members.length : 0;

              return (
                <button
                  key={slot}
                  type="button"
                  data-slot={slot}
                  className={`availability-cell group ${
                    focusedSlot === slot ? "focused" : ""
                  } ${count === members.length && count > 0 ? "everyone" : ""}`}
                  style={{ "--share": share }}
                  aria-label={`${cellLabel(slot)}: ${count} de ${members.length}`}
                  onClick={() => setFocusedSlot(slot)}
                >
                  {count > 0 ? count : ""}
                </button>
              );
            }}
          />

          <div className="availability-legend">
            <span className="availability-cell group" style={{ "--share": 0 }} />
            0
            <span className="availability-cell group" style={{ "--share": 0.5 }} />
            metade
            <span className="availability-cell group everyone" style={{ "--share": 1 }} />
            todos
          </div>
        </section>
      </div>

      {focusedSlot && (
        <div className="side-card availability-detail" aria-live="polite">
          <h3>{formatSessionDate(focusedSlot)}</h3>
          <ul className="availability-people">
            {members.map((member) => (
              <li
                key={member.id}
                className={focusedIds.has(member.id) ? "available" : "unavailable"}
              >
                {focusedIds.has(member.id) ? "✓" : "✗"} {member.name}
                {member.role === "gm" && " (mestre)"}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="side-card">
        <h3>Melhores horários</h3>

        {bestSlots.length === 0 ? (
          <p className="muted">Ninguém marcou disponibilidade ainda.</p>
        ) : (
          <ol className="best-slots">
            {bestSlots.map(([slot, people]) => (
              <li key={slot}>
                <div>
                  <strong>{formatSessionDate(slot)}</strong>
                  <span className="muted">
                    {people.length} de {members.length}:{" "}
                    {people.map((member) => member.name).join(", ")}
                  </span>
                </div>

                {isGameMaster && isOpen && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setSchedulingSlot(slot)}
                  >
                    Marcar sessão
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {schedulingSlot && (
        <SessionForm
          key={schedulingSlot}
          campaignId={poll.campaign_id}
          initialValues={{ title: poll.title, scheduled_at: schedulingSlot }}
          onCancel={() => setSchedulingSlot(null)}
          onSaved={async (result) => {
            setSchedulingSlot(null);
            // A enquete fica encerrada e ligada à sessão criada.
            await updatePoll({ status: "encerrada", session_id: result.session_id });
          }}
        />
      )}

      {!isOpen && poll.session_id && (
        <p className="muted">
          Sessão marcada a partir desta enquete. Os membros já podem confirmar
          presença em "Sessões marcadas".
        </p>
      )}

      {isGameMaster && (
        <div className="form-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => updatePoll({ status: isOpen ? "encerrada" : "aberta" })}
          >
            {isOpen ? "Encerrar enquete" : "Reabrir enquete"}
          </button>

          {confirmDelete ? (
            <>
              <button className="text-button danger" type="button" onClick={handleDelete}>
                Sim, excluir
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              className="text-button danger"
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              Excluir enquete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AvailabilityPanel({ campaignId, currentUser, isGameMaster, onSessionCreated }) {
  const [polls, setPolls] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [openPollId, setOpenPollId] = React.useState(null);

  const loadPolls = React.useCallback(async () => {
    try {
      const data = await apiRequest(`/api/campaigns/${campaignId}/polls`);
      setPolls(data.polls);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    loadPolls();
  }, [loadPolls]);

  const handleChanged = React.useCallback(() => {
    loadPolls();
    onSessionCreated?.();
  }, [loadPolls, onSessionCreated]);

  if (openPollId !== null) {
    return (
      <PollView
        key={openPollId}
        pollId={openPollId}
        currentUser={currentUser}
        onClose={() => setOpenPollId(null)}
        onChanged={handleChanged}
      />
    );
  }

  return (
    <div className="availability-panel">
      <div className="panel-header">
        <h2 className="section-title">Disponibilidade</h2>

        {isGameMaster && !showCreate && (
          <button
            className="create-campaign-button"
            type="button"
            onClick={() => setShowCreate(true)}
          >
            Nova enquete
          </button>
        )}
      </div>

      {showCreate && (
        <PollForm
          campaignId={campaignId}
          onCancel={() => setShowCreate(false)}
          onCreated={(poll) => {
            setShowCreate(false);
            loadPolls();
            setOpenPollId(poll.id);
          }}
        />
      )}

      {isLoading && <p className="muted">Carregando enquetes...</p>}
      {loadError && (
        <p className="form-message" role="alert">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && polls.length === 0 && !showCreate && (
        <div className="sessions-empty">
          <p>
            {isGameMaster
              ? "Crie uma enquete para o grupo marcar os dias e horários em que pode jogar."
              : "Nenhuma enquete aberta. Quando o mestre criar uma, marque aqui quando você pode jogar."}
          </p>
        </div>
      )}

      <ul className="poll-list">
        {polls.map((poll) => (
          <li key={poll.id}>
            <button type="button" onClick={() => setOpenPollId(poll.id)}>
              <span className="poll-title">
                {poll.title}
                <span
                  className={`status-badge ${
                    poll.status === "aberta" ? "status-agendada" : ""
                  }`}
                >
                  {poll.status === "aberta" ? "Aberta" : "Encerrada"}
                </span>
              </span>
              <span className="muted">
                {formatPeriod(poll)} · {poll.respondent_count} de{" "}
                {poll.member_count} responderam
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AvailabilityPanel;
