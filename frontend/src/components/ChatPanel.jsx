import React from "react";
import { formatMessageTime } from "../formatacao.js";

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

// Aceita "/r 1d20+5 Ataque" ou "/roll 2d6" no campo do chat.
const ROLL_COMMAND = /^\/(r|roll)\s+(\S+)\s*(.*)$/i;

function RollResult({ roll }) {
  return (
    <div className="roll-result">
      <span className="roll-total">{roll.total}</span>
      <span className="roll-detail">
        {roll.expression}:{" "}
        {roll.terms
          .map((term, index) => {
            if (!term.sides) {
              return term.term;
            }

            const sign = term.term.startsWith("-") ? "-" : index > 0 ? "+" : "";
            return `${sign}[${term.values.join(", ")}]`;
          })
          .join(" ")}
      </span>
    </div>
  );
}

function ChatPanel({ messages, currentUserId, onSend, onRoll }) {
  const [text, setText] = React.useState("");
  const [expression, setExpression] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState("");
  const listRef = React.useRef(null);

  React.useEffect(() => {
    const list = listRef.current;

    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  async function submit(action) {
    setError("");
    const response = await action();

    if (response.error) {
      setError(response.error);
      return false;
    }

    return true;
  }

  async function handleSend(event) {
    event.preventDefault();

    const content = text.trim();

    if (!content) {
      return;
    }

    const command = content.match(ROLL_COMMAND);
    const sent = await submit(() =>
      command ? onRoll(command[2], command[3]) : onSend(content)
    );

    if (sent) {
      setText("");
    }
  }

  async function handleRoll(event) {
    event.preventDefault();

    if (await submit(() => onRoll(expression, label))) {
      setLabel("");
    }
  }

  return (
    <div className="chat-panel">
      <ol className="chat-messages" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <li className="muted">
            Nenhuma mensagem ainda. Diga olá ou role um dado!
          </li>
        )}

        {messages.map((message) => (
          <li
            key={message.id}
            className={`chat-message ${
              message.user.id === currentUserId ? "mine" : ""
            } ${message.kind === "roll" ? "roll" : ""}`}
          >
            <div className="chat-meta">
              <strong>{message.user.name || "Usuário removido"}</strong>
              <time dateTime={message.created_at}>
                {formatMessageTime(message.created_at)}
              </time>
            </div>

            {message.kind === "roll" ? (
              <>
                {message.content !== message.roll.expression && (
                  <p className="roll-label">{message.content}</p>
                )}
                <RollResult roll={message.roll} />
              </>
            ) : (
              <p>{message.content}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="dice-tray">
        <div className="quick-dice" role="group" aria-label="Rolagem rápida">
          {QUICK_DICE.map((die) => (
            <button
              key={die}
              type="button"
              onClick={() => submit(() => onRoll(`1${die}`, ""))}
            >
              {die}
            </button>
          ))}
        </div>

        <form className="dice-form" onSubmit={handleRoll}>
          <input
            type="text"
            placeholder="1d20+5"
            aria-label="Expressão de dados"
            maxLength={60}
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Motivo (opcional)"
            aria-label="Motivo da rolagem"
            maxLength={60}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button type="submit">Rolar</button>
        </form>
      </div>

      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}

      <form className="chat-form" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Mensagem ou /r 1d20+5"
          aria-label="Mensagem"
          maxLength={1000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
}

export default ChatPanel;
