const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const provider = new ethers.JsonRpcProvider('https://sepolia.infura.io/v3/c5336fecf781423f8603d2cdf3fbae7d');
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const WETH = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';
    const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
    const ROUTER = '0x3BFA4769fb09ef5Ab9615fd7C4e49e788e0fe03a';

    const testAmount = ethers.parseEther('0.0001'); // same as user's deposit

    // First wrap ETH to WETH
    const wethABI = ['function deposit() payable', 'function approve(address,uint256) returns(bool)', 'function balanceOf(address) view returns(uint256)'];
    const weth = new ethers.Contract(WETH, wethABI, wallet);

    console.log('Wrapping 0.0001 ETH to WETH...');
    const wrapTx = await weth.deposit({ value: testAmount });
    await wrapTx.wait();
    console.log('Wrapped. WETH balance:', (await weth.balanceOf(wallet.address)).toString());

    // Approve router
    console.log('Approving router...');
    const approveTx = await weth.approve(ROUTER, testAmount);
    await approveTx.wait();

    // Try the swap
    const routerABI = ['function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)'];
    const router = new ethers.Contract(ROUTER, routerABI, wallet);

    console.log('Swapping WETH -> USDC via Uniswap V3 (fee 3000)...');
    try {
        const swapTx = await router.exactInputSingle({
            tokenIn: WETH,
            tokenOut: USDC,
            fee: 3000,
            recipient: wallet.address,
            amountIn: testAmount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        const receipt = await swapTx.wait();
        console.log('Swap succeeded. Tx:', receipt.hash);

        const usdcABI = ['function balanceOf(address) view returns(uint256)'];
        const usdcContract = new ethers.Contract(USDC, usdcABI, provider);
        const usdcBal = await usdcContract.balanceOf(wallet.address);
        console.log('USDC balance:', usdcBal.toString(), '(', Number(usdcBal) / 1e6, 'USDC)');
    } catch (err) {
        console.error('Swap FAILED:', err.message);
    }
}
main().catch(console.error);
