import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM standard nonce size
const FORMAT_VERSION = 'v1';

/**
 * Symmetric encryption for chat messages at rest.
 *
 * AES-256-GCM with a server-held key (`CHAT_ENCRYPTION_KEY`, 32-byte hex).
 * Ciphertext is packed as `v1:<iv>:<tag>:<data>` (each part base64). The version
 * tag leaves room for future key rotation. GCM's auth tag means any tampering
 * with the stored value makes `decrypt` throw instead of returning garbage.
 */
@Injectable()
export class ChatCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hex = config.getOrThrow<string>('CHAT_ENCRYPTION_KEY').trim();
    const key = Buffer.from(hex, 'hex');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `CHAT_ENCRYPTION_KEY must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars); got ${key.length} bytes`,
      );
    }
    this.key = key;
  }

  /** Encrypts UTF-8 plaintext into the packed `v1:iv:tag:data` string. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      FORMAT_VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      data.toString('base64'),
    ].join(':');
  }

  /**
   * Decrypts a packed string produced by {@link encrypt}. Throws on an unknown
   * format, a malformed payload, or a failed authentication tag (tampering).
   */
  decrypt(packed: string): string {
    const parts = packed.split(':');
    if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
      throw new Error('Unsupported chat ciphertext format');
    }
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const data = Buffer.from(parts[3], 'base64');
    if (iv.length !== IV_BYTES || tag.length !== 16) {
      throw new Error('Malformed chat ciphertext');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    // `final()` throws (bad auth tag) if the ciphertext or tag was altered.
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }

  /** True if `value` looks like our packed ciphertext (not plaintext). */
  static isCiphertext(value: string): boolean {
    return value.startsWith(`${FORMAT_VERSION}:`);
  }
}
