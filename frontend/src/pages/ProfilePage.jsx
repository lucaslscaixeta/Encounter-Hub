
import React from "react";
import { apiRequest } from "../api.js";
import maisIcon from "../assets/mais.png";

export default function ProfilePage({ user, onBack, onUserUpdate }) {
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

      </div>
    </section>
  );
}
