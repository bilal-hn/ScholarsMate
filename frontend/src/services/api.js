import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
 * Creates a new research workspace by uploading and processing multiple PDF files or an entire folder of PDFs.
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
 */
export const createChatSession = async (title = 'New Research Chat') => {
  try {
    const response = await apiClient.post('/sessions', { title });
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
 * Sends a research query to the ScholarsMate RAG pipeline with session persistence.
 * @param {string} query - User question.
 * @param {Array<string>} [docNames=null] - Selected document filters.
 * @param {Array<Object>} [chatHistory=[]] - Fallback conversation history.
 * @param {string|null} [sessionId=null] - Active chat session UUID.
 * @param {number} [topK=10] - Context chunk count limit.
 */
export const sendQuery = async (query, docNames = null, chatHistory = [], sessionId = null, topK = 10) => {
  const formattedHistory = Array.isArray(chatHistory)
    ? chatHistory.slice(-6).map((msg) => ({
        sender: msg.sender || 'user',
        text: msg.text || '',
      }))
    : [];

  try {
    const response = await apiClient.post('/query', {
      query: query,
      doc_names: docNames && docNames.length > 0 ? docNames : null,
      session_id: sessionId || null,
      chat_history: formattedHistory,
      top_k: topK,
    });
    return response.data;
  } catch (error) {
    console.error('Query execution failed:', error.response?.data || error.message);
    throw error;
  }
};