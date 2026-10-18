import React from "react";
import profileIcon from "./assets/profile-icon.png";
import "./App.css";

function Dashboard({ onLogout }) {
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

          <button className="topbar-link active" type="button">
            Campanhas
          </button>

          <button className="topbar-link" type="button">
            Sessões
          </button>

          <button className="topbar-link" type="button">
            Suas Fichas
          </button>
        </nav>
      </header>

      <section className="campaigns-panel">
        <h1>Suas campanhas</h1>

        <div className="campaigns-empty">
          <h2>Nenhuma campanha por enquanto</h2>

          <p>
            Crie sua primeira campanha e reúna seu grupo de aventureiros.
          </p>

          <button className="create-campaign-button" type="button">
            Criar primeira campanha
          </button>
        </div>
      </section>

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
