import { io } from "socket.io-client";

export const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

const TOKEN_KEY = "encounter-hub-token";

let unauthorizedHandler = null;

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Sem localStorage o login vale só enquanto a página estiver aberta.
  }
}

// Chamado quando o token expira, para voltar à tela de login.
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export function assetUrl(path) {
  return `${API_URL}${path}`;
}

export async function apiRequest(path, { method = "GET", body, formData } = {}) {
  const headers = {};
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o backend está ativo."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 && token && unauthorizedHandler) {
    unauthorizedHandler();
  }

  if (!response.ok) {
    throw new Error(data.error || "Algo deu errado. Tente novamente.");
  }

  return data;
}

export function connectSocket() {
  return io(API_URL, { auth: { token: getToken() } });
}

// Envia um evento e espera a resposta do servidor ({ ok } ou { error }).
export function emitWithAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, payload, (error, response) => {
      if (error) {
        resolve({ error: "O servidor não respondeu. Tente novamente." });
      } else {
        resolve(response || {});
      }
    });
  });
}
