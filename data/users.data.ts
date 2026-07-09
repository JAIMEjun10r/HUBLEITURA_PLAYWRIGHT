import { LoginData } from "../types/auth.types";

export function regularUserCredentials(): LoginData {
  return {
    email: "usuario@teste.com",
    password: "user123",
  };
}

export function adminUserCredentials(): LoginData {
  return {
    email: "admin@biblioteca.com",
    password: "admin123",
  };
}

export function invalidUserCredentials(): LoginData {
  return {
    email: "invalido@email.com",
    password: "senhaerrada",
  };
}
