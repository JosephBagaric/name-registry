import { expect } from "chai";
import { BigNumber } from "ethers";
import hre, { ethers } from "hardhat";
import { NameRegistry__factory } from "../typechain/factories/NameRegistry__factory";
import { NameRegistry } from "../typechain/NameRegistry";

const getRandomSecret = (): string => {
  const random = new Uint8Array(32);
  return (
    "0x" +
    Array.from(random)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
};

const fastForwardTimeOneYear = async () => {
  await hre.network.provider.send("evm_increaseTime", [366 * 24 * 60 * 60]); // Increase time by 366 days
  await hre.network.provider.send("evm_mine");
};

describe("NameRegistry", () => {
  let nameRegistry: NameRegistry;

  const registerName = async (name: string): Promise<{ cost: BigNumber }> => {
    const secret = getRandomSecret();
    const [commitment, cost] = await nameRegistry.generateCommitment(
      name,
      secret
    );

    const commitTx = await nameRegistry.commit(commitment);
    await commitTx.wait();

    const registerTx = await nameRegistry.register(name, secret, {
      value: cost,
    });
    await registerTx.wait();

    return { cost };
  };

  beforeEach(async () => {
    const NameRegistry: NameRegistry__factory = await ethers.getContractFactory(
      "NameRegistry"
    );
    nameRegistry = await NameRegistry.deploy();
    await nameRegistry.deployed();
  });

  it("should register a name", async () => {
    const name = "advanced";
    const [owner] = await ethers.getSigners();

    await registerName(name);

    const registration = await nameRegistry.registrations(name);

    expect(registration.owner).to.equal(owner.address);
    expect(registration.expires.toNumber()).to.be.greaterThan(
      Math.floor(Date.now() / 1000)
    );
  });

  it("should be able to renew", async () => {
    const name = "advanced";
    const [owner] = await ethers.getSigners();

    const { cost } = await registerName(name);

    const oldRegistration = await nameRegistry.registrations(name);

    const renewTx = await nameRegistry.renew(name, {
      value: cost,
    });
    await renewTx.wait();

    const renewedRegistration = await nameRegistry.registrations(name);

    expect(oldRegistration.owner).to.equal(owner.address);
    expect(renewedRegistration.owner).to.equal(owner.address);

    expect(oldRegistration.expires.lt(renewedRegistration.expires));
  });

  it("should not be able to renew after expiry", async () => {
    const name = "advanced";
    const { cost } = await registerName(name);

    await fastForwardTimeOneYear();

    let failed = false;

    try {
      await nameRegistry.renew(name, {
        value: cost,
      });
    } catch (e) {
      failed = true;
    }

    expect(failed);
  });

  it("should not be able to withdraw until expires", async () => {
    const name = "advanced";
    const { cost } = await registerName(name);

    let failed = false;

    try {
      await nameRegistry.withdraw(cost);
    } catch (e) {
      failed = true;
    }

    expect(failed);
  });

  it("should be able to withdraw after expiry", async () => {
    const name = "advanced";
    const { cost } = await registerName(name);

    await fastForwardTimeOneYear();

    const withdrawTx = await nameRegistry.withdraw(cost);
    const receipt = await withdrawTx.wait();

    expect(receipt.status === 0);
  });
});
