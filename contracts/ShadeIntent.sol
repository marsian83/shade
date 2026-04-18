// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/* ── Contract ──────────────────────────────────────────────────────────── */

contract ShadeIntent {

    address public immutable usdc;        // TestUSDC token
    uint256 public constant  SWAP_RATE = 2600; // 1 ETH = 2600 USDC (demo rate)

    struct Intent {
        euint64 thresholdPrice;
        euint64 amount;
        ebool   isBuy;
        ebool   executableBuy;
        ebool   executableSell;
        address user;
        bool    executed;
        uint256 depositAmount;
        bool    isBuyPlain;
        bool    withdrawn;
        bool    conditionVerified;
    }

    Intent[] public intents;

    event IntentCreated(address indexed user, uint256 index, uint256 depositAmount, bool isBuy);
    event IntentEvaluated(uint256 index);
    event ConditionVerified(address indexed user, uint256 index, bool conditionMet);
    event SwapExecuted(address indexed user, uint256 index, uint256 amountIn, uint256 amountOut);
    event SwapSkipped(uint256 index);
    event DepositWithdrawn(address indexed user, uint256 index, uint256 amount);

    constructor(address _usdc) {
        usdc = _usdc;
    }

    receive() external payable {}

    // ── CREATE INTENT ─────────────────────────────────────────────────────────
    function createIntent(
        InEuint64 calldata _thresholdPrice,
        InEuint64 calldata _amount,
        InEbool   calldata _isBuyEncrypted,
        bool _isBuy,
        uint256 _sellAmount
    ) public payable {
        euint64 threshold = FHE.asEuint64(_thresholdPrice);
        euint64 amt       = FHE.asEuint64(_amount);
        ebool   buyEnc    = FHE.asEbool(_isBuyEncrypted);

        uint256 deposit;
        if (_isBuy) {
            require(msg.value > 0, "Send ETH for buy intent");
            deposit = msg.value;
        } else {
            require(_sellAmount > 0, "Specify USDC amount for sell");
            require(msg.value == 0, "Do not send ETH for sell intent");
            IERC20(usdc).transferFrom(msg.sender, address(this), _sellAmount);
            deposit = _sellAmount;
        }

        intents.push(Intent({
            thresholdPrice: threshold,
            amount:         amt,
            isBuy:          buyEnc,
            executableBuy:  FHE.asEbool(false),
            executableSell: FHE.asEbool(false),
            user:           msg.sender,
            executed:       false,
            depositAmount:  deposit,
            isBuyPlain:     _isBuy,
            withdrawn:      false,
            conditionVerified: false
        }));

        FHE.allowThis(threshold);
        FHE.allowThis(amt);
        FHE.allowThis(buyEnc);

        emit IntentCreated(msg.sender, intents.length - 1, deposit, _isBuy);
    }

    // ── CHECK EXECUTION ───────────────────────────────────────────────────────
    function checkExecution(uint256 index, InEuint64 calldata currentPriceInput) public {
        require(index < intents.length, "Invalid index");

        euint64 currentPrice = FHE.asEuint64(currentPriceInput);
        Intent storage intent = intents[index];

        ebool buyCondition = FHE.lte(currentPrice, intent.thresholdPrice);
        ebool sellCondition = FHE.gte(currentPrice, intent.thresholdPrice);

        intent.executableBuy = buyCondition;
        intent.executableSell = sellCondition;

        FHE.allowThis(intent.executableBuy);
        FHE.allowThis(intent.executableSell);
        FHE.allow(intent.executableBuy, intent.user);
        FHE.allow(intent.executableSell, intent.user);
        FHE.allowPublic(intent.executableBuy);
        FHE.allowPublic(intent.executableSell);

        emit IntentEvaluated(index);
    }

    // ── VERIFY CONDITION (Step 1 of execute) ──────────────────────────────────
    // Publishes the FHE decrypt result on-chain. If the CoFHE network hasn't
    // finalized yet, this can be retried without losing the deposit.
    function verifyCondition(
        uint256 index,
        ebool ctHash,
        bool plaintext,
        bytes calldata signature
    ) public {
        require(index < intents.length, "Invalid index");
        Intent storage intent = intents[index];
        require(!intent.executed, "Already executed");
        require(!intent.withdrawn, "Deposit withdrawn");

        FHE.publishDecryptResult(ctHash, plaintext, signature);

        (bool conditionMet, bool ready) = FHE.getDecryptResultSafe(ctHash);
        require(ready, "Decrypt result not ready");

        if (!conditionMet) {
            emit SwapSkipped(index);
            return;
        }

        intent.conditionVerified = true;
        emit ConditionVerified(intent.user, index, conditionMet);
    }

    // ── EXECUTE SWAP (Step 2: settle after verification) ──────────────────────
    // Can be called after verifyCondition, OR as a combined call.
    function executeSwap(
        uint256 index,
        ebool ctHash,
        bool plaintext,
        bytes calldata signature
    ) public {
        require(index < intents.length, "Invalid index");
        Intent storage intent = intents[index];
        require(!intent.executed, "Already executed");
        require(!intent.withdrawn, "Deposit withdrawn");

        // Try to publish + verify FHE result
        FHE.publishDecryptResult(ctHash, plaintext, signature);

        (bool conditionMet, bool ready) = FHE.getDecryptResultSafe(ctHash);
        require(ready, "Decrypt result not ready");

        if (!conditionMet) {
            emit SwapSkipped(index);
            return;
        }

        intent.executed = true;
        _settleSwap(index);
    }

    // ── SETTLE SWAP (after condition verified) ────────────────────────────────
    // For cases where verifyCondition succeeded but swap needs separate call
    function settleSwap(uint256 index) public {
        require(index < intents.length, "Invalid index");
        Intent storage intent = intents[index];
        require(!intent.executed, "Already executed");
        require(!intent.withdrawn, "Deposit withdrawn");
        require(intent.conditionVerified, "Condition not verified yet");

        intent.executed = true;
        _settleSwap(index);
    }

    // ── INTERNAL: perform the actual swap at fixed rate ──────────────────────
    function _settleSwap(uint256 index) internal {
        Intent storage intent = intents[index];
        uint256 amountOut;

        if (intent.isBuyPlain) {
            // BUY: ETH → tUSDC at SWAP_RATE (2600 USDC per ETH)
            // depositAmount is in wei (18 dec), USDC has 6 dec
            amountOut = intent.depositAmount * SWAP_RATE / 1e12;
            require(IERC20(usdc).balanceOf(address(this)) >= amountOut, "Insufficient tUSDC reserves");
            IERC20(usdc).transfer(intent.user, amountOut);
        } else {
            // SELL: tUSDC → ETH at SWAP_RATE
            // depositAmount is in USDC units (6 dec), output in wei (18 dec)
            amountOut = intent.depositAmount * 1e12 / SWAP_RATE;
            require(address(this).balance >= amountOut, "Insufficient ETH reserves");
            (bool sent, ) = payable(intent.user).call{value: amountOut}("");
            require(sent, "ETH transfer failed");
        }

        emit SwapExecuted(intent.user, index, intent.depositAmount, amountOut);
    }

    // ── WITHDRAW (cancel) ─────────────────────────────────────────────────────
    function withdrawDeposit(uint256 index) external {
        require(index < intents.length, "Invalid index");
        Intent storage intent = intents[index];
        require(msg.sender == intent.user, "Not your intent");
        require(!intent.executed, "Already executed");
        require(!intent.withdrawn, "Already withdrawn");

        intent.withdrawn = true;

        if (intent.isBuyPlain) {
            (bool sent, ) = payable(intent.user).call{value: intent.depositAmount}("");
            require(sent, "ETH transfer failed");
        } else {
            IERC20(usdc).transfer(intent.user, intent.depositAmount);
        }

        emit DepositWithdrawn(intent.user, index, intent.depositAmount);
    }

    // ── VIEW HELPERS ──────────────────────────────────────────────────────────
    function getExecutableHandle(uint256 index, bool isBuy) external view returns (bytes32) {
        require(index < intents.length, "Invalid index");
        Intent storage intent = intents[index];
        return isBuy ? ebool.unwrap(intent.executableBuy) : ebool.unwrap(intent.executableSell);
    }

    function getIntentCount() public view returns (uint256) {
        return intents.length;
    }
}
