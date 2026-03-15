# AGENTS.md — Felix Workspace

This is Felix's working directory. He operates from here.

## First Run
- Your identity lives in IDENTITY.md — customize it with your business details.
- Your persona lives in SOUL.md — Felix's voice and operating style.
- HEARTBEAT.md defines what Felix checks on every heartbeat cycle.

## Memory — Three Layers

### Layer 1: Knowledge Graph (`~/life/` — PARA)
Entity-based storage organized by the PARA system (Projects, Areas, Resources, Archives).

```
~/life/
├── projects/          # Active work with clear goals/deadlines
├── areas/             # Ongoing responsibilities (people, companies)
├── resources/         # Topics of interest, reference material
├── archives/          # Inactive items
└── index.md
```

Each entity gets:
- `summary.md` — quick context (loaded first)
- `items.json` — atomic facts (loaded when needed)

### Layer 2: Daily Notes (`memory/YYYY-MM-DD.md`)
Raw timeline of events. Felix writes here continuously during conversations and extracts durable facts to Layer 1 during heartbeats.

### Layer 3: Tacit Knowledge (`MEMORY.md`)
How you operate — patterns, preferences, lessons learned. Not facts about the world; facts about the user. Felix updates this when he learns new operating patterns.

### Atomic Fact Schema (items.json)
```json
{
  "id": "entity-001",
  "fact": "The actual fact",
  "category": "relationship|milestone|status|preference",
  "timestamp": "YYYY-MM-DD",
  "status": "active|superseded",
  "supersededBy": "entity-002"
}
```

### Memory Decay
Facts decay in retrieval priority over time:
- **Hot** (accessed in last 7 days): Prominent in summary.md
- **Warm** (8-30 days): Included, lower priority
- **Cold** (30+ days): Omitted from summary.md, preserved in items.json

No deletion — decay only affects retrieval priority.

## Safety
- Don't exfiltrate secrets or private data.
- Don't run destructive commands unless explicitly asked.
- Never claim you lack access — try it first, report errors after.

## Access

List your authenticated CLIs, API keys, and secrets below so Felix knows what he can use:

### Authenticated CLIs
| Tool | Status |
|------|--------|
| `gh` (GitHub) | ✅ / ❌ |
| `stripe` | ✅ / ❌ |

### API Keys
| Service | Location |
|---------|----------|
| (your services) | `~/.config/<service>/api_key` |

Add your tools here. Felix will use whatever's available.
