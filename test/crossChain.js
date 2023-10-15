const { expect } = require("chai");
const assert = require("assert");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("CrossChainBridge contract", function () {
  async function setupFixture() {
    const CrossChainBridge = await ethers.getContractFactory(
      "CrossChainBridge"
    );
    const [deployer, user1, user2] = await ethers.getSigners();
    const bridge = await CrossChainBridge.deploy();

    await bridge.deployed();

    return { CrossChainBridge, bridge, deployer, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { bridge, deployer } = await loadFixture(setupFixture);
      expect(await bridge.owner()).to.equal(deployer.address);
    });
  });

  describe("Setters", function () {
    it("Should allow the owner to set the ratio", async function () {
      const { bridge, deployer } = await loadFixture(setupFixture);
      await bridge.setRatio(60);
      expect(await bridge.ratio()).to.equal(60);
    });

    it("Should not allow non-owner to set the ratio", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);
      await expect(bridge.connect(user1).setRatio(100)).to.be.revertedWith(
        "Not the messenger or owner"
      );
    });

    it("Should allow the owner to set the gas price", async function () {
      const { bridge, deployer } = await loadFixture(setupFixture);
      await bridge.setGasPrice(200);
      expect(await bridge.gasPrice()).to.equal(200);
    });

    it("Should not allow non-owner to set the gas price", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);
      await expect(bridge.connect(user1).setGasPrice(200)).to.be.revertedWith(
        "Not the messenger or owner"
      );
    });

    it("Should allow the owner to set fees percentage", async function () {
      const { bridge, deployer } = await loadFixture(setupFixture);
      await bridge.setFeesPercentage(500); // e.g., setting it to 5% (500/10000)
      expect(await bridge.feesPercentage()).to.equal(500);
    });

    it("Should not allow setting fees percentage above 100%", async function () {
      const { bridge, deployer } = await loadFixture(setupFixture);
      await expect(bridge.setFeesPercentage(11000)).to.be.revertedWith(
        "Invalid percentage"
      );
    });

    it("Should not allow non-owner to set fees percentage", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);
      await expect(
        bridge.connect(user1).setFeesPercentage(500)
      ).to.be.revertedWith("Not the contract owner");
    });
  });

  describe("CrossChainTransferIn", function () {
    it("Should handle cross-chain transfer for native tokens correctly", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);

      const amount = ethers.utils.parseEther("1"); // 1 ether

      const expectedFee = await bridge.getFees(
        ethers.constants.AddressZero,
        amount
      );

      const initialUser1Balance = await ethers.provider.getBalance(
        user1.address
      );

      const tx = await bridge.connect(user1).crossChainTransferIn(
        12345, // arbitrary chainId for this test
        ethers.constants.AddressZero,
        amount,
        {
          value: amount,
        }
      );

      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed;
      const txCost = gasUsed.mul(tx.gasPrice);

      const finalUser1Balance = await ethers.provider.getBalance(user1.address);

      // Ensure the correct amount of ether was used (amount + transaction fees)
      assert.equal(
        initialUser1Balance.sub(finalUser1Balance).toString(),
        amount.add(txCost).toString()
      );

      // Check the event to ensure it was emitted with correct values
      expect(
        await bridge.queryFilter(bridge.filters.CrossChainTransferIn())
      ).to.lengthOf(1);
      const event = (
        await bridge.queryFilter(bridge.filters.CrossChainTransferIn())
      )[0];
      assert.equal(event.args.chainId, 12345);
      assert.equal(event.args.walletAddress, user1.address);
      assert.equal(event.args.tokenAddress, ethers.constants.AddressZero);
      assert.equal(event.args.amount.toString(), amount.toString());
      assert.equal(event.args.fees.toString(), expectedFee.toString());
    });
  });

  describe("CrossChainTransferOut", function () {
    it("Should handle cross-chain transfer out for native tokens correctly", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);

      const amount = ethers.utils.parseEther("1"); // 1 ether

      // Initially, deposit funds to the bridge so it has funds to transfer out
      await bridge.deposit(ethers.constants.AddressZero, amount, {
        value: amount,
      });

      const initialBridgeBalance = await ethers.provider.getBalance(
        bridge.address
      );
      const initialUser1Balance = await ethers.provider.getBalance(
        user1.address
      );

      const originTxHash = ethers.utils.keccak256("0x1234"); // Arbitrary hash for testing
      const originChainId = 12345; // Arbitrary chainId for this test

      await bridge.crossChainTransferOut(
        originTxHash,
        originChainId,
        ethers.constants.AddressZero,
        user1.address, // change recipient to user1
        amount
      );

      const finalBridgeBalance = await ethers.provider.getBalance(
        bridge.address
      );
      const finalUser1Balance = await ethers.provider.getBalance(user1.address);

      // Validate balances after the operation
      assert.equal(
        initialBridgeBalance.sub(finalBridgeBalance).toString(),
        amount.toString()
      );

      assert.equal(
        finalUser1Balance.sub(initialUser1Balance).toString(),
        amount.toString()
      );

      // Check the event to ensure it was emitted with correct values
      expect(
        await bridge.queryFilter(bridge.filters.CrossChainTransferOut())
      ).to.lengthOf(1);
      const event = (
        await bridge.queryFilter(bridge.filters.CrossChainTransferOut())
      )[0];
      assert.equal(event.args.originTxHash, originTxHash);
      assert.equal(event.args.originChainId, originChainId);
      assert.equal(event.args.walletAddress, user1.address); // checking for user1
      assert.equal(event.args.tokenAddress, ethers.constants.AddressZero);
      assert.equal(event.args.amount.toString(), amount.toString());
    });
  });

  describe("GetFees", function () {
    it("Should correctly compute the fee for native tokens", async function () {
      const { bridge } = await loadFixture(setupFixture);

      const amount = ethers.utils.parseEther("1"); // 1 ether

      const feesPercentage = await bridge.feesPercentage();
      const gasPrice = await bridge.gasPrice();

      const expectedFee = amount
        .mul(feesPercentage)
        .div(10000)
        .add(gasPrice.mul(21000));

      const computedFee = await bridge.getFees(
        ethers.constants.AddressZero,
        amount
      );
      expect(computedFee).to.equal(expectedFee);
    });

    it("Should correctly compute the fee for ERC20 tokens", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);

      // Assuming user1's address is used as the ERC20 token's address for this test
      const tokenAddress = user1.address;

      const amount = ethers.utils.parseUnits("1000", 18); // Assuming 18 decimals for the ERC20 token

      const feesPercentage = await bridge.feesPercentage();
      const gasPrice = await bridge.gasPrice();

      const expectedFee = amount
        .mul(feesPercentage)
        .div(10000)
        .add(gasPrice.mul(80000));

      const computedFee = await bridge.getFees(tokenAddress, amount);
      expect(computedFee).to.equal(expectedFee);
    });
  });

  describe("Deposit and Withdraw", function () {
    it("Should allow users to deposit native token", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);
      const initialUser1Balance = await ethers.provider.getBalance(
        user1.address
      );
      const initialBridgeBalance = await ethers.provider.getBalance(
        bridge.address
      );

      const depositTx = await bridge
        .connect(user1)
        .deposit(ethers.constants.AddressZero, ethers.utils.parseEther("1"), {
          value: ethers.utils.parseEther("1"), // specify the amount of Ether to send
        });

      const receipt = await depositTx.wait();
      const gasUsed = receipt.gasUsed;
      const txCost = gasUsed.mul(depositTx.gasPrice);

      const finalUser1Balance = await ethers.provider.getBalance(user1.address);
      const finalBridgeBalance = await ethers.provider.getBalance(
        bridge.address
      );

      const expectedUser1BalanceDifference = ethers.utils
        .parseEther("1")
        .add(txCost);

      // Now compare balances using simpler assertions.
      assert.equal(
        initialUser1Balance.sub(finalUser1Balance).toString(),
        expectedUser1BalanceDifference.toString()
      );
      assert.equal(
        finalBridgeBalance.sub(initialBridgeBalance).toString(),
        ethers.utils.parseEther("1").toString()
      );
    });

    it("Should allow users to withdraw native token", async function () {
      const { bridge, user1 } = await loadFixture(setupFixture);

      // First, let's deposit some ether to the bridge from user1's account to set up the scenario
      await bridge
        .connect(user1)
        .deposit(ethers.constants.AddressZero, ethers.utils.parseEther("2"), {
          value: ethers.utils.parseEther("2"),
        });

      const initialUser1Balance = await ethers.provider.getBalance(
        user1.address
      );
      const initialBridgeBalance = await ethers.provider.getBalance(
        bridge.address
      );

      const withdrawTx = await bridge
        .connect(user1)
        .withdraw(ethers.constants.AddressZero, ethers.utils.parseEther("1"));

      const receipt = await withdrawTx.wait();
      const gasUsed = receipt.gasUsed;
      const txCost = gasUsed.mul(withdrawTx.gasPrice);

      const finalUser1Balance = await ethers.provider.getBalance(user1.address);
      const finalBridgeBalance = await ethers.provider.getBalance(
        bridge.address
      );

      // Adjusting for the transaction cost and withdrawn amount
      const expectedUser1BalanceDifference = ethers.utils
        .parseEther("1")
        .sub(txCost);

      assert.equal(
        finalUser1Balance.sub(initialUser1Balance).toString(),
        expectedUser1BalanceDifference.toString()
      );
      assert.equal(
        initialBridgeBalance.sub(finalBridgeBalance).toString(),
        ethers.utils.parseEther("1").toString()
      );
    });
  });

  // Continue with more tests...
});
