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

  describe("edit-message", () => {
    it("allows message author to edit their message", () => {
      const originalContent = "Original message";
      const newContent = "Edited message";

      // Add a message
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(originalContent)],
        address1
      );

      // Edit the message
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "edit-message",
        [Cl.uint(1), Cl.stringUtf8(newContent)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify the message was updated
      const messageResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(1)],
        address1
      );

      expect(messageResult.result).toHaveClarityType(ClarityType.OptionalSome);
      if (messageResult.result.type === ClarityType.OptionalSome) {
        expect(messageResult.result.value).toBeTuple({
          message: Cl.stringUtf8(newContent),
          author: Cl.standardPrincipal(address1),
          time: expect.anything(),
        });
      }
    });

    it("prevents non-author from editing message", () => {
      const originalContent = "Original message";
      const newContent = "Hacked message";

      // Add a message as address1
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(originalContent)],
        address1
      );

      // Try to edit as address2
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "edit-message",
        [Cl.uint(1), Cl.stringUtf8(newContent)],
        address2
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1007)); // ERR_NOT_MESSAGE_AUTHOR

      // Verify message was not changed
      const messageResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-content",
        [Cl.uint(1)],
        address1
      );
      expect(messageResult.result).toBeOk(Cl.stringUtf8(originalContent));
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "edit-message",
        [Cl.uint(999), Cl.stringUtf8("New content")],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1006)); // ERR_MESSAGE_NOT_FOUND
    });
  });

  describe("delete-message", () => {
    it("allows message author to delete their message", () => {
      const content = "Message to delete";

      // Add a message
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      // Delete the message
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "delete-message",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify message was deleted
      const messageResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(1)],
        address1
      );

      expect(messageResult.result).toHaveClarityType(ClarityType.OptionalNone);
    });

    it("allows contract owner to delete any message", () => {
      const content = "Message to delete by owner";

      // Add a message as address1
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      // Delete as contract owner (deployer)
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "delete-message",
        [Cl.uint(1)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify message was deleted
      const messageResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(1)],
        address1
      );

      expect(messageResult.result).toHaveClarityType(ClarityType.OptionalNone);
    });

    it("prevents non-author and non-owner from deleting message", () => {
      const content = "Protected message";

      // Add a message as address1
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      // Try to delete as address2
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "delete-message",
        [Cl.uint(1)],
        address2
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1007)); // ERR_NOT_MESSAGE_AUTHOR

      // Verify message still exists
      const messageResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(1)],
        address1
      );
      expect(messageResult.result).toHaveClarityType(ClarityType.OptionalSome);
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "delete-message",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1006)); // ERR_MESSAGE_NOT_FOUND
    });
  });

  describe("get-message-content", () => {
    it("returns message content when message exists", () => {
      const content = "Test message content";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-content",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.stringUtf8(content));
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-content",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1006)); // ERR_MESSAGE_NOT_FOUND
    });
  });

  describe("get-message-time", () => {
    it("returns message timestamp when message exists", () => {
      const content = "Time test message";
      const burnBlockHeight = simnet.burnBlockHeight;

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-time",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.uint(burnBlockHeight));
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-time",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1006)); // ERR_MESSAGE_NOT_FOUND
    });
  });

  describe("is-message-author", () => {
    it("returns true when principal is the author", () => {
      const content = "Author check message";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-author",
        [Cl.uint(1), Cl.standardPrincipal(address1)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("returns false when principal is not the author", () => {
      const content = "Author check message";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8(content)],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-author",
        [Cl.uint(1), Cl.standardPrincipal(address2)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it("returns false when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-author",
        [Cl.uint(999), Cl.standardPrincipal(address1)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe("get-contract-balance", () => {
    it("returns zero when no messages have been added", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-balance",
        [],
        address1
      );

      expect(result.result).toStrictEqual(Cl.uint(0));
    });

    it("returns correct balance after messages are added", () => {
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
        "get-contract-balance",
        [],
        address1
      );

      // Should have 2 satoshis (1 per message)
      expect(result.result).toStrictEqual(Cl.uint(2));
    });

    it("returns updated balance after withdrawal", () => {
      // Add a message
      simnet.callPublicFn(
        CONTRACT_NAME,
        "add-message",
        [Cl.stringUtf8("Balance test")],
        address1
      );

      // Check balance before withdrawal
      const balanceBefore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-balance",
        [],
        address1
      );
      expect(balanceBefore.result).toStrictEqual(Cl.uint(1));

      // Withdraw funds
      simnet.mineEmptyBurnBlocks(2);
      simnet.callPublicFn(CONTRACT_NAME, "withdraw-funds", [], deployer);

      // Check balance after withdrawal
      const balanceAfter = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-balance",
        [],
        address1
      );
      expect(balanceAfter.result).toStrictEqual(Cl.uint(0));
    });
  });
});
