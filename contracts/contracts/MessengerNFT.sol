// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MessengerNFT
 * @dev One NFT per (message, recipient). Stores encrypted message reference and key.
 */
contract MessengerNFT is ERC721Enumerable, Ownable {
    struct MsgMetadata {
        string cid;      // IPFS CID of ciphertext JSON
        bytes  encKey;   // Encrypted symmetric key for this recipient
        address sender;  // The original message sender
    }

    // tokenId => MsgMetadata
    mapping(uint256 => MsgMetadata) private _meta;
    uint256 private _nextId;

    event MessageMinted(
        uint256 indexed tokenId,
        address indexed sender,
        address indexed recipient,
        string cid
    );

    constructor() ERC721("Messenger NFT", "MSG") Ownable(_msgSender()) {}

    /**
     * @notice Mint one NFT per recipient. The sender pays gas.
     * @param recipients List of recipient addresses (must align with encKeys).
     * @param cid IPFS CID of the ciphertext JSON.
     * @param encKeys Per-recipient encrypted symmetric keys.
     * @return tokenIds The array of minted token IDs.
     */
    function mintMessageNFT(
        address[] calldata recipients,
        string calldata cid,
        bytes[] calldata encKeys
    ) external returns (uint256[] memory tokenIds) {
        require(recipients.length == encKeys.length, "mismatch");
        tokenIds = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 id = _nextId++;
            tokenIds[i] = id;
            _safeMint(recipients[i], id);
            _meta[id] = MsgMetadata({ cid: cid, encKey: encKeys[i], sender: _msgSender() });
            emit MessageMinted(id, _msgSender(), recipients[i], cid);
        }
    }

    /**
     * @notice Get metadata if caller is owner or original sender.
     */
    function getMetadata(uint256 tokenId) external view returns (string memory, bytes memory) {
        require(tokenId < _nextId, "nonexistent");
        MsgMetadata storage m = _meta[tokenId];
        require(ownerOf(tokenId) == _msgSender() || m.sender == _msgSender(), "unauthorised");
        return (m.cid, m.encKey);
    }


}
