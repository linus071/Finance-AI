import OpenAI from 'openai';

// Centralized configuration
const EMBEDDING_CONFIG = {
  groq: { 
    model: process.env.HF_EMBED_MODEL || 'BAAI/bge-small-en-v1.5',
    dim: 384 
  },
  ollama: { 
    model: 'nomic-embed-text', 
    dim: 768 
  }
};

export const getChatClient = () => {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  
  // Use a shared config for Ollama to avoid redundant client creation
  return new OpenAI({
    apiKey: provider === 'groq' ? process.env.GROQ_API_KEY : 'ollama',
    baseURL: provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'http://localhost:11434/v1',
  });
};

export const getEmbedding = async (text: string): Promise<number[]> => {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const config = EMBEDDING_CONFIG[provider as keyof typeof EMBEDDING_CONFIG];

  let embedding: number[];

  if (provider === 'groq') {
    const response = await fetch(`https://router.huggingface.co/hf-inference/models/${config.model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text }),
    });
    const data = await response.json();
    embedding = Array.isArray(data[0]) ? data[0] : data;
  } else {
    const response = await fetch(`http://localhost:11434/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, prompt: text }),
    });
    const data = await response.json();
    embedding = data.embedding;
  }

  // VALIDATION: This prevents the dimension mismatch error
  if (embedding.length !== config.dim) {
    console.warn(`⚠️ Dimension Mismatch: Expected ${config.dim}, got ${embedding.length}`);
  }

  return embedding;
};

export const getLLMClient = getChatClient;

export const getActiveModelName = (): string => {
  const provider = (process.env.LLM_PROVIDER || 'groq').trim().toLowerCase();
  return provider === 'groq' ? 'llama-3.1-8b-instant' : 'llama3.2';
};