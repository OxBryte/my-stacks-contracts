;; title: messaging
;; version: 1.0.0
;; summary: A decentralized messaging contract for Stacks
;; description: Allows users to send and receive messages on the Stacks blockchain

;; Constants
(define-constant MAX_MESSAGE_LENGTH 500)
(define-constant MAX_MESSAGES_PER_USER 1000)

;; Contract owner
(define-constant CONTRACT_OWNER tx-sender)

;; Error codes
(define-constant ERR_MESSAGE_TOO_LONG (err u1001))
(define-constant ERR_MESSAGE_NOT_FOUND (err u1002))
(define-constant ERR_NOT_MESSAGE_OWNER (err u1003))
(define-constant ERR_INVALID_RECIPIENT (err u1004))
(define-constant ERR_MESSAGE_LIMIT_REACHED (err u1005))
(define-constant ERR_NOT_CONTRACT_OWNER (err u1006))

;; Message structure stored in map
;; Each message has: sender, recipient, content, timestamp, read status
(define-map messages
  uint
  {
    sender: principal,
    recipient: principal,
    content: (string-utf8 500),
    timestamp: uint,
    read: bool,
  }
)

;; Counter for total messages
(define-data-var message-count uint u0)

;; Public function to send a message
(define-public (send-message (recipient principal) (content (string-utf8 500)))
  (let (
    (id (+ (var-get message-count) u1))
    (sender contract-caller)
  )
    (begin
      ;; Prevent sending to self
      (asserts! (not (is-eq sender recipient)) ERR_INVALID_RECIPIENT)
      
      ;; Store the message
      (map-set messages id {
        sender: sender,
        recipient: recipient,
        content: content,
        timestamp: burn-block-height,
        read: false,
      })
      
      ;; Update message count
      (var-set message-count id)
      
      ;; Emit event
      (print {
        event: "message-sent",
        message-id: id,
        sender: sender,
        recipient: recipient,
        timestamp: burn-block-height,
      })
      
      (ok id)
    )
  )
)

;; Public function to mark a message as read
(define-public (mark-as-read (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (begin
      ;; Only recipient can mark as read
      (asserts! (is-eq contract-caller (get recipient message-tuple)) ERR_NOT_MESSAGE_OWNER)
      
      ;; Update read status
      (map-set messages message-id {
        sender: (get sender message-tuple),
        recipient: (get recipient message-tuple),
        content: (get content message-tuple),
        timestamp: (get timestamp message-tuple),
        read: true,
      })
      
      ;; Emit event
      (print {
        event: "message-read",
        message-id: message-id,
        recipient: contract-caller,
      })
      
      (ok true)
    )
    ERR_MESSAGE_NOT_FOUND
  )
)

;; Public function to delete a message (by sender or recipient)
(define-public (delete-message (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (begin
      ;; Only sender or recipient can delete
      (asserts! 
        (or 
          (is-eq contract-caller (get sender message-tuple))
          (is-eq contract-caller (get recipient message-tuple))
        )
        ERR_NOT_MESSAGE_OWNER
      )
      
      ;; Delete from messages map
      (map-delete messages message-id)
      
      ;; Emit event
      (print {
        event: "message-deleted",
        message-id: message-id,
        deleted-by: contract-caller,
      })
      
      (ok true)
    )
    ERR_MESSAGE_NOT_FOUND
  )
)

;; Read-only function to get a message by ID
(define-read-only (get-message (message-id uint))
  (map-get? messages message-id)
)

;; Read-only function to get message count
(define-read-only (get-message-count)
  (var-get message-count)
)

;; Read-only function to check if a message exists for a recipient
(define-read-only (has-message (recipient principal) (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (ok (is-eq recipient (get recipient message-tuple)))
    (ok false)
  )
)

;; Read-only function to check if a message was sent by a sender
(define-read-only (sent-message (sender principal) (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (ok (is-eq sender (get sender message-tuple)))
    (ok false)
  )
)

;; Read-only function to get message sender
(define-read-only (get-message-sender (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (ok (get sender message-tuple))
    (err u1002)
  )
)

;; Read-only function to get message recipient
(define-read-only (get-message-recipient (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (ok (get recipient message-tuple))
    (err u1002)
  )
)

;; Read-only function to get message content
(define-read-only (get-message-content (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (ok (get content message-tuple))
    (err u1002)
  )
)

;; Read-only function to get message timestamp
(define-read-only (get-message-timestamp (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (ok (get timestamp message-tuple))
    (err u1002)
  )
)

;; Read-only function to check if message is read
(define-read-only (is-message-read (message-id uint))
  (match (map-get? messages message-id)
    message-tuple (ok (get read message-tuple))
    (ok false)
  )
)

;; Read-only function to check if user is message sender
(define-read-only (is-message-sender (message-id uint) (user principal))
  (match (map-get? messages message-id)
    message-tuple (ok (is-eq user (get sender message-tuple)))
    (ok false)
  )
)

;; Read-only function to check if user is message recipient
(define-read-only (is-message-recipient (message-id uint) (user principal))
  (match (map-get? messages message-id)
    message-tuple (ok (is-eq user (get recipient message-tuple)))
    (ok false)
  )
)

;; Admin function to get total message count (contract owner only)
(define-read-only (get-total-messages)
  (if (is-eq contract-caller CONTRACT_OWNER)
    (ok (var-get message-count))
    (err u1006)
  )
)
