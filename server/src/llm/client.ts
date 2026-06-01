import OpenAI from 'openai';

// Chat completions — Groq (production) or Ollama (local)
export const getChatClient = () => {
  const provider = process.env.LLM_PROVIDER || 'groq';
  if (provider === 'groq') {
    return new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return new OpenAI({
    apiKey: 'ollama',
    baseURL: 'http://localhost:11434/v1',
  });
};

export const getOllamaClient = () => {
  return new OpenAI({
    apiKey: 'ollama',
    baseURL: 'http://localhost:11434/v1',
  });
};

// Embeddings — HuggingFace (production) or Ollama (local)
export const getEmbedding = async (text: string): Promise<number[]> => {
  const provider = process.env.LLM_PROVIDER || 'groq';
  
  if (provider === 'groq') {
    const model =
      process.env.HF_EMBED_MODEL || 'BAAI/bge-small-en-v1.5';
    const response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HuggingFace API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    
    // The model returns either a raw nested array or a wrapped feature vector
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0]; 
    } else if (Array.isArray(data)) {
      return data as number[];
    }
    
    throw new Error(`Unexpected HuggingFace response format: ${JSON.stringify(data)}`);
  }

  // Ollama local embeddings
  const response = await fetch(
    `http://localhost:11434/api/embeddings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
         model: 'nomic-embed-text', 
         prompt: text 
       }),
    }
  );
  const data = await response.json();
  return data.embedding;
};

export const CHAT_MODEL = process.env.LLM_PROVIDER === 'groq'
  ? 'llama-3.1-8b-instant'
  : 'llama3.2';

/** PROJECT.md alias — chat completions client. */
export const getLLMClient = getChatClient;

/** Chat model id for the active LLM_PROVIDER. */
export const MODEL = CHAT_MODEL;