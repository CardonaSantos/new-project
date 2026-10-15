import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectAclCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  FileStoragePort,
  type UploadInput,
  type PresignInput,
  type RemoteObject,
} from '../../application/ports/file-storage.port.js';
import { SpacesSettings } from './spaces.settings.js';

@Injectable()
export class SpacesAdapter extends FileStoragePort {
  private readonly s3: S3Client;
  constructor(private readonly settings: SpacesSettings) {
    super();
    this.s3 = new S3Client({
      region: settings.region,
      endpoint: settings.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: settings.key,
        secretAccessKey: settings.secret,
      },
    });
  }
  async upload(input: UploadInput): Promise<{ etag: string | null }> {
    const out = await this.s3.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.mime,
        CacheControl: input.publico
          ? 'public, max-age=31536000, immutable'
          : 'private, no-store',
        ACL: input.publico ? 'public-read' : 'private',
      }),
    );
    return { etag: out.ETag ?? null };
  }
  presignPut(input: PresignInput): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        ContentType: input.mime,
        ContentLength: input.size,
      }),
      { expiresIn: input.expiresIn },
    );
  }
  async inspect(bucket: string, key: string): Promise<RemoteObject | null> {
    try {
      const out = await this.s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return {
        size: out.ContentLength ?? -1,
        mime: out.ContentType ?? '',
        etag: out.ETag ?? null,
      };
    } catch (error) {
      if (
        (error as { name?: string }).name === 'NotFound' ||
        (error as { name?: string }).name === 'NoSuchKey'
      )
        return null;
      throw error;
    }
  }
  async firstBytes(bucket: string, key: string): Promise<Buffer> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, Range: 'bytes=0-8191' }),
    );
    if (!result.Body) throw new Error('El objeto no contiene datos');
    const arr = await result.Body.transformToByteArray();
    return Buffer.from(arr).subarray(0, 8192);
  }
  downloadUrl(
    bucket: string,
    key: string,
    mime: string,
    name: string,
    expiresIn: number,
  ): Promise<string> {
    const safeName = name.replace(/[\r\n"\\]/g, '_').slice(0, 150);
    const disposition = mime === 'application/pdf' ? 'attachment' : 'inline';
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `${disposition}; filename="${safeName}"`,
      }),
      { expiresIn },
    );
  }
  async publish(bucket: string, key: string): Promise<void> {
    await this.s3.send(
      new PutObjectAclCommand({ Bucket: bucket, Key: key, ACL: 'public-read' }),
    );
  }
  async remove(bucket: string, key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
  publicUrl(key: string): string {
    if (!this.settings.cdnBase)
      throw new Error('DO_SPACES_CDN_BASE requerido para medios públicos');
    return (
      this.settings.cdnBase +
      '/' +
      key.split('/').map(encodeURIComponent).join('/')
    );
  }
}
