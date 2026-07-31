import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Sends a research query to the ScholarsMate RAG backend.
 * @param {string} query - The user's input question.
 * @param {Array<string>} [docNames=null] - Optional list of selected document filenames.
 * @param {number} [topK=10] - Maximum chunks to retrieve.
 */
export const sendQuery = async (query, docNames = null, topK = 10) => {
  try {
    const response = await apiClient.post('/query', {
      query: query,
      doc_names: docNames && docNames.length > 0 ? docNames : null,
      top_k: topK,
    });
    return response.data;
  } catch (error) {
    console.error('API Error in sendQuery:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Health check endpoint to verify backend status.
 */
export const checkHealth = async () => {
  try {
    const response = await apiClient.get('/health');
    return response.data;
  } catch (error) {
    console.error('Backend server offline:', error.message);
    return { status: 'offline' };
  }
};