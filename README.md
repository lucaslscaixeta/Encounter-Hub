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

As contas ficam salvas no SQLite (`backend/encounter_hub.db`, criado ao subir o
servidor). Por enquanto não há confirmação de e-mail: a conta já pode entrar
assim que é criada.

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

## Estrutura do backend

| Arquivo | Responsabilidade |
| --- | --- |
| `app.py` | Ponto de entrada; registra as rotas e o Socket.IO |
| `banco.py` | Conexão com o SQLite e criação das tabelas |
| `autenticacao.py` | Cadastro e login com token |
| `campanhas.py` | Campanhas, convites e participantes |
| `sessoes.py` | Agendamento de sessões e confirmação de presença |
| `mapas.py` | Upload e escolha do mapa da mesa |
| `mesa_virtual.py` | Estado da mesa, tokens, chat e dados em tempo real |
| `dados.py` | Rolagem de dados (feita no servidor) |
