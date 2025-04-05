import bcrypt from "bcryptjs";

export default async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  const match = bcrypt.compare(password, hash);

  return match;
}
