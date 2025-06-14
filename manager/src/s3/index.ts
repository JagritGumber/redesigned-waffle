import { S3Client } from "bun";

const s3 = new S3Client({
  accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
  secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
  bucket: Bun.env.R2_BUCKET_NAME,
  endpoint: Bun.env.R2_PUBLIC_BUCKET_URL,
});

export default s3;
