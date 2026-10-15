export interface UploadInput {
  bucket: string;
  key: string;
  bytes: Buffer;
  mime: string;
  publico: boolean;
}
export interface PresignInput {
  bucket: string;
  key: string;
  mime: string;
  size: number;
  expiresIn: number;
}
export interface RemoteObject {
  size: number;
  mime: string;
  etag: string | null;
}
export abstract class FileStoragePort {
  abstract upload(input: UploadInput): Promise<{etag: string | null}>;
  abstract presignPut(input: PresignInput): Promise<string>;
  abstract inspect(bucket: string, key: string): Promise<RemoteObject | null>;
  abstract firstBytes(bucket: string, key: string): Promise<Buffer>;
  abstract downloadUrl(bucket: string, key: string, mime: string, name: string, expiresIn: number): Promise<string>;
  abstract publish(bucket: string, key: string): Promise<void>;
  abstract remove(bucket: string, key: string): Promise<void>;
  abstract publicUrl(key: string): string;
}
