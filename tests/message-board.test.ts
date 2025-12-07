import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;

const CONTRACT_NAME = "message-board";

describe("Messaging Contract Tests", () => {
  describe("send-message", () => {
    it("allows user to send a message to another user", () => {
      const content = "Hello, this is a test message!";
      const burnBlockHeight = simnet.burnBlockHeight;

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseOk);
      expect(result.result).toBeOk(Cl.uint(1));

      // Verify message was stored
      const messageResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message",
        [Cl.uint(1)],
        address1
      );

      expect(messageResult.result).toHaveClarityType(ClarityType.OptionalSome);
      if (messageResult.result.type === ClarityType.OptionalSome) {
        expect(messageResult.result.value).toBeTuple({
          sender: Cl.standardPrincipal(address1),
          recipient: Cl.standardPrincipal(address2),
          content: Cl.stringUtf8(content),
          timestamp: Cl.uint(burnBlockHeight),
          read: Cl.bool(false),
        });
      }
    });

    it("increments message count for multiple messages", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Message 1")],
        address1
      );

      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address3), Cl.stringUtf8("Message 2")],
        address1
      );

      expect(result.result).toBeOk(Cl.uint(2));

      const messageCount = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-count",
        [],
        address1
      );
      expect(messageCount.result).toStrictEqual(Cl.uint(2));
    });

    it("prevents sending message to self", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address1), Cl.stringUtf8("Self message")],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1004)); // ERR_INVALID_RECIPIENT
    });

    it("tracks messages for recipient", () => {
      const content = "Recipient tracking test";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      const hasMessage = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "has-message",
        [Cl.standardPrincipal(address2), Cl.uint(1)],
        address1
      );

      expect(hasMessage.result).toStrictEqual(Cl.bool(true));
    });

    it("tracks messages for sender", () => {
      const content = "Sender tracking test";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      const sentMessage = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "sent-message",
        [Cl.standardPrincipal(address1), Cl.uint(1)],
        address1
      );

      expect(sentMessage.result).toStrictEqual(Cl.bool(true));
    });
  });

  describe("mark-as-read", () => {
    it("allows recipient to mark message as read", () => {
      const content = "Unread message";

      // Send a message
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      // Mark as read by recipient
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "mark-as-read",
        [Cl.uint(1)],
        address2
      );

      expect(result.result).toBeOk(Cl.bool(true));

      // Verify message is marked as read
      const isRead = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-read",
        [Cl.uint(1)],
        address1
      );
      expect(isRead.result).toBeOk(Cl.bool(true));
    });

    it("prevents sender from marking their own sent message as read", () => {
      const content = "Message from address1";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      // Try to mark as read by sender (should fail)
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "mark-as-read",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1003)); // ERR_NOT_MESSAGE_OWNER
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "mark-as-read",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1002)); // ERR_MESSAGE_NOT_FOUND
    });
  });

  describe("delete-message", () => {
    it("allows sender to delete their message", () => {
      const content = "Message to delete by sender";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      // Delete by sender
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

    it("allows recipient to delete message", () => {
      const content = "Message to delete by recipient";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      // Delete by recipient
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "delete-message",
        [Cl.uint(1)],
        address2
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

    it("prevents unauthorized user from deleting message", () => {
      const content = "Protected message";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
        address1
      );

      // Try to delete by unauthorized user
      const result = simnet.callPublicFn(
        CONTRACT_NAME,
        "delete-message",
        [Cl.uint(1)],
        address3
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1003)); // ERR_NOT_MESSAGE_OWNER

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
      expect(result.result).toBeErr(Cl.uint(1002)); // ERR_MESSAGE_NOT_FOUND
    });
  });

  describe("get-message", () => {
    it("returns message when it exists", () => {
      const content = "Retrievable message";
      const burnBlockHeight = simnet.burnBlockHeight;

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
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
          sender: Cl.standardPrincipal(address1),
          recipient: Cl.standardPrincipal(address2),
          content: Cl.stringUtf8(content),
          timestamp: Cl.uint(burnBlockHeight),
          read: Cl.bool(false),
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

  describe("get-message-sender", () => {
    it("returns sender when message exists", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Test")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-sender",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.standardPrincipal(address1));
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-sender",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1002));
    });
  });

  describe("get-message-recipient", () => {
    it("returns recipient when message exists", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Test")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-recipient",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.standardPrincipal(address2));
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-recipient",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1002));
    });
  });

  describe("get-message-content", () => {
    it("returns content when message exists", () => {
      const content = "Content test message";

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8(content)],
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
      expect(result.result).toBeErr(Cl.uint(1002));
    });
  });

  describe("get-message-timestamp", () => {
    it("returns timestamp when message exists", () => {
      const burnBlockHeight = simnet.burnBlockHeight;

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Timestamp test")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-timestamp",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.uint(burnBlockHeight));
    });

    it("returns error when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-message-timestamp",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1002));
    });
  });

  describe("is-message-read", () => {
    it("returns false for unread message", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Unread")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-read",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });

    it("returns true for read message", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Read")],
        address1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "mark-as-read",
        [Cl.uint(1)],
        address2
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-read",
        [Cl.uint(1)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("returns false when message does not exist", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-read",
        [Cl.uint(999)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe("is-message-sender", () => {
    it("returns true when user is sender", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Test")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-sender",
        [Cl.uint(1), Cl.standardPrincipal(address1)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("returns false when user is not sender", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Test")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-sender",
        [Cl.uint(1), Cl.standardPrincipal(address2)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe("is-message-recipient", () => {
    it("returns true when user is recipient", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Test")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-recipient",
        [Cl.uint(1), Cl.standardPrincipal(address2)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("returns false when user is not recipient", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Test")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-message-recipient",
        [Cl.uint(1), Cl.standardPrincipal(address1)],
        address1
      );

      expect(result.result).toBeOk(Cl.bool(false));
    });
  });

  describe("get-total-messages", () => {
    it("allows contract owner to get total message count", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address2), Cl.stringUtf8("Test 1")],
        address1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "send-message",
        [Cl.standardPrincipal(address3), Cl.stringUtf8("Test 2")],
        address1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-messages",
        [],
        deployer
      );

      expect(result.result).toStrictEqual(Cl.uint(2));
    });

    it("prevents non-owner from getting total messages", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-messages",
        [],
        address1
      );

      expect(result.result).toHaveClarityType(ClarityType.ResponseErr);
      expect(result.result).toBeErr(Cl.uint(1006)); // ERR_NOT_CONTRACT_OWNER
    });
  });
});
