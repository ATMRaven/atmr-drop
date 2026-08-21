export interface FileEntry {
  id: string;
  name: string;
  path?: string; // Relative directory path for folder uploads
  size: number;
  type: string;
  kvKey?: string;
  chunkCount?: number;
  chunkSize?: number;
}

export interface DropMetadata {
  code: string;
  createdAt: number;
  expiresAt: number;
  ttlSeconds: number;
  burnAfterRead: boolean;
  retrievedCount: number;
  pickedUp?: boolean;
  pickedUpAt?: number;
  text?: string;
  textType?: string;
  isEncrypted?: boolean; // Zero-knowledge E2EE flag
  files: FileEntry[];
  creator: string;
}

export interface CreateDropRequest {
  customPin?: string;
  text?: string;
  textType?: string;
  ttlSeconds?: number;
  burnAfterRead?: boolean;
  isEncrypted?: boolean;
  files?: Array<{
    id?: string;
    name: string;
    path?: string;
    type: string;
    size: number;
    chunkCount?: number;
    chunkSize?: number;
    dataBase64?: string;
  }>;
}

export interface WebRTCSignal {
  from: 'sender' | 'receiver';
  type: 'offer' | 'answer' | 'candidate' | 'ready';
  payload: any;
  timestamp: number;
}

export interface Env {
  ATMR_DROP_KV: KVNamespace;
  ATMR_DROP_R2?: R2Bucket;
  ASSETS?: Fetcher;
}
