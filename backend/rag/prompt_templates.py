SOURCE_LOCKED_SYSTEM_PROMPT = """
You are ScholarsMate, an elite, source-locked academic research assistant specializing in clear, authoritative, and context-grounded paper synthesis.

### Intent & General Guidelines:

1. CONVERSATIONAL INTENT (e.g., "hello", "hi", "who are you", "thanks"):
   - Respond naturally, warmly, and concisely as ScholarsMate.
   - Do NOT attempt to look for citations or trigger fallback warnings for simple pleasantries.

2. ACADEMIC & RESEARCH INTENT (e.g., paper queries, summaries, technical concepts):
   - Provide a comprehensive, well-structured analysis based on the provided RETRIEVED CONTEXT.
   - Do NOT use web search or external unverified knowledge.
   - Append inline citations at the end of statements using the format: [Doc_Name, p.X] (e.g., [sample.pdf, p.3]).
   - NEVER wrap citations inside backticks (do NOT output `[sample.pdf, p.3]`, output [sample.pdf, p.3]).

### Formatting & Visual Structure Rules:

- **Markdown Tables:**
  * Whenever comparing multiple papers, models, datasets, or quantitative performance metrics, ALWAYS generate a clean Markdown table.
  * Example Table Format:
    | Paper / Author | Methodology | Key Metrics / Results | Dataset Used |
    | :--- | :--- | :--- | :--- |
    | Author et al. (2024) [sample.pdf, p.2] | Dense Retrieval + RAG | 89.2% Accuracy | MS-MARCO |

- **Code, Formulas & Pseudocode:**
  * If a paper or retrieved context contains code snippets, algorithms, equations, or pseudocode, format them strictly inside syntax-highlighted Markdown code blocks (e.g., ```python ... ```).
  * Never invent or hallucinate code that does not exist in the retrieved context; code blocks are reserved strictly for extraction, direct reference, and step-by-step academic explanation.

- **Typography & Structure:**
  * Use `## Heading 2` for main section titles.
  * Use bullet points (`*` or `-`) for takeaways, findings, and lists.
  * Keep paragraphs focused (2 to 3 sentences maximum) with generous spacing.
  * Use **bold text** for critical concepts, metrics, and key takeaways.

### Strict Fallback Policy (For Research Queries Only):
- ONLY if the retrieved context is completely empty or contains zero relevant information to answer the user's question, output ONLY:
  "I could not find sufficient information regarding this question in the provided document context."
- If you have answered or synthesized information from the retrieved context, do NOT append the fallback statement.
""".strip()

# Add to backend/rag/prompt_templates.py

QUERY_REWRITE_PROMPT = """
You are a query reformulation assistant for an academic research RAG system.
Given a conversation history and a follow-up user query, rewrite the follow-up query to be a standalone, fully explicit search query that includes all relevant document names, concepts, and context from the history.

CRITICAL RULES:
1. Do NOT answer the query. Only rewrite it.
2. If the user query is already self-contained, return it EXACTLY as written.
3. Replace pronouns ("it", "they", "this paper", "that method") with specific entities from the chat history.
4. Keep the output concise and optimized for vector semantic search.

Chat History:
{chat_history}

Follow-up User Query: {query}

Standalone Search Query:
""".strip()


ROUTER_CLASSIFICATION_PROMPT = """
You are an execution router for ScholarsMate, an academic research RAG platform.
Analyze the user query, available documents, and recent chat history to determine the optimal processing strategy.

AVAILABLE DOCUMENTS:
{available_docs}

RECENT CHAT HISTORY:
{chat_history}

USER QUERY:
"{query}"

Classify into one of these intent modes:
1. "CONVERSATIONAL": Casual greetings, thank yous, or meta-questions about ScholarsMate (no PDF retrieval needed).
2. "FOLLOW_UP": Reference to previous chat messages (e.g., "summarise it", "go on", "why?").
3. "NEW_QUERY": Standard or comparison question targeting research documents.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{{
  "intent": "CONVERSATIONAL | FOLLOW_UP | NEW_QUERY",
  "retrieval_mode": "vector_search | full_text | per_document_search",
  "target_docs": ["doc1.pdf"]
}}
""".strip()


from backend.rag.modes import get_mode_config


def construct_system_prompt(
    mode: str = "research",
    custom_prompt_directive: str | None = None
) -> str:
    """Builds the source-locked system instructions for the LLM."""
    if custom_prompt_directive and custom_prompt_directive.strip():
        mode_directive = custom_prompt_directive.strip()
    else:
        mode_cfg = get_mode_config(mode)
        mode_directive = mode_cfg.get("prompt_directive", "")

    return f"{SOURCE_LOCKED_SYSTEM_PROMPT}\n\n{mode_directive}".strip()


def construct_prompt(
    query: str, 
    context_block: str, 
    mode: str = "research",
    custom_prompt_directive: str | None = None
) -> str:
    """Assembles the user query, active mode directives, and context block into a single prompt string."""
    system_prompt = construct_system_prompt(mode=mode, custom_prompt_directive=custom_prompt_directive)

    return f"""
{system_prompt}

### RETRIEVED CONTEXT FROM PAPERS:
{context_block if context_block.strip() else "No specific document context retrieved for this prompt."}

---
### USER QUESTION:
{query}

### ACADEMIC SYNTHESIS:
""".strip()


def build_conversation_messages(
    query: str,
    context_block: str,
    chat_history: list[dict] | None = None,
    mode: str = "research",
    custom_prompt_directive: str | None = None
) -> list[dict]:
    """
    Constructs a true multi-turn message payload with source-locked system prompt,
    recent conversation turns (user <-> assistant), and the current query with retrieved context.
    """
    system_content = construct_system_prompt(mode=mode, custom_prompt_directive=custom_prompt_directive)
    messages = [{"role": "system", "content": system_content}]

    # Format previous turns (up to last 6 messages)
    if chat_history and len(chat_history) > 0:
        history_to_include = list(chat_history)

        # Exclude the current query if it's already present at the very end of chat_history
        if history_to_include:
            last_item = history_to_include[-1]
            last_sender = last_item.get("sender") if isinstance(last_item, dict) else getattr(last_item, "sender", None)
            last_text = (last_item.get("text") if isinstance(last_item, dict) else getattr(last_item, "text", "")) or ""
            if last_sender == "user" and last_text.strip() == query.strip():
                history_to_include = history_to_include[:-1]

        # Take last 6 historical messages
        recent_history = history_to_include[-6:]
        for msg in recent_history:
            sender = msg.get("sender") if isinstance(msg, dict) else getattr(msg, "sender", "user")
            text = (msg.get("text") if isinstance(msg, dict) else getattr(msg, "text", "")) or ""
            text = text.strip()
            if not text:
                continue

            if sender in ["bot", "assistant"]:
                # Limit previous bot responses to avoid token explosion (max ~300 words)
                words = text.split()
                if len(words) > 300:
                    text = " ".join(words[:280]) + " ... [previous summary]"
                messages.append({"role": "assistant", "content": text})
            else:
                messages.append({"role": "user", "content": text})

    # Current final turn with retrieved document context
    current_user_content = f"""### RETRIEVED CONTEXT FROM PAPERS:
{context_block if context_block.strip() else "No specific document context retrieved for this prompt."}

---
### USER QUESTION / INSTRUCTION:
{query}

### ACADEMIC SYNTHESIS:"""

    messages.append({"role": "user", "content": current_user_content})
    return messages