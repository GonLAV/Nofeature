# 🚨 Incident War Room AI

AI-powered incident management platform. When production breaks, War Room AI takes charge — diagnosing root causes, assembling the right team, and generating post-mortems automatically.

---

## 🏗️ Stack

| Layer | Tech |
|---|---|
| Backend API | Node.js + Express + TypeScript |
| Frontend | React + Vite + TailwindCSS |
| Database | PostgreSQL 16 |
| Cache / Sessions | Redis 7 |
| AI | Anthropic Claude API |
| Auth | JWT (access + refresh) + RBAC |
| Notifications | Slack Bot |
| Infra | Docker + docker-compose |
| CI/CD | GitHub Actions |

---

## 🚀 Quick Start (Docker)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/incident-war-room.git
cd incident-war-room
cp apps/api/.env.example apps/api/.env
```

### 2. Fill in required secrets in `apps/api/.env`

```
JWT_ACCESS_SECRET=<random 32+ char string>
JWT_REFRESH_SECRET=<random 32+ char string>
ANTHROPIC_API_KEY=sk-ant-...
ENCRYPTION_KEY=<random 32 char string>
```

### 3. Start everything

```bash
cd infra
docker-compose up --build
```

| Service | URL |
|---|---|
| Web App | http://localhost:3000 |
| API | http://localhost:4000 |
| API Health | http://localhost:4000/health |

---

## 💻 Local Development (without Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 16
- Redis 7

### Backend

```bash
cd apps/api
cp .env.example .env        # fill in your values
npm install
npm run migrate             # run DB migrations
npm run dev                 # starts on :4000
```

### Frontend

```bash
cd apps/web
npm install
npm run dev                 # starts on :3000
```

---

## 🗄️ Database

Run migrations:

```bash
cd apps/api
npm run migrate          # tracked, idempotent — recommended
# or, one-shot:
psql $DATABASE_URL -f src/database/migrations/001_initial_schema.sql
```

When using `docker-compose up` the schema is auto-applied via Postgres `docker-entrypoint-initdb.d`.

---

## 🧪 Tests

```bash
cd apps/api
npm test                    # all tests
npm run test:unit           # unit tests only
npm run test:integration    # integration tests
```

---

## 🔐 API Endpoints

All endpoints are prefixed with `/api/v1`.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout (revoke token) |
| GET | `/auth/me` | Get current user |

### Incidents
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/incidents` | ✅ | List incidents |
| POST | `/incidents` | ✅ | Create incident |
| GET | `/incidents/:id` | ✅ | Get incident + timeline |
| PATCH | `/incidents/:id/status` | ✅ | Update status |
| PATCH | `/incidents/:id/commander` | admin | Assign commander |
| GET | `/incidents/:id/timeline` | ✅ | Get timeline |
| DELETE | `/incidents/:id` | admin | Delete incident |

### AI
| Method | Path | Description |
|---|---|---|
| POST | `/ai/incidents/:id/analyze` | Trigger AI root cause analysis |
| GET | `/ai/incidents/:id/postmortem` | Generate post-mortem report |
| GET | `/ai/incidents/:id/suggest-responders` | Get suggested responders |

---

## 🔑 Roles

| Role | Permissions |
|---|---|
| `owner` | Full access |
| `admin` | Manage users, delete incidents |
| `manager` | Assign commanders, all CRUD |
| `member` | Create, update incidents |
| `viewer` | Read only |

---

## 🤖 AI Features

When an incident is created at P1/P2 severity, the AI automatically:
1. Analyzes the incident description and logs
2. Identifies root cause
3. Suggests immediate action items
4. Recommends who to page
5. Estimates impact

On resolve, generate a full post-mortem markdown report with one click.

---

## 📁 Project Structure

```
incident-war-room/
├── apps/
│   ├── api/                 # Node.js backend
│   │   ├── src/
│   │   │   ├── config/      # DB, Redis, env
│   │   │   ├── middleware/  # Auth, rate-limit, errors
│   │   │   ├── modules/     # Auth, Incidents, AI, Users, Tenants
│   │   │   ├── database/    # Migrations, repositories
│   │   │   └── utils/       # Logger, errors
│   │   └── tests/
│   └── web/                 # React frontend
│       └── src/
│           ├── pages/       # Dashboard, Incident, Analytics, Auth
│           ├── components/  # Layout, UI
│           ├── store/       # Zustand auth store
│           └── lib/         # Axios API client
└── infra/
    ├── docker-compose.yml
    └── .github/workflows/   # CI/CD
```

---

## 🚢 Deployment

### Environment Variables (production)

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<strong-secret>
ANTHROPIC_API_KEY=sk-ant-...
ENCRYPTION_KEY=<32-char-key>
SLACK_BOT_TOKEN=xoxb-...
CORS_ORIGIN=https://yourapp.com
```

### Deploy options
- **Fly.io** — `fly launch` in `apps/api`
- **Railway** — connect GitHub repo
- **AWS ECS** — use the provided Dockerfile
- **Kubernetes** — add your manifests to `infra/k8s/`

---

## 📄 License

MIT
