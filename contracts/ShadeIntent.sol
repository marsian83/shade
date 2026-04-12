// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract ShadeIntent {

    struct Intent {
        euint64 thresholdPrice;
        euint64 amount;
        ebool   isBuy;
        ebool   executableBuy;   // condition for buy: price <= threshold
        ebool   executableSell;  // condition for sell: price >= threshold
        address user;
        bool    executed;
    }

    Intent[] public intents;

    event IntentCreated(address indexed user, uint256 index);
    event IntentEvaluated(uint256 index);
    event SwapExecuted(address indexed user, uint256 index);
    event SwapSkipped(uint256 index);

    // ── CREATE INTENT ─────────────────────────────────────────────────────────
    function createIntent(
        InEuint64 calldata _thresholdPrice,
        InEuint64 calldata _amount,
        InEbool   calldata _isBuyEncrypted
    ) public {
        euint64 threshold = FHE.asEuint64(_thresholdPrice);
        euint64 amt       = FHE.asEuint64(_amount);
        ebool   buyEnc    = FHE.asEbool(_isBuyEncrypted);

        intents.push(Intent({
            thresholdPrice: threshold,
            amount:         amt,
            isBuy:          buyEnc,
            executableBuy:  FHE.asEbool(false),
            executableSell: FHE.asEbool(false),
            user:           msg.sender,
            executed:       false
        }));

        FHE.allowThis(threshold);
        FHE.allowThis(amt);
        FHE.allowThis(buyEnc);

        emit IntentCreated(msg.sender, intents.length - 1);
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

    // ── EXECUTE SWAP ──────────────────────────────────────────────────────────
    // Follows the docs pattern: pass ctHash + decryptedValue + signature from
    // client.decryptForTx(ctHash).withoutPermit().execute()
    function executeSwap(
        uint256 index,
        ebool ctHash,
        bool plaintext,
        bytes calldata signature
    ) public {
        require(index < intents.length, "Invalid index");
        Intent storage intent = intents[index];
        require(!intent.executed, "Already executed");

        // Publish the Threshold Network decryption result on-chain
        FHE.publishDecryptResult(ctHash, plaintext, signature);

        // Read back the verified result
        (bool conditionMet, bool ready) = FHE.getDecryptResultSafe(ctHash);
        require(ready, "Decrypt result not ready");

        if (!conditionMet) {
            emit SwapSkipped(index);
            return;
        }

        intent.executed = true;
        emit SwapExecuted(intent.user, index);
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
