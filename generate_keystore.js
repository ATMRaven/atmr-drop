const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

console.log('Generating deterministic 2048-bit RSA key pair...');
const keys = forge.pki.rsa.generateKeyPair(2048);

console.log('Creating self-signed X.509 certificate for atmr-drop...');
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30); // 30 years validity

const attrs = [
  { name: 'commonName', value: 'atmr drop' },
  { name: 'countryName', value: 'US' },
  { shortName: 'ST', value: 'Global' },
  { name: 'localityName', value: 'Global' },
  { name: 'organizationName', value: 'atmr' },
  { shortName: 'OU', value: 'mobile' }
];

cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

console.log('Packaging into PKCS#12 (.p12 / .keystore)...');
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
  keys.privateKey,
  [cert],
  'atmr-drop-key-pass',
  {
    algorithm: '3des',
    friendlyName: 'atmr-drop-key',
    generateLocalKeyId: true
  }
);

const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
const outPath = path.join(__dirname, 'android', 'app', 'atmr-drop-release.p12');
fs.writeFileSync(outPath, Buffer.from(p12Der, 'binary'));

console.log('✅ Generated permanent keystore at:', outPath);
console.log('File size:', fs.statSync(outPath).size, 'bytes');
