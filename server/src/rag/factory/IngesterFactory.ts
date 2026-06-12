import { GroqIngester } from './GroqIngester';
import { OllamaIngester } from './OllamaIngester';
import { TransactionIngester } from './types';

export class IngesterFactory {
    static getIngester(provider: string | undefined): TransactionIngester {
        switch (provider?.toLowerCase()) {
            case 'ollama':
                return new OllamaIngester();
            case 'groq':
            default:
                return new GroqIngester();
        }
    }
}
