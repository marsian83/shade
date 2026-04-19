"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { Encryptable, FheTypes } from "@cofhe/sdk";
import { getCofheClient } from "../lib/cofhe";
import { CONTRACT_ADDRESS, ABI, TUSDC_ADDRESS } from "../lib/contract";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";
const DEMO_MARKET_PRICE = 2600;
const ERC20_ABI = ["function balanceOf(address owner) view returns (uint256)"];
const ERC20_ABI_FULL = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

type TokenConfig = {
  symbol: string;
  name: string;
  address: string | null;
  decimals: number;
  icon: string;
  accentClass: string;
};

type IntentSide = "BUY" | "SELL" | "ENCRYPTED";
type IntentCondition = "idle" | "met" | "not-met" | "executed";

type IntentCard = {
  index: number;
  side: IntentSide;
  threshold: string;
  amount: string;
  sourceSymbol: string;
  targetSymbol: string;
  condition: IntentCondition;
  createdAt: string;
  txHash?: string;
  strategyId?: string;
};

type PriceLevel = {
  id: string;
  price: string;
  amount: string;
};

type ActivityItem = {
  kind: "created" | "executed";
  index: number;
  timestampLabel: string;
  txHash: string;
  description: string;
};

type PortfolioItem = {
  token: TokenConfig;
  balance: string;
  usdValue: string;
};

const ETH_TOKEN: TokenConfig = {
  symbol: "ETH",
  name: "Ethereum",
  address: null,
  decimals: 18,
  icon: "Ξ",
  accentClass: "from-token-indigo",
};

const USDC_TOKEN: TokenConfig = {
  symbol: "tUSDC",
  name: "Test USDC",
  address: TUSDC_ADDRESS,
  decimals: 6,
  icon: "$",
  accentClass: "from-token-green",
};

const WETH_TOKEN: TokenConfig = {
  symbol: "WETH",
  name: "Wrapped Ether",
  address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  decimals: 18,
  icon: "W",
  accentClass: "to-token-indigo",
};

const LINK_TOKEN: TokenConfig = {
  symbol: "LINK",
  name: "Chainlink",
  address: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
  decimals: 18,
  icon: "◆",
  accentClass: "from-token-blue",
};

const SWAP_TOKENS = [ETH_TOKEN, USDC_TOKEN, WETH_TOKEN, LINK_TOKEN];
const PORTFOLIO_TOKENS = [ETH_TOKEN, WETH_TOKEN, USDC_TOKEN, LINK_TOKEN];

function getInjectedProvider(): ethers.Eip1193Provider {
  const ethereum = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum;

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
    throw new Error("Please switch your wallet network to Sepolia to use COFHE testnet.");
  }

  const switched = await injected.request({ method: "eth_chainId" });
  if (switched !== SEPOLIA_CHAIN_HEX) {
    throw new Error(`Wallet is not connected to Sepolia (${SEPOLIA_CHAIN_ID}).`);
  }
}

function shortenAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatEth(balance: string) {
  const numeric = Number(balance);
  if (Number.isNaN(numeric)) {
    return "0.0000";
  }

  return numeric.toFixed(4);
}

function formatUnitsValue(raw: bigint, decimals: number) {
  const formatted = Number(ethers.formatUnits(raw, decimals));
  if (Number.isNaN(formatted)) {
    return "0.0000";
  }

  if (formatted >= 1000) {
    return formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return formatted.toFixed(4);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function estimateUsdValue(token: TokenConfig, balance: string) {
  const numericBalance = Number(balance.replace(/,/g, ""));
  if (Number.isNaN(numericBalance)) {
    return "$0.00";
  }

  if (token.symbol === "ETH" || token.symbol === "WETH") {
    return formatUsd(numericBalance * DEMO_MARKET_PRICE);
  }

  return formatUsd(numericBalance);
}

function getStorageKey(address: string) {
  return `shade:intents:${address.toLowerCase()}`;
}

function readStoredIntents(address: string): IntentCard[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(address));
    if (!raw) {
      return [];
    }

    return JSON.parse(raw) as IntentCard[];
  } catch {
    return [];
  }
}

function writeStoredIntents(address: string, intents: IntentCard[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getStorageKey(address), JSON.stringify(intents));
}

