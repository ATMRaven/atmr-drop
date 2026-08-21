export interface FileEntry {
  id: string;
  name: string;
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
  files: FileEntry[];
  creator: string;
}

export interface CreateDropRequest {
  text?: string;
  textType?: string;
  ttlSeconds?: number;
  burnAfterRead?: boolean;
  files?: Array<{
    id?: string;
    name: string;
    type: string;
    size: number;
    chunkCount?: number;
    chunkSize?: number;
    dataBase64?: string;
  }>;
}

export interface Env {
  ATMR_DROP_KV: KVNamespace;
  ATMR_DROP_R2?: R2Bucket;
  ASSETS?: Fetcher;
}
