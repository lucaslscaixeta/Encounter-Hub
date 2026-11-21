# Encounter-Hub
Plataforma para organizar campanhas e sessões de RPG, com mapas interativos, personagens, chat e recursos para partidas online.

## Como rodar

Backend (Flask + Socket.IO, porta 5000):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows (no Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
python app.py
```

Antes de subir, copie `backend/.env.example` para `backend/.env` e preencha:

- **Supabase**: no botão "Connect" do painel, a aba "Direct" (Shared pooler,
  porta 5432) dá a `DATABASE_URL`, e a aba "Server" dá `SUPABASE_URL` e
  `SUPABASE_SECRET_KEY`. As tabelas (`backend/schema.sql`) são criadas quando o
  backend sobe, e o bucket de imagens no primeiro envio.
- **E-mail**: `MAIL_USERNAME`, `MAIL_PASSWORD` (senha de app do Gmail) e
  `MAIL_DEFAULT_SENDER`. O cadastro envia um e-mail de confirmação, e a conta só
  pode entrar depois de confirmada.

Os dados ficam no Postgres do Supabase e as imagens de mapas e tokens no
Supabase Storage, então todo o grupo compartilha o mesmo banco.

Frontend (React + Vite):

```bash
cd frontend
npm install
npm run dev
```

## Como funciona

- **Campanha = mesa permanente** (como um jogo do Roll20). O mestre cria a campanha
  e compartilha o código de convite; os membros podem abrir a mesa a qualquer momento.
- **Sessões** são o agendamento: o mestre marca data/horário (online ou presencial,
  com local) e cada membro confirma presença (confirmado, talvez ou não vai).
- **Mesa virtual**: mapa com grade (Konva.js), tokens que todos veem se mover em tempo
  real, chat, rolagem de dados (ex.: `1d20+5`, ou `/r 2d6 Dano` no chat) e lista de
  quem está online. O mestre envia os mapas e escolhe qual aparece na mesa.
- **Grade e mapa**: na aba Mapas o mestre define o tamanho do quadrado (px) e a
  largura/altura da grade em quadrados (ex.: 3 × 50; em branco = acompanha a imagem).
  "Encaixar mapa na grade" estica a imagem para cobrir a grade; para ajustar à mão,
  o mestre clica no mapa e arrasta as alças das bordas.
- **Tokens**: podem ter imagem (até 5 MB, exibida em círculo) e mudar de tamanho
  clicando no token e arrastando os cantos (de 1×1 até 10×10 quadrados). O mestre
  edita todos; o jogador, só os seus. O servidor prende os tokens dentro da grade
  do mapa ativo (sem mapa, 30 × 20 quadrados).
- **Privacidade (LGPD)**: o cadastro exige o aceite da Política de Privacidade
  (link no rodapé de todas as telas). Em Perfil, o usuário baixa todos os seus
  dados em JSON ("Baixar meus dados") ou exclui a conta.

## Testes

Os testes ficam em `backend/tests` e usam pytest:

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

Eles usam o banco do `DATABASE_URL`, mas cada teste cria um schema temporário
(`teste_xxxxxxxx`) que é apagado no fim, mesmo quando o teste falha; os dados
reais não são tocados. Use a connection string do Session pooler (porta 5432).
Nenhum e-mail é enviado e nada vai para o Storage: os dois serviços são
substituídos por versões falsas. Sem `DATABASE_URL`, os testes que usam o banco
são pulados.

## Decisões de projeto

- **Concorrência na mesa**: o servidor é a autoridade sobre o estado. Se duas
  pessoas movem o mesmo token ao mesmo tempo, vale a última posição gravada, e
  todos recebem `token:movido` com essa posição final.
- **Imagens públicas**: o bucket do Supabase Storage é público. Os nomes dos
  arquivos são aleatórios (128 bits), então só quem recebe o link da mesa vê as
  imagens, mas quem tem o link consegue abri-lo. Por isso não usamos links
  temporários; a Política de Privacidade avisa o usuário disso.
- **Propostas para o futuro** (ainda não implementadas): prefixo `/api/v1` quando
  a API mudar de forma incompatível, e uma fila de mensagens (ex.: Redis) para o
  Socket.IO se o backend rodar em mais de uma instância.

## Estrutura do backend

| Arquivo | Responsabilidade |
| --- | --- |
| `app.py` | Ponto de entrada; registra as rotas e o Socket.IO |
| `banco.py` | Conexão com o Postgres do Supabase (pool de conexões) |
| `schema.sql` | Criação das tabelas, executada quando o backend sobe |
| `imagens.py` | Validação e envio de imagens para o Supabase Storage |
| `autenticacao.py` | Cadastro, confirmação de e-mail, login com token, perfil e senha |
| `conta.py` | Exportação dos dados e exclusão da conta (LGPD) |
| `limites.py` | Limite de tentativas (login, cadastro, senha) |
| `manutencao.py` | Limpeza automática de dados vencidos |
| `campanhas.py` | Campanhas, convites e participantes |
| `sessoes.py` | Agendamento de sessões e confirmação de presença |
| `disponibilidade.py` | Enquetes de disponibilidade para marcar sessões |
| `avisos.py` | Avisos por e-mail de ausências e de sessões canceladas |
| `mapas.py` | Upload e escolha do mapa da mesa |
| `mesa_virtual.py` | Estado da mesa, tokens, chat e dados em tempo real |
| `personagens.py` | Fichas de personagem de D&D 5e |
| `dados.py` | Rolagem de dados (feita no servidor) |
| `tests/` | Testes automatizados (pytest) |
