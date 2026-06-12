import { SessionData } from '../../session';

export interface RawTransactionRow {
    "Account Type": string;
    "Account Number": string;
    "Transaction Date": string;
    "Cheque Number"?: string | number;
    "Description 1": string;
    "Description 2": string;
    "CAD$": string | number;
    "USD$"?: string | number;
}

export interface TransactionIngester {
    ingest(session: SessionData, raw_data: RawTransactionRow[]): Promise<void>;
}
