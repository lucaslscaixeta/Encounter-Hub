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
            Vai que você crie sua própria aventura!
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
  const [showRegister, setShowRegister] = React.useState(false);
  const [loginMessage, setLoginMessage] = React.useState("");
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  const [registerName, setRegisterName] = React.useState("");
  const [registerEmail, setRegisterEmail] = React.useState("");
  const [registerPassword, setRegisterPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [registerMessage, setRegisterMessage] = React.useState("");
  const [isRegistering, setIsRegistering] = React.useState(false);
  

  
async function handleSubmit(event) {
  event.preventDefault();
  setLoginMessage("");
  setIsLoggingIn(true);

  const form = event.currentTarget;
  const email = form.elements.email.value;
  const password = form.elements.password.value;

  try {
    const response = await fetch("http://127.0.0.1:5000/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      setLoginMessage(data.error || "Não foi possível entrar.");
      return;
    }

    setIsLoggedIn(true);
  } catch {
    setLoginMessage(
      "Não foi possível conectar ao servidor. Verifique se o backend está ativo."
    );
  } finally {
    setIsLoggingIn(false);
  }
}


  function handleForgotPassword() {
    // A recuperação de senha será implementada posteriormente.
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    setRegisterMessage("");

    if (registerPassword !== confirmPassword) {
      setRegisterMessage("As senhas não coincidem.");
      return;
    }

    setIsRegistering(true);

    try {
      const response = await fetch("http://127.0.0.1:5000/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: registerName,
          email: registerEmail,
          password: registerPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setRegisterMessage(data.error || "Não foi possível criar a conta.");
        return;
      }

      setRegisterMessage("Conta criada com sucesso! Você já pode entrar.");
      setRegisterName("");
      setRegisterEmail("");
      setRegisterPassword("");
      setConfirmPassword("");
    } catch {
      setRegisterMessage(
        "Não foi possível conectar ao servidor. Verifique se o backend está ativo."
      );
    } finally {
      setIsRegistering(false);
    }
  }

  if (isLoggedIn) {
    return <Dashboard onLogout={() => setIsLoggedIn(false)} />;
  }

  if (showRegister) {
    return (
      <main className="login-page">
        <section className="login-content">
          <div className="intro">
            <h1>Encounter Hub</h1>
            <p>
              Comece sua aventura.
              <br className="desktop-break" /> Crie sua conta!
            </p>
          </div>

          <div className="login-area">
            <form className="login-form" onSubmit={handleCreateAccount}>
              <div className="form-heading">
                <span>Criar conta:</span>
              </div>

              <label className="sr-only" htmlFor="register-name">
                Nome
              </label>
              <input
                id="register-name"
                name="name"
                type="text"
                placeholder="Nome"
                autoComplete="name"
                maxLength={100}
                value={registerName}
                onChange={(event) => setRegisterName(event.target.value)}
                required
              />

              <label className="sr-only" htmlFor="register-email">
                E-mail
              </label>
              <input
                id="register-email"
                name="email"
                type="email"
                placeholder="E-mail"
                autoComplete="email"
                maxLength={254}
                value={registerEmail}
                onChange={(event) => setRegisterEmail(event.target.value)}
                required
              />

              <label className="sr-only" htmlFor="register-password">
                Senha
              </label>
              <input
                id="register-password"
                name="password"
                type="password"
                placeholder="Senha (mínimo 8 caracteres)"
                autoComplete="new-password"
                minLength={8}
                value={registerPassword}
                onChange={(event) => setRegisterPassword(event.target.value)}
                required
              />

              <label className="sr-only" htmlFor="confirm-password">
                Confirmar senha
              </label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                placeholder="Confirmar senha"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />

              {registerMessage && (
                <p role="status" aria-live="polite">
                  {registerMessage}
                </p>
              )}

              <button
                className="login-button"
                type="submit"
                disabled={isRegistering}
              >
                {isRegistering ? "Criando conta..." : "Criar conta"}
              </button>
            </form>

            <div className="signup-area">
              <p>Já possui uma conta?</p>
              <button
                className="signup-button"
                type="button"
                onClick={() => {
                  setRegisterMessage("");
                  setShowRegister(false);
                }}
              >
                Voltar ao login
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

    {loginMessage && (
      <p role="alert" aria-live="polite">
        {loginMessage}
      </p>
    )}

    <button
      className="login-button"
      type="submit"
      disabled={isLoggingIn}
    >
      {isLoggingIn ? "Entrando..." : "Entrar"}
    </button>
  </form>

  <div className="signup-area">
    <p>Não possui uma conta?</p>
    <button
      className="signup-button"
      type="button"
      onClick={() => setShowRegister(true)}
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