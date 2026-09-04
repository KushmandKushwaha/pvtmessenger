import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const globalForS3 = globalThis as unknown as { s3Client?: S3Client };

type StorageConfig = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

function getStorageConfig(): StorageConfig {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required.');
  }

  return {
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    region: process.env.S3_REGION?.trim() || 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
}

function getStorageClient(): { client: S3Client; bucket: string } {
  const config = getStorageConfig();
  const client = globalForS3.s3Client ?? new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForS3.s3Client = client;
  }

  return { client, bucket: config.bucket };
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string) {
  const { client, bucket } = getStorageClient();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: body.byteLength,
    ServerSideEncryption: 'AES256',
    CacheControl: 'private, no-store',
  }));
}

export async function getPrivateObject(key: string) {
  const { client, bucket } = getStorageClient();
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function deletePrivateObject(key: string) {
  const { client, bucket } = getStorageClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
