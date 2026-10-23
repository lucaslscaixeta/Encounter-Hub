from flask import Flask, jsonify
from flask_cors import CORS
from autenticacao import auth_bp
from banco import init_db
from campanhas import campaigns_bp
from extensoes import socketio
from mapas import MAX_MAP_SIZE, maps_bp
from mesa_virtual import table_bp
from sessoes import sessions_bp


app = Flask(__name__)
CORS(app)

# Margem extra para os demais campos do formulário de upload.
app.config["MAX_CONTENT_LENGTH"] = MAX_MAP_SIZE + 1024 * 1024

app.register_blueprint(auth_bp)
app.register_blueprint(campaigns_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(maps_bp)
app.register_blueprint(table_bp)

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
    socketio.run(app, debug=True, port=5000, allow_unsafe_werkzeug=True)
