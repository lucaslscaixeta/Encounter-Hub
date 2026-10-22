import React from "react";
import { apiRequest, connectSocket, emitWithAck } from "../api.js";
import ChatPanel from "../components/ChatPanel.jsx";
import MapBoard from "../components/MapBoard.jsx";
import MapsPanel from "../components/MapsPanel.jsx";
import TokensPanel from "../components/TokensPanel.jsx";

const MAX_MESSAGES = 200;

// Primeira célula livre a partir do canto superior esquerdo.
function findFreeCell(tokens) {
  const taken = new Set(tokens.map((token) => `${token.x},${token.y}`));

  for (let y = 1; y < 50; y += 1) {
    for (let x = 1; x < 10; x += 1) {
      if (!taken.has(`${x},${y}`)) {
        return { x, y };
      }
    }
  }

  return { x: 0, y: 0 };
}

function GameTablePage({ campaignId, currentUser, onBack }) {
  const [table, setTable] = React.useState(null);
  const [tokens, setTokens] = React.useState([]);
  const [messages, setMessages] = React.useState([]);
  const [maps, setMaps] = React.useState([]);
  const [activeMap, setActiveMap] = React.useState(null);
  const [onlineUsers, setOnlineUsers] = React.useState([]);
  const [isConnected, setIsConnected] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("chat");
  const socketRef = React.useRef(null);

  const loadTable = React.useCallback(async () => {
    try {
      const data = await apiRequest(`/api/campaigns/${campaignId}/table`);

      setTable(data);
      setTokens(data.tokens);
      setMessages(data.messages);
      setMaps(data.maps);
      setActiveMap(data.active_map);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message);
    }
  }, [campaignId]);

  React.useEffect(() => {
    loadTable();
  }, [loadTable]);

  React.useEffect(() => {
    const socket = connectSocket();
    let hasConnectedBefore = false;
    socketRef.current = socket;

    socket.on("connect", async () => {
      const response = await emitWithAck(socket, "mesa:entrar", {
        campaign_id: campaignId,
      });

      if (response.error) {
        setNotice(response.error);
        return;
      }

      setIsConnected(true);
      setNotice("");

      // Ao reconectar, busca de novo o que mudou enquanto estava fora.
      if (hasConnectedBefore) {
        loadTable();
      }
      hasConnectedBefore = true;
    });

    socket.on("disconnect", () => setIsConnected(false));

    socket.on("connect_error", (error) => {
      setIsConnected(false);
      setNotice(error.message || "Não foi possível conectar à mesa.");
    });

    socket.on("mesa:presenca", ({ users }) => setOnlineUsers(users));

    socket.on("mesa:mapa", ({ map }) => {
      setActiveMap(map);

      if (map) {
        setMaps((current) =>
          current.map((item) => (item.id === map.id ? map : item))
        );
      }
    });

    socket.on("token:criado", (token) => {
      setTokens((current) =>
        current.some((item) => item.id === token.id)
          ? current
          : [...current, token]
      );
    });

    socket.on("token:movido", ({ id, x, y, size }) => {
      setTokens((current) =>
        current.map((token) =>
          token.id === id ? { ...token, x, y, size } : token
        )
      );
    });

    socket.on("token:atualizado", (updated) => {
      setTokens((current) =>
        current.map((token) => (token.id === updated.id ? updated : token))
      );
    });

    socket.on("token:removido", ({ id }) => {
      setTokens((current) => current.filter((token) => token.id !== id));
    });

    socket.on("chat:mensagem", (message) => {
      setMessages((current) => [...current, message].slice(-MAX_MESSAGES));
    });

    return () => {
      socket.emit("mesa:sair", { campaign_id: campaignId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [campaignId, loadTable]);

  function emit(event, payload) {
    if (!socketRef.current?.connected) {
      return Promise.resolve({
        error: "Sem conexão com a mesa. Tentando reconectar...",
      });
    }

    return emitWithAck(socketRef.current, event, payload);
  }

  function replaceToken(updated) {
    setTokens((current) =>
      current.map((token) => (token.id === updated.id ? updated : token))
    );
  }

  // Move e/ou redimensiona: changes = { x, y, size }.
  async function handleUpdateToken(tokenId, changes) {
    const previous = tokens.find((token) => token.id === tokenId);

    // Aplica na hora para quem mexeu; desfaz se o servidor recusar.
    replaceToken({ ...previous, ...changes });

    const response = await emit("token:mover", { token_id: tokenId, ...changes });

    if (response.error) {
      setNotice(response.error);
      replaceToken(previous);
    }
  }

  async function handleUploadTokenImage(tokenId, file) {
    const formData = new FormData();
    formData.append("file", file);

    const data = await apiRequest(`/api/tokens/${tokenId}/image`, {
      method: "POST",
      formData,
    });

    replaceToken(data.token);
  }

  async function handleRemoveTokenImage(tokenId) {
    const data = await apiRequest(`/api/tokens/${tokenId}/image`, {
      method: "DELETE",
    });

    replaceToken(data.token);
  }

  async function handleCreateToken(fields, imageFile) {
    const data = await apiRequest(`/api/campaigns/${campaignId}/tokens`, {
      method: "POST",
      body: { ...fields, ...findFreeCell(tokens) },
    });

    setTokens((current) =>
      current.some((item) => item.id === data.token.id)
        ? current
        : [...current, data.token]
    );

    if (imageFile) {
      await handleUploadTokenImage(data.token.id, imageFile);
    }
  }

  async function handleDeleteToken(tokenId) {
    await apiRequest(`/api/tokens/${tokenId}`, { method: "DELETE" });
    setTokens((current) => current.filter((token) => token.id !== tokenId));
  }

  async function handleUploadMap(formData) {
    const data = await apiRequest(`/api/campaigns/${campaignId}/maps`, {
      method: "POST",
      formData,
    });

    setMaps((current) => [data.map, ...current]);
  }

  async function handleActivateMap(mapId) {
    await apiRequest(`/api/campaigns/${campaignId}/active-map`, {
      method: "PUT",
      body: { map_id: mapId },
    });

    setActiveMap(maps.find((map) => map.id === mapId) || null);
  }

  async function handleUpdateMap(mapId, fields) {
    await apiRequest(`/api/maps/${mapId}`, { method: "PUT", body: fields });

    setMaps((current) =>
      current.map((map) => (map.id === mapId ? { ...map, ...fields } : map))
    );
    setActiveMap((current) =>
      current?.id === mapId ? { ...current, ...fields } : current
    );
  }

  async function handleResizeMap(box) {
    const previous = activeMap;

    // Aplica na hora; se o servidor recusar, volta ao tamanho anterior.
    setActiveMap({ ...previous, ...box });

    try {
      await handleUpdateMap(previous.id, box);
    } catch (error) {
      setNotice(error.message);
      setActiveMap(previous);
    }
  }

  async function handleDeleteMap(mapId) {
    await apiRequest(`/api/maps/${mapId}`, { method: "DELETE" });

    setMaps((current) => current.filter((map) => map.id !== mapId));
    setActiveMap((current) => (current?.id === mapId ? null : current));
  }

  if (loadError) {
    return (
      <main className="table-page table-page-message">
        <p className="form-message" role="alert">
          {loadError}
        </p>
        <button className="create-campaign-button" type="button" onClick={onBack}>
          Voltar
        </button>
      </main>
    );
  }

  if (!table) {
    return (
      <main className="table-page table-page-message">
        <p className="muted">Preparando a mesa...</p>
      </main>
    );
  }

  const isGameMaster = table.role === "gm";
  const tabs = [
    ["chat", "Chat e dados"],
    ["tokens", "Tokens"],
    ...(isGameMaster ? [["maps", "Mapas"]] : []),
  ];

  return (
    <main className="table-page">
      <header className="table-topbar">
        <button className="text-button" type="button" onClick={onBack}>
          ← Sair da mesa
        </button>

        <h1>{table.campaign.name}</h1>

        <div className="table-status">
          <span
            className={`connection-dot ${isConnected ? "online" : ""}`}
            aria-hidden="true"
          />
          <span className="sr-only">
            {isConnected ? "Conectado" : "Desconectado"}
          </span>

          <ul className="online-users" aria-label="Quem está na mesa">
            {onlineUsers.map((user) => (
              <li key={user.id} title={user.name}>
                {user.name}
              </li>
            ))}
          </ul>
        </div>
      </header>

      {notice && (
        <p className="table-notice" role="alert">
          {notice}
          <button type="button" onClick={() => setNotice("")} aria-label="Fechar aviso">
            ×
          </button>
        </p>
      )}

      <div className="table-layout">
        <section className="table-board" aria-label="Mapa">
          <MapBoard
            map={activeMap}
            tokens={tokens}
            currentUserId={currentUser.id}
            canEditMap={isGameMaster}
            canMoveToken={(token) =>
              isGameMaster || token.owner_id === currentUser.id
            }
            onUpdateToken={handleUpdateToken}
            onUpdateMap={handleResizeMap}
          />

          {!activeMap && (
            <p className="board-hint">
              {isGameMaster
                ? "Nenhum mapa na mesa. Envie um na aba Mapas."
                : "O mestre ainda não colocou um mapa na mesa."}
            </p>
          )}
        </section>

        <aside className="table-sidebar">
          <div className="tab-switch" role="tablist">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                className={activeTab === key ? "active" : ""}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "chat" && (
            <ChatPanel
              messages={messages}
              currentUserId={currentUser.id}
              onSend={(content) =>
                emit("chat:enviar", { campaign_id: campaignId, content })
              }
              onRoll={(expression, label) =>
                emit("dados:rolar", { campaign_id: campaignId, expression, label })
              }
            />
          )}

          {activeTab === "tokens" && (
            <TokensPanel
              tokens={tokens}
              members={table.members}
              currentUser={currentUser}
              isGameMaster={isGameMaster}
              onCreate={handleCreateToken}
              onDelete={handleDeleteToken}
              onUploadImage={handleUploadTokenImage}
              onRemoveImage={handleRemoveTokenImage}
            />
          )}

          {activeTab === "maps" && isGameMaster && (
            <MapsPanel
              maps={maps}
              activeMapId={activeMap?.id}
              onUpload={handleUploadMap}
              onActivate={handleActivateMap}
              onUpdate={handleUpdateMap}
              onDelete={handleDeleteMap}
            />
          )}
        </aside>
      </div>
    </main>
  );
}

export default GameTablePage;
