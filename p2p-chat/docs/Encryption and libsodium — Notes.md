# Encryption and libsodium — Notes

Written while building Phase 4 of the P2P chat. Beginner level, step by step.

## 1. The problem

You want to send a message to a friend, but anyone between you can read it (the network, a server, someone on the same Wi-Fi). Encryption scrambles the message so only the right person can unscramble it.

- **Plaintext:** the readable message ("hi").
- **Ciphertext:** the scrambled version (`88dfce1323b9a2b1...`).
- **Key:** the secret value needed to scramble or unscramble.

## 2. Two kinds of encryption

### Symmetric: one shared key
The same key locks and unlocks. Fast. The problem: how do you give your friend the key without a spy copying it?

### Asymmetric (public key): a key pair
Each person has two linked keys:
- **Public key:** can be shared with everyone. Think of it as an open padlock.
- **Private key:** never leaves its owner. Think of it as the only key that opens the padlock.

Something locked with your public key can only be opened with your private key. So you can hand your public key to anyone, even over a spied-on network.

## 3. The padlock story, step by step

1. Alice and Bob each make their own padlock + key.
2. They swap padlocks (public keys). A spy sees both padlocks and learns nothing useful.
3. Alice wants to write to Bob. She locks the message using Bob's padlock.
4. Only Bob's private key opens it.

Our chat does exactly this automatically between two browser tabs.

## 4. How libsodium does it (what we actually use)

**libsodium** is a well-tested crypto library. Rule: **never write your own cryptography.** Always use a vetted library.

We use `crypto_box`. It combines three things in one call:
1. **Key agreement (X25519):** my private key + their public key produce a shared secret that only the two of us can compute. The secret itself is never sent.
2. **Encryption (XSalsa20):** scrambles the message with that secret.
3. **Authentication (Poly1305):** adds a tag that proves the message wasn't changed. If even 1 bit is altered, decryption fails.

The combination is called **authenticated encryption**: it gives secrecy *and* tamper detection.

## 5. The functions in our code

| Function | What it does |
|---|---|
| `sodium.ready` | A promise. libsodium loads asynchronously, so wait for it first. |
| `crypto_box_keypair()` | Makes a new key pair: `{ publicKey, privateKey }`. |
| `randombytes_buf(n)` | Makes `n` random bytes. We use it for the nonce. |
| `crypto_box_easy(msg, nonce, theirPublicKey, myPrivateKey)` | Encrypts. Returns the ciphertext (message + tag). |
| `crypto_box_open_easy(cipher, nonce, theirPublicKey, myPrivateKey)` | Decrypts. Throws an error if the data was tampered with or the keys are wrong. |
| `crypto_generichash(len, data)` | Hash: turns any data into a short fixed-size fingerprint. |
| `to_hex` / `from_hex` | Convert bytes to text and back. JSON can only carry text. |
| `to_string` | Converts decrypted bytes back to readable text. |
| `compare(a, b)` | Compares two byte arrays, used to sort them. |

## 6. The nonce

A **nonce** ("number used once") is a random value attached to each message.

- The same text encrypts differently each time, so a spy can't tell when you repeat yourself.
- It is **not secret**. We send it next to the ciphertext.
- It must never be reused with the same keys. `crypto_box_NONCEBYTES` (24 bytes) is large enough that random values never collide.
- The receiver needs the same nonce to decrypt.

## 7. Our message format

Everything travels as JSON text over the DataChannel.

```json
{ "type": "key", "key": "<public key in hex>" }
{ "type": "msg", "n": "<nonce in hex>", "c": "<ciphertext in hex>" }
```

Flow:
1. When the channel opens, each tab sends its public key (`type: "key"`).
2. Each tab stores the other's key in `theirKey`.
3. To send: make a nonce, encrypt with `theirKey` + my private key, send `n` and `c`.
4. To receive: decrypt with the sender's public key + my private key.

## 8. Fingerprints (defense against a man in the middle)

**The attack:** a spy sits between Alice and Bob and swaps the public keys with his own. Alice thinks she's locking for Bob, but she's locking for the spy. The spy reads everything, re-locks it, and passes it on.

**The defense:** a **fingerprint** is a short hash of both public keys, like `a1b2-c3d4-e5f6-7890`.
- Both tabs compute it from the same two keys, so they must show the **same code**.
- Alice and Bob compare it through a different channel (a phone call, in person).
- If the spy swapped keys, Alice's code and Bob's code differ, and the attack is exposed.

Why we sort the two keys before hashing: so both tabs hash them in the same order and get the same result.

This is the "safety number" feature in Signal and WhatsApp.

## 9. Two layers of encryption in our app

1. **DTLS (built into WebRTC):** protects the pipe between the two browsers.
2. **Our crypto_box layer:** protects the messages end to end, in our own code.

Even if the pipe were compromised, or traffic went through a TURN relay, the messages would stay unreadable without our private keys.

## 10. Honest limits of this project

- Keys are created in each tab and lost when it closes. Real apps store keys safely and rotate them.
- The same key pair encrypts every message. If it leaks, **past** messages are exposed too. Real messengers (Signal) use a "ratchet" to create new keys per message (forward secrecy).
- The fingerprint only protects you if you actually compare it.
- Our page loads libsodium from a CDN (`esm.sh`). If the CDN were compromised, the code could be too. Production code would host and pin the library.
- The browser trusts whatever JavaScript the server sends. It's the main reason JS-based E2E can't be called "unbreakable".
- Not audited. It is a learning project, not for real secrets.

## 11. Experiments

- Open the browser dev tools and look at what a sent message looks like on the wire (the `c` value).
- Send the same text twice and compare the ciphertexts. They differ because of the nonce.
- Flip one bit of a ciphertext. Decryption fails.
- Compare the fingerprint in both tabs. They must match.
- Swap a public key in the signaling flow and watch the fingerprints diverge (Phase 7).

## 12. Quick self-test

1. What's the difference between a public key and a private key?
2. Why can we safely send a public key over an unsafe network?
3. What does the nonce do, and does it need to be secret?
4. What does "authenticated" add to "encrypted"?
5. How does a fingerprint reveal a man-in-the-middle attack?
6. Why do we never write our own crypto?
