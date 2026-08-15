// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title Passport
 * @author Crucible
 * @notice A Model Passport: one non-fungible, ERC-7857-style Agentic ID per completed
 *         0G fine-tuning job, carrying the immutable lineage of that job.
 * @dev Provenance model
 *
 *      0G Compute already emits everything needed to prove how a fine-tune was produced —
 *      the base model, the dataset, the training config, the resulting adapter. Crucible
 *      collects that into a canonical JSON manifest, stores it on 0G Storage, and anchors
 *      its keccak256 here. `manifestRootHash` is deliberately PUBLIC and unencrypted, so
 *      any third party can fetch the manifest and check it against the chain with
 *      {verifyManifest} without holding a decryption key.
 *
 *      The contract performs NO hashing of its own. It compares bytes32 values. Manifest
 *      canonicalisation (recursive key sort, no whitespace) lives off-chain in the
 *      crucible core package and must stay there — the anchor is only meaningful if
 *      exactly one implementation defines it.
 */
contract Passport is ERC721 {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /**
     * @notice The complete, immutable lineage record of one fine-tune.
     * @param baseModelHash    Hash of the pre-trained base model the job started from.
     * @param datasetRootHash  0G Storage root hash of the training dataset.
     * @param configHash       Hash of the training config JSON.
     * @param adapterRootHash  0G Storage root hash of the resulting LoRA adapter.
     * @param manifestRootHash Root hash of the full passport manifest. Public and
     *                         unencrypted so anyone can verify without decryption.
     * @param taskId           The 0G fine-tuning task id.
     * @param provider         The 0G compute provider that ran the job.
     * @param mintedAt         Block timestamp of the mint. Set by the contract; any value
     *                         supplied by the caller is ignored.
     */
    struct PassportData {
        bytes32 baseModelHash;
        bytes32 datasetRootHash;
        bytes32 configHash;
        bytes32 adapterRootHash;
        bytes32 manifestRootHash;
        string taskId;
        address provider;
        uint64 mintedAt;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Hard ceiling on simultaneously authorized executors per token.
    /// @dev Bounds {authorizedExecutors} and keeps every authorization loop finite.
    uint256 public constant MAX_AUTHORIZED_PER_TOKEN = 100;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @dev tokenId => immutable lineage. Written once in {mint}, never again.
    mapping(uint256 => PassportData) private _passports;

    /// @dev tokenId => URI of the encrypted adapter payload (ERC-7857 sealed metadata).
    mapping(uint256 => string) private _encryptedURIs;

    /// @dev keccak256(dataset, config, adapter) => tokenId. Zero means "never minted".
    mapping(bytes32 => uint256) private _lineageToTokenId;

    /// @dev Monotonic token id counter. Ids start at 1 so that 0 can mean "none".
    uint256 private _nextTokenId;

    /**
     * @dev The set of executors authorized for one token during one authorization epoch.
     * @param executors     Dense list of authorized addresses, capped at
     *                      {MAX_AUTHORIZED_PER_TOKEN}.
     * @param indexPlusOne  executor => 1-based index into `executors`. 0 means "not a member",
     *                      which is why the index is offset by one.
     * @param permissions   executor => opaque permission blob, stored but never interpreted.
     */
    struct AuthSet {
        address[] executors;
        mapping(address => uint256) indexPlusOne;
        mapping(address => bytes) permissions;
    }

    /// @dev tokenId => current authorization epoch. Bumped on transfer to clear the set.
    mapping(uint256 => uint256) private _authEpoch;

    /// @dev tokenId => epoch => authorization set.
    mapping(uint256 => mapping(uint256 => AuthSet)) private _authSets;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /**
     * @notice Emitted once per passport, carrying the full lineage so indexers never
     *         need an archive node to reconstruct provenance.
     */
    event PassportMinted(
        uint256 indexed tokenId,
        address indexed to,
        address indexed provider,
        bytes32 baseModelHash,
        bytes32 datasetRootHash,
        bytes32 configHash,
        bytes32 adapterRootHash,
        bytes32 manifestRootHash,
        string taskId,
        uint64 mintedAt
    );

    /**
     * @notice An executor was granted usage rights on a passport.
     * @param tokenId     The passport.
     * @param executor    The address granted execution rights.
     * @param permissions Opaque permission blob, interpreted off-chain.
     */
    event UsageAuthorized(
        uint256 indexed tokenId,
        address indexed executor,
        bytes permissions
    );

    /**
     * @notice An executor's usage rights were revoked.
     * @param tokenId  The passport.
     * @param executor The address that lost execution rights.
     */
    event UsageRevoked(uint256 indexed tokenId, address indexed executor);

    /**
     * @notice Every authorization on a passport was cleared because it changed hands.
     * @param tokenId      The passport.
     * @param from         Previous owner.
     * @param to           New owner.
     * @param clearedCount How many executors lost their rights.
     */
    event AuthorizationsCleared(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 clearedCount
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    /// @notice `baseModelHash` was zero.
    error ZeroBaseModelHash();
    /// @notice `datasetRootHash` was zero.
    error ZeroDatasetRootHash();
    /// @notice `configHash` was zero.
    error ZeroConfigHash();
    /// @notice `adapterRootHash` was zero.
    error ZeroAdapterRootHash();
    /// @notice `manifestRootHash` was zero. Without it nothing is verifiable.
    error ZeroManifestRootHash();
    /// @notice `taskId` was the empty string.
    error EmptyTaskId();
    /// @notice `provider` was the zero address.
    error ZeroProvider();
    /// @notice Tried to mint a passport to the zero address.
    error ZeroRecipient();

    /**
     * @notice The passport does not exist.
     * @param tokenId The id that was queried.
     */
    error NonexistentPassport(uint256 tokenId);

    /**
     * @notice This exact (dataset, config, adapter) triple already has a passport.
     * @param lineageKey     The colliding lineage key.
     * @param existingTokenId The token that already holds it.
     */
    error DuplicateLineage(bytes32 lineageKey, uint256 existingTokenId);

    /**
     * @notice Only the current token owner may manage authorizations.
     * @param tokenId The passport.
     * @param caller  The rejected caller.
     */
    error NotTokenOwner(uint256 tokenId, address caller);

    /// @notice The executor address was zero.
    error ZeroExecutor();

    /**
     * @notice The executor already holds usage rights on this passport.
     * @param tokenId  The passport.
     * @param executor The executor.
     */
    error AlreadyAuthorized(uint256 tokenId, address executor);

    /**
     * @notice The executor holds no usage rights on this passport, so there is
     *         nothing to revoke.
     * @param tokenId  The passport.
     * @param executor The executor.
     */
    error NotAuthorized(uint256 tokenId, address executor);

    /**
     * @notice The passport already has the maximum number of authorized executors.
     * @param tokenId The passport.
     * @param max     The ceiling, {MAX_AUTHORIZED_PER_TOKEN}.
     */
    error MaxAuthorizationsReached(uint256 tokenId, uint256 max);

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    constructor() ERC721("Crucible Model Passport", "CMP") {}

    // ---------------------------------------------------------------------
    // Minting
    // ---------------------------------------------------------------------

    /**
     * @notice Mint a Model Passport for a completed fine-tune.
     * @dev Permissionless by design. A mint is a public *claim* of lineage, not a
     *      privileged assertion of truth: the proof lives in the manifest on 0G Storage,
     *      which carries the provider's TEE attestation and is checkable by anyone via
     *      {verifyManifest}. Gating the mint would add a trusted party without adding a
     *      single bit of verifiability.
     *
     *      `data.mintedAt` is ignored and overwritten with `block.timestamp`, so a caller
     *      cannot backdate a passport.
     * @param data         The lineage record. All hashes must be non-zero.
     * @param to           Recipient of the passport.
     * @param encryptedURI URI of the encrypted adapter payload. May be empty.
     * @return tokenId The id of the newly minted passport. Ids start at 1.
     */
    function mint(
        address to,
        PassportData calldata data,
        string calldata encryptedURI
    ) external returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroRecipient();
        if (data.baseModelHash == bytes32(0)) revert ZeroBaseModelHash();
        if (data.datasetRootHash == bytes32(0)) revert ZeroDatasetRootHash();
        if (data.configHash == bytes32(0)) revert ZeroConfigHash();
        if (data.adapterRootHash == bytes32(0)) revert ZeroAdapterRootHash();
        if (data.manifestRootHash == bytes32(0)) revert ZeroManifestRootHash();
        if (bytes(data.taskId).length == 0) revert EmptyTaskId();
        if (data.provider == address(0)) revert ZeroProvider();

        bytes32 key = lineageKey(
            data.datasetRootHash,
            data.configHash,
            data.adapterRootHash
        );
        uint256 existing = _lineageToTokenId[key];
        if (existing != 0) revert DuplicateLineage(key, existing);

        unchecked {
            tokenId = ++_nextTokenId;
        }

        uint64 stampedAt = uint64(block.timestamp);

        _passports[tokenId] = PassportData({
            baseModelHash: data.baseModelHash,
            datasetRootHash: data.datasetRootHash,
            configHash: data.configHash,
            adapterRootHash: data.adapterRootHash,
            manifestRootHash: data.manifestRootHash,
            taskId: data.taskId,
            provider: data.provider,
            mintedAt: stampedAt
        });
        _encryptedURIs[tokenId] = encryptedURI;
        _lineageToTokenId[key] = tokenId;

        // _safeMint last: state is fully settled before control can reach a receiver hook.
        _safeMint(to, tokenId);

        emit PassportMinted(
            tokenId,
            to,
            data.provider,
            data.baseModelHash,
            data.datasetRootHash,
            data.configHash,
            data.adapterRootHash,
            data.manifestRootHash,
            data.taskId,
            stampedAt
        );
    }

    // ---------------------------------------------------------------------
    // Lineage reads
    // ---------------------------------------------------------------------

    /**
     * @notice Read the full immutable lineage of a passport.
     * @param tokenId The passport to read.
     * @return The complete lineage record.
     */
    function passportOf(uint256 tokenId) external view returns (PassportData memory) {
        _requireExists(tokenId);
        return _passports[tokenId];
    }

    /**
     * @notice The URI of the encrypted adapter payload for a passport.
     * @dev Named `encryptedURIOf` rather than `encryptedURI` so it does not shadow the
     *      `encryptedURI` parameter of {mint}, whose name is pinned by the interface spec.
     * @param tokenId The passport to read.
     * @return The stored URI, possibly empty.
     */
    function encryptedURIOf(uint256 tokenId) external view returns (string memory) {
        _requireExists(tokenId);
        return _encryptedURIs[tokenId];
    }

    /**
     * @notice Check a manifest you fetched from 0G Storage against the on-chain anchor.
     * @dev This is the whole point of the contract: `manifestRootHash` is stored public and
     *      unencrypted, so verification requires no key, no permission and no owner
     *      cooperation. Hash the canonical manifest off-chain and pass the result here.
     *
     *      The contract does no hashing itself — canonicalisation lives in exactly one
     *      place, off-chain, and duplicating it here would create a second definition of
     *      truth.
     *
     *      Reverts for an unknown passport rather than returning false, so a caller can
     *      never mistake "no such passport" for "manifest does not match".
     * @param tokenId               The passport to check against.
     * @param candidateManifestHash keccak256 of the canonicalized manifest JSON.
     * @return True if the candidate matches the anchored manifest hash exactly.
     */
    function verifyManifest(uint256 tokenId, bytes32 candidateManifestHash)
        external
        view
        returns (bool)
    {
        _requireExists(tokenId);
        return _passports[tokenId].manifestRootHash == candidateManifestHash;
    }

    /**
     * @notice Number of passports ever minted. Also the highest issued token id.
     * @return The mint count.
     */
    function totalMinted() external view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @notice The deduplication key for a lineage triple.
     * @param datasetRootHash 0G Storage root hash of the dataset.
     * @param configHash      Hash of the training config.
     * @param adapterRootHash 0G Storage root hash of the adapter.
     * @return The lineage key.
     */
    function lineageKey(
        bytes32 datasetRootHash,
        bytes32 configHash,
        bytes32 adapterRootHash
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(datasetRootHash, configHash, adapterRootHash));
    }

    /**
     * @notice Look up the passport minted for a lineage triple.
     * @param datasetRootHash 0G Storage root hash of the dataset.
     * @param configHash      Hash of the training config.
     * @param adapterRootHash 0G Storage root hash of the adapter.
     * @return The token id, or 0 if this lineage has never been minted.
     */
    function tokenIdForLineage(
        bytes32 datasetRootHash,
        bytes32 configHash,
        bytes32 adapterRootHash
    ) external view returns (uint256) {
        return
            _lineageToTokenId[
                lineageKey(datasetRootHash, configHash, adapterRootHash)
            ];
    }

    // ---------------------------------------------------------------------
    // Authorization
    // ---------------------------------------------------------------------

    /**
     * @notice Grant an executor the right to use this model WITHOUT transferring
     *         ownership of the passport.
     * @dev Owner-only. ERC-721 `approve` / `setApprovalForAll` deliberately do NOT confer
     *      this power: those are transfer permissions, and conflating "may sell it" with
     *      "may run it" is exactly the mistake ERC-7857 authorization exists to avoid.
     *
     *      `permissions` is stored verbatim and never interpreted on-chain. Its meaning is
     *      defined by the off-chain executor.
     *
     *      Capped at {MAX_AUTHORIZED_PER_TOKEN}. The cap is what keeps the set enumerable
     *      and every loop over it bounded.
     * @param tokenId     The passport to grant rights on.
     * @param executor    The address being granted execution rights.
     * @param permissions Opaque permission blob. May be empty.
     */
    function authorizeUsage(
        uint256 tokenId,
        address executor,
        bytes calldata permissions
    ) external {
        _requireExists(tokenId);
        _requireOwner(tokenId);
        if (executor == address(0)) revert ZeroExecutor();

        AuthSet storage set = _currentAuthSet(tokenId);
        if (set.indexPlusOne[executor] != 0) {
            revert AlreadyAuthorized(tokenId, executor);
        }
        if (set.executors.length >= MAX_AUTHORIZED_PER_TOKEN) {
            revert MaxAuthorizationsReached(tokenId, MAX_AUTHORIZED_PER_TOKEN);
        }

        set.executors.push(executor);
        set.indexPlusOne[executor] = set.executors.length;
        set.permissions[executor] = permissions;

        emit UsageAuthorized(tokenId, executor, permissions);
    }

    /**
     * @notice Revoke an executor's usage rights.
     * @dev Owner-only. Removes the executor by swap-and-pop, so the surviving set stays
     *      dense and the freed slot is immediately reusable under the cap.
     * @param tokenId  The passport.
     * @param executor The address losing execution rights.
     */
    function revokeAuthorization(uint256 tokenId, address executor) external {
        _requireExists(tokenId);
        _requireOwner(tokenId);

        AuthSet storage set = _currentAuthSet(tokenId);
        uint256 indexPlusOne = set.indexPlusOne[executor];
        if (indexPlusOne == 0) revert NotAuthorized(tokenId, executor);

        uint256 lastIndex = set.executors.length - 1;
        uint256 index = indexPlusOne - 1;
        if (index != lastIndex) {
            address moved = set.executors[lastIndex];
            set.executors[index] = moved;
            set.indexPlusOne[moved] = indexPlusOne;
        }
        set.executors.pop();
        delete set.indexPlusOne[executor];
        delete set.permissions[executor];

        emit UsageRevoked(tokenId, executor);
    }

    /**
     * @notice Whether an executor currently holds usage rights on a passport.
     * @dev Never reverts. A nonexistent passport simply has an empty authorization set,
     *      so this returns false — safe for integrators to call in a hot path.
     *      The owner is NOT implicitly authorized; rights must be granted explicitly.
     * @param tokenId  The passport.
     * @param executor The address to check.
     * @return True if the executor is authorized right now.
     */
    function isAuthorized(uint256 tokenId, address executor)
        external
        view
        returns (bool)
    {
        return _currentAuthSet(tokenId).indexPlusOne[executor] != 0;
    }

    /**
     * @notice The permission blob stored for an executor.
     * @dev Returns empty bytes if the executor is not authorized.
     * @param tokenId  The passport.
     * @param executor The address to look up.
     * @return The opaque permission blob.
     */
    function permissionsOf(uint256 tokenId, address executor)
        external
        view
        returns (bytes memory)
    {
        return _currentAuthSet(tokenId).permissions[executor];
    }

    /**
     * @notice How many executors are currently authorized on a passport.
     * @param tokenId The passport.
     * @return The count, never above {MAX_AUTHORIZED_PER_TOKEN}.
     */
    function authorizedCount(uint256 tokenId) external view returns (uint256) {
        return _currentAuthSet(tokenId).executors.length;
    }

    /**
     * @notice Every currently authorized executor.
     * @dev Bounded by {MAX_AUTHORIZED_PER_TOKEN}, so this is always safe to call.
     *      Order is not stable across revocations because removal uses swap-and-pop.
     * @param tokenId The passport.
     * @return The authorized addresses.
     */
    function authorizedExecutors(uint256 tokenId)
        external
        view
        returns (address[] memory)
    {
        return _currentAuthSet(tokenId).executors;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /**
     * @notice ERC-7857 security requirement: a transfer wipes every authorization.
     * @dev Clearing is O(1). Rather than deleting up to 100 entries, the token's
     *      authorization epoch is bumped, which orphans the entire previous set at once.
     *      Reads always go through {_currentAuthSet}, so the old set becomes unreachable —
     *      indistinguishable from deletion at the API surface, but with a transfer cost
     *      that does not scale with the number of executors. A 100-entry token transfers
     *      for the same gas as an empty one.
     *
     *      Skipped for mints (`from == address(0)`) and self-transfers (`from == to`,
     *      where no new principal gains control), and when there is nothing to clear.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal override {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);

        if (from == address(0) || from == to) return;

        // Plain ERC-721 always moves exactly one token per call; batching is an
        // ERC721Consecutive feature this contract does not inherit.
        uint256 clearedCount = _currentAuthSet(firstTokenId).executors.length;
        if (clearedCount == 0) return;

        unchecked {
            _authEpoch[firstTokenId] += 1;
        }
        emit AuthorizationsCleared(firstTokenId, from, to, clearedCount);
    }

    /// @dev The authorization set for the token's current epoch.
    function _currentAuthSet(uint256 tokenId)
        private
        view
        returns (AuthSet storage)
    {
        return _authSets[tokenId][_authEpoch[tokenId]];
    }

    /// @dev Reverts unless the caller owns `tokenId`. Assumes the token exists.
    function _requireOwner(uint256 tokenId) internal view {
        if (ownerOf(tokenId) != msg.sender) {
            revert NotTokenOwner(tokenId, msg.sender);
        }
    }

    /// @dev Reverts with a typed error if `tokenId` has never been minted.
    function _requireExists(uint256 tokenId) internal view {
        if (!_exists(tokenId)) revert NonexistentPassport(tokenId);
    }
}
