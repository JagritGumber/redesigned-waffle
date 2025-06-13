import { S3Client } from "bun";

const s3 = new S3Client({
  accessKeyId: Bun.env.R2_ACCESS_KEY_ID,
  secretAccessKey: Bun.env.R2_SECRET_ACCESS_KEY,
  bucket: Bun.env.R2_BUCKET_NAME,
  endpoint: `https://${Bun.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
});

export default s3;
