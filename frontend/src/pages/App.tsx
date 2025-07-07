import React, { useEffect, useState, useCallback } from "react";
import MessengerAbi from "../abi/MessengerNFT.json";
import { ethers } from "ethers";
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider, useDisconnect } from '@web3modal/ethers/react';
import { ChevronRightIcon, SendIcon, KeyIcon, UserIcon, PaletteIcon, XIcon, CheckIcon, LockIcon, RefreshCwIcon, LogInIcon, MessageSquareIcon, UsersIcon, PlusCircleIcon, LogOutIcon } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const ENV_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || null;
const themes = [
    { name: 'Default Light', id: 'theme-default-light' },
    { name: 'Default Dark', id: 'theme-default-dark' },
    { name: 'Royal Purple', id: 'theme-royal-purple' },
    { name: 'Ocean Blue', id: 'theme-ocean-blue' },
    { name: 'Forest Green', id: 'theme-forest-green' },
    { name: 'Sunset Orange', id: 'theme-sunset-orange' },
    { name: 'Cherry Red', id: 'theme-cherry-red' },
    { name: 'Midnight Blue', id: 'theme-midnight-blue' },
    { name: 'Golden Yellow', id: 'theme-golden-yellow' },
    { name: 'Mint Green', id: 'theme-mint-green' },
    { name: 'Bubblegum Pink', id: 'theme-bubblegum-pink' },
    { name: 'Cyber Punk', id: 'theme-cyber-punk' },
    { name: 'Monad', id: 'theme-monad' },
    { name: 'Ethereal', id: 'theme-ethereal' },
    { name: 'Neon', id: 'theme-neon' },
];

