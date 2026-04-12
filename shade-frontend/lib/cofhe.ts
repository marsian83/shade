import { createCofheClient, createCofheConfig } from "@cofhe/sdk/web";
import { Ethers6Adapter } from "@cofhe/sdk/adapters";
import { sepolia } from "@cofhe/sdk/chains";
import type { AbstractSigner, BrowserProvider } from "ethers";

export async function getCofheClient(signer: AbstractSigner) {
  const config = createCofheConfig({
    supportedChains: [sepolia],
  });

  const ethersProvider = signer.provider as BrowserProvider | null;
  if (!ethersProvider) {
    throw new Error("Signer provider is required to initialize CoFHE client");
  }

  const client = createCofheClient(config);

  // Pass the ethers Provider and Signer (not the raw EIP-1193 provider)
  const { publicClient, walletClient } = await Ethers6Adapter(ethersProvider, signer);

  await client.connect(publicClient, walletClient);

  return client;
}
