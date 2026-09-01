import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

/**
 * Gets or creates a persistent anonymous Guest UUID.
 */
export const getGuestId = () => {
  let guestId = localStorage.getItem('scholarsmate_guest_id');
  if (!guestId) {
    guestId =
      'guest_' +
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15) + Date.now().toString(36));
    localStorage.setItem('scholarsmate_guest_id', guestId);
  }
  return guestId;
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically inject Guest ID or Google Auth Token into every request
apiClient.interceptors.request.use((config) => {
  const googleToken = localStorage.getItem('scholarsmate_auth_token');
  if (googleToken) {
    config.headers['Authorization'] = `Bearer ${googleToken}`;
  } else {
    config.headers['X-Guest-ID'] = getGuestId();
  }
  return config;
});

// Automatically catch 401 Unauthorized (expired Google token) and revert cleanly to Guest Mode
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const existingToken = localStorage.getItem('scholarsmate_auth_token');
      if (existingToken) {
        console.warn('Google session expired. Clearing token and reverting to guest mode.');
        localStorage.removeItem('scholarsmate_auth_token');
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

// =============================================================================
// BYOK & CLIENT-SIDE MODEL CONFIGURATION (NO HARDCODED DEFAULTS)
// =============================================================================

/**
 * Probes the backend discovery endpoint to test a key and return available models.
 * @param {string} apiKey - API key to validate.
 * @param {string} [provider="auto"] - Provider identifier or 'auto'.
 */
export const fetchModelsFromKey = async (apiKey, provider = 'auto') => {
  try {
    const response = await apiClient.post('/byok/fetch-models', {
      api_key: apiKey,
      provider: provider,
    });
    return response.data; // Returns [{ id, name, provider }]
  } catch (error) {
    console.error('Failed to discover models for key:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Retrieves saved API keys, discovered models, and current active model from localStorage.
 * Does not fall back to unconfigured providers.
 */
export const getSavedBYOKConfig = () => {
  try {
    const keys = JSON.parse(localStorage.getItem('scholarsmate_byok_keys') || '{}');
    const discoveredModels = JSON.parse(localStorage.getItem('scholarsmate_discovered_models') || '[]');
    let activeModel = localStorage.getItem('scholarsmate_active_model') || '';

    // If active model is missing or orphaned, sync to first valid discovered model
    const isValidModel = discoveredModels.some((m) => m.id === activeModel);
    if (!isValidModel && discoveredModels.length > 0) {
      activeModel = discoveredModels[0].id;
      localStorage.setItem('scholarsmate_active_model', activeModel);
    } else if (discoveredModels.length === 0) {
      activeModel = '';
      localStorage.removeItem('scholarsmate_active_model');
    }

    return { keys, discoveredModels, activeModel };
  } catch {
    return { keys: {}, discoveredModels: [], activeModel: '' };
  }
};

/**
 * Persists updated API keys, discovered models, and active model to localStorage.
 */
export const saveBYOKConfig = (keys = null, discoveredModels = null, activeModel = null) => {
  if (keys !== null) {
    localStorage.setItem('scholarsmate_byok_keys', JSON.stringify(keys));
  }
  if (discoveredModels !== null) {
    localStorage.setItem('scholarsmate_discovered_models', JSON.stringify(discoveredModels));
  }
  if (activeModel !== null) {
    localStorage.setItem('scholarsmate_active_model', activeModel);
  }
};

// =============================================================================
// AUTH & IDENTITY API METHODS
// =============================================================================

/**
 * Fetches the currently authenticated profile or active guest session.
 * Gracefully falls back to Guest session if backend is offline.
 */
export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/auth/me');
    return response.data;
  } catch (error) {
    // Return clean fallback guest session on network failure or offline backend
    return {
      id: getGuestId(),
      name: 'Guest User',
      email: null,
      is_guest: true,
      avatar_url: null,
    };
  }
};

/**
 * Saves Google ID token upon successful sign-in.
 */
export const setGoogleAuthToken = (token) => {
  localStorage.setItem('scholarsmate_auth_token', token);
};

/**
 * Clears Google token and reverts to guest mode.
 */
export const logoutUser = () => {
  localStorage.removeItem('scholarsmate_auth_token');
};

// =============================================================================
// CORE WORKSPACE & DOCUMENT METHODS
// =============================================================================

/**
 * Health check endpoint to verify backend status.
 */
export const checkHealth = async () => {
  try {
    const response = await apiClient.get('/health', { timeout: 2500 });
    return response.data;
  } catch {
    return { status: 'offline' };
  }
};

/**
 * Retrieves the catalog of indexed documents and chunk counts.
 * Returns empty document list on network failure.
 */
export const getDocuments = async () => {
  try {
    const response = await apiClient.get('/documents');
    return response.data;
  } catch (error) {
    return { documents: [] };
  }
};

/**
 * Uploads a single PDF file to the backend ingestion pipeline.
 * @param {File} file - PDF File object from input.
 */
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await apiClient.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Creates a new research workspace by uploading and processing multiple PDF files.
 * @param {FileList|Array<File>} files - List or FileList of PDF files.
 */
export const createWorkspace = async (files) => {
  const formData = new FormData();
  Array.from(files).forEach((file) => {
    formData.append('files', file);
  });

  try {
    const response = await apiClient.post('/workspace/create', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Workspace creation failed:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Generates a structured multi-paper literature review using active keys and user filters.
 * @param {Array<string>} [docNames=[]] - Selected document filters.
 */
export const generateLiteratureReview = async (docNames = []) => {
  try {
    const { keys, activeModel } = getSavedBYOKConfig();
    const response = await apiClient.post('/workspace/literature-review', {
      doc_names: docNames && docNames.length > 0 ? docNames : [],
      model_name: activeModel || null,
      custom_keys: keys || {},
    });
    return response.data;
  } catch (error) {
    console.error('Literature review failed:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Extended literature review generation endpoint for the Literature Review Studio Modal.
 * Supports configurable research focus, review depth, model override, and active BYOK keys.
 * @param {Object} config
 * @param {Array<string>} config.doc_names - Selected document filters.
 * @param {string} [config.research_focus=''] - Research focus/question prompt.
 * @param {string} [config.depth='detailed'] - 'detailed' (in-depth monograph) or 'executive'.
 * @param {string|null} [config.model_name=null] - Model override ID.
 * @param {Object|null} [config.custom_keys=null] - Optional BYOK custom keys map.
 */
export const generateLiteratureReviewAPI = async ({
  doc_names = [],
  research_focus = '',
  depth = 'detailed',
  model_name = null,
  custom_keys = null,
}) => {
  const { keys, activeModel } = getSavedBYOKConfig();
  const selectedModel = model_name || activeModel;
  const activeKeys = custom_keys && Object.keys(custom_keys).length > 0 ? custom_keys : keys;

  try {
    const response = await apiClient.post('/workspace/literature-review', {
      doc_names: doc_names && doc_names.length > 0 ? doc_names : [],
      research_focus: research_focus ? research_focus.trim() : '',
      depth: depth || 'detailed',
      model_name: selectedModel || null,
      custom_keys: activeKeys || {},
    });
    return response.data;
  } catch (error) {
    console.error('Literature review synthesis failed:', error.response?.data || error.message);
    throw error;
  }
};

// =============================================================================
// CHAT SESSION & PERSISTENCE API METHODS
// =============================================================================

/**
 * Creates a new chat session thread in the database.
 * @param {string} [title="New Research Chat"] - Session title.
 * @param {Array<string>} [docNames=[]] - Associated document names.
 */
export const createChatSession = async (title = 'New Research Chat', docNames = []) => {
  try {
    const response = await apiClient.post('/sessions', { title, doc_names: docNames });
    return response.data;
  } catch (error) {
    console.error('Failed to create chat session:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Retrieves all saved chat sessions ordered by latest update.
 */
export const getChatSessions = async () => {
  try {
    const response = await apiClient.get('/sessions');
    return response.data;
  } catch (error) {
    return [];
  }
};

/**
 * Retrieves the full message history for a specific session ID.
 * @param {string} sessionId - Database UUID of the session.
 */
export const getSessionMessages = async (sessionId) => {
  try {
    const response = await apiClient.get(`/sessions/${sessionId}`);
    return response.data;
  } catch (error) {
    return { messages: [] };
  }
};

/**
 * Retrieves the list of available academic reasoning modes.
 */
export const fetchModesAPI = async () => {
  try {
    const response = await apiClient.get('/modes');
    return response.data?.modes || [];
  } catch (error) {
    console.error('Failed to fetch academic modes:', error);
    return [];
  }
};

/**
 * Updates the active reasoning mode for a specific chat session.
 * @param {string} sessionId - Database UUID of the session.
 * @param {string} mode - Mode ID (e.g. 'research', 'socratic', 'reviewer', 'executive', 'survey').
 */
export const updateSessionModeAPI = async (sessionId, mode) => {
  if (!sessionId) return null;
  try {
    const response = await apiClient.patch(`/sessions/${sessionId}/mode`, { mode });
    return response.data;
  } catch (error) {
    console.error(`Failed to update mode for session ${sessionId}:`, error);
    throw error;
  }
};

/**
 * Deletes a chat session thread and its associated message history.
 * @param {string} sessionId - Database UUID of the session.
 */
export const deleteChatSession = async (sessionId) => {
  try {
    const response = await apiClient.delete(`/sessions/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}:`, error.response?.data || error.message);
    throw error;
  }
};

// =============================================================================
// CUSTOM ACADEMIC LENSES LOCAL PERSISTENCE
// =============================================================================

const CUSTOM_LENSES_KEY = 'scholarsmate_custom_lenses';

export const getCustomLenses = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_LENSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to parse custom lenses:', err);
    return [];
  }
};

export const saveCustomLens = (lens) => {
  try {
    const existing = getCustomLenses();
    const idx = existing.findIndex((l) => l.id === lens.id);
    let updated;
    if (idx !== -1) {
      updated = [...existing];
      updated[idx] = { ...existing[idx], ...lens, updated_at: new Date().toISOString() };
    } else {
      const newLens = {
        ...lens,
        id: lens.id || `custom_${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      updated = [...existing, newLens];
    }
    localStorage.setItem(CUSTOM_LENSES_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save custom lens:', err);
    return getCustomLenses();
  }
};

export const deleteCustomLens = (lensId) => {
  try {
    const existing = getCustomLenses();
    const updated = existing.filter((l) => l.id !== lensId);
    localStorage.setItem(CUSTOM_LENSES_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete custom lens:', err);
    return getCustomLenses();
  }
};

/**
 * Sends a research query to the ScholarsMate RAG pipeline with BYOK support and active reasoning mode.
 * @param {string} query - User question.
 * @param {Array<string>} [docNames=null] - Selected document filters.
 * @param {Array<Object>} [chatHistory=[]] - Fallback conversation history.
 * @param {string|null} [sessionId=null] - Active chat session UUID.
 * @param {number} [topK=10] - Context chunk count limit.
 * @param {string|null} [modelName=null] - Specific model ID to override active model.
 * @param {string} [mode="research"] - Active academic reasoning lens.
 * @param {string|null} [customPromptDirective=null] - Optional custom prompt directive.
 */
export const sendQuery = async (
  query,
  docNames = null,
  chatHistory = [],
  sessionId = null,
  topK = 10,
  modelName = null,
  mode = 'research',
  customPromptDirective = null
) => {
  const formattedHistory = Array.isArray(chatHistory)
    ? chatHistory.slice(-6).map((msg) => ({
        sender: msg.sender || 'user',
        text: msg.text || '',
      }))
    : [];

  const { keys, activeModel } = getSavedBYOKConfig();
  const selectedModel = modelName || activeModel;

  if (!selectedModel) {
    throw new Error('No active model selected. Please add an API key in Settings first.');
  }

  try {
    const response = await apiClient.post('/query', {
      query: query,
      doc_names: docNames && docNames.length > 0 ? docNames : null,
      session_id: sessionId || null,
      chat_history: formattedHistory,
      top_k: topK,
      model_name: selectedModel,
      custom_keys: keys,
      mode: mode || 'research',
      custom_prompt_directive: customPromptDirective || null,
    });
    return response.data;
  } catch (error) {
    console.error('Query execution failed:', error.response?.data || error.message);
    throw error;
  }
};

// =============================================================================
// FR-13: ASSISTED ACADEMIC DOCUMENT WRITER & CITATION APIS
// =============================================================================

/**
 * Retrieves the persisted academic draft for a workspace session.
 * @param {string} sessionId - Database UUID of the session.
 */
export const getDraftAPI = async (sessionId) => {
  if (!sessionId) return null;
  try {
    const response = await apiClient.get(`/editor/draft/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to load draft for session ${sessionId}:`, error.response?.data || error.message);
    return null;
  }
};

/**
 * Persists / auto-saves the active draft and bibliography state.
 * @param {Object} draftData - { session_id, title, content_html, content_markdown, citations_data }
 */
export const saveDraftAPI = async (draftData) => {
  try {
    const response = await apiClient.post('/editor/draft', draftData);
    return response.data;
  } catch (error) {
    console.error('Failed to auto-save draft:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Executes vector similarity search to find grounded evidence passages for a highlighted sentence/claim.
 * @param {string} query - Highlighted statement to verify.
 * @param {Array<string>} [docNames=null] - Scoped workspace documents.
 * @param {number} [topK=5] - Number of candidate matches to return.
 */
export const findCitationsAPI = async (query, docNames = null, topK = 5) => {
  try {
    const response = await apiClient.post('/editor/find-citations', {
      query: query,
      doc_names: docNames && docNames.length > 0 ? docNames : null,
      top_k: topK,
    });
    return response.data; // { query, candidates: [...], total_matches }
  } catch (error) {
    console.error('Semantic citation search failed:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Calls the in-editor AI assistant for a highlighted excerpt.
 * @param {Object} params - { selection, instruction, docNames, modelName }
 */
export const editorAskAIAPI = async ({ selection, instruction, docNames = null, modelName = null }) => {
  const { keys, activeModel } = getSavedBYOKConfig();
  const selectedModel = modelName || activeModel;

  try {
    const response = await apiClient.post('/editor/ask-ai', {
      selection: selection,
      instruction: instruction,
      doc_names: docNames && docNames.length > 0 ? docNames : null,
      model_name: selectedModel || 'gemini/gemini-3.7-flash',
      custom_keys: keys,
    });
    return response.data; // { selection, instruction, result, thinking_process, sources_used }
  } catch (error) {
    console.error('In-editor AI assistance failed:', error.response?.data || error.message);
    throw error;
  }
};

// =============================================================================
// BRAIN MEMORY CLIENT API
// =============================================================================

/**
 * Retrieves all persistent memories, preferences, and workspace thoughts for the current user.
 * @param {Object} [params] - { workspace_id, scope, category, active_only }
 */
export const fetchBrainMemoriesAPI = async (params = {}) => {
  try {
    const response = await apiClient.get('/brain/memories', { params });
    return response.data; // { memories: [...], total: N }
  } catch (error) {
    console.error('Failed to fetch brain memories:', error.response?.data || error.message);
    return { memories: [], total: 0 };
  }
};

/**
 * Manually adds a new thought, rule, or preference to Brain.
 * @param {Object} memoryData - { thought, scope, category, workspace_id, is_active }
 */
export const createBrainMemoryAPI = async (memoryData) => {
  try {
    const response = await apiClient.post('/brain/memories', memoryData);
    return response.data;
  } catch (error) {
    console.error('Failed to create brain memory:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Updates or toggles an existing memory in Brain.
 * @param {string} memoryId
 * @param {Object} memoryData - { thought, category, scope, workspace_id, is_active }
 */
export const updateBrainMemoryAPI = async (memoryId, memoryData) => {
  try {
    const response = await apiClient.patch(`/brain/memories/${memoryId}`, memoryData);
    return response.data;
  } catch (error) {
    console.error(`Failed to update brain memory ${memoryId}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Erases a single memory record from Brain.
 * @param {string} memoryId
 */
export const deleteBrainMemoryAPI = async (memoryId) => {
  try {
    const response = await apiClient.delete(`/brain/memories/${memoryId}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to delete brain memory ${memoryId}:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * Batch clears memories from Brain.
 * @param {Object} [params] - { scope, workspace_id }
 */
export const clearBrainMemoriesAPI = async (params = {}) => {
  try {
    const response = await apiClient.delete('/brain/memories', { params });
    return response.data;
  } catch (error) {
    console.error('Failed to clear brain memories:', error.response?.data || error.message);
    throw error;
  }
};