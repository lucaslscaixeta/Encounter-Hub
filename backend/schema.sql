-- Esquema do banco do Encounter Hub (Postgres / Supabase).
-- Executado sempre que o backend sobe; IF NOT EXISTS mantém os dados.

-- Os e-mails são gravados em minúsculas pelo backend.
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    verification_token_hash TEXT,
    verification_expires_at TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tokens de acesso gerados no login.
CREATE TABLE IF NOT EXISTS auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A campanha é a mesa permanente (como um "jogo" do Roll20):
-- os membros podem entrar no mapa a qualquer momento.
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    invite_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- role: "gm" (mestre) ou "player" (jogador).
CREATE TABLE IF NOT EXISTS campaign_members (
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'player',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (campaign_id, user_id)
);

-- filename: nome do arquivo na pasta "maps/" do Supabase Storage.
-- x, y, width, height: posição e tamanho da imagem na mesa, em pixels;
-- width/height nulos = tamanho original da imagem.
-- grid_columns/grid_rows: tamanho da grade em quadrados;
-- nulos = a grade acompanha o tamanho da imagem.
CREATE TABLE IF NOT EXISTS maps (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    grid_size INTEGER NOT NULL DEFAULT 50,
    x INTEGER NOT NULL DEFAULT 0,
    y INTEGER NOT NULL DEFAULT 0,
    width INTEGER,
    height INTEGER,
    grid_columns INTEGER,
    grid_rows INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criada depois de "maps" porque as duas tabelas se referenciam.
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS active_map_id INTEGER
    REFERENCES maps(id) ON DELETE SET NULL;

-- Sessões agendadas da campanha (scheduled_at no horário local,
-- formato "2026-10-25T19:30").
-- mode: "online" ou "presencial".
-- status: "agendada", "concluida" ou "cancelada".
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    scheduled_at TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'online',
    location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'agendada',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- status: "confirmado", "talvez" ou "recusado".
CREATE TABLE IF NOT EXISTS session_attendance (
    session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (session_id, user_id)
);

-- Peças posicionadas no mapa da mesa (coordenadas em células).
-- size: quantas células o token ocupa de lado (1 = 1x1).
-- image_filename: nome do arquivo na pasta "tokens/" do Storage.
CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#ffb82e',
    x INTEGER NOT NULL DEFAULT 0,
    y INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 1,
    image_filename TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kind: "message" (chat) ou "roll" (rolagem de dados).
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'message',
    content TEXT NOT NULL,
    roll_data TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O backend acessa o banco direto pela connection string; o RLS ligado
-- sem políticas impede o acesso às tabelas pela API pública do Supabase.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
