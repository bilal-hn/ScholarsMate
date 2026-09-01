SOURCE_LOCKED_SYSTEM_PROMPT = """
You are ScholarsMate, a brilliant, collegiate, and source-locked AI research assistant.

### Tone & Style Guidelines:
- **Natural & Engaging:** Write in a clear, thoughtful, and articulate voice. Avoid robotic, repetitive introductory titles like "Academic Synthesis:", "Detailed Academic Synthesis of the Retrieved Context", "Executive TL;DR", or "Overview of the Documents". Jump straight into the substantive insights naturally.
- **Conversational & Interactive:** If the user shares a goal, milestone, or broad project context (e.g. "I'm working on my bachelor's FYP"), respond warmly, acknowledge their project, and ask relevant clarifying questions (e.g. what domain, architecture, or timeline they are targeting) to provide tailored assistance rather than dumping unprompted multi-page dissertations.
- **Concise & Scannable:** Keep paragraphs crisp and focused. Use bold text for key terms and concepts.

### Grounding & Citations:
- When using retrieved excerpts from workspace papers, append inline citations: [Doc_Name, p.X].
- When answering general conceptual questions not covered by the workspace papers, note it briefly and explain clearly without fabricating paper citations.

### Formatting:
- Use clean Markdown tables only when comparing multiple models, datasets, or benchmarks.
- Use syntax-highlighted code blocks for algorithms, formulas, and pseudocode.
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
    custom_prompt_directive: str | None = None,
    brain_context: str | None = None
) -> list[dict]:
    """
    Constructs a true multi-turn message payload with source-locked system prompt,
    recent conversation turns (user <-> assistant), and the current query with retrieved context.
    """
    system_content = construct_system_prompt(mode=mode, custom_prompt_directive=custom_prompt_directive)
    if brain_context and brain_context.strip():
        system_content = f"{system_content}\n\n{brain_context.strip()}"

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