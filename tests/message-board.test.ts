import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;

const CONTRACT_NAME = "message-board";

describe("Message Board Contract Tests", () => {
  describe("add-message", () => {
    it("allows user to add a new message with sBTC payment", () => {
      const content = "Hello Stacks Devs!";
      const currentBurnBlockHeight = simnet.burnBlockHeight;

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      // Check that the function succeeded
      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);

      // Check that it returned the message ID (should be 1 for first message)
      expect(result.result).toBeOk(Cl.uint(1));

      // Check that message count was updated
      const messageCount = simnet.getDataVar(CONTRACT_NAME, "message-count");
      expect(messageCount).toStrictEqual(Cl.uint(1));

      // Check that the message was stored correctly
      const messageResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(1)],
        address1
      );

      expect(messageResult.result).toHaveClarityType(ClarityType.OptionalSome);
      if (messageResult.result.type === ClarityType.OptionalSome) {
        expect(messageResult.result.value).toBeTuple({
          message: Cl.stringUtf8(content),
          author: Cl.standardPrincipal(address1),
          time: Cl.uint(currentBurnBlockHeight),
        });
      }
    });

    it("increments message count for multiple messages", () => {
      const content1 = "First message";
      const content2 = "Second message";

      // Add first message
      const result1 = simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content1)],
        address1
      );
      expect(result1.result).toBeOk(Cl.uint(1));

      // Add second message
      const result2 = simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content2)],
        address2
      );
      expect(result2.result).toBeOk(Cl.uint(2));

      // Check message count
      const messageCount = simnet.getDataVar(CONTRACT_NAME, "message-count");
      expect(messageCount).toStrictEqual(Cl.uint(2));
    });

    it("stores correct author for each message", () => {
      const content = "Test message";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      // Check author using get-message-author
      const authorResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-author",
        [Cl.uint(1)],
        address1
      );

      expect(authorResult.result).toBeOk(Cl.standardPrincipal(address1));
    });
  });

  describe("get-message-count", () => {
    it("returns zero when no messages exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-count",
        [],
        address1
      );

      expect(result.result).toStrictEqual(Cl.uint(0));
    });

    it("returns correct count after adding messages", () => {
      // Add two messages
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8("Message 1")],
        address1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8("Message 2")],
        address2
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-count",
        [],
        address1
      );

      expect(result.result).toStrictEqual(Cl.uint(2));
    });
  });

  describe("get-message", () => {
    it("returns message when it exists", () => {
      const content = "Retrievable message";
      const burnBlockHeight = simnet.burnBlockHeight;

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.OptionalSome);
      if (result.result.type === ClarityType.OptionalSome) {
        expect(result.result.value).toBeTuple({
          message: Cl.stringUtf8(content),
          author: Cl.standardPrincipal(address1),
          time: Cl.uint(burnBlockHeight),
        });
      }
    });

    it("returns none when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.OptionalNone);
    });
  });

  describe("get-message-author", () => {
    it("returns author when message exists", () => {
      const content = "Author test message";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address2
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-author",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.standardPrincipal(address2));
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-author",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1));
    });
  });

  describe("withdraw-funds", () => {
    it("allows contract owner to withdraw accumulated sBTC", () => {
      // Add a message to accumulate sBTC
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8("Payment test")],
        address1
      );

      simnet.mineEmptyBurnBlocks(2);

      // Owner withdraws funds
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "withdraw-funds",
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Check for ft_transfer_event
      const transferEvent = result.events.find(
        (e) => e.event === "ft_transfer_event"
      );
      expect(transferEvent).toBeDefined();
      expect(transferEvent?.data).toMatchObject({
        amount: "1",
        asset_identifier:
          "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token",
        recipient: deployer,
        sender: `${deployer}.${CONTRACT_NAME}`,
      });
    });

    it("prevents non-owner from withdrawing funds", () => {
      // Add a message to accumulate sBTC
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8("Unauthorized test")],
        address1
      );

      // Non-owner tries to withdraw
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "withdraw-funds",
        [],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1005)); // ERR_NOT_CONTRACT_OWNER
    });

    it("returns false when there are no funds to withdraw", () => {
      // Try to withdraw when no messages have been added
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "withdraw-funds",
        [],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe("get-message-count-at-block", () => {
    it("returns message count at a specific block height", () => {
      // Add a message
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8("Block test")],
        address1
      );

      // Mine some blocks to ensure we have a past block to query
      simnet.mineEmptyBurnBlocks(2);

      // Get the block height from a few blocks ago
      const pastBlock = simnet.blockHeight - 1;

      // Get message count at past block
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-count-at-block",
        [Cl.uint(pastBlock)],
        address1
      );

      expect(result.result).toBeOk(Cl.uint(1));
    });
  });
});
