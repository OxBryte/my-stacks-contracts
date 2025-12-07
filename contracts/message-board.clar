;; title: message-board
;; version:
;; summary:
;; description:

;; traits
;;

;; token definitions
;;

;; constants
;;

;; data vars
;;

;; data maps
;;

;; public functions
;;

;; read only functions
;;

;; private functions
;;

;; Defeine constants
(define-constant MAX_MESSAGE_LENGTH 100)
(define-constant MAX_MESSAGES 100)
(define-constant MESSAGE_BOARD_NAME "Message Board")
(define-constant MESSAGE_BOARD_DESCRIPTION "A message board for the community")
(define-constant MESSAGE_BOARD_ICON "https://example.com/icon.png")
(define-constant MESSAGE_BOARD_COLOR "https://example.com/color.png")
(define-constant MESSAGE_BOARD_BACKGROUND "https://example.com/background.png")
(define-constant MESSAGE_BOARD_TEXT "https://example.com/text.png")
(define-constant MESSAGE_BOARD_BUTTON "https://example.com/button.png")
(define-constant MESSAGE_BOARD_BUTTON_TEXT "https://example.com/button-text.png")

;;Define contract owner
(define-constant CONTRACT_OWNER tx-sender)

;; Define error codes
(define-constant ERR_NOT_ENOUGH_SBTC (err u1004))
(define-constant ERR_NOT_CONTRACT_OWNER (err u1005))
(define-constant ERR_BLOCK_NOT_FOUND (err u1003))
(define-constant ERR_MESSAGE_NOT_FOUND (err u1006))
(define-constant ERR_NOT_MESSAGE_AUTHOR (err u1007))
(define-constant ERR_MESSAGE_TOO_LONG (err u1008))

;; Define a map to store messages
;; Each message has an ID, content, author, and Bitcoin block height timestamp
(define-map messages
  uint
  {
    message: (string-utf8 280),
    author: principal,
    time: uint,
  }
)

;; Counter for total messages
(define-data-var message-count uint u0)

;; Public function to add a new message for 1 satoshi of sBTC
;; @format-ignore
(define-public (add-message (content (string-utf8 280)))
  (let ((id (+ (var-get message-count) u1)))
    (try! (restrict-assets? contract-caller 
      ((with-ft 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token "sbtc-token" u1))
      (unwrap!
        ;; Charge 1 satoshi of sBTC from the caller
        (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          transfer u1 contract-caller current-contract none
        )
        ERR_NOT_ENOUGH_SBTC
      )
    ))
    ;; Store the message with current Bitcoin block height
    (map-set messages id {
      message: content,
      author: contract-caller,
      time: burn-block-height,
    })
    ;; Update message count
    (var-set message-count id)
    ;; Emit event for the new message
    (print {
      event: "[Stacks Dev Quickstart] New Message",
      message: content,
      id: id,
      author: contract-caller,
      time: burn-block-height,
    })
    ;; Return the message ID
    (ok id)
  )
)

;; Get the message count
(define-read-only (get-message-count)
  (var-get message-count)
)

;; Withdraw function for contract owner to withdraw accumulated sBTC
(define-public (withdraw-funds)
  (begin
    (asserts! (is-eq tx-sender CONTRACT_OWNER) (err u1005))
    (let ((balance (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
        get-balance current-contract
      ))))
      (if (> balance u0)
        (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
          transfer balance current-contract CONTRACT_OWNER none
        )
        (ok false)
      )
    )
  )
)

;; Read-only function to get a message by ID
(define-read-only (get-message (id uint))
  (map-get? messages id)
)

;; Read-only function to get message author
(define-read-only (get-message-author (id uint))
  (match (map-get? messages id)
    message-tuple (ok (get author message-tuple))
    (err u1)
  )
)

;; Read-only function to get message count at a specific Stacks block height
(define-read-only (get-message-count-at-block (block uint))
  (ok (at-block
    (unwrap! (get-stacks-block-info? header-hash block) ERR_BLOCK_NOT_FOUND)
    (var-get message-count)
  ))
)

;; Public function to edit a message (only by author)
(define-public (edit-message (id uint) (new-content (string-utf8 280)))
  (match (map-get? messages id)
    message-tuple (begin
      (asserts! (is-eq contract-caller (get author message-tuple)) ERR_NOT_MESSAGE_AUTHOR)
      (map-set messages id {
        message: new-content,
        author: (get author message-tuple),
        time: (get time message-tuple),
      })
      (ok true)
    )
    ERR_MESSAGE_NOT_FOUND
  )
)

;; Public function to delete a message (by author or contract owner)
(define-public (delete-message (id uint))
  (match (map-get? messages id)
    message-tuple (begin
      (asserts! 
        (or 
          (is-eq contract-caller (get author message-tuple))
          (is-eq contract-caller CONTRACT_OWNER)
        )
        ERR_NOT_MESSAGE_AUTHOR
      )
      (map-delete messages id)
      (ok true)
    )
    ERR_MESSAGE_NOT_FOUND
  )
)

;; Read-only function to get message content
(define-read-only (get-message-content (id uint))
  (match (map-get? messages id)
    message-tuple (ok (get message message-tuple))
    (err u1006)
  )
)

;; Read-only function to get message timestamp
(define-read-only (get-message-time (id uint))
  (match (map-get? messages id)
    message-tuple (ok (get time message-tuple))
    (err u1006)
  )
)

;; Read-only function to check if a principal is the author of a message
(define-read-only (is-message-author (id uint) (check-author principal))
  (match (map-get? messages id)
    message-tuple (ok (is-eq check-author (get author message-tuple)))
    (ok false)
  )
)

;; Read-only function to get contract sBTC balance
(define-read-only (get-contract-balance)
  (unwrap-panic (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
    get-balance current-contract
  ))
)