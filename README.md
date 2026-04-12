# 🌑 Shade

MEV-Resistant Intent-Based Agentic Swaps

Trade based on intent, not transactions..

## ✨ Overview

Shade is a privacy-first execution layer for DeFi that lets users submit encrypted trading intents instead of publicly visible transactions.

Instead of broadcasting swaps to the mempool, users define conditions like:

“Buy ETH below $1900”
“Sell my position when value exceeds $80k”

These intents are encrypted and stored on-chain, where they are evaluated using Fully Homomorphic Encryption (FHE). Trades are only executed when conditions are met — without revealing strategy, timing, or thresholds beforehand.

## 🚨 The Problem

DeFi today is fundamentally leaky.

Every transaction:

is publicly visible before execution
exposes user intent
can be front-run, sandwiched, or exploited

This leads to MEV (Maximal Extractable Value):

users lose value on trades
large orders get targeted
strategies cannot remain private

Even sophisticated users cannot avoid this — it’s a structural issue.

## 🛡️ The Solution

Shade removes pre-trade information leakage by introducing encrypted intent execution.

User intent is hidden until execution
Conditions are evaluated privately on-chain
Execution is validated and constrained
Orders are batched and netted to reduce exposure
Trades use existing liquidity like Uniswap

## 🧠 How It Works
Intent Creation
User describes trade in natural language
Local agent converts it into structured intent
Encryption
Sensitive fields (like price thresholds) are encrypted using Fhenix
On-Chain Storage
Encrypted intent is submitted to the Shade contract
No strategy or trigger is publicly visible
Private Condition Evaluation
Contract checks conditions (e.g. price ≤ threshold) using FHE
No decryption required
Execution
When conditions are met:
Executor batches and nets orders
Final trade is executed via Uniswap
Settlement
Users receive their fills
Execution is verified on-chain
#### 🔐 What’s Private
Entry/exit conditions
Strategy logic
Timing of execution
Trigger thresholds
#### 🌐 What’s Public
Final executed trade
Token pairs
Settlement results

## ⚡ Key Features
🧠 Intent-based trading (not tx-based)
🔐 Encrypted conditions using FHE
🛡️ Reduced MEV exposure
🔄 Batching + netting engine
🧱 Composable with existing DeFi
⚖️ Deterministic, verifiable execution

## 🧩 Architecture
### Client / Agent Layer
Parses user intent
Encrypts sensitive fields
### Fhenix Smart Contract
Stores encrypted data
Validates execution conditions
### Executor
Monitors valid orders
Batches & nets them
Triggers execution
Liquidity Layer
Trades executed via Uniswap

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ or **pnpm** 8+
- **Hardhat** for smart contract development
- Testnet funds (Base Sepolia)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/shade.git
   cd shade
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

### Compile Contracts

Compile the Solidity contracts to generate TypeChain types:

```bash
npx hardhat compile
```

This generates artifacts in `/artifacts` and types in `/typechain-types`.

### Run Tests

Run the test suite locally using Hardhat's test environment with Cofhe mocks:

```bash
npx hardhat test
```

**What the tests verify:**
- ✅ Creating encrypted intents with FHE
- ✅ Evaluating execution conditions privately
- ✅ Verifying contract state after evaluation

### Local Development

Start a local Hardhat network node:

```bash
npx hardhat node
```

In another terminal, deploy to localhost:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

### Deployment

#### Deploy to Base Sepolia Testnet

Ensure your `.env` file has:
```
BASE_SEPOLIA_RPC_URL=your_rpc_url
PRIVATE_KEY=your_private_key
```

Then deploy:

```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

#### Verify Deployed Contract

Check the status of a deployed contract:

```bash
node check_contract.js
```

### Frontend Development

Run the Next.js frontend locally:

```bash
cd shade-frontend
pnpm install
pnpm dev
```

Visit `http://localhost:3000` in your browser.

## 📚 Project Structure

```
shade/
├── contracts/          # Solidity smart contracts
│   └── ShadeIntent.sol # Main contract with FHE logic
├── scripts/            # Deployment scripts
│   └── deploy.ts       # Deploy to networks
├── test/               # Test suite
│   └── ShadeIntent.test.ts
├── shade-frontend/     # Next.js frontend
├── artifacts/          # Compiled contract ABI & bytecode
└── typechain-types/    # TypeScript contract types
```

## 🔧 Available Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `npx hardhat compile` | Compile Solidity contracts |
| `npx hardhat test` | Run test suite |
| `npx hardhat node` | Start local Hardhat network |
| `npx hardhat run scripts/deploy.ts --network localhost` | Deploy to local network |
| `npx hardhat run scripts/deploy.ts --network baseSepolia` | Deploy to Base Sepolia |
| `node check_contract.js` | Check deployed contract state |
| `cd shade-frontend && pnpm dev` | Start frontend dev server |

## 📝 Environment Variables

Create a `.env` file in the root directory:

```env
BASE_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your-infura-key
PRIVATE_KEY=0xyour_wallet_private_key
```

⚠️ **Never commit `.env` to version control!**

## 📖 Learn More

- [Hardhat Documentation](https://hardhat.org/getting-started/)
- [Cofhe SDK](https://github.com/fhenixprotocol/cofhe-sdk)
- [Fhenix Protocol](https://www.fhenix.io/)
- [Fully Homomorphic Encryption (FHE)](https://en.wikipedia.org/wiki/Homomorphic_encryption)
