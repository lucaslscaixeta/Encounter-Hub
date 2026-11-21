import os

from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from autenticacao import auth_bp
from avisos import reminder_loop
from banco import init_db
from campanhas import campaigns_bp
from conta import account_bp
from disponibilidade import availability_bp
from extensoes import socketio
from manutencao import cleanup_loop
from mapas import MAX_MAP_SIZE, maps_bp
from mesa_virtual import table_bp
from personagens import characters_bp
from sessoes import sessions_bp


app = Flask(__name__)
CORS(app)

# Atrás de um proxy (ex.: hospedagem em produção), informe em
# TRUSTED_PROXIES quantos proxies há na frente, para o limite de tentativas
# usar o IP real de quem acessa e não o do proxy.
trusted_proxies = int(os.getenv("TRUSTED_PROXIES") or 0)

if trusted_proxies:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=trusted_proxies)

# Margem extra para os demais campos do formulário de upload.
app.config["MAX_CONTENT_LENGTH"] = MAX_MAP_SIZE + 1024 * 1024

app.register_blueprint(auth_bp)
app.register_blueprint(campaigns_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(maps_bp)
app.register_blueprint(table_bp)
app.register_blueprint(availability_bp)
app.register_blueprint(account_bp)
app.register_blueprint(characters_bp)

socketio.init_app(app)



@app.route("/")
def home():
    return jsonify({
        "message": "Encounter Hub API funcionando :D !"
    })



@app.errorhandler(413)
def file_too_large(error):
    return jsonify({"error": "O mapa deve ter no máximo 10 MB."}), 413



init_db()

if __name__ == "__main__":
    # Com debug=True o Flask roda um processo que vigia os arquivos e outro
    # que atende; as tarefas em segundo plano só rodam no que atende
    # (WERKZEUG_RUN_MAIN).
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        socketio.start_background_task(reminder_loop, socketio)
        socketio.start_background_task(cleanup_loop, socketio)

    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
