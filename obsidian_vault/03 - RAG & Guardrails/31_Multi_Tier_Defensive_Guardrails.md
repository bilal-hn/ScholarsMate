# 3-Tier Multi-Stage Semantic Quality & Defensive Guardrails (F-16)

## Purpose & University Mapping
* **SRS Requirement:** FR-16 (Multi-Stage Semantic Quality & Academic Guardrails)
* **Status:** Complete (Verified with 100% Test Coverage across 12 unit tests)
* **Code Location:** `backend/guardrails/`

While standard RAG systems rely solely on LLM self-moderation (which can be jailbroken), ScholarsMate implements a **Deterministic 3-Tier Guardrail Pipeline** executing at sub-millisecond speeds.

```mermaid
flowchart TD
    UserQuery[User Query] --> Tier1[Tier 1: Input Rails]
    Tier1 -->|Block Injection / Jailbreak| Reject[Reject Query: 400 Bad Request]
    Tier1 -->|Sanitize PII / Redact API Keys| CleanQuery[Cleaned Query]
    
    CleanQuery --> RouterAndVector[Router & ChromaDB Retrieval]
    
    RouterAndVector --> Tier2[Tier 2: Retrieval Rails]
    Tier2 --> FilterDist[Filter Chunks: Cosine Distance > 0.75 Dropped]
    Tier2 --> TenantCheck[Verify Workspace & Tenant Isolation]
    Tier2 --> CapTokens[Cap Prompt Context at 4,200 Tokens]
    
    CapTokens --> LLMInference[LLM Answer Generation]
    
    LLMInference --> Tier3[Tier 3: Output Rails]
    Tier3 --> CheckProvenance[Cross-Check [Doc, p.X] vs Ground-Truth Chunks]
    Tier3 --> ScrubKeys[Scrub Accidental Secret Leaks]
    
    CheckProvenance --> ClientResponse[Client UI with Verified Citations & Grounding Ratio]
```

---

## Tier 1: Input Rails (`input_rails.py`)
Intercepts raw queries **before any LLM inference or vector search**:
1. **Adversarial Injection Defense:** Detects system prompt dumping, DAN jailbreaks, `ignore previous instructions`, and role hijacking.
2. **Credential Redaction:** Automatically scrubs exposed OpenAI (`sk-...`), Google AI (`AIza...`), and Groq (`gsk_...`) keys, replacing them with `[REDACTED_API_KEY]`.
3. **Payload Size Guard:** Enforces a maximum character limit (3,000 characters) to prevent buffer exhaustion.

---

## Tier 2: Retrieval Rails (`retrieval_rails.py`)
Evaluates vector search passages **before injection into the prompt**:
1. **Tenant Isolation:** Drops any chunk whose `user_id` or `workspace_id` does not match the active session.
2. **Gate 2 Distance Thresholding:** Drops semantic noise where cosine distance $> 0.75$.
3. **Context Budget Enforcement:** Hard-caps total context tokens at 4,200 to prevent provider rate limit errors (TPM).

---

## Tier 3: Output Rails (`output_rails.py`)
Evaluates the generated text **before delivery to the user**:
1. **Citation Provenance Verification:** Cross-checks extracted `[Doc, p.X]` citations against the set of actually retrieved chunks (see [[32_Citation_Provenance_Verification]]).
2. **Secret Leak Prevention:** Scrubs accidental reflection of internal keys or sensitive environment variables.

---

## Linked Notes
- [[32_Citation_Provenance_Verification]] — How citations are mathematically proven
- [[62_Deterministic_Guardrails_vs_Pure_LLM_Trust]] — Why regex/heuristics beat LLM self-checks
- [[30_Source_Locked_Generation]] — Source-locked prompt templates
