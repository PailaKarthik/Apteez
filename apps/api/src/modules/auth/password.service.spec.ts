import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes and verifies a password', async () => {
    const hash = await passwords.hash('correct-horse-battery-staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(passwords.verify('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await passwords.hash('correct-horse-battery-staple');
    await expect(passwords.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces unique salts per hash', async () => {
    const first = await passwords.hash('same-password');
    const second = await passwords.hash('same-password');
    expect(first).not.toBe(second);
  });

  it('rejects malformed hashes without throwing', async () => {
    await expect(passwords.verify('anything', 'not-a-hash')).resolves.toBe(false);
    await expect(passwords.verify('anything', '')).resolves.toBe(false);
  });
});
