const ethers = require("ethers");

const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
const address = "0xD9c208F801F635299f6779c204f4B1E8cD31b6b3";

provider.getCode(address).then(code => {
  if (code === "0x") {
    console.log("❌ No contract at this address");
  } else {
    console.log("✅ Contract exists at address");
    console.log("Code length:", code.length);
  }
}).catch(err => console.error(err));
