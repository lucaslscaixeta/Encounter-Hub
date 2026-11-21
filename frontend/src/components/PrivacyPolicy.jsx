import React from "react";

export const PRIVACY_POLICY_UPDATED_AT = "21/11/2026";

// Texto da Política de Privacidade (LGPD). Ao mudar o que o sistema
// coleta ou por quanto tempo guarda, atualize esta página e a data acima.
function PrivacyPolicyContent() {
  return (
    <>
      <p className="privacy-updated">
        Última atualização: {PRIVACY_POLICY_UPDATED_AT}
      </p>

      <p>
        O Encounter Hub é um projeto acadêmico da Universidade Federal de Ouro
        Preto (UFOP) para organizar campanhas e sessões de RPG de mesa. Esta
        política explica quais dados pessoais tratamos, para quê, com quem eles
        são compartilhados, por quanto tempo ficam guardados e como você exerce
        seus direitos previstos na Lei Geral de Proteção de Dados Pessoais
        (LGPD, Lei nº 13.709/2018).
      </p>

      <h3>1. Dados que coletamos</h3>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail e senha. A senha é guardada
          somente como hash (scrypt), nunca em texto puro.
        </li>
        <li>
          <strong>Perfil:</strong> foto de perfil, se você enviar uma.
        </li>
        <li>
          <strong>Conteúdo que você cria:</strong> campanhas, sessões,
          respostas de presença, disponibilidade nas enquetes, fichas de
          personagem, tokens, mensagens e rolagens do chat, mapas e imagens.
        </li>
        <li>
          <strong>Registros de segurança:</strong> endereço IP nas tentativas
          de login, cadastro e recuperação de senha, usado para limitar
          abusos; e a data do aceite desta política.
        </li>
      </ul>

      <h3>2. Para que usamos os dados</h3>
      <ul>
        <li>Criar e manter sua conta e confirmar seu e-mail.</li>
        <li>
          Fazer a plataforma funcionar: campanhas, agendamento, mesa virtual,
          chat, rolagens e fichas.
        </li>
        <li>
          Enviar e-mails do serviço: confirmação de cadastro, recuperação de
          senha, avisos de ausência ao mestre, cancelamento de sessão e
          confirmação de exclusão da conta.
        </li>
        <li>Proteger as contas contra acessos indevidos e abusos.</li>
      </ul>
      <p>
        Não vendemos seus dados, não os usamos para publicidade e não
        coletamos mais do que o necessário para essas finalidades.
      </p>

      <h3>3. Quem vê os seus dados</h3>
      <ul>
        <li>
          Os membros das campanhas em que você está veem seu nome, sua foto,
          suas mensagens, suas respostas de presença e sua disponibilidade.
        </li>
        <li>
          Suas fichas são vistas e editadas por você e pelo mestre da
          campanha. Os pontos de vida do personagem só aparecem para você e
          para o mestre. Rolagens &quot;só para o mestre&quot; ficam visíveis
          apenas para você e para ele.
        </li>
        <li>Seu e-mail não é mostrado aos outros membros.</li>
      </ul>

      <h3>4. Serviços de terceiros</h3>
      <ul>
        <li>
          <strong>Supabase:</strong> hospeda o banco de dados e as imagens.
        </li>
        <li>
          <strong>Google (Gmail):</strong> envia os e-mails do serviço.
        </li>
      </ul>
      <p>
        As imagens (mapas, tokens, retratos de fichas e fotos de perfil)
        ficam em um armazenamento público: qualquer pessoa que tenha o link da
        imagem consegue abri-la. Os nomes dos arquivos são aleatórios e não
        podem ser adivinhados, mas evite enviar imagens com informações
        pessoais.
      </p>

      <h3>5. Por quanto tempo guardamos</h3>
      <ul>
        <li>Dados da conta e conteúdo: enquanto a conta existir.</li>
        <li>
          Contas que não confirmam o e-mail são apagadas automaticamente
          após 7 dias.
        </li>
        <li>Sessões de login expiram em 7 dias.</li>
        <li>Links de recuperação de senha expiram em 1 hora.</li>
        <li>Registros de tentativas (com IP) são apagados após 1 dia.</li>
      </ul>

      <h3>6. Seus direitos</h3>
      <ul>
        <li>
          <strong>Acesso:</strong> em Perfil, use &quot;Baixar meus
          dados&quot; para receber uma cópia dos seus dados em JSON.
        </li>
        <li>
          <strong>Correção:</strong> altere nome e foto em Perfil.
        </li>
        <li>
          <strong>Exclusão:</strong> em Perfil, use &quot;Excluir minha
          conta&quot;. Sua conta, foto, mensagens, tokens, fichas, presenças e
          disponibilidade são apagados. Campanhas em que você é mestre são
          excluídas junto, depois da sua confirmação.
        </li>
        <li>
          <strong>Dúvidas e outros pedidos:</strong> responda qualquer e-mail
          enviado pelo Encounter Hub.
        </li>
      </ul>

      <h3>7. Segurança</h3>
      <p>
        Senhas e tokens de acesso são guardados apenas como hash, as
        tentativas de login são limitadas e cada ação é autorizada no servidor
        de acordo com o seu papel na campanha.
      </p>
    </>
  );
}

// Janela com a política, aberta pelo rodapé, pelo cadastro e pelo perfil.
export function PrivacyPolicyModal({ onClose }) {
  React.useEffect(() => {
    function handleKey(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="privacy-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <article className="privacy-dialog">
        <header className="privacy-header">
          <h2 id="privacy-title">Política de Privacidade</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        <div className="privacy-body">
          <PrivacyPolicyContent />
        </div>
      </article>
    </div>
  );
}

// Rodapé com o link para a política; usado em todas as telas.
export function SiteFooter({ className = "site-footer", onOpenPrivacy }) {
  return (
    <footer className={className}>
      © 2026 Encounter Hub. Todos os direitos reservados.
      {" · "}
      <button className="privacy-link" type="button" onClick={onOpenPrivacy}>
        Política de Privacidade
      </button>
    </footer>
  );
}
