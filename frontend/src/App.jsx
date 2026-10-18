import React from "react";
import profileIcon from "./assets/profile-icon.png";
import "./App.css";

function SessionsPage({ onGoToCampaigns }) {
  const sessions = [];

  return (
    <section className="sessions-panel">
      <h1>Suas sessões marcadas:</h1>

      {sessions.length > 0 ? (
        <div className="sessions-grid">
          {sessions.map((session) => (
            <article className="session-card" key={session.id}>
              <h2>{session.title}</h2>
              <p>Campanha: {session.campaign}</p>
              <p>Data: {session.date}</p>
              <p>Status: {session.status}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="sessions-empty">
          <h2>
            Você, por enquanto, não está envolvido em nenhuma aventura.
          </h2>

          <p>
            Que tal entrar em alguma campanha para participar?
            Vai que você crie sua própria aventura... (◕‿◕)
          </p>

          <button
            className="create-campaign-button"
            type="button"
            onClick={onGoToCampaigns}
          >
            Campanhas
          </button>
        </div>
      )}
    </section>
  );
}

function CharactersPage() {
  function handleDownload() {
    const ficha = [
      "ENCOUNTER HUB",
      "FICHA DE PERSONAGEM",
      "",
      "Nome: ",
      "Jogador: ",
      "Classe: ",
      "Raça: ",
      "Nível: 1",
      "Pontos de vida: ",
      "Classe de armadura: ",
      "Atributos: ",
      "Habilidades: ",
      "Equipamentos: ",
      "História: ",
    ].join("\n");

    const arquivo = new Blob(
      [ficha],
      { type: "text/plain;charset=utf-8" }
    );

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download = "ficha-personagem.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="campaigns-panel">
      <h1>Suas fichas</h1>

      <div className="campaigns-empty">
        <h2>Nenhuma ficha por enquanto</h2>

        <p>
          Baixe um modelo de ficha para começar a organizar
          as informações do seu personagem.
        </p>

        <button
          className="create-campaign-button"
          type="button"
          onClick={handleDownload}
        >
          Baixar ficha
        </button>
      </div>
    </section>
  );
}

function CampaignsPage() {
  return (
    <section className="campaigns-panel">
      <h1>Suas campanhas</h1>

      <div className="campaigns-empty">
        <h2>Nenhuma campanha por enquanto</h2>

        <p>
          Crie sua primeira campanha e reúna seu grupo de aventureiros.
        </p>

        <button
          className="create-campaign-button"
          type="button"
        >
          Criar primeira campanha
        </button>
      </div>
    </section>
  );
}

function Dashboard({ onLogout }) {
  const [activePage, setActivePage] = React.useState("campaigns");

  return (
    <main className="campaigns-page">
      <header className="topbar">
        <div className="brand">
          <img
            src="/src/assets/encounter-logo.png"
            alt="Logo Encounter Hub"
          />

          <span>
            Encounter
            <br />
            Hub
          </span>
        </div>

        <nav className="topbar-nav">
          <button
            className="topbar-logout"
            type="button"
            onClick={onLogout}
          >
            Sair
          </button>

          <button
            className="profile-button"
            type="button"
            aria-label="Perfil do usuário"
          >
            <img src={profileIcon} alt="" />
          </button>

          <button
            className={`topbar-link ${
              activePage === "campaigns" ? "active" : ""
            }`}
            type="button"
            onClick={() => setActivePage("campaigns")}
          >
            Campanhas
          </button>

          <button
            className={`topbar-link ${
              activePage === "sessions" ? "active" : ""
            }`}
            type="button"
            onClick={() => setActivePage("sessions")}
          >
            Sessões
          </button>

          <button
            className={`topbar-link ${
              activePage === "characters" ? "active" : ""
            }`}
            type="button"
            onClick={() => setActivePage("characters")}
          >
            Suas Fichas
          </button>
        </nav>
      </header>

      {activePage === "campaigns" && <CampaignsPage />}

      {activePage === "sessions" && (
        <SessionsPage
          onGoToCampaigns={() => setActivePage("campaigns")}
        />
      )}

      {activePage === "characters" && <CharactersPage />}

      <footer className="campaigns-footer">
        © 2026 Encounter Hub. Todos os direitos reservados.
      </footer>
    </main>
  );
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setIsLoggedIn(true);
  }

  function handleForgotPassword() {
    // A recuperação de senha será implementada posteriormente.
  }

  function handleCreateAccount() {
    // A criação de conta será implementada posteriormente.
  }

  if (isLoggedIn) {
    return (
      <Dashboard
        onLogout={() => setIsLoggedIn(false)}
      />
    );
  }

  return (
    <main className="login-page">
      <section className="login-content">
        <div className="intro">
          <h1>Encounter Hub</h1>

          <p>
            Traga seus mapas e suas fichas, a mesa é por
            <br className="desktop-break" /> nossa conta!
          </p>
        </div>

        <div className="login-area">
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-heading">
              <span>Entre:</span>

              <button
                className="forgot-link"
                type="button"
                onClick={handleForgotPassword}
              >
                Esqueceu a senha?
              </button>
            </div>

            <label className="sr-only" htmlFor="email">
              E-mail
            </label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="E-mail"
              autoComplete="email"
              required
            />

            <label className="sr-only" htmlFor="password">
              Senha
            </label>

            <input
              id="password"
              name="password"
              type="password"
              placeholder="Senha"
              autoComplete="current-password"
              required
            />

            <button className="login-button" type="submit">
              Entrar
            </button>
          </form>

          <div className="signup-area">
            <p>Não possui uma conta?</p>

            <button
              className="signup-button"
              type="button"
              onClick={handleCreateAccount}
            >
              Criar nova conta
            </button>
          </div>
        </div>
      </section>

      <div className="logo-area">
        <img
          className="encounter-logo"
          src="/src/assets/encounter-logo.png"
          alt="Símbolo dourado do Encounter Hub"
        />
      </div>

      <footer className="site-footer">
        © 2026 Encounter Hub. Todos os direitos reservados.
      </footer>
    </main>
  );
}

export default App;
