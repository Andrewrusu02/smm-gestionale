# SMM Gestionale | Agency Suite

<p align="center">
  <img src="https://via.placeholder.com/180x180.png?text=SMM" alt="Logo SMM Gestionale" width="180">
</p>

<p align="center">
  Gestionale open source per agenzie di Social Media Marketing e freelance.
</p>

![Work in Progress](https://img.shields.io/badge/status-WIP-orange)
![React](https://img.shields.io/badge/frontend-React-61DAFB?logo=react&logoColor=white)
![Python](https://img.shields.io/badge/backend-Python-3776AB?logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/deployment-Docker-2496ED?logo=docker&logoColor=white)

## Cos'è questo progetto

**SMM Gestionale | Agency Suite** è un gestionale custom pensato per agenzie di
Social Media Marketing, professionisti e freelance.

Il progetto nasce da un'esigenza reale: organizzare e semplificare la gestione
quotidiana di clienti, attività e processi operativi all'interno di un'agenzia.

Dopo essere stato sviluppato inizialmente per un utilizzo personale, il progetto
è ora aperto a chiunque voglia utilizzarlo, studiarlo o contribuire al suo
miglioramento.

## Stato del Progetto (Disclaimer)

> **Il progetto è attualmente in versione Beta / Work In Progress (WIP).**

Il codice è ancora in fase di sviluppo e refactoring. Sono presenti bug noti,
funzionalità incomplete e possibili modifiche architetturali future.

Il progetto non deve essere considerato stabile o pronto per ambienti di
produzione senza un'adeguata verifica e personalizzazione. Feedback,
segnalazioni e contributi della community sono particolarmente apprezzati per
renderlo più solido e affidabile.

## Stack Tecnologico

- **React** — interfaccia frontend
- **Tailwind CSS** — styling e design system
- **FastAPI** — backend e API REST
- **SQLite** — database locale
- **Docker** — containerizzazione e avvio dell'ambiente

## Installazione (Docker)

### Prerequisiti

Assicurati di avere installato:

- Docker
- Docker Compose

### Configurazione

1. Clona la repository:

   ```bash
   git clone https://github.com/Andrewrusu02/smm-gestionale.git
   cd smm-gestionale
   ```

2. Crea un file `sd.env` nella root del progetto e inserisci le variabili
   d'ambiente richieste dalla tua configurazione.

3. Crea un database SQLite vuoto chiamato `smm.db` nella posizione prevista dal
   progetto:

   ```bash
   touch smm.db
   ```

   Il file `sd.env` e il database vuoto `smm.db` devono essere presenti prima
   dell'avvio dei container.

4. Avvia l'applicazione con Docker Compose:

   ```bash
   sudo DOCKER_CONFIG=$HOME/.docker docker compose --env-file sd.env up -d --build
   ```

Al termine della procedura, i servizi saranno avviati in background. Per
verificare lo stato dei container puoi utilizzare:

```bash
docker compose ps
```

Per visualizzare i log:

```bash
docker compose logs -f
```

## Roadmap e Contributi (Call to Action)

Il progetto è in evoluzione e il contributo della community è fondamentale.

Tra gli obiettivi futuri rientrano:

- completare e stabilizzare le funzionalità esistenti;
- migliorare l'esperienza utente;
- ottimizzare il codice e l'architettura;
- aumentare la copertura dei test;
- migliorare la documentazione;
- aggiungere nuove funzionalità utili per agenzie e freelance.

Vuoi dare una mano?

- Apri una **Issue** per segnalare bug, proporre funzionalità o condividere
  suggerimenti.
- Invia una **Pull Request** per correggere problemi, ottimizzare il codice o
  aggiungere nuove funzionalità.
- Prima di contribuire, verifica lo stato delle Issue già aperte per evitare
  duplicati.
- Mantieni modifiche mirate, documentate e coerenti con l'architettura del
  progetto.

Ogni feedback e ogni contributo sono benvenuti!

## Licenza

Questo progetto è distribuito con licenza **MIT**.

La licenza MIT consente di utilizzare, copiare, modificare, distribuire e anche
utilizzare commercialmente il software, nel rispetto delle condizioni riportate
nel file [`LICENSE`](LICENSE).
