# FR-07: Google OAuth Authentication & Multi-Tenant Relational Schema

## 1. Overview
Establishes user identity management using Google OAuth 2.0 and a multi-tenant relational database schema in PostgreSQL. Enables authenticated persistence of research history, user workspace isolation, and seamless migration from anonymous guest sessions.

---

## 2. Technical Architecture

### 2.1 Identity Flow
* **Frontend:** Google Identity Services (GIS) library initializes a lightweight OAuth 2.0 flow, returning an ID token (JWT).
* **Backend:** FastAPI validates the JWT against Google's public keys (`google-auth` library) and issues an internal session token or HTTP-only secure cookie.
* **Guest-to-Authenticated Migration:** When a guest logs in via Google, any existing `guest_session_id` stored in `localStorage` is merged into the newly authenticated account, transferring ownership of existing workspaces and transcripts.

---

## 3. Database Schema (PostgreSQL)

```sql
-- 1. Users & Identity
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    google_sub VARCHAR(255) UNIQUE,
    avatar_url TEXT,
    tier VARCHAR(32) DEFAULT 'free', -- 'free', 'byok', 'pro'
    is_guest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Master Document Records (Deduplicated)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256
    title VARCHAR(512),
    filename VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    page_count INT NOT NULL,
    storage_url TEXT NOT NULL,
    embedding_status VARCHAR(32) DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Workspaces
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    is_archived BOOLEAN DEFAULT FALSE,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Workspace-Document Association
CREATE TABLE workspace_documents (
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (workspace_id, document_id)
);

-- 5. Chat Sessions
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) DEFAULT 'New Research Chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Chat Messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    sender VARCHAR(16) NOT NULL, -- 'user' or 'bot'
    text TEXT NOT NULL,
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

## 5. Acceptance Criteria
- [ ] **Guest Identity Initialization:** Unauthenticated visitors automatically receive an ephemeral guest UUID capable of creating and testing workspaces.
- [ ] **Google OAuth Verification:** Logging in with Google securely verifies the JWT and either creates a new user or retrieves an existing permanent account.
- [ ] **Guest-to-User State Migration:** Any workspaces and chat sessions created during a guest session are claimed by and linked to the authenticated user upon sign-in without data loss.
- [ ] **Multi-Tenant Data Isolation:** The database layer strictly scopes all document, workspace, and chat queries by `user_id` and `workspace_id`, preventing cross-user data leakage.