
import React from "react";
import { apiRequest } from "../api.js";
import { downloadText } from "../ficha5e.js";
import maisIcon from "../assets/mais.png";

// Acesso aos dados (LGPD): baixa tudo o que o sistema guarda sobre o
// usuário em JSON e abre a Política de Privacidade.
function MyDataSection({ onOpenPrivacy }) {
  const [message, setMessage] = React.useState("");
  const [isExporting, setIsExporting] = React.useState(false);

  async function handleExport() {
    setMessage("");
    setIsExporting(true);

    try {
      const data = await apiRequest("/api/me/export");
      const day = new Date().toISOString().slice(0, 10);

      downloadText(
        `encounter-hub-meus-dados-${day}.json`,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="profile-data-zone">
      <h2>Seus dados</h2>
      <p>
        Baixe uma cópia de tudo o que o Encounter Hub guarda sobre você:
        perfil, campanhas, presenças, disponibilidade, fichas, tokens e
        mensagens.
      </p>

      {message && (
        <p className="profile-delete-message" role="alert">
          {message}
        </p>
      )}

      <div className="profile-actions">
        <button
          className="profile-save-button"
          type="button"
          onClick={handleExport}
          disabled={isExporting}
        >
          {isExporting ? "Preparando..." : "Baixar meus dados"}
        </button>
        <button className="privacy-link" type="button" onClick={onOpenPrivacy}>
          Política de Privacidade
        </button>
      </div>
    </div>
  );
}

// Exclusão da conta (LGPD). Pede a senha; se o usuário for mestre de
// campanhas, mostra quais serão apagadas e exige uma confirmação a mais.
function DeleteAccountSection({ onAccountDeleted }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [campaigns, setCampaigns] = React.useState(null);
  const [confirmCampaigns, setConfirmCampaigns] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  function close() {
    setIsOpen(false);
    setPassword("");
    setCampaigns(null);
    setConfirmCampaigns(false);
    setMessage("");
  }

  async function handleDelete(event) {
    event.preventDefault();
    setMessage("");
    setIsDeleting(true);

    try {
      await apiRequest("/api/me", {
        method: "DELETE",
        body: { password, delete_campaigns: confirmCampaigns },
      });
      onAccountDeleted();
    } catch (error) {
      if (error.status === 409 && error.data?.campaigns) {
        setCampaigns(error.data.campaigns);
      } else {
        setMessage(error.message);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  if (!isOpen) {
    return (
      <div className="profile-danger-zone">
        <h2>Excluir conta</h2>
        <p>
          Apaga sua conta e seus dados pessoais, mensagens e tokens. Essa ação
          não pode ser desfeita.
        </p>
        <button
          className="profile-delete-button"
          type="button"
          onClick={() => setIsOpen(true)}
        >
          Excluir minha conta
        </button>
      </div>
    );
  }

  return (
    <form className="profile-danger-zone" onSubmit={handleDelete}>
      <h2>Excluir conta</h2>
      <p>
        Sua conta, foto, mensagens do chat, tokens, respostas de presença e
        disponibilidade serão apagados. Essa ação não pode ser desfeita.
      </p>

      {campaigns && (
        <div className="profile-delete-campaigns" role="alert">
          <p>
            Você é mestre destas campanhas. Elas serão excluídas para todos os
            participantes, com sessões, mapas e chat:
          </p>
          <ul>
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                {campaign.name}
                {" "}({campaign.player_count}{" "}
                {campaign.player_count === 1 ? "jogador" : "jogadores"})
              </li>
            ))}
          </ul>
          <label className="profile-delete-confirm">
            <input
              type="checkbox"
              checked={confirmCampaigns}
              onChange={(event) => setConfirmCampaigns(event.target.checked)}
            />
            Entendo que essas campanhas serão excluídas.
          </label>
        </div>
      )}

      <div className="profile-field">
        <label htmlFor="delete-password">Confirme com sua senha</label>
        <input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      {message && (
        <p className="profile-delete-message" role="alert">
          {message}
        </p>
      )}

      <div className="profile-actions">
        <button
          className="profile-delete-button"
          type="submit"
          disabled={isDeleting || (campaigns && !confirmCampaigns)}
        >
          {isDeleting ? "Excluindo..." : "Excluir definitivamente"}
        </button>
        <button
          className="profile-cancel-button"
          type="button"
          onClick={close}
          disabled={isDeleting}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function ProfilePage({ user, onBack, onUserUpdate, onAccountDeleted, onOpenPrivacy }) {
  const [name, setName] = React.useState(user?.name || "");
  const [photoPreview, setPhotoPreview] = React.useState(null);
  const [selectedPhoto, setSelectedPhoto] = React.useState(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const fileInputRef = React.useRef(null);

  // Atualiza o nome quando os dados do usuário mudarem.
  React.useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  // Libera a memória da pré-visualização anterior.
  React.useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setMessage("Envie uma imagem PNG, JPG, WEBP ou GIF.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage("A imagem deve ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }

    setMessage("");
    setSelectedPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSave(event) {
    event.preventDefault();
    setMessage("");

    const newName = name.trim();

    if (!newName) {
      setMessage("O nome não pode ficar vazio.");
      return;
    }

    if (newName.length > 20) {
      setMessage("O nome deve ter no máximo 20 caracteres.");
      return;
    }

    setIsSaving(true);

    try {
      let updatedUser = user;

      // Atualiza o nome, se necessário.
      if (newName !== user?.name) {
        const data = await apiRequest("/api/me", {
          method: "PATCH",
          body: {
            name: newName,
          },
        });

        updatedUser = data.user;
      }

      if (selectedPhoto) {
        const formData = new FormData();
          formData.append("avatar", selectedPhoto);

        const data = await apiRequest("/api/me/avatar", {
           method: "POST",
           formData,
      });

  updatedUser = data.user;

  setSelectedPhoto(null);
  setPhotoPreview(null);

  if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
}

      onUserUpdate(updatedUser);
      setName(updatedUser.name);

      setMessage("Alterações salvas com sucesso!");

    } catch (error) {
      setMessage(
        error.message || "Não foi possível salvar as alterações."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="profile-page">
      <div className="profile-panel">

        <button
          className="profile-back-button"
          type="button"
          onClick={onBack}
        >
          Voltar
        </button>

        <div className="profile-heading">
          <h1>Meu Perfil</h1>
          <p>Gerencie as informações da sua conta.</p>
        </div>

        <div className="profile-avatar-wrapper">
          <img
            className="profile-avatar-preview"
            src={photoPreview || user?.avatar_url || maisIcon}
            alt="Foto de perfil"
          />

          <button
            className="profile-upload-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSaving}
          >
            Alterar foto
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={handlePhotoChange}
          />
        </div>

        <form className="profile-form" onSubmit={handleSave}>
          <div className="profile-field">
            <label htmlFor="profile-name">Nome</label>

            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={20}
              placeholder="Digite seu nome"
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-email">E-mail</label>

            <input
              id="profile-email"
              type="email"
              value={user?.email || ""}
              disabled
            />
          </div>

          {message && (
            <p className="profile-message" role="status">
              {message}
            </p>
          )}

          <div className="profile-actions">
            <button
              type="submit"
              className="profile-save-button"
              disabled={isSaving}
            >
              {isSaving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>

        <MyDataSection onOpenPrivacy={onOpenPrivacy} />

        <DeleteAccountSection onAccountDeleted={onAccountDeleted} />

      </div>
    </section>
  );
}
