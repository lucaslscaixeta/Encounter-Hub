from flask_socketio import SocketIO


# Criado aqui para que as rotas possam emitir eventos sem importar o app.
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")


def campaign_room(campaign_id):
    return f"campanha-{campaign_id}"
