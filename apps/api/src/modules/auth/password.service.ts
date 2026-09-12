import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

/** Promise wrapper around the callback form (which accepts cost options). */
function scryptAsync(
  password: string,
  salt: string,
  keyLength: number,
  params: ScryptParams,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, params, (error, derived) => {
      if (error) {
        reject(error);
      } else {
        resolve(derived);
      }
    });
  });
}

/**
 * Password hashing strategy: scrypt (memory-hard, stdlib-only, no native
 * dependencies). The format self-describes its parameters
 * (`scrypt$N$r$p$salt$hash`) so parameters can evolve without a migration.
 * Authentication flows in a later prompt use this for registration/login.
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH).toString('hex');
    const derived = (await scryptAsync(password, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    })) as Buffer;
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4] ?? '';
    const expectedHex = parts[5] ?? '';
    if (
      !Number.isInteger(n) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      !salt ||
      !expectedHex
    ) {
      return false;
    }
    const expected = Buffer.from(expectedHex, 'hex');
    const derived = (await scryptAsync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    })) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
