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
 * Sends a research query to the ScholarsMate RAG pipeline.
 * @param {string} query - User question.
 * @param {Array<string>} [docNames=null] - Selected document filters.
 * @param {number} [topK=10] - Context chunk count limit.
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
    console.error('Query execution failed:', error.response?.data || error.message);
    throw error;
  }
};