export default function App() {
  const [contractAddr, setContractAddr] = useState<string | null>(ENV_ADDRESS);
  const { open } = useWeb3Modal();
  const { address, isConnected } = useWeb3ModalAccount();
  const { disconnect } = useDisconnect();
  const { walletProvider } = useWeb3ModalProvider();
  const [message, setMessage] = useState<string>("");
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [recipient, setRecipient] = useState<string>("");
  type Msg = { tokenId: string; sender: string; recipient: string; cid: string; encKey?: string; decrypted?: string };
  const [events, setEvents] = useState<Msg[]>([]);
  const [activePeer, setActivePeer] = useState<string | null>(null);
    const [currentTheme, setCurrentTheme] = useState<string>(() => {
    return localStorage.getItem('theme') || 'theme-default-dark';
  });
  const [themeMenuOpen, setThemeMenuOpen] = useState<boolean>(false);
  const [isSending, setIsSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    document.documentElement.className = currentTheme;
    localStorage.setItem('theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (!contract || !address) return;

    const intervalId = setInterval(() => {
      loadMessages(contract, address);
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId);
  }, [contract, address]);

  useEffect(() => {
    if (isConnected && walletProvider && contractAddr && address) {
      const ethersProvider = new ethers.BrowserProvider(walletProvider);
      ethersProvider.getSigner().then(signer => {
                const c = new ethers.Contract(contractAddr, MessengerAbi as any, signer);
        setContract(c);
        loadMessages(c, address);
        publishKey(c);
      });
    } else {
      setContract(null);
      setEvents([]);
      setActivePeer(null);
    }
  }, [isConnected, walletProvider, contractAddr, address]);

  useEffect(() => {
    if (!ENV_ADDRESS) {
      fetch(`${BACKEND_URL}/api/config`).then(r=>r.json()).then(d=> {
        if (d.contractAddress) setContractAddr(d.contractAddress);
      });
    }
  }, []);

  async function loadMessages(c: ethers.Contract, forAddress: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/held/${forAddress}`).then(r => r.json());
      const tokenIds: string[] = res.tokenIds || [];
      const newEvents: Msg[] = [];
      for (const id of tokenIds) {
        try {
          const meta = await c.getMetadata(id);
          const cid = meta[0];
          if (!cid) {
            console.warn(`Token ${id} has no CID, skipping.`);
            continue;
          }

          let sender = 'unknown';
          let recipient = 'unknown';
          try {
            const msgInfoRes = await fetch(`${BACKEND_URL}/api/msginfo/${id}`);
            if (msgInfoRes.ok) {
              const info = await msgInfoRes.json();
              sender = info.sender;
              recipient = info.recipient;
            } else if (msgInfoRes.status === 404) {
              console.log(`msginfo for token ${id} not found, using unknown sender/recipient`);
            } else {
              console.warn(`msginfo for token ${id} failed with status ${msgInfoRes.status}`);
            }
          } catch (e) {
            console.error(`msginfo fetch for token ${id} threw an error`, e);
          }

          newEvents.push({
            tokenId: id.toString(),
            cid,
            sender,
            recipient
          });

        } catch (err) {
          console.error(`Failed to process token ${id}:`, err);
        }
      }
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.tokenId));
        const merged = [...prev];
        newEvents.forEach((e) => { if (!seen.has(e.tokenId)) merged.push(e); });
        return merged;
      });
    } catch (e) { console.warn("held fetch failed", e); }
  }

  async function publishKey(contractInstance?: ethers.Contract) {
    const c = contractInstance || contract;
    if (!c || !address) return;
    try {
      const pubKey = await c.getPublicKey(address);
      if (pubKey && pubKey !== "0x" && pubKey !== "") {
        return; // Key already published
      }
      const key = await (walletProvider as any).send("eth_getEncryptionPublicKey", [address]);
      const tx = await c.publishKey(key.result);
      await tx.wait();
    } catch (error) {
      console.error("Failed to publish key:", error);
    }
  }

  async function sendMsg() {
    if (!walletProvider || !address || !recipient || !message) return;
    setIsSending(true);

    try {
        const resp = await fetch(`${BACKEND_URL}/api/encrypt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, recipients: [recipient] })
        }).then((r) => r.json());

        if (resp.error) {
            if (resp.error === "missing_pubkeys") {
                setToast({ message: "Recipient has not published their encryption key yet.", type: 'error' });
            } else {
                setToast({ message: `Error: ${resp.error}`, type: 'error' });
            }
            return;
        }

        const { cid, encKeys } = resp as { cid: string; encKeys: string[] };

        if (!contract) throw new Error("contract not ready");
        const tx = await contract.mintMessageNFT([recipient], cid, encKeys);
        const receipt = await tx.wait();
        const tokenIds: string[] = [];
        receipt?.logs?.forEach(log=>{
            try{
                const parsed = (contract.interface as any).parseLog(log);
                if(parsed?.name==="MessageMinted") tokenIds.push(parsed.args.tokenId.toString());
            }catch{}
        });
        if(tokenIds.length){
            await fetch(`${BACKEND_URL}/api/index`,{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({ tokenIds, sender: address, recipient })
            });
        }
        setToast({ message: "Message sent", type: 'success' });
        setMessage("");
    } catch (err: any) {
        alert(`Failed to send message: ${err.message}`);
    } finally {
        setIsSending(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  };

  const decryptMessage = useCallback(async (msg: Msg) => {
    if (!walletProvider || !address || !contract || msg.decrypted) return;
    try {
      let encKey = msg.encKey;
      if (!encKey) {
        const meta = await contract.getMetadata(msg.tokenId);
        encKey = meta[1];
      }
      if (!encKey) {
        setEvents(prev => prev.map(e => e.tokenId === msg.tokenId ? { ...e, decrypted: "[Key not found]" } : e));
        return;
      }

      const encJson = new TextDecoder().decode(ethers.getBytes(encKey));
                  const decryptResult: any = await (walletProvider as any).send("eth_decrypt", [encJson, address]);
      const symHex = decryptResult.result;
      const symBytes = ethers.getBytes("0x" + symHex);
      
      const ipfsRes = await fetch(`https://ipfs.io/ipfs/${msg.cid}`);
      if (!ipfsRes.ok) throw new Error(`IPFS fetch failed: ${ipfsRes.statusText}`);
      const ipfsJson = await ipfsRes.json();
      
      const iv = ethers.getBytes("0x" + ipfsJson.iv);
      const cipherBytes = ethers.getBytes("0x" + ipfsJson.ciphertext);
      
      const cryptoKey = await crypto.subtle.importKey("raw", symBytes, { name: "AES-GCM" }, false, ["decrypt"]);
      const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipherBytes);
      const plainText = new TextDecoder().decode(plainBuf);
      
      setEvents(prev => prev.map(e => e.tokenId === msg.tokenId ? { ...e, decrypted: plainText, encKey } : e));
    } catch (e: any) {
      console.error(`Failed to decrypt message ${msg.tokenId}:`, e);
      setEvents(prev => prev.map(e => e.tokenId === msg.tokenId ? { ...e, decrypted: "[Decryption failed]" } : e));
    }
  }, [walletProvider, address, contract]);



  const conversationPeers = Array.from(
    new Set(
      events.map((ev) => {
        if (!address) return "unknown";
        if (ev.sender && ev.sender.toLowerCase() === address.toLowerCase())
          return ev.recipient ? ev.recipient.toLowerCase() : "unknown";
        return ev.sender ? ev.sender.toLowerCase() : "unknown";
      })
    )
  );

  return (
    <div className="min-h-screen bg-primary-light text-text transition-colors duration-300 font-sans">
      <div className="fixed top-4 right-4 z-50">
        <button onClick={() => setThemeMenuOpen(!themeMenuOpen)} className="bg-secondary rounded-full p-3 shadow-lg hover:shadow-xl transition-all">
          <PaletteIcon className="h-5 w-5 text-white" />
        </button>
        {themeMenuOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-primary-light ring-1 ring-black ring-opacity-5 p-2 z-50 max-h-96 overflow-y-auto animate-fadeIn scrollbar-thin">
            <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-2">
              <h3 className="text-sm font-medium text-text/80">Select Theme</h3>
              <button onClick={() => setThemeMenuOpen(false)} className="text-text/50 hover:text-text">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {themes.map(theme => (
                <button key={theme.id} onClick={() => { setCurrentTheme(theme.id); setThemeMenuOpen(false); }} className={`w-full text-left px-3 py-2 text-sm rounded-md flex justify-between items-center ${currentTheme === theme.id ? 'bg-accent/20 text-accent' : 'hover:bg-white/10'}`}>
                  <span>{theme.name}</span>
                  {currentTheme === theme.id && <CheckIcon className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center p-3 bg-white/20 backdrop-blur-lg rounded-full shadow-lg mb-4">
            <MessageSquareIcon className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-4xl font-bold text-text mb-2 tracking-tight">
            NFT Messenger
          </h1>
          <p className="text-text/70">Secure, decentralized messaging on Monad</p>
        </div>

        {!isConnected ? (
          <div className="flex flex-col items-center justify-center py-12 animate-scaleIn">
            <div className="bg-primary bg-opacity-50 backdrop-blur-md rounded-2xl p-8 shadow-xl max-w-md w-full transform transition-all duration-500 hover:shadow-2xl">
              <div className="text-center">
                <div className="inline-flex items-center justify-center p-4 bg-accent/20 rounded-full mb-6">
                  <LogInIcon className="h-10 w-10 text-accent" />
                </div>
                <h2 className="text-2xl font-bold text-text mb-4">
                  Welcome to the Future of Messaging
                </h2>
                <p className="text-text/70 mb-8">
                  Connect your wallet to begin sending and receiving secure messages as NFTs.
                </p>
                                <button onClick={() => open()} className="bg-accent hover:bg-accent/90 text-white py-3 px-8 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center w-full">
                  <KeyIcon className="mr-2 h-5 w-5" />
                  <span>Connect Wallet</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-primary rounded-2xl shadow-2xl overflow-hidden flex" style={{ height: '70vh' }}>
            <div className="w-1/3 flex flex-col border-r border-white/10 bg-primary-light/50">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UsersIcon className="h-6 w-6 text-accent" />
                  <h2 className="font-bold text-xl">Conversations</h2>
                </div>
                <button onClick={() => {
                  setActivePeer('new');
                  setRecipient('');
                  setMessage('');
                }} className="p-2 rounded-full hover:bg-primary-light transition-colors duration-200" title="New Message">
                  <PlusCircleIcon className="h-6 w-6 text-accent" />
                </button>
              </div>
              <div className="flex-grow overflow-y-auto scrollbar-thin">
                {conversationPeers.map((peer) => (
                  <button
                    key={peer}
                    onClick={() => {
                      setActivePeer(peer);
                      if (peer !== 'unknown') {
                        setRecipient(peer);
                      } else {
                        setRecipient('');
                      }
                      setMessage('');
                    }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors duration-200 ${
                      activePeer === peer ? 'bg-accent/20' : 'hover:bg-primary-light'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${activePeer === peer ? 'bg-accent/30' : 'bg-primary-light/50'}`}>
                        <UserIcon className={`h-5 w-5 ${activePeer === peer ? 'text-accent' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-semibold">{peer === "unknown" ? "Unknown" : `${peer.slice(0, 6)}…${peer.slice(-4)}`}</p>
                        <p className="text-xs text-muted-foreground">Click to view messages</p>
                      </div>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
                  </button>
                ))}
              </div>
              <div className="p-4 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''}</p>
                    <p className="text-xs text-muted-foreground">Connected</p>
                  </div>
                  <button onClick={() => disconnect()} className="p-2 rounded-full hover:bg-primary-light transition-colors duration-200" title="Disconnect">
                    <LogOutIcon className="h-5 w-5 text-red-500"/>
                  </button>
                </div>
              </div>
            </div>

            <div className="w-2/3 flex flex-col bg-primary h-full">
              {(() => {
                if (activePeer === 'new') {
                  return (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="p-4 border-b border-white/10">
                        <h3 className="font-semibold text-lg">New Message</h3>
                      </div>
                      <div className="flex-grow p-4 space-y-4 flex flex-col">
                        <input
                          placeholder="Recipient address"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          className="bg-primary-light/50 w-full px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <textarea
                          placeholder="Your message..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="bg-primary-light/50 w-full px-4 py-3 rounded-xl text-sm focus:outline-none resize-none focus:ring-2 focus:ring-accent flex-grow"
                        />
                      </div>
                      <div className="p-4 border-t border-white/10 bg-primary-light/50">
                        <button onClick={sendMsg} disabled={isSending || !ethers.isAddress(recipient) || !message.trim()} className="w-full bg-accent p-3 rounded-xl text-accent-foreground hover:bg-accent/80 transition-colors duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
                          {isSending ? <RefreshCwIcon className="h-5 w-5 animate-spin" /> : <SendIcon className="h-5 w-5" />}
                          Send Message
                        </button>
                      </div>
                    </div>
                  );
                }

                if (activePeer) {
                  const filteredMessages = events
                    .filter((ev) =>
                      (ev.sender.toLowerCase() === address?.toLowerCase() && ev.recipient.toLowerCase() === activePeer.toLowerCase()) ||
                      (ev.recipient.toLowerCase() === address?.toLowerCase() && ev.sender.toLowerCase() === activePeer.toLowerCase())
                    )
                    .sort((a, b) => Number(a.tokenId) - Number(b.tokenId));

                  return (
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="p-4 border-b border-white/10 flex items-center space-x-3 bg-primary-light/30">
                        <div className="bg-accent/30 p-2 rounded-full"><UserIcon className="h-5 w-5 text-accent"/></div>
                        <h3 className="font-semibold text-lg">{activePeer === "unknown" ? "Unknown Conversation" : `${activePeer.slice(0, 6)}…${activePeer.slice(-4)}`}</h3>
                      </div>
                      <div className="flex-grow p-4 overflow-y-auto scrollbar-thin space-y-4">
                        {filteredMessages.map((msg) => (
                          <div key={msg.tokenId} className={`flex ${msg.sender.toLowerCase() === address?.toLowerCase() ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-md p-3 rounded-2xl ${msg.sender.toLowerCase() === address?.toLowerCase() ? 'bg-accent text-accent-foreground' : 'bg-primary-light'}`}>
                              {msg.decrypted ? (
                                <p className="text-sm whitespace-pre-wrap">{msg.decrypted}</p>
                              ) : (
                                <button onClick={() => decryptMessage(msg)} className="bg-accent/20 text-accent text-xs px-3 py-1 rounded-full hover:bg-accent/30 transition-colors duration-200 flex items-center gap-2">
                                  <LockIcon className="h-3 w-3"/>
                                  <span>Decrypt Message</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 border-t border-white/10 bg-primary-light/50">
                        <div className="bg-primary rounded-xl p-2 flex items-center gap-2">
                          <textarea
                            placeholder={`Message ${activePeer === "unknown" ? "Unknown" : `${activePeer.slice(0, 6)}…${activePeer.slice(-4)}`}`}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="bg-transparent w-full px-2 py-2 text-sm focus:outline-none resize-none"
                            rows={1}
                          />
                          <button onClick={sendMsg} disabled={isSending} className="bg-accent p-2 rounded-full text-accent-foreground hover:bg-accent/80 transition-colors duration-200 disabled:opacity-50">
                            {isSending ? <RefreshCwIcon className="h-5 w-5 animate-spin" /> : <SendIcon className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex-grow flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <MessageSquareIcon className="h-16 w-16 mx-auto text-muted-foreground/50"/>
                      <p className="mt-4 text-lg">Select a conversation or start a new one.</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-8 right-8 z-50 flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl text-white animate-toast-in ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckIcon className="h-6 w-6" /> : <XIcon className="h-6 w-6" />}
          <span className="text-lg font-semibold">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
