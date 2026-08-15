const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const ZERO_HASH = ethers.ZeroHash;
const ZERO_ADDRESS = ethers.ZeroAddress;

// Real values from docs/INTERFACES.md §6 so the fixtures look like production data.
const BASE_MODEL_HASH =
  "0xb4f76a886b8655c92bb021922d60b5e4d9271a5c9da98b6cb10937a06c2c75a7";
const PROVIDER = "0x940b4a101CaBa9be04b16A7363cafa29C1660B0d";

// Opaque permission blobs — the contract stores them, it never interprets them.
const PERMS = ethers.hexlify(ethers.toUtf8Bytes("infer:read"));
const PERMS_ALT = ethers.hexlify(ethers.toUtf8Bytes("infer:read,batch"));

// Deterministic distinct executor addresses: 0x00..01, 0x00..02, …
const executorAt = (i) =>
  ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(BigInt(i)), 20));

function passportData(overrides = {}) {
  return {
    baseModelHash: BASE_MODEL_HASH,
    datasetRootHash: h("dataset-root-1"),
    configHash: h("config-1"),
    adapterRootHash: h("adapter-root-1"),
    manifestRootHash: h("manifest-1"),
    taskId: "0g-task-0001",
    provider: PROVIDER,
    mintedAt: 0n,
    ...overrides,
  };
}

async function deployFixture() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();
  const Passport = await ethers.getContractFactory("Passport");
  const passport = await Passport.deploy();
  await passport.waitForDeployment();
  return { passport, deployer, alice, bob, carol };
}

// A fixture with one already-minted passport owned by `alice`.
async function mintedFixture() {
  const ctx = await deployFixture();
  const data = passportData();
  await ctx.passport.mint(ctx.alice.address, data, "0g://encrypted/adapter-1");
  return { ...ctx, data, tokenId: 1n };
}

