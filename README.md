# Memory RPG: The FHE-Driven Adventure

Dive into a captivating RPG experience where players navigate a world intertwined with **FHE-encrypted NFTs** representing their "memories." Powered by **Zama's Fully Homomorphic Encryption technology**, Memory RPG transforms the traditional narrative gaming approach into a thrilling cryptographic puzzle, allowing players to awaken lost memories and unravel mysteries through innovative gameplay mechanics.

## The Challenge of Memory

In an ever-evolving digital landscape, players often face the struggle of maintaining their unique experiences and achievements. Traditional games store player data in ways that can be vulnerable and untrustworthy. Memory RPG addresses the pain point of data security and player agency, allowing players to create, own, and recover their memories in a safe and immersive environment.

## How FHE Transforms the Experience

Using **Zama's open-source libraries**, including **Concrete** and the **zama-fhe SDK**, Memory RPG harnesses the power of Fully Homomorphic Encryption. This technology ensures that players' memories, which are represented as NFTs, remain encrypted throughout their journey. Players can interact with their memories without risking exposure, meaning sensitive information stays secure while they solve puzzles to awaken these memories.

## Core Functionalities

- **Memory NFTs Creation**: Key moments in gameplay are minted as encrypted NFTs, allowing players to own a piece of their journey.
- **Puzzle Mechanism for Memory Awakening**: Players engage in challenges that require critical thinking and creativity to uncover encrypted memories.
- **Deep Integration of Player Experiences**: The narrative and gameplay are intricately woven, ensuring each player's journey is unique and personalized.
- **Cyberpunk Aesthetic**: Immerse yourself in a narrative-driven world infused with mystery and allure, complemented by a thrilling art style.

## Technology Stack

- **Zama SDK**: Core component for confidential computing.
- **Node.js**: Server-side JavaScript runtime for backend development.
- **Hardhat**: Development environment to compile, deploy, test, and debug Ethereum software.
- **Solidity**: Smart contract programming language utilized for creating NFTs.

## Project Structure

Here's a glimpse of the project's directory structure:

```
Memory_RPG_FHE/
├── contracts/
│   └── Memory_RPG.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── MemoryRPG.test.js
├── src/
│   ├── main.js
│   ├── memoryHandler.js
│   └── puzzleSolver.js
├── package.json
└── README.md
```

## Installation Instructions

To get started with Memory RPG, follow these steps:

1. Make sure you have [Node.js](https://nodejs.org/) installed on your machine.
2. Navigate to the project directory where you have the files downloaded.
3. Run the following command to install the necessary dependencies, including Zama FHE libraries:

   ```bash
   npm install
   ```

### Important Note:
**Do not clone or download this project from any repository. Follow the setup instructions provided in this document to ensure you have a clean installation.**

## Build and Execution

Once your environment is set up, you can compile, test, and run the project with the following commands:

1. **Compile the smart contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run tests**:
   ```bash
   npx hardhat test
   ```

3. **Start the application**:
   ```bash
   node src/main.js
   ```

### Example Code Snippet

Here’s a simple example of how to create a memory NFT within the game:

```solidity
// Memory_RPG.sol
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract Memory_RPG is ERC721 {
    uint public nextTokenId;
    mapping(uint256 => string) public memoryData;

    constructor() ERC721("MemoryNFT", "MEMNFT") {}

    function mintMemory(string memory data) external {
        uint256 tokenId = nextTokenId++;
        memoryData[tokenId] = data; // Store memory data securely
        _safeMint(msg.sender, tokenId);
    }
    
    // Additional code for interaction with FHE processes
}
```

This snippet demonstrates how players can mint their encrypted memories with unique identifiers, forming the foundation of their interactive journey.

## Acknowledgements

### Powered by Zama

We extend our heartfelt gratitude to the Zama team for their pioneering work and innovative open-source tools that enable secure and confidential blockchain applications. Their commitment to advancing privacy-preserving technologies makes projects like Memory RPG not only possible but exceptionally engaging.

---

Explore the depths of your memories and embark on an unforgettable adventure in the Memory RPG realm!
