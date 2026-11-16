// As sessões são salvas no horário local, no formato "2026-10-25T19:30".
export function formatSessionDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const time = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return `${day} às ${time}`;
}

export function formatMessageTime(value) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

// Hora cheia no formato de 24 horas: 9 -> "09:00", 24 -> "24:00" (meia-noite).
export function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export const ATTENDANCE_LABELS = {
  confirmado: "Confirmado",
  talvez: "Talvez",
  recusado: "Não vai",
};

export const SESSION_STATUS_LABELS = {
  agendada: "Agendada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
