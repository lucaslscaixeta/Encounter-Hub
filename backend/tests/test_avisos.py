"""Avisos por e-mail: ausências ao mestre e sessões canceladas."""

import time
from datetime import datetime, timedelta

import avisos


def test_avisos_de_sessao(client, register, campaign, sql, monkeypatch):
    sent = []
    fail_next = []

    def fake_send(to, subject, text):
        if fail_next:
            fail_next.pop()
            return False

        sent.append((to, subject, text))
        return True

    monkeypatch.setattr(avisos, "enviar_email", fake_send)

    gm, _, _ = register("Mestre", "mestre@teste.local")
    ana, _, _ = register("Ana", "ana@teste.local")         # não vai
    bia, _, _ = register("Bia", "bia@teste.local")         # talvez
    caio, _, _ = register("Caio", "caio@teste.local")      # confirmado
    davi, davi_id, _ = register("Davi", "davi@teste.local")  # não responde
    campaign_id = campaign(gm, [ana, bia, caio, davi])

    now = datetime.now()

    def at(hours):
        return (now + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M")

    def session(title, hours, answers):
        session_id = client.post(
            f"/api/campaigns/{campaign_id}/sessions",
            json={"title": title, "scheduled_at": at(hours)},
            headers=gm,
        ).json["session_id"]

        for headers, status in answers:
            response = client.put(
                f"/api/sessions/{session_id}/attendance",
                json={"status": status},
                headers=headers,
            )
            assert response.status_code == 200

        return session_id

    def reminder_sent_at(session_id):
        return sql(
            "SELECT gm_reminder_sent_at FROM game_sessions WHERE id = %s",
            (session_id,),
        )[0]["gm_reminder_sent_at"]

    full = [(ana, "recusado"), (bia, "talvez"), (caio, "confirmado")]
    s1 = session("Em 10 horas", 10, full)
    s2 = session("Em 30 horas", 30, full)   # fora da janela de 24 h
    s3 = session("Todos confirmados", 5, [(caio, "confirmado"), (bia, "confirmado")])

    # 1. Aviso ao mestre só para a sessão das próximas 24 h com ausências.
    assert avisos.send_gm_reminders() == 1
    assert len(sent) == 1
    to, subject, text = sent[0]
    assert to == "mestre@teste.local" and "Em 10 horas" in subject
    assert "Não vão comparecer:\n- Ana" in text
    assert "Talvez compareçam:\n- Bia" in text
    assert "Caio" not in text and "Davi" not in text
    assert at(10)[11:16] in text   # horário no formato de 24 horas

    # 2. Um aviso por sessão, mesmo rodando de novo.
    assert avisos.send_gm_reminders() == 0 and len(sent) == 1

    # 3. Falha no envio libera a reserva e tenta de novo depois.
    s4 = session("Falha no envio", 8, [(ana, "recusado")])
    fail_next.append(True)
    assert avisos.send_gm_reminders() == 0
    assert reminder_sent_at(s4) is None
    assert avisos.send_gm_reminders() == 1 and "Falha no envio" in sent[-1][1]

    # 4. Resposta alterada para "não vai" dentro das 24 h gera aviso.
    before = len(sent)
    assert client.put(
        f"/api/sessions/{s3}/attendance", json={"status": "recusado"}, headers=caio
    ).status_code == 200
    assert avisos.send_gm_reminders() == 1
    assert "Caio" in sent[-1][2] and len(sent) == before + 1

    # 5. Nova data libera um novo aviso.
    assert client.put(
        f"/api/sessions/{s1}", json={"scheduled_at": at(12)}, headers=gm
    ).status_code == 200
    assert reminder_sent_at(s1) is None
    assert client.put(
        f"/api/sessions/{s1}", json={"title": "Em 12 horas"}, headers=gm
    ).status_code == 200
    assert avisos.send_gm_reminders() == 1 and "Em 12 horas" in sent[-1][1]

    # 6. Cancelamento avisa quem confirmou ou marcou talvez (em segundo plano).
    before = len(sent)
    response = client.put(f"/api/sessions/{s2}", json={"status": "cancelada"}, headers=gm)
    assert response.status_code == 200 and "avisado" in response.json["message"]

    deadline = time.time() + 30

    while len(sent) < before + 2 and time.time() < deadline:
        time.sleep(0.2)

    time.sleep(1)
    new = sent[before:]
    assert sorted(email[0] for email in new) == ["bia@teste.local", "caio@teste.local"]
    assert all("Sessão cancelada: Em 30 horas" in email[1] for email in new)
    assert "Olá, Bia!" in [email for email in new if email[0] == "bia@teste.local"][0][2]

    # 7. Cancelar de novo não reenvia; sessão não cancelada não gera aviso.
    before = len(sent)
    response = client.put(f"/api/sessions/{s2}", json={"status": "cancelada"}, headers=gm)
    assert response.json["message"] == "Sessão atualizada!"
    time.sleep(2)
    assert len(sent) == before
    assert avisos.notify_cancellation(s1) == 0

    # 8. Quem saiu da campanha não recebe aviso.
    s5 = session("Davi sai", 6, [(davi, "confirmado"), (caio, "talvez")])
    assert client.delete(
        f"/api/campaigns/{campaign_id}/members/{davi_id}", headers=davi
    ).status_code == 200
    sql("UPDATE game_sessions SET status = 'cancelada' WHERE id = %s", (s5,))
    assert avisos.notify_cancellation(s5) == 1
    assert sent[-1][0] == "caio@teste.local"
