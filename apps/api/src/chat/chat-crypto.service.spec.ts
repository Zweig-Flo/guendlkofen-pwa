import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { ChatCryptoService } from './chat-crypto.service';

function makeService(
  keyHex = randomBytes(32).toString('hex'),
): ChatCryptoService {
  const config = {
    getOrThrow: jest.fn().mockReturnValue(keyHex),
  } as unknown as ConfigService;
  return new ChatCryptoService(config);
}

describe('ChatCryptoService', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const crypto = makeService();
    const plaintext = 'Wer bringt am Samstag die Bälle mit? 🎾';

    const packed = crypto.encrypt(plaintext);

    expect(packed.startsWith('v1:')).toBe(true);
    expect(packed).not.toContain(plaintext);
    expect(ChatCryptoService.isCiphertext(packed)).toBe(true);
    expect(crypto.decrypt(packed)).toBe(plaintext);
  });

  it('produces a fresh IV per call (ciphertexts differ)', () => {
    const crypto = makeService();
    expect(crypto.encrypt('same')).not.toBe(crypto.encrypt('same'));
  });

  it('rejects a tampered ciphertext body (bad auth tag)', () => {
    const crypto = makeService();
    const [v, iv, tag, data] = crypto.encrypt('secret').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    const tampered = [v, iv, tag, flipped.toString('base64')].join(':');

    expect(() => crypto.decrypt(tampered)).toThrow();
  });

  it('rejects a tampered auth tag', () => {
    const crypto = makeService();
    const [v, iv, tag, data] = crypto.encrypt('secret').split(':');
    const flipped = Buffer.from(tag, 'base64');
    flipped[0] ^= 0xff;
    const tampered = [v, iv, flipped.toString('base64'), data].join(':');

    expect(() => crypto.decrypt(tampered)).toThrow();
  });

  it('rejects garbled / unknown-format input', () => {
    const crypto = makeService();
    expect(() => crypto.decrypt('not-encrypted')).toThrow();
    expect(() => crypto.decrypt('v2:a:b:c')).toThrow();
    expect(() => crypto.decrypt('v1:a:b')).toThrow();
  });

  it('cannot be decrypted with a different key', () => {
    const a = makeService();
    const b = makeService();
    expect(() => b.decrypt(a.encrypt('secret'))).toThrow();
  });

  it('throws at construction when the key is not 32 bytes', () => {
    expect(() => makeService('abcd')).toThrow(/32 bytes/);
  });
});
