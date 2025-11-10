pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EmotionFHE is ZamaEthereumConfig {
    struct AnalysisRequest {
        address requester;
        euint32 encryptedInput;
        uint256 timestamp;
        bool isProcessed;
        uint32 decryptedResult;
    }

    mapping(uint256 => AnalysisRequest) public analysisRequests;
    uint256[] public requestIds;

    event AnalysisRequested(uint256 indexed requestId, address indexed requester);
    event AnalysisCompleted(uint256 indexed requestId, uint32 decryptedResult);

    constructor() ZamaEthereumConfig() {
        // Initialize contract with Zama configuration
    }

    function requestAnalysis(
        externalEuint32 encryptedInput,
        bytes calldata inputProof
    ) external returns (uint256) {
        require(FHE.isInitialized(FHE.fromExternal(encryptedInput, inputProof)), "Invalid encrypted input");

        uint256 requestId = requestIds.length;
        AnalysisRequest storage request = analysisRequests[requestId];

        request.requester = msg.sender;
        request.encryptedInput = FHE.fromExternal(encryptedInput, inputProof);
        request.timestamp = block.timestamp;
        request.isProcessed = false;
        request.decryptedResult = 0;

        FHE.allowThis(request.encryptedInput);
        FHE.makePubliclyDecryptable(request.encryptedInput);

        requestIds.push(requestId);
        emit AnalysisRequested(requestId, msg.sender);

        return requestId;
    }

    function processAnalysis(
        uint256 requestId,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(requestId < requestIds.length, "Invalid request ID");
        AnalysisRequest storage request = analysisRequests[requestId];
        require(!request.isProcessed, "Request already processed");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(request.encryptedInput);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        request.decryptedResult = decodedValue;
        request.isProcessed = true;

        emit AnalysisCompleted(requestId, decodedValue);
    }

    function getAnalysisRequest(uint256 requestId) external view returns (
        address requester,
        uint256 timestamp,
        bool isProcessed,
        uint32 decryptedResult
    ) {
        require(requestId < requestIds.length, "Invalid request ID");
        AnalysisRequest storage request = analysisRequests[requestId];

        return (
            request.requester,
            request.timestamp,
            request.isProcessed,
            request.decryptedResult
        );
    }

    function getEncryptedInput(uint256 requestId) external view returns (euint32) {
        require(requestId < requestIds.length, "Invalid request ID");
        return analysisRequests[requestId].encryptedInput;
    }

    function getAllRequestIds() external view returns (uint256[] memory) {
        return requestIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


