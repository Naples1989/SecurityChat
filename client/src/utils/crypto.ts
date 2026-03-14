// Hybrid Encryption (RSA + AES-GCM) per sicurezza estrema
// 1. Genera una chiave AES temporanea per ogni messaggio.
// 2. Cifra il messaggio con AES-GCM (veloce e sicuro per dati grandi).
// 3. Cifra la chiave AES con la chiave pubblica RSA del destinatario.

export const generateKeyPair = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096, // Aumentato a 4096 bit per massima sicurezza
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKey))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKey))),
  };
};

export const encryptMessage = async (text: string, recipientPublicKeyStr: string) => {
  // 1. Genera chiave AES-GCM casuale
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Cifra il testo con AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encodedText
  );

  // 3. Esporta chiave AES e cifrala con RSA pubblica del destinatario
  const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const recipientPublicKeyBuf = new Uint8Array(atob(recipientPublicKeyStr).split("").map(c => c.charCodeAt(0)));
  const recipientPublicKey = await window.crypto.subtle.importKey(
    "spki",
    recipientPublicKeyBuf,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );

  const encryptedAesKey = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    exportedAesKey
  );

  // Restituisce tutto il pacchetto in formato JSON base64
  const packet = {
    key: btoa(String.fromCharCode(...new Uint8Array(encryptedAesKey))),
    iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
    content: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
  };

  return btoa(JSON.stringify(packet));
};

export const decryptMessage = async (encryptedPacketStr: string, myPrivateKeyStr: string) => {
  const packet = JSON.parse(atob(encryptedPacketStr));
  
  // 1. Decifra la chiave AES con la mia chiave privata RSA
  const myPrivateKeyBuf = new Uint8Array(atob(myPrivateKeyStr).split("").map(c => c.charCodeAt(0)));
  const myPrivateKey = await window.crypto.subtle.importKey(
    "pkcs8",
    myPrivateKeyBuf,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );

  const encryptedAesKeyBuf = new Uint8Array(atob(packet.key).split("").map(c => c.charCodeAt(0)));
  const decryptedAesKeyRaw = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    myPrivateKey,
    encryptedAesKeyBuf
  );

  // 2. Importa la chiave AES decifrata
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    decryptedAesKeyRaw,
    { name: "AES-GCM" },
    true,
    ["decrypt"]
  );

  // 3. Decifra il contenuto con AES-GCM
  const iv = new Uint8Array(atob(packet.iv).split("").map(c => c.charCodeAt(0)));
  const encryptedContentBuf = new Uint8Array(atob(packet.content).split("").map(c => c.charCodeAt(0)));
  const decryptedContentBuf = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encryptedContentBuf
  );

  return new TextDecoder().decode(decryptedContentBuf);
};
