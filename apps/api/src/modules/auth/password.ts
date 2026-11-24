import argon2 from "argon2";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export const argon2idPasswordHasher: PasswordHasher = {
  hash(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  },
  verify(password, passwordHash) {
    return argon2.verify(passwordHash, password);
  },
};
