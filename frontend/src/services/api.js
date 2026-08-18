import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

/**
 * Gets or creates a persistent anonymous Guest UUID.
 */
export const getGuestId = () => {
  let guestId = localStorage.getItem('scholarsmate_guest_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
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

// =============================================================================
// BYOK & CLIENT-SIDE MODEL CONFIGURATION
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
 */
export const getSavedBYOKConfig = () => {
  try {
    return {
      keys: JSON.parse(localStorage.getItem('scholarsmate_byok_keys') || '{}'),
      discoveredModels: JSON.parse(localStorage.getItem('scholarsmate_discovered_models') || '[]'),
      activeModel: localStorage.getItem('scholarsmate_active_model') || 'groq/llama-3.3-70b-versatile',
    };
  } catch {
    return { keys: {}, discoveredModels: [], activeModel: 'groq/llama-3.3-70b-versatile' };
  }
};

/**
 * Persists updated API keys, discovered models, and active model to localStorage.
 */
export const saveBYOKConfig = (keys = null, discoveredModels = null, activeModel = null) => {
  if (keys !== null) localStorage.setItem('scholarsmate_byok_keys', JSON.stringify(keys));
  if (discoveredModels !== null) localStorage.setItem('scholarsmate_discovered_models', JSON.stringify(discoveredModels));
  if (activeModel !== null) localStorage.setItem('scholarsmate_active_model', activeModel);
};

// =============================================================================
// AUTH & IDENTITY API METHODS
// =============================================================================

/**
 * Fetches the currently authenticated profile or active guest session.
 */
export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/auth/me');
    return response.data;
  } catch (error) {
    console.error('Failed to get current user:', error.response?.data || error.message);
    throw error;
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
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('Backend offline:', error.message);
    return { status: 'offline' };
  }
};

/**
 * Retrieves the catalog of indexed documents and chunk counts.
 */
export const getDocuments = async () => {
  try {
    const response = await apiClient.get('/documents');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch document catalog:', error.response?.data || error.message);
    throw error;
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
 * Generates a structured multi-paper literature review using Gemini 1.5.
 * @param {Array<string>} [docNames=[]] - Selected document filters.
 */
export const generateLiteratureReview = async (docNames = []) => {
  try {
    const response = await apiClient.post('/workspace/literature-review', {
      doc_names: docNames && docNames.length > 0 ? docNames : [],
    });
    return response.data;
  } catch (error) {
    console.error('Literature review failed:', error.response?.data || error.message);
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
    console.error('Failed to fetch chat sessions:', error.response?.data || error.message);
    throw error;
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
    console.error(`Failed to fetch messages for session ${sessionId}:`, error.response?.data || error.message);
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

/**
 * Sends a research query to the ScholarsMate RAG pipeline with BYOK support.
 * @param {string} query - User question.
 * @param {Array<string>} [docNames=null] - Selected document filters.
 * @param {Array<Object>} [chatHistory=[]] - Fallback conversation history.
 * @param {string|null} [sessionId=null] - Active chat session UUID.
 * @param {number} [topK=10] - Context chunk count limit.
 * @param {string|null} [modelName=null] - Specific model ID to override active model.
 */
export const sendQuery = async (
  query, 
  docNames = null, 
  chatHistory = [], 
  sessionId = null, 
  topK = 10,
  modelName = null
) => {
  const formattedHistory = Array.isArray(chatHistory)
    ? chatHistory.slice(-6).map((msg) => ({
        sender: msg.sender || 'user',
        text: msg.text || '',
      }))
    : [];

  const { keys, activeModel } = getSavedBYOKConfig();
  const selectedModel = modelName || activeModel;

  try {
    const response = await apiClient.post('/query', {
      query: query,
      doc_names: docNames && docNames.length > 0 ? docNames : null,
      session_id: sessionId || null,
      chat_history: formattedHistory,
      top_k: topK,
      model_name: selectedModel,
      custom_keys: keys,
    });
    return response.data;
  } catch (error) {
    console.error('Query execution failed:', error.response?.data || error.message);
    throw error;
  }
};