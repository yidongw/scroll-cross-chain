import { ethers } from "ethers";
import "dotenv/config";
import CrossChainBridge from "./CrossChainBridge.json";

const ALCHEMY_SCROLL_URL = "https://sepolia-rpc.scroll.io/";

const scrollProvider = new ethers.JsonRpcProvider(ALCHEMY_SCROLL_URL);
const sepProvider = new ethers.JsonRpcProvider(
  "https://eth-sepolia.g.alchemy.com/v2/Fnaj_O1Nd_eWSGJ4ah9_dSduk3-Zx_Kf"
);

const SEPOLIA_START_BLOCK = 4495825;

const SCROLL_START_BLOCK = 1618057;

const scrollWalllet = new ethers.Wallet(
  process.env.PRIVATE_KEY || "",
  scrollProvider
);

const scrollWallet = new ethers.Wallet(
  process.env.PRIVATE_KEY || "",
  sepProvider
);

async function main() {
  const scrollPoolAddress = "0xc8ee279faa4f410cb3b290cfd4c14b5d6d5f5bea";

  const sepPoolAddress = "0x389f07fb896a487d042378485c50270d2d793b1e";

  const contractScrollPool = new ethers.Contract(
    scrollPoolAddress,
    CrossChainBridge.abi,
    scrollWalllet
  );

  const contractScrollPool2 = new ethers.Contract(
    scrollPoolAddress,
    CrossChainBridge.abi,
    scrollProvider
  );

  const contractSeplPool = new ethers.Contract(
    sepPoolAddress,
    CrossChainBridge.abi,
    scrollWallet
  );

  const contractSepSockets = new ethers.Contract(
    sepPoolAddress,
    CrossChainBridge.abi,
    new ethers.WebSocketProvider(
      "wss://eth-sepolia.g.alchemy.com/v2/Fnaj_O1Nd_eWSGJ4ah9_dSduk3-Zx_Kf"
    )
  );

  // eth from scroll to sepolia

  contractScrollPool2.on(
    "CrossChainTransferIn",
    async (chainId, walletAddress, _tokenAddress, amount, _fees, event) => {
      console.log(
        "scroll in:",
        event.log.transactionHash,
        chainId,
        ethers.ZeroAddress,
        walletAddress,
        amount
      );
      try {
        const tx = await contractSeplPool.crossChainTransferOut(
          event.log.transactionHash,
          chainId,
          ethers.ZeroAddress,
          walletAddress,
          amount
        );
        await tx.wait();
        console.log(`cross transfer success ${tx.hash}`);
      } catch (error) {
        console.log("🚀 ~ file: scroll-sepolia.ts:77 ~ error:", error);
      }
    }
  );

  // eth from sepolia to scroll
  contractSepSockets.on(
    "CrossChainTransferIn",
    async (chainId, walletAddress, _tokenAddress, amount, _fees, event) => {
      console.log(
        "sepolia in:",
        event.log.transactionHash,
        chainId,
        ethers.ZeroAddress,
        walletAddress,
        amount
      );
      try {
        const tx = await contractScrollPool.crossChainTransferOut(
          event.log.transactionHash,
          chainId,
          ethers.ZeroAddress,
          walletAddress,
          amount
        );
        await tx.wait();
        console.log(`cross transfer success ${tx.hash}`);
      } catch (error) {
        console.log("🚀 ~ file: scroll-sepolia.ts:104 ~ error:", error);
      }
    }
  );

  dealTransferIn(contractSeplPool, contractScrollPool, false);
  dealTransferIn(contractScrollPool, contractSeplPool, true);
}

function delayedForEach(array: any[], callback: any, delay: number) {
  let index = 0;

  function next() {
    if (index < array.length) {
      callback(array[index], index, array);
      index++;
      setTimeout(next, delay);
    }
  }

  next();
}

async function dealTransferIn(poolIn: any, poolOut: any, isScrollIn: boolean) {
  const sepBlock = await sepProvider.getBlockNumber();
  const scrollBlock = await scrollProvider.getBlockNumber();
  //   console.log("🚀 Current block num: ", sepBlock, scrollBlock);

  const transferOutScrollEvents = await poolOut.queryFilter(
    "CrossChainTransferOut",
    isScrollIn ? sepBlock - 1000 : scrollBlock - 1000,
    isScrollIn ? sepBlock : scrollBlock
  );

  const transferInEvents = await poolIn.queryFilter(
    "CrossChainTransferIn",
    isScrollIn ? scrollBlock - 1000 : sepBlock - 1000,
    isScrollIn ? scrollBlock : sepBlock
  );

  console.log("🚀 transferInEvents Length:", transferInEvents.length);

  async function callback(event: any) {
    // console.log(
    //   "sepolia transferIn: ",
    //   event.transactionHash,
    //   event?.args[1],
    //   event?.args[2],
    //   event?.args[3]
    // );
    const eventIntxHash = event.transactionHash;

    const alreadyOut = transferOutScrollEvents.some((eventsOut: any) => {
      return eventIntxHash === eventsOut.args[0];
    });

    if (alreadyOut) {
      return;
    }

    console.log(
      "crossChainTransferOut args: ",
      event.transactionHash,
      event?.args[0],
      ethers.ZeroAddress,
      event?.args[2],
      event?.args[3]
    );
    let tx;
    try {
      tx = await poolOut.crossChainTransferOut(
        event.transactionHash,
        event?.args[0],
        ethers.ZeroAddress,
        event?.args[2],
        //   event?.args[3]
        ethers.parseEther("0.001")
      );

      console.log(
        `crossChainTransferOut From History Event Success: ${tx.hash}`
      );
    } catch (error) {
      console.log(
        "🚀 ~ file: scroll-sepolia.ts:173 ~ transferInEvents.forEach ~ error:",
        error
      );
    }
  }
  delayedForEach(transferInEvents, callback, 15000);
}

main();
