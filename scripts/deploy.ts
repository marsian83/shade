import { ethers } from "hardhat";

async function main() {
  // 1. Deploy TestUSDC
  const TUSDC = await ethers.getContractFactory("TestUSDC");
  const tusdc = await TUSDC.deploy();
  await tusdc.waitForDeployment();
  const tusdcAddr = await tusdc.getAddress();
  console.log("💰 TestUSDC deployed to:", tusdcAddr);

  // 2. Deploy ShadeIntent with TestUSDC address
  const Shade = await ethers.getContractFactory("ShadeIntent");
  const shade = await Shade.deploy(tusdcAddr);
  await shade.waitForDeployment();
  const shadeAddr = await shade.getAddress();
  console.log("🚀 ShadeIntent deployed to:", shadeAddr);

  // 3. Mint 1,000,000 tUSDC to ShadeIntent as swap reserves
  const mintAmount = 1_000_000n * 10n ** 6n; // 1M tUSDC (6 decimals)
  const mintTx = await tusdc.mint(shadeAddr, mintAmount);
  await mintTx.wait();
  console.log("🏦 Minted 1,000,000 tUSDC to ShadeIntent contract");

  // 4. Also mint some tUSDC to deployer for testing sell intents
  const [deployer] = await ethers.getSigners();
  const deployerMint = 10_000n * 10n ** 6n; // 10K tUSDC
  const deployerMintTx = await tusdc.mint(deployer.address, deployerMint);
  await deployerMintTx.wait();
  console.log("🧪 Minted 10,000 tUSDC to deployer:", deployer.address);

  console.log("\n📋 Summary:");
  console.log("   TestUSDC:", tusdcAddr);
  console.log("   ShadeIntent:", shadeAddr);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
