from flask_socketio import SocketIO


# Criado aqui para que as rotas possam emitir eventos sem importar o app.
socketio = SocketIO(cors_allowed_origins="*", async_mode="threading")


def campaign_room(campaign_id):
    return f"campanha-{campaign_id}"


def user_room(campaign_id, user_id):
    #Sala de uma pessoa na mesa, para eventos privados (rolagem secreta, PV).
    return f"campanha-{campaign_id}-usuario-{user_id}"


def emit_to_users(event, payload, campaign_id, user_ids):
    for user_id in set(user_ids):
        socketio.emit(event, payload, to=user_room(campaign_id, user_id))
