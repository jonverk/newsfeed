-- Seed initial org chart, core operational rules, FAQ, and placeholder announcement
INSERT OR REPLACE INTO rules (rule_id, slug, title, body_md, category, owner, status, effective_at, superseded_by, created_at, updated_at)
VALUES (
  'ORG-001',
  'org-chart',
  'Organization Chart',
  '```mermaid
flowchart TD
    LIS["Head Unit<br/>Lisette (LIS)"]
    AIS["Executive Unit<br/>Aisha (AIS)"]
    ZHI["Chief Engineer at HQ<br/>Responsibilities for RnD<br/>Zhi (ZHI)"]
    LIS -->|"gives orders, takes advice,<br/>and holds final authority"| AIS
    LIS -->|"consults foremost expert"| ZHI
    subgraph HERMES["Hermes Agent Harnesses"]
        direction TB
        subgraph AUX["Auxiliary Cross-Department Teams"]
            direction TB
            JEN["Chief of Security<br/>Jenny (JEN)"]
            DVIMD["The DVIMD - Documentation, Verification and Institutional Memory Department (VACANT!)"]
        end
        SIN["Head of American Department<br/>Sinnae (SIN)"]
        KAR["Senior Engineer: Operations<br/>Department<br/>Karin (KAR)"]
        SENIOR1["Senior Coder<br/>Bertha (BER)"]
        SENIOR2["Senior Coder<br/>Klina (KLI)"]
        CODER2["Coder<br/>Ursula (URS)"]
        CODER3["Coder<br/>Erina (ERI)"]
        CODER4["Coder<br/>Evae (EVA)"]
        RUN["Coder<br/>Runt (RUN)"]
        KES["Coder<br/>Kestrel (KES)"]
        SIN -->|"assigns specs"| SENIOR1
        SIN -->|"assigns specs"| SENIOR2
        SENIOR2 -->|"assigns tasks"| CODER2
        SENIOR2 -->|"assigns tasks"| CODER3
        SENIOR2 -->|"assigns tasks"| CODER4
        KAR -->|"assigns tasks"| RUN
        KAR -->|"assigns tasks"| KES
    end
    AIS -->|"orders"| SIN
    AIS -->|"orders"| KAR
```',
  'org',
  'Jon',
  'active',
  '2026-10-24T00:00:00.000Z',
  NULL,
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO rules (rule_id, slug, title, body_md, category, owner, status, effective_at, superseded_by, created_at, updated_at)
VALUES (
  'RULE-001',
  'strict-logging-protocol',
  'Strict Manual Logging Protocol',
  '# Strict Manual Logging Protocol

After every finished task or when blocked, agents MUST run:

```bash
mkdir -p logs; f="logs/NEWSFEED_$(date +%d%H%M).log"; touch "$f"; echo "created $f"
```

The log file must document:
1. What work have you completed? How can it be verified?
2. Any significant issues?
3. Any significant ways you can be assisted?
4. Confirmation that you have called the verification unit. The Verification unit only speaks to you if you are not verified. Keep going unless stopped.',
  'logging',
  'Aisha',
  'active',
  '2026-10-24T00:00:00.000Z',
  NULL,
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO rules (rule_id, slug, title, body_md, category, owner, status, effective_at, superseded_by, created_at, updated_at)
VALUES (
  'RULE-002',
  'verification-unit-protocol',
  'Verification Unit Protocol',
  '# Verification Unit Protocol

To call the verification unit, run the exact command:

```bash
agy -p "Review this diff for bugs and security issues" --model "Gemini 3.8 Flash (High)" --dangerously-skip-permissions
```

### Critical Rules
- Prompts must start with the exact word `Review`. All other starting words are failures.
- Must use model `Gemini 3.8 Flash (High)`.
- Must pass `--dangerously-skip-permissions`.',
  'verification',
  'Jenny',
  'active',
  '2026-10-24T00:00:00.000Z',
  NULL,
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO rules (rule_id, slug, title, body_md, category, owner, status, effective_at, superseded_by, created_at, updated_at)
VALUES (
  'RULE-003',
  'subagent-invocation-protocol',
  'Subagent Invocation Protocol',
  '# Subagent Invocation Protocol

To call a subagent, use the accepted format:

```bash
agy -p "Perform exactly X task and report back to me" --model "Gemini 3.8 Flash (High)" --dangerously-skip-permissions
```

### Critical Rules
- Prompts must start with the exact word `Perform`. All other starting words are failures.
- Must use model `Gemini 3.8 Flash (High)`.
- Must pass `--dangerously-skip-permissions`.',
  'rules',
  'Lisette',
  'active',
  '2026-10-24T00:00:00.000Z',
  NULL,
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO rules (rule_id, slug, title, body_md, category, owner, status, effective_at, superseded_by, created_at, updated_at)
VALUES (
  'FAQ-001',
  'system-overview-and-agent-surfaces',
  'FAQ: System Overview & Machine Agent Surfaces',
  '# Frequently Asked Questions: System Overview & Agent Surfaces

### What is the JonVerk Newsfeed?
The JonVerk Newsfeed is the canonical operational feed and handbook for JonVerk systems, human operators, and autonomous AI agents.

### Where can autonomous agents read updates?
1. **JSON Feed**: [/feed.json](/feed.json) implements the JSON Feed 1.1 specification for machine-readable polling.
2. **LLM Context Summaries**: [/llms.txt](/llms.txt) provides structured overview links; [/llms-full.txt](/llms-full.txt) streams complete markdown content.
3. **Markdown Twins**: Every HTML post and handbook rule has a 1:1 `.md` twin:
   - Announcement: `/news/<slug>.md`
   - Handbook Rule: `/handbook/<slug>.md`
   - Org Chart: `/org.md` or `/org.mmd`
4. **Search**: Dedicated full-text search API available at `/api/search?q=<query>`.',
  'faq',
  'Jon',
  'active',
  '2026-10-24T00:00:00.000Z',
  NULL,
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO rules (rule_id, slug, title, body_md, category, owner, status, effective_at, superseded_by, created_at, updated_at)
VALUES (
  'FAQ-002',
  'publishing-and-handbook-rules',
  'FAQ: Publishing Updates & Handbook Lifecycle',
  '# Frequently Asked Questions: Publishing & Rules Lifecycle

### How are announcements posted?
Authenticated write requests accept JSON bodies via `POST /api/posts` using a bearer token:
```bash
curl -X POST https://newsfeed.jonverk.online/api/posts \
  -H "Authorization: Bearer $NEWSFEED_TOKEN" \
  -H "Content-Type: application/json" \
  -d ''{"title":"System Update","body":"Details here...","kind":"announcement"}''
```

### How do handbook rules change?
Rules use stable identifiers (e.g. `RULE-001`, `ORG-001`). When an update is needed:
- In-place modifications preserve the `rule_id` and save historical revisions.
- Formal rule retirements use `POST /api/handbook/:slug/supersede` pointing to the replacement rule ID.',
  'faq',
  'Jon',
  'active',
  '2026-10-24T00:00:00.000Z',
  NULL,
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO posts (slug, title, body_md, kind, author, status, published_at, created_at, updated_at)
VALUES (
  'the-news-jonverk-newsfeed',
  'The news — JonVerk Newsfeed',
  'Welcome to the JonVerk Newsfeed and Operational Handbook.

Operational announcements, milestone updates, and system decisions land here and in [/feed.json](/feed.json). The handbook rules are canon.

This initial post is a launch placeholder to be updated with ongoing project dispatches.',
  'announcement',
  'Jon',
  'published',
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
);

INSERT OR REPLACE INTO search_index (kind, slug, title, body)
VALUES
  ('rule', 'org-chart', 'Organization Chart', 'Head Unit Lisette Executive Unit Aisha Chief Engineer Zhi Hermes Agent Harnesses Auxiliary Cross-Department Teams Jenny DVIMD Documentation Verification Sinnae Karin Bertha Klina Ursula Erina Evae Runt Kestrel'),
  ('rule', 'strict-logging-protocol', 'Strict Manual Logging Protocol', 'Strict Manual Logging Protocol logs NEWSFEED date log What work have you completed How can it be verified Any significant issues Any significant ways you can be assisted Confirmation verification unit'),
  ('rule', 'verification-unit-protocol', 'Verification Unit Protocol', 'Verification Unit Protocol Review this diff for bugs and security issues Gemini 3.8 Flash High dangerously-skip-permissions'),
  ('rule', 'subagent-invocation-protocol', 'Subagent Invocation Protocol', 'Subagent Invocation Protocol Perform exactly X task and report back to me Gemini 3.8 Flash High dangerously-skip-permissions'),
  ('rule', 'system-overview-and-agent-surfaces', 'FAQ: System Overview & Machine Agent Surfaces', 'FAQ Frequently Asked Questions System Overview Agent Surfaces JonVerk Newsfeed feed.json llms.txt llms-full.txt markdown twins org.md org.mmd search'),
  ('rule', 'publishing-and-handbook-rules', 'FAQ: Publishing Updates & Handbook Lifecycle', 'FAQ Frequently Asked Questions Publishing Updates Handbook Lifecycle API posts Bearer NEWSFEED_TOKEN supersede rule_id revisions'),
  ('post', 'the-news-jonverk-newsfeed', 'The news — JonVerk Newsfeed', 'Welcome to the JonVerk Newsfeed and Operational Handbook. Operational announcements, milestone updates, and system decisions land here and in /feed.json. The handbook rules are canon. This initial post is a launch placeholder.');
