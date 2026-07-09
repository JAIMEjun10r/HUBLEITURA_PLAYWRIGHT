import { mkdirSync } from "fs";
import { dirname } from "path";

export const authFiles = {
  admin: ".auth/admin.json",
  user: ".auth/user.json",
};

export function ensureAuthDir(): void {
  mkdirSync(dirname(authFiles.user), { recursive: true });
}
