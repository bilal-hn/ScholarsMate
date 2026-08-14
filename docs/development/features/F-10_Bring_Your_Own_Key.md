# FR-09: Bring-Your-Own-Key (BYOK) Inference Pipeline

## 1. Feature Purpose
As research workloads grow, generating large-scale literature reviews and running deep multi-document synthesis can quickly exhaust platform-funded API limits. 

The Bring-Your-Own-Key (BYOK) feature allows users to provide their own personal API credentials for supported LLM providers (e.g., Groq, Google Gemini, OpenAI). This unlocks higher rate limits, custom model selections, and unrestricted usage while keeping platform operating costs at zero.

---

## 2. Key Objectives
* **Zero Infrastructure Cost:** Offload LLM token inference expenses directly to user accounts without platform billing overhead.
* **Maximum User Privacy & Security:** Ensure user credentials are treated ephemerally and are never permanently persisted in server-side databases or exposed in logs.
* **Tier Flexibility:** Allow free-tier users to bypass standard daily query caps simply by configuring their own keys.
* **Model Selection Freedom:** Give power users access to higher-tier models (e.g., Gemini Pro, GPT-4o, Llama 3.3 70B) based on their own provider entitlements.

---

## 3. Security & Key Lifecycle Architecture

### 3.1 Client-Side Storage Principle
* User API keys are stored solely on the client side inside the browser's local application storage (`localStorage` / `IndexedDB`).
* The central database **never** stores, manages, or syncs raw user API keys. If a user clears their browser cache or switches devices, they simply re-enter their key.

### 3.2 Ephemeral In-Memory Execution Flow
1. **Request Dispatch:** When a user initiates a chat message or literature review request, the client attaches the user's stored key via secure, custom HTTP request headers.
2. **In-Memory Instantiation:** The backend reads the header, creates a temporary in-memory inference client instance for that exact request lifecycle, and executes the call.
3. **Memory Purge:** Once the response stream or generated output completes, the temporary client and key are discarded from memory.
4. **Log Masking:** Application logs, middleware loggers, and error trackers strictly sanitize request headers, redacting all sensitive credential patterns before logging.

---

## 4. Provider & Model Routing Strategy

### 4.1 Supported Provider Matrix
* **Groq:** Fast single-pass chat completions, intent routing, and query rewriting.
* **Google Gemini:** Large-context Map-Reduce synthesis and multi-paper literature reviews.
* **OpenAI:** General-purpose RAG generation and specialized reasoning.

### 4.2 Graceful Fallback Strategy
* **User Key Present:** System prioritizes the user-supplied key, granting access to expanded token limits and premium model endpoints.
* **User Key Absent:** System falls back to platform default shared keys, subject to normal daily quota constraints and rate limits.
* **Invalid / Expired Key:** If a user's API call fails due to authentication errors (e.g., HTTP 401 Invalid Key), the UI flags the error specifically as an invalid personal key and provides a direct shortcut to update credentials in settings.

---

## 5. User Interface & Experience

### 5.1 Credentials Configuration Panel
* Located within the user **Settings** modal under an **API Credentials** tab.
* Dedicated password-masked input fields for each supported provider with toggleable visibility and copy options.
* A real-time **Test Connection** action that runs a lightweight ping against the provider to verify credentials before saving locally.

### 5.2 Active Inference Indicator
* Displays a subtle status badge in the chat interface header (e.g., *"Using Personal Groq Key"*) so the user always knows whether they are consuming personal or platform quota.

---

## 6. Acceptance & Validation Checklist
- [ ] Entering a valid personal API key successfully routes generation requests to that specific provider key.
- [ ] User API keys are verified to reside exclusively in the client browser and are never stored in the database.
- [ ] Server log streams and error tracking tools mask custom API key headers under all conditions.
- [ ] When no personal key is provided, the application smoothly falls back to platform default quotas.
- [ ] Providing an invalid or revoked key displays a clean, user-friendly prompt allowing immediate credential updates without crashing the session.