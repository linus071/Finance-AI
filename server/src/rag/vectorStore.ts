import fs from 'fs';
import path from 'path';

const VECTOR_DB_PATH = path.join(__dirname, '../../vector_db.json');

export interface VectorRecord {
    id: string;
    vector: number[];
    metadata: {
        context: string;
        category: string;
        account_type: string;
        account_number: string;
        description_1: string;
        description_2: string;
        amount: number;
        date: string;
    };
}

export class MemoryVectorStore {
    private storage: VectorRecord[] = [];

    constructor() {
        this.load_from_disk();
    }

    public save_to_disk(): void {
        fs.writeFileSync(VECTOR_DB_PATH, JSON.stringify(this.storage, null, 2), 'utf-8');
    }

    public load_from_disk(): void {
        if (!fs.existsSync(VECTOR_DB_PATH)) {
            return;
        }
        try {
            const raw = fs.readFileSync(VECTOR_DB_PATH, 'utf-8');
            const loaded = JSON.parse(raw) as VectorRecord[];
            if (Array.isArray(loaded)) {
                this.storage = loaded;
            }
        } catch (err) {
            console.warn('Warning: Failed to load vector_db.json:', err);
        }
    }

    //Ingestion Phase: Adds a structured vector transaction record to memory
    public add_vector_record(record: VectorRecord): void {
        if (this.storage.length > 0 && record.vector.length !== this.storage[0].vector.length) {
            console.warn("Warning: Embedding provider changed! Flushing in-memory vector cache to prevent dimension mismatch.");
            this.clear(); // Wipes out the old incompatible dimensions safely
        }
        this.storage.push(record);
    }

    //Query Phase: Retrieves the top 5 most similar vector records based on cosine similarity
    public similaritySearch(queryVector: number[], topK: number = 5): { record: VectorRecord; score: number }[] {
        if (this.storage.length === 0) {
            return [];
        }

        const A = queryVector;
        const scoredResults: { record: VectorRecord; score: number }[] = [];

        for (const record of this.storage) {
            const B = record.vector;
            let dotProduct = 0;
            let magnitudeA = 0;
            let magnitudeB = 0;

            for(let i = 0; i < A.length; i++){
                dotProduct += A[i] * B[i];
                magnitudeA += A[i] * A[i];
                magnitudeB += B[i] * B[i];
            }
            magnitudeA = Math.sqrt(magnitudeA);
            magnitudeB = Math.sqrt(magnitudeB);
            const cosineSimilarity = dotProduct / (magnitudeA * magnitudeB);
            scoredResults.push({ record, score: cosineSimilarity });
        }
        return scoredResults.sort((a, b) => b.score - a.score).slice(0, topK);
    }

    //Clear the vector store
    public clear(): void {
        this.storage = [];
    }

    //Get the size of the vector store
    public get_size(): number {
        return this.storage.length;
    }

    public get_all_records(): VectorRecord[] {
        return this.storage;
    }
}