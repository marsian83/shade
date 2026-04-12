import { ethers } from "hardhat";

async function main() {
  const Shade = await ethers.getContractFactory("ShadeIntent");
  const shade = await Shade.deploy();

  await shade.waitForDeployment();

  console.log("🚀 Shade deployed to:", await shade.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
