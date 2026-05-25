// ============================================================
// 加密工具模块
// 使用 AES-256 加密，密钥从密码派生
// ============================================================

import CryptoJS from 'crypto-js';

// 从密码派生密钥（PBKDF2）
export const deriveKey = (password: string, salt: string = 'mortgage_calc_salt_2026'): string => {
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,  // 256-bit key
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString();
};

// 加密数据
export const encryptData = (data: string, password: string): string => {
  const key = deriveKey(password);
  const encrypted = CryptoJS.AES.encrypt(data, key, {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.toString();
};

// 解密数据
export const decryptData = (encryptedData: string, password: string): string => {
  const key = deriveKey(password);
  const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return decrypted.toString(CryptoJS.enc.Utf8);
};

// 加密文件（Base64）
export const encryptFile = (fileBase64: string, password: string): string => {
  const key = deriveKey(password);
  const encrypted = CryptoJS.AES.encrypt(fileBase64, key, {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return encrypted.toString();
};

// 解密文件（Base64）
export const decryptFile = (encryptedBase64: string, password: string): string => {
  const key = deriveKey(password);
  const decrypted = CryptoJS.AES.decrypt(encryptedBase64, key, {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return decrypted.toString(CryptoJS.enc.Base64);
};

// 生成校验哈希（验证密码是否正确）
export const generateHash = (password: string): string => {
  return CryptoJS.SHA256(password + 'mortgage_vault_2026').toString();
};

// 验证密码
export const verifyPassword = (password: string, storedHash: string): boolean => {
  const hash = generateHash(password);
  return hash === storedHash;
};

export const ENCRYPTION_KEY = 'vault_encryption_key_hash';
