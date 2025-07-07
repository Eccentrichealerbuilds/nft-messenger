import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { create } from "ipfs-http-client";
import { encrypt as ecEncrypt } from "@metamask/eth-sig-util";
import { ethers } from "ethers";
import fs from "fs";


// Load env variables
dotenv.config({ path: __dirname + "/../../.env" });

const MONAD_RPC = process.env.MONAD_RPC || "https://testnet-rpc.monad.xyz";
// No private key needed now – front-end signs
const STORAGE_PATH = __dirname + "/pubkeys.json";
const IPFS_URL = process.env.IPFS_API_URL || "http://localhost:5001";

const app = express();
app.use(cors());
app.use(express.json());

// init ipfs client using separate VPS
const ipfs = create({ url: IPFS_URL });

// init ethers
// Still need ethers for randomBytes util but no provider/wallet now

// ----- helper functions for key storage -----

// persistent message index for sender/recipient per tokenId
const MSG_INDEX_PATH = __dirname + "/messages.json";
interface MsgInfo { sender: string; recipient: string }
function loadMsgIndex(): Record<string, MsgInfo> {
  if (fs.existsSync(MSG_INDEX_PATH)) {
    return JSON.parse(fs.readFileSync(MSG_INDEX_PATH, "utf8"));
  }
  return {};
}
function saveMsgIndex(map: Record<string, MsgInfo>) {
  fs.writeFileSync(MSG_INDEX_PATH, JSON.stringify(map, null, 2));
}

interface KeyMap { [addr: string]: string }
function loadKeys(): KeyMap {
  if (fs.existsSync(STORAGE_PATH)) {
    return JSON.parse(fs.readFileSync(STORAGE_PATH, "utf8"));
  }
  return {};
}
function saveKeys(map: KeyMap) {
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(map, null, 2));
}

// Endpoint: POST /api/pubkey  { address, pubKey }
app.post("/api/pubkey", (req, res) => {
  const { address, pubKey } = req.body as { address: string; pubKey: string };
  if (!ethers.isAddress(address) || !pubKey) {
    return res.status(400).json({ error: "invalid params" });
  }
  const map = loadKeys();
  map[address.toLowerCase()] = pubKey;
  saveKeys(map);
  res.json({ ok: true });
});

// Endpoint: GET /api/pubkey/:address
app.get("/api/pubkey/:address", (req, res) => {
  const address = req.params.address.toLowerCase();
  const db = loadKeys();
  if (db[address]) {
    res.json({ pubKey: db[address] });
  } else {
    res.status(404).json({ error: "not_found" });
  }
});



// Endpoint: GET /api/config – expose contract address
app.get("/api/config", (_, res) => {
  res.json({ contractAddress: process.env.CONTRACT_ADDRESS || null });
});

// Endpoint: GET /api/held/:addr – proxy to Magic Eden to list NFTs held by address for this contract
const ME_API_TOKEN = process.env.ME_API_TOKEN || "";
app.get("/api/held/:addr", async (req, res) => {
  try {
    const addr = req.params.addr.toLowerCase();
    const contract = (process.env.CONTRACT_ADDRESS || "").toLowerCase();
    if (!addr || !contract) return res.status(400).json({ error: "missing params" });
    const url = `https://api-mainnet.magiceden.dev/v3/rtp/monad-testnet/users/${addr}/tokens/v7?collection=${contract}&sortBy=acquiredAt&sortDirection=desc&limit=200&includeRawData=false`;

    const upstream = await fetch(url, {
      headers: {
        accept: "*/*",
        Authorization: `Bearer ${ME_API_TOKEN}`
      }
    });
    if (!upstream.ok) {
      const txt = await upstream.text();
      console.error("MagicEden error", txt);
      return res.status(502).json({ error: "upstream_failed" });
    }
    const json = await upstream.json();
    const tokenIds = (json.tokens || []).map((t: any) => t.token.tokenId);
    res.json({ tokenIds });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Endpoint: POST /api/index  { tokenIds: string[], sender: string, recipient: string }
app.post("/api/index", (req, res) => {
  const { tokenIds, sender, recipient } = req.body;
  console.log('[API_INDEX] Received request to index tokens:', { tokenIds, sender, recipient });
  const map = loadMsgIndex();
  tokenIds.forEach((id: string) => {
    console.log(`[API_INDEX] Indexing token ${id}`);
    map[id] = { sender, recipient };
  });
  saveMsgIndex(map);
  res.json({ ok: true });
});

// Endpoint: GET /api/msginfo/:id -> { sender, recipient }
app.get("/api/msginfo/:id", async (req, res) => {
  const id = req.params.id;
  const map = loadMsgIndex();

  if (map[id]) {
    console.log(`[API_MSGINFO] Found token ${id} in index.`);
    return res.json(map[id]);
  }

  // If not found in the index, return 404. No on-chain fallback.
  console.log(`[API_MSGINFO] Token ${id} not in index. Returning 404.`);
  return res.status(404).json({ error: "not_found_in_index" });
});

// Endpoint: POST /api/encrypt
app.post("/api/encrypt", async (req, res) => {
  try {
    const { message, recipients } = req.body as {
      message: string;
      recipients: string[];
    };

    // look up pubKeys
    const keyMap = loadKeys();
    const pubKeys: string[] = [];
    const missing: string[] = [];
    recipients.forEach(addr => {
      const key = keyMap[addr.toLowerCase()];
      if (key) pubKeys.push(key);
      else missing.push(addr);
    });
    if (missing.length) {
      return res.status(400).json({ error: "missing_pubkeys", missing });
    }

    // 1. Generate random symmetric key (32 bytes)
    const symKey = ethers.randomBytes(32);

    // 2. Encrypt message with AES-256-GCM (built-in in Node via crypto::webcrypto)
    const enc = await encryptSymmetric(symKey, message);

    // 3. upload ciphertext JSON to IPFS
    const cid = await uploadToIPFS(JSON.stringify(enc));

    // 4. encrypt symKey for each recipient using their pub key
    const encKeys: string[] = [];
    pubKeys.forEach((pk) => {
      const encrypted = ecEncrypt({
        publicKey: pk,
        data: Buffer.from(symKey).toString("hex"),
        version: "x25519-xsalsa20-poly1305"
      });
      encKeys.push("0x" + Buffer.from(JSON.stringify(encrypted), "utf8").toString("hex"));
    });

    // 5. return data; front-end will call contract
    res.json({ cid, encKeys });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// util: symmetric encryption with aes-gcm
async function encryptSymmetric(key: Uint8Array, plaintext: string) {
  const iv = ethers.randomBytes(12); // 96-bit nonce
  const enc = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    } as any,
    await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"]),
    new TextEncoder().encode(plaintext)
  );
  return {
    iv: Buffer.from(iv).toString("hex"),
    ciphertext: Buffer.from(new Uint8Array(enc)).toString("hex")
  };
}

// util: upload
async function uploadToIPFS(data: string) {
  const { cid } = await ipfs.add(data);
  // Optionally pin
  await ipfs.pin.add(cid);
  return cid.toString();
}

// start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
