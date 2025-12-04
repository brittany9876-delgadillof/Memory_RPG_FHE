pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MemoryRPGFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    // Custom errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error InvalidState();
    error CooldownActive();
    error BatchClosed();
    error BatchFull();
    error InvalidBatch();
    error InvalidRequest();

    // Events
    event MemoryFragmentSubmitted(address indexed player, uint256 indexed memoryId, bytes32 indexed memoryCiphertext);
    event MemoryBatchOpened(uint256 indexed batchId, uint256 maxFragments);
    event MemoryBatchClosed(uint256 indexed batchId);
    event MemoryAggregationRequested(uint256 indexed batchId, uint256 requestId, bytes32 stateHash);
    event MemoryAggregationCompleted(uint256 indexed batchId, uint256 requestId, uint256 totalScore);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownUpdated(uint256 newCooldown);
    event BatchSizeUpdated(uint256 newBatchSize);

    // State
    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public maxBatchSize;
    uint256 public currentBatchId;
    uint256 public totalBatches;
    uint256 public modelVersion;

    mapping(address => bool) public providers;
    mapping(address => uint256) public lastSubmissionAt;
    mapping(address => uint256) public lastRequestAt;

    struct MemoryFragment {
        euint32 encryptedScore;
        euint32 encryptedClue;
        bool initialized;
    }

    struct MemoryBatch {
        uint256 id;
        uint256 fragmentCount;
        uint256 totalEncryptedScore;
        bool closed;
        mapping(uint256 => MemoryFragment) fragments;
    }

    struct DecryptionContext {
        uint256 batchId;
        uint256 modelVersion;
        bytes32 stateHash;
        bool processed;
    }

    mapping(uint256 => MemoryBatch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown(address caller, mapping(address => uint256) storage lastAction, string memory action) {
        if (block.timestamp < lastAction[caller] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastAction[caller] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        modelVersion = 1;
        cooldownSeconds = 60;
        maxBatchSize = 10;
        currentBatchId = 1;
        totalBatches = 0;
    }

    // Administrative functions
    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        require(newCooldown > 0, "Cooldown must be positive");
        cooldownSeconds = newCooldown;
        emit CooldownUpdated(newCooldown);
    }

    function setMaxBatchSize(uint256 newBatchSize) external onlyOwner {
        require(newBatchSize > 0, "Batch size must be positive");
        maxBatchSize = newBatchSize;
        emit BatchSizeUpdated(newBatchSize);
    }

    // Memory management functions
    function openMemoryBatch() external onlyOwner whenNotPaused {
        if (currentBatchId != 0 && !batches[currentBatchId].closed) {
            revert BatchOpen();
        }
        currentBatchId = totalBatches + 1;
        totalBatches++;
        batches[currentBatchId].id = currentBatchId;
        batches[currentBatchId].closed = false;
        emit MemoryBatchOpened(currentBatchId, maxBatchSize);
    }

    function closeMemoryBatch() external onlyOwner whenNotPaused {
        if (currentBatchId == 0 || batches[currentBatchId].closed) {
            revert InvalidBatch();
        }
        batches[currentBatchId].closed = true;
        emit MemoryBatchClosed(currentBatchId);
    }

    function submitMemoryFragment(
        address player,
        euint32 encryptedScore,
        euint32 encryptedClue
    ) external onlyProvider whenNotPaused checkCooldown(player, lastSubmissionAt, "submission") {
        if (currentBatchId == 0 || batches[currentBatchId].closed) {
            revert BatchClosed();
        }
        if (batches[currentBatchId].fragmentCount >= maxBatchSize) {
            revert BatchFull();
        }

        uint256 fragmentId = batches[currentBatchId].fragmentCount + 1;
        batches[currentBatchId].fragments[fragmentId] = MemoryFragment({
            encryptedScore: encryptedScore,
            encryptedClue: encryptedClue,
            initialized: true
        });
        batches[currentBatchId].fragmentCount = fragmentId;

        // Aggregate encrypted score
        euint32 currentTotal = batches[currentBatchId].totalEncryptedScore;
        if (!FHE.isInitialized(currentTotal)) {
            currentTotal = FHE.asEuint32(0);
        }
        batches[currentBatchId].totalEncryptedScore = FHE.add(currentTotal, encryptedScore);

        emit MemoryFragmentSubmitted(player, fragmentId, FHE.toBytes32(encryptedScore));
    }

    // FHE operations and decryption
    function requestMemoryAggregation() external onlyProvider whenNotPaused checkCooldown(msg.sender, lastRequestAt, "request") {
        if (currentBatchId == 0 || !batches[currentBatchId].closed) {
            revert InvalidBatch();
        }

        // Build ciphertext array for state binding
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(batches[currentBatchId].totalEncryptedScore);

        // Compute state hash and store context
        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.onMemoryAggregation.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            modelVersion: modelVersion,
            stateHash: stateHash,
            processed: false
        });

        emit MemoryAggregationRequested(currentBatchId, requestId, stateHash);
    }

    function onMemoryAggregation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) {
            revert InvalidRequest();
        }

        // Rebuild ciphertexts from storage
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(batches[decryptionContexts[requestId].batchId].totalEncryptedScore);

        // Verify state consistency
        bytes32 currHash = _hashCiphertexts(cts);
        if (currHash != decryptionContexts[requestId].stateHash) {
            revert InvalidState();
        }

        // Verify proof and decode cleartexts
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint256 totalScore = abi.decode(cleartexts, (uint256));

        // Update state and emit event
        decryptionContexts[requestId].processed = true;
        emit MemoryAggregationCompleted(decryptionContexts[requestId].batchId, requestId, totalScore);
    }

    // Internal helpers
    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal returns (euint32) {
        if (!FHE.isInitialized(x)) {
            x = FHE.asEuint32(0);
        }
        return x;
    }

    function _requireInitialized(euint32 x, string memory tag) internal pure {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked(tag, " not initialized")));
        }
    }
}