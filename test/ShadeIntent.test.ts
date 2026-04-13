import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { Encryptable } from "@cofhe/sdk";
import { expect } from "chai";
import hre from "hardhat";

describe("ShadeIntent", function () {
  const TASK_COFHE_MOCKS_DEPLOY = "task:cofhe-mocks:deploy";

  async function deployFixture() {
    await hre.run(TASK_COFHE_MOCKS_DEPLOY);

    const [owner] = await hre.ethers.getSigners();

    const Shade = await hre.ethers.getContractFactory("ShadeIntent");
    const shade = await Shade.deploy();
    await shade.waitForDeployment();

    const client = await hre.cofhe.createClientWithBatteries(owner);

    return { shade, owner, client };
  }

  it("should create encrypted intent and evaluate condition", async function () {
    const { shade, client } = await loadFixture(deployFixture);

    const [encThreshold, encAmount, encIsBuy] = await client
      .encryptInputs([
        Encryptable.uint64(1900n),
        Encryptable.uint64(1n),
        Encryptable.bool(true),
      ])
      .execute();

    await shade.createIntent(encThreshold, encAmount, encIsBuy);

    const [encCurrentPrice] = await client
      .encryptInputs([Encryptable.uint64(1800n)])
      .execute();

    await shade.checkExecution(0, encCurrentPrice);

    const intent = await shade.intents(0);
    const isExecutable = await hre.cofhe.mocks.getPlaintext(intent.executable);

    expect(Number(isExecutable)).to.equal(1);
  });
});
