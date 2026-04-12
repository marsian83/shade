export const CONTRACT_ADDRESS = "0x9a4005548B4cd1Dd56da6370469BccB98b9D4DDE";

export const ABI = [
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "got",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "expected",
        "type": "uint8"
      }
    ],
    "name": "InvalidEncryptedInput",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "int32",
        "name": "value",
        "type": "int32"
      }
    ],
    "name": "SecurityZoneOutOfBounds",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "IntentCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "IntentEvaluated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "SwapExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "SwapSkipped",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "ctHash",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "securityZone",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "utype",
            "type": "uint8"
          },
          {
            "internalType": "bytes",
            "name": "signature",
            "type": "bytes"
          }
        ],
        "internalType": "struct InEuint64",
        "name": "currentPriceInput",
        "type": "tuple"
      }
    ],
    "name": "checkExecution",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "ctHash",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "securityZone",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "utype",
            "type": "uint8"
          },
          {
            "internalType": "bytes",
            "name": "signature",
            "type": "bytes"
          }
        ],
        "internalType": "struct InEuint64",
        "name": "_thresholdPrice",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "ctHash",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "securityZone",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "utype",
            "type": "uint8"
          },
          {
            "internalType": "bytes",
            "name": "signature",
            "type": "bytes"
          }
        ],
        "internalType": "struct InEuint64",
        "name": "_amount",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "ctHash",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "securityZone",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "utype",
            "type": "uint8"
          },
          {
            "internalType": "bytes",
            "name": "signature",
            "type": "bytes"
          }
        ],
        "internalType": "struct InEbool",
        "name": "_isBuyEncrypted",
        "type": "tuple"
      }
    ],
    "name": "createIntent",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "internalType": "ebool",
        "name": "ctHash",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "plaintext",
        "type": "bool"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "executeSwap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isBuy",
        "type": "bool"
      }
    ],
    "name": "getExecutableHandle",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getIntentCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "intents",
    "outputs": [
      {
        "internalType": "euint64",
        "name": "thresholdPrice",
        "type": "bytes32"
      },
      {
        "internalType": "euint64",
        "name": "amount",
        "type": "bytes32"
      },
      {
        "internalType": "ebool",
        "name": "isBuy",
        "type": "bytes32"
      },
      {
        "internalType": "ebool",
        "name": "executableBuy",
        "type": "bytes32"
      },
      {
        "internalType": "ebool",
        "name": "executableSell",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "executed",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];