export default function Home() {
  const [threshold, setThreshold] = useState("");
  const [amount, setAmount] = useState("");
  const [isBuy, setIsBuy] = useState(true);
  const [status, setStatus] = useState("");
  const [executionResult, setExecutionResult] = useState("");
  const [swapResult, setSwapResult] = useState("");
  const [selectedIntentIndex, setSelectedIntentIndex] = useState<number | null>(null);
  const [intentCards, setIntentCards] = useState<IntentCard[]>([]);
  const [walletAddress, setWalletAddress] = useState("");
  const [ethBalance, setEthBalance] = useState("0.0000");
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isHydratingDashboard, setIsHydratingDashboard] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState<"from" | "to">("from");
  const [fromToken, setFromToken] = useState<TokenConfig>(USDC_TOKEN);
  const [toToken, setToToken] = useState<TokenConfig>(ETH_TOKEN);

  const [demoStep, setDemoStep] = useState(0);
  const [demoCtHash, setDemoCtHash] = useState("");
  const [demoDecrypted, setDemoDecrypted] = useState<string | null>(null);
  const [extraLevels, setExtraLevels] = useState<PriceLevel[]>([]);
  const [tokenSearchQuery, setTokenSearchQuery] = useState("");

  async function syncWalletState() {
    const provider = new ethers.BrowserProvider(getInjectedProvider());
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const balance = await provider.getBalance(address);

    setWalletAddress(address);
    setEthBalance(formatEth(ethers.formatEther(balance)));

    return { provider, signer, address };
  }

  async function loadPortfolio(provider: ethers.BrowserProvider, address: string) {
    const items = await Promise.all(
      PORTFOLIO_TOKENS.map(async (token) => {
        let formattedBalance = "0.0000";

        if (token.address === null) {
          const rawBalance = await provider.getBalance(address);
          formattedBalance = formatUnitsValue(rawBalance, token.decimals);
        } else {
          const erc20 = new ethers.Contract(token.address, ERC20_ABI, provider);
          const rawBalance = (await erc20.balanceOf(address)) as bigint;
          formattedBalance = formatUnitsValue(rawBalance, token.decimals);
        }

        return {
          token,
          balance: formattedBalance,
          usdValue: estimateUsdValue(token, formattedBalance),
        };
      }),
    );

    setPortfolio(items);
  }

  async function loadIntentHistory(provider: ethers.BrowserProvider, address: string) {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const stored = readStoredIntents(address);
    const storedMap = new Map(stored.map((intent) => [intent.index, intent]));

    const createdFilter = contract.filters.IntentCreated(address);
    const executedFilter = contract.filters.SwapExecuted(address);

    const [createdLogs, executedLogs] = await Promise.all([
      contract.queryFilter(createdFilter, 0, "latest"),
      contract.queryFilter(executedFilter, 0, "latest"),
    ]);

    const createdEventLogs = createdLogs.filter(
      (log): log is ethers.EventLog => "args" in log,
    );
    const executedEventLogs = executedLogs.filter(
      (log): log is ethers.EventLog => "args" in log,
    );

    const blockTimes = new Map<number, string>();
    const uniqueBlocks = [
      ...new Set([...createdEventLogs, ...executedEventLogs].map((log) => log.blockNumber)),
    ];

    await Promise.all(
      uniqueBlocks.map(async (blockNumber) => {
        const block = await provider.getBlock(blockNumber);
        const label = block
          ? new Date(block.timestamp * 1000).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : `Block ${blockNumber}`;
        blockTimes.set(blockNumber, label);
      }),
    );

    const cards = await Promise.all(
      createdEventLogs.map(async (log) => {
        const index = Number(log.args.index);
        const chainIntent = await contract.intents(index);
        const persisted = storedMap.get(index);

        return {
          index,
          side: persisted?.side ?? "ENCRYPTED",
          threshold: persisted?.threshold ?? "Encrypted",
          amount: persisted?.amount ?? "Encrypted",
          sourceSymbol: persisted?.sourceSymbol ?? "Hidden",
          targetSymbol: persisted?.targetSymbol ?? "Hidden",
          condition: chainIntent.executed ? "executed" : persisted?.condition ?? "idle",
          createdAt: blockTimes.get(log.blockNumber) ?? `Block ${log.blockNumber}`,
          txHash: log.transactionHash,
          strategyId: persisted?.strategyId,
        } satisfies IntentCard;
      }),
    );

    const nextCards = cards.sort((left, right) => right.index - left.index);
    setIntentCards(nextCards);

    if (nextCards.length > 0 && selectedIntentIndex === null) {
      const first = nextCards[0];
      setSelectedIntentIndex(first.index);
      if (first.side !== "ENCRYPTED") {
        setIsBuy(first.side === "BUY");
      }
    }

    writeStoredIntents(address, nextCards);

    const nextActivity = [
      ...createdEventLogs.map((log) => ({
        kind: "created" as const,
        index: Number(log.args.index),
        timestampLabel: blockTimes.get(log.blockNumber) ?? `Block ${log.blockNumber}`,
        txHash: log.transactionHash,
        description: `Intent #${Number(log.args.index)} created`,
      })),
      ...executedEventLogs.map((log) => ({
        kind: "executed" as const,
        index: Number(log.args.index),
        timestampLabel: blockTimes.get(log.blockNumber) ?? `Block ${log.blockNumber}`,
        txHash: log.transactionHash,
        description: `Intent #${Number(log.args.index)} executed`,
      })),
    ].sort((left, right) => right.index - left.index);

    setActivity(nextActivity.slice(0, 8));
  }

  async function refreshDashboard() {
    try {
      setIsHydratingDashboard(true);
      const { provider, address } = await syncWalletState();
      await Promise.all([loadPortfolio(provider, address), loadIntentHistory(provider, address)]);
    } finally {
      setIsHydratingDashboard(false);
    }
  }

  async function connectWallet() {
    try {
      setIsConnecting(true);
      await ensureSepoliaWallet();
      const injected = getInjectedProvider();
      await injected.request({ method: "eth_requestAccounts" });
      await refreshDashboard();
      setStatus("Wallet connected on Sepolia.");
    } catch (err) {
      console.error(err);
      setStatus("❌ Wallet connection failed");
    } finally {
      setIsConnecting(false);
    }
  }

  useEffect(() => {
    const ethereum = (window as Window & { ethereum?: ethers.Eip1193Provider }).ethereum;
    if (!ethereum) {
      return;
    }

    refreshDashboard().catch(() => undefined);

    const handleWalletChange = () => {
      refreshDashboard().catch(() => {
        setWalletAddress("");
        setEthBalance("0.0000");
        setPortfolio([]);
        setIntentCards([]);
        setActivity([]);
      });
    };

    const providerWithEvents = ethereum as ethers.Eip1193Provider & {
      on?: (event: string, listener: () => void) => void;
      removeListener?: (event: string, listener: () => void) => void;
    };

    providerWithEvents.on?.("accountsChanged", handleWalletChange);
    providerWithEvents.on?.("chainChanged", handleWalletChange);

    return () => {
      providerWithEvents.removeListener?.("accountsChanged", handleWalletChange);
      providerWithEvents.removeListener?.("chainChanged", handleWalletChange);
    };
  }, []);

  function persistIntentCards(nextCards: IntentCard[]) {
    setIntentCards(nextCards);
    if (walletAddress) {
      writeStoredIntents(walletAddress, nextCards);
    }
  }

  function updateIntent(index: number, updates: Partial<IntentCard>) {
    const nextCards = intentCards.map((intent) =>
      intent.index === index ? { ...intent, ...updates } : intent,
    );
    persistIntentCards(nextCards);
  }

  function openTokenModal(target: "from" | "to") {
    setModalTarget(target);
    setIsTokenModalOpen(true);
    setTokenSearchQuery("");
  }

  function selectToken(token: TokenConfig) {
    if (modalTarget === "from") {
      setFromToken(token);
      if (toToken.symbol === token.symbol) {
        const alternative = SWAP_TOKENS.find((item) => item.symbol !== token.symbol) ?? toToken;
        setToToken(alternative);
        setIsBuy(token.symbol === "USDC");
      } else {
        setIsBuy(token.symbol === "USDC");
      }
    } else {
      setToToken(token);
      if (fromToken.symbol === token.symbol) {
        const alternative = SWAP_TOKENS.find((item) => item.symbol !== token.symbol) ?? fromToken;
        setFromToken(alternative);
        setIsBuy(alternative.symbol === "USDC");
      } else {
        setIsBuy(fromToken.symbol === "USDC");
      }
    }

    setIsTokenModalOpen(false);
  }

  async function handleCheckExecution() {
    try {
      if (selectedIntentIndex === null) {
        setStatus("❌ Create and select an intent first");
        return;
      }

      setStatus("Encrypting current price...");
      setSwapResult("");
      setDemoStep(1);
      setDemoCtHash("");
      setDemoDecrypted(null);

      await ensureSepoliaWallet();
      const { signer } = await syncWalletState();
      const client = await getCofheClient(signer);
      const [encPrice] = await client.encryptInputs([Encryptable.uint64(BigInt(DEMO_MARKET_PRICE))]).execute();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      setStatus(`Submitting checkExecution for intent #${selectedIntentIndex}...`);
      setDemoStep(2);
      const tx = await contract.checkExecution(selectedIntentIndex, encPrice);
      await tx.wait();

      const selected = intentCards.find((intent) => intent.index === selectedIntentIndex);
      const isBuyIntent = selected?.side === "ENCRYPTED" ? isBuy : selected?.side !== "SELL";
      const ctHash: string = await contract.getExecutableHandle(selectedIntentIndex, isBuyIntent);
      setDemoCtHash(ctHash);

      setStatus("Requesting CoFHE threshold decryption...");
      setDemoStep(3);
      await client.permits.getOrCreateSelfPermit();

      const isExecutable = await client.decryptForView(ctHash, FheTypes.Bool).execute();
      setDemoStep(4);
      setDemoDecrypted(isExecutable ? "true (condition MET)" : "false (condition NOT met)");

      setStatus("✅ Execution checked!");
      setExecutionResult(
        isExecutable
          ? "✅ Condition MET — swap is eligible to execute"
          : "❌ Condition not met — threshold not reached yet",
      );
      updateIntent(selectedIntentIndex, { condition: isExecutable ? "met" : "not-met" });
    } catch (err) {
      console.error(err);
      setStatus("❌ Error checking execution");
      setDemoStep(0);
    }
  }

  async function handleExecuteSwap() {
    try {
      if (selectedIntentIndex === null) {
        setStatus("❌ Create and select an intent first");
        return;
      }

      setStatus("Executor: checking condition off-chain (free)...");
      setSwapResult("");

      await ensureSepoliaWallet();
      const { signer } = await syncWalletState();
      const client = await getCofheClient(signer);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const selected = intentCards.find((intent) => intent.index === selectedIntentIndex);
      const isBuyIntent = selected?.side === "ENCRYPTED" ? isBuy : selected?.side !== "SELL";
      const ctHash = await contract.getExecutableHandle(selectedIntentIndex, isBuyIntent);

      setStatus("Executor: decrypting condition...");

      const { decryptedValue, signature } = await client.decryptForTx(ctHash).withoutPermit().execute();
      const conditionMet = decryptedValue !== 0n;

      if (!conditionMet) {
        setStatus("⏸️ Condition not met — skipping transaction to save gas");
        setSwapResult("⏸️ Waiting... Will retry when condition is met (no gas wasted)");
        updateIntent(selectedIntentIndex, { condition: "not-met" });
        return;
      }

      setStatus("Executor: condition MET! Verifying on-chain & swapping...");

      const swapExecutedTopic = ethers.id("SwapExecuted(address,uint256,uint256,uint256)");
      const conditionVerifiedTopic = ethers.id("ConditionVerified(address,uint256,bool)");
      // Try combined executeSwap first
      try {
        const tx = await contract.executeSwap(selectedIntentIndex, ctHash, true, signature, { gasLimit: 800000 });
        const receipt = await tx.wait();

        const executedLog = receipt.logs.find((log: { topics: string[] }) => log.topics[0] === swapExecutedTopic);

        if (executedLog) {
          setStatus("✅ Swap executed on-chain!");
          updateIntent(selectedIntentIndex, { condition: "executed" });
          setSwapResult("🚀 Intent executed — tokens swapped on-chain, verified via CoFHE.");
          await refreshDashboard();
          return;
        }

        // Condition verified but no swap event — check for skip
        setStatus("✅ Transaction confirmed — check activity for details.");
        updateIntent(selectedIntentIndex, { condition: "executed" });
        await refreshDashboard();
        return;
      } catch (combinedErr) {
        console.warn("Combined executeSwap failed, trying split flow:", combinedErr);
      }

      // Fallback: split flow — verifyCondition then settleSwap
      setStatus("Executor: verifying condition on-chain (step 1/2)...");
      try {
        const verifyTx = await contract.verifyCondition(selectedIntentIndex, ctHash, true, signature, { gasLimit: 500000 });
        const verifyReceipt = await verifyTx.wait();
        const verifiedLog = verifyReceipt.logs.find((log: { topics: string[] }) => log.topics[0] === conditionVerifiedTopic);
        if (!verifiedLog) {
          setStatus("⏸️ Condition not met on-chain — swap skipped");
          setSwapResult("⏸️ The condition was not met on-chain. No gas wasted on swap.");
          return;
        }
      } catch (verifyErr) {
        console.error("verifyCondition failed:", verifyErr);
        setStatus("❌ FHE verification failed — CoFHE network may need more time. Try again shortly.");
        return;
      }

      setStatus("Executor: settling swap on Uniswap (step 2/2)...");
      try {
        const settleTx = await contract.settleSwap(selectedIntentIndex, { gasLimit: 500000 });
        const settleReceipt = await settleTx.wait();

        const executedLog = settleReceipt.logs.find((log: { topics: string[] }) => log.topics[0] === swapExecutedTopic);
        if (executedLog) {
          setStatus("✅ Swap executed on-chain!");
          updateIntent(selectedIntentIndex, { condition: "executed" });
          setSwapResult("🚀 Intent executed — tokens swapped on-chain, verified via CoFHE.");
        } else {
          setStatus("✅ Transaction confirmed");
          updateIntent(selectedIntentIndex, { condition: "executed" });
        }
        await refreshDashboard();
      } catch (settleErr) {
        console.error("settleSwap failed:", settleErr);
        setStatus("❌ Swap settlement failed — your deposit is safe. Try settling again.");
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

      const priceLevels = [
        { price: threshold, amount },
        ...extraLevels.filter((l) => l.price && l.amount),
      ];

      setStatus("Connecting wallet...");
      await ensureSepoliaWallet();
      const { signer, address } = await syncWalletState();
      const client = await getCofheClient(signer);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const strategyId = priceLevels.length > 1 ? crypto.randomUUID() : undefined;
      const createdIntents: IntentCard[] = [];
      const timestamp = new Date().toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      for (let i = 0; i < priceLevels.length; i++) {
        const level = priceLevels[i];
        setStatus(
          priceLevels.length > 1
            ? `Encrypting level ${i + 1}/${priceLevels.length} (threshold ${level.price})...`
            : "Encrypting intent parameters...",
        );

        const amountBigInt = BigInt(Math.round(parseFloat(level.amount) * 1e18));
        const [encThreshold, encAmount, encIsBuy] = await client
          .encryptInputs([
            Encryptable.uint64(BigInt(level.price)),
            Encryptable.uint64(amountBigInt),
            Encryptable.bool(isBuy),
          ])
          .execute();

        setStatus(
          priceLevels.length > 1
            ? `Creating ${isBuy ? "BUY" : "SELL"} intent ${i + 1}/${priceLevels.length}...`
            : `Creating ${isBuy ? "BUY" : "SELL"} intent (encrypted)...`,
        );

        // Determine if depositing ETH or USDC based on the source token
        const isDepositingETH = fromToken.symbol === "ETH" || fromToken.symbol === "WETH";
        let tx;

        if (isDepositingETH) {
          // Deposit ETH with the transaction
          const ethValue = ethers.parseEther(level.amount);
          tx = await contract.createIntent(encThreshold, encAmount, encIsBuy, true, 0, { value: ethValue });
        } else {
          // Deposit USDC: approve first, then call createIntent
          const usdcAmount = BigInt(Math.round(parseFloat(level.amount) * 1e6)); // USDC has 6 decimals
          const usdcAddress = USDC_TOKEN.address!;
          const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI_FULL, signer);

          setStatus(`Approving ${level.amount} USDC...`);
          const approveTx = await usdcContract.approve(CONTRACT_ADDRESS, usdcAmount);
          await approveTx.wait();

          tx = await contract.createIntent(encThreshold, encAmount, encIsBuy, false, usdcAmount);
        }
        await tx.wait();

        const count = await contract.getIntentCount();
        const newIndex = Number(count) - 1;
        createdIntents.push({
          index: newIndex,
          side: isBuy ? "BUY" : "SELL",
          threshold: level.price,
          amount: level.amount,
          sourceSymbol: fromToken.symbol,
          targetSymbol: toToken.symbol,
          condition: "idle",
          createdAt: timestamp,
          txHash: tx.hash,
          strategyId,
        });
      }

      const stored = readStoredIntents(address);
      const createdIndices = new Set(createdIntents.map((i) => i.index));
      const nextCards = [...createdIntents, ...stored.filter((i) => !createdIndices.has(i.index))];
      writeStoredIntents(address, nextCards);
      setSelectedIntentIndex(createdIntents[0].index);
      setIntentCards(nextCards);
      setExecutionResult("");
      setSwapResult("");
      setExtraLevels([]);

      setStatus(
        priceLevels.length > 1
          ? `✅ Strategy created — ${priceLevels.length} ${isBuy ? "BUY" : "SELL"} intents across different price levels, all encrypted on-chain.`
          : `✅ ${isBuy ? "BUY" : "SELL"} Intent #${createdIntents[0].index} Created — threshold, amount & direction are encrypted on-chain.`,
      );
      await refreshDashboard();
    } catch (err) {
      console.error(err);
      setStatus("❌ Error creating intent");
    }
  }

  const selectedIntent = intentCards.find((intent) => intent.index === selectedIntentIndex) ?? null;
  const priceInput = Number(threshold || 0);
  const amountInput = Number(amount || 0);
  const totalAmount = amountInput + extraLevels.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const priceImpact = priceInput > 0
    ? ((Math.abs(priceInput - DEMO_MARKET_PRICE) / DEMO_MARKET_PRICE) * 100).toFixed(2)
    : "0.00";
  const estimatedReceive = totalAmount > 0
    ? isBuy
      ? (totalAmount / DEMO_MARKET_PRICE).toFixed(6)
      : (totalAmount * DEMO_MARKET_PRICE).toFixed(2)
    : "0.00";
  const routeLabel = `${fromToken.symbol} → Shade private intent engine → ${toToken.symbol}`;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6 rounded-[32px] border border-white/60 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 rounded-[28px] bg-[linear-gradient(135deg,#0f172a_0%,#182848_45%,#264c63_100%)] p-5 text-white sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/60">Shade Wallet</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">A private wallet shell for intent-based trading.</h1>
                <p className="mt-2 max-w-xl text-sm text-white/70">
                  Real balances, on-chain intent history, a token selector, and a cleaner trading surface around the existing CoFHE flow.
                </p>
              </div>

              <button
                onClick={connectWallet}
                className="rounded-full border border-white/15 bg-white/12 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                {walletAddress ? shortenAddress(walletAddress) : isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">Network</p>
                <p className="mt-3 text-lg font-semibold">Sepolia</p>
                <p className="text-sm text-white/65">CoFHE-enabled environment</p>
              </div>
              <div className="rounded-[24px] bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">Wallet</p>
                <p className="mt-3 text-lg font-semibold">{walletAddress ? shortenAddress(walletAddress) : "Not connected"}</p>
                <p className="text-sm text-white/65">MetaMask signer</p>
              </div>
              <div className="rounded-[24px] bg-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">Dashboard</p>
                <p className="mt-3 text-lg font-semibold">{isHydratingDashboard ? "Syncing..." : `${intentCards.length} intents`}</p>
                <p className="text-sm text-white/65">History loaded from chain</p>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200/80 bg-[#fcfdff] p-4 shadow-[0_12px_40px_rgba(148,163,184,0.12)] sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Intent Composer</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">Build a private swap intent</h2>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {intentCards.length} intent{intentCards.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-5 inline-flex rounded-full bg-slate-100 p-1">
              <button
                onClick={() => {
                  setIsBuy(true);
                  setFromToken(USDC_TOKEN);
                  setToToken(ETH_TOKEN);
                }}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${isBuy ? "bg-[#151b2f] text-white shadow-sm" : "text-slate-600"}`}
              >
                Buy ETH
              </button>
              <button
                onClick={() => {
                  setIsBuy(false);
                  setFromToken(ETH_TOKEN);
                  setToToken(USDC_TOKEN);
                }}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${!isBuy ? "bg-[#151b2f] text-white shadow-sm" : "text-slate-600"}`}
              >
                Sell ETH
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-[28px] bg-slate-100/90 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">From</span>
                  <span className="text-xs text-slate-400">Balance: {portfolio.find((item) => item.token.symbol === fromToken.symbol)?.balance ?? "0.0000"}</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <input
                    placeholder="0.00"
                    className="w-full bg-transparent text-4xl font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <button
                    onClick={() => openTokenModal("from")}
                    className={`flex min-w-[126px] items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-white ${fromToken.accentClass}`}
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/18">{fromToken.icon}</span>
                    {fromToken.symbol}
                  </button>
                </div>
              </div>

              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
                ⇅
              </div>

              <div className="rounded-[28px] bg-slate-100/90 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">To</span>
                  <span className="text-xs text-slate-400">Balance: {portfolio.find((item) => item.token.symbol === toToken.symbol)?.balance ?? "0.0000"}</span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="text-4xl font-semibold text-slate-400">{estimatedReceive}</div>
                  <button
                    onClick={() => openTokenModal("to")}
                    className={`flex min-w-[126px] items-center gap-3 rounded-full px-4 py-3 text-sm font-semibold text-white ${toToken.accentClass}`}
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/18">{toToken.icon}</span>
                    {toToken.symbol}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="rounded-[24px] bg-slate-100/90 p-4">
                <span className="text-sm font-medium text-slate-500">Threshold price</span>
                <input
                  placeholder="1900"
                  className="mt-3 w-full bg-transparent text-2xl font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
                <span className="mt-2 block text-xs text-slate-400">Demo market reference: ${DEMO_MARKET_PRICE}</span>
              </label>

              <div className="rounded-[24px] bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-4">
                <span className="text-sm font-medium text-slate-500">Selected intent</span>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{selectedIntent ? `#${selectedIntent.index}` : "None"}</p>
                <p className="mt-2 text-sm text-slate-500">
                  {selectedIntent
                    ? `${selectedIntent.side} • ${selectedIntent.amount} ${selectedIntent.sourceSymbol} → ${selectedIntent.targetSymbol}`
                    : "Select an intent from the right-side book."}
                </p>
              </div>
            </div>

            {extraLevels.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Additional price levels</p>
                {extraLevels.map((level, idx) => (
                  <div key={level.id} className="rounded-[24px] bg-slate-100/90 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-500">
                        Level {idx + 2} — {isBuy ? "Buy when price ≤" : "Sell when price ≥"}
                      </span>
                      <button
                        onClick={() => setExtraLevels((prev) => prev.filter((l) => l.id !== level.id))}
                        className="text-xs font-medium text-rose-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <input
                        placeholder="Threshold price"
                        className="w-full rounded-[18px] bg-white px-4 py-3 text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                        value={level.price}
                        onChange={(e) =>
                          setExtraLevels((prev) =>
                            prev.map((l) => (l.id === level.id ? { ...l, price: e.target.value } : l)),
                          )
                        }
                      />
                      <input
                        placeholder="Amount"
                        className="w-full rounded-[18px] bg-white px-4 py-3 text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300"
                        value={level.amount}
                        onChange={(e) =>
                          setExtraLevels((prev) =>
                            prev.map((l) => (l.id === level.id ? { ...l, amount: e.target.value } : l)),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() =>
                  setExtraLevels((prev) => [...prev, { id: crypto.randomUUID(), price: "", amount: "" }])
                }
                className="rounded-full border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
              >
                + Add price level
              </button>
              {extraLevels.length > 0 && (
                <span className="text-xs text-slate-400">
                  {extraLevels.length + 1} levels — each creates a separate encrypted on-chain intent
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button
                onClick={handleCreateIntent}
                className="rounded-[22px] bg-[#111827] px-4 py-4 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(17,24,39,0.18)] transition hover:-translate-y-0.5"
              >
                Create Intent
              </button>
              <button
                onClick={handleCheckExecution}
                className="rounded-[22px] bg-[#eef2ff] px-4 py-4 text-sm font-semibold text-[#2b3f9f] transition hover:bg-[#e4eaff]"
              >
                Check Condition
              </button>
              <button
                onClick={handleExecuteSwap}
                className="rounded-[22px] bg-[#ddf9ec] px-4 py-4 text-sm font-semibold text-[#0f7b4e] transition hover:bg-[#cff6e4]"
              >
                Execute Swap
              </button>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Route Preview</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">{routeLabel}</p>
                <p className="mt-2 text-sm text-slate-500">Settlement route is UI-simulated for now; the contract still verifies privacy flow only.</p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Price Impact</p>
                <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                  <span>Threshold vs market</span>
                  <span className="font-semibold text-slate-900">{priceImpact}%</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                  <span>Estimated receive</span>
                  <span className="font-semibold text-slate-900">{estimatedReceive} {toToken.symbol}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">System Status</p>
              <p className="mt-2 text-sm font-medium text-slate-700">{status || "Waiting for action..."}</p>
              {executionResult ? <p className="mt-2 text-sm font-semibold text-[#2b3f9f]">{executionResult}</p> : null}
              {swapResult ? <p className="mt-2 text-sm font-semibold text-[#0f7b4e]">{swapResult}</p> : null}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[30px] border border-white/60 bg-white/85 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Portfolio</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Wallet asset breakdown</h2>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Live balances</div>
            </div>

            <div className="mt-4 grid gap-3">
              {portfolio.map((item) => (
                <div key={item.token.symbol} className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-white ${item.token.accentClass}`}>
                        {item.token.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{item.token.symbol}</p>
                        <p className="text-sm text-slate-500">{item.token.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{item.balance}</p>
                      <p className="text-sm text-slate-500">{item.usdValue}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/60 bg-white/85 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Intent Book</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Historical intents from chain</h2>
              </div>
              <span className="text-sm text-slate-500">{intentCards.length} total</span>
            </div>

            <div className="mt-4 space-y-3">
              {intentCards.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  No intents loaded yet. Connect your wallet and create one, or reload if your address already has history.
                </div>
              ) : (
                intentCards.map((intent) => {
                  const selected = intent.index === selectedIntentIndex;
                  const conditionClasses = {
                    idle: "bg-slate-100 text-slate-500",
                    met: "bg-emerald-100 text-emerald-700",
                    "not-met": "bg-amber-100 text-amber-700",
                    executed: "bg-sky-100 text-sky-700",
                  }[intent.condition];

                  return (
                    <button
                      key={intent.index}
                      onClick={() => {
                        setSelectedIntentIndex(intent.index);
                        if (intent.side !== "ENCRYPTED") {
                          setIsBuy(intent.side === "BUY");
                        }
                      }}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${selected ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_30px_rgba(15,23,42,0.18)]" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className={`text-xs uppercase tracking-[0.24em] ${selected ? "text-white/55" : "text-slate-400"}`}>
                              Intent #{intent.index}
                            </p>
                            {intent.strategyId && (
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? "bg-white/14 text-white/70" : "bg-indigo-100 text-indigo-600"}`}>
                                Strategy
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-lg font-semibold">{intent.side === "ENCRYPTED" ? "Encrypted Intent" : `${intent.side} ${intent.targetSymbol}`}</p>
                          <p className={`mt-1 text-sm ${selected ? "text-white/70" : "text-slate-500"}`}>
                            {intent.amount} {intent.sourceSymbol} → {intent.targetSymbol} • threshold {intent.threshold}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${selected ? "bg-white/14 text-white" : conditionClasses}`}>
                            {intent.condition}
                          </span>
                          <p className={`mt-2 text-xs ${selected ? "text-white/55" : "text-slate-400"}`}>{intent.createdAt}</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/60 bg-white/85 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Activity</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Recent transaction timeline</h2>
            </div>

            <div className="mt-4 space-y-3">
              {activity.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  No recent activity yet.
                </div>
              ) : (
                activity.map((item) => (
                  <div key={`${item.kind}-${item.txHash}`} className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.description}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.timestampLabel}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${item.kind === "executed" ? "text-emerald-600" : "text-slate-500"}`}>
                          {item.kind}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-400">{shortenAddress(item.txHash)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/60 bg-white/85 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">FHE Inspector</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Encrypted lifecycle</h2>
              <p className="mt-2 text-sm text-slate-500">Shows the private condition evaluation steps for the selected intent.</p>
            </div>

            <div className="mt-4 space-y-3">
              <div className={`rounded-[22px] border p-4 ${demoStep >= 1 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50 opacity-50"}`}>
                <p className="text-sm font-semibold text-slate-900">1. Read encrypted handle</p>
                <p className="mt-1 text-xs text-slate-500">Contract storage exposes only ciphertext metadata.</p>
              </div>

              <div className={`rounded-[22px] border p-4 ${demoStep >= 2 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50 opacity-50"}`}>
                <p className="text-sm font-semibold text-slate-900">2. On-chain bytes32</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-600">{demoCtHash || "Waiting for ciphertext handle..."}</p>
              </div>

              <div className={`rounded-[22px] border p-4 ${demoStep >= 3 ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50 opacity-50"}`}>
                <p className="text-sm font-semibold text-slate-900">3. Permit and threshold decrypt</p>
                <p className="mt-1 text-xs text-slate-500">Wallet permit authorizes CoFHE nodes to return only the boolean outcome.</p>
              </div>

              <div className={`rounded-[22px] border p-4 ${demoStep >= 4 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50 opacity-50"}`}>
                <p className="text-sm font-semibold text-slate-900">4. Plaintext result</p>
                <p className="mt-1 text-base font-semibold text-emerald-700">{demoDecrypted ? `executable = ${demoDecrypted}` : "No decrypted result yet"}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {isTokenModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Token Selector</p>
                <h3 className="mt-1 text-xl font-semibold text-slate-900">Choose {modalTarget} token</h3>
              </div>
              <button
                onClick={() => setIsTokenModalOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <input
                placeholder="Search tokens..."
                className="mb-3 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300"
                value={tokenSearchQuery}
                onChange={(e) => setTokenSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-3">
              {SWAP_TOKENS.filter(
                (token) =>
                  token.symbol.toLowerCase().includes(tokenSearchQuery.toLowerCase()) ||
                  token.name.toLowerCase().includes(tokenSearchQuery.toLowerCase()),
              ).map((token) => {
                const balance = portfolio.find((item) => item.token.symbol === token.symbol)?.balance ?? "0.0000";

                return (
                  <button
                    key={token.symbol}
                    onClick={() => selectToken(token)}
                    className="flex w-full items-center justify-between rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-white ${token.accentClass}`}>
                        {token.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{token.symbol}</p>
                        <p className="text-sm text-slate-500">{token.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-900">{balance}</p>
                      <p className="text-sm text-slate-500">Sepolia wallet balance</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-slate-500">
              The selector drives the wallet-style trading surface. Contract settlement is still demo-only until live token transfer support is added.
            </p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
