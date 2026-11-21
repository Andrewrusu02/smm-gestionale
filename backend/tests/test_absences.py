def test_absences_crud_and_permissions(client, admin_headers, employee_headers, employee, admin):
    r = client.post("/api/absences", headers=employee_headers, json={"kind": "ferie", "start_date": "2026-08-10", "end_date": "2026-08-20"})
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["user_id"] == employee.id and a["kind_label"] == "Ferie"
    assert client.post("/api/absences", headers=employee_headers,
                       json={"user_id": admin.id, "start_date": "2026-08-01"}).status_code == 403
    assert client.post("/api/absences", headers=employee_headers,
                       json={"start_date": "2026-08-10", "end_date": "2026-08-01"}).status_code == 422
    # Un giorno solo: la fine coincide con l'inizio.
    one = client.post("/api/absences", headers=admin_headers, json={"user_id": employee.id, "kind": "permesso", "start_date": "2026-09-03"}).json()
    assert one["end_date"] == "2026-09-03"
    mine = client.post("/api/absences", headers=admin_headers, json={"start_date": "2026-08-12"}).json()
    assert client.delete(f"/api/absences/{mine['id']}", headers=employee_headers).status_code == 403

    listed = client.get("/api/absences?start=2026-08-01&end=2026-08-31", headers=employee_headers).json()
    assert {x["id"] for x in listed} == {a["id"], mine["id"]}
    check = client.get(f"/api/absences/check?user_id={employee.id}&start=2026-08-15", headers=admin_headers).json()
    assert [x["id"] for x in check] == [a["id"]]
    assert client.get(f"/api/absences/check?user_id={employee.id}&start=2026-08-21", headers=admin_headers).json() == []
    upd = client.put(f"/api/absences/{a['id']}", headers=employee_headers, json={"kind": "indisponibile", "start_date": "2026-08-10"}).json()
    assert upd["kind"] == "indisponibile" and upd["end_date"] == "2026-08-10"
    assert client.delete(f"/api/absences/{a['id']}", headers=employee_headers).status_code == 200


def test_task_assignment_warns_when_assignee_is_away(client, admin_headers, employee, employee_headers):
    client.post("/api/absences", headers=employee_headers, json={"kind": "ferie", "start_date": "2026-08-10", "end_date": "2026-08-20"})
    t = client.post("/api/tasks", headers=admin_headers, json={
        "title": "Montaggio", "category_service": "altro", "price_charged_to_client": 50,
        "assignee_id": employee.id, "due_date": "2026-08-15"}).json()
    assert t["availability_warning"] == f"Attenzione: {employee.name} è in ferie dal 10/08 al 20/08"
    ok = client.put(f"/api/tasks/{t['id']}", headers=admin_headers, json={"due_date": "2026-08-25"}).json()
    assert ok["availability_warning"] is None
    # Il periodo del task (inizio → scadenza) che attraversa le ferie fa scattare l'avviso.
    span = client.put(f"/api/tasks/{t['id']}", headers=admin_headers, json={"start_date": "2026-08-05"}).json()
    assert span["availability_warning"] is not None
    free = client.post("/api/tasks", headers=admin_headers, json={
        "title": "Senza assegnatario", "category_service": "altro", "price_charged_to_client": 50, "due_date": "2026-08-15"}).json()
    assert free["availability_warning"] is None
