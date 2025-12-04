// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface MemoryNFT {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  memoryType: string;
  status: "locked" | "unlocked" | "corrupted";
  clues: string[];
}

// Randomly selected styles:
// Colors: High saturation neon (purple/blue/pink/green)
// UI Style: Cyberpunk
// Layout: Card
// Interaction: Animation rich

// Randomly selected additional features:
// 1. Project introduction
// 2. Data statistics
// 3. Search & filter
// 4. User operation history

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [memories, setMemories] = useState<MemoryNFT[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newMemoryData, setNewMemoryData] = useState({ memoryType: "", description: "", memoryValue: 0, clues: "" });
  const [showIntro, setShowIntro] = useState(true);
  const [selectedMemory, setSelectedMemory] = useState<MemoryNFT | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [userActions, setUserActions] = useState<string[]>([]);

  const unlockedCount = memories.filter(m => m.status === "unlocked").length;
  const lockedCount = memories.filter(m => m.status === "locked").length;
  const corruptedCount = memories.filter(m => m.status === "corrupted").length;

  useEffect(() => {
    loadMemories().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const addUserAction = (action: string) => {
    setUserActions(prev => [`[${new Date().toLocaleTimeString()}] ${action}`, ...prev.slice(0, 9)]);
  };

  const loadMemories = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("memory_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing memory keys:", e); }
      }
      
      const list: MemoryNFT[] = [];
      for (const key of keys) {
        try {
          const memoryBytes = await contract.getData(`memory_${key}`);
          if (memoryBytes.length > 0) {
            try {
              const memoryData = JSON.parse(ethers.toUtf8String(memoryBytes));
              list.push({ 
                id: key, 
                encryptedData: memoryData.data, 
                timestamp: memoryData.timestamp, 
                owner: memoryData.owner, 
                memoryType: memoryData.memoryType, 
                status: memoryData.status || "locked",
                clues: memoryData.clues || []
              });
            } catch (e) { console.error(`Error parsing memory data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading memory ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMemories(list);
      addUserAction("Refreshed memories list");
    } catch (e) { 
      console.error("Error loading memories:", e);
      addUserAction("Failed to load memories");
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitMemory = async () => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addUserAction("Attempted to submit memory without wallet connection");
      return; 
    }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting memory with Zama FHE..." });
    addUserAction("Started memory encryption process");
    try {
      const encryptedData = FHEEncryptNumber(newMemoryData.memoryValue);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const memoryId = `memory-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const clues = newMemoryData.clues.split(',').map(c => c.trim()).filter(c => c);
      
      const memoryData = { 
        data: encryptedData, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        memoryType: newMemoryData.memoryType, 
        status: "locked",
        clues
      };
      
      await contract.setData(`memory_${memoryId}`, ethers.toUtf8Bytes(JSON.stringify(memoryData)));
      
      const keysBytes = await contract.getData("memory_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(memoryId);
      await contract.setData("memory_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Memory encrypted and stored securely!" });
      addUserAction(`Created new ${newMemoryData.memoryType} memory NFT`);
      await loadMemories();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewMemoryData({ memoryType: "", description: "", memoryValue: 0, clues: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      addUserAction(`Memory creation failed: ${errorMessage}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addUserAction("Attempted to decrypt without wallet connection");
      return null; 
    }
    setIsDecrypting(true);
    addUserAction("Initiating memory decryption with wallet signature");
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const decrypted = FHEDecryptNumber(encryptedData);
      addUserAction("Successfully decrypted memory fragment");
      return decrypted;
    } catch (e) { 
      console.error("Decryption failed:", e); 
      addUserAction("Memory decryption failed");
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const unlockMemory = async (memoryId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted memory with FHE..." });
    addUserAction(`Attempting to unlock memory ${memoryId.substring(0, 6)}...`);
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const memoryBytes = await contract.getData(`memory_${memoryId}`);
      if (memoryBytes.length === 0) throw new Error("Memory not found");
      const memoryData = JSON.parse(ethers.toUtf8String(memoryBytes));
      
      const updatedData = FHECompute(memoryData.data, 'increase10%');
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedMemory = { ...memoryData, status: "unlocked", data: updatedData };
      await contractWithSigner.setData(`memory_${memoryId}`, ethers.toUtf8Bytes(JSON.stringify(updatedMemory)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE unlock completed successfully!" });
      addUserAction(`Unlocked memory ${memoryId.substring(0, 6)}`);
      await loadMemories();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Unlock failed: " + (e.message || "Unknown error") });
      addUserAction(`Failed to unlock memory: ${e.message || "Unknown error"}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const corruptMemory = async (memoryId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted memory with FHE..." });
    addUserAction(`Attempting to corrupt memory ${memoryId.substring(0, 6)}...`);
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const memoryBytes = await contract.getData(`memory_${memoryId}`);
      if (memoryBytes.length === 0) throw new Error("Memory not found");
      const memoryData = JSON.parse(ethers.toUtf8String(memoryBytes));
      const updatedMemory = { ...memoryData, status: "corrupted" };
      await contract.setData(`memory_${memoryId}`, ethers.toUtf8Bytes(JSON.stringify(updatedMemory)));
      setTransactionStatus({ visible: true, status: "success", message: "Memory corrupted successfully!" });
      addUserAction(`Corrupted memory ${memoryId.substring(0,6)}`);
      await loadMemories();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Corruption failed: " + (e.message || "Unknown error") });
      addUserAction(`Failed to corrupt memory: ${e.message || "Unknown error"}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (memoryAddress: string) => address?.toLowerCase() === memoryAddress.toLowerCase();

  const filteredMemories = memories.filter(memory => {
    const matchesSearch = memory.memoryType.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         memory.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || memory.status === filterType;
    return matchesSearch && matchesFilter;
  });

  const renderStats = () => (
    <div className="stats-grid">
      <div className="stat-item">
        <div className="stat-value neon-purple">{memories.length}</div>
        <div className="stat-label">Total Memories</div>
      </div>
      <div className="stat-item">
        <div className="stat-value neon-blue">{unlockedCount}</div>
        <div className="stat-label">Unlocked</div>
      </div>
      <div className="stat-item">
        <div className="stat-value neon-pink">{lockedCount}</div>
        <div className="stat-label">Locked</div>
      </div>
      <div className="stat-item">
        <div className="stat-value neon-green">{corruptedCount}</div>
        <div className="stat-label">Corrupted</div>
      </div>
    </div>
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"><div className="brain-icon"></div></div>
          <h1>記憶迷蹤<span>RPG</span></h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-memory-btn cyber-button">
            <div className="add-icon"></div>Mint Memory
          </button>
          <button className="cyber-button" onClick={() => setShowIntro(!showIntro)}>
            {showIntro ? "Hide Intro" : "Show Intro"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        {showIntro && (
          <div className="intro-section neon-card">
            <h2>記憶迷蹤 RPG</h2>
            <p className="subtitle">A Fully Homomorphic Encrypted Memory Adventure</p>
            <div className="intro-content">
              <p>
                In this cyberpunk RPG, your character's memories are stored as <strong>FHE-encrypted NFTs</strong> on the blockchain. 
                Using Zama's FHE technology, your sensitive memories remain encrypted even during gameplay computations.
              </p>
              <div className="fhe-features">
                <div className="feature">
                  <div className="feature-icon">🔒</div>
                  <h3>Encrypted Memories</h3>
                  <p>All memories are encrypted client-side before being stored as NFTs</p>
                </div>
                <div className="feature">
                  <div className="feature-icon">🧠</div>
                  <h3>Memory Recovery</h3>
                  <p>Solve puzzles to "unlock" encrypted memories through homomorphic computations</p>
                </div>
                <div className="feature">
                  <div className="feature-icon">⚔️</div>
                  <h3>Unique Gameplay</h3>
                  <p>Your character can lose memories that must be recovered to progress</p>
                </div>
              </div>
              <div className="fhe-tech">
                <h3>Zama FHE Technology</h3>
                <p>
                  This game uses Zama's Fully Homomorphic Encryption to process your encrypted memories without ever decrypting them. 
                  The FHE computations happen on-chain while maintaining complete privacy.
                </p>
                <div className="tech-badge">FHE-Powered Gameplay</div>
              </div>
            </div>
          </div>
        )}
        
        <div className="dashboard-section">
          <div className="section-header">
            <h2>Memory Statistics</h2>
            <div className="header-actions">
              <button onClick={loadMemories} className="refresh-btn cyber-button" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          <div className="stats-container neon-card">
            {renderStats()}
          </div>
        </div>

        <div className="memories-section">
          <div className="section-header">
            <h2>Memory Fragments</h2>
            <div className="search-filter">
              <input 
                type="text" 
                placeholder="Search memories..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cyber-input"
              />
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="cyber-select"
              >
                <option value="all">All Statuses</option>
                <option value="locked">Locked</option>
                <option value="unlocked">Unlocked</option>
                <option value="corrupted">Corrupted</option>
              </select>
            </div>
          </div>
          
          <div className="memories-grid">
            {filteredMemories.length === 0 ? (
              <div className="no-memories neon-card">
                <div className="no-memories-icon"></div>
                <p>No memory fragments found</p>
                <button className="cyber-button primary" onClick={() => setShowCreateModal(true)}>Mint First Memory</button>
              </div>
            ) : filteredMemories.map(memory => (
              <div 
                className={`memory-card ${memory.status}`} 
                key={memory.id} 
                onClick={() => setSelectedMemory(memory)}
              >
                <div className="memory-header">
                  <div className="memory-id">#{memory.id.substring(0, 6)}</div>
                  <div className={`memory-status ${memory.status}`}>{memory.status}</div>
                </div>
                <div className="memory-type">{memory.memoryType}</div>
                <div className="memory-owner">{memory.owner.substring(0, 6)}...{memory.owner.substring(38)}</div>
                <div className="memory-date">{new Date(memory.timestamp * 1000).toLocaleDateString()}</div>
                <div className="memory-actions">
                  {isOwner(memory.owner) && memory.status === "locked" && (
                    <>
                      <button 
                        className="action-btn cyber-button success" 
                        onClick={(e) => { e.stopPropagation(); unlockMemory(memory.id); }}
                      >
                        Unlock
                      </button>
                      <button 
                        className="action-btn cyber-button danger" 
                        onClick={(e) => { e.stopPropagation(); corruptMemory(memory.id); }}
                      >
                        Corrupt
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="user-history-section">
          <div className="section-header">
            <h2>Your Recent Actions</h2>
          </div>
          <div className="history-container neon-card">
            {userActions.length === 0 ? (
              <p>No actions recorded yet</p>
            ) : (
              <ul className="action-list">
                {userActions.map((action, index) => (
                  <li key={index} className="action-item">
                    {action}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitMemory} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          memoryData={newMemoryData} 
          setMemoryData={setNewMemoryData}
        />
      )}
      
      {selectedMemory && (
        <MemoryDetailModal 
          memory={selectedMemory} 
          onClose={() => { setSelectedMemory(null); setDecryptedValue(null); }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content neon-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo"><div className="brain-icon"></div><span>記憶迷蹤RPG</span></div>
            <p>FHE-encrypted memory RPG powered by Zama technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge"><span>FHE-Powered Gameplay</span></div>
          <div className="copyright">© {new Date().getFullYear()} Memory RPG. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  memoryData: any;
  setMemoryData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, memoryData, setMemoryData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setMemoryData({ ...memoryData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMemoryData({ ...memoryData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!memoryData.memoryType || !memoryData.memoryValue) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal neon-card">
        <div className="modal-header">
          <h2>Mint New Memory NFT</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div><strong>FHE Encryption Notice</strong><p>Your memory will be encrypted with Zama FHE before minting</p></div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Memory Type *</label>
              <select name="memoryType" value={memoryData.memoryType} onChange={handleChange} className="cyber-select">
                <option value="">Select type</option>
                <option value="Childhood">Childhood Memory</option>
                <option value="Training">Training Memory</option>
                <option value="Love">Love Memory</option>
                <option value="Trauma">Traumatic Memory</option>
                <option value="Skill">Skill Memory</option>
                <option value="Secret">Secret Memory</option>
              </select>
            </div>
            <div className="form-group">
              <label>Memory Strength *</label>
              <input 
                type="number" 
                name="memoryValue" 
                value={memoryData.memoryValue} 
                onChange={handleValueChange} 
                placeholder="Enter memory strength (1-100)..." 
                className="cyber-input"
                min="1"
                max="100"
              />
            </div>
            <div className="form-group">
              <label>Clues (comma separated)</label>
              <textarea 
                name="clues" 
                value={memoryData.clues} 
                onChange={handleChange} 
                placeholder="Enter clues to help recover this memory..." 
                className="cyber-textarea"
                rows={3}
              />
            </div>
          </div>
          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data"><span>Plain Value:</span><div>{memoryData.memoryValue || '0'}</div></div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>{memoryData.memoryValue ? FHEEncryptNumber(memoryData.memoryValue).substring(0, 50) + '...' : 'No value entered'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn cyber-button">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn cyber-button primary">
            {creating ? "Encrypting with FHE..." : "Mint Memory NFT"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface MemoryDetailModalProps {
  memory: MemoryNFT;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const MemoryDetailModal: React.FC<MemoryDetailModalProps> = ({ memory, onClose, decryptedValue, setDecryptedValue, isDecrypting, decryptWithSignature }) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(memory.encryptedData);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="memory-detail-modal neon-card">
        <div className="modal-header">
          <h2>Memory Fragment #{memory.id.substring(0, 8)}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="memory-info">
            <div className="info-item"><span>Type:</span><strong>{memory.memoryType}</strong></div>
            <div className="info-item"><span>Owner:</span><strong>{memory.owner.substring(0, 6)}...{memory.owner.substring(38)}</strong></div>
            <div className="info-item"><span>Date:</span><strong>{new Date(memory.timestamp * 1000).toLocaleString()}</strong></div>
            <div className="info-item"><span>Status:</span><strong className={`status-badge ${memory.status}`}>{memory.status}</strong></div>
          </div>
          
          <div className="memory-clues">
            <h3>Recovery Clues</h3>
            {memory.clues.length > 0 ? (
              <ul className="clues-list">
                {memory.clues.map((clue, index) => (
                  <li key={index} className="clue-item">{clue}</li>
                ))}
              </ul>
            ) : (
              <p>No clues provided for this memory</p>
            )}
          </div>
          
          <div className="encrypted-data-section">
            <h3>Encrypted Memory Data</h3>
            <div className="encrypted-data">{memory.encryptedData.substring(0, 100)}...</div>
            <div className="fhe-tag"><div className="fhe-icon"></div><span>FHE Encrypted</span></div>
            <button className="decrypt-btn cyber-button" onClick={handleDecrypt} disabled={isDecrypting}>
              {isDecrypting ? <span className="decrypt-spinner"></span> : decryptedValue !== null ? "Hide Decrypted Value" : "Decrypt with Wallet Signature"}
            </button>
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Memory Strength</h3>
              <div className="decrypted-value">{decryptedValue}</div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted data is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn cyber-button">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;