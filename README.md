# SMM Gestionale | Agency Suite

Gestionale full-stack per agenzie di social media management: clienti, abbonamenti,
piano editoriale, task, team, compensi, pagamenti, report e sincronizzazione con
Google Calendar.

## Stack tecnologico

- **Frontend:** React, React Router, Tailwind CSS, Axios e Recharts
- **Backend:** FastAPI, Pydantic, SQLAlchemy e Uvicorn
- **Database:** SQLite, persistito nel volume Docker `smm_data`
- **Integrazioni:** Google Calendar API
- **Deployment:** Docker Compose, Nginx e ZimaOS/CasaOS

## Configurazione

Creare i file locali di configurazione a partire dall'esempio:

```bash
cp .env.example .env
cp .env.example sd.env
```

Impostare almeno `APP_PUBLIC_URL`, `APP_PORT`, `JWT_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ADMIN_NAME`, `APP_TIMEZONE` e `GOOGLE_SYNC_INTERVAL` in
entrambi i file. Docker Compose usa `.env` per la sostituzione delle variabili
del file Compose e `sd.env` per l'ambiente del backend. Entrambi contengono
configurazione privata e sono esclusi da Git.

## Avvio su ZimaOS

Configurare prima il file locale `sd.env` con i valori dell'ambiente
operativo. Il file contiene credenziali e segreti e non deve essere
committato.

```bash
sudo DOCKER_CONFIG=$HOME/.docker docker compose --env-file sd.env up -d --build
```

Per controllare lo stato dei container:

```bash
sudo DOCKER_CONFIG=$HOME/.docker docker compose --env-file sd.env ps
```

Per visualizzare i log:

```bash
sudo DOCKER_CONFIG=$HOME/.docker docker compose --env-file sd.env logs -f backend
```

L'applicazione sarà disponibile su `APP_PUBLIC_URL` (per esempio
`http://localhost:8085`). Per fermare lo stack senza rimuovere i dati:

```bash
docker compose down
```

In locale, senza ZimaOS, è possibile avviare lo stack con:

```bash
docker compose up -d --build
```

Il database è montato nel volume Docker `smm_data`. Non eseguire reset,
`drop_all` o migrazioni automatiche contro il database operativo.

## Sviluppo locale

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Per una verifica di produzione:

```bash
cd frontend
npm run build
```

```bash
python -m compileall -q backend
```

## Google Calendar

Abilitare Google Calendar API nella Google Cloud Console, configurare le
credenziali OAuth in **Impostazioni → Integrazioni** e registrare il callback:

```text
APP_PUBLIC_URL/api/integrations/google/callback
```

La sincronizzazione applicazione → Google avviene sulle modifiche; la
sincronizzazione Google → applicazione usa il polling configurato da
`GOOGLE_SYNC_INTERVAL`.

## Sicurezza e repository

Non committare `sd.env`, `.env`, database SQLite, token OAuth, certificati o
password. Il `.gitignore` root esclude già segreti, ambienti virtuali,
`__pycache__`, `node_modules`, build, log e file di sistema.
