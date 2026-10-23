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
  });

  return `${day} às ${time}`;
}

export function formatMessageTime(value) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
