const {ethers} = require('ethers');
const provider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/c5336fecf781423f8603d2cdf3fbae7d');
const factoryAddr = '0x0227628f3F023bb0B980b67D528571c95c6DaC1c';
const factoryABI = ['function getPool(address,address,uint24) view returns (address)'];
const factory = new ethers.Contract(factoryAddr, factoryABI, provider);
const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

async function main() {
  const fees = [100, 500, 3000, 10000];
  for (const fee of fees) {
    const pool = await factory.getPool(WETH, USDC, fee);
    const isZero = pool === ethers.ZeroAddress;
    console.log('Fee', fee, '->', isZero ? 'NO POOL' : pool);
    if (!isZero) {
      const poolABI = ['function liquidity() view returns (uint128)', 'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'];
      const pc = new ethers.Contract(pool, poolABI, provider);
      const liq = await pc.liquidity();
      console.log('  Liquidity:', liq.toString());
    }
  }
}
main().catch(console.error);