describe("Passport", function () {
  describe("deployment", function () {
    it("deploys as an ERC-721 with the Crucible name and symbol", async function () {
      const { passport } = await loadFixture(deployFixture);
      expect(await passport.name()).to.equal("Crucible Model Passport");
      expect(await passport.symbol()).to.equal("CMP");
      expect(await passport.totalMinted()).to.equal(0n);
    });

    it("exposes the max-authorizations constant as 100", async function () {
      const { passport } = await loadFixture(deployFixture);
      expect(await passport.MAX_AUTHORIZED_PER_TOKEN()).to.equal(100n);
    });

    it("supports the ERC-721 and ERC-165 interfaces", async function () {
      const { passport } = await loadFixture(deployFixture);
      expect(await passport.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
      expect(await passport.supportsInterface("0x01ffc9a7")).to.equal(true); // ERC165
      expect(await passport.supportsInterface("0xffffffff")).to.equal(false);
    });
  });

  describe("mint", function () {
    it("returns a token id starting at 1 and increments it", async function () {
      const { passport, alice } = await loadFixture(deployFixture);

      const first = await passport.mint.staticCall(
        alice.address,
        passportData(),
        "uri-1"
      );
      expect(first).to.equal(1n);
      await passport.mint(alice.address, passportData(), "uri-1");

      const secondData = passportData({ adapterRootHash: h("adapter-root-2") });
      const second = await passport.mint.staticCall(
        alice.address,
        secondData,
        "uri-2"
      );
      expect(second).to.equal(2n);
    });

    it("mints the token to the requested owner", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);
      expect(await passport.ownerOf(tokenId)).to.equal(alice.address);
      expect(await passport.balanceOf(alice.address)).to.equal(1n);
      expect(await passport.totalMinted()).to.equal(1n);
    });

    it("stores every lineage field verbatim", async function () {
      const { passport, data, tokenId } = await loadFixture(mintedFixture);
      const stored = await passport.passportOf(tokenId);

      expect(stored.baseModelHash).to.equal(data.baseModelHash);
      expect(stored.datasetRootHash).to.equal(data.datasetRootHash);
      expect(stored.configHash).to.equal(data.configHash);
      expect(stored.adapterRootHash).to.equal(data.adapterRootHash);
      expect(stored.manifestRootHash).to.equal(data.manifestRootHash);
      expect(stored.taskId).to.equal(data.taskId);
      expect(ethers.getAddress(stored.provider)).to.equal(
        ethers.getAddress(data.provider)
      );
    });

    it("stamps mintedAt from the chain and ignores any caller-supplied value", async function () {
      const { passport, alice } = await loadFixture(deployFixture);

      // A caller trying to backdate the passport to the epoch must not succeed.
      const tx = await passport.mint(
        alice.address,
        passportData({ mintedAt: 1n }),
        "uri"
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      const stored = await passport.passportOf(1n);
      expect(stored.mintedAt).to.equal(BigInt(block.timestamp));
      expect(stored.mintedAt).to.not.equal(1n);
    });

    it("stores the encrypted URI", async function () {
      const { passport, tokenId } = await loadFixture(mintedFixture);
      expect(await passport.encryptedURIOf(tokenId)).to.equal(
        "0g://encrypted/adapter-1"
      );
    });

    it("emits PassportMinted carrying the full lineage", async function () {
      const { passport, alice } = await loadFixture(deployFixture);
      const data = passportData();

      await expect(passport.mint(alice.address, data, "uri"))
        .to.emit(passport, "PassportMinted")
        .withArgs(
          1n,
          alice.address,
          ethers.getAddress(data.provider),
          data.baseModelHash,
          data.datasetRootHash,
          data.configHash,
          data.adapterRootHash,
          data.manifestRootHash,
          data.taskId,
          (v) => typeof v === "bigint" && v > 0n
        );
    });

    it("emits the ERC-721 Transfer event from the zero address", async function () {
      const { passport, alice } = await loadFixture(deployFixture);
      await expect(passport.mint(alice.address, passportData(), "uri"))
        .to.emit(passport, "Transfer")
        .withArgs(ZERO_ADDRESS, alice.address, 1n);
    });

    it("reverts when minting to the zero address", async function () {
      const { passport } = await loadFixture(deployFixture);
      await expect(
        passport.mint(ZERO_ADDRESS, passportData(), "uri")
      ).to.be.revertedWithCustomError(passport, "ZeroRecipient");
    });
  });

  describe("mint — lineage validation", function () {
    const cases = [
      ["baseModelHash", "ZeroBaseModelHash"],
      ["datasetRootHash", "ZeroDatasetRootHash"],
      ["configHash", "ZeroConfigHash"],
      ["adapterRootHash", "ZeroAdapterRootHash"],
      ["manifestRootHash", "ZeroManifestRootHash"],
    ];

    for (const [field, error] of cases) {
      it(`reverts with ${error} when ${field} is empty`, async function () {
        const { passport, alice } = await loadFixture(deployFixture);
        const data = passportData({ [field]: ZERO_HASH });
        await expect(
          passport.mint(alice.address, data, "uri")
        ).to.be.revertedWithCustomError(passport, error);
      });
    }

    it("reverts with EmptyTaskId when the task id is blank", async function () {
      const { passport, alice } = await loadFixture(deployFixture);
      await expect(
        passport.mint(alice.address, passportData({ taskId: "" }), "uri")
      ).to.be.revertedWithCustomError(passport, "EmptyTaskId");
    });

    it("reverts with ZeroProvider when the provider is the zero address", async function () {
      const { passport, alice } = await loadFixture(deployFixture);
      await expect(
        passport.mint(
          alice.address,
          passportData({ provider: ZERO_ADDRESS }),
          "uri"
        )
      ).to.be.revertedWithCustomError(passport, "ZeroProvider");
    });
  });

  describe("mint — duplicate prevention", function () {
    it("reverts when the same dataset+config+adapter triple is minted twice", async function () {
      const { passport, alice, bob, data } = await loadFixture(mintedFixture);
      const key = await passport.lineageKey(
        data.datasetRootHash,
        data.configHash,
        data.adapterRootHash
      );

      // Same triple, everything else different — still a duplicate.
      const dupe = passportData({
        baseModelHash: h("some-other-base-model"),
        manifestRootHash: h("a-different-manifest"),
        taskId: "0g-task-9999",
      });

      await expect(passport.connect(bob).mint(bob.address, dupe, "uri-2"))
        .to.be.revertedWithCustomError(passport, "DuplicateLineage")
        .withArgs(key, 1n);
      expect(alice).to.not.equal(undefined);
    });

    it("allows a mint that differs only in datasetRootHash", async function () {
      const { passport, bob } = await loadFixture(mintedFixture);
      const data = passportData({ datasetRootHash: h("dataset-root-2") });
      await expect(passport.mint(bob.address, data, "uri-2")).to.not.be
        .reverted;
      expect(await passport.totalMinted()).to.equal(2n);
    });

    it("allows a mint that differs only in configHash", async function () {
      const { passport, bob } = await loadFixture(mintedFixture);
      const data = passportData({ configHash: h("config-2") });
      await expect(passport.mint(bob.address, data, "uri-2")).to.not.be
        .reverted;
    });

    it("allows a mint that differs only in adapterRootHash", async function () {
      const { passport, bob } = await loadFixture(mintedFixture);
      const data = passportData({ adapterRootHash: h("adapter-root-2") });
      await expect(passport.mint(bob.address, data, "uri-2")).to.not.be
        .reverted;
    });

    it("does NOT treat a repeated manifestRootHash alone as a duplicate", async function () {
      const { passport, bob } = await loadFixture(mintedFixture);
      const data = passportData({ adapterRootHash: h("adapter-root-2") });
      await expect(passport.mint(bob.address, data, "uri-2")).to.not.be
        .reverted;
    });

    it("resolves a lineage triple back to its token id", async function () {
      const { passport, data, tokenId } = await loadFixture(mintedFixture);
      expect(
        await passport.tokenIdForLineage(
          data.datasetRootHash,
          data.configHash,
          data.adapterRootHash
        )
      ).to.equal(tokenId);
      expect(
        await passport.tokenIdForLineage(h("nope"), h("nope"), h("nope"))
      ).to.equal(0n);
    });

    it("computes lineageKey as keccak256 of the abi-encoded triple", async function () {
      const { passport, data } = await loadFixture(mintedFixture);
      const expected = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["bytes32", "bytes32", "bytes32"],
          [data.datasetRootHash, data.configHash, data.adapterRootHash]
        )
      );
      expect(
        await passport.lineageKey(
          data.datasetRootHash,
          data.configHash,
          data.adapterRootHash
        )
      ).to.equal(expected);
    });
  });

  describe("reads on a nonexistent token", function () {
    it("reverts passportOf", async function () {
      const { passport } = await loadFixture(deployFixture);
      await expect(passport.passportOf(42n))
        .to.be.revertedWithCustomError(passport, "NonexistentPassport")
        .withArgs(42n);
    });

    it("reverts encryptedURIOf", async function () {
      const { passport } = await loadFixture(deployFixture);
      await expect(passport.encryptedURIOf(42n))
        .to.be.revertedWithCustomError(passport, "NonexistentPassport")
        .withArgs(42n);
    });
  });

  describe("authorizeUsage", function () {
    it("grants usage without transferring ownership", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);

      await passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS);

      expect(await passport.isAuthorized(tokenId, bob.address)).to.equal(true);
      // Ownership is untouched — that is the whole point of the mechanism.
      expect(await passport.ownerOf(tokenId)).to.equal(alice.address);
      expect(await passport.balanceOf(bob.address)).to.equal(0n);
      expect(await passport.getApproved(tokenId)).to.equal(ZERO_ADDRESS);
    });

    it("emits UsageAuthorized with the permission blob", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await expect(
        passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS)
      )
        .to.emit(passport, "UsageAuthorized")
        .withArgs(tokenId, bob.address, PERMS);
    });

    it("stores the permission blob verbatim", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS);
      expect(await passport.permissionsOf(tokenId, bob.address)).to.equal(PERMS);
    });

    it("accepts an empty permission blob", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await passport.connect(alice).authorizeUsage(tokenId, bob.address, "0x");
      expect(await passport.isAuthorized(tokenId, bob.address)).to.equal(true);
      expect(await passport.permissionsOf(tokenId, bob.address)).to.equal("0x");
    });

    it("tracks the authorized set", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      expect(await passport.authorizedCount(tokenId)).to.equal(0n);

      await passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS);
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);

      expect(await passport.authorizedCount(tokenId)).to.equal(2n);
      expect(await passport.authorizedExecutors(tokenId)).to.deep.equal([
        bob.address,
        carol.address,
      ]);
    });

    it("does NOT implicitly authorize the owner", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);
      expect(await passport.isAuthorized(tokenId, alice.address)).to.equal(false);
    });

    it("reports false for an unauthorized address", async function () {
      const { passport, bob, tokenId } = await loadFixture(mintedFixture);
      expect(await passport.isAuthorized(tokenId, bob.address)).to.equal(false);
    });

    it("reports false — without reverting — for a nonexistent token", async function () {
      const { passport, bob } = await loadFixture(mintedFixture);
      expect(await passport.isAuthorized(999n, bob.address)).to.equal(false);
    });

    it("reverts when a non-owner tries to authorize", async function () {
      const { passport, bob, carol, tokenId } = await loadFixture(mintedFixture);
      await expect(
        passport.connect(bob).authorizeUsage(tokenId, carol.address, PERMS)
      )
        .to.be.revertedWithCustomError(passport, "NotTokenOwner")
        .withArgs(tokenId, bob.address);
    });

    it("reverts even for an ERC-721 approved operator — owner only", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport.connect(alice).setApprovalForAll(bob.address, true);
      await passport.connect(alice).approve(bob.address, tokenId);

      await expect(
        passport.connect(bob).authorizeUsage(tokenId, carol.address, PERMS)
      )
        .to.be.revertedWithCustomError(passport, "NotTokenOwner")
        .withArgs(tokenId, bob.address);
    });

    it("reverts on a nonexistent token", async function () {
      const { passport, alice, bob } = await loadFixture(mintedFixture);
      await expect(
        passport.connect(alice).authorizeUsage(999n, bob.address, PERMS)
      )
        .to.be.revertedWithCustomError(passport, "NonexistentPassport")
        .withArgs(999n);
    });

    it("reverts when the executor is the zero address", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);
      await expect(
        passport.connect(alice).authorizeUsage(tokenId, ZERO_ADDRESS, PERMS)
      ).to.be.revertedWithCustomError(passport, "ZeroExecutor");
    });

    it("reverts when the executor is already authorized", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS);
      await expect(
        passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS)
      )
        .to.be.revertedWithCustomError(passport, "AlreadyAuthorized")
        .withArgs(tokenId, bob.address);
    });
  });

  describe("authorizeUsage — the 100-executor boundary", function () {
    it("accepts exactly 100 authorizations", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);

      for (let i = 1; i <= 100; i++) {
        await passport
          .connect(alice)
          .authorizeUsage(tokenId, executorAt(i), PERMS);
      }

      expect(await passport.authorizedCount(tokenId)).to.equal(100n);
      expect(await passport.isAuthorized(tokenId, executorAt(100))).to.equal(
        true
      );
      expect((await passport.authorizedExecutors(tokenId)).length).to.equal(100);
    });

    it("reverts on the 101st authorization", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);

      for (let i = 1; i <= 100; i++) {
        await passport
          .connect(alice)
          .authorizeUsage(tokenId, executorAt(i), PERMS);
      }

      await expect(
        passport.connect(alice).authorizeUsage(tokenId, executorAt(101), PERMS)
      )
        .to.be.revertedWithCustomError(passport, "MaxAuthorizationsReached")
        .withArgs(tokenId, 100n);

      // The failed attempt left nothing behind.
      expect(await passport.authorizedCount(tokenId)).to.equal(100n);
      expect(await passport.isAuthorized(tokenId, executorAt(101))).to.equal(
        false
      );
    });

    it("frees a slot on revoke, letting a new executor in at the cap", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);

      for (let i = 1; i <= 100; i++) {
        await passport
          .connect(alice)
          .authorizeUsage(tokenId, executorAt(i), PERMS);
      }

      await passport.connect(alice).revokeAuthorization(tokenId, executorAt(50));
      expect(await passport.authorizedCount(tokenId)).to.equal(99n);

      await expect(
        passport.connect(alice).authorizeUsage(tokenId, executorAt(101), PERMS)
      ).to.not.be.reverted;
      expect(await passport.authorizedCount(tokenId)).to.equal(100n);
    });
  });

  describe("revokeAuthorization", function () {
    it("removes the executor and emits UsageRevoked", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS);

      await expect(
        passport.connect(alice).revokeAuthorization(tokenId, bob.address)
      )
        .to.emit(passport, "UsageRevoked")
        .withArgs(tokenId, bob.address);

      expect(await passport.isAuthorized(tokenId, bob.address)).to.equal(false);
      expect(await passport.authorizedCount(tokenId)).to.equal(0n);
      expect(await passport.permissionsOf(tokenId, bob.address)).to.equal("0x");
    });

    it("leaves the other executors intact when revoking from the middle", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);
      for (let i = 1; i <= 5; i++) {
        await passport
          .connect(alice)
          .authorizeUsage(tokenId, executorAt(i), PERMS);
      }

      await passport.connect(alice).revokeAuthorization(tokenId, executorAt(3));

      expect(await passport.authorizedCount(tokenId)).to.equal(4n);
      expect(await passport.isAuthorized(tokenId, executorAt(3))).to.equal(false);
      for (const i of [1, 2, 4, 5]) {
        expect(await passport.isAuthorized(tokenId, executorAt(i))).to.equal(
          true
        );
      }
      const list = await passport.authorizedExecutors(tokenId);
      expect(list.length).to.equal(4);
      expect(list).to.not.include(executorAt(3));
    });

    it("allows re-authorizing a previously revoked executor with new permissions", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS);
      await passport.connect(alice).revokeAuthorization(tokenId, bob.address);
      await passport
        .connect(alice)
        .authorizeUsage(tokenId, bob.address, PERMS_ALT);

      expect(await passport.isAuthorized(tokenId, bob.address)).to.equal(true);
      expect(await passport.permissionsOf(tokenId, bob.address)).to.equal(
        PERMS_ALT
      );
    });

    it("reverts when the caller is not the owner", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);

      await expect(
        passport.connect(bob).revokeAuthorization(tokenId, carol.address)
      )
        .to.be.revertedWithCustomError(passport, "NotTokenOwner")
        .withArgs(tokenId, bob.address);
    });

    it("reverts when the executor was never authorized", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await expect(
        passport.connect(alice).revokeAuthorization(tokenId, bob.address)
      )
        .to.be.revertedWithCustomError(passport, "NotAuthorized")
        .withArgs(tokenId, bob.address);
    });

    it("reverts on a nonexistent token", async function () {
      const { passport, alice, bob } = await loadFixture(mintedFixture);
      await expect(
        passport.connect(alice).revokeAuthorization(999n, bob.address)
      )
        .to.be.revertedWithCustomError(passport, "NonexistentPassport")
        .withArgs(999n);
    });
  });

  describe("verifyManifest", function () {
    it("returns true for the anchored manifest hash", async function () {
      const { passport, data, tokenId } = await loadFixture(mintedFixture);
      expect(
        await passport.verifyManifest(tokenId, data.manifestRootHash)
      ).to.equal(true);
    });

    it("returns false for a manifest that has been tampered with", async function () {
      const { passport, tokenId } = await loadFixture(mintedFixture);
      expect(
        await passport.verifyManifest(tokenId, h("manifest-tampered"))
      ).to.equal(false);
    });

    it("returns false for the zero hash", async function () {
      const { passport, tokenId } = await loadFixture(mintedFixture);
      expect(await passport.verifyManifest(tokenId, ZERO_HASH)).to.equal(false);
    });

    it("is callable by a total stranger — verification needs no rights", async function () {
      const { passport, carol, data, tokenId } = await loadFixture(mintedFixture);
      expect(
        await passport.connect(carol).verifyManifest(tokenId, data.manifestRootHash)
      ).to.equal(true);
    });

    it("reverts on a nonexistent token rather than reporting a false negative", async function () {
      // Critical: a nonexistent token must not silently answer `false` for a real
      // manifest, nor `true` for the zero hash against zeroed storage.
      const { passport } = await loadFixture(mintedFixture);
      await expect(passport.verifyManifest(999n, ZERO_HASH))
        .to.be.revertedWithCustomError(passport, "NonexistentPassport")
        .withArgs(999n);
    });

    it("still verifies after the passport changes hands", async function () {
      const { passport, alice, bob, data, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport
        .connect(alice)
        .transferFrom(alice.address, bob.address, tokenId);
      expect(
        await passport.verifyManifest(tokenId, data.manifestRootHash)
      ).to.equal(true);
    });
  });

  describe("transfer clears every authorization", function () {
    it("clears a single authorization on transferFrom", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);
      expect(await passport.isAuthorized(tokenId, carol.address)).to.equal(true);

      await passport
        .connect(alice)
        .transferFrom(alice.address, bob.address, tokenId);

      expect(await passport.isAuthorized(tokenId, carol.address)).to.equal(false);
      expect(await passport.authorizedCount(tokenId)).to.equal(0n);
      expect(await passport.authorizedExecutors(tokenId)).to.deep.equal([]);
      expect(await passport.permissionsOf(tokenId, carol.address)).to.equal("0x");
    });

    it("clears on safeTransferFrom too", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);

      await passport
        .connect(alice)
        ["safeTransferFrom(address,address,uint256)"](
          alice.address,
          bob.address,
          tokenId
        );

      expect(await passport.isAuthorized(tokenId, carol.address)).to.equal(false);
    });

    it("clears a full set of 100 authorizations in one transfer", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      for (let i = 1; i <= 100; i++) {
        await passport
          .connect(alice)
          .authorizeUsage(tokenId, executorAt(i), PERMS);
      }
      expect(await passport.authorizedCount(tokenId)).to.equal(100n);

      await passport
        .connect(alice)
        .transferFrom(alice.address, bob.address, tokenId);

      expect(await passport.authorizedCount(tokenId)).to.equal(0n);
      for (const i of [1, 50, 100]) {
        expect(await passport.isAuthorized(tokenId, executorAt(i))).to.equal(
          false
        );
      }
    });

    it("emits AuthorizationsCleared with the number cleared", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);
      await passport.connect(alice).authorizeUsage(tokenId, bob.address, PERMS);

      await expect(
        passport.connect(alice).transferFrom(alice.address, bob.address, tokenId)
      )
        .to.emit(passport, "AuthorizationsCleared")
        .withArgs(tokenId, alice.address, bob.address, 2n);
    });

    it("does not emit AuthorizationsCleared when there was nothing to clear", async function () {
      const { passport, alice, bob, tokenId } = await loadFixture(mintedFixture);
      await expect(
        passport.connect(alice).transferFrom(alice.address, bob.address, tokenId)
      ).to.not.emit(passport, "AuthorizationsCleared");
    });

    it("lets the new owner authorize, and stops the old owner", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);
      await passport
        .connect(alice)
        .transferFrom(alice.address, bob.address, tokenId);

      await expect(
        passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS)
      )
        .to.be.revertedWithCustomError(passport, "NotTokenOwner")
        .withArgs(tokenId, alice.address);

      await expect(
        passport.connect(bob).authorizeUsage(tokenId, carol.address, PERMS_ALT)
      ).to.not.be.reverted;
      expect(await passport.isAuthorized(tokenId, carol.address)).to.equal(true);
      expect(await passport.permissionsOf(tokenId, carol.address)).to.equal(
        PERMS_ALT
      );
    });

    it("does not resurrect old authorizations when the token is transferred back", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);

      await passport
        .connect(alice)
        .transferFrom(alice.address, bob.address, tokenId);
      await passport
        .connect(bob)
        .transferFrom(bob.address, alice.address, tokenId);

      expect(await passport.ownerOf(tokenId)).to.equal(alice.address);
      expect(await passport.isAuthorized(tokenId, carol.address)).to.equal(false);
      expect(await passport.authorizedCount(tokenId)).to.equal(0n);
    });

    it("keeps authorizations when the owner transfers to themselves", async function () {
      const { passport, alice, carol, tokenId } = await loadFixture(mintedFixture);
      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);

      await passport
        .connect(alice)
        .transferFrom(alice.address, alice.address, tokenId);

      // Ownership did not actually change hands, so there is no new principal to
      // protect against.
      expect(await passport.isAuthorized(tokenId, carol.address)).to.equal(true);
    });

    it("clears 100 authorizations for the same gas as clearing 1", async function () {
      // Backs the O(1) claim in the contract: clearing bumps an epoch, it does not walk
      // the executor list. Each measurement uses its own fresh deployment so the only
      // difference between the two transfers is the size of the authorization set —
      // no shared balance slots, no warm-storage artefacts.
      //
      // If someone "simplifies" the epoch bump into a delete loop, clearing 100 costs
      // roughly 100 SSTOREs more than clearing 1 and this bound fails loudly.
      async function transferGasWithAuthorizations(count) {
        const { passport, alice, bob } = await deployFixture();
        await passport.mint(alice.address, passportData(), "uri");
        for (let i = 1; i <= count; i++) {
          await passport.connect(alice).authorizeUsage(1n, executorAt(i), PERMS);
        }
        const receipt = await (
          await passport
            .connect(alice)
            .transferFrom(alice.address, bob.address, 1n)
        ).wait();
        expect(await passport.authorizedCount(1n)).to.equal(0n);
        return receipt.gasUsed;
      }

      const one = await transferGasWithAuthorizations(1);
      const hundred = await transferGasWithAuthorizations(100);

      const delta = hundred > one ? hundred - one : one - hundred;
      expect(delta, `clearing 1 used ${one}, clearing 100 used ${hundred}`).to.be
        .lessThan(1000n);
    });

    it("clears the authorizations of the transferred token only", async function () {
      const { passport, alice, bob, carol } = await loadFixture(mintedFixture);
      await passport.mint(
        alice.address,
        passportData({ adapterRootHash: h("adapter-root-2") }),
        "uri-2"
      );
      await passport.connect(alice).authorizeUsage(1n, carol.address, PERMS);
      await passport.connect(alice).authorizeUsage(2n, carol.address, PERMS);

      await passport.connect(alice).transferFrom(alice.address, bob.address, 1n);

      expect(await passport.isAuthorized(1n, carol.address)).to.equal(false);
      expect(await passport.isAuthorized(2n, carol.address)).to.equal(true);
    });
  });

  describe("lineage is immutable after mint", function () {
    it("exposes no state-changing function beyond the known surface", async function () {
      const { passport } = await loadFixture(deployFixture);

      const mutating = passport.interface.fragments
        .filter((f) => f.type === "function")
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.format("sighash"))
        .sort();

      // If a lineage setter is ever added, this list changes and this test fails.
      expect(mutating).to.deep.equal(
        [
          "approve(address,uint256)",
          "authorizeUsage(uint256,address,bytes)",
          "mint(address,(bytes32,bytes32,bytes32,bytes32,bytes32,string,address,uint64),string)",
          "revokeAuthorization(uint256,address)",
          "safeTransferFrom(address,address,uint256)",
          "safeTransferFrom(address,address,uint256,bytes)",
          "setApprovalForAll(address,bool)",
          "transferFrom(address,address,uint256)",
        ].sort()
      );
    });

    it("exposes no function whose name suggests mutating lineage", async function () {
      const { passport } = await loadFixture(deployFixture);
      const names = passport.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f.name.toLowerCase());

      for (const forbidden of [
        "set",
        "update",
        "edit",
        "amend",
        "rewrite",
        "burn",
      ]) {
        const offenders = names.filter(
          (n) => n.startsWith(forbidden) && n !== "setapprovalforall"
        );
        expect(offenders, `found mutator-like function(s): ${offenders}`).to.deep.equal(
          []
        );
      }
    });

    it("leaves lineage byte-identical through authorize, revoke and transfer", async function () {
      const { passport, alice, bob, carol, tokenId } = await loadFixture(
        mintedFixture
      );
      const before = await passport.passportOf(tokenId);

      await passport.connect(alice).authorizeUsage(tokenId, carol.address, PERMS);
      await passport.connect(alice).revokeAuthorization(tokenId, carol.address);
      await passport
        .connect(alice)
        .transferFrom(alice.address, bob.address, tokenId);
      await passport.connect(bob).authorizeUsage(tokenId, carol.address, PERMS_ALT);

      const after = await passport.passportOf(tokenId);
      expect(after.baseModelHash).to.equal(before.baseModelHash);
      expect(after.datasetRootHash).to.equal(before.datasetRootHash);
      expect(after.configHash).to.equal(before.configHash);
      expect(after.adapterRootHash).to.equal(before.adapterRootHash);
      expect(after.manifestRootHash).to.equal(before.manifestRootHash);
      expect(after.taskId).to.equal(before.taskId);
      expect(after.provider).to.equal(before.provider);
      expect(after.mintedAt).to.equal(before.mintedAt);
    });

    it("rejects a raw call to a plausible-looking lineage setter", async function () {
      const { passport, alice, tokenId } = await loadFixture(mintedFixture);

      // There is no such function; the call must not silently succeed.
      const selector = ethers
        .id("setManifestRootHash(uint256,bytes32)")
        .slice(0, 10);
      const payload =
        selector +
        ethers.AbiCoder.defaultAbiCoder()
          .encode(["uint256", "bytes32"], [tokenId, h("evil-manifest")])
          .slice(2);

      await expect(
        alice.sendTransaction({ to: await passport.getAddress(), data: payload })
      ).to.be.reverted;
    });

    it("keeps the lineage index pointing at the original token after transfer", async function () {
      const { passport, alice, bob, data, tokenId } = await loadFixture(
        mintedFixture
      );
      await passport
        .connect(alice)
        .transferFrom(alice.address, bob.address, tokenId);

      expect(
        await passport.tokenIdForLineage(
          data.datasetRootHash,
          data.configHash,
          data.adapterRootHash
        )
      ).to.equal(tokenId);

      // And the triple still cannot be re-minted by the new owner.
      await expect(
        passport.connect(bob).mint(bob.address, passportData(), "uri-again")
      ).to.be.revertedWithCustomError(passport, "DuplicateLineage");
    });
  });
});
