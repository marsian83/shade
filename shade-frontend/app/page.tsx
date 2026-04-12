"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { getCofheClient } from "../lib/cofhe";
import { CONTRACT_ADDRESS, ABI } from "../lib/contract";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";

function getInjectedProvider(): ethers.Eip1193Provider {
  const ethereum = (window as Window & { ethereum?: ethers.Eip1193Provider })
    .ethereum;

  if (!ethereum) {
    throw new Error("No injected wallet found. Please install MetaMask.");
  }

  return ethereum;
}

async function ensureSepoliaWallet(): Promise<void> {
  const injected = getInjectedProvider();
  const current = await injected.request({ method: "eth_chainId" });

  if (current === SEPOLIA_CHAIN_HEX) {
    return;
  }

  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_HEX }],
    });
  } catch {
    throw new Error(
      "Please switch your wallet network to Sepolia to use COFHE testnet.",
    );
  }

  const switched = await injected.request({ method: "eth_chainId" });
  if (switched !== SEPOLIA_CHAIN_HEX) {
    throw new Error(`Wallet is not connected to Sepolia (${SEPOLIA_CHAIN_ID}).`);
  }
}

export default function Home() {
  const [threshold, setThreshold] = useState("");
  const [amount, setAmount] = useState("");
  const [isBuy, setIsBuy] = useState(true); // ✅ NEW: Toggle between BUY/SELL
  const [status, setStatus] = useState("");
  const [executionResult, setExecutionResult] = useState("");
  const [swapResult, setSwapResult] = useState("");

  // 🔬 Demo transparency state — auto-fills during Check Execution
  const [demoStep, setDemoStep] = useState(0); // 0=idle 1=tx 2=on-chain 3=decrypting 4=done
  const [demoCtHash, setDemoCtHash] = useState("");
  const [demoDecrypted, setDemoDecrypted] = useState<string | null>(null);

  async function handleCheckExecution() {
    try {
      setStatus("Encrypting current price...");
      setSwapResult("");
      // reset demo panel
      setDemoStep(1);
      setDemoCtHash("");
      setDemoDecrypted(null);

      await ensureSepoliaWallet();
      const provider = new ethers.BrowserProvider(getInjectedProvider());
      const signer = await provider.getSigner();

      const client = await getCofheClient(signer);

      const [encPrice] = await client
        .encryptInputs([Encryptable.uint64(2600n)])
        .execute();

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      setStatus("Submitting checkExecution transaction...");
      setDemoStep(2);
      const tx = await contract.checkExecution(0, encPrice);
      await tx.wait();

      // 🔬 Step 2: show what's on-chain — the raw encrypted handle
      const ctHash: string = await contract.getExecutableHandle(0, isBuy);
      setDemoCtHash(ctHash);

      setStatus("Requesting CoFHE threshold decryption...");
      setDemoStep(3);

      // Create permit once per account so we can decrypt FHE values
      await client.permits.getOrCreateSelfPermit();

      // Decrypt locally — never leaves the client
      const isExecutable = await client
        .decryptForView(ctHash, FheTypes.Bool)
        .execute();

      // 🔬 Step 4: reveal the plaintext result
      setDemoStep(4);
      setDemoDecrypted(isExecutable ? "true (condition MET)" : "false (condition NOT met)");

      setStatus("✅ Execution checked!");
      setExecutionResult(
        isExecutable
          ? "✅ Condition MET — swap is eligible to execute"
          : "❌ Condition not met — threshold not reached yet"
      );
    } catch (err) {
      console.error(err);
      setStatus("❌ Error checking execution");
      setDemoStep(0);
    }
  }

  // Simulates what the executor bot does: decryptForTx → executeSwap on-chain
  async function handleExecuteSwap() {
    try {
      setStatus("Executor: checking condition off-chain (free)...");
      setSwapResult("");

      await ensureSepoliaWallet();
      const provider = new ethers.BrowserProvider(getInjectedProvider());
      const signer = await provider.getSigner();

      const client = await getCofheClient(signer);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      // Fetch the encrypted handle for the correct condition (buy or sell)
      const ctHash = await contract.getExecutableHandle(0, isBuy);

      setStatus("Executor: decrypting condition...");

      // decryptForTx → gets a CoFHE-signed (value, signature) for on-chain publishing
      // Follows: https://cofhe-docs.fhenix.zone/client-sdk/guides/decrypt-to-tx
      const { decryptedValue, signature } = await client
        .decryptForTx(ctHash)
        .withoutPermit()
        .execute();

      // decryptedValue is a bigint: 0n = false, 1n = true for ebool
      const conditionMet = decryptedValue !== 0n;

      if (!conditionMet) {
        setStatus("⏸️ Condition not met — skipping transaction to save gas");
        setSwapResult("⏸️ Waiting... Will retry when condition is met (no gas wasted)");
        return;
      }

      setStatus("Executor: condition MET! Sending executeSwap...");

      // Follows: https://cofhe-docs.fhenix.zone/client-sdk/guides/writing-decrypt-result
      // Pass ctHash, plaintext (bool), and signature exactly as returned by decryptForTx
      const tx = await contract.executeSwap(
        0,              // index
        ctHash,         // ebool ctHash (bytes32) — same handle used for decryptForTx
        true,           // plaintext (bool) — we already checked conditionMet above
        signature,      // Threshold Network signature
        { gasLimit: 500000 }
      );
      const receipt = await tx.wait();

      const swapExecutedTopic = ethers.id("SwapExecuted(address,uint256)");
      const executedLog = receipt.logs.find(
        (l: { topics: string[] }) => l.topics[0] === swapExecutedTopic
      );

      setStatus("✅ executeSwap tx confirmed!");
      if (executedLog) {
        setSwapResult(
          isBuy
            ? "🚀 BUY Intent Executed — condition verified on-chain via CoFHE! 💰"
            : "🚀 SELL Intent Executed — condition verified on-chain via CoFHE! 💰"
        );
      } else {
        setSwapResult("⚠️ Unexpected state — check Etherscan");
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Error executing swap");
    }
  }

  async function handleCreateIntent() {
    try {
      if (!threshold || !amount) {
        setStatus("❌ Error: Please fill in Threshold Price and Amount");
        return;
      }

      setStatus("Connecting wallet...");

      await ensureSepoliaWallet();
      const provider = new ethers.BrowserProvider(getInjectedProvider());
      const signer = await provider.getSigner();

      setStatus("Encrypting intent parameters...");

      const client = await getCofheClient(signer);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const amountBigInt = BigInt(Math.round(parseFloat(amount) * 1e18));

      const [encThreshold, encAmount, encIsBuy] = await client
        .encryptInputs([
          Encryptable.uint64(BigInt(threshold)),
          Encryptable.uint64(amountBigInt),
          Encryptable.bool(isBuy),
        ])
        .execute();

      setStatus(`Creating ${isBuy ? 'BUY' : 'SELL'} intent (encrypted)...`);

      const tx = await contract.createIntent(
        encThreshold,
        encAmount,
        encIsBuy
      );
      await tx.wait();

      setStatus(`✅ ${isBuy ? 'BUY' : 'SELL'} Intent Created — threshold, amount & direction are all encrypted on-chain!`);
    } catch (err) {
      console.error(err);
      setStatus("❌ Error creating intent");
    }
  }

  return (
    <main className="p-10 space-y-6">
      <h1 className="text-3xl font-bold">Shade</h1>

      {/* ── BUY / SELL Selector ── */}
      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setIsBuy(true)}
          className={`px-6 py-2 rounded font-semibold transition ${
            isBuy
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          💙 BUY (ETH → USDC)
        </button>
        <button
          onClick={() => setIsBuy(false)}
          className={`px-6 py-2 rounded font-semibold transition ${
            !isBuy
              ? "bg-green-600 text-white"
              : "bg-gray-200 text-gray-800 hover:bg-gray-300"
          }`}
        >
          💚 SELL (USDC → ETH)
        </button>
      </div>

      <input
        placeholder="Threshold Price (e.g. 1900)"
        className="border p-2"
        onChange={(e) => setThreshold(e.target.value)}
      />

      <input
        placeholder="Amount (e.g. 1000)"
        className="border p-2"
        onChange={(e) => setAmount(e.target.value)}
      />

      <button
        onClick={handleCreateIntent}
        className={`${
          isBuy ? "bg-blue-600" : "bg-green-600"
        } text-white px-4 py-2 rounded font-semibold`}
      >
        Create {isBuy ? "BUY" : "SELL"} Intent
      </button>
      <button
        onClick={handleCheckExecution}
        className="bg-blue-500 text-white px-4 py-2 rounded font-semibold"
      >
        Check Execution (User)
      </button>
      <button
        onClick={handleExecuteSwap}
        className="bg-green-600 text-white px-4 py-2 rounded font-semibold"
      >
        Execute Swap (Executor Bot)
      </button>
      <p>{status}</p>
      <p className="text-blue-700 font-semibold">{executionResult}</p>
      <p className="text-green-700 font-bold text-lg">{swapResult}</p>

      {/* ── 🔬 DEMO TRANSPARENCY PANEL ── */}
      <div className="mt-10 border-2 border-dashed border-gray-400 p-6 rounded-lg space-y-4 bg-gray-50">
        <h2 className="text-xl font-bold text-gray-700">🔬 FHE Decryption — Live (auto-updates on Check Execution)</h2>
        <p className="text-sm text-gray-500">
          This panel fills in automatically when you click Check Execution above.
          Shows what is on-chain (encrypted) vs what only you can decrypt.
        </p>

        {/* Step 1 — Encrypting */}
        <div className={`p-3 rounded border ${demoStep >= 1 ? "border-yellow-400 bg-yellow-50" : "border-gray-200 opacity-40"}`}>
          <p className="font-semibold text-yellow-700">Step 1 — Reading on-chain ciphertext</p>
          <p className="text-xs text-gray-500">Fetching the encrypted boolean handle from contract storage</p>
          {demoStep >= 1 && <p className="text-yellow-600 text-sm mt-1">✓ fetching...</p>}
        </div>

        {/* Step 2 — Show raw on-chain hash */}
        <div className={`p-3 rounded border ${demoStep >= 2 ? "border-red-400 bg-red-50" : "border-gray-200 opacity-40"}`}>
          <p className="font-semibold text-red-700">Step 2 — What the world sees on-chain (bytes32)</p>
          <p className="text-xs text-gray-500">This is all anyone can read on Etherscan. Looks like random data.</p>
          {demoCtHash ? (
            <p className="font-mono text-xs text-red-800 break-all mt-2 bg-red-100 p-2 rounded">
              {demoCtHash}
            </p>
          ) : demoStep >= 2 ? (
            <p className="text-red-500 text-sm mt-1">loading...</p>
          ) : null}
        </div>

        {/* Step 3 — Permit + CoFHE threshold decrypt */}
        <div className={`p-3 rounded border ${demoStep >= 3 ? "border-blue-400 bg-blue-50" : "border-gray-200 opacity-40"}`}>
          <p className="font-semibold text-blue-700">Step 3 — CoFHE threshold decryption (wallet permit)</p>
          <p className="text-xs text-gray-500">
            Your wallet signs a permit. CoFHE nodes verify you have FHE.allow permission,
            then threshold-decrypt and return the result encrypted to your sealing key only.
          </p>
          {demoStep >= 3 && demoDecrypted === null && <p className="text-blue-500 text-sm mt-1">⏳ waiting for CoFHE network...</p>}
          {demoStep >= 3 && demoDecrypted !== null && <p className="text-blue-600 text-sm mt-1">✓ decrypted</p>}
        </div>

        {/* Step 4 — Reveal */}
        <div className={`p-3 rounded border-2 ${demoStep >= 4 ? "border-green-500 bg-green-50" : "border-gray-200 opacity-40"}`}>
          <p className="font-semibold text-green-700">Step 4 — Plaintext result (only you can see this)</p>
          <p className="text-xs text-gray-500">
            The threshold price, amount, and direction are still encrypted forever.
            Only this boolean was decrypted.
          </p>
          {demoDecrypted !== null && (
            <p className="font-mono text-2xl font-bold text-green-800 mt-2">
              executable = {demoDecrypted}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
