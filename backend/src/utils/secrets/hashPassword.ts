import bcrypt from "bcryptjs";

export default async function hashPassword(password: string) {
  const hash = bcrypt.hash(password, 12);

  return hash;
}
