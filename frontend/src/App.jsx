
import "./App.css";

function App() {
  function handleSubmit(event) {
    event.preventDefault();
    // A autenticação será implementada posteriormente.
  }

  function handleForgotPassword() {
    // A recuperação de senha será implementada posteriormente.
  }

  function handleCreateAccount() {
    // A criação de conta será implementada posteriormente.
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
