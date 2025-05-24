import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "@/schema";

const client = new Database("db.sqlite");
const db = drizzle({ client, schema });
export default db;